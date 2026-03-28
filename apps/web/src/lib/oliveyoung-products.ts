/**
 * Firestore oliveyoung_products_public 読み取り
 * 商品詳細ページ用
 */
import { db } from "@/lib/firestore";
import {
  getDisplayBrandText,
  getDisplayProductNameText,
  PRODUCT_TITLE_PENDING_JA,
} from "@/lib/oliveyoung-display";
import {
  buildAmazonSearchUrl,
  buildQoo10SearchUrl,
  buildRakutenSearchUrl,
} from "@/lib/affiliate";
import type { ProductImageAnalysisEntry, ProductImageFields } from "./product-display-image-resolve";
import type {
  PrimaryShop,
  ProductMarketplaceFields,
  ProductRevenueImageSource,
} from "@/lib/product-marketplace-types";

export type {
  ProductImageAnalysisEntry,
  ProductMarketplaceImages,
  ProductImageFields,
  ProductDisplayImageSource,
  ProductDisplayImageResolution,
} from "./product-display-image-resolve";

export {
  OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH,
  resolveProductDisplayImage,
  resolveProductDisplayImageUrl,
  productDisplayImageIsPlaceholder,
  isOliveYoungStyleProductImageUrl,
} from "./product-display-image-resolve";

const PRODUCTS_PUBLIC_COLLECTION = "oliveyoung_products_public";

/** 価格比較1チャネル分。将来の価格取得Jobで投入する想定 */
export type PriceComparisonEntry = {
  label?: string;
  priceText?: string;
  url?: string;
  /** 価格取得日時（Firestore Timestamp / Date / 文字列）。表示用に formatFetchedAtDate で整形 */
  fetchedAt?: unknown;
};

/** 価格比較セクション用。任意フィールドのため無くても可 */
export type PriceComparison = {
  oliveyoung?: PriceComparisonEntry;
  amazon?: PriceComparisonEntry;
  rakuten?: PriceComparisonEntry;
  qoo10?: PriceComparisonEntry;
};

/** nameJa 自動補完パイプライン用（Firestore 任意フィールドと一致） */
export type TranslationPriority = "high" | "medium" | "low";

function mapImageAnalysisFromFirestore(raw: unknown): ProductImageAnalysisEntry[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: ProductImageAnalysisEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const url = o.url != null ? String(o.url).trim() : "";
    if (!url) continue;
    out.push({
      url,
      containsPerson: o.containsPerson === true,
      confidence: typeof o.confidence === "number" ? o.confidence : undefined,
      isPreferredProductImage:
        o.isPreferredProductImage === true
          ? true
          : o.isPreferredProductImage === false
            ? false
            : undefined,
      isOliveYoungOriginal: o.isOliveYoungOriginal === true ? true : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function mapMarketplaceImageMatchLevelsFromFirestore(
  raw: unknown
): ProductImageFields["marketplaceImageMatchLevels"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pick = (k: "amazon" | "rakuten" | "qoo10"): "strong" | "weak" | undefined => {
    const v = o[k];
    if (v === "strong" || v === "weak") return v;
    return undefined;
  };
  const amazon = pick("amazon");
  const rakuten = pick("rakuten");
  const qoo10 = pick("qoo10");
  if (!amazon && !rakuten && !qoo10) return undefined;
  return {
    ...(amazon ? { amazon } : {}),
    ...(rakuten ? { rakuten } : {}),
    ...(qoo10 ? { qoo10 } : {}),
  };
}

function optImageStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : "";
  return s || undefined;
}

function optImageUrls(v: unknown): string[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out = v
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean);
  return out.length > 0 ? out : undefined;
}

function optHrefStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : "";
  return s || undefined;
}

function optPlainStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : "";
  return s || undefined;
}

function parsePrimaryShopField(v: unknown): PrimaryShop | null | undefined {
  if (v === null) return null;
  if (v === "amazon" || v === "qoo10" || v === "rakuten" || v === "oliveyoung") return v;
  return undefined;
}

function parseRevenueImageSource(
  v: unknown
): ProductRevenueImageSource | undefined {
  if (
    v === "amazon" ||
    v === "rakuten" ||
    v === "qoo10" ||
    v === "oliveyoung" ||
    v === "fallback_no_image"
  ) {
    return v;
  }
  return undefined;
}

function parseMarketScoreField(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}


