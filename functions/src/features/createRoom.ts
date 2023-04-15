import * as functions from "firebase-functions";
import { z } from "zod";

import { createAndSaveRoom } from "../firestore/room";

const DEFAULT_TIME_LIMIT = 30;
const DEFAULT_QUESTION_COUNT = 5;

const createRoomParamsSchema = z.object({
  playerName: z.string().default("default"),
  timeLimit: z.number().default(DEFAULT_TIME_LIMIT),
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
      const { playerName, questionCount, timeLimit } =
        createRoomParamsSchema.parse(data);

      const { roomId } = await createAndSaveRoom(
        { userId, playerName },
        timeLimit,
        questionCount
      );

      return { roomId };
    } catch (e) {
      if (e instanceof Error) return { error: e.message };
      return { error: "Unknown error" };
    }
  }
);
