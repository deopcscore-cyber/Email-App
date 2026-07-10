import { z } from "zod";
import { threadListItemSchema } from "./mail";

export const searchResultSchema = z.object({
  threads: z.array(threadListItemSchema),
  /** Echo of the parsed operators, for filter-chip rendering. */
  parsed: z.object({
    keywords: z.string(),
    operators: z.array(z.object({ key: z.string(), value: z.string() })),
  }),
});
export type SearchResultDto = z.infer<typeof searchResultSchema>;

export const contactDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});
export type ContactDto = z.infer<typeof contactDtoSchema>;
