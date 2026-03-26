/**
 * Firestore oliveyoung_rankings 読み取り
 * oliveyoung_rankings/{runDate} と items サブコレクション
 */
import { db } from "@/lib/firestore";
import { looksLikeOliveYoungGoodsNo, isUnsafeBrandJa } from "@/lib/oliveyoung-display";
import {
  getOliveYoungProductByGoodsNo,
  type ProductImageAnalysisEntry,
  type ProductImageFields,
} from "@/lib/oliveyoung-products";

/** ランキング行の name と public.name をマージ（行が goodsNo のときは public の実名を優先） */
function resolveRankingItemName(
  rowName: string,
  publicName: string | undefined
): string {
  const r = rowName.trim();
  const p = (publicName ?? "").trim();
  if (r && !looksLikeOliveYoungGoodsNo(r)) return r;
  if (p && !looksLikeOliveYoungGoodsNo(p)) return p;
  return "";
}

const RANKINGS_COLLECTION = "oliveyoung_rankings";

export type RankingItemRow = {
  rank: number;
  goodsNo: string;
  name: string;
  brand: string;
  rankDiff: number | null;
  isNew: boolean;
};

/** 商品公開データで補完したランキング1件（一覧・カード用） */
export type RankingItemWithProduct = RankingItemRow & {
  nameJa?: string;
  brandJa?: string;
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  imageUrl: string;
  thumbnailUrl: string;
  /** 公開ドキュメント由来（Vision・複数画像）。TOP/一覧の resolveProductDisplayImage に必須 */
  imageUrls?: string[];
  safeImageUrl?: string;
  hasSafeProductImage?: boolean;
  imageAnalysis?: ProductImageAnalysisEntry[];
  marketplaceImageMatchLevels?: ProductImageFields["marketplaceImageMatchLevels"];
  productUrl: string;
  lastRank: number | null;
  lastSeenRunDate: string | null;
};

export type RankingMeta = {
  runDate: string;
  totalItems: number;
  collected?: number;
  status?: string;
};

export type RankingByDate = {
  meta: RankingMeta;
  items: RankingItemRow[];
};

/**
 * 利用可能な runDate 一覧（降順）
 */
export async function getRankingRunDates(): Promise<string[]> {
  const snap = await db.collection(RANKINGS_COLLECTION).get();
  const dates = snap.docs.map((d) => d.id).filter(Boolean);
  dates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return dates;
}

/**
 * 指定日のランキングを取得（items は rank 昇順）
 * items の name/brand は saveRankingHistoryItem で保存されたもの。無い場合は空文字。
 */
export async function getRankingByDate(
  runDate: string
): Promise<RankingByDate | null> {
  const runDateTrimmed = (runDate || "").trim();
  if (!runDateTrimmed) return null;

  const docRef = db.collection(RANKINGS_COLLECTION).doc(runDateTrimmed);
  const [metaSnap, itemsSnap] = await Promise.all([
    docRef.get(),
    docRef.collection("items").get(),
  ]);

  if (!metaSnap.exists) return null;

  const metaData = metaSnap.data() ?? {};
  const meta: RankingMeta = {
    runDate: runDateTrimmed,
    totalItems: itemsSnap.size,
    collected: metaData.collected != null ? Number(metaData.collected) : undefined,
    status: metaData.status != null ? String(metaData.status) : undefined,
  };

  const items: RankingItemRow[] = itemsSnap.docs
    .map((d) => {
      const data = d.data();
      const rank = data.rank != null ? Number(data.rank) : parseInt(d.id, 10);
      if (Number.isNaN(rank)) return null;
      return {
        rank,
        goodsNo: String(data.goodsNo ?? "").trim(),
        name: String(data.name ?? "").trim(),
        brand: String(data.brand ?? "").trim(),
        rankDiff: data.rankDiff != null ? Number(data.rankDiff) : null,
        isNew: !!data.isNew,
      };
    })
    .filter((r): r is RankingItemRow => r !== null && r.goodsNo !== "")
    .sort((a, b) => a.rank - b.rank);

  return { meta, items };
}

/**
 * 指定日のランキングを取得し、oliveyoung_products_public で画像・URL を補完
 * 順序は rank 昇順のまま
 */
