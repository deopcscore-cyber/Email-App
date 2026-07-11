import { z } from "zod";

/** OAuth providers we support for both login and mailbox access. */
export const providerSchema = z.enum(["GOOGLE", "MICROSOFT"]);
export type Provider = z.infer<typeof providerSchema>;

export const themeSchema = z.enum(["LIGHT", "DARK", "SYSTEM"]);
export type Theme = z.infer<typeof themeSchema>;

export const syncStatusSchema = z.enum([
  "PENDING",
  "BACKFILLING",
  "ACTIVE",
  "ERROR",
  "DISCONNECTED",
]);
export type SyncStatus = z.infer<typeof syncStatusSchema>;

/** A connected mailbox, as exposed to the client (no token material). */
export const emailAccountSchema = z.object({
  id: z.string(),
  provider: providerSchema,
  email: z.string().email(),
  displayName: z.string().nullable(),
  syncStatus: syncStatusSchema,
  color: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type EmailAccountDto = z.infer<typeof emailAccountSchema>;

export const userSettingsSchema = z.object({
  theme: themeSchema,
  undoWindowSeconds: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(30),
  ]),
  aiEnabled: z.boolean(),
  aiAutoLabels: z.boolean(),
  aiDailyBriefing: z.boolean(),
  aiFollowUps: z.boolean(),
  briefingHourLocal: z.number().int().min(0).max(23),
  timezone: z.string(),
  notificationSound: z.boolean(),
});
export type UserSettingsDto = z.infer<typeof userSettingsSchema>;

export const updateSettingsSchema = userSettingsSchema.partial();
export type UpdateSettingsDto = z.infer<typeof updateSettingsSchema>;

/** Payload of GET /auth/session — the app's bootstrap call. */
export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  settings: userSettingsSchema,
  accounts: z.array(emailAccountSchema),
});
export type SessionUserDto = z.infer<typeof sessionUserSchema>;

/** Uniform API error envelope. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
