import type { ProductImagePickResult } from "@/lib/product-marketplace-types";

/** プレースホルダー（public 配下。無い場合はビルド後に配置可能） */
export const PRODUCT_NO_IMAGE_PATH = "/images/no-image.png";

export type ProductImageInput = {
  /** デバッグ用。指定時のみ `IMAGE_SOURCE` を console に出す */
  goodsNo?: string;
  amazonImageUrl?: string;
  rakutenImageUrl?: string;
  qoo10ImageUrl?: string;
  oliveYoungImageUrl?: string;
  /** 後方互換・未使用（画像選択は oliveYoungUrl の有無に依存しない） */
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
 * 収益・一覧用の画像優先順（フォールバックチェーン）
 *
 * 1. oliveYoungImageUrl
 * 2. amazonImageUrl（なければ amazonImage）
 * 3. rakutenImageUrl（なければ rakutenImage）
 * 4. qoo10ImageUrl（なければ qoo10Image）
 * 5. imageUrl
 * 6. thumbnailUrl
 * 7. /images/no-image.png
 */
export function getProductImage(input: ProductImageInput): ProductImagePickResult {
  const goodsNo = pick(input.goodsNo) ?? "";

  const oyDedicated = pick(input.oliveYoungImageUrl);
  const amazon = pick(input.amazonImageUrl) ?? pick(input.amazonImage);
  const rakuten = pick(input.rakutenImageUrl) ?? pick(input.rakutenImage);
  const qoo10 = pick(input.qoo10ImageUrl) ?? pick(input.qoo10Image);
  const main = pick(input.imageUrl);
  const thumb = pick(input.thumbnailUrl);

  let result: ProductImagePickResult;
  if (oyDedicated) {
    result = { url: oyDedicated, imageSource: "oliveyoung" };
  } else if (amazon) {
    result = { url: amazon, imageSource: "amazon" };
  } else if (rakuten) {
    result = { url: rakuten, imageSource: "rakuten" };
  } else if (qoo10) {
    result = { url: qoo10, imageSource: "qoo10" };
  } else if (main) {
    result = { url: main, imageSource: "oliveyoung" };
  } else if (thumb) {
    result = { url: thumb, imageSource: "oliveyoung" };
  } else {
    result = {
      url: PRODUCT_NO_IMAGE_PATH,
      imageSource: "fallback_no_image",
    };
  }

  const { imageSource } = result;
  console.log("IMAGE_SOURCE", { goodsNo, imageSource });

  return result;
}
