/**
 * reviewSummaryJa 補完ジョブ専用 Firestore アクセス。
 * oliveyoung_products_public の読み取りと reviewSummaryJa の merge 更新のみ。
 * ランキング本体は呼ばない。
 */
import { FieldValue, Firestore } from "@google-cloud/firestore";
import { summaryFieldNeedsRegeneration } from "../lib/oliveyoung/generatedSummaryQuality";

const COLLECTION = "oliveyoung_products_public";

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export type ProductForReviewSummaryJa = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  summaryJa?: string;
  reviewSummaryJa?: string;
  brand: string;
  brandJa?: string;
  updatedAt?: unknown;
};

/** 通常時: 未設定のみ対象にするためスキャン件数。全件リビルド時は多めに取得する */
const SCAN_LIMIT_DEFAULT = 400;
const SCAN_LIMIT_FORCE_REGENERATE = 2500;

/**
 * reviewSummaryJa が無い・空の商品、もしくは forceRegenerate=true の場合は既存値も対象
 * （updatedAt 降順でスキャンし、先頭 limit 件を返す。forceRegenerate 時はスキャン件数を増やす）
 */
export async function getProductsMissingReviewSummaryJa(
  limit: number,
  forceRegenerate: boolean
): Promise<ProductForReviewSummaryJa[]> {
  const n = Math.min(Math.max(1, limit), 500);
  const db = getDb();
  const scanLimit = forceRegenerate ? SCAN_LIMIT_FORCE_REGENERATE : SCAN_LIMIT_DEFAULT;
  const snap = await db
    .collection(COLLECTION)
    .orderBy("updatedAt", "desc")
    .limit(scanLimit)
    .get();

  const result: ProductForReviewSummaryJa[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const reviewSummaryJa =
      data.reviewSummaryJa != null ? String(data.reviewSummaryJa).trim() : "";
    const needsFlag = data.needsReviewSummaryJa === true;
    const contentNeedsWork =
      reviewSummaryJa === "" || summaryFieldNeedsRegeneration(reviewSummaryJa);
    const isTarget = forceRegenerate || needsFlag || contentNeedsWork;
    if (!isTarget) continue;

    result.push({
      goodsNo: doc.id,
      name: String(data.name ?? "").trim(),
      nameJa: data.nameJa != null ? String(data.nameJa).trim() : undefined,
      summaryJa:
        data.summaryJa != null ? String(data.summaryJa).trim() : undefined,
      reviewSummaryJa: reviewSummaryJa || undefined,
      brand: String(data.brand ?? "").trim(),
      brandJa: data.brandJa != null ? String(data.brandJa).trim() : undefined,
      updatedAt: data.updatedAt,
    });
  }

  return result.slice(0, n);
}

/**
 * oliveyoung_products_public/{goodsNo} に reviewSummaryJa を merge 保存。
 * 既存フィールドは壊さない。将来本物のレビュー要約に差し替えても呼び出しは同じ。
 */
export async function updateProductReviewSummaryJa(
  goodsNo: string,
  reviewSummaryJa: string
): Promise<void> {
  const trimmed = (goodsNo || "").trim();
  const text = (reviewSummaryJa || "").trim();
  if (!trimmed || !text) return;

  const db = getDb();
  const ref = db.collection(COLLECTION).doc(trimmed);
  await ref.set(
    {
      reviewSummaryJa: text,
      reviewSummaryJaUpdatedAt: FieldValue.serverTimestamp(),
      needsReviewSummaryJa: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