export type OliveYoungProductDetail = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  summaryJa?: string;
  /** 口コミ要約（任意）。将来の補完Jobで投入されれば表示される */
  reviewSummaryJa?: string;
  /** 成分解説（任意）。将来の補完Jobで投入されれば表示される */
  ingredientSummaryJa?: string;
  /** 価格比較（任意）。将来の価格取得Jobで投入されれば表示される */
  priceComparison?: PriceComparison;
  brand: string;
  brandJa?: string;
  productUrl: string;
  pickedUrl: string;
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  /** アフィリエイト／直リンク用（任意。未設定時は検索URLにフォールバック） */
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  imageUrl: string;
  thumbnailUrl: string;
  imageUrls?: string[];
  /** Gemini Vision Job: 人物なし商品画像の推奨URL */
  safeImageUrl?: string;
  hasSafeProductImage?: boolean;
  imageAnalysis?: ProductImageAnalysisEntry[];
  marketplaceImageMatchLevels?: ProductImageFields["marketplaceImageMatchLevels"];
  source: string;
  lastRank: number | null;
  lastSeenRank: number | null;
  lastSeenRunDate: string | null;
  /** 表示用（Firestore Timestamp は取得時に文字列化済み） */
  updatedAt: string | null;
  /** 翻訳バッチ用メタ（任意） */
  needsNameJa?: boolean;
  translationPriority?: TranslationPriority;
  lastNameJaTranslatedAt?: string | null;
} & ProductMarketplaceFields;

/** Firestore Timestamp 等を Client へ渡せる文字列へ（priceComparison.fetchedAt） */
function serializeFetchedAtForClient(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") {
    const t = v.trim();
    return t || undefined;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v).toISOString();
  }
  if (
    typeof v === "object" &&
    v !== null &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (v instanceof Date) return v.toISOString();
  return undefined;
}

function mapEntry(v: unknown): PriceComparisonEntry | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const label = o.label != null ? String(o.label).trim() : undefined;
  const priceText = o.priceText != null ? String(o.priceText).trim() : undefined;
  const url = o.url != null ? String(o.url).trim() : undefined;
  if (!label && !priceText && !url) return undefined;
  const fetchedAt = serializeFetchedAtForClient(o.fetchedAt);
  return {
    label: label || undefined,
    priceText: priceText || undefined,
    url: url || undefined,
    ...(fetchedAt !== undefined && { fetchedAt }),
  };
}

function mapPriceComparisonFromFirestore(raw: unknown): PriceComparison | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const oliveyoung = mapEntry(o.oliveyoung);
  const amazon = mapEntry(o.amazon);
  const rakuten = mapEntry(o.rakuten);
  const qoo10 = mapEntry(o.qoo10);
  if (!oliveyoung && !amazon && !rakuten && !qoo10) return undefined;
  return {
    ...(oliveyoung && { oliveyoung }),
    ...(amazon && { amazon }),
    ...(rakuten && { rakuten }),
    ...(qoo10 && { qoo10 }),
  };
}

/**
 * 表示用商品名（低品質 nameJa は弾き name にフォールバック）
 * どちらも使えないときは空（タイトル用は getDisplayProductNameText でプレースホルダー）
 */
export function getDisplayName(product: {
  name?: string;
  nameJa?: string;
  brand?: string;
  brandJa?: string;
}): string {
  const t = getDisplayProductNameText(product);
  return t === PRODUCT_TITLE_PENDING_JA ? "" : t;
}

/**
 * 表示用ブランド名（brandJa 優先、無ければ brand）
 */
export function getDisplayBrand(product: {
  brand?: string;
  brandJa?: string;
}): string {
  return getDisplayBrandText(product);
}

/**
 * 商品名から各モールの検索URLを生成（購入導線用）
 */
export function buildMarketplaceLinks(name: string): {
  amazon: string;
  rakuten: string;
  qoo10: string;
} {
  const kw = name.trim() || "";
  return {
    amazon: buildAmazonSearchUrl(kw),
    rakuten: buildRakutenSearchUrl(kw),
    qoo10: buildQoo10SearchUrl(kw),
  };
}

/** カード・CTA用: 明示URL優先、無ければ商品名から検索URL */
export type EffectiveAffiliateUrls = {
  amazon: string;
  rakuten: string;
  qoo10: string;
};

