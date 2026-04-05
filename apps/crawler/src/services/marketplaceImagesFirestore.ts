/**
 * oliveyoung_products_public の Amazon / 楽天 / Qoo10 画像フィールド更新
 *
 * 注意: Firestore に isBrandManuallyEdited === true がある商品では、別経路のジョブが brandJa を上書きしないこと
 * （Web 管理画面の手動ブランドと整合させるため）。
 */
import { FieldValue, Firestore } from "@google-cloud/firestore";
import {
  collectTopDisplayedImageSlots,
  collectRankingTopMergedForDiag,
  isResolvedDisplayPlaceholderUrl,
} from "../lib/topPageDisplayedSlotsFirestore";
import { detectMarketplaceProductType } from "../utils/marketplaceImageMatch";
import type { MarketplaceImageMatchLevel } from "../utils/marketplaceImageMatch";

const COLLECTION = "oliveyoung_products_public";
const RANKINGS_COLLECTION = "oliveyoung_rankings";

async function getLatestRankingRunDate(db: Firestore): Promise<string | null> {
  const snap = await db.collection(RANKINGS_COLLECTION).get();
  const dates = snap.docs.map((d) => d.id).filter(Boolean);
  dates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return dates[0] ?? null;
}

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

function str(v: unknown): string {
  return v != null ? String(v).trim() : "";
}

export type ProductForMarketplaceImageJob = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  brand: string;
  brandJa?: string;
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
};

/**
 * 誤った weak 補完の手動クリア用（最低限の既知 goodsNo）
 * ジョブ実行時にも自動で marketplace フィールドを消す。
 */
export const GOODS_NOS_FORCE_CLEAR_MARKETPLACE_DEVICE_WEAK = new Set<string>([
  "A000000247573",
]);

/**
 * marketplace 補完で入れた画像・imageAnalysis 行・（該当時）safeImageUrl を削除。
 * device の誤 weak 残り除去・手動リスト用。
 */
export async function clearMarketplaceFillImagesForGoodsNo(goodsNo: string): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(goodsNo);
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data() ?? {};
  const removedUrls = new Set<string>();
  const prev = Array.isArray(d.imageAnalysis) ? d.imageAnalysis : [];
  const kept = prev.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const o = item as Record<string, unknown>;
    if (str(o.source) === "marketplace_image_fill_job") {
      const u = str(o.url);
      if (u) removedUrls.add(u);
      return false;
    }
    return true;
  });
  for (const key of ["amazonImage", "rakutenImage", "qoo10Image"] as const) {
    const u = str(d[key]);
    if (u) removedUrls.add(u);
  }
  const payload: Record<string, unknown> = {
    amazonImage: FieldValue.delete(),
    rakutenImage: FieldValue.delete(),
    qoo10Image: FieldValue.delete(),
    imageAnalysis: kept,
    marketplaceImageMatchLevels: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const safe = str(d.safeImageUrl);
  if (safe && removedUrls.has(safe)) {
    payload.safeImageUrl = FieldValue.delete();
    payload.hasSafeProductImage = false;
  }
  await ref.set(payload, { merge: true });
}

/**
 * device かつ Firestore に weak の marketplace 採用が残っている／強制リストに入っているとき、
 * 補完由来のモール画像をクリアする。
 */
export async function clearStaleDeviceWeakMarketplaceFillIfNeeded(
  goodsNo: string,
  product: { name?: string; nameJa?: string; brand?: string; brandJa?: string }
): Promise<boolean> {
  if (GOODS_NOS_FORCE_CLEAR_MARKETPLACE_DEVICE_WEAK.has(goodsNo)) {
    await clearMarketplaceFillImagesForGoodsNo(goodsNo);
    return true;
  }
  if (detectMarketplaceProductType(product) !== "device") return false;
  const db = getDb();
  const snap = await db.collection(COLLECTION).doc(goodsNo).get();
  if (!snap.exists) return false;
  const d = snap.data() ?? {};
  const levels = d.marketplaceImageMatchLevels;
  if (!levels || typeof levels !== "object") return false;
  for (const v of Object.values(levels as Record<string, unknown>)) {
    if (v === "weak") {
      await clearMarketplaceFillImagesForGoodsNo(goodsNo);
      return true;
    }
  }
  return false;
}

