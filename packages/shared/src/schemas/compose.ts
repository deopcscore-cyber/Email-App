import { z } from "zod";
import { addressSchema } from "./mail";

export const composeModeSchema = z.enum(["new", "reply", "replyAll", "forward"]);
export type ComposeMode = z.infer<typeof composeModeSchema>;

export const createDraftSchema = z.object({
  accountId: z.string().min(1),
  mode: composeModeSchema.default("new"),
  /** Thread being replied to / forwarded (required for non-new modes). */
  replyToMessageId: z.string().optional(),
  to: z.array(addressSchema).default([]),
  cc: z.array(addressSchema).default([]),
  bcc: z.array(addressSchema).default([]),
  subject: z.string().default(""),
  bodyHtml: z.string().default(""),
});
export type CreateDraftDto = z.infer<typeof createDraftSchema>;

export const updateDraftSchema = z
  .object({
    to: z.array(addressSchema),
    cc: z.array(addressSchema),
    bcc: z.array(addressSchema),
    subject: z.string(),
    bodyHtml: z.string(),
  })
  .partial();
export type UpdateDraftDto = z.infer<typeof updateDraftSchema>;

export const draftDtoSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  accountId: z.string(),
  mode: composeModeSchema,
  to: z.array(addressSchema),
  cc: z.array(addressSchema),
  bcc: z.array(addressSchema),
  subject: z.string(),
  bodyHtml: z.string(),
  attachments: z.array(
    z.object({
      id: z.string(),
      filename: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().int(),
    }),
  ),
  updatedAt: z.string().datetime(),
});
export type DraftDto = z.infer<typeof draftDtoSchema>;

export const sendMessageSchema = z.object({
  /** Absent = send after the user's undo window. */
  scheduledAt: z.string().datetime().optional(),
});
export type SendMessageDto = z.infer<typeof sendMessageSchema>;

export const sendResultSchema = z.object({
  messageId: z.string(),
  /** When the worker will actually dispatch (undo until then). */
  dispatchAt: z.string().datetime(),
});
export type SendResultDto = z.infer<typeof sendResultSchema>;