/** ランキング補完用: Firestore 拡張フィールドのみ（URL本体は別途マージ済み想定） */
export function marketplaceExtensionForListItem(
  p: OliveYoungProductDetail | null | undefined
): Pick<
  ProductMarketplaceFields,
  | "asin"
  | "amazonImageUrl"
  | "amazonTitle"
  | "rakutenImageUrl"
  | "rakutenTitle"
  | "qoo10ImageUrl"
  | "qoo10Title"
  | "oliveYoungUrl"
  | "oliveYoungImageUrl"
  | "primaryShop"
  | "imageSource"
  | "marketScore"
> {
  if (!p) return {};
  return {
    asin: p.asin,
    amazonImageUrl: p.amazonImageUrl,
    amazonTitle: p.amazonTitle,
    rakutenImageUrl: p.rakutenImageUrl,
    rakutenTitle: p.rakutenTitle,
    qoo10ImageUrl: p.qoo10ImageUrl,
    qoo10Title: p.qoo10Title,
    oliveYoungUrl: p.oliveYoungUrl,
    oliveYoungImageUrl: p.oliveYoungImageUrl,
    primaryShop: p.primaryShop,
    imageSource: p.imageSource,
    marketScore: p.marketScore,
  };
}

export function getEffectiveAffiliateUrls(p: {
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  name?: string;
  nameJa?: string;
}): EffectiveAffiliateUrls {
  const explicitAmazon = (p.amazonUrl ?? "").trim();
  const explicitRakuten = (p.rakutenUrl ?? "").trim();
  const explicitQoo10 = (p.qoo10Url ?? "").trim();
  const kw =
    (p.nameJa ?? "").trim() ||
    (p.name ?? "").trim() ||
    "";
  const fb = kw ? buildMarketplaceLinks(kw) : null;
  return {
    amazon: explicitAmazon || fb?.amazon || "",
    rakuten: explicitRakuten || fb?.rakuten || "",
    qoo10: explicitQoo10 || fb?.qoo10 || "",
  };
}

/**
 * 価格比較の fetchedAt を「更新: YYYY-MM-DD」用に日付のみ整形。無効なら null。
 */
