import { z } from "zod";

export const addressSchema = z.object({
  name: z.string().nullish(),
  email: z.string(),
});
export type Address = z.infer<typeof addressSchema>;

export const folderSchema = z.enum([
  "INBOX",
  "SENT",
  "DRAFTS",
  "SPAM",
  "TRASH",
  "ARCHIVE",
]);

/** Sidebar views: real folders plus virtual filters. */
export const mailViewSchema = z.enum([
  "inbox",
  "priority",
  "unread",
  "snoozed",
  "starred",
  "sent",
  "drafts",
  "spam",
  "trash",
]);
export type MailView = z.infer<typeof mailViewSchema>;

/** Gmail-style inbox category tabs. */
export const categorySchema = z.enum(["PRIMARY", "SOCIAL", "PROMOTIONS"]);
export type Category = z.infer<typeof categorySchema>;

export const labelDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});
export type LabelDto = z.infer<typeof labelDtoSchema>;

export const labelWithCountSchema = labelDtoSchema.extend({
  threadCount: z.number().int(),
});
export type LabelWithCountDto = z.infer<typeof labelWithCountSchema>;

export const threadListItemSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountColor: z.string().nullable(),
  subject: z.string(),
  snippet: z.string(),
  folder: folderSchema,
  category: categorySchema,
  participants: z.array(addressSchema),
  messageCount: z.number().int(),
  unreadCount: z.number().int(),
  isStarred: z.boolean(),
  isPinned: z.boolean(),
  isPriority: z.boolean(),
  hasAttachments: z.boolean(),
  snoozedUntil: z.string().datetime().nullable(),
  lastMessageAt: z.string().datetime(),
  labels: z.array(labelDtoSchema),
});
export type ThreadListItemDto = z.infer<typeof threadListItemSchema>;

export const threadPageSchema = z.object({
  items: z.array(threadListItemSchema),
  nextCursor: z.string().nullable(),
});
export type ThreadPageDto = z.infer<typeof threadPageSchema>;

export const attachmentDtoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  isInline: z.boolean(),
  contentId: z.string().nullable(),
});
export type AttachmentDto = z.infer<typeof attachmentDtoSchema>;

export const messageDtoSchema = z.object({
  id: z.string(),
  from: addressSchema,
  to: z.array(addressSchema),
  cc: z.array(addressSchema),
  snippet: z.string(),
  bodyHtml: z.string().nullable(),
  bodyText: z.string().nullable(),
  isRead: z.boolean(),
  receivedAt: z.string().datetime(),
  attachments: z.array(attachmentDtoSchema),
});
export type MessageDto = z.infer<typeof messageDtoSchema>;

export const threadDetailSchema = threadListItemSchema.extend({
  messages: z.array(messageDtoSchema),
});
export type ThreadDetailDto = z.infer<typeof threadDetailSchema>;

/** One PATCH shape for every triage action — optimistic updates stay uniform. */
export const triagePatchSchema = z
  .object({
    isRead: z.boolean(),
    isStarred: z.boolean(),
    isPinned: z.boolean(),
    folder: folderSchema,
    snoozedUntil: z.string().datetime().nullable(),
  })
  .partial();
export type TriagePatchDto = z.infer<typeof triagePatchSchema>;

export const threadCountsSchema = z.object({
  inbox: z.number().int(),
  unread: z.number().int(),
  drafts: z.number().int(),
  snoozed: z.number().int(),
  spam: z.number().int(),
});
export type ThreadCountsDto = z.infer<typeof threadCountsSchema>;
