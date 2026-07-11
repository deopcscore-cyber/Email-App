import { z } from "zod";

export const signatureSchema = z.object({
  accountId: z.string(),
  bodyHtml: z.string(),
  isEnabled: z.boolean(),
});
export type SignatureDto = z.infer<typeof signatureSchema>;

export const updateSignatureSchema = z.object({
  bodyHtml: z.string(),
  isEnabled: z.boolean().default(true),
});
export type UpdateSignatureDto = z.infer<typeof updateSignatureSchema>;
