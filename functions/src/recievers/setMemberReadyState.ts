import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { z } from "zod";

import { GAME_WAITING_NEXT_QUESTION_SECONDS } from "../constants";
import { fetchProductDetails } from "../deps/fetchProductDetails";
import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import { GameQuestion } from "../schemas/gameQuestion";
import {
  InvitingMembersFlowRoom,
  GameStartedFlowRoom,
  invitingMembersFlowRoomSchema,
} from "../schemas/room";

const ReadyRoomParamsSchema = z.object({
  roomId: z.string(),
  ready: z.boolean(),
});

type SetMemberReadyStateResponse =
  | SetMemberReadyStatePayload
  | SetMemberReadyStateError;

type SetMemberReadyStatePayload = { success: true };

type SetMemberReadyStateError = {
  success: false;
  error: string;
};

const prepareGameStart = async (
  roomState: InvitingMembersFlowRoom
): Promise<GameStartedFlowRoom> => {
  const { members, timeLimitSeconds, questionCount } = roomState;

  const { products } = await fetchProductDetails({ count: 5 });
  const now = Date.now();

  const questionIntervalSeconds =
    roomState.timeLimitSeconds + GAME_WAITING_NEXT_QUESTION_SECONDS;

  const questions: GameQuestion[] = products.map((p, i) => ({
    presentedAt: FirestoreTimestamp.fromMillis(
      now + questionIntervalSeconds * 1000 * i
    ),
    productTitle: p.title,
    productPrice: p.price,
    productImageUrl: p.images[0].imageUrl,
    affiliateLink: p.affiliateLink,
  }));

  return {
    status: "GAME_STARTED",
    members,
    timeLimitSeconds,
    questionCount,
    questions,
    memberAnswerMap: {},
  };
};

export const setMemberReadyState = functions.https.onCall(
  async (data: unknown, context): Promise<SetMemberReadyStateResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { success: false, error: "User authentication failed" };
    }

    try {
      const { roomId, ready } = ReadyRoomParamsSchema.parse(data);

      return await firestore.runTransaction(
        async (tx): Promise<SetMemberReadyStateResponse> => {
          const roomDoc = await getRoomDocWithTransaction(roomId, tx);
          if (roomDoc == null) {
            return {
              success: false,
              error: "The specified room does not exist",
            };
          }

          // 部屋がメンバー募集中状態であることを確認
          const room = invitingMembersFlowRoomSchema.parse(roomDoc.data());

          const memberIndex = room.members.findIndex(
            (member) => member.userId === userId
          );

          if (memberIndex < 0) {
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
            } satisfies Partial<InvitingMembersFlowRoom>);
          }

          return { success: true };
        }
      );
    } catch (e) {
      return { success: false, error: "Internal server error" };
    }
  }
);
