import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { z } from "zod";

import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import { gameStartedFlowRoomSchema } from "../schemas/room";

const submitAnswerParamsSchema = z.object({
  roomId: z.string(),
  questionIndex: z.number().int(),
  answeredPrice: z.number().int(),
});

type SubmitAnswerResponse =
  | SubmitAnswerSuccessResponse
  | SubmitAnswerErrorResponse;

type SubmitAnswerSuccessResponse = { success: true };

type SubmitAnswerErrorResponse = {
  success: false;
  error: string;
};

export const submitAnswer = functions.https.onCall(
  async (data: unknown, context): Promise<SubmitAnswerResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { success: false, error: "User authentication failed" };
    }

    try {
      const { roomId, questionIndex, answeredPrice } =
        submitAnswerParamsSchema.parse(data);

      return await firestore.runTransaction(
        async (tx): Promise<SubmitAnswerResponse> => {
          const roomDoc = await getRoomDocWithTransaction(roomId, tx);
          if (roomDoc == null) {
            return {
              success: false,
              error: "The specified room does not exist",
            };
          }

          // 部屋がゲーム開始後状態であることを確認
          const roomState = gameStartedFlowRoomSchema.parse(roomDoc.data());

          const memberIndex = roomState.members.findIndex(
            (member) => member.userId === userId
          );

          if (memberIndex < 0) {
            return {
              success: false,
              error: "You are not joined specified room",
            };
          }

          const question = roomState.questions[questionIndex];

          if (question == null) {
            return {
              success: false,
              error: "questionIndex is out of range",
            };
          }

          const now = Date.now();
          const presentedAtMillis = (
            question.presentedAt as FirestoreTimestamp
          ).toMillis();
          const closedAtMillis =
            presentedAtMillis + roomState.timeLimitSeconds * 1000;
          if (now < presentedAtMillis || now > closedAtMillis)
            throw Error("specified question is not current");

          tx.update(roomDoc.ref, {
            [`memberAnswerMap.${userId}.${questionIndex}`]: answeredPrice,
          });

          return { success: true };
        }
      );
    } catch (e) {
      return { success: false, error: "Unknown error" };
    }
  }
);
