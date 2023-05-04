import * as functions from "firebase-functions";
import { z } from "zod";

import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import {
  InvitingMembersFlowRoom,
  invitingMembersFlowRoomSchema,
} from "../schemas/room";

const joinRoomParamsSchema = z.object({
  roomId: z.string(),
  playerName: z.string().default("default"),
});

type JoinRoomResponse = JoinRoomSuccessResponse | JoinRoomErrorResponse;

type JoinRoomSuccessResponse = { success: true };

type JoinRoomErrorResponse = {
  success: false;
  error: string;
};

export const joinRoom = functions.https.onCall(
  async (data: unknown, context): Promise<JoinRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { success: false, error: "User authentication failed" };
    }

    try {
      const { roomId, playerName } = joinRoomParamsSchema.parse(data);

      return await firestore.runTransaction(
        async (tx): Promise<JoinRoomResponse> => {
          const roomDoc = await getRoomDocWithTransaction(roomId, tx);
          if (roomDoc == null) {
            return {
              success: false,
              error: "The specified room does not exist",
            };
          }

          // 部屋がメンバー募集中状態であることを確認
          const roomState = invitingMembersFlowRoomSchema.parse(roomDoc.data());

          tx.update(roomDoc.ref, {
            members: [...roomState.members, { playerName, userId }],
          } satisfies Partial<InvitingMembersFlowRoom>);

          return { success: true };
        }
      );
    } catch (e) {
      return { success: false, error: "Internal server error" };
    }
  }
);
