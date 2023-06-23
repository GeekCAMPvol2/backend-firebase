import * as functions from "firebase-functions";
import { z } from "zod";

import {
  EndpointResponseBody,
  fetchRawProductDetails,
} from "../deps/fetchProductDetails";

const getSoloQuestionsParamsSchema = z.object({
  count: z.number().int(),
});

type GetSoloQuestionsResponse =
  | GetSoloQuestionsSuccessResponse
  | GetSoloQuestionsErrorResponse;

type GetSoloQuestionsSuccessResponse = {
  success: true;
  questions: EndpointResponseBody;
};

type GetSoloQuestionsErrorResponse = {
  success: false;
  error: string;
};

export const getSoloQuestions = functions.https.onCall(
  async (data: unknown): Promise<GetSoloQuestionsResponse> => {
    try {
      const { count } = getSoloQuestionsParamsSchema.parse(data);
      const payload = await fetchRawProductDetails(count);
      return { success: true, questions: payload };
    } catch (e) {
      return { success: false, error: "Internal server error" };
    }
  }
);
