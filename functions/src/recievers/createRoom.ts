import * as functions from "firebase-functions";
import { z } from "zod";

import {
  GAME_DEFAULT_QUESTION_COUNT,
  GAME_DEFAULT_TIME_LIMIT_SECONDS,
} from "../constants";
import { firestore } from "../deps/firestore";
import { InvitingMembersFlowRoom } from "../schemas/room";

const createRoomParamsSchema = z.object({
  playerName: z.string().default("default"),
  timeLimitSeconds: z.number().default(GAME_DEFAULT_TIME_LIMIT_SECONDS),
  questionCount: z.number().default(GAME_DEFAULT_QUESTION_COUNT),
});

type CreateRoomResponse = CreateRoomSuccessResponse | CreateRoomErrorResponse;

type CreateRoomSuccessResponse = {
  success: true;
  roomId: string;
};

type CreateRoomErrorResponse = {
  success: false;
  error: string;
};

export const createRoom = functions.https.onCall(
  async (data: unknown, context): Promise<CreateRoomResponse> => {
    const userId = context.auth?.uid;

    if (userId == null) {
      return { success: false, error: "User authentication failed" };
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

      return { success: true, roomId };
    } catch (e) {
      return { success: false, error: "Unknown error" };
    }
  }
);
