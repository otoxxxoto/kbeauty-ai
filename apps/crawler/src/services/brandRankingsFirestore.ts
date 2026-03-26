/**
 * brand_rankings Firestore 読み書き（brandJa 補填ジョブ用）
 * brand_rankings/{runDate} / brand_rankings/{runDate}/items/{brandKey}
 */
import { FieldValue, Firestore } from "@google-cloud/firestore";

const BRAND_RANKINGS_COLLECTION = "brand_rankings";

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export type BrandRankingItemForBrandJa = {
  brandKey: string;
  brand: string;
  rank?: number;
  count?: number;
};

export type GetBrandRankingItemsMissingBrandJaStats = {
  /** 今回処理する件数（最大 limit） */
  targets: BrandRankingItemForBrandJa[];
  totalItemDocs: number;
  skippedHasBrandJa: number;
  skippedEmptyBrand: number;
  /** limit 適用前の brandJa 未設定かつ brand ありの件数 */
  missingBeforeLimit: number;
};

/**
 * 指定 runDate の items をスキャンし、brand あり・brandJa なしの統計付きで先頭 limit 件を返す
 */
export async function getBrandRankingItemsMissingBrandJaWithStats(
  runDate: string,
  limit: number
): Promise<GetBrandRankingItemsMissingBrandJaStats> {
  const runDateTrimmed = (runDate || "").trim();
  if (!runDateTrimmed) {
    return {
      targets: [],
      totalItemDocs: 0,
      skippedHasBrandJa: 0,
      skippedEmptyBrand: 0,
      missingBeforeLimit: 0,
    };
  }

  const n = Math.min(Math.max(1, limit), 500);
  const db = getDb();
  const itemsRef = db
    .collection(BRAND_RANKINGS_COLLECTION)
    .doc(runDateTrimmed)
    .collection("items");

  const snap = await itemsRef.get();
  const missing: BrandRankingItemForBrandJa[] = [];
  let skippedHasBrandJa = 0;
  let skippedEmptyBrand = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const brand = data.brand != null ? String(data.brand).trim() : "";
    const brandJa = data.brandJa != null ? String(data.brandJa).trim() : "";
    if (brand === "") {
      skippedEmptyBrand += 1;
      continue;
    }
    if (brandJa !== "") {
      skippedHasBrandJa += 1;
      continue;
    }

    missing.push({
      brandKey: doc.id,
      brand,
      rank: data.rank != null ? Number(data.rank) : undefined,
      count: data.count != null ? Number(data.count) : undefined,
    });
  }

  missing.sort((a, b) => {
    const ra = a.rank ?? 9999;
    const rb = b.rank ?? 9999;
    return ra - rb;
  });

  const missingBeforeLimit = missing.length;

  return {
    targets: missing.slice(0, n),
    totalItemDocs: snap.size,
    skippedHasBrandJa,
    skippedEmptyBrand,
    missingBeforeLimit,
  };
}

/**
 * 指定 runDate の items のうち brand あり・brandJa なしのものを取得（先頭 limit 件）
 */
export async function getBrandRankingItemsMissingBrandJa(
  runDate: string,
  limit: number
): Promise<BrandRankingItemForBrandJa[]> {
  const { targets } = await getBrandRankingItemsMissingBrandJaWithStats(
    runDate,
    limit
  );
  return targets;
}

/**
 * brand_rankings/{runDate}/items/{brandKey} に brandJa と brandJaUpdatedAt を保存
 */
export async function updateBrandRankingBrandJa(
  runDate: string,
  brandKey: string,
  brandJa: string
): Promise<void> {
  const runDateTrimmed = (runDate || "").trim();
  const brandKeyTrimmed = (brandKey || "").trim();
  if (!runDateTrimmed || !brandKeyTrimmed) return;

  const db = getDb();
  const ref = db
    .collection(BRAND_RANKINGS_COLLECTION)
    .doc(runDateTrimmed)
    .collection("items")
    .doc(brandKeyTrimmed);

  await ref.set(
    {
      brandJa: brandJa.trim(),
      brandJaUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** brandSummaryJa 補完ジョブ用: 最新 runDate を1件取得 */
export async function getLatestBrandRankingRunDate(): Promise<string | null> {
  const db = getDb();
  const snap = await db.collection(BRAND_RANKINGS_COLLECTION).get();
  if (snap.empty) return null;
  const ids = snap.docs.map((d) => d.id).filter(Boolean);
  ids.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return ids[0] ?? null;
}

export type BrandRankingItemForBrandSummaryJa = {
  brandKey: string;
  brand: string;
  brandJa?: string;
  rank?: number;
  count?: number;
  bestRank?: number;
};

/**
 * 指定 runDate の items のうち brandSummaryJa が無い・空のものを取得（先頭 limit 件）
 * ランキング本体は呼ばない。読み取りのみ。
 */
export async function getBrandRankingItemsMissingBrandSummaryJa(
  runDate: string,
  limit: number
): Promise<BrandRankingItemForBrandSummaryJa[]> {
  const runDateTrimmed = (runDate || "").trim();
  if (!runDateTrimmed) return [];

  const n = Math.min(Math.max(1, limit), 500);
  const db = getDb();
  const itemsRef = db
    .collection(BRAND_RANKINGS_COLLECTION)
    .doc(runDateTrimmed)
    .collection("items");

  const snap = await itemsRef.get();
  const missing: BrandRankingItemForBrandSummaryJa[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const brand = data.brand != null ? String(data.brand).trim() : "";
    const brandSummaryJa = data.brandSummaryJa != null ? String(data.brandSummaryJa).trim() : "";
    if (brand === "" || brandSummaryJa !== "") continue;

    missing.push({
      brandKey: doc.id,
      brand,
      brandJa: data.brandJa != null ? String(data.brandJa).trim() : undefined,
      rank: data.rank != null ? Number(data.rank) : undefined,
      count: data.count != null ? Number(data.count) : undefined,
      bestRank: data.bestRank != null ? Number(data.bestRank) : undefined,
    });
  }

  missing.sort((a, b) => {
    const ra = a.rank ?? 9999;
    const rb = b.rank ?? 9999;
    return ra - rb;
  });

  return missing.slice(0, n);
}

/**
 * brand_rankings/{runDate}/items/{brandKey} に brandSummaryJa を merge 保存
 * 既存フィールドは壊さない。将来 AI 生成に差し替え可能なように呼び出し側で文字列を生成する。
 */
export async function updateBrandRankingBrandSummaryJa(
  runDate: string,
  brandKey: string,
  brandSummaryJa: string
): Promise<void> {
  const runDateTrimmed = (runDate || "").trim();
  const brandKeyTrimmed = (brandKey || "").trim();
  const text = (brandSummaryJa || "").trim();
  if (!runDateTrimmed || !brandKeyTrimmed || !text) return;

  const db = getDb();
  const ref = db
    .collection(BRAND_RANKINGS_COLLECTION)
    .doc(runDateTrimmed)
    .collection("items")
    .doc(brandKeyTrimmed);

  await ref.set(
    {
      brandSummaryJa: text,
      brandSummaryJaUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
