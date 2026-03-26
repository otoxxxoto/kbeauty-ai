/**
 * OliveYoung ProductNormalized の Firestore 読み取りクエリ
 * メディア表示: タグ別・最新更新・ランキング順
 *
 * 必要な複合インデックス（firestore.indexes.json 参照）:
 * - tags (array-contains) + updatedAt (desc)
 * - tags (array-contains) + rank (asc)
 */
import { Firestore, DocumentSnapshot } from '@google-cloud/firestore';
import type { ProductNormalized } from '@kbeauty-ai/core';
import { OLIVEYOUNG_PRODUCTS_COLLECTION } from '@kbeauty-ai/core';

const COLLECTION =
  process.env.FIRESTORE_PRODUCTS_COLLECTION || OLIVEYOUNG_PRODUCTS_COLLECTION;

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) _db = new Firestore();
  return _db;
}

/** Firestore ドキュメント（Timestamp 含む）を ProductNormalized に変換 */
function toProduct(doc: DocumentSnapshot): ProductNormalized & { id: string } {
  const d = doc.data()!;
  return {
    id: doc.id,
    goodsNo: doc.id,
    brand: d.brand ?? '',
    name: d.name ?? '',
    pickedUrl: d.pickedUrl,
    ingredientsRaw: d.ingredientsRaw ?? '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    qoo10Url: d.qoo10Url,
    priceKRW: d.priceKRW,
    rank: d.rank,
    createdAt: (d.createdAt as any)?.toDate?.()?.toISOString?.() ?? '',
    updatedAt: (d.updatedAt as any)?.toDate?.()?.toISOString?.() ?? '',
  };
}

/**
 * A. タグ別の最新更新順
 * where('tags','array-contains', tag) + orderBy('updatedAt','desc') + limit(50)
 */
export async function listByTagLatest(
  tag: string,
  limit = 50
): Promise<(ProductNormalized & { id: string })[]> {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('tags', 'array-contains', tag)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(toProduct);
}

/**
 * B. タグ別のランキング順（今日のランキング表示用）
 * where('tags','array-contains', tag) + orderBy('rank','asc') + limit(100)
 * rank 未設定は順序が不安定になり得るので、クライアント側で rank 未設定を除外することを推奨
 */
export async function listByTagRanking(
  tag: string,
  limit = 100
): Promise<(ProductNormalized & { id: string })[]> {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('tags', 'array-contains', tag)
    .orderBy('rank', 'asc')
    .limit(limit)
    .get();
  const list = snap.docs.map(toProduct);
  // rank 未設定を除外して返す（メディア表示で古い情報が混ざらないように）
  return list.filter((p) => p.rank != null && p.rank >= 1 && p.rank <= 100);
}

/**
 * C. 全体の最新更新（トップの「最新追加」用）
 * orderBy('updatedAt','desc') + limit(50)
 */
export async function listLatest(
  limit = 50
): Promise<(ProductNormalized & { id: string })[]> {
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('updatedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(toProduct);
}
