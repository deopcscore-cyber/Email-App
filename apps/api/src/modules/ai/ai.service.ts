import {
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { AiFeature, Prisma } from "@prisma/client";
import {
  actionItemsSchema,
  briefingSchema,
  replySuggestionsSchema,
  smartLabelsSchema,
  type ActionItemsDto,
  type Address,
  type BriefingDto,
  type ReminderDto,
  type ReplySuggestionsDto,
  type RewriteRequestDto,
  type SmartLabelsDto,
} from "@novamail/shared";
import type { ZodSchema } from "zod";
import { PrismaService } from "../../prisma/prisma.service";
import { OpenAiClient, type ChatMessage } from "./openai.client";
import { PROMPT_VERSIONS, SYSTEM } from "./prompts";

/** Character budget for thread context (~6k tokens). */
const MAX_CONTEXT_CHARS = 24_000;
const MAX_MESSAGE_CHARS = 4_000;

export type StreamSink = (delta: string) => void;

interface ThreadContext {
  threadId: string;
  subject: string;
  lastMessageAt: Date;
  text: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAiClient,
  ) {}

  // ── Context building ────────────────────────────────────────

  private async threadContext(
    userId: string,
    threadId: string,
  ): Promise<ThreadContext> {
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, account: { userId } },
      include: {
        messages: {
          where: { sendStatus: { notIn: ["DRAFT", "QUEUED"] } },
          orderBy: { receivedAt: "asc" },
          include: { attachments: { select: { filename: true } } },
        },
      },
    });
    if (thread === null) throw new NotFoundException("Thread not found");

    const parts: string[] = [];
    // Newest messages matter most: include from the end until budget spent.
    for (const m of [...thread.messages].reverse()) {
      const from = m.fromAddress as Address;
      const body = (m.bodyText ?? this.stripHtml(m.bodyHtml ?? "")).slice(
        0,
        MAX_MESSAGE_CHARS,
      );
      const attachments =
        m.attachments.length > 0
          ? `\nAttachments: ${m.attachments.map((a) => a.filename).join(", ")}`
          : "";
      const entry = `From: ${from.name ?? ""} <${from.email}>\nDate: ${m.receivedAt.toISOString()}${attachments}\n${body}`;
      if (
        parts.join("").length + entry.length > MAX_CONTEXT_CHARS &&
        parts.length > 0
      ) {
        break;
      }
      parts.unshift(entry);
    }

    return {
      threadId: thread.id,
      subject: thread.subject,
      lastMessageAt: thread.lastMessageAt,
      text: `Subject: ${thread.subject}\n\n<email>\n${parts.join("\n\n---\n\n")}\n</email>`,
    };
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ── Artifact cache ──────────────────────────────────────────

  /** Valid cached artifact for a thread feature, or null. */
  private async cached(
    userId: string,
    feature: AiFeature,
    promptVersion: number,
    target: { threadId?: string; messageId?: string },
    param: string,
    freshAfter: Date | null,
  ) {
    const artifact = await this.prisma.aiArtifact.findFirst({
      where: {
        userId,
        feature,
        promptVersion,
        param,
        threadId: target.threadId ?? null,
        messageId: target.messageId ?? null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (artifact === null) return null;
    // Thread grew since this was computed → stale.
    if (freshAfter !== null && artifact.createdAt < freshAfter) return null;
    return artifact;
  }

  private async persist(
    userId: string,
    feature: AiFeature,
    promptVersion: number,
    target: { threadId?: string; messageId?: string },
    param: string,
    content: Prisma.InputJsonValue,
    tokensUsed: number,
  ): Promise<void> {
    await this.prisma.aiArtifact.deleteMany({
      where: {
        userId,
        feature,
        promptVersion,
        param,
        threadId: target.threadId ?? null,
        messageId: target.messageId ?? null,
      },
    });
    await this.prisma.aiArtifact.create({
      data: {
        userId,
        feature,
        promptVersion,
        param,
        threadId: target.threadId ?? null,
        messageId: target.messageId ?? null,
        content,
        model: "openai",
        tokensUsed,
      },
    });
  }

  // ── Streaming features (summary / ask / explain / translate) ─

  /**
   * Runs a streaming thread feature with artifact caching: cache hits emit
   * the stored text as a single delta; misses stream from OpenAI and persist.
   */
  async streamThreadFeature(
    userId: string,
    threadId: string,
    feature: Extract<AiFeature, "THREAD_SUMMARY" | "TRANSLATION">,
    system: string,
    param: string,
    sink: StreamSink,
    extraUser?: string,
  ): Promise<string> {
    const promptVersion =
      feature === "THREAD_SUMMARY"
        ? PROMPT_VERSIONS.THREAD_SUMMARY
        : PROMPT_VERSIONS.TRANSLATION;
    const ctx = await this.threadContext(userId, threadId);

    const hit = await this.cached(
      userId,
      feature,
      promptVersion,
      { threadId },
      param,
      ctx.lastMessageAt,
    );
    if (hit !== null) {
      const text = (hit.content as { text: string }).text;
      sink(text);
      return text;
    }

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      {
        role: "user",
        content: extraUser === undefined ? ctx.text : `${ctx.text}\n\n${extraUser}`,
      },
    ];
    const { text, usage } = await this.openai.stream(messages, sink);
    await this.persist(
      userId,
      feature,
      promptVersion,
      { threadId },
      param,
      { text },
      usage.promptTokens + usage.completionTokens,
    );
    return text;
  }

  /** Ask/explain are conversational — streamed, not cached. */
  async streamConversational(
    userId: string,
    threadId: string,
    system: string,
    userContent: string | null,
    sink: StreamSink,
  ): Promise<void> {
    const ctx = await this.threadContext(userId, threadId);
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      {
        role: "user",
        content:
          userContent === null ? ctx.text : `${ctx.text}\n\nQuestion: ${userContent}`,
      },
    ];
    await this.openai.stream(messages, sink);
  }

  /** Rewrites a draft body; streams the rewritten HTML. */
  async streamRewrite(
    userId: string,
    draftId: string,
    request: RewriteRequestDto,
    sink: StreamSink,
  ): Promise<void> {
    const draft = await this.prisma.message.findFirst({
      where: {
        id: draftId,
        account: { userId },
        sendStatus: { in: ["DRAFT", "QUEUED"] },
      },
      select: { bodyHtml: true, subject: true },
    });
    if (draft === null) throw new NotFoundException("Draft not found");

    const directives: string[] = [];
    if (request.tone !== undefined) directives.push(`Tone: ${request.tone}.`);
    if (request.instruction !== undefined) {
      directives.push(`Instruction: ${request.instruction}`);
    }
    await this.openai.stream(
      [
        { role: "system", content: SYSTEM.rewrite },
        {
          role: "user",
          content: `${directives.join(" ")}\n\nDraft (subject: ${draft.subject}):\n${draft.bodyHtml ?? ""}`,
        },
      ],
      sink,
      { temperature: 0.5 },
    );
  }

  // ── Structured features ─────────────────────────────────────

  private async structuredThreadFeature<T>(
    userId: string,
    threadId: string,
    feature: AiFeature,
    promptVersion: number,
    system: string,
    schema: ZodSchema<T>,
    cacheable: boolean,
  ): Promise<T> {
    const ctx = await this.threadContext(userId, threadId);
    if (cacheable) {
      const hit = await this.cached(
        userId,
        feature,
        promptVersion,
        { threadId },
        "",
        ctx.lastMessageAt,
      );
      if (hit !== null) {
        const parsed = schema.safeParse(hit.content);
        if (parsed.success) return parsed.data;
      }
    }

    const { json, usage } = await this.openai.completeJson([
      { role: "system", content: system },
      { role: "user", content: ctx.text },
    ]);
    const parsed = schema.parse(json);
    if (cacheable) {
      await this.persist(
        userId,
        feature,
        promptVersion,
        { threadId },
        "",
        parsed as Prisma.InputJsonValue,
        usage.promptTokens + usage.completionTokens,
      );
    }
    return parsed;
  }

  actionItems(userId: string, threadId: string): Promise<ActionItemsDto> {
    return this.structuredThreadFeature(
      userId,
      threadId,
      "ACTION_ITEMS",
      PROMPT_VERSIONS.ACTION_ITEMS,
      SYSTEM.actionItems,
      actionItemsSchema,
      true,
    );
  }

  async replySuggestions(
    userId: string,
    threadId: string,
  ): Promise<ReplySuggestionsDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const ctx = await this.threadContext(userId, threadId);
    const { json } = await this.openai.completeJson([
      { role: "system", content: SYSTEM.replySuggestions },
      {
        role: "user",
        content: `The user is ${user.name} <${user.email}>.\n\n${ctx.text}`,
      },
    ]);
    return replySuggestionsSchema.parse(json);
  }

  /** Classifies the thread into the user's existing labels and attaches them. */
  async smartLabels(userId: string, threadId: string): Promise<SmartLabelsDto> {
    const labels = await this.prisma.label.findMany({
      where: { userId },
      select: { id: true, name: true },
    });
    if (labels.length === 0) return { labels: [] };

    const ctx = await this.threadContext(userId, threadId);
    const { json } = await this.openai.completeJson([
      { role: "system", content: SYSTEM.smartLabels },
      {
        role: "user",
        content: `Available labels: ${labels.map((l) => l.name).join(", ")}\n\n${ctx.text}`,
      },
    ]);
    const parsed = smartLabelsSchema.parse(json);
    const valid = parsed.labels.filter((name) =>
      labels.some((l) => l.name === name),
    );

    for (const name of valid) {
      const label = labels.find((l) => l.name === name) as { id: string };
      await this.prisma.threadLabel.upsert({
        where: { threadId_labelId: { threadId, labelId: label.id } },
        create: { threadId, labelId: label.id, isAiSuggested: true },
        update: {},
      });
    }
    return { labels: valid };
  }

  // ── Daily briefing + follow-ups ─────────────────────────────

  async briefing(userId: string): Promise<BriefingDto> {
    const today = new Date().toISOString().slice(0, 10);
    const hit = await this.prisma.aiArtifact.findFirst({
      where: {
        userId,
        feature: "DAILY_BRIEFING",
        promptVersion: PROMPT_VERSIONS.DAILY_BRIEFING,
        param: today,
      },
    });
    if (hit !== null) {
      const parsed = briefingSchema.safeParse(hit.content);
      if (parsed.success) return parsed.data;
    }

    // Digest: unread + recent inbox threads.
    const threads = await this.prisma.thread.findMany({
      where: {
        account: { userId },
        folder: "INBOX",
        snoozedUntil: null,
      },
      orderBy: [{ unreadCount: "desc" }, { lastMessageAt: "desc" }],
      take: 15,
      select: {
        id: true,
        subject: true,
        snippet: true,
        unreadCount: true,
        isPriority: true,
        participants: true,
        lastMessageAt: true,
      },
    });
    const digest = threads
      .map((t) => {
        const from = (t.participants as Address[])[0];
        return `threadId=${t.id} | from=${from?.name ?? from?.email ?? "?"} | subject=${t.subject} | unread=${t.unreadCount > 0} | snippet=${t.snippet}`;
      })
      .join("\n");

    const { json, usage } = await this.openai.completeJson([
      { role: "system", content: SYSTEM.dailyBriefing },
      { role: "user", content: `<email>\n${digest}\n</email>` },
    ]);
    const core = briefingSchema
      .omit({ awaitingReply: true, date: true })
      .parse(json);

    const awaitingReply = await this.detectFollowUps(userId);
    const briefing: BriefingDto = { date: today, ...core, awaitingReply };
    await this.persist(
      userId,
      "DAILY_BRIEFING",
      PROMPT_VERSIONS.DAILY_BRIEFING,
      {},
      today,
      briefing,
      usage.promptTokens + usage.completionTokens,
    );
    return briefing;
  }

  /** Sent threads with no reply for 2+ days → follow-up reminders. */
  private async detectFollowUps(
    userId: string,
  ): Promise<BriefingDto["awaitingReply"]> {
    const cutoff = new Date(Date.now() - 2 * 24 * 3600_000);
    const candidates = await this.prisma.thread.findMany({
      where: {
        account: { userId },
        folder: "SENT",
        lastMessageAt: { lt: cutoff },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 5,
      include: {
        messages: {
          orderBy: { receivedAt: "desc" },
          take: 1,
          select: { fromAddress: true },
        },
        account: { select: { email: true } },
      },
    });

    const awaiting = candidates.filter((t) => {
      const lastFrom = t.messages[0]?.fromAddress as Address | undefined;
      return lastFrom?.email === t.account.email; // we spoke last
    });

    for (const t of awaiting) {
      const existing = await this.prisma.followUpReminder.findFirst({
        where: { userId, threadId: t.id, dismissed: false },
      });
      if (existing === null) {
        await this.prisma.followUpReminder.create({
          data: {
            userId,
            threadId: t.id,
            reason: `No reply since ${t.lastMessageAt.toLocaleDateString()}`,
            remindAt: new Date(),
          },
        });
      }
    }
    return awaiting.map((t) => ({
      threadId: t.id,
      subject: t.subject,
      since: t.lastMessageAt.toISOString(),
    }));
  }

  async reminders(userId: string): Promise<ReminderDto[]> {
    const rows = await this.prisma.followUpReminder.findMany({
      where: { userId, dismissed: false, remindAt: { lte: new Date() } },
      orderBy: { remindAt: "desc" },
      take: 10,
      include: { thread: { select: { subject: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      threadId: r.threadId,
      subject: r.thread.subject,
      reason: r.reason,
      remindAt: r.remindAt.toISOString(),
    }));
  }

  async dismissReminder(userId: string, id: string): Promise<void> {
    await this.prisma.followUpReminder.updateMany({
      where: { id, userId },
      data: { dismissed: true },
    });
  }
}