export async function getRankingWithProducts(
  runDate: string
): Promise<{ meta: RankingMeta; items: RankingItemWithProduct[] } | null> {
  const ranking = await getRankingByDate(runDate);
  if (!ranking) return null;

  const enriched: RankingItemWithProduct[] = [];
  for (const row of ranking.items) {
    const publicProduct = await getOliveYoungProductByGoodsNo(row.goodsNo);
    const imageUrl = publicProduct?.imageUrl ?? "";
    const thumbnailUrl = publicProduct?.thumbnailUrl ?? "";
    const productUrl = publicProduct?.productUrl ?? "";
    const lastRank = publicProduct?.lastRank ?? publicProduct?.lastSeenRank ?? null;
    const lastSeenRunDate = publicProduct?.lastSeenRunDate ?? null;
    const name = resolveRankingItemName(row.name, publicProduct?.name);
    const brand = (row.brand || publicProduct?.brand || "").trim();
    const nameJa = publicProduct?.nameJa?.trim();
    const brandJaRaw = publicProduct?.brandJa?.trim();
    const brandJa =
      brandJaRaw && !isUnsafeBrandJa(brandJaRaw) ? brandJaRaw : undefined;

    enriched.push({
      ...row,
      name,
      nameJa: nameJa || undefined,
      brand: brand || "",
      brandJa,
      amazonImage: publicProduct?.amazonImage,
      rakutenImage: publicProduct?.rakutenImage,
      qoo10Image: publicProduct?.qoo10Image,
      amazonUrl: publicProduct?.amazonUrl,
      rakutenUrl: publicProduct?.rakutenUrl,
      qoo10Url: publicProduct?.qoo10Url,
      imageUrl,
      thumbnailUrl,
      imageUrls: publicProduct?.imageUrls,
      safeImageUrl: publicProduct?.safeImageUrl,
      hasSafeProductImage: publicProduct?.hasSafeProductImage,
      imageAnalysis: publicProduct?.imageAnalysis,
      marketplaceImageMatchLevels: publicProduct?.marketplaceImageMatchLevels,
      productUrl,
      lastRank,
      lastSeenRunDate,
    });
  }

  return { meta: ranking.meta, items: enriched };
}

/** 急上昇商品1件（順位上昇 or 新規ランクイン）。rankDiff は正の値＝上昇幅（Firestore由来 or 前日比計算）。isNew は新規ランクイン */
export type RisingProductItem = RankingItemWithProduct & {
  isNew: boolean;
};

/**
 * 直近2日のランキングを比較し、急上昇商品（順位上昇＋新規ランクイン）を最大 maxItems 件取得して商品データで補完。
 * runDate が2件未満または候補0件の場合は null を返す。
 */