export type MarketImageFillTarget = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  brand: string;
  brandJa?: string;
  /** 補完優先: 1 急上昇 → 2 注目 → 3 全体ランキング → 4 カテゴリ（将来） */
  source: "top_rising" | "top_spotlight" | "ranking" | "category";
  rank?: number;
};

/**
 * TOP（急上昇・注目）とランキング上位から、
 * Web 表示と同じ解決で画像 URL が空の商品を抽出。
 *
 * 優先順: TOP急上昇 → TOP注目 → ランキング上位 →（将来）カテゴリ上位
 */
export async function getMarketImageFillTargets(options: {
  /** TOP のみ（急上昇+注目）。ランキングは含めない */
  topOnly?: boolean;
  /** TOP をスキップしランキング（と将来カテゴリ）のみ */
  rankingOnly?: boolean;
  /** ランキング上位 N 件（0 でランキング対象外） */
  rankingTop?: number;
  /** 全体の取得上限 */
  limit?: number;
}): Promise<MarketImageFillTarget[]> {
  const limit = Math.min(Math.max(1, options.limit ?? 20), 100);
  const rankingTop = options.rankingTop ?? 30;
  const db = getDb();

  const out: MarketImageFillTarget[] = [];
  const seen = new Set<string>();

  const addTarget = (t: MarketImageFillTarget) => {
    const g = (t.goodsNo || "").trim();
    if (!g || seen.has(g)) return;
    seen.add(g);
    out.push(t);
  };

  let runDateLatest: string | null = null;

  if (!options.rankingOnly) {
    const { slots, runDateLatest: latest } = await collectTopDisplayedImageSlots(db, {
      risingMax: 5,
      spotlightN: 3,
    });
    runDateLatest = latest;
    for (const s of slots) {
      if (s.resolvedImageUrl.trim() && !isResolvedDisplayPlaceholderUrl(s.resolvedImageUrl))
        continue;
      addTarget({
        goodsNo: s.goodsNo,
        name: s.name,
        nameJa: s.nameJa,
        brand: s.brand,
        brandJa: s.brandJa,
        source: s.section === "rising" ? "top_rising" : "top_spotlight",
        rank: s.rank,
      });
    }
  } else {
    runDateLatest = await getLatestRankingRunDate(db);
  }

  if (!options.topOnly && runDateLatest && rankingTop > 0) {
    const rankingRows = await collectRankingTopMergedForDiag(
      db,
      runDateLatest,
      Math.max(rankingTop, 50)
    );
    for (const r of rankingRows.slice(0, rankingTop)) {
      if (r.resolvedImageUrl.trim() && !isResolvedDisplayPlaceholderUrl(r.resolvedImageUrl))
        continue;
      addTarget({
        goodsNo: r.goodsNo,
        name: r.name,
        nameJa: r.nameJa,
        brand: r.brand,
        brandJa: r.brandJa,
        source: "ranking",
        rank: r.rank,
      });
    }
  }

  // 優先4 カテゴリ上位: Firestore にカテゴリ別ランキングが無いため未実装（source: "category" は将来用）

  return out.slice(0, limit);
}

/**
 * 指定 goodsNo の商品を診断用ターゲットとして取得
 */
export async function getMarketImageFillTargetsForGoodsNos(
  goodsNos: string[]
): Promise<MarketImageFillTarget[]> {
  if (!goodsNos.length) return [];
  const db = getDb();
  const ids = [...new Set(goodsNos.map((g) => String(g).trim()).filter(Boolean))];
  const refs = ids.map((id) => db.collection(COLLECTION).doc(id));
  const snaps = await db.getAll(...refs);
  const out: MarketImageFillTarget[] = [];
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i];
    if (!snap.exists) continue;
    const d = snap.data() ?? {};
    const name = str(d.name);
    const nameJa = str(d.nameJa);
    if (!name && !nameJa) continue;
    out.push({
      goodsNo: snap.id,
      name: name || nameJa,
      nameJa: nameJa || undefined,
      brand: str(d.brand),
      brandJa: str(d.brandJa) || undefined,
      source: "ranking",
    });
  }
  return out;
}

/**
 * いずれかのマーケット画像が未取得の商品を取得（updatedAt 新しい順）
 */
