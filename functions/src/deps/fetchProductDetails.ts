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

const endpointResponseBodySchema = z.array(
  z.object({
    quiz: z.string(),
    answer: z.number().int(),
    images: z.array(z.object({ imageUrl: z.string() })),
    affiliatelink: z.string(),
  })
);

// type EndpointResponseBody = z.infer<typeof endpointResponseBodySchema>;

export const fetchProductDetails = async (
  params: FetchProductDetailParams
): Promise<FetchProductDetailsPayload> => {
  const q = new URLSearchParams({
    hits: `${params.count}`,
  });

  const res = await fetch(`${FETCH_PRODUCT_DETAILS_ENDPOINT}?${q}`);
  const payload = endpointResponseBodySchema.parse(await res.json());

  return {
    products: payload.map((el) => ({
      title: el.quiz,
      price: el.answer,
      images: el.images,
      affiliateLink: el.affiliatelink,
    })),
  };
};
