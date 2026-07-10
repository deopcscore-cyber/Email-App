import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  askRequestSchema,
  rewriteRequestSchema,
  translateRequestSchema,
  type ActionItemsDto,
  type AskRequestDto,
  type BriefingDto,
  type ReminderDto,
  type ReplySuggestionsDto,
  type RewriteRequestDto,
  type SmartLabelsDto,
  type TranslateRequestDto,
} from "@novamail/shared";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SessionGuard } from "../auth/guards/session.guard";
import { AiRateLimitGuard } from "./ai-rate-limit.guard";
import { AiService } from "./ai.service";
import { SYSTEM } from "./prompts";

/**
 * Interactive AI endpoints. Streaming routes respond as SSE:
 *   event: delta  data: {"text": "..."}     (repeated)
 *   event: done   data: {}
 *   event: error  data: {"message": "..."}
 */
@Controller("ai")
@UseGuards(SessionGuard, AiRateLimitGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  private sse(res: Response): {
    delta: (text: string) => void;
    done: () => void;
    error: (err: unknown) => void;
  } {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    return {
      delta: (text) =>
        res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`),
      done: () => {
        res.write("event: done\ndata: {}\n\n");
        res.end();
      },
      error: (err) => {
        const message =
          err instanceof Error ? err.message : "AI request failed";
        res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
        res.end();
      },
    };
  }

  @Post("threads/:id/summary")
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") threadId: string,
    @Res() res: Response,
  ): Promise<void> {
    const stream = this.sse(res);
    try {
      await this.ai.streamThreadFeature(
        user.id,
        threadId,
        "THREAD_SUMMARY",
        SYSTEM.threadSummary,
        "",
        stream.delta,
      );
      stream.done();
    } catch (err) {
      stream.error(err);
    }
  }

  @Post("threads/:id/ask")
  async ask(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") threadId: string,
    @Body(new ZodValidationPipe(askRequestSchema)) body: AskRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const stream = this.sse(res);
    try {
      await this.ai.streamConversational(
        user.id,
        threadId,
        SYSTEM.ask,
        body.question,
        stream.delta,
      );
      stream.done();
    } catch (err) {
      stream.error(err);
    }
  }

  @Post("threads/:id/explain")
  async explain(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") threadId: string,
    @Res() res: Response,
  ): Promise<void> {
    const stream = this.sse(res);
    try {
      await this.ai.streamConversational(
        user.id,
        threadId,
        SYSTEM.explain,
        null,
        stream.delta,
      );
      stream.done();
    } catch (err) {
      stream.error(err);
    }
  }

  @Post("threads/:id/translate")
  async translate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") threadId: string,
    @Body(new ZodValidationPipe(translateRequestSchema))
    body: TranslateRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const stream = this.sse(res);
    try {
      await this.ai.streamThreadFeature(
        user.id,
        threadId,
        "TRANSLATION",
        SYSTEM.translation,
        body.targetLang.toLowerCase(),
        stream.delta,
        `Translate into: ${body.targetLang}`,
      );
      stream.done();
    } catch (err) {
      stream.error(err);
    }
  }

  @Post("drafts/:id/rewrite")
  async rewrite(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") draftId: string,
    @Body(new ZodValidationPipe(rewriteRequestSchema)) body: RewriteRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const stream = this.sse(res);
    try {
      await this.ai.streamRewrite(user.id, draftId, body, stream.delta);
      stream.done();
    } catch (err) {
      stream.error(err);
    }
  }

  @Post("threads/:id/action-items")
  actionItems(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") threadId: string,
  ): Promise<ActionItemsDto> {
    return this.ai.actionItems(user.id, threadId);
  }

  @Post("threads/:id/reply-suggestions")
  replySuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") threadId: string,
  ): Promise<ReplySuggestionsDto> {
    return this.ai.replySuggestions(user.id, threadId);
  }

  @Post("threads/:id/smart-labels")
  smartLabels(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") threadId: string,
  ): Promise<SmartLabelsDto> {
    return this.ai.smartLabels(user.id, threadId);
  }

  @Get("briefing")
  briefing(@CurrentUser() user: AuthenticatedUser): Promise<BriefingDto> {
    return this.ai.briefing(user.id);
  }

  @Get("reminders")
  reminders(@CurrentUser() user: AuthenticatedUser): Promise<ReminderDto[]> {
    return this.ai.reminders(user.id);
  }

  @Post("reminders/:id/dismiss")
  async dismiss(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<{ ok: true }> {
    await this.ai.dismissReminder(user.id, id);
    return { ok: true };
  }
}
