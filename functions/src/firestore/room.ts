import { z } from "zod";

import { firestore } from "../deps/firestore";

import type { Transaction as FirestoreTransaction } from "firebase-admin/firestore";

export const roomMemberSchema = z.object({
  userId: z.string(),
  playerName: z.string(),
});

export type RoomMember = z.infer<typeof roomMemberSchema>;

export const roomInvitingMembersStateSchema = z.object({
  status: z.literal("INVITING_MEMBERS"),
  members: z.array(roomMemberSchema),
  membersReadyState: z.record(z.literal(true)),
  timeLimit: z.number(),
  questionCount: z.number(),
});

export type RoomInvitingMembersState = z.infer<
  typeof roomInvitingMembersStateSchema
>;

export const createRoom = async (
  firstMember: RoomMember,
  timeLimit: number,
  questionCount: number
): Promise<{ roomId: string }> => {
  const roomState: RoomInvitingMembersState = {
    status: "INVITING_MEMBERS",
    members: [firstMember],
    membersReadyState: {},
    timeLimit: timeLimit,
    questionCount: questionCount,
  };

  const docRef = await firestore.collection("rooms").add(roomState);

  return { roomId: docRef.id };
};

const getRoomDocWithTransaction = async (
  roomId: string,
  transaction: FirestoreTransaction
) => {
  const roomDocRef = firestore.collection("rooms").doc(roomId);
  const roomDoc = await transaction.get(roomDocRef);
  if (!roomDoc.exists) throw Error("The specified room does not exist");
  return roomDoc;
};

export const joinRoom = async (
  roomId: string,
  member: RoomMember
): Promise<void> => {
  await firestore.runTransaction(async (tx) => {
    const roomDoc = await getRoomDocWithTransaction(roomId, tx);

    // 部屋がメンバー募集中状態であることを確認
    const roomState = roomInvitingMembersStateSchema.parse(roomDoc.data());

    tx.update(roomDoc.ref, {
      members: [...roomState.members, member],
    } satisfies Partial<RoomInvitingMembersState>);
  });
};

export const leaveRoom = async (
  roomId: string,
  userId: string
): Promise<void> => {
  await firestore.runTransaction(async (tx) => {
    const roomDoc = await getRoomDocWithTransaction(roomId, tx);

    // 部屋がメンバー募集中状態であることを確認
    const roomState = roomInvitingMembersStateSchema.parse(roomDoc.data());

    const members = roomState.members.filter(
      (member) => member.userId !== userId
    );

    const membersReadyState = { ...roomState.membersReadyState };
    delete membersReadyState[roomId];

    tx.update(roomDoc.ref, {
      members,
      membersReadyState,
    } satisfies Partial<RoomInvitingMembersState>);
  });
};