export function formatFetchedAtDate(value: unknown): string | null {
  if (value == null) return null;
  let date: Date | null = null;
  if (typeof value === "string") {
    const trimmed = value.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) date = new Date(parsed);
  } else if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    date = (value as { toDate: () => Date }).toDate();
  } else if (value instanceof Date) {
    date = value;
  }
  if (!date || !Number.isFinite(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 日付・Timestamp を表示用文字列に整形
 */
export function formatDateLike(value: unknown): string {
  if (!value) return "-";

  if (typeof value === "string") return value;

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${h}:${min}`;
  }

  return String(value);
}

/** updatedAt を Firestore Timestamp から Client 境界でも安全な文字列へ */
function toPlainUpdatedAt(v: unknown): string | null {
  if (v == null) return null;
  const s = formatDateLike(v);
  return s === "-" ? null : s;
}

/**
 * 商品IDで公開商品ドキュメントを1件取得
 * 返却: goodsNo, name, brand, productUrl, pickedUrl, imageUrl, thumbnailUrl, source, lastRank, lastSeenRank, lastSeenRunDate, updatedAt
 */
export async function getOliveYoungProductByGoodsNo(
  goodsNo: string
): Promise<OliveYoungProductDetail | null> {
  const trimmed = (goodsNo || "").trim();
  if (!trimmed) return null;

  const snap = await db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(trimmed).get();
  if (!snap.exists) return null;

  const data = snap.data() ?? {};

  return {
    goodsNo: trimmed,
    name: String(data.name ?? "").trim(),
    nameJa: data.nameJa != null ? String(data.nameJa).trim() : undefined,
    summaryJa: data.summaryJa != null ? String(data.summaryJa).trim() : undefined,
    reviewSummaryJa:
      data.reviewSummaryJa != null ? String(data.reviewSummaryJa).trim() : undefined,
    ingredientSummaryJa:
      data.ingredientSummaryJa != null ? String(data.ingredientSummaryJa).trim() : undefined,
    priceComparison: mapPriceComparisonFromFirestore(data.priceComparison),
    brand: String(data.brand ?? "").trim(),
    brandJa: data.brandJa != null ? String(data.brandJa).trim() : undefined,
    productUrl: String(data.productUrl ?? "").trim(),
    pickedUrl: String(data.pickedUrl ?? "").trim(),
    amazonImage: optImageStr(data.amazonImage),
    rakutenImage: optImageStr(data.rakutenImage),
    qoo10Image: optImageStr(data.qoo10Image),
    amazonUrl: optHrefStr(data.amazonUrl),
    rakutenUrl: optHrefStr(data.rakutenUrl),
    qoo10Url: optHrefStr(data.qoo10Url),
    imageUrl: String(data.imageUrl ?? "").trim(),
    thumbnailUrl: String(data.thumbnailUrl ?? "").trim(),
    imageUrls: optImageUrls(data.imageUrls),
    safeImageUrl: optImageStr(data.safeImageUrl),
    hasSafeProductImage: data.hasSafeProductImage === true,
    imageAnalysis: mapImageAnalysisFromFirestore(data.imageAnalysis),
    marketplaceImageMatchLevels: mapMarketplaceImageMatchLevelsFromFirestore(
      data.marketplaceImageMatchLevels
    ),
    source: String(data.source ?? "").trim(),
    lastRank:
      data.lastRank != null && typeof data.lastRank === "number"
        ? data.lastRank
        : null,
    lastSeenRank:
      data.lastSeenRank != null && typeof data.lastSeenRank === "number"
        ? data.lastSeenRank
        : null,
    lastSeenRunDate:
      data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : null,
    updatedAt: toPlainUpdatedAt(data.updatedAt),
    needsNameJa:
      data.needsNameJa === true ? true : data.needsNameJa === false ? false : undefined,
    translationPriority: parseTranslationPriority(data.translationPriority),
    lastNameJaTranslatedAt: toPlainLastNameJaTranslatedAt(
      data.lastNameJaTranslatedAt
    ),
    asin: optPlainStr(data.asin),
    amazonImageUrl: optImageStr(data.amazonImageUrl),
    amazonTitle: optPlainStr(data.amazonTitle),
    rakutenImageUrl: optImageStr(data.rakutenImageUrl),
    rakutenTitle: optPlainStr(data.rakutenTitle),
    qoo10ImageUrl: optImageStr(data.qoo10ImageUrl),
    qoo10Title: optPlainStr(data.qoo10Title),
    oliveYoungUrl: optHrefStr(data.oliveYoungUrl),
    oliveYoungImageUrl: optImageStr(data.oliveYoungImageUrl),
    primaryShop: parsePrimaryShopField(data.primaryShop),
    imageSource: parseRevenueImageSource(data.imageSource),
    marketScore: parseMarketScoreField(data.marketScore),
  };
}

/**
 * 商品カード一覧用（ブランド詳細ページなど）
 */
export type OliveYoungProductCard = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  brand: string;
  brandJa?: string;
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  imageUrl: string;
  thumbnailUrl: string;
  imageUrls?: string[];
  safeImageUrl?: string;
  hasSafeProductImage?: boolean;
  imageAnalysis?: ProductImageAnalysisEntry[];
  marketplaceImageMatchLevels?: ProductImageFields["marketplaceImageMatchLevels"];
  productUrl: string;
  lastRank: number | null;
  lastSeenRunDate: string | null;
} & ProductMarketplaceFields;

/**
 * goodsNos の順で oliveyoung_products_public から商品をまとめて取得
 * 存在するドキュメントのみ返す（順序は引数どおり）
 */
export async function getOliveYoungProductsByGoodsNos(
  goodsNos: string[]
): Promise<OliveYoungProductCard[]> {
  if (!Array.isArray(goodsNos) || goodsNos.length === 0) return [];

  const result: OliveYoungProductCard[] = [];
  for (const g of goodsNos) {
    const p = await getOliveYoungProductByGoodsNo(g);
    if (!p) continue;
    result.push({
      goodsNo: p.goodsNo,
      name: p.name,
      nameJa: p.nameJa,
      brand: p.brand,
      brandJa: p.brandJa,
      amazonImage: p.amazonImage,
      rakutenImage: p.rakutenImage,
      qoo10Image: p.qoo10Image,
      amazonUrl: p.amazonUrl,
      rakutenUrl: p.rakutenUrl,
      qoo10Url: p.qoo10Url,
      imageUrl: p.imageUrl,
      thumbnailUrl: p.thumbnailUrl,
      imageUrls: p.imageUrls,
      safeImageUrl: p.safeImageUrl,
      hasSafeProductImage: p.hasSafeProductImage,
      imageAnalysis: p.imageAnalysis,
      marketplaceImageMatchLevels: p.marketplaceImageMatchLevels,
      productUrl: p.productUrl,
      lastRank: p.lastRank ?? p.lastSeenRank,
      lastSeenRunDate: p.lastSeenRunDate,
      asin: p.asin,
      amazonImageUrl: p.amazonImageUrl,
      amazonTitle: p.amazonTitle,
      rakutenImageUrl: p.rakutenImageUrl,
      rakutenTitle: p.rakutenTitle,
      qoo10ImageUrl: p.qoo10ImageUrl,
      qoo10Title: p.qoo10Title,
      oliveYoungUrl: p.oliveYoungUrl,
      oliveYoungImageUrl: p.oliveYoungImageUrl,
      primaryShop: p.primaryShop,
      imageSource: p.imageSource,
      marketScore: p.marketScore,
    });
  }
  return result;
}

/**
 * 指定商品の直近ランキング情報（取得可能な場合）
 * 現時点では商品ドキュメントの lastRank / lastSeenRank / lastSeenRunDate を利用
 */
export async function getLatestRankForGoodsNo(
  _goodsNo: string
): Promise<{ rank: number; runDate: string } | null> {
  return null;
}

/**
 * サイトマップ用: oliveyoung_products_public の goodsNo 一覧と updatedAt を取得
 */
export type ProductSitemapRow = { goodsNo: string; updatedAt: Date | null };

export async function getProductIdsForSitemap(): Promise<ProductSitemapRow[]> {
  const snap = await db.collection(PRODUCTS_PUBLIC_COLLECTION).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    const raw = data?.updatedAt;
    let updatedAt: Date | null = null;
    if (
      raw &&
      typeof raw === "object" &&
      "toDate" in raw &&
      typeof (raw as { toDate: () => Date }).toDate === "function"
    ) {
      updatedAt = (raw as { toDate: () => Date }).toDate();
    }
    return { goodsNo: doc.id, updatedAt };
  });
}

/**
 * カテゴリページ用: 全商品を最小フィールドで取得（件数上限あり）
 * detectCategory と表示用に利用
 */
export type OliveYoungProductMinimal = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  summaryJa?: string;
  /** 口コミ要約（公開前レポート用・任意） */
  reviewSummaryJa?: string;
  /** 成分解説（公開前レポート用・任意） */
  ingredientSummaryJa?: string;
  brand: string;
  brandJa?: string;
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  imageUrl: string;
  thumbnailUrl: string;
  imageUrls?: string[];
  safeImageUrl?: string;
  hasSafeProductImage?: boolean;
  imageAnalysis?: ProductImageAnalysisEntry[];
  marketplaceImageMatchLevels?: ProductImageFields["marketplaceImageMatchLevels"];
  productUrl: string;
  lastRank: number | null;
  lastSeenRunDate: string | null;
  /** 表示用（Firestore Timestamp は取得時に文字列化済み） */
  updatedAt: string | null;
  /** 翻訳バッチ: 明示的にキューに載せるか（false で除外） */
  needsNameJa?: boolean;
  /** 翻訳バッチの優先度。未設定時はレポート・ジョブがヒューリスティック利用 */
  translationPriority?: TranslationPriority;
  /** nameJa を最後に更新した日時（ISO 文字列推奨） */
  lastNameJaTranslatedAt?: string | null;
} & ProductMarketplaceFields;

const CATEGORY_PAGE_PRODUCT_LIMIT = 5000;

function parseTranslationPriority(v: unknown): TranslationPriority | undefined {
  if (v === "high" || v === "medium" || v === "low") return v;
  return undefined;
}

/**
 * レポート・nightly ジョブ用: `translationPriority` 未設定時は lastRank 1〜50 を medium、それ以外を low。
 * high は Firestore 明示または別ジョブでの付与のみ（フォールバックでは付与しない）。
 */
export function resolveTranslationPriorityForReport(
  p: Pick<OliveYoungProductMinimal, "translationPriority" | "lastRank">
): TranslationPriority {
  const pr = p.translationPriority;
  if (pr === "high" || pr === "medium" || pr === "low") return pr;
  const lr = p.lastRank;
  if (lr != null && lr >= 1 && lr <= 50) return "medium";
  return "low";
}

/** `translationPriority` を無視したときの rank のみ tier（high は返さない） */
export function translationPriorityFromLastRankOnly(
  lastRank: number | null
): "medium" | "low" {
  return resolveTranslationPriorityForReport({
    lastRank,
    translationPriority: undefined,
  }) as "medium" | "low";
}

/**
 * nightly / レポート用: **公開面に載る**なら候補 **high**、それ以外は `lastRank` のみで medium | low。
 */
export function translationPriorityCandidateFromSurfaceAndRank(
  onPublicSurface: boolean,
  lastRank: number | null
): TranslationPriority {
  if (onPublicSurface) return "high";
  return translationPriorityFromLastRankOnly(lastRank);
}

/**
 * nightly 投入用: 候補 tier と既存 Firestore `translationPriority` をマージ。
 * - **既存 high は維持**
 * - **medium を low に下げない**（既存 medium + 候補 low → medium）
 * - 候補 **high** は low/未設定から繰り上げ（公開面など）
 */
export function mergeTranslationPriorityForNightly(
  existing: TranslationPriority | undefined,
  candidate: TranslationPriority
): TranslationPriority {
  if (existing === "high") return "high";
  const rank: Record<TranslationPriority, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };
  const e = existing !== undefined ? rank[existing] : 0;
  const c = rank[candidate];
  if (e >= c) return (existing ?? candidate) as TranslationPriority;
  return candidate;
}

function toPlainLastNameJaTranslatedAt(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (
    typeof v === "object" &&
    v !== null &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export async function getAllOliveYoungProductsMinimal(): Promise<
  OliveYoungProductMinimal[]
> {
  const snap = await db
    .collection(PRODUCTS_PUBLIC_COLLECTION)
    .limit(CATEGORY_PAGE_PRODUCT_LIMIT)
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      goodsNo: doc.id,
      name: String(data.name ?? "").trim(),
      nameJa: data.nameJa != null ? String(data.nameJa).trim() : undefined,
      summaryJa:
        data.summaryJa != null ? String(data.summaryJa).trim() : undefined,
      reviewSummaryJa:
        data.reviewSummaryJa != null
          ? String(data.reviewSummaryJa).trim()
          : undefined,
      ingredientSummaryJa:
        data.ingredientSummaryJa != null
          ? String(data.ingredientSummaryJa).trim()
          : undefined,
      brand: String(data.brand ?? "").trim(),
      brandJa: data.brandJa != null ? String(data.brandJa).trim() : undefined,
      amazonImage: optImageStr(data.amazonImage),
      rakutenImage: optImageStr(data.rakutenImage),
      qoo10Image: optImageStr(data.qoo10Image),
      amazonUrl: optHrefStr(data.amazonUrl),
      rakutenUrl: optHrefStr(data.rakutenUrl),
      qoo10Url: optHrefStr(data.qoo10Url),
      imageUrl: String(data.imageUrl ?? "").trim(),
      thumbnailUrl: String(data.thumbnailUrl ?? "").trim(),
      imageUrls: optImageUrls(data.imageUrls),
      safeImageUrl: optImageStr(data.safeImageUrl),
      hasSafeProductImage: data.hasSafeProductImage === true,
      imageAnalysis: mapImageAnalysisFromFirestore(data.imageAnalysis),
      marketplaceImageMatchLevels: mapMarketplaceImageMatchLevelsFromFirestore(
        data.marketplaceImageMatchLevels
      ),
      productUrl: String(data.productUrl ?? "").trim(),
      lastRank:
        data.lastRank != null && typeof data.lastRank === "number"
          ? data.lastRank
          : null,
      lastSeenRunDate:
        data.lastSeenRunDate != null
          ? String(data.lastSeenRunDate).trim()
          : null,
      updatedAt: toPlainUpdatedAt(data.updatedAt),
      needsNameJa:
        data.needsNameJa === true ? true : data.needsNameJa === false ? false : undefined,
      translationPriority: parseTranslationPriority(data.translationPriority),
      lastNameJaTranslatedAt: toPlainLastNameJaTranslatedAt(
        data.lastNameJaTranslatedAt
      ),
      asin: optPlainStr(data.asin),
      amazonImageUrl: optImageStr(data.amazonImageUrl),
      amazonTitle: optPlainStr(data.amazonTitle),
      rakutenImageUrl: optImageStr(data.rakutenImageUrl),
      rakutenTitle: optPlainStr(data.rakutenTitle),
      qoo10ImageUrl: optImageStr(data.qoo10ImageUrl),
      qoo10Title: optPlainStr(data.qoo10Title),
      oliveYoungUrl: optHrefStr(data.oliveYoungUrl),
      oliveYoungImageUrl: optImageStr(data.oliveYoungImageUrl),
      primaryShop: parsePrimaryShopField(data.primaryShop),
      imageSource: parseRevenueImageSource(data.imageSource),
      marketScore: parseMarketScoreField(data.marketScore),
    };
  });
}
