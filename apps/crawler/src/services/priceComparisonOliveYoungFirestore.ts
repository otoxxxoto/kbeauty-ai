/**
 * priceComparison.oliveyoung 補完ジョブ専用 Firestore アクセス。
 * oliveyoung_products_public の読み取りと priceComparison.oliveyoung の merge 更新のみ。
 * 他チャネル（amazon / rakuten / qoo10）は触らない。ランキング本体は呼ばない。
 */
import { FieldValue, Firestore } from "@google-cloud/firestore";

const COLLECTION = "oliveyoung_products_public";

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export type ProductForPriceComparisonOliveYoung = {
  goodsNo: string;
  productUrl: string;
  name?: string;
  nameJa?: string;
};

/** 対象理由（未取得 vs 古いので再取得） */
export type OliveYoungPriceTargetReason = "missing" | "stale";

export type ProductForPriceComparisonOliveYoungWithReason = ProductForPriceComparisonOliveYoung & {
  reason: OliveYoungPriceTargetReason;
};

/** Firestore の fetchedAt（Timestamp / Date / string）を Date に変換。無効なら null */
export function parseFetchedAt(raw: unknown): Date | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed);
    return null;
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "toDate" in raw &&
    typeof (raw as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (raw as { toDate: () => Date }).toDate();
    return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
  }
  if (raw instanceof Date && Number.isFinite(raw.getTime())) return raw;
  return null;
}

/** priceComparison.oliveyoung で価格が未取得か（priceText が無い or 空） */
export function hasMissingOliveYoungPrice(oliveyoung: unknown): boolean {
  if (!oliveyoung || typeof oliveyoung !== "object") return true;
  const o = oliveyoung as Record<string, unknown>;
  const priceText = o.priceText != null ? String(o.priceText).trim() : "";
  return priceText === "";
}

/** priceComparison.oliveyoung が古いか（fetchedAt が無い or 指定日数より前） */
export function isOliveYoungPriceStale(
  oliveyoung: unknown,
  refetchDays: number
): boolean {
  if (refetchDays <= 0) return false;
  if (!oliveyoung || typeof oliveyoung !== "object") return true;
  const o = oliveyoung as Record<string, unknown>;
  const fetchedAt = parseFetchedAt(o.fetchedAt);
  if (!fetchedAt) return true;
  const now = Date.now();
  const threshold = refetchDays * 24 * 60 * 60 * 1000;
  return now - fetchedAt.getTime() >= threshold;
}

/** 再取得対象か（未取得 or 古い） */
export function shouldRefetchOliveYoungPrice(
  oliveyoung: unknown,
  refetchDays: number
): boolean {
  if (hasMissingOliveYoungPrice(oliveyoung)) return true;
  return isOliveYoungPriceStale(oliveyoung, refetchDays);
}

const DEFAULT_REFETCH_DAYS = 14;

/**
 * productUrl があり、未取得 or 古い（fetchedAt が無い or refetchDays より前）の商品を取得。
 * refetchDays は環境変数 PRICE_REFETCH_DAYS で上書き可能。0 のときは未取得のみ。
 */
export async function getProductsMissingOliveYoungPrice(
  limit: number,
  refetchDays: number = DEFAULT_REFETCH_DAYS
): Promise<ProductForPriceComparisonOliveYoungWithReason[]> {
  const n = Math.min(Math.max(1, limit), 500);
  const db = getDb();
  const snap = await db
    .collection(COLLECTION)
    .orderBy("updatedAt", "desc")
    .limit(400)
    .get();

  const list: ProductForPriceComparisonOliveYoungWithReason[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const productUrl = data.productUrl != null ? String(data.productUrl).trim() : "";
    if (!productUrl) continue;

    const pc = data.priceComparison;
    const oliveyoung = pc && typeof pc === "object" ? pc.oliveyoung : undefined;
    if (!shouldRefetchOliveYoungPrice(oliveyoung, refetchDays)) continue;

    const reason: OliveYoungPriceTargetReason = hasMissingOliveYoungPrice(oliveyoung)
      ? "missing"
      : "stale";

    list.push({
      goodsNo: doc.id,
      productUrl,
      name: data.name != null ? String(data.name).trim() : undefined,
      nameJa: data.nameJa != null ? String(data.nameJa).trim() : undefined,
      reason,
    });
  }

  return list.slice(0, n);
}

export type OliveYoungPriceEntry = {
  label: string;
  priceText: string;
  url: string;
  fetchedAt: unknown;
  source?: string;
};

/**
 * priceComparison.oliveyoung のみ merge。既存の priceComparison.amazon 等は保持する。
 */
export async function updateProductPriceComparisonOliveYoung(
  goodsNo: string,
  entry: OliveYoungPriceEntry
): Promise<void> {
  const trimmed = (goodsNo || "").trim();
  if (!trimmed || !entry?.url?.trim()) return;

  const db = getDb();
  const ref = db.collection(COLLECTION).doc(trimmed);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() ?? {} : {};
  const existingPc = data.priceComparison && typeof data.priceComparison === "object"
    ? { ...data.priceComparison }
    : {};

  await ref.set(
    {
      priceComparison: {
        ...existingPc,
        oliveyoung: {
          label: entry.label,
          priceText: entry.priceText,
          url: entry.url,
          fetchedAt: entry.fetchedAt,
          ...(entry.source != null && entry.source !== "" && { source: entry.source }),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
