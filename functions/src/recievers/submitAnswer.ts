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

    // ログインしていないクライアントからのリクエストは弾く
    if (userId == null) {
      return { success: false, error: "User authentication failed" };
    }

    try {
      // パラメーターをZodでパース
      const { roomId, questionIndex, answeredPrice } =
        submitAnswerParamsSchema.parse(data);

      // Firestoreのトランザクションを開始
      // 内側のasync関数の戻り値がそのままrunTransactionの戻り値になる
      return await firestore.runTransaction(
        async (tx): Promise<SubmitAnswerResponse> => {
          // Firestoreからroomを取得し、nullチェックする
          const roomDoc = await getRoomDocWithTransaction(roomId, tx);
          if (roomDoc == null) {
            return {
              success: false,
              error: "The specified room does not exist",
            };
          }

          // 取得したroomがゲーム開始済み状態であることを、Zodのパースによって確認する
          const roomState = gameStartedFlowRoomSchema.parse(roomDoc.data());

          // roomの参加メンバーにが含まれることを確認する
          const memberIndex = roomState.members.findIndex(
            (member) => member.userId === userId
          );

          if (memberIndex < 0) {
            return {
              success: false,
              error: "You are not joined specified room",
            };
          }

          // リクエストで指定されたquestion (問題) を取得
          const question = roomState.questions[questionIndex];
          if (question == null) {
            return {
              success: false,
              error: "questionIndex is out of range",
            };
          }

          // 指定のquestionが出題中の問題と一致するか確認
          const now = Date.now();
          const presentedAtMillis = (
            question.presentedAt as FirestoreTimestamp
          ).toMillis();
          const closedAtMillis =
            presentedAtMillis + roomState.timeLimitSeconds * 1000;

          if (now < presentedAtMillis || now > closedAtMillis) {
            return {
              success: false,
              error: "specified question is not current",
            };
          }

          // 回答を記録する
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
