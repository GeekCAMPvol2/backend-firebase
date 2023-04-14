import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

// https://qiita.com/tetradice/items/54054d799b155818b959

/** Zod custom schema for Firebase FieldValue */
export const firestoreFieldValueSchema = z.custom<FieldValue>(
  (data) => data instanceof FieldValue
);

/** Zod custom schema for Firebase Timestamp (except FieldValue) */
export const firestoreTimestampSchema = z.instanceof(Timestamp);

/** Zod custom schema for Firebase FieldValue or Timestamp */
export const firestoreTimestampLooseSchema = z.union([
  firestoreFieldValueSchema,
  firestoreTimestampSchema,
]);
