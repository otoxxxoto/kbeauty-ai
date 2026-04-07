/**
 * Firestore oliveyoung_rankings 読み取り
 * oliveyoung_rankings/{runDate} と items サブコレクション
 */
import { db } from "@/lib/firestore";
import { looksLikeOliveYoungGoodsNo, isUnsafeBrandJa } from "@/lib/oliveyoung-display";
import {
  getOliveYoungProductByGoodsNo,
  marketplaceExtensionForListItem,
  type ProductImageAnalysisEntry,
  type ProductImageFields,
} from "@/lib/oliveyoung-products";
import type { ProductMarketplaceFields } from "@/lib/product-marketplace-types";
import { resolveProductImageForDisplay } from "@/lib/getProductImage";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import {
  classifyImageSourceForStats,
  rankingVisualBoostForDisplayedBucket,
} from "@/lib/image-source-stats";
import { mergeOliveYoungListingProductUrl } from "@/lib/oliveyoung-official-url";
import { resolveOyNavigableUrl } from "@/lib/product-shop-cta-links";

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

function rankingItemToImageFields(
  item: RankingItemWithProduct
): ProductImageFields {
  return {
    manualImageUrl: item.manualImageUrl ?? undefined,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    imageUrls: item.imageUrls,
    safeImageUrl: item.safeImageUrl,
    hasSafeProductImage: item.hasSafeProductImage,
    imageAnalysis: item.imageAnalysis,
    marketplaceImageMatchLevels: item.marketplaceImageMatchLevels,
    amazonImage: item.amazonImage,
    rakutenImage: item.rakutenImage,
    qoo10Image: item.qoo10Image,
    oliveYoungImageUrl: item.oliveYoungImageUrl,
    amazonImageUrl: item.amazonImageUrl,
    rakutenImageUrl: item.rakutenImageUrl,
    qoo10ImageUrl: item.qoo10ImageUrl,
  };
}

/**
 * 注目・おすすめ枠向け: ベースは max(0, 100 - rank) + 表示画像バケット加点。
 * 公開ランキング一覧の並びには使わない。
 */
function rankingVisualSortScore(item: RankingItemWithProduct): number {
  const r = Number.isFinite(item.rank) ? Math.max(0, Number(item.rank)) : 0;
  let score = Math.max(0, 100 - r);
  const plain = serializeProductImageFieldsForClient(
    rankingItemToImageFields(item)
  );
  const pipe = resolveProductImageForDisplay(plain, { goodsNo: item.goodsNo });
  const bucket = classifyImageSourceForStats(pipe.imageSource, pipe.url);
  score += rankingVisualBoostForDisplayedBucket(bucket);
  return score;
}

/**
 * 画像ブースト付きソート（同点は公式 rank 昇順）。
 * トップの「注目」枠やレポートの「表示順シミュレーション」向け。
 */
export function sortRankingItemsByImageVisualBoost(
  items: RankingItemWithProduct[]
): RankingItemWithProduct[] {
  return [...items].sort((a, b) => {
    const sa = rankingVisualSortScore(a);
    const sb = rankingVisualSortScore(b);
    if (sb !== sa) return sb - sa;
    return a.rank - b.rank;
  });
}

export type RankingItemRow = {
  rank: number;
  goodsNo: string;
  name: string;
  brand: string;
  rankDiff: number | null;
  isNew: boolean;
};

/** development のみ付与: 画面上 OY URL デバッグ */
export type OyListingCardDebug = {
  goodsNo: string;
  /** Firestore `productUrl` 素値が非空か */
  dbProductUrl: boolean;
  dbPickedUrl: boolean;
  dbOliveYoungUrl: boolean;
  /** merge 後の item.productUrl（カードに載せた値）が非空か */
  mergedProductUrl: boolean;
  oyHref: boolean;
};

