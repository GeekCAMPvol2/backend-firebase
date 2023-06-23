import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { z } from "zod";

import { GAME_WAITING_NEXT_QUESTION_SECONDS } from "../constants";
import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import {
  ClientSceneGameResult,
  ClientSceneQuizAnswer,
  ClientSceneQuizSubmit,
  ClientSceneSchedule,
} from "../schemas/clientScene";
import {
  PlayerQuestionAnswerTable,
  Question,
  Room,
  roomInGameStartedSchema,
  RoomMember,
} from "../schemas/room";

const submitAnswerParamsSchema = z.object({
  roomId: z.string(),
  questionIndex: z.number().int(),
  price: z.number().int(),
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
      const { roomId, questionIndex, price } =
        submitAnswerParamsSchema.parse(data);

      // Firestoreのトランザクションを開始
      // 内側のasync関数の戻り値がそのままrunTransactionの戻り値になる
      return await firestore.runTransaction(
        async (tx): Promise<SubmitAnswerResponse> => {
          // Firestoreからroomを取得し、nullチェックする
          const roomDocSnap = await getRoomDocWithTransaction(roomId, tx);
          if (roomDocSnap == null) {
            return {
              success: false,
              error: "The specified room does not exist",
            };
          }

          // 取得したroomがゲーム開始済み状態であることを、Zodのパースによって確認する
          const room = roomInGameStartedSchema.parse(roomDocSnap.data());
          // const {
          //   members,
          //   timeLimitSeconds,
          //   questions,
          //   playerQuestionAnswerTable,
          // } = room;

          // roomの参加メンバーにが含まれることを確認する
          const isUserJoined =
            room.members.findIndex((member) => member.userId === userId) >= 0;

          if (!isUserJoined) {
            return {
              success: false,
              error: "You are not joined specified room",
            };
          }

          // リクエストで指定されたquestion (問題) を取得
          const question = room.questions[questionIndex];
          if (question == null) {
            return {
              success: false,
              error: "questionIndex is out of range",
            };
          }

          // 指定のquestionが出題中の問題と一致するか確認
          const now = new Date();
          if (!checkCurrentQuestionIndexIs(questionIndex, room, now)) {
            return {
              success: false,
              error: "specified question is not current",
            };
          }

          // 回答を記録する
          const updatedMemberAnswerMap = addAnswer(
            room.playerQuestionAnswerTable,
            userId,
            questionIndex,
            price
          );

          tx.update(roomDocSnap.ref, {
            memberAnswerMap: updatedMemberAnswerMap,
          });

          // 全員が回答した場合は、以降の問題の出題時刻を前倒ししてFirestoreに記録する
          const allMemberAnswered = checkAllMembersAnswered(
            room.members,
            room.playerQuestionAnswerTable,
            questionIndex
          );

          if (allMemberAnswered) {
            const newQuestions = recalculateClientSceneSchedules(
              room.questions,
              questionIndex,
              room.timeLimitSeconds,
              new Date()
            );

            tx.update(roomDocSnap.ref, { questions: newQuestions });
          }

          return { success: true };
        }
      );
    } catch (e) {
      return { success: false, error: "Unknown error" };
    }
  }
);

const getCurrentSceneSchedule = (
  room: Room,
  now: Date
): ClientSceneSchedule | undefined => {
  let latestSchedule: ClientSceneSchedule | undefined;
  const schedules = room.clientSceneSchedules;

  for (let i = 0; i < schedules.length; i++) {
    if (now < schedules[i].startDate.toDate()) {
      break;
    }
    latestSchedule = schedules[i];
  }

  return latestSchedule;
};

const checkCurrentQuestionIndexIs = (is: number, room: Room, now: Date) => {
  const currentScene = getCurrentSceneSchedule(room, now)?.scene;
  return (
    currentScene?.kind === "QUIZ_SUBMIT" &&
    currentScene.currentQuestionIndex === is
  );
};

// 回答を追加してMemberAnswerMapを再構築する
const addAnswer = (
  memberAnswerMap: PlayerQuestionAnswerTable,
  memberId: string,
  questionIndex: number,
  price: number
) => {
  const newMap: PlayerQuestionAnswerTable = {};
  for (const [mId, answers] of Object.entries(memberAnswerMap)) {
    newMap[mId] =
      mId === memberId ? { ...answers, [questionIndex]: price } : answers;
  }
};

// questionIndex番目の問題について全員回答したか調べる
const checkAllMembersAnswered = (
  members: RoomMember[],
  memberAnswerMap: PlayerQuestionAnswerTable,
  questionIndex: number
): boolean => {
  for (const member of members) {
    if (memberAnswerMap[member.userId]?.[questionIndex] == null) {
      return false;
    }
  }
  return true;
};

// completedQuestionIndex番目の問題に全員が回答した前提で、
// その解答画面以降のClientSceneSchedule[]を再計算して返す
const recalculateClientSceneSchedules = (
  questions: Question[],
  completedQuestionIndex: number,
  questionTimeLimitSeconds: number,
  now: Date
): ClientSceneSchedule[] => {
  const schedules: ClientSceneSchedule[] = [
    {
      scene: {
        kind: "QUIZ_ANSWER",
        currentQuestionIndex: completedQuestionIndex,
      },
      startDate: FirestoreTimestamp.fromDate(now),
    },
  ];

  let questionIndex = completedQuestionIndex + 1;
  let questionStartDateMillis =
    now.getTime() + GAME_WAITING_NEXT_QUESTION_SECONDS * 1000;
  while (questionIndex < questions.length) {
    const submitSceneSchedule: ClientSceneSchedule = {
      scene: {
        kind: "QUIZ_SUBMIT",
        currentQuestionIndex: questionIndex,
      } satisfies ClientSceneQuizSubmit,
      startDate: FirestoreTimestamp.fromMillis(questionStartDateMillis),
    };

    const answerStartDateMillis =
      questionStartDateMillis + questionTimeLimitSeconds * 1000;
    const answerSceneSchedule: ClientSceneSchedule = {
      scene: {
        kind: "QUIZ_ANSWER",
        currentQuestionIndex: questionIndex,
      } satisfies ClientSceneQuizAnswer,
      startDate: FirestoreTimestamp.fromMillis(answerStartDateMillis),
    };

    schedules.push(submitSceneSchedule, answerSceneSchedule);

    questionIndex++;
    questionStartDateMillis =
      answerStartDateMillis + GAME_WAITING_NEXT_QUESTION_SECONDS * 1000;
  }

  // ループ後のquestionStartDateMillisはゲーム終了時刻としても使える
  const gameResultSceneSchedule: ClientSceneSchedule = {
    scene: { kind: "GAME_RESULT" } satisfies ClientSceneGameResult,
    startDate: FirestoreTimestamp.fromMillis(questionStartDateMillis),
  };

  schedules.push(gameResultSceneSchedule);
  return schedules;
};
