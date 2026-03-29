import type { ProductImagePickResult } from "@/lib/product-marketplace-types";
import type { ProductDisplayImageSource } from "@/lib/product-display-image-resolve";
import {
  resolveProductDisplayImage,
  productDisplayImageIsPlaceholder,
  type ProductImageFields,
} from "@/lib/product-display-image-resolve";

/** プレースホルダー（public 配下。無い場合はビルド後に配置可能） */
export const PRODUCT_NO_IMAGE_PATH = "/images/no-image.png";

export type ProductImageInput = {
  /** `NEXT_PUBLIC_IMAGE_SOURCE_DEBUG=1` 時に console へ出す用 */
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

  if (
    process.env.NEXT_PUBLIC_IMAGE_SOURCE_DEBUG === "1" &&
    (goodsNo || result.imageSource !== "fallback_no_image")
  ) {
    // eslint-disable-next-line no-console -- 明示デバッグフラグ時のみ
    console.log("IMAGE_SOURCE", { goodsNo, imageSource: result.imageSource });
  }

  return result;
}

export function isProductImagePickFallbackNoImage(
  pickResult: ProductImagePickResult
): boolean {
  return pickResult.imageSource === "fallback_no_image";
}

export function buildGetProductImageInputFromFields(
  p: ProductImageFields,
  goodsNo?: string
): ProductImageInput {
  const gid = goodsNo != null ? String(goodsNo).trim() : "";
  return {
    goodsNo: gid || undefined,
    oliveYoungImageUrl: pick(p.oliveYoungImageUrl),
    amazonImageUrl: pick(p.amazonImageUrl),
    amazonImage: pick(p.amazonImage),
    rakutenImageUrl: pick(p.rakutenImageUrl),
    rakutenImage: pick(p.rakutenImage),
    qoo10ImageUrl: pick(p.qoo10ImageUrl),
    qoo10Image: pick(p.qoo10Image),
    imageUrl: pick(p.imageUrl),
    thumbnailUrl: pick(p.thumbnailUrl),
  };
}

export type ProductDisplayPipelineResult = {
  url: string;
  /** 最終表示に効いたソース（display:* または amazon|rakuten|…） */
  imageSource: string;
  displaySource: ProductDisplayImageSource;
  showOfficialImageBadge: boolean;
};

/**
 * まず resolveProductDisplayImage（Vision / safe / strong）、
 * プレースホルダーのときだけ getProductImage でモール URL をフォールバック。
 */
export function resolveProductImageForDisplay(
  plain: ProductImageFields,
  options?: { goodsNo?: string }
): ProductDisplayPipelineResult {
  const resolved = resolveProductDisplayImage(plain);
  const placeholder = productDisplayImageIsPlaceholder(resolved.url);

  let url = resolved.url;
  let imageSource = `display:${resolved.source}`;
  let showOfficialImageBadge =
    resolved.showOfficialImageBadge && !placeholder;

  if (placeholder) {
    const gp = getProductImage(
      buildGetProductImageInputFromFields(plain, options?.goodsNo)
    );
    if (gp.imageSource !== "fallback_no_image") {
      url = gp.url;
      imageSource = gp.imageSource;
      showOfficialImageBadge = false;
    }
  }

  return {
    url,
    imageSource,
    displaySource: resolved.source,
    showOfficialImageBadge,
  };
}

/** 表示 URL が OY プレースホルダーまたは no-image 相当か */
export function isResolvedProductImagePlaceholderUrl(url: string): boolean {
  const t = (url ?? "").trim();
  return (
    productDisplayImageIsPlaceholder(t) ||
    t === PRODUCT_NO_IMAGE_PATH ||
    t.endsWith("/images/no-image.png")
  );
}
