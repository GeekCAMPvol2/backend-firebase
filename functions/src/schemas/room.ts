import { z } from "zod";

import { clientSceneScheduleSchema } from "./clientScene";

export const roomMemberSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
});

export type RoomMember = z.infer<typeof roomMemberSchema>;

// 募集中のroomスキーマ
export const roomInInvitingMembersSchema = z.object({
  status: z.literal("INVITING_MEMBERS"),
  members: z.array(roomMemberSchema),
  membersReadyState: z.record(z.literal(true)),
  timeLimitSeconds: z.number(),
  questionCount: z.number(),
  clientSceneSchedules: z.array(clientSceneScheduleSchema),
});

export type RoomInInvitingMembers = z.infer<typeof roomInInvitingMembersSchema>;

export const questionSchema = z.object({
  productTitle: z.string(),
  productPrice: z.number(),
  productImageUrl: z.string(),
  productLinkUrl: z.string(),
});

export type Question = z.infer<typeof questionSchema>;

// PlayerQuestionAnswerTable[userId][questionIndex] = answeredPrice;
export const playerQuestionAnswerTableSchema = z.record(
  z.array(z.number().int())
);

export type PlayerQuestionAnswerTable = z.infer<
  typeof playerQuestionAnswerTableSchema
>;

export const roomInGameStartedSchema = z.object({
  status: z.literal("GAME_STARTED"),
  members: z.array(roomMemberSchema),
  timeLimitSeconds: z.number(),
  questionCount: z.number(),
  questions: z.array(questionSchema),
  playerQuestionAnswerTable: playerQuestionAnswerTableSchema,
  clientSceneSchedules: z.array(clientSceneScheduleSchema),
});

export type RoomInGameStarted = z.infer<typeof roomInGameStartedSchema>;

export const roomSchema = z.union([
  roomInInvitingMembersSchema,
  roomInGameStartedSchema,
]);

export type Room = z.infer<typeof roomSchema>;
