import * as functions from "firebase-functions";
import { z } from "zod";

import * as roomStore from "../firestore/room";

const ReadyRoomParamsSchema = z.object({
  roomId: z.string(),
  ready: z.boolean(),
});

type ReadyRoomResponse = ReadyRoomPayload | ReadyRoomError;

type ReadyRoomPayload = Record<string, never>;

type ReadyRoomError = {
  error: string;
};

export const setMemberReadyState = functions.https.onCall(
  async (data, context): Promise<ReadyRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { error: "User authentication failed" };
    }

    try {
      const { roomId, ready } = ReadyRoomParamsSchema.parse(data);
      await roomStore.setMemberReadyState(roomId, userId, ready);

      return {};
    } catch (e) {
      if (e instanceof Error) return { error: e.message };
      return { error: "Unknown error" };
    }
  }
);
