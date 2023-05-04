import { z } from "zod";

import { gameQuestionSchema } from "./gameQuestion";
import { roomMemberSchema } from "./roomMember";

export const invitingMembersFlowRoomSchema = z.object({
  status: z.literal("INVITING_MEMBERS"),
  members: z.array(roomMemberSchema),
  membersReadyState: z.record(z.literal(true)),
  timeLimitSeconds: z.number(),
  questionCount: z.number(),
});

export type InvitingMembersFlowRoom = z.infer<
  typeof invitingMembersFlowRoomSchema
>;

// memberAnswerMap[userId][questionIndex] = answeredPrice;
export const memberAnswerMapSchema = z.record(z.record(z.number().int()));

export type MemberAnswerMap = z.infer<typeof memberAnswerMapSchema>;

export const gameStartedFlowRoomSchema = z.object({
  status: z.literal("GAME_STARTED"),
  members: z.array(roomMemberSchema),
  timeLimitSeconds: z.number(),
  questionCount: z.number(),
  questions: z.array(gameQuestionSchema),
  memberAnswerMap: memberAnswerMapSchema,
});

export type GameStartedFlowRoom = z.infer<typeof gameStartedFlowRoomSchema>;
