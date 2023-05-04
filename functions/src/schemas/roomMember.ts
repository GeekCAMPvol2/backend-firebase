import { z } from "zod";

export const roomMemberSchema = z.object({
  userId: z.string(),
  playerName: z.string(),
});

export type RoomMember = z.infer<typeof roomMemberSchema>;
