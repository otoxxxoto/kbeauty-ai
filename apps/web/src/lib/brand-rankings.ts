/**
 * Firestore brand_rankings 読み取り
 * brand_rankings/{runDate} と brand_rankings/{runDate}/items を取得
 */
import { db } from "@/lib/firestore";
import { getDisplayBrandText, isUnsafeBrandJa } from "@/lib/oliveyoung-display";
import { getOliveYoungProductByGoodsNo, getOliveYoungProductsByGoodsNos } from "@/lib/oliveyoung-products";

const BRAND_RANKINGS_COLLECTION = "brand_rankings";

export type BrandRankingItem = {
  brand: string;
  brandJa?: string;
  brandKey: string;
  rank?: number;
  count: number;
  bestRank: number;
  score: number;
  goodsNos?: string[];
  sampleNames?: string[];
  rankDiff?: number | null;
  scoreDiff?: number | null;
  countDiff?: number | null;
  isNew?: boolean;
};

/**
 * 表示用ブランド名（brandJa 優先、無ければ brand）
 */
export function getDisplayBrand(item: {
  brand?: string;
  brandJa?: string;
}): string {
  return getDisplayBrandText(item);
}

export type BrandRanking = {
  runDate: string;
  totalBrands: number;
  totalItems: number;
  items: BrandRankingItem[];
};

/** ブランド詳細ページ用（1件取得） */
export type BrandRankingDetail = {
  brand: string;
  brandJa?: string;
  /** ブランド説明（任意）。将来の補完Jobで Firestore に投入されれば表示される */
  brandSummaryJa?: string;
  brandKey: string;
  rank: number;
  count: number;
  bestRank: number;
  score: number;
  goodsNos?: string[];
  sampleNames?: string[];
  prevBestRank?: number | null;
  prevScore?: number | null;
  prevCount?: number | null;
  rankDiff?: number | null;
  scoreDiff?: number | null;
  countDiff?: number | null;
  isNew?: boolean;
};

function toBrandRankingItem(data: Record<string, unknown>): BrandRankingItem {
  return {
    brand: String(data.brand ?? "").trim(),
    brandJa: data.brandJa != null ? String(data.brandJa).trim() : undefined,
    brandKey: String(data.brandKey ?? "").trim(),
    rank: data.rank != null ? Number(data.rank) : undefined,
    count: Number(data.count ?? 0),
    bestRank: Number(data.bestRank ?? 0),
    score: Number(data.score ?? 0),
    goodsNos: Array.isArray(data.goodsNos) ? data.goodsNos.map(String) : [],
    sampleNames: Array.isArray(data.sampleNames) ? data.sampleNames.map(String) : [],
    rankDiff: data.rankDiff != null ? Number(data.rankDiff) : null,
    scoreDiff: data.scoreDiff != null ? Number(data.scoreDiff) : null,
    countDiff: data.countDiff != null ? Number(data.countDiff) : null,
    isNew: !!data.isNew,
  };
}

/** Unknown およびブランド名空は表示しない */
function filterItem(item: BrandRankingItem): boolean {
  const b = (item.brand || "").trim();
  if (!b) return false;
  if (b === "Unknown") return false;
  return true;
}

/**
 * brand_rankings に brandJa が無いとき、代表 goods の products_public.brandJa で表示用に補完（読み取りのみ）
 */
async function enrichBrandRankingItemsWithPublicBrandJa(
  items: BrandRankingItem[]
): Promise<BrandRankingItem[]> {
  const need = items.filter(
    (i) => !(i.brandJa?.trim()) && Array.isArray(i.goodsNos) && i.goodsNos.length > 0
  );
  if (need.length === 0) return items;

  const firstNos = [
    ...new Set(
      need.map((t) => String(t.goodsNos![0]).trim()).filter(Boolean)
    ),
  ];
  const cards = await getOliveYoungProductsByGoodsNos(firstNos);
  const brandJaByGoods = new Map<string, string>();
  for (const c of cards) {
    const bj = c.brandJa?.trim();
    if (bj && !isUnsafeBrandJa(bj)) brandJaByGoods.set(c.goodsNo, bj);
  }

  return items.map((item) => {
    if (item.brandJa?.trim()) return item;
    const g0 = item.goodsNos?.[0];
    if (!g0) return item;
    const bj = brandJaByGoods.get(String(g0).trim());
    if (!bj) return item;
    return { ...item, brandJa: bj };
  });
}

/**
 * 最新の runDate のブランドランキングを取得
 * brand_rankings の全 doc を取得し、runDate（doc.id）でソートして最新を返す
 */
export async function getLatestBrandRanking(): Promise<BrandRanking | null> {
  const snap = await db.collection(BRAND_RANKINGS_COLLECTION).get();
  if (snap.empty) return null;

  const runDates = snap.docs.map((d) => d.id).filter(Boolean);
  runDates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  const latestRunDate = runDates[0];
  if (!latestRunDate) return null;

  return getBrandRankingByDate(latestRunDate);
}

/**
 * 指定日のブランドランキングを取得
 * items は score desc, bestRank asc で整列。Unknown・空ブランドは除外
 */
