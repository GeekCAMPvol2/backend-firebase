import * as functions from "firebase-functions";
import { z } from "zod";

import * as roomStore from "../firestore/room";

const leaveRoomParamsSchema = z.object({
  roomId: z.string(),
});

type LeaveRoomResponse = LeaveRoomPayload | LeaveRoomError;

type LeaveRoomPayload = Record<string, never>;

type LeaveRoomError = {
  error: string;
};

export const leaveRoom = functions.https.onCall(
  async (data, context): Promise<LeaveRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { error: "User authentication failed" };
    }

    try {
      const { roomId } = leaveRoomParamsSchema.parse(data);

      await roomStore.leaveRoom(roomId, userId);

      return {};
    } catch (e) {
      if (e instanceof Error) return { error: e.message };
      return { error: "Unknown error" };
    }
  }
);
