import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { z } from "zod";

import {
  GAME_DEFAULT_TIME_LIMIT_SECONDS,
  GAME_WAITING_NEXT_QUESTION_SECONDS,
} from "../constants";
import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import { GameQuestion } from "../schemas/gameQuestion";
import { MemberAnswerMap, gameStartedFlowRoomSchema } from "../schemas/room";
import { RoomMember } from "../schemas/roomMember";

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
          const newMenberAnswerMap = addAnswer(
            roomState.memberAnswerMap,
            userId,
            questionIndex,
            answeredPrice
          );

          tx.update(roomDoc.ref, { memberAnswerMap: newMenberAnswerMap });

          // 全員が回答した場合は、以降の問題の出題時刻を前倒ししてFirestoreに記録する
          const allMemberAnswered = checkAllMembersAnswered(
            roomState.members,
            roomState.memberAnswerMap,
            questionIndex
          );

          if (allMemberAnswered) {
            const newQuestions = recalculateQuestionPresentedDate(
              roomState.questions,
              questionIndex,
              Date.now()
            );

            tx.update(roomDoc.ref, { questions: newQuestions });
          }

          return { success: true };
        }
      );
    } catch (e) {
      return { success: false, error: "Unknown error" };
    }
  }
);

// 回答を追加してMemberAnswerMapを再構築する
const addAnswer = (
  memberAnswerMap: MemberAnswerMap,
  memberId: string,
  questionIndex: number,
  price: number
) => {
  const newMap: MemberAnswerMap = {};
  for (const [mId, answers] of Object.entries(memberAnswerMap)) {
    newMap[mId] =
      mId === memberId ? { ...answers, [questionIndex]: price } : answers;
  }
};

// questionIndex番目の問題について全員回答したか調べる
const checkAllMembersAnswered = (
  members: RoomMember[],
  memberAnswerMap: MemberAnswerMap,
  questionIndex: number
): boolean => {
  for (const member of members) {
    if (memberAnswerMap[member.userId]?.[questionIndex] == null) {
      return false;
    }
  }
  return true;
};

// currentTimestamp時点でcurrentQuestionIndex番目の問題に全員が回答した前提で、
// currentQuestionIndex + 1番目以降の問題のpresentedDateを再計算して返す
const recalculateQuestionPresentedDate = (
  questions: GameQuestion[],
  currentQuestionIndex: number,
  currentTimestamp: number
): GameQuestion[] => {
  const nextQuestionPresentedAtMillis =
    currentTimestamp + GAME_WAITING_NEXT_QUESTION_SECONDS * 1000;

  return questions.map((q, i) => {
    if (i <= currentQuestionIndex) {
      return q;
    }

    const newPresentedAtMillis =
      nextQuestionPresentedAtMillis +
      (GAME_DEFAULT_TIME_LIMIT_SECONDS + GAME_WAITING_NEXT_QUESTION_SECONDS) *
        (i - currentQuestionIndex - 1) *
        1000;

    const { affiliateLink, productImageUrl, productPrice, productTitle } = q;

    const newQ: GameQuestion = {
      affiliateLink,
      presentedAt: FirestoreTimestamp.fromMillis(newPresentedAtMillis),
      productImageUrl,
      productPrice,
      productTitle,
    };

    return newQ;
  });
};
