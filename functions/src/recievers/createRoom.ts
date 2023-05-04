import * as functions from "firebase-functions";
import { z } from "zod";

import { firestore } from "../deps/firestore";
import { InvitingMembersFlowRoom } from "../schemas/room";

const DEFAULT_TIME_LIMIT_SECONDS = 30;
const DEFAULT_QUESTION_COUNT = 5;

const createRoomParamsSchema = z.object({
  playerName: z.string().default("default"),
  timeLimitSeconds: z.number().default(DEFAULT_TIME_LIMIT_SECONDS),
  questionCount: z.number().default(DEFAULT_QUESTION_COUNT),
});

type CreateRoomResponse = CreateRoomSuccessResponse | CreateRoomErrorResponse;

type CreateRoomSuccessResponse = {
  roomId: string;
};

type CreateRoomErrorResponse = {
  error: string;
};

export const createRoom = functions.https.onCall(
  async (data: unknown, context): Promise<CreateRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { error: "User authentication failed" };
    }

    try {
      const { playerName, questionCount, timeLimitSeconds } =
        createRoomParamsSchema.parse(data);

      const roomState: InvitingMembersFlowRoom = {
        status: "INVITING_MEMBERS",
        members: [{ playerName, userId }],
        membersReadyState: {},
        timeLimitSeconds,
        questionCount,
      };

      const docRef = await firestore.collection("rooms").add(roomState);

      const roomId = docRef.id;

      return { roomId };
    } catch (e) {
      if (e instanceof Error) return { error: e.message };
      return { error: "Unknown error" };
    }
  }
);
