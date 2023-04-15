import * as functions from "firebase-functions";
import { z } from "zod";

import { saveMemberAnswer } from "../firestore/room";

const submitAnswerParamsSchema = z.object({
  roomId: z.string(),
  questionIndex: z.number().int(),
  answeredPrice: z.number().int(),
});

type SubmitAnswerResponse = SubmitAnswerPayload | SubmitAnswerError;

type SubmitAnswerPayload = Record<string, never>;

type SubmitAnswerError = {
  error: string;
};

export const submitAnswer = functions.https.onCall(
  async (data, context): Promise<SubmitAnswerResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { error: "User authentication failed" };
    }

    try {
      const { roomId, questionIndex, answeredPrice } =
        submitAnswerParamsSchema.parse(data);

      await saveMemberAnswer(roomId, userId, questionIndex, answeredPrice);

      return {};
    } catch (e) {
      if (e instanceof Error) return { error: e.message };
      return { error: "Unknown error" };
    }
  }
);
