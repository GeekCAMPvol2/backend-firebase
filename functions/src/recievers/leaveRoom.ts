import * as functions from "firebase-functions";
import { z } from "zod";

import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import {
  InvitingMembersFlowRoom,
  invitingMembersFlowRoomSchema,
} from "../schemas/room";

const leaveRoomParamsSchema = z.object({
  roomId: z.string(),
});

type LeaveRoomResponse = LeaveRoomSuccessResponse | LeaveRoomErrorResponse;

type LeaveRoomSuccessResponse = Record<string, never>;

type LeaveRoomErrorResponse = {
  error: string;
};

export const leaveRoom = functions.https.onCall(
  async (data: unknown, context): Promise<LeaveRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { error: "User authentication failed" };
    }

    try {
      const { roomId } = leaveRoomParamsSchema.parse(data);

      return await firestore.runTransaction(
        async (tx): Promise<LeaveRoomResponse> => {
          const roomDoc = await getRoomDocWithTransaction(roomId, tx);
          if (roomDoc == null) {
            return {
              error: "The specified room does not exist",
            };
          }

          // 部屋がメンバー募集中状態であることを確認
          const roomState = invitingMembersFlowRoomSchema.parse(roomDoc.data());

          const members = roomState.members.filter(
            (member) => member.userId !== userId
          );

          const membersReadyState = { ...roomState.membersReadyState };
          delete membersReadyState[roomId];

          tx.update(roomDoc.ref, {
            members,
            membersReadyState,
          } satisfies Partial<InvitingMembersFlowRoom>);

          return {};
        }
      );
    } catch (e) {
      return { error: "Internal server error" };
    }
  }
);
