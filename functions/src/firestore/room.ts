import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { firestore } from "../deps/firestore";
import { firestoreTimestampLooseSchema } from "../schemas/firebase";

import type { Transaction as FirestoreTransaction } from "firebase-admin/firestore";

// room入室用
export const roomMemberSchema = z.object({
  userId: z.string(),
  playerName: z.string(),
});

export type RoomMember = z.infer<typeof roomMemberSchema>;

// 募集中のroomスキーマ
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

const getRoomDocRefById = (roomId: string) =>
  firestore.collection("rooms").doc(roomId);

const getRoomDocWithTransaction = async (
  roomId: string,
  transaction: FirestoreTransaction
) => {
  const roomDocRef = getRoomDocRefById(roomId);
  const roomDoc = await transaction.get(roomDocRef);
  if (!roomDoc.exists) throw Error("The specified room does not exist");
  return roomDoc;
};

// const getRoomDocWithTransactionFindUserId = async (
//   userId: string,
//   transaction: FirestoreTransaction
// ) => {
//   const roomDocRef = firestore
//     .collection("rooms/{id}")
//     .where("members", "==", userId);
//   const roomDoc = await transaction.get(roomDocRef);
//   if (!roomDoc.empty) throw Error("This room is already dissolved");
//   return roomDoc;
// };

export const joinRoom = async (
  roomId: string,
  member: RoomMember
): Promise<void> => {
  await firestore.runTransaction(async (tx) => {
    const roomDoc = await getRoomDocWithTransaction(roomId, tx);

    // 部屋がメンバー募集中状態であることを確認
    const roomState = roomInvitingMembersStateSchema.parse(roomDoc.data());

    await tx.update(roomDoc.ref, {
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

    await tx.update(roomDoc.ref, {
      members,
      membersReadyState,
    } satisfies Partial<RoomInvitingMembersState>);
  });
};

export const setMemberReadyState = async (
  roomId: string,
  userId: string,
  ready: boolean
): Promise<void> => {
  await firestore.runTransaction(async (tx) => {
    const roomDoc = await getRoomDocWithTransaction(roomId, tx);

    // 部屋がメンバー募集中状態であることを確認
    const roomState = roomInvitingMembersStateSchema.parse(roomDoc.data());

    const memberIndex = roomState.members.findIndex(
      (member) => member.userId === userId
    );
    if (memberIndex < 0) throw Error("You are not joined specified room");

    const membersReadyState = { ...roomState.membersReadyState };

    // typeof membersReadyState == { [ userId ]: true }
    if (ready) {
      membersReadyState[userId] = true;
    } else {
      delete membersReadyState[userId];
    }

    await tx.update(roomDoc.ref, {
      membersReadyState,
    } satisfies Partial<RoomInvitingMembersState>);
  });
};

export const presentedQuestionSchema = z.object({
  presentedAt: firestoreTimestampLooseSchema,
  productTitle: z.string(),
  productPrice: z.number(),
});

type PresentedQuestion = z.infer<typeof presentedQuestionSchema>;

export const roomPlayingStateSchema = z.object({
  status: z.literal("PLAYING"),
  members: z.array(roomMemberSchema),
  timeLimit: z.number(),
  questionCount: z.number(),
  presentedQuestions: z.array(presentedQuestionSchema),
});

export type RoomPlayingMembersState = z.infer<typeof roomPlayingStateSchema>;

export const transisionToRoomPlayingState = async (
  roomId: string,
  roomState: RoomInvitingMembersState,
  transaction: FirestoreTransaction
) => {
  const inheritProps = (({ members, timeLimit, questionCount }) => ({
    members,
    timeLimit,
    questionCount,
  }))(roomState) satisfies Partial<RoomInvitingMembersState>;

  const presentedAtMillis = Date.now() + 3000;

  const firstQuestion: PresentedQuestion = {
    presentedAt: FirestoreTimestamp.fromMillis(presentedAtMillis),
    productTitle: "Test Product 0",
    productPrice: 1000,
  };

  const nextRoomState: RoomPlayingMembersState = {
    status: "PLAYING",
    ...inheritProps,
    presentedQuestions: [firstQuestion],
  };

  await transaction.set(getRoomDocRefById(roomId), nextRoomState);
};
