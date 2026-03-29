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
