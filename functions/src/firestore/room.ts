import { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { fetchProductDetails } from "../deps/fetchProductDetails";
import { firestore } from "../deps/firestore";
import { firestoreTimestampLooseSchema } from "../schemas/firebase";

import type { Transaction as FirestoreTransaction } from "firebase-admin/firestore";

const GAME_WAITING_NEXT_QUESTION_MILLIS = 10_000;

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

export const createAndSaveRoom = async (
  firstMember: RoomMember,
  timeLimit: number,
  questionCount: number
): Promise<{ roomId: string }> => {
  const roomState: RoomInvitingMembersState = {
    status: "INVITING_MEMBERS",
    members: [firstMember],
    membersReadyState: {},
    timeLimit,
    questionCount,
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

export const saveUserJoinRoom = async (
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

export const saveUserLeaveRoom = async (
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

export const saveMemberReadyState = async (
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

    const isAllMemberReady = roomState.members.reduce(
      (prev, member) => prev && membersReadyState[member.userId],
      true
    );

    if (isAllMemberReady) {
      const nextState = await createRoomGameStartedState(roomState);
      tx.set(getRoomDocRefById(roomId), nextState);
    } else {
      tx.update(roomDoc.ref, {
        membersReadyState,
      } satisfies Partial<RoomInvitingMembersState>);
    }
  });
};

export const gameQuestionSchema = z.object({
  presentedAt: firestoreTimestampLooseSchema,
  productTitle: z.string(),
  productPrice: z.number(),
});

type GameQuestion = z.infer<typeof gameQuestionSchema>;

// memberAnswerMap[userId][questionIndex] = answeredPrice;
export const memberAnswerMapSchema = z.record(z.record(z.number().int()));

export type MemberAnswerMap = z.infer<typeof memberAnswerMapSchema>;

export const roomGameStartedStateSchema = z.object({
  status: z.literal("GAME_STARTED"),
  members: z.array(roomMemberSchema),
  timeLimit: z.number(),
  questionCount: z.number(),
  questions: z.array(gameQuestionSchema),
  memberAnswerMap: memberAnswerMapSchema,
});

export type RoomGameStartedState = z.infer<typeof roomGameStartedStateSchema>;

const createRoomGameStartedState = async (
  roomState: RoomInvitingMembersState
): Promise<RoomGameStartedState> => {
  const inheritProps = (({ members, timeLimit, questionCount }) => ({
    members,
    timeLimit,
    questionCount,
  }))(roomState) satisfies Partial<RoomInvitingMembersState>;

  const { products } = await fetchProductDetails({ count: 5 });
  const now = Date.now();

  const questionIntervalSeconds =
    roomState.timeLimit + GAME_WAITING_NEXT_QUESTION_MILLIS;

  const questions: GameQuestion[] = products.map((p, i) => ({
    presentedAt: FirestoreTimestamp.fromMillis(
      now + questionIntervalSeconds * 1000 * i
    ),
    productTitle: p.title,
    productPrice: p.price,
  }));

  return {
    status: "GAME_STARTED",
    ...inheritProps,
    questions,
    memberAnswerMap: {},
  };
};

export const saveMemberAnswer = async (
  roomId: string,
  userId: string,
  questionIndex: number,
  answeredPrice: number
): Promise<void> => {
  await firestore.runTransaction(async (tx) => {
    if (answeredPrice === Math.floor(answeredPrice)) {
      throw Error("answeredPrice must be integer");
    }

    const roomDoc = await getRoomDocWithTransaction(roomId, tx);

    // 部屋がゲーム開始後状態であることを確認
    const roomState = roomGameStartedStateSchema.parse(roomDoc.data());

    const memberIndex = roomState.members.findIndex(
      (member) => member.userId === userId
    );
    if (memberIndex < 0) throw Error("You are not joined specified room");

    const question = roomState.questions[questionIndex];
    if (question == null) throw Error("questionIndex is out of range");

    const now = Date.now();
    const presentedAtMillis = (
      question.presentedAt as FirestoreTimestamp
    ).toMillis();
    const closedAtMillis = presentedAtMillis + roomState.timeLimit * 1000;
    if (now < presentedAtMillis || now > closedAtMillis)
      throw Error("specified question is not current");

    tx.update(roomDoc.ref, {
      [`memberAnswerMap.${userId}.${questionIndex}`]: answeredPrice,
    });
  });
};