/** 商品公開データで補完したランキング1件（一覧・カード用） */
export type RankingItemWithProduct = RankingItemRow & {
  nameJa?: string;
  brandJa?: string;
  /** oliveyoung_products_public.summaryJa（カテゴリ判定の検索テキスト用） */
  summaryJa?: string;
  /** oliveyoung_products_public.manualImageUrl（手動アップロード正本） */
  manualImageUrl?: string | null;
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
  /** 推奨リンク（productUrl が非公式のときに公式ページが入ることがある） */
  pickedUrl?: string | null;
  lastRank: number | null;
  lastSeenRunDate: string | null;
  oyListingDebug?: OyListingCardDebug;
} & ProductMarketplaceFields;

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
 * 順序は公式 rank 昇順（画像ブーストによる並び替えはしない）
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
    const dbProductUrl = !!(publicProduct?.productUrl ?? "").trim();
    const dbPickedUrl = !!(publicProduct?.pickedUrl ?? "").trim();
    const dbOliveYoungUrl = !!(publicProduct?.oliveYoungUrl ?? "").trim();
    const productUrl = mergeOliveYoungListingProductUrl({
      productUrl: publicProduct?.productUrl,
      pickedUrl: publicProduct?.pickedUrl,
      oliveYoungUrl: publicProduct?.oliveYoungUrl,
    });
    const pickedUrl = publicProduct?.pickedUrl ?? null;
    const lastRank = publicProduct?.lastRank ?? publicProduct?.lastSeenRank ?? null;
    const lastSeenRunDate = publicProduct?.lastSeenRunDate ?? null;
    const name = resolveRankingItemName(row.name, publicProduct?.name);
    const brand = (row.brand || publicProduct?.brand || "").trim();
    const nameJa = publicProduct?.nameJa?.trim();
    const brandJaRaw = publicProduct?.brandJa?.trim();
    const brandJa =
      brandJaRaw && !isUnsafeBrandJa(brandJaRaw) ? brandJaRaw : undefined;

    const isDev = process.env.NODE_ENV === "development";
    const oyListingDebug: OyListingCardDebug | undefined = isDev
      ? {
          goodsNo: row.goodsNo,
          dbProductUrl,
          dbPickedUrl,
          dbOliveYoungUrl,
          mergedProductUrl: !!productUrl.trim(),
          oyHref: !!resolveOyNavigableUrl({
            productUrl,
            pickedUrl,
            oliveYoungUrl: publicProduct?.oliveYoungUrl,
          }),
        }
      : undefined;

    const summaryJaRaw = publicProduct?.summaryJa?.trim();
    const summaryJa = summaryJaRaw || undefined;

    enriched.push({
      ...row,
      name,
      nameJa: nameJa || undefined,
      brand: brand || "",
      brandJa,
      summaryJa,
      amazonImage: publicProduct?.amazonImage,
      rakutenImage: publicProduct?.rakutenImage,
      qoo10Image: publicProduct?.qoo10Image,
      amazonUrl: publicProduct?.amazonUrl,
      rakutenUrl: publicProduct?.rakutenUrl,
      qoo10Url: publicProduct?.qoo10Url,
      imageUrl,
      thumbnailUrl,
      imageUrls: publicProduct?.imageUrls,
      manualImageUrl: publicProduct?.manualImageUrl ?? null,
      safeImageUrl: publicProduct?.safeImageUrl,
      hasSafeProductImage: publicProduct?.hasSafeProductImage,
      imageAnalysis: publicProduct?.imageAnalysis,
      marketplaceImageMatchLevels: publicProduct?.marketplaceImageMatchLevels,
      productUrl,
      pickedUrl,
      lastRank,
      lastSeenRunDate,
      ...marketplaceExtensionForListItem(publicProduct ?? null),
      ...(oyListingDebug ? { oyListingDebug } : {}),
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

  const candidates: { row: RankingItemRow; rankDiff?: number; isNew: boolean }[] =
    [];
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
    const dbProductUrl = !!(publicProduct?.productUrl ?? "").trim();
    const dbPickedUrl = !!(publicProduct?.pickedUrl ?? "").trim();
    const dbOliveYoungUrl = !!(publicProduct?.oliveYoungUrl ?? "").trim();
    const productUrl = mergeOliveYoungListingProductUrl({
      productUrl: publicProduct?.productUrl,
      pickedUrl: publicProduct?.pickedUrl,
      oliveYoungUrl: publicProduct?.oliveYoungUrl,
    });
    const pickedUrl = publicProduct?.pickedUrl ?? null;
    const name = resolveRankingItemName(row.name, publicProduct?.name);
    const brand = (row.brand || publicProduct?.brand || "").trim();
    const nameJa = publicProduct?.nameJa?.trim();
    const brandJaRaw = publicProduct?.brandJa?.trim();
    const brandJa =
      brandJaRaw && !isUnsafeBrandJa(brandJaRaw) ? brandJaRaw : undefined;

    const isDev = process.env.NODE_ENV === "development";
    const oyListingDebug: OyListingCardDebug | undefined = isDev
      ? {
          goodsNo: row.goodsNo,
          dbProductUrl,
          dbPickedUrl,
          dbOliveYoungUrl,
          mergedProductUrl: !!productUrl.trim(),
          oyHref: !!resolveOyNavigableUrl({
            productUrl,
            pickedUrl,
            oliveYoungUrl: publicProduct?.oliveYoungUrl,
          }),
        }
      : undefined;

    const summaryJaRaw = publicProduct?.summaryJa?.trim();
    const summaryJa = summaryJaRaw || undefined;

    enriched.push({
      ...row,
      name,
      nameJa: nameJa || undefined,
      brand: brand || "",
      brandJa,
      summaryJa,
      amazonImage: publicProduct?.amazonImage,
      rakutenImage: publicProduct?.rakutenImage,
      qoo10Image: publicProduct?.qoo10Image,
      amazonUrl: publicProduct?.amazonUrl,
      rakutenUrl: publicProduct?.rakutenUrl,
      qoo10Url: publicProduct?.qoo10Url,
      imageUrl,
      thumbnailUrl,
      imageUrls: publicProduct?.imageUrls,
      manualImageUrl: publicProduct?.manualImageUrl ?? null,
      safeImageUrl: publicProduct?.safeImageUrl,
      hasSafeProductImage: publicProduct?.hasSafeProductImage,
      imageAnalysis: publicProduct?.imageAnalysis,
      marketplaceImageMatchLevels: publicProduct?.marketplaceImageMatchLevels,
      productUrl,
      pickedUrl,
      lastRank: publicProduct?.lastRank ?? publicProduct?.lastSeenRank ?? null,
      lastSeenRunDate: publicProduct?.lastSeenRunDate ?? null,
      rankDiff: typeof rankDiff === "number" ? rankDiff : row.rankDiff,
      isNew,
      ...marketplaceExtensionForListItem(publicProduct ?? null),
      ...(oyListingDebug ? { oyListingDebug } : {}),
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
  const full = await getRankingWithProducts(runDate);
  if (!full) return null;
  const cap = Math.max(0, Math.floor(n));
  return {
    meta: full.meta,
    items: full.items.slice(0, cap),
  };
}
