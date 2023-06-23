import { z } from "zod";

import { firestoreTimestampSchema } from "./firebase";

// import { firestoreTimestampSchema } from "@/types/firestoreSchemas";

export const clientSceneLobbySchema = z.object({
  kind: z.literal("LOBBY"),
});

export type ClientSceneLobby = z.infer<typeof clientSceneLobbySchema>;

export const clientSceneQuizSubmitSchema = z.object({
  kind: z.literal("QUIZ_SUBMIT"),
  currentQuestionIndex: z.number().int(),
});

export type ClientSceneQuizSubmit = z.infer<typeof clientSceneQuizSubmitSchema>;

export const clientSceneQuizAnswerSchema = z.object({
  kind: z.literal("QUIZ_ANSWER"),
  currentQuestionIndex: z.number().int(),
});

export type ClientSceneQuizAnswer = z.infer<typeof clientSceneQuizAnswerSchema>;

export const clientSceneGameResultSchema = z.object({
  kind: z.literal("GAME_RESULT"),
});

export type ClientSceneGameResult = z.infer<typeof clientSceneGameResultSchema>;

export const clientSceneSchema = z.union([
  clientSceneLobbySchema,
  clientSceneQuizSubmitSchema,
  clientSceneQuizAnswerSchema,
  clientSceneGameResultSchema,
]);

export type ClientScene = z.infer<typeof clientSceneSchema>;

export const clientSceneScheduleSchema = z.object({
  scene: clientSceneSchema,
  startDate: firestoreTimestampSchema,
});

export type ClientSceneSchedule = z.infer<typeof clientSceneScheduleSchema>;
