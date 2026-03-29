/**
 * `safeImageUrl`（display:safe_image の実体）の URL を用途別に粗分類する。
 * 見た目診断・レポート用（厳密な CDN 判定ではない）。
 */

import { isOliveYoungStyleProductImageUrl } from "@/lib/product-display-image-resolve";

function isMarketplaceHostUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("amazon.") ||
    u.includes("media-amazon") ||
    u.includes("ssl-images-amazon") ||
    u.includes("rakuten.") ||
    u.includes("qoo10") ||
    u.includes("qoo-img.com")
  );
}

/** プレースホルダー・欠損に近い URL */
export function isPlaceholderLikeImageUrl(url: string): boolean {
  const u = url.toLowerCase().trim();
  if (!u) return true;
  return (
    u.includes("oliveyoung-product-placeholder") ||
    u.includes("/images/no-image") ||
    u.includes("no-image.png") ||
    u.includes("placeholder") ||
    u.startsWith("data:") ||
    /\/1x1[^a-z0-9]/i.test(u)
  );
}

/**
 * - `vision_safe_non_mall`: Amazon/楽天/Qoo10 CDN 以外の URL（resolve と同じ「OY 系クロール」判定）
 * - `vision_safe_mall_url`: safe 欄にモール CDN（データ不整合の可能性）
 * - `placeholder_like`: プレースホルダー寄り
 */
export type SafeImageUrlKind =
  | "vision_safe_non_mall"
  | "vision_safe_mall_url"
  | "placeholder_like";

export function classifySafeImageUrl(url: string): SafeImageUrlKind {
  const t = (url ?? "").trim();
  if (isPlaceholderLikeImageUrl(t)) return "placeholder_like";
  if (isMarketplaceHostUrl(t)) return "vision_safe_mall_url";
  if (isOliveYoungStyleProductImageUrl(t)) return "vision_safe_non_mall";
  return "vision_safe_non_mall";
}

export function safeImageUrlKindDescriptionJa(kind: SafeImageUrlKind): string {
  switch (kind) {
    case "vision_safe_non_mall":
      return "モールCDN以外の実URL（Vision が人物なしで選んだ safe。通常はOY公式画像）";
    case "vision_safe_mall_url":
      return "モール系ホストが safeImageUrl に入っている（要確認）";
    case "placeholder_like":
      return "プレースホルダー寄り・空に近い";
  }
}
