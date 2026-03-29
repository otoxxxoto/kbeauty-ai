import type { ProductImagePickResult } from "@/lib/product-marketplace-types";
import type { ProductDisplayImageSource } from "@/lib/product-display-image-resolve";
import {
  resolveProductDisplayImage,
  productDisplayImageIsPlaceholder,
  imageAnalysisEntryForProductUrl,
  type ProductImageFields,
} from "@/lib/product-display-image-resolve";
import type { ProductRevenueImageSource } from "@/lib/product-marketplace-types";

/** プレースホルダー（public 配下。無い場合はビルド後に配置可能） */
export const PRODUCT_NO_IMAGE_PATH = "/images/no-image.png";

export type PublicImageDisplayPolicy =
  | "safe_person_free"
  | "unsafe_person_possible"
  | "mall_image"
  | "fallback_no_image";

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

function logImagePickDebug(
  goodsNo: string,
  result: ProductImagePickResult
): void {
  if (
    process.env.NEXT_PUBLIC_IMAGE_SOURCE_DEBUG === "1" &&
    (goodsNo || result.imageSource !== "fallback_no_image")
  ) {
    // eslint-disable-next-line no-console -- 明示デバッグフラグ時のみ
    console.log("IMAGE_SOURCE", { goodsNo, imageSource: result.imageSource });
  }
}

/**
 * 収益・バッチ向けの画像優先チェーン（人物判定なし）。
 * 公開カードでは `getProductImagePersonSafeFromFields` / `resolveProductImageForDisplay` を使うこと。
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

  logImagePickDebug(goodsNo, result);
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

/**
 * 公開面フォールバック用: `imageAnalysis` で URL 一致かつ `containsPerson===false` のものだけ採用。
 * 解析欠如の URL は使わない（保守的）。
 */
function tryPersonFreeUrl(
  p: ProductImageFields,
  url: string | undefined,
  source: ProductRevenueImageSource
): ProductImagePickResult | null {
  const u = pick(url);
  if (!u) return null;
  const entry = imageAnalysisEntryForProductUrl(p, u);
  if (!entry || entry.containsPerson) return null;
  return { url: u, imageSource: source };
}

export function getProductImagePersonSafeFromFields(
  p: ProductImageFields,
  goodsNo?: string
): ProductImagePickResult {
  const gid = goodsNo != null ? String(goodsNo).trim() : "";

  const attempts: Array<() => ProductImagePickResult | null> = [
    () => tryPersonFreeUrl(p, p.oliveYoungImageUrl, "oliveyoung"),
    () =>
      tryPersonFreeUrl(
        p,
        pick(p.amazonImageUrl) ?? pick(p.amazonImage),
        "amazon"
      ),
    () =>
      tryPersonFreeUrl(
        p,
        pick(p.rakutenImageUrl) ?? pick(p.rakutenImage),
        "rakuten"
      ),
    () =>
      tryPersonFreeUrl(
        p,
        pick(p.qoo10ImageUrl) ?? pick(p.qoo10Image),
        "qoo10"
      ),
    () => tryPersonFreeUrl(p, p.imageUrl, "oliveyoung"),
    () => tryPersonFreeUrl(p, p.thumbnailUrl, "oliveyoung"),
  ];

  for (const fn of attempts) {
    const r = fn();
    if (r) {
      logImagePickDebug(gid, r);
      return r;
    }
  }

  const fallback: ProductImagePickResult = {
    url: PRODUCT_NO_IMAGE_PATH,
    imageSource: "fallback_no_image",
  };
  logImagePickDebug(gid, fallback);
  return fallback;
}

export function computePublicImagePolicy(
  url: string,
  imageSource: string,
  displaySource: ProductDisplayImageSource,
  showOfficialImageBadge: boolean
): PublicImageDisplayPolicy {
  const t = (url ?? "").trim();
  if (
    productDisplayImageIsPlaceholder(t) ||
    t === PRODUCT_NO_IMAGE_PATH ||
    t.endsWith("/images/no-image.png") ||
    imageSource === "fallback_no_image"
  ) {
    return "fallback_no_image";
  }

  if (imageSource.startsWith("display:")) {
    if (displaySource === "safe_image") return "safe_person_free";
    if (displaySource === "oy_official_safe") {
      return showOfficialImageBadge
        ? "safe_person_free"
        : "unsafe_person_possible";
    }
    if (displaySource === "marketplace_strong") return "mall_image";
    return "fallback_no_image";
  }

  if (
    imageSource === "amazon" ||
    imageSource === "rakuten" ||
    imageSource === "qoo10"
  ) {
    return "mall_image";
  }
  if (imageSource === "oliveyoung") return "safe_person_free";

  return "fallback_no_image";
}

export type ProductDisplayPipelineResult = {
  url: string;
  /** 最終表示に効いたソース（display:* または amazon|rakuten|…） */
  imageSource: string;
  displaySource: ProductDisplayImageSource;
  showOfficialImageBadge: boolean;
  imagePolicy: PublicImageDisplayPolicy;
};

/**
 * まず resolveProductDisplayImage（Vision / safe / strong）、
 * プレースホルダーのときだけ人物なし検証済みモール URL をフォールバック。
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
    const gp = getProductImagePersonSafeFromFields(plain, options?.goodsNo);
    if (gp.imageSource !== "fallback_no_image") {
      url = gp.url;
      imageSource = gp.imageSource;
      showOfficialImageBadge = false;
    }
  }

  const imagePolicy = computePublicImagePolicy(
    url,
    imageSource,
    resolved.source,
    showOfficialImageBadge
  );

  return {
    url,
    imageSource,
    displaySource: resolved.source,
    showOfficialImageBadge,
    imagePolicy,
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
