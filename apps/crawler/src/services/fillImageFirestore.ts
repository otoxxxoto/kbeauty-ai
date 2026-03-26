/**
 * 画像補完ジョブ専用 Firestore アクセス。
 * ランキング・refetchProductDetail・oliveyoungIngredients を一切参照しない。
 * このファイルからは [RANKING] / DEBUG_NAME_BRAND 等のログは出ない。
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

function hasImageUrl(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== "string") return false;
  return value.trim() !== "";
}

export type FillImageMissingItem = {
  goodsNo: string;
  imageUrl: string;
  thumbnailUrl: string;
  productUrl?: string;
  lastSeenRunDate?: string;
  updatedAt?: unknown;
};

/**
 * imageUrl が空 or 無い、または thumbnailUrl が空 or 無い商品を LIMIT 件取得。
 */
export async function getProductsMissingImagesForFillImage(
  limit: number
): Promise<FillImageMissingItem[]> {
  const n = Math.min(Math.max(1, limit), 500);
  const db = getDb();
  const snap = await db
    .collection(COLLECTION)
    .orderBy("updatedAt", "desc")
    .limit(400)
    .get();

  const missing: FillImageMissingItem[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const imageUrl = data.imageUrl != null ? String(data.imageUrl) : "";
    const thumbnailUrl = data.thumbnailUrl != null ? String(data.thumbnailUrl) : "";
    if (hasImageUrl(imageUrl) && hasImageUrl(thumbnailUrl)) continue;
    const lastSeenRunDate =
      data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined;
    const productUrl = data.productUrl != null ? String(data.productUrl).trim() : undefined;
    missing.push({
      goodsNo: doc.id,
      imageUrl: imageUrl.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      productUrl: productUrl || undefined,
      lastSeenRunDate: lastSeenRunDate || undefined,
      updatedAt: data.updatedAt,
    });
  }

  missing.sort((a, b) => {
    const aDate = a.lastSeenRunDate || "";
    const bDate = b.lastSeenRunDate || "";
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aUpd = a.updatedAt;
    const bUpd = b.updatedAt;
    if (aUpd == null && bUpd == null) return 0;
    if (aUpd == null) return 1;
    if (bUpd == null) return -1;
    const aMs =
      typeof (aUpd as { toMillis?: () => number }).toMillis === "function"
        ? (aUpd as { toMillis: () => number }).toMillis()
        : 0;
    const bMs =
      typeof (bUpd as { toMillis?: () => number }).toMillis === "function"
        ? (bUpd as { toMillis: () => number }).toMillis()
        : 0;
    return bMs - aMs;
  });

  return missing.slice(0, n);
}

/**
 * imageUrl, thumbnailUrl, imageUpdatedAt のみ更新。
 */
export async function updateProductImageFieldsForFillImage(
  goodsNo: string,
  imageUrl: string,
  thumbnailUrl: string
): Promise<void> {
  const db = getDb();
  const ref = db.collection(COLLECTION).doc(goodsNo);
  await ref.set(
    {
      imageUrl: imageUrl.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      imageUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
