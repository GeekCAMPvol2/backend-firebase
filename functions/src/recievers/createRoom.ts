import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import * as functions from "firebase-functions";
import { z } from "zod";

import {
  GAME_DEFAULT_QUESTION_COUNT,
  GAME_DEFAULT_TIME_LIMIT_SECONDS,
} from "../constants";
import { firestore } from "../deps/firestore";
import { ClientSceneLobby, ClientSceneSchedule } from "../schemas/clientScene";
import { RoomInInvitingMembers } from "../schemas/room";

const createRoomParamsSchema = z.object({
  memberDisplayName: z.string().default("default"),
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
      const { memberDisplayName, questionCount, timeLimitSeconds } =
        createRoomParamsSchema.parse(data);

      const schedule: ClientSceneSchedule = {
        scene: { kind: "LOBBY" } satisfies ClientSceneLobby,
        startDate: FirestoreTimestamp.fromDate(new Date()),
      };

      const room: RoomInInvitingMembers = {
        status: "INVITING_MEMBERS",
        members: [{ displayName: memberDisplayName, userId }],
        membersReadyState: {},
        clientSceneSchedules: [schedule],
        timeLimitSeconds,
        questionCount,
      };

      const docRef = await firestore.collection("rooms").add(room);

      const roomId = docRef.id;

      return { success: true, roomId };
    } catch (e) {
      return { success: false, error: "Unknown error" };
    }
  }
);
