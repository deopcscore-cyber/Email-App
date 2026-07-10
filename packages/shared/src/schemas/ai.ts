import { z } from "zod";
import { threadListItemSchema } from "./mail";

// ── Requests ─────────────────────────────────────────────────

export const askRequestSchema = z.object({
  question: z.string().min(1).max(2_000),
});
export type AskRequestDto = z.infer<typeof askRequestSchema>;

export const rewriteToneSchema = z.enum([
  "professional",
  "friendly",
  "concise",
  "assertive",
]);
export type RewriteTone = z.infer<typeof rewriteToneSchema>;

export const rewriteRequestSchema = z
  .object({
    tone: rewriteToneSchema.optional(),
    instruction: z.string().max(500).optional(),
  })
  .refine((v) => v.tone !== undefined || v.instruction !== undefined, {
    message: "Provide a tone or an instruction",
  });
export type RewriteRequestDto = z.infer<typeof rewriteRequestSchema>;

export const translateRequestSchema = z.object({
  targetLang: z.string().min(2).max(32),
});
export type TranslateRequestDto = z.infer<typeof translateRequestSchema>;

// ── Structured results ───────────────────────────────────────

export const replySuggestionSchema = z.object({
  tone: z.string(),
  body: z.string(),
});
export const replySuggestionsSchema = z.object({
  suggestions: z.array(replySuggestionSchema).min(1).max(3),
});
export type ReplySuggestionsDto = z.infer<typeof replySuggestionsSchema>;

export const actionItemsSchema = z.object({
  items: z.array(
    z.object({
      text: z.string(),
      deadline: z.string().nullable(),
    }),
  ),
  meeting: z
    .object({
      title: z.string(),
      proposedTime: z.string().nullable(),
      attendees: z.array(z.string()),
    })
    .nullable(),
});
export type ActionItemsDto = z.infer<typeof actionItemsSchema>;

export const smartLabelsSchema = z.object({
  labels: z.array(z.string()).max(3),
});
export type SmartLabelsDto = z.infer<typeof smartLabelsSchema>;

export const briefingSchema = z.object({
  date: z.string(),
  headline: z.string(),
  important: z.array(
    z.object({ threadId: z.string(), subject: z.string(), reason: z.string() }),
  ),
  deadlines: z.array(z.object({ text: z.string(), due: z.string().nullable() })),
  awaitingReply: z.array(
    z.object({ threadId: z.string(), subject: z.string(), since: z.string() }),
  ),
});
export type BriefingDto = z.infer<typeof briefingSchema>;

export const reminderDtoSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  subject: z.string(),
  reason: z.string(),
  remindAt: z.string().datetime(),
});
export type ReminderDto = z.infer<typeof reminderDtoSchema>;

// ── Natural-language search ──────────────────────────────────

/** Contract between the AI query compiler and the FTS query builder. */
export const structuredFilterSchema = z.object({
  keywords: z.array(z.string()).default([]),
  from: z.array(z.string()).default([]),
  to: z.array(z.string()).default([]),
  dateFrom: z.string().nullable().default(null),
  dateTo: z.string().nullable().default(null),
  hasAttachment: z.boolean().default(false),
  folder: z.string().nullable().default(null),
  labels: z.array(z.string()).default([]),
  isUnread: z.boolean().default(false),
  isStarred: z.boolean().default(false),
});
export type StructuredFilter = z.infer<typeof structuredFilterSchema>;

export const nlSearchRequestSchema = z.object({
  query: z.string().min(3).max(300),
});
export type NlSearchRequestDto = z.infer<typeof nlSearchRequestSchema>;

export const nlSearchResultSchema = z.object({
  filter: structuredFilterSchema,
  /** Human-readable chips describing the compiled filter. */
  chips: z.array(z.string()),
  threads: z.array(threadListItemSchema),
});
export type NlSearchResultDto = z.infer<typeof nlSearchResultSchema>;
