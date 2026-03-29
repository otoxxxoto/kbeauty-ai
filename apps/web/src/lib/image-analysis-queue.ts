/**
 * 人物判定（Vision）バッチ向け: 商品に紐づく画像 URL のうち、
 * `imageAnalysis` にまだ無いものを優先順で列挙する。
 */

import {
  collectOyOrderedImageUrls,
  imageAnalysisEntryForProductUrl,
  type ProductImageFields,
} from "@/lib/product-display-image-resolve";

function trimUrl(u?: string): string {
  return (u ?? "").trim();
}

/**
 * 解析キューに載せる候補 URL（重複除去・優先順）。
 * 1. OY 公式系（imageUrl / thumbnailUrl / imageUrls）
 * 2. oliveYoungImageUrl
 * 3. Amazon / 楽天 / Qoo10（明示 URL → 従来フィールド）
 */
export function collectProductImageUrlsForAnalysisQueue(
  p: ProductImageFields
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u?: string) => {
    const t = trimUrl(u);
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const u of collectOyOrderedImageUrls(p)) {
    push(u);
  }
  push(p.oliveYoungImageUrl);
  push(p.amazonImageUrl);
  push(p.amazonImage);
  push(p.rakutenImageUrl);
  push(p.rakutenImage);
  push(p.qoo10ImageUrl);
  push(p.qoo10Image);

  return out;
}

/** `imageAnalysis` に同一 URL の行が無いものだけ（キュー順のまま） */
export function getUnanalyzedImageUrlsPrioritized(
  p: ProductImageFields
): string[] {
  return collectProductImageUrlsForAnalysisQueue(p).filter(
    (u) => !imageAnalysisEntryForProductUrl(p, u)
  );
}

/** 1 URL = 1 行。人物判定バッチの入力形式用 */
export type VisionBatchImageLine = {
  goodsNo: string;
  rank: number;
  url: string;
};
