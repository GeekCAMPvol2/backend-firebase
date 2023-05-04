import * as functions from "firebase-functions";
import { z } from "zod";

import { saveUserJoinRoom } from "../firestore/room";

const joinRoomParamsSchema = z.object({
  roomId: z.string(),
  playerName: z.string().default("default"),
});

type JoinRoomResponse = JoinRoomPayload | JoinRoomError;

type JoinRoomPayload = Record<string, never>;

type JoinRoomError = {
  error: string;
};

export const joinRoom = functions.https.onCall(
  async (data, context): Promise<JoinRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { error: "User authentication failed" };
    }

    try {
      const { roomId, playerName } = joinRoomParamsSchema.parse(data);

      await saveUserJoinRoom(roomId, { userId, playerName });

      return {};
    } catch (e) {
      if (e instanceof Error) return { error: e.message };
      return { error: "Unknown error" };
    }
  }
);
