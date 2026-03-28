import type { MarketScoreBreakdown } from "@/lib/product-marketplace-types";
import {
  getDisplayProductNameText,
  looksLikeOliveYoungGoodsNo,
  PRODUCT_TITLE_PENDING_JA,
} from "@/lib/oliveyoung-display";

export type MarketScoreInput = {
  rank?: number | null;
  /** 急上昇幅（正のとき加点） */
  movement?: number | null;
  isNew?: boolean;
  amazonImageUrl?: string;
  rakutenImageUrl?: string;
  qoo10ImageUrl?: string;
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  oliveYoungImageUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  oliveYoungUrl?: string;
  productUrl?: string;
  amazonUrl?: string;
  qoo10Url?: string;
  rakutenUrl?: string;
  name?: string;
  nameJa?: string;
  brand?: string;
  brandJa?: string;
};

function hasUrl(s?: string): boolean {
  return !!(s && s.trim());
}

/**
 * 売れ筋・収益ポテンシャルの簡易スコア（一覧ソート用のたたき台）
 *
 * - rankingScore = max(0, 100 - rank)
 * - trendScore = movement > 0 ? min(movement, 50) : 0（isNew なら +10）
 * - imageScore: amazon +30, rakuten/qoo10 +20, OYのみ +5
 * - affiliateScore: amazon +30, qoo10 +25, rakuten +20
 * - textScore: 表示名が自然そう +10
 */
export function getMarketScore(input: MarketScoreInput): MarketScoreBreakdown {
  const rank =
    input.rank != null && Number.isFinite(input.rank)
      ? Math.max(0, Number(input.rank))
      : null;
  const rankingScore = rank != null ? Math.max(0, 100 - rank) : 0;

  let trendScore = 0;
  if (input.movement != null && input.movement > 0) {
    trendScore = Math.min(input.movement, 50);
  }
  if (input.isNew) trendScore += 10;

  const amzImg =
    hasUrl(input.amazonImageUrl) || hasUrl(input.amazonImage);
  const rakImg =
    hasUrl(input.rakutenImageUrl) || hasUrl(input.rakutenImage);
  const qImg = hasUrl(input.qoo10ImageUrl) || hasUrl(input.qoo10Image);
  const oyImg =
    hasUrl(input.oliveYoungImageUrl) ||
    hasUrl(input.imageUrl) ||
    hasUrl(input.thumbnailUrl);
  const oyUrl = hasUrl(input.oliveYoungUrl) || hasUrl(input.productUrl);

  let imageScore = 0;
  if (amzImg) imageScore += 30;
  else if (rakImg || qImg) imageScore += 20;
  else if (oyImg && oyUrl) imageScore += 5;

  let affiliateScore = 0;
  if (hasUrl(input.amazonUrl)) affiliateScore += 30;
  if (hasUrl(input.qoo10Url)) affiliateScore += 25;
  if (hasUrl(input.rakutenUrl)) affiliateScore += 20;

  const displayName = getDisplayProductNameText({
    name: input.name,
    nameJa: input.nameJa,
    brand: input.brand,
    brandJa: input.brandJa,
  });
  let textScore = 0;
  if (
    displayName &&
    displayName !== PRODUCT_TITLE_PENDING_JA &&
    !looksLikeOliveYoungGoodsNo(displayName)
  ) {
    textScore += 10;
  }

  const marketScore =
    rankingScore +
    trendScore +
    imageScore +
    affiliateScore +
    textScore;

  return {
    rankingScore,
    trendScore,
    imageScore,
    affiliateScore,
    textScore,
    marketScore,
  };
}