export async function getProductsMissingMarketplaceImages(
  limit: number
): Promise<ProductForMarketplaceImageJob[]> {
  const n = Math.min(Math.max(1, limit), 200);
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy("updatedAt", "desc").limit(500).get();

  const out: ProductForMarketplaceImageJob[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const name = str(d.name);
    const brand = str(d.brand);
    if (!name && !str(d.nameJa)) continue;

    const amazonImage = str(d.amazonImage);
    const rakutenImage = str(d.rakutenImage);
    const qoo10Image = str(d.qoo10Image);
    if (amazonImage && rakutenImage && qoo10Image) continue;

    out.push({
      goodsNo: doc.id,
      name,
      nameJa: str(d.nameJa) || undefined,
      brand,
      brandJa: str(d.brandJa) || undefined,
      amazonImage: amazonImage || undefined,
      rakutenImage: rakutenImage || undefined,
      qoo10Image: qoo10Image || undefined,
    });
    if (out.length >= n) break;
  }
  return out;
}

/**
 * imageAnalysis に同一 URL のエントリを merge（Web 表示用・containsPerson: false 必須）
 */
function mergeImageAnalysisForUrls(
  existing: unknown,
  urls: string[]
): Record<string, unknown>[] {
  const prev = Array.isArray(existing) ? existing : [];
  const normalized = urls.map((u) => u.trim()).filter(Boolean);
  const kept = prev.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const u = str((item as Record<string, unknown>).url);
    return !normalized.includes(u);
  });
  for (const url of normalized) {
    kept.push({
      url,
      containsPerson: false,
      confidence: 1,
      isPreferredProductImage: true,
      source: "marketplace_image_fill_job",
    });
  }
  return kept as Record<string, unknown>[];
}

/**
 * 空でないフィールドのみ merge 更新（従来・imageAnalysis は触らない）
 */
export async function updateMarketplaceProductImages(
  goodsNo: string,
  fields: { amazonImage?: string; rakutenImage?: string; qoo10Image?: string }
): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(goodsNo);
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    marketplaceImagesUpdatedAt: FieldValue.serverTimestamp(),
  };
  if (fields.amazonImage?.trim()) payload.amazonImage = fields.amazonImage.trim();
  if (fields.rakutenImage?.trim()) payload.rakutenImage = fields.rakutenImage.trim();
  if (fields.qoo10Image?.trim()) payload.qoo10Image = fields.qoo10Image.trim();
  await ref.set(payload, { merge: true });
}

/**
 * マーケット画像を保存し、imageAnalysis に同一 URL を merge（Web 表示に必須）
 */
export async function updateMarketplaceProductImagesWithAnalysis(
  goodsNo: string,
  fields: { amazonImage?: string; rakutenImage?: string; qoo10Image?: string },
  options?: {
    imageMatchLevels?: Partial<
      Record<"amazon" | "rakuten" | "qoo10", MarketplaceImageMatchLevel>
    >;
  }
): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(goodsNo);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() ?? {} : {};

  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    marketplaceImagesUpdatedAt: FieldValue.serverTimestamp(),
  };
  const urlsToMerge: string[] = [];
  if (fields.amazonImage?.trim()) {
    payload.amazonImage = fields.amazonImage.trim();
    urlsToMerge.push(fields.amazonImage.trim());
  }
  if (fields.rakutenImage?.trim()) {
    payload.rakutenImage = fields.rakutenImage.trim();
    urlsToMerge.push(fields.rakutenImage.trim());
  }
  if (fields.qoo10Image?.trim()) {
    payload.qoo10Image = fields.qoo10Image.trim();
    urlsToMerge.push(fields.qoo10Image.trim());
  }
  if (urlsToMerge.length > 0) {
    payload.imageAnalysis = mergeImageAnalysisForUrls(
      existing.imageAnalysis,
      urlsToMerge
    );
  }
  const optLevels = options?.imageMatchLevels;
  if (optLevels && Object.keys(optLevels).length > 0) {
    const prev =
      existing.marketplaceImageMatchLevels &&
      typeof existing.marketplaceImageMatchLevels === "object"
        ? {
            ...(existing.marketplaceImageMatchLevels as Record<
              string,
              MarketplaceImageMatchLevel
            >),
          }
        : ({} as Record<string, MarketplaceImageMatchLevel>);
    for (const mk of ["amazon", "rakuten", "qoo10"] as const) {
      const v = optLevels[mk];
      if (v) prev[mk] = v;
    }
    payload.marketplaceImageMatchLevels = prev;
  }
  await ref.set(payload, { merge: true });
}
