import { z } from "zod";

const FETCH_PRODUCT_DETAILS_ENDPOINT = "https://seaffood.com/quizlake";

export type FetchProductDetailParams = { count: number };

export type ProductDetail = {
  title: string;
  price: number;
  images: { imageUrl: string }[];
  affiliateLink: string;
};

export type FetchProductDetailsPayload = { products: ProductDetail[] };

export const endpointResponseBodySchema = z.array(
  z.object({
    quiz: z.string(),
    answer: z.number().int(),
    images: z.array(z.object({ imageUrl: z.string() })),
    affiliatelink: z.string(),
  })
);

export type EndpointResponseBody = z.infer<typeof endpointResponseBodySchema>;

const fetchAndParseEndpoint = async (): Promise<EndpointResponseBody> => {
  const q = new URLSearchParams({
    hits: "1",
  });
  const response = await fetch(`${FETCH_PRODUCT_DETAILS_ENDPOINT}?${q}`);
  const payload = endpointResponseBodySchema.parse(await response.json());
  return payload;
};

export const fetchRawProductDetails = async (
  count: number
): Promise<EndpointResponseBody> => {
  const responses = Array.from({ length: count }, () =>
    fetchAndParseEndpoint()
  );
  const payloads = await Promise.all(responses);
  const flatten = payloads.flat();
  return flatten;
};

export const fetchProductDetails = async (
  params: FetchProductDetailParams
): Promise<FetchProductDetailsPayload> => {
  const payload = await fetchRawProductDetails(params.count);

  return {
    products: payload.map((el) => ({
      title: el.quiz,
      price: el.answer,
      images: el.images,
      affiliateLink: el.affiliatelink,
    })),
  };
};
