import type {
  ProductImagePickResult,
  ProductRevenueImageSource,
} from "@/lib/product-marketplace-types";

/** プレースホルダー（public 配下。無い場合はビルド後に配置可能） */
export const PRODUCT_NO_IMAGE_PATH = "/images/no-image.png";

export type ProductImageInput = {
  amazonImageUrl?: string;
  rakutenImageUrl?: string;
  qoo10ImageUrl?: string;
  oliveYoungImageUrl?: string;
  /** OY画像は URL があるときのみ oliveYoung 画像候補に使う */
  oliveYoungUrl?: string;
  /** 既存フィールドとの互換（amazonImageUrl 未設定時のフォールバック） */
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
};

function pick(u?: string): string | undefined {
  const t = u?.trim();
  return t || undefined;
}

/**
 * 収益・一覧用の画像優先順（シンプルなフォールバックチェーン）
 *
 * 1. amazonImageUrl（なければ amazonImage）
 * 2. rakutenImageUrl（なければ rakutenImage）
 * 3. qoo10ImageUrl（なければ qoo10Image）
 * 4. oliveYoungImageUrl または imageUrl / thumbnailUrl（oliveYoungUrl があるときのみ）
 * 5. /images/no-image.png
 */
export function getProductImage(input: ProductImageInput): ProductImagePickResult {
  const amazon = pick(input.amazonImageUrl) ?? pick(input.amazonImage);
  if (amazon) return { url: amazon, imageSource: "amazon" };

  const rakuten = pick(input.rakutenImageUrl) ?? pick(input.rakutenImage);
  if (rakuten) return { url: rakuten, imageSource: "rakuten" };

  const qoo10 = pick(input.qoo10ImageUrl) ?? pick(input.qoo10Image);
  if (qoo10) return { url: qoo10, imageSource: "qoo10" };

  const oyUrl = pick(input.oliveYoungUrl);
  if (oyUrl) {
    const oyImg =
      pick(input.oliveYoungImageUrl) ??
      pick(input.imageUrl) ??
      pick(input.thumbnailUrl);
    if (oyImg) return { url: oyImg, imageSource: "oliveyoung" };
  }

  return {
    url: PRODUCT_NO_IMAGE_PATH,
    imageSource: "fallback_no_image" as ProductRevenueImageSource,
  };
}
