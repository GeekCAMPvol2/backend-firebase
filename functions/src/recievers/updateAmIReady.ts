import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { z } from "zod";

import { GAME_WAITING_NEXT_QUESTION_SECONDS } from "../constants";
import { fetchProductDetails } from "../deps/fetchProductDetails";
import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import {
  ClientSceneGameResult,
  ClientSceneQuizAnswer,
  ClientSceneQuizSubmit,
  ClientSceneSchedule,
} from "../schemas/clientScene";
import {
  RoomInInvitingMembers,
  roomInInvitingMembersSchema,
  Question,
  RoomInGameStarted,
} from "../schemas/room";

const UpdateAmIReadyParamsSchema = z.object({
  roomId: z.string(),
  ready: z.boolean(),
});

type UpdateAmIReadyResponse = UpdateAmIReadyPayload | UpdateAmIReadyError;

type UpdateAmIReadyPayload = { success: true };

type UpdateAmIReadyError = {
  success: false;
  error: string;
};

const newClientSceneSchedulesFromQuestionCount = (
  questionCount: number,
  timeLimitSeconds: number,
  now: Date
): ClientSceneSchedule[] => {
  const schedules: ClientSceneSchedule[] = [];
  const nowMillis = now.getTime();
  // 1問ごとの最大所要時間
  const maxMillisPerQuestion =
    (timeLimitSeconds + GAME_WAITING_NEXT_QUESTION_SECONDS) * 1000;

  for (let i = 0; i < questionCount; i++) {
    const questionStartDateMillis = nowMillis + maxMillisPerQuestion * i;
    const submitSceneSchedule: ClientSceneSchedule = {
      scene: {
        kind: "QUIZ_SUBMIT",
        currentQuestionIndex: i,
      } satisfies ClientSceneQuizSubmit,
      startDate: FirestoreTimestamp.fromMillis(questionStartDateMillis),
    };

    const answerStartDateMillis =
      questionStartDateMillis + timeLimitSeconds * 1000;
    const answerSceneSchedule: ClientSceneSchedule = {
      scene: {
        kind: "QUIZ_ANSWER",
        currentQuestionIndex: i,
      } satisfies ClientSceneQuizAnswer,
      startDate: FirestoreTimestamp.fromMillis(answerStartDateMillis),
    };

    schedules.push(submitSceneSchedule, answerSceneSchedule);
  }

  const gameResultStartDateMillis =
    nowMillis + maxMillisPerQuestion * questionCount;
  const gameResultSceneSchedule: ClientSceneSchedule = {
    scene: { kind: "GAME_RESULT" } satisfies ClientSceneGameResult,
    startDate: FirestoreTimestamp.fromMillis(gameResultStartDateMillis),
  };

  schedules.push(gameResultSceneSchedule);
  return schedules;
};

const prepareGameStart = async (
  roomState: RoomInInvitingMembers
): Promise<RoomInGameStarted> => {
  const { members, timeLimitSeconds, questionCount } = roomState;

  const { products } = await fetchProductDetails({ count: 5 });
  const questions: Question[] = products.map((p) => ({
    productTitle: p.title,
    productPrice: p.price,
    productImageUrl: p.images[0].imageUrl,
    productLinkUrl: p.affiliateLink,
  }));

  const clientSceneSchedules = newClientSceneSchedulesFromQuestionCount(
    questionCount,
    timeLimitSeconds,
    new Date()
  );

  return {
    status: "GAME_STARTED",
    members,
    timeLimitSeconds,
    questionCount,
    clientSceneSchedules,
    questions,
    playerQuestionAnswerTable: {},
  };
};

export const updateAmIReady = functions.https.onCall(
  async (data: unknown, context): Promise<UpdateAmIReadyResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { success: false, error: "User authentication failed" };
    }

    try {
      const { roomId, ready } = UpdateAmIReadyParamsSchema.parse(data);

      return await firestore.runTransaction(
        async (tx): Promise<UpdateAmIReadyResponse> => {
          const roomDoc = await getRoomDocWithTransaction(roomId, tx);
          if (roomDoc == null) {
            return {
              success: false,
              error: "The specified room does not exist",
            };
          }

          // 部屋がメンバー募集中状態であることを確認
          const room = roomInInvitingMembersSchema.parse(roomDoc.data());

          const isUserJoined =
            room.members.findIndex((member) => member.userId === userId) >= 0;
          if (!isUserJoined) {
            return {
              success: false,
              error: "You are not joined specified room",
            };
          }

          const membersReadyState = { ...room.membersReadyState };

          if (ready) {
            membersReadyState[userId] = true;
          } else {
            delete membersReadyState[userId];
          }

          const isAllMemberReady = room.members.reduce(
            (prev, member) => prev && membersReadyState[member.userId],
            true
          );

          if (isAllMemberReady) {
            const roomNextState = prepareGameStart(room);
            tx.set(roomDoc.ref, roomNextState);
          } else {
            tx.update(roomDoc.ref, {
              membersReadyState,
            } satisfies Partial<RoomInInvitingMembers>);
          }

          return { success: true };
        }
      );
    } catch (e) {
      return { success: false, error: "Internal server error" };
    }
  }
);
