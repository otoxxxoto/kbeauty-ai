/**
 * oliveyoung_products_public への画像 Vision 結果の merge 書き込み
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

export type ProductImageAnalysisFirestoreRow = {
  url: string;
  containsPerson: boolean;
  confidence?: number;
  isPreferredProductImage?: boolean;
  /** OY 公式クロール由来（モール CDN 以外）。Web の公式バッジ・fallback 判定に使用 */
  isOliveYoungOriginal?: boolean;
};

export async function mergeProductImageVisionFields(
  goodsNo: string,
  payload: {
    imageAnalysis: ProductImageAnalysisFirestoreRow[];
    safeImageUrl: string;
    hasSafeProductImage: boolean;
  }
): Promise<void> {
  const ref = getDb().collection(COLLECTION).doc(goodsNo);
  await ref.set(
    {
      imageAnalysis: payload.imageAnalysis,
      safeImageUrl: payload.safeImageUrl,
      hasSafeProductImage: payload.hasSafeProductImage,
      imageVisionAnalyzedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * NDJSON 等からの 1 URL ずつ追記用。`imageVisionAnalyzedAt` は付けない（全件一括ジョブと併用可）。
 */
export async function mergeProductImageVisionFieldsPartial(
  goodsNo: string,
  payload: {
    imageAnalysis: ProductImageAnalysisFirestoreRow[];
    safeImageUrl: string;
    hasSafeProductImage: boolean;
  }
): Promise<void> {
  const ref = getDb().collection(COLLECTION).doc(goodsNo);
  await ref.set(
    {
      imageAnalysis: payload.imageAnalysis,
      safeImageUrl: payload.safeImageUrl,
      hasSafeProductImage: payload.hasSafeProductImage,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
