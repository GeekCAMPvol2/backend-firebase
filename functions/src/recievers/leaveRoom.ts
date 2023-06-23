import * as functions from "firebase-functions";
import { z } from "zod";

import { firestore } from "../deps/firestore";
import { getRoomDocWithTransaction } from "../firestore/room";
import {
  RoomInInvitingMembers,
  roomInInvitingMembersSchema,
} from "../schemas/room";

const leaveRoomParamsSchema = z.object({
  roomId: z.string(),
});

type LeaveRoomResponse = LeaveRoomSuccessResponse | LeaveRoomErrorResponse;

type LeaveRoomSuccessResponse = { success: true };

type LeaveRoomErrorResponse = {
  success: false;
  error: string;
};

export const leaveRoom = functions.https.onCall(
  async (data: unknown, context): Promise<LeaveRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { success: false, error: "User authentication failed" };
    }

    try {
      const { roomId } = leaveRoomParamsSchema.parse(data);

      return await firestore.runTransaction(
        async (tx): Promise<LeaveRoomResponse> => {
          const roomDoc = await getRoomDocWithTransaction(roomId, tx);
          if (roomDoc == null) {
            return {
              success: false,
              error: "The specified room does not exist",
            };
          }

          // 部屋がメンバー募集中状態であることを確認
          const roomState = roomInInvitingMembersSchema.parse(roomDoc.data());

          const members = roomState.members.filter(
            (member) => member.userId !== userId
          );

          const membersReadyState = { ...roomState.membersReadyState };
          delete membersReadyState[roomId];

          tx.update(roomDoc.ref, {
            members,
            membersReadyState,
          } satisfies Partial<RoomInInvitingMembers>);

          return { success: true };
        }
      );
    } catch (e) {
      return { success: false, error: "Internal server error" };
    }
  }
);
