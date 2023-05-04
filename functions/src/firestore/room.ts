import { firestore } from "../deps/firestore";

import type { Transaction as FirestoreTransaction } from "firebase-admin/firestore";

const getRoomDocRefById = (roomId: string) =>
  firestore.collection("rooms").doc(roomId);

export const getRoomDocWithTransaction = async (
  roomId: string,
  transaction: FirestoreTransaction
) => {
  const roomDocRef = getRoomDocRefById(roomId);
  const roomDoc = await transaction.get(roomDocRef);
  if (!roomDoc.exists) return undefined;
  return roomDoc;
};
