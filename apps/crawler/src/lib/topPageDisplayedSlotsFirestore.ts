/**
 * Web /oliveyoung TOP の「画像付き商品カード」だけを対象にしたスロット一覧。
 * 急上昇（最大 risingMax）→ 今日の注目 TOP N の順（page.tsx と一致）。
 */
import { Firestore } from "@google-cloud/firestore";
import {
  getRankingItems,
  pickRisingCandidates,
  type RankingItemRow,
} from "./topPageGoodsNosFirestore";

const RANKINGS_COLLECTION = "oliveyoung_rankings";
const PRODUCTS_COLLECTION = "oliveyoung_products_public";

function looksLikeOliveYoungGoodsNo(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const s = value.trim();
  return /^A\d{10,}$/.test(s);
}

function isUnsafeBrandJa(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  if (t.length > 40) return true;
  if (/[\r\n]/.test(value)) return true;
  if (/THINK:/i.test(t)) return true;
  if (t.includes("ユーザーは")) return true;
  return false;
}

function resolveRankingItemName(rowName: string, publicName: string | undefined): string {
  const r = rowName.trim();
  const p = (publicName ?? "").trim();
  if (r && !looksLikeOliveYoungGoodsNo(r)) return r;
  if (p && !looksLikeOliveYoungGoodsNo(p)) return p;
  return "";
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

async function getRankingRunDates(db: Firestore): Promise<string[]> {
  const snap = await db.collection(RANKINGS_COLLECTION).get();
  const dates = snap.docs.map((d) => d.id).filter(Boolean);
  dates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return dates;
}

/** apps/web resolveProductDisplayImageUrl と同順（プレースホルダー含む）。diagTopPageProductImagesJob と同期 */
const OLIVEYOUNG_PLACEHOLDER_PATH = "/oliveyoung-product-placeholder.svg";

function isMarketplaceHostUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("amazon.") ||
    u.includes("media-amazon") ||
    u.includes("ssl-images-amazon") ||
    u.includes("rakuten.") ||
    u.includes("qoo10") ||
    u.includes("qoo-img.com")
  );
}

function isOyStyleProductImageUrl(url: string): boolean {
  return url.trim() !== "" && !isMarketplaceHostUrl(url);
}

export function resolveProductDisplayImageUrlLikeWeb(p: {
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  safeImageUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  imageUrls?: string[];
  imageAnalysis?: { url: string; containsPerson: boolean }[];
  marketplaceImageMatchLevels?: Record<string, unknown>;
}): string {
  const safe = (p.safeImageUrl ?? "").trim();
  if (safe) return safe;

  const seen = new Set<string>();
  const oyList: string[] = [];
  const collect = (u?: string) => {
    const t = (u ?? "").trim();
    if (!t || seen.has(t)) return;
    if (!isOyStyleProductImageUrl(t)) return;
    seen.add(t);
    oyList.push(t);
  };
  collect(p.imageUrl);
  collect(p.thumbnailUrl);
  if (Array.isArray(p.imageUrls)) {
    for (const x of p.imageUrls) {
      if (typeof x === "string") collect(x);
    }
  }
  const analysisForUrl = (url: string) =>
    p.imageAnalysis?.find((e) => e.url === url.trim());

  const allowOyPerson = process.env.ALLOW_OY_PERSON_IMAGE === "true";
  for (const u of oyList) {
    const a = analysisForUrl(u);
    if (a && !a.containsPerson) return u;
    if (allowOyPerson && (!a || a.containsPerson)) return u;
  }

  const channelOk = (channel: "amazon" | "rakuten" | "qoo10"): boolean => {
    const levels = p.marketplaceImageMatchLevels;
    if (!levels || typeof levels !== "object") return true;
    const keys = Object.keys(levels).filter((k) =>
      ["amazon", "rakuten", "qoo10"].includes(k)
    );
    if (keys.length === 0) return true;
    return levels[channel] === "strong";
  };

  const tryM = (u: string | undefined, ch: "amazon" | "rakuten" | "qoo10") => {
    const url = (u ?? "").trim();
    if (!url) return "";
    if (!channelOk(ch)) return "";
    const a = analysisForUrl(url);
    if (!a) return "";
    if (a.containsPerson) return "";
    return url;
  };

  return (
    tryM(p.amazonImage, "amazon") ||
    tryM(p.rakutenImage, "rakuten") ||
    tryM(p.qoo10Image, "qoo10") ||
    OLIVEYOUNG_PLACEHOLDER_PATH
  );
}

