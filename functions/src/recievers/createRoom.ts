import * as functions from "firebase-functions";
import { z } from "zod";

import { createAndSaveRoom } from "../firestore/room";

const DEFAULT_TIME_LIMIT_SECONDS = 30;
const DEFAULT_QUESTION_COUNT = 5;

const createRoomParamsSchema = z.object({
  playerName: z.string().default("default"),
  timeLimitSeconds: z.number().default(DEFAULT_TIME_LIMIT_SECONDS),
  questionCount: z.number().default(DEFAULT_QUESTION_COUNT),
});

type CreateRoomResponse = CreateRoomPayload | CreateRoomError;

type CreateRoomPayload = {
  roomId: string;
};

type CreateRoomError = {
  error: string;
};

export const createRoom = functions.https.onCall(
  async (data, context): Promise<CreateRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { error: "User authentication failed" };
    }

    try {
      const { playerName, questionCount, timeLimitSeconds } =
        createRoomParamsSchema.parse(data);

      const { roomId } = await createAndSaveRoom(
        { userId, playerName },
        timeLimitSeconds,
        questionCount
      );

      return { roomId };
    } catch (e) {
      if (e instanceof Error) return { error: e.message };
      return { error: "Unknown error" };
    }
  }
);
