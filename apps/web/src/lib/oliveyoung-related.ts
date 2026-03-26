/**
 * 商品詳細ページ用: 同ブランド・同カテゴリ・近い順位の関連商品取得
 */
import { getAllOliveYoungProductsMinimal } from "@/lib/oliveyoung-products";
import type { OliveYoungProductMinimal } from "@/lib/oliveyoung-products";
import { detectCategory } from "@/lib/oliveyoung-categories";

export type { OliveYoungProductMinimal };

type CurrentProduct = {
  goodsNo: string;
  brand?: string | null;
  lastRank?: number | null;
  nameJa?: string | null;
  name?: string | null;
  summaryJa?: string | null;
};

export type RelatedProductsResult = {
  byBrand: OliveYoungProductMinimal[];
  byCategory: OliveYoungProductMinimal[];
  byRank: OliveYoungProductMinimal[];
};

const DEFAULT_LIMIT = 3;

function rankSortKey(lastRank: number | null): number {
  return lastRank != null && Number.isFinite(lastRank) ? lastRank : 999999;
}

/**
 * 1回の Firestore 取得で同ブランド・同カテゴリ・近い順位の関連商品を取得
 */
export async function getRelatedProducts(
  currentProduct: CurrentProduct,
  options?: {
    brandLimit?: number;
    categoryLimit?: number;
    rankLimit?: number;
  }
): Promise<RelatedProductsResult> {
  const brandLimit = options?.brandLimit ?? DEFAULT_LIMIT;
  const categoryLimit = options?.categoryLimit ?? DEFAULT_LIMIT;
  const rankLimit = options?.rankLimit ?? DEFAULT_LIMIT;

  const all = await getAllOliveYoungProductsMinimal();
  const others = all.filter((p) => p.goodsNo !== currentProduct.goodsNo);
  const currentBrand = (currentProduct.brand ?? "").trim();
  const currentRank =
    currentProduct.lastRank != null && Number.isFinite(currentProduct.lastRank)
      ? currentProduct.lastRank
      : null;

  // 同ブランド（lastRank 昇順、最大 brandLimit）
  const byBrand = others
    .filter((p) => (p.brand ?? "").trim() === currentBrand)
    .sort((a, b) => rankSortKey(a.lastRank) - rankSortKey(b.lastRank))
    .slice(0, brandLimit);

  // 同カテゴリ（現在のカテゴリが null なら空。同ブランド除外可、lastRank 昇順）
  const currentCat = detectCategory(currentProduct);
  let byCategory: OliveYoungProductMinimal[] = [];
  if (currentCat) {
    byCategory = others
      .filter((p) => detectCategory(p) === currentCat && p.goodsNo !== currentProduct.goodsNo)
      .filter((p) => (p.brand ?? "").trim() !== currentBrand)
      .sort((a, b) => rankSortKey(a.lastRank) - rankSortKey(b.lastRank))
      .slice(0, categoryLimit);
  }

  // 近い順位（currentRank が無い場合は空）
  let byRank: OliveYoungProductMinimal[] = [];
  if (currentRank !== null) {
    byRank = others
      .filter((p) => p.lastRank != null && Number.isFinite(p.lastRank))
      .sort(
        (a, b) =>
          Math.abs((a.lastRank ?? 0) - currentRank) -
          Math.abs((b.lastRank ?? 0) - currentRank)
      )
      .slice(0, rankLimit);
  }

  return { byBrand, byCategory, byRank };
}
