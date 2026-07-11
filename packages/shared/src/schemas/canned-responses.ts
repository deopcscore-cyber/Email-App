import { z } from "zod";

export const cannedResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  bodyHtml: z.string(),
  updatedAt: z.string().datetime(),
});
export type CannedResponseDto = z.infer<typeof cannedResponseSchema>;

export const createCannedResponseSchema = z.object({
  title: z.string().min(1).max(80),
  bodyHtml: z.string(),
});
export type CreateCannedResponseDto = z.infer<
  typeof createCannedResponseSchema
>;

export const updateCannedResponseSchema = createCannedResponseSchema.partial();
export type UpdateCannedResponseDto = z.infer<
  typeof updateCannedResponseSchema
>;
