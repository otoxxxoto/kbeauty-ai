/**
 * 公開面（TOP / カテゴリ / ランキング）に載る goodsNo の集合。
 * 日次ランキング・入口ページ・カテゴリページの並びと揃える。
 */
import { getCategoryConfigBySlug, getAllCategorySlugs } from "@/lib/category-config";
import { filterProductsByCategory } from "@/lib/filter-products-by-category";
import {
  getRankingByDate,
  getRankingRunDates,
  getRankingTopNWithProducts,
  getRisingProductsWithProducts,
} from "@/lib/oliveyoung-rankings";
import type { OliveYoungProductMinimal } from "@/lib/oliveyoung-products";

/** 入口「今日の注目商品」と同じくランキング先頭 N */
export const ENTRY_SPOTLIGHT_TOP_N = 3;

/** 入口「急上昇商品」と同じ件数 */
export const ENTRY_RISING_MAX_ITEMS = 5;

/** カテゴリページ先頭フィーチャー枠（各スラッグ） */
export const CATEGORY_FEATURED_SLICE = 3;

/** ランキングページで一覧表示される「上位」扱い（順位ベース） */
export const RANKING_SURFACE_TOP_N = 50;

export type PublicSurfaceGoodsIndex = {
  spotlight: Set<string>;
  rising: Set<string>;
  categoryFeatured: Set<string>;
  rankingTop50: Set<string>;
};

export type PublicSurfacePlacement = {
  onTopSpotlight: boolean;
  onTopRising: boolean;
  onCategoryLead: boolean;
  onRankingTop50: boolean;
};

function addAll(target: Set<string>, ids: Iterable<string>) {
  for (const id of ids) {
    const g = id.trim();
    if (g) target.add(g);
  }
}

export function getPublicSurfacePlacement(
  goodsNo: string,
  index: PublicSurfaceGoodsIndex
): PublicSurfacePlacement {
  const g = goodsNo.trim();
  return {
    onTopSpotlight: index.spotlight.has(g),
    onTopRising: index.rising.has(g),
    onCategoryLead: index.categoryFeatured.has(g),
    onRankingTop50: index.rankingTop50.has(g),
  };
}

/** 入口 TOP 枠（注目3 + 急上昇）。ログ `onTop` 用 */
export function isOnTopEntrySurface(placement: PublicSurfacePlacement): boolean {
  return placement.onTopSpotlight || placement.onTopRising;
}

export function isOnPublicSurface(placement: PublicSurfacePlacement): boolean {
  return (
    placement.onTopSpotlight ||
    placement.onTopRising ||
    placement.onCategoryLead ||
    placement.onRankingTop50
  );
}

/** 各集合の和集合（重複除去） */
export function mergePublicSurfaceGoodsNos(index: PublicSurfaceGoodsIndex): Set<string> {
  const out = new Set<string>();
  addAll(out, index.spotlight);
  addAll(out, index.rising);
  addAll(out, index.categoryFeatured);
  addAll(out, index.rankingTop50);
  return out;
}

/**
 * Firestore の最新ランキング日付と `allProductsMinimal` から、公開面 goodsNo を構築する。
 */
export async function buildPublicSurfaceGoodsIndex(
  allProductsMinimal: OliveYoungProductMinimal[]
): Promise<PublicSurfaceGoodsIndex> {
  const spotlight = new Set<string>();
  const rising = new Set<string>();
  const categoryFeatured = new Set<string>();
  const rankingTop50 = new Set<string>();

  const runDates = await getRankingRunDates();
  const runDate = runDates[0] ?? null;

  if (runDate) {
    const ranking = await getRankingByDate(runDate);
    if (ranking) {
      for (const row of ranking.items.slice(0, RANKING_SURFACE_TOP_N)) {
        if (row.goodsNo) rankingTop50.add(row.goodsNo);
      }
    }

    const top3 = await getRankingTopNWithProducts(runDate, ENTRY_SPOTLIGHT_TOP_N);
    if (top3) {
      for (const row of top3.items) {
        if (row.goodsNo) spotlight.add(row.goodsNo);
      }
    }
  }

  const risingData = await getRisingProductsWithProducts(ENTRY_RISING_MAX_ITEMS);
  if (risingData) {
    for (const row of risingData.items) {
      if (row.goodsNo) rising.add(row.goodsNo);
    }
  }

  for (const slug of getAllCategorySlugs()) {
    const cat = getCategoryConfigBySlug(slug);
    if (!cat) continue;
    const inCat = filterProductsByCategory(allProductsMinimal, cat);
    for (const p of inCat.slice(0, CATEGORY_FEATURED_SLICE)) {
      if (p.goodsNo) categoryFeatured.add(p.goodsNo);
    }
  }

  return { spotlight, rising, categoryFeatured, rankingTop50 };
}
