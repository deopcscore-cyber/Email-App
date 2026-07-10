import { z } from "zod";

/** Server→client realtime events multiplexed over one SSE stream. */
export const mailEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mail.updated"),
    threadIds: z.array(z.string()),
  }),
  z.object({
    type: z.literal("sync.progress"),
    accountId: z.string(),
    percent: z.number(),
  }),
  z.object({
    type: z.literal("sendStatus.changed"),
    messageId: z.string(),
    status: z.enum(["QUEUED", "SENDING", "SENT", "FAILED"]),
  }),
  z.object({
    type: z.literal("snooze.fired"),
    threadId: z.string(),
    subject: z.string(),
  }),
]);
export type MailEvent = z.infer<typeof mailEventSchema>;
