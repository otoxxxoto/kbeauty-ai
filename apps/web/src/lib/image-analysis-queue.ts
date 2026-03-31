/**
 * 人物判定（Vision）バッチ向け: 商品に紐づく画像 URL のうち、
 * `imageAnalysis` にまだ無いものを優先順で列挙する。
 */

import {
  imageAnalysisEntryForProductUrl,
  isOliveYoungStyleProductImageUrl,
  type ProductImageFields,
} from "@/lib/product-display-image-resolve";

function trimUrl(u?: string): string {
  return (u ?? "").trim();
}

/** Firestore / 表示と同じフィールド名で記録（imageUrls 配列由来は `imageUrls`） */
export type ImageQueueSourceField =
  | "imageUrl"
  | "thumbnailUrl"
  | "imageUrls"
  | "oliveYoungImageUrl"
  | "amazonImageUrl"
  | "amazonImage"
  | "rakutenImageUrl"
  | "rakutenImage"
  | "qoo10ImageUrl"
  | "qoo10Image";

export type ImageQueueEntry = {
  url: string;
  sourceField: ImageQueueSourceField;
};

/**
 * 解析キューに載せる候補 URL（重複除去・優先順・各 URL の出自フィールド付き）。
 * 1. OY 公式系（imageUrl / thumbnailUrl / imageUrls・モール CDN は除外）
 * 2. oliveYoungImageUrl
 * 3. Amazon / 楽天 / Qoo10（明示 URL → 従来フィールド）
 */
export function collectProductImageUrlsForAnalysisQueueWithSource(
  p: ProductImageFields
): ImageQueueEntry[] {
  const seen = new Set<string>();
  const out: ImageQueueEntry[] = [];

  const pushOy = (u: string | undefined, sourceField: ImageQueueSourceField) => {
    const t = trimUrl(u);
    if (!t || seen.has(t)) return;
    if (!isOliveYoungStyleProductImageUrl(t)) return;
    seen.add(t);
    out.push({ url: t, sourceField });
  };

  const pushAny = (u: string | undefined, sourceField: ImageQueueSourceField) => {
    const t = trimUrl(u);
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ url: t, sourceField });
  };

  pushOy(p.imageUrl, "imageUrl");
  pushOy(p.thumbnailUrl, "thumbnailUrl");
  for (const x of p.imageUrls ?? []) {
    if (typeof x === "string") pushOy(x, "imageUrls");
  }

  pushAny(p.oliveYoungImageUrl, "oliveYoungImageUrl");
  pushAny(p.amazonImageUrl, "amazonImageUrl");
  pushAny(p.amazonImage, "amazonImage");
  pushAny(p.rakutenImageUrl, "rakutenImageUrl");
  pushAny(p.rakutenImage, "rakutenImage");
  pushAny(p.qoo10ImageUrl, "qoo10ImageUrl");
  pushAny(p.qoo10Image, "qoo10Image");

  return out;
}

export function collectProductImageUrlsForAnalysisQueue(
  p: ProductImageFields
): string[] {
  return collectProductImageUrlsForAnalysisQueueWithSource(p).map((e) => e.url);
}

/** `imageAnalysis` に同一 URL の行が無いものだけ（キュー順のまま） */
export function getUnanalyzedImageUrlsPrioritized(
  p: ProductImageFields
): string[] {
  return collectProductImageUrlsForAnalysisQueueWithSource(p)
    .filter((e) => !imageAnalysisEntryForProductUrl(p, e.url))
    .map((e) => e.url);
}

export function getUnanalyzedImageEntriesPrioritized(
  p: ProductImageFields
): ImageQueueEntry[] {
  return collectProductImageUrlsForAnalysisQueueWithSource(p).filter(
    (e) => !imageAnalysisEntryForProductUrl(p, e.url)
  );
}

/** 1 URL = 1 行。人物判定バッチの入力形式用（stdout は NDJSON のみ） */
export type VisionBatchImageLine = {
  goodsNo: string;
  rank: number;
  url: string;
  sourceField: ImageQueueSourceField;
};