/** プレースホルダーのみのときはマーケット補完対象に含める */
export function isResolvedDisplayPlaceholderUrl(url: string): boolean {
  const t = url.trim();
  return t === OLIVEYOUNG_PLACEHOLDER_PATH || t.includes("oliveyoung-product-placeholder.svg");
}

export type TopImageCardSection = "rising" | "spotlight";

export type TopDisplayedImageSlot = {
  section: TopImageCardSection;
  /** セクション内の表示順（1 始まり） */
  slotIndex: number;
  goodsNo: string;
  rank: number;
  rankDiff: number | null;
  isNew: boolean;
  name: string;
  nameJa?: string;
  brand: string;
  brandJa?: string;
  /** Web と同じ解決結果 */
  resolvedImageUrl: string;
};

export type CollectTopDisplayedSlotsOptions = {
  risingMax?: number;
  spotlightN?: number;
};

async function mergeRowWithPublic(
  db: Firestore,
  row: RankingItemRow
): Promise<{
  name: string;
  nameJa?: string;
  brand: string;
  brandJa?: string;
  resolvedImageUrl: string;
}> {
  const snap = await db.collection(PRODUCTS_COLLECTION).doc(row.goodsNo).get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const name = resolveRankingItemName(row.name, str(d.name) || undefined);
  const brand = (row.brand || str(d.brand) || "").trim();
  const nameJaRaw = str(d.nameJa);
  const nameJa = nameJaRaw || undefined;
  const brandJaRaw = str(d.brandJa);
  const brandJa =
    brandJaRaw && !isUnsafeBrandJa(brandJaRaw) ? brandJaRaw : undefined;

  const imageAnalysis = Array.isArray(d.imageAnalysis) ? d.imageAnalysis : null;
  const imageUrlsRaw = Array.isArray(d.imageUrls)
    ? d.imageUrls.map((x: unknown) => str(x)).filter(Boolean)
    : undefined;
  const resolvedImageUrl = resolveProductDisplayImageUrlLikeWeb({
    amazonImage: str(d.amazonImage) || undefined,
    rakutenImage: str(d.rakutenImage) || undefined,
    qoo10Image: str(d.qoo10Image) || undefined,
    safeImageUrl: str(d.safeImageUrl) || undefined,
    imageUrl: str(d.imageUrl) || undefined,
    thumbnailUrl: str(d.thumbnailUrl) || undefined,
    imageUrls: imageUrlsRaw && imageUrlsRaw.length > 0 ? imageUrlsRaw : undefined,
    marketplaceImageMatchLevels:
      d.marketplaceImageMatchLevels && typeof d.marketplaceImageMatchLevels === "object"
        ? (d.marketplaceImageMatchLevels as Record<string, unknown>)
        : undefined,
    imageAnalysis:
      imageAnalysis?.map((x: unknown) => {
        if (!x || typeof x !== "object") return { url: "", containsPerson: true };
        const o = x as Record<string, unknown>;
        return {
          url: str(o.url),
          containsPerson: o.containsPerson === true,
        };
      }) ?? undefined,
  });

  return { name, nameJa, brand, brandJa, resolvedImageUrl };
}

/**
 * TOP で画像カードとして出る商品スロット（急上昇 → 注目 TOP N）
 */
