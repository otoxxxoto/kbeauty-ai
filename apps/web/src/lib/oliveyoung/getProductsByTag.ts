/**
 * タグ別商品一覧取得
 * mode: rank = ランキング順（rank ありのみ）, recent = 最新更新順
 */
import { db } from "@/lib/firestore";

const COLLECTION = process.env.FIRESTORE_PRODUCTS_COLLECTION || "oliveyoung_products";

export type ProductDoc = {
  id: string;
  goodsNo: string;
  brand?: string;
  name?: string;
  pickedUrl?: string;
  ingredientsRaw?: string;
  tags?: string[];
  qoo10Url?: string;
  priceKRW?: number;
  rank?: number;
  createdAt?: { toDate: () => Date };
  updatedAt?: { toDate: () => Date };
};

export async function getProductsByTag(
  tag: string,
  mode: "rank" | "recent" = "rank"
): Promise<ProductDoc[]> {
  const col = db.collection(COLLECTION);

  let q = col.where("tags", "array-contains", tag);

  if (mode === "rank") {
    q = q.orderBy("rank", "asc");
  } else {
    q = q.orderBy("updatedAt", "desc");
  }

  const snap = await q.limit(mode === "rank" ? 100 : 50).get();
  const items = snap.docs.map((d) => ({
    id: d.id,
    goodsNo: d.id,
    ...(d.data() as Omit<ProductDoc, "id" | "goodsNo">),
  }));

  if (mode === "rank") {
    return items.filter((x) => typeof x.rank === "number");
  }
  return items;
}
