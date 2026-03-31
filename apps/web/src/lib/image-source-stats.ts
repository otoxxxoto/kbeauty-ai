/**
 * 表示パイプライン由来の imageSource を、集計用 6 バケットに正規化する。
 * 開発時の console 集計・スクリプトで共有。
 */

import { resolveProductImageForDisplay } from "@/lib/getProductImage";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import type { ProductImageFields } from "@/lib/product-display-image-resolve";

export type ImageSourceStatBucket =
  | "display:safe_image"
  | "amazon"
  | "rakuten"
  | "qoo10"
  | "oliveyoung"
  | "fallback_no_image";

export const IMAGE_SOURCE_STAT_BUCKETS: ImageSourceStatBucket[] = [
  "display:safe_image",
  "amazon",
  "rakuten",
  "qoo10",
  "oliveyoung",
  "fallback_no_image",
];

export function emptyImageSourceStatCounts(): Record<
  ImageSourceStatBucket,
  number
> {
  return {
    "display:safe_image": 0,
    amazon: 0,
    rakuten: 0,
    qoo10: 0,
    oliveyoung: 0,
    fallback_no_image: 0,
  };
}

/**
 * `resolveProductImageForDisplay` の `imageSource` と最終 URL から集計キーへ寄せる。
 */
export function classifyImageSourceForStats(
  imageSource: string,
  finalUrl: string
): ImageSourceStatBucket {
  if (imageSource === "manual_image") return "display:safe_image";
  if (imageSource === "fallback_no_image") return "fallback_no_image";
  if (imageSource === "amazon") return "amazon";
  if (imageSource === "rakuten") return "rakuten";
  if (imageSource === "qoo10") return "qoo10";
  if (imageSource === "oliveyoung") return "oliveyoung";
  if (imageSource === "display:safe_image") return "display:safe_image";
  if (imageSource === "display:oy_official_safe") return "oliveyoung";
  if (imageSource === "display:marketplace_strong") {
    const u = finalUrl.toLowerCase();
    if (
      u.includes("amazon") ||
      u.includes("media-amazon") ||
      u.includes("ssl-images-amazon")
    ) {
      return "amazon";
    }
    if (u.includes("rakuten")) return "rakuten";
    if (u.includes("qoo10") || u.includes("qoo-img")) return "qoo10";
    return "oliveyoung";
  }
  if (imageSource === "display:fallback_placeholder") {
    return "fallback_no_image";
  }
  return "oliveyoung";
}

export function imageSourceStatBucketForProductRecord(
  p: ProductImageFields & { goodsNo?: string }
): ImageSourceStatBucket {
  const plain = serializeProductImageFieldsForClient(p);
  const pipe = resolveProductImageForDisplay(plain, { goodsNo: p.goodsNo });
  return classifyImageSourceForStats(pipe.imageSource, pipe.url);
}

export function tallyImageSourcesForProducts(
  products: Array<ProductImageFields & { goodsNo?: string }>
): Record<ImageSourceStatBucket, number> {
  const out = emptyImageSourceStatCounts();
  for (const p of products) {
    out[imageSourceStatBucketForProductRecord(p)] += 1;
  }
  return out;
}

export type RelatedLike = {
  byBrand: Array<ProductImageFields & { goodsNo?: string }>;
  byCategory: Array<ProductImageFields & { goodsNo?: string }>;
  byRank: Array<ProductImageFields & { goodsNo?: string }>;
};

/** 関連商品 3 ブロックを goodsNo で重複除去してから集計 */
export function tallyImageSourcesForRelatedGroups(
  related: RelatedLike
): Record<ImageSourceStatBucket, number> {
  const seen = new Set<string>();
  const flat: Array<ProductImageFields & { goodsNo?: string }> = [];
  for (const p of [
    ...related.byBrand,
    ...related.byCategory,
    ...related.byRank,
  ]) {
    const id = (p.goodsNo ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    flat.push(p);
  }
  return tallyImageSourcesForProducts(flat);
}

export function shouldLogImageSourceStats(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.IMAGE_SOURCE_STATS === "1"
  );
}

export function dominantImageSourceBucket(
  counts: Record<ImageSourceStatBucket, number>
): ImageSourceStatBucket | null {
  let best: ImageSourceStatBucket | null = null;
  let max = -1;
  for (const k of IMAGE_SOURCE_STAT_BUCKETS) {
    const n = counts[k];
    if (n > max) {
      max = n;
      best = k;
    }
  }
  return max <= 0 ? null : best;
}

/**
 * `development` または `IMAGE_SOURCE_STATS=1` のときだけ console に出す。
 */
export function logImageSourceStatsIfEnabled(
  label: string,
  counts: Record<ImageSourceStatBucket, number>
): void {
  if (!shouldLogImageSourceStats()) return;
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const top = dominantImageSourceBucket(counts);
  // eslint-disable-next-line no-console -- 開発・明示フラグ時のみ
  console.log(`[IMAGE_SOURCE_STATS] ${label}`, {
    total,
    counts,
    dominant: top,
    fallback_no_image: counts.fallback_no_image,
  });
}

/**
 * ランキング一覧の並び: **実際にカードに出る画像**のバケットで加点する。
 * - モール実画像（amazon / rakuten / qoo10）を最優先
 * - display:safe_image は信頼できる実写だがモールより一段低め（差は小さめで順位を壊しにくい）
 * - fallback_no_image は減点
 */
export function rankingVisualBoostForDisplayedBucket(
  bucket: ImageSourceStatBucket
): number {
  switch (bucket) {
    case "amazon":
      return 102;
    case "rakuten":
    case "qoo10":
      return 84;
    case "display:safe_image":
      return 72;
    case "oliveyoung":
      return 64;
    case "fallback_no_image":
      return -58;
  }
}