export async function getRisingProductsWithProducts(
  maxItems: number = 5
): Promise<{ items: RisingProductItem[] } | null> {
  const runDates = await getRankingRunDates();
  if (runDates.length < 2) return null;

  const [runDateLatest, runDatePrev] = [runDates[0], runDates[1]];
  const [rankingLatest, rankingPrev] = await Promise.all([
    getRankingByDate(runDateLatest),
    getRankingByDate(runDatePrev),
  ]);
  if (!rankingLatest || !rankingPrev) return null;

  const prevRankByGoodsNo = new Map<string, number>();
  for (const row of rankingPrev.items) {
    if (row.goodsNo) prevRankByGoodsNo.set(row.goodsNo, row.rank);
  }

  const candidates: { row: RankingItemRow; rankDiff?: number; isNew: boolean }[] = [];
  for (const row of rankingLatest.items) {
    const prevRank = prevRankByGoodsNo.get(row.goodsNo);
    if (prevRank === undefined) {
      candidates.push({ row, isNew: true });
    } else if (prevRank > row.rank) {
      candidates.push({ row, rankDiff: prevRank - row.rank, isNew: false });
    }
  }

  const risingFirst = candidates
    .filter((c) => !c.isNew && (c.rankDiff ?? 0) > 0)
    .sort((a, b) => (b.rankDiff ?? 0) - (a.rankDiff ?? 0));
  const newFirst = candidates
    .filter((c) => c.isNew)
    .sort((a, b) => a.row.rank - b.row.rank);
  const combined = [...risingFirst, ...newFirst].slice(0, maxItems);
  if (combined.length === 0) return null;

  const enriched: RisingProductItem[] = [];
  for (const { row, rankDiff, isNew } of combined) {
    const publicProduct = await getOliveYoungProductByGoodsNo(row.goodsNo);
    const imageUrl = publicProduct?.imageUrl ?? "";
    const thumbnailUrl = publicProduct?.thumbnailUrl ?? "";
    const productUrl = publicProduct?.productUrl ?? "";
    const name = resolveRankingItemName(row.name, publicProduct?.name);
    const brand = (row.brand || publicProduct?.brand || "").trim();
    const nameJa = publicProduct?.nameJa?.trim();
    const brandJaRaw = publicProduct?.brandJa?.trim();
    const brandJa =
      brandJaRaw && !isUnsafeBrandJa(brandJaRaw) ? brandJaRaw : undefined;

    enriched.push({
      ...row,
      name,
      nameJa: nameJa || undefined,
      brand: brand || "",
      brandJa,
      amazonImage: publicProduct?.amazonImage,
      rakutenImage: publicProduct?.rakutenImage,
      qoo10Image: publicProduct?.qoo10Image,
      amazonUrl: publicProduct?.amazonUrl,
      rakutenUrl: publicProduct?.rakutenUrl,
      qoo10Url: publicProduct?.qoo10Url,
      imageUrl,
      thumbnailUrl,
      imageUrls: publicProduct?.imageUrls,
      safeImageUrl: publicProduct?.safeImageUrl,
      hasSafeProductImage: publicProduct?.hasSafeProductImage,
      imageAnalysis: publicProduct?.imageAnalysis,
      marketplaceImageMatchLevels: publicProduct?.marketplaceImageMatchLevels,
      productUrl,
      lastRank: publicProduct?.lastRank ?? publicProduct?.lastSeenRank ?? null,
      lastSeenRunDate: publicProduct?.lastSeenRunDate ?? null,
      rankDiff: typeof rankDiff === "number" ? rankDiff : row.rankDiff,
      isNew,
    });
  }

  return { items: enriched };
}

/**
 * 指定日のランキング上位 N 件のみ取得し、商品公開データで補完（入口ページ用）
 */
export async function getRankingTopNWithProducts(
  runDate: string,
  n: number
): Promise<{ meta: RankingMeta; items: RankingItemWithProduct[] } | null> {
  const ranking = await getRankingByDate(runDate);
  if (!ranking) return null;

  const topRows = ranking.items.slice(0, n);
  const enriched: RankingItemWithProduct[] = [];

  for (const row of topRows) {
    const publicProduct = await getOliveYoungProductByGoodsNo(row.goodsNo);
    const imageUrl = publicProduct?.imageUrl ?? "";
    const thumbnailUrl = publicProduct?.thumbnailUrl ?? "";
    const productUrl = publicProduct?.productUrl ?? "";
    const lastRank = publicProduct?.lastRank ?? publicProduct?.lastSeenRank ?? null;
    const lastSeenRunDate = publicProduct?.lastSeenRunDate ?? null;
    const name = resolveRankingItemName(row.name, publicProduct?.name);
    const brand = (row.brand || publicProduct?.brand || "").trim();
    const nameJa = publicProduct?.nameJa?.trim();
    const brandJaRaw = publicProduct?.brandJa?.trim();
    const brandJa =
      brandJaRaw && !isUnsafeBrandJa(brandJaRaw) ? brandJaRaw : undefined;

    enriched.push({
      ...row,
      name,
      nameJa: nameJa || undefined,
      brand: brand || "",
      brandJa,
      amazonImage: publicProduct?.amazonImage,
      rakutenImage: publicProduct?.rakutenImage,
      qoo10Image: publicProduct?.qoo10Image,
      amazonUrl: publicProduct?.amazonUrl,
      rakutenUrl: publicProduct?.rakutenUrl,
      qoo10Url: publicProduct?.qoo10Url,
      imageUrl,
      thumbnailUrl,
      imageUrls: publicProduct?.imageUrls,
      safeImageUrl: publicProduct?.safeImageUrl,
      hasSafeProductImage: publicProduct?.hasSafeProductImage,
      imageAnalysis: publicProduct?.imageAnalysis,
      marketplaceImageMatchLevels: publicProduct?.marketplaceImageMatchLevels,
      productUrl,
      lastRank,
      lastSeenRunDate,
    });
  }

  return { meta: ranking.meta, items: enriched };
}