export async function getBrandRankingByDate(
  runDate: string
): Promise<BrandRanking | null> {
  const runDateTrimmed = (runDate || "").trim();
  if (!runDateTrimmed) return null;

  const parentRef = db.collection(BRAND_RANKINGS_COLLECTION).doc(runDateTrimmed);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) return null;

  const parentData = parentSnap.data() ?? {};
  const totalBrands = Number(parentData.totalBrands ?? 0);
  const totalItems = Number(parentData.totalItems ?? 0);

  const itemsSnap = await parentRef.collection("items").get();
  let items: BrandRankingItem[] = itemsSnap.docs.map((d) => toBrandRankingItem(d.data()));
  items = items.filter(filterItem);
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.bestRank - b.bestRank;
  });

  items = await enrichBrandRankingItemsWithPublicBrandJa(items);

  return {
    runDate: runDateTrimmed,
    totalBrands: items.length,
    totalItems,
    items,
  };
}

/**
 * 利用可能な runDate 一覧を取得（日付降順）
 */
export async function getBrandRankingRunDates(): Promise<string[]> {
  const snap = await db.collection(BRAND_RANKINGS_COLLECTION).get();
  const runDates = snap.docs.map((d) => d.id).filter(Boolean);
  runDates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return runDates;
}

function toBrandRankingDetail(
  data: Record<string, unknown>,
  docId: string
): BrandRankingDetail {
  return {
    brand: String(data.brand ?? "").trim(),
    brandJa: data.brandJa != null ? String(data.brandJa).trim() : undefined,
    brandSummaryJa:
      data.brandSummaryJa != null ? String(data.brandSummaryJa).trim() : undefined,
    brandKey: String(data.brandKey ?? docId).trim(),
    rank: Number(data.rank ?? 0),
    count: Number(data.count ?? 0),
    bestRank: Number(data.bestRank ?? 0),
    score: Number(data.score ?? 0),
    goodsNos: Array.isArray(data.goodsNos) ? data.goodsNos.map(String) : [],
    sampleNames: Array.isArray(data.sampleNames)
      ? data.sampleNames.map(String)
      : [],
    prevBestRank: data.prevBestRank != null ? Number(data.prevBestRank) : null,
    prevScore: data.prevScore != null ? Number(data.prevScore) : null,
    prevCount: data.prevCount != null ? Number(data.prevCount) : null,
    rankDiff: data.rankDiff != null ? Number(data.rankDiff) : null,
    scoreDiff: data.scoreDiff != null ? Number(data.scoreDiff) : null,
    countDiff: data.countDiff != null ? Number(data.countDiff) : null,
    isNew: !!data.isNew,
  };
}

/**
 * 指定日の指定ブランドのランキング1件を取得
 * brand_rankings/{runDate}/items/{brandKey}
 * 直接 doc(brandKey) で見つからなければ brandKey フィールド・brand フィールドで fallback 検索
 */
export async function getBrandRankingItemByDate(
  runDate: string,
  brandKey: string
): Promise<BrandRankingDetail | null> {
  const runDateTrimmed = (runDate || "").trim();
  const brandKeyTrimmed = (brandKey || "").trim();
  if (!runDateTrimmed || !brandKeyTrimmed) return null;

  const itemsRef = db
    .collection(BRAND_RANKINGS_COLLECTION)
    .doc(runDateTrimmed)
    .collection("items");

  console.log("[GET_BRAND_DETAIL]", { runDate: runDateTrimmed, brandKey: brandKeyTrimmed });

  const itemsSnap = await itemsRef.limit(5).get();
  console.log(
    "[BRAND_DETAIL_DOC_IDS]",
    itemsSnap.docs.map((d) => d.id)
  );

  const directSnap = await itemsRef.doc(brandKeyTrimmed).get();
  if (directSnap.exists) {
    const data = directSnap.data() ?? {};
    return await enrichBrandDetailWithPublicBrandJa(
      toBrandRankingDetail(data, brandKeyTrimmed)
    );
  }

  const fallbackSnap = await itemsRef
    .where("brandKey", "==", brandKeyTrimmed)
    .limit(1)
    .get();
  if (!fallbackSnap.empty) {
    const doc = fallbackSnap.docs[0];
    const data = doc.data() ?? {};
    return await enrichBrandDetailWithPublicBrandJa(
      toBrandRankingDetail(data, doc.id)
    );
  }

  const decodedBrand = decodeURIComponent(brandKeyTrimmed);
  const fallbackBrandSnap = await itemsRef
    .where("brand", "==", decodedBrand)
    .limit(1)
    .get();
  if (!fallbackBrandSnap.empty) {
    const doc = fallbackBrandSnap.docs[0];
    const data = doc.data() ?? {};
    return await enrichBrandDetailWithPublicBrandJa(
      toBrandRankingDetail(data, doc.id)
    );
  }

  return null;
}

async function enrichBrandDetailWithPublicBrandJa(
  detail: BrandRankingDetail | null
): Promise<BrandRankingDetail | null> {
  if (!detail) return null;
  if (detail.brandJa?.trim()) return detail;
  const g0 = detail.goodsNos?.[0];
  if (!g0) return detail;
  const p = await getOliveYoungProductByGoodsNo(String(g0).trim());
  const bj = p?.brandJa?.trim();
  if (!bj) return detail;
  return { ...detail, brandJa: bj };
}
