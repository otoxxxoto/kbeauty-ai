/**
 * goodsNo で商品1件取得（Firestore）
 * 詳細ページでタグ・同タグリンク表示用
 */
import { db } from "@/lib/firestore";

const COLLECTION = process.env.FIRESTORE_PRODUCTS_COLLECTION || "oliveyoung_products";

export type ProductDoc = {
  id: string;
  goodsNo: string;
  brand?: string;
  name?: string;
  nameJa?: string;
  summaryJa?: string;
  pickedUrl?: string;
  ingredientsRaw?: string;
  tags?: string[];
  qoo10Url?: string;
  priceKRW?: number;
  rank?: number;
  createdAt?: { toDate: () => Date };
  updatedAt?: { toDate: () => Date };
};

export async function getProductByGoodsNo(
  goodsNo: string
): Promise<ProductDoc | null> {
  const doc = await db.collection(COLLECTION).doc(goodsNo).get();
  if (!doc.exists) return null;
  return { id: doc.id, goodsNo: doc.id, ...doc.data() } as ProductDoc;
}
