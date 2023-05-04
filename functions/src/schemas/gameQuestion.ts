import { z } from "zod";

import { firestoreTimestampLooseSchema } from "./firebase";

export const gameQuestionSchema = z.object({
  presentedAt: firestoreTimestampLooseSchema,
  productTitle: z.string(),
  productPrice: z.number(),
  productImageUrl: z.string(),
  affiliateLink: z.string(),
});

export type GameQuestion = z.infer<typeof gameQuestionSchema>;
