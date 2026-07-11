import { Injectable, Logger } from "@nestjs/common";
import type { Address } from "@novamail/shared";
import { mapWithConcurrency } from "./concurrency";
import { buildMime } from "./mime";
import type {
  DeltaResult,
  MailProvider,
  OutgoingMessage,
  ProviderMessage,
  ProviderPage,
  TriageWriteback,
} from "./provider.interface";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const PAGE_SIZE = 100;
// Gmail 429s with "Too many concurrent requests for user" well below a full
// page of in-flight requests; keep per-user concurrency conservative.
const FETCH_CONCURRENCY = 8;

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  partId: string;
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size: number; data?: string };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

interface GmailHistoryRecord {
  messagesAdded?: { message: { id: string } }[];
  messagesDeleted?: { message: { id: string } }[];
  labelsAdded?: { message: { id: string } }[];
  labelsRemoved?: { message: { id: string } }[];
}

class GmailApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`Gmail API ${status}: ${body.slice(0, 200)}`);
  }
}

function parseAddressList(value: string | undefined): Address[] {
  if (value === undefined || value.trim() === "") return [];
  // Split on commas outside quotes/brackets — good enough for real headers.
  return value
    .split(/,(?![^"]*"(?:[^"]*"[^"]*")*[^"]*$)(?![^<]*>)/)
    .map((part) => {
      const match = /^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/.exec(part);
      if (match !== null) {
        const name = match[1]?.trim();
        return {
          name: name !== undefined && name !== "" ? name : null,
          email: (match[2] as string).trim().toLowerCase(),
        };
      }
      return { name: null, email: part.trim().toLowerCase() };
    })
    .filter((a) => a.email.includes("@"));
}

function header(msg: GmailMessage, name: string): string | undefined {
  return msg.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function decodeBody(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function walkParts(part: GmailPart | undefined, out: GmailPart[]): void {
  if (part === undefined) return;
  out.push(part);
  for (const child of part.parts ?? []) walkParts(child, out);
}

function folderFromLabels(labelIds: string[]): ProviderMessage["folder"] {
  if (labelIds.includes("TRASH")) return "TRASH";
  if (labelIds.includes("SPAM")) return "SPAM";
  if (labelIds.includes("DRAFT")) return "DRAFTS";
  if (labelIds.includes("SENT") && !labelIds.includes("INBOX")) return "SENT";
  if (labelIds.includes("INBOX")) return "INBOX";
  return "ARCHIVE";
}

@Injectable()
export class GmailProvider implements MailProvider {
  private readonly logger = new Logger(GmailProvider.name);

  private async call<T>(
    accessToken: string,
    path: string,
    init: RequestInit = {},
    attempt = 0,
  ): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body !== undefined && { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
    if (!res.ok) {
      // 429s (rate limit / too many concurrent requests) are worth a couple
      // of quick in-process retries rather than failing the whole sync job.
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        return this.call<T>(accessToken, path, init, attempt + 1);
      }
      throw new GmailApiError(res.status, await res.text());
    }
    return (await res.json()) as T;
  }

  async listMessages(
    accessToken: string,
    pageToken?: string,
  ): Promise<ProviderPage> {
    const qs = new URLSearchParams({
      maxResults: String(PAGE_SIZE),
      // Everything except chat; drafts arrive via the DRAFT label.
      q: "-in:chats",
    });
    if (pageToken !== undefined) qs.set("pageToken", pageToken);
    const list = await this.call<{
      messages?: { id: string }[];
      nextPageToken?: string;
    }>(accessToken, `/messages?${qs.toString()}`);

    const messages = await mapWithConcurrency(
      list.messages ?? [],
      FETCH_CONCURRENCY,
      (m) => this.getMessage(accessToken, m.id),
    );
    return {
      messages: messages.filter((m): m is ProviderMessage => m !== null),
      nextPageToken: list.nextPageToken ?? null,
    };
  }

  private async getMessage(
    accessToken: string,
    id: string,
  ): Promise<ProviderMessage | null> {
    let msg: GmailMessage;
    try {
      msg = await this.call<GmailMessage>(
        accessToken,
        `/messages/${id}?format=full`,
      );
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) return null;
      throw err;
    }

    const labelIds = msg.labelIds ?? [];
    const parts: GmailPart[] = [];
    walkParts(msg.payload, parts);

    let bodyHtml: string | null = null;
    let bodyText: string | null = null;
    const attachments: ProviderMessage["attachments"] = [];
    for (const part of parts) {
      const data = part.body?.data;
      if (part.mimeType === "text/html" && data !== undefined && bodyHtml === null) {
        bodyHtml = decodeBody(data);
      } else if (
        part.mimeType === "text/plain" &&
        data !== undefined &&
        bodyText === null
      ) {
        bodyText = decodeBody(data);
      } else if (
        part.body?.attachmentId !== undefined &&
        (part.filename ?? "") !== ""
      ) {
        const contentId = part.headers
          ?.find((h) => h.name.toLowerCase() === "content-id")
          ?.value.replace(/[<>]/g, "");
        attachments.push({
          providerAttachmentId: part.body.attachmentId,
          filename: part.filename as string,
          mimeType: part.mimeType,
          sizeBytes: part.body.size,
          isInline: contentId !== undefined,
          contentId: contentId ?? null,
        });
      }
    }

    const fromList = parseAddressList(header(msg, "From"));
    return {
      providerMessageId: msg.id,
      providerThreadId: msg.threadId,
      from: fromList[0] ?? { name: null, email: "unknown@unknown" },
      to: parseAddressList(header(msg, "To")),
      cc: parseAddressList(header(msg, "Cc")),
      subject: header(msg, "Subject") ?? "",
      snippet: msg.snippet ?? "",
      bodyHtml,
      bodyText,
      isRead: !labelIds.includes("UNREAD"),
      isStarred: labelIds.includes("STARRED"),
      folder: folderFromLabels(labelIds),
      receivedAt: new Date(Number(msg.internalDate ?? Date.now())),
      attachments,
    };
  }

  async currentCursor(accessToken: string): Promise<string> {
    const profile = await this.call<{ historyId: string }>(
      accessToken,
      "/profile",
    );
    return profile.historyId;
  }

  async fetchDelta(accessToken: string, cursor: string): Promise<DeltaResult> {
    const changedIds = new Set<string>();
    const deletedIds = new Set<string>();
    let pageToken: string | undefined;
    let newCursor = cursor;

    try {
      do {
        const qs = new URLSearchParams({ startHistoryId: cursor });
        if (pageToken !== undefined) qs.set("pageToken", pageToken);
        const res = await this.call<{
          history?: GmailHistoryRecord[];
          historyId: string;
          nextPageToken?: string;
        }>(accessToken, `/history?${qs.toString()}`);

        newCursor = res.historyId;
        pageToken = res.nextPageToken;
        for (const record of res.history ?? []) {
          for (const m of record.messagesAdded ?? []) changedIds.add(m.message.id);
          for (const m of record.labelsAdded ?? []) changedIds.add(m.message.id);
          for (const m of record.labelsRemoved ?? []) changedIds.add(m.message.id);
          for (const m of record.messagesDeleted ?? []) {
            changedIds.delete(m.message.id);
            deletedIds.add(m.message.id);
          }
        }
      } while (pageToken !== undefined);
    } catch (err) {
      // Gmail returns 404 when the historyId is too old — full resync needed.
      if (err instanceof GmailApiError && err.status === 404) {
        return { changed: [], deletedIds: [], newCursor: cursor, cursorExpired: true };
      }
      throw err;
    }

    const changed = await mapWithConcurrency(
      [...changedIds],
      FETCH_CONCURRENCY,
      (id) => this.getMessage(accessToken, id),
    );
    return {
      changed: changed.filter((m): m is ProviderMessage => m !== null),
      deletedIds: [...deletedIds],
      newCursor,
      cursorExpired: false,
    };
  }

  async send(
    accessToken: string,
    message: OutgoingMessage,
  ): Promise<{ providerMessageId: string; providerThreadId: string }> {
    // From is filled by Gmail from the authenticated user; keep placeholder.
    const raw = buildMime({ name: null, email: "me" }, message);
    const res = await this.call<{ id: string; threadId: string }>(
      accessToken,
      "/messages/send",
      {
        method: "POST",
        body: JSON.stringify({
          raw: Buffer.from(raw, "utf8").toString("base64url"),
          ...(message.providerThreadId !== undefined && {
            threadId: message.providerThreadId,
          }),
        }),
      },
    );
    return { providerMessageId: res.id, providerThreadId: res.threadId };
  }

  async applyTriage(
    accessToken: string,
    providerMessageIds: string[],
    action: TriageWriteback,
  ): Promise<void> {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];
    if (action.isRead === true) removeLabelIds.push("UNREAD");
    if (action.isRead === false) addLabelIds.push("UNREAD");
    if (action.isStarred === true) addLabelIds.push("STARRED");
    if (action.isStarred === false) removeLabelIds.push("STARRED");
    if (action.folder === "ARCHIVE") removeLabelIds.push("INBOX");
    if (action.folder === "INBOX") addLabelIds.push("INBOX");
    if (action.folder === "SPAM") addLabelIds.push("SPAM");
    if (action.folder === "TRASH") addLabelIds.push("TRASH");

    if (addLabelIds.length === 0 && removeLabelIds.length === 0) return;
    await this.call(accessToken, "/messages/batchModify", {
      method: "POST",
      body: JSON.stringify({
        ids: providerMessageIds,
        addLabelIds,
        removeLabelIds,
      }),
    });
  }

  async fetchAttachment(
    accessToken: string,
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Buffer> {
    const res = await this.call<{ data: string }>(
      accessToken,
      `/messages/${providerMessageId}/attachments/${providerAttachmentId}`,
    );
    return Buffer.from(res.data, "base64url");
  }
}