export async function collectTopDisplayedImageSlots(
  db: Firestore,
  options: CollectTopDisplayedSlotsOptions = {}
): Promise<{
  slots: TopDisplayedImageSlot[];
  runDateLatest: string | null;
  runDatesCount: number;
}> {
  const risingMax = options.risingMax ?? 5;
  const spotlightN = options.spotlightN ?? 3;

  const runDates = await getRankingRunDates(db);
  if (runDates.length === 0) {
    return { slots: [], runDateLatest: null, runDatesCount: 0 };
  }

  const latest = runDates[0];
  const latestItems = await getRankingItems(db, latest);
  if (!latestItems) {
    return { slots: [], runDateLatest: latest, runDatesCount: runDates.length };
  }

  const slots: TopDisplayedImageSlot[] = [];

  if (runDates.length >= 2) {
    const prevItems = await getRankingItems(db, runDates[1]);
    if (prevItems) {
      const rising = pickRisingCandidates(latestItems, prevItems, risingMax);
      let idx = 0;
      for (const c of rising) {
        idx += 1;
        const m = await mergeRowWithPublic(db, c.row);
        slots.push({
          section: "rising",
          slotIndex: idx,
          goodsNo: c.row.goodsNo,
          rank: c.row.rank,
          rankDiff: typeof c.rankDiff === "number" ? c.rankDiff : c.row.rankDiff,
          isNew: c.isNew,
          name: m.name,
          nameJa: m.nameJa,
          brand: m.brand,
          brandJa: m.brandJa,
          resolvedImageUrl: m.resolvedImageUrl,
        });
      }
    }
  }

  let spotIdx = 0;
  for (const row of latestItems.slice(0, spotlightN)) {
    spotIdx += 1;
    const m = await mergeRowWithPublic(db, row);
    slots.push({
      section: "spotlight",
      slotIndex: spotIdx,
      goodsNo: row.goodsNo,
      rank: row.rank,
      rankDiff: row.rankDiff,
      isNew: row.isNew,
      name: m.name,
      nameJa: m.nameJa,
      brand: m.brand,
      brandJa: m.brandJa,
      resolvedImageUrl: m.resolvedImageUrl,
    });
  }

  return {
    slots,
    runDateLatest: latest,
    runDatesCount: runDates.length,
  };
}

/**
 * Web TOP と同じ「急上昇 → 今日の注目」スロットに載る goodsNo だけを、表示順で一意化。
 * translate-top-product-names 等で再利用する。
 */
export async function collectTopRisingAndSpotlightGoodsNos(
  db: Firestore,
  options: CollectTopDisplayedSlotsOptions = {}
): Promise<{
  goodsNos: string[];
  runDateLatest: string | null;
  runDatesCount: number;
}> {
  const { slots, runDateLatest, runDatesCount } = await collectTopDisplayedImageSlots(
    db,
    options
  );
  const seen = new Set<string>();
  const goodsNos: string[] = [];
  for (const s of slots) {
    const g = (s.goodsNo || "").trim();
    if (!g || seen.has(g)) continue;
    seen.add(g);
    goodsNos.push(g);
  }
  return { goodsNos, runDateLatest, runDatesCount };
}

/** 診断用: 最新 runDate のランキング上位を public とマージ（画像解決付き） */
export async function collectRankingTopMergedForDiag(
  db: Firestore,
  runDate: string,
  limit: number
): Promise<
  Array<{
    goodsNo: string;
    rank: number;
    name: string;
    nameJa?: string;
    brand: string;
    brandJa?: string;
    resolvedImageUrl: string;
  }>
> {
  const items = await getRankingItems(db, runDate);
  if (!items) return [];
  const out: Array<{
    goodsNo: string;
    rank: number;
    name: string;
    nameJa?: string;
    brand: string;
    brandJa?: string;
    resolvedImageUrl: string;
  }> = [];
  for (const row of items.slice(0, limit)) {
    const m = await mergeRowWithPublic(db, row);
    out.push({
      goodsNo: row.goodsNo,
      rank: row.rank,
      name: m.name,
      nameJa: m.nameJa,
      brand: m.brand,
      brandJa: m.brandJa,
      resolvedImageUrl: m.resolvedImageUrl,
    });
  }
  return out;
}

export { PRODUCTS_COLLECTION as TOP_DISPLAYED_PRODUCTS_COLLECTION };
