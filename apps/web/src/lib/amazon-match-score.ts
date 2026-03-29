/**
 * Amazon 候補照合スコア（0–100）。Creators API / PA-API 5 の応答と突き合わせる想定。
 */

export const AMAZON_MATCH_SCORE_MIN = 0;
export const AMAZON_MATCH_SCORE_MAX = 100;

export type AmazonMatchScoreComponents = {
  titleSimilarity: number;
  brandSimilarity: number;
  volumeSimilarity: number;
};

/**
 * 構造化シグナルから総合スコアを合成（実 API 接続時に重み調整）。
 * 現状はプレースホルダー。
 */
export function combineAmazonMatchScore(
  c: Partial<AmazonMatchScoreComponents>
): number {
  const t = c.titleSimilarity ?? 0;
  const b = c.brandSimilarity ?? 0;
  const v = c.volumeSimilarity ?? 0;
  const raw = (t + b + v) / 3;
  return Math.max(
    AMAZON_MATCH_SCORE_MIN,
    Math.min(AMAZON_MATCH_SCORE_MAX, Math.round(raw))
  );
}

export function clampAmazonMatchScore(n: number): number {
  if (!Number.isFinite(n)) return AMAZON_MATCH_SCORE_MIN;
  return Math.max(
    AMAZON_MATCH_SCORE_MIN,
    Math.min(AMAZON_MATCH_SCORE_MAX, n)
  );
}

/** 商品名から容量表記を抜き出す（PA-API 照合の volumeText 用） */
export function extractVolumeHintFromProductName(
  name: string
): string | undefined {
  const m = name.match(
    /(\d+(?:[.,]\d+)?\s*(?:ml|mL|ML|g|G|枚|本|個|セット|Set|SET)(?:\s*\([^)]*\))?)/u
  );
  return m ? m[1].replace(/\s+/g, " ").trim() : undefined;
}

/**
 * Amazon 返却タイトルとクエリの簡易一致度（0–100）。
 * PA-API 候補の採否に利用。
 */
export function scoreAmazonTitleMatch(
  query: { name: string; brand?: string; volumeText?: string },
  amazonTitle: string
): number {
  const t = amazonTitle.toLowerCase();
  const brand = (query.brand ?? "").trim().toLowerCase();
  let score = 0;
  if (brand && t.includes(brand)) score += 32;
  const name = query.name.trim().toLowerCase();
  const tokens = name.split(/[\s・／/]+/).filter((w) => w.length >= 2);
  const hits = tokens.filter((w) => t.includes(w)).length;
  if (tokens.length > 0) {
    score += Math.round((hits / tokens.length) * 48);
  }
  const vol = (query.volumeText ?? "").trim().toLowerCase();
  if (vol && t.includes(vol)) score += 20;
  return clampAmazonMatchScore(score);
}
