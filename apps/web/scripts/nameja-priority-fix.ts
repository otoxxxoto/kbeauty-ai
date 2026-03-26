import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../src/lib/firestore";
import {
  getRankingRunDates,
  getRankingWithProducts,
  getRankingTopNWithProducts,
  getRisingProductsWithProducts,
} from "../src/lib/oliveyoung-rankings";
import { getAllOliveYoungProductsMinimal } from "../src/lib/oliveyoung-products";
import {
  CATEGORY_CONFIG,
} from "../src/lib/category-config";
import { filterProductsByCategory } from "../src/lib/filter-products-by-category";
import {
  containsUnsafeGoodsNoText,
  getDisplayProductNameText,
  PRODUCT_TITLE_PENDING_JA,
} from "../src/lib/oliveyoung-display";

const GOODS_INLINE = /A\d{10,}/g;
const GOODS_ONLY = /^A\d{10,}$/;

function cleanName(x: string): string {
  return x
    .replace(GOODS_INLINE, "")
    .replace(/[|｜]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSafeDisplayName(x: string): boolean {
  const t = x.trim();
  if (!t) return false;
  if (GOODS_ONLY.test(t)) return false;
  if (containsUnsafeGoodsNoText(t)) return false;
  if (t === PRODUCT_TITLE_PENDING_JA) return false;
  if (t === "（商品名なし）") return false;
  return t.length >= 2;
}

async function main() {
  const runDate = (await getRankingRunDates())[0];
  if (!runDate) throw new Error("runDate not found");

  const [all, ranking, top50, rising] = await Promise.all([
    getAllOliveYoungProductsMinimal(),
    getRankingWithProducts(runDate),
    getRankingTopNWithProducts(runDate, 50),
    getRisingProductsWithProducts(10),
  ]);

  const pendingGoodsNos = all
    .filter((p) => getDisplayProductNameText(p) === PRODUCT_TITLE_PENDING_JA)
    .map((p) => p.goodsNo);
  const rawNameJaGoodsNos = all
    .filter((p) => {
      const ja = (p.nameJa ?? "").trim();
      return !!ja && containsUnsafeGoodsNoText(ja);
    })
    .map((p) => p.goodsNo);

  const priority = new Set<string>();
  (top50?.items ?? []).forEach((x) => priority.add(x.goodsNo));
  (rising?.items ?? []).forEach((x) => priority.add(x.goodsNo));
  (ranking?.items ?? []).slice(0, 50).forEach((x) => priority.add(x.goodsNo));

  // カテゴリ面: 各カテゴリ先頭 20 件を優先扱い
  for (const slug of Object.keys(CATEGORY_CONFIG)) {
    const cat = CATEGORY_CONFIG[slug as keyof typeof CATEGORY_CONFIG];
    const list = filterProductsByCategory(all, cat).slice(0, 20);
    list.forEach((p) => priority.add(p.goodsNo));
  }

  // 商品詳細導線（関連商品の露出を想定）: 上位50商品のブランド商品を優先
  const topBrands = new Set(
    (ranking?.items ?? [])
      .slice(0, 50)
      .map((x) => (x.brandJa ?? x.brand ?? "").trim())
      .filter(Boolean)
  );
  all.forEach((p) => {
    const b = (p.brandJa ?? p.brand ?? "").trim();
    if (topBrands.has(b)) priority.add(p.goodsNo);
  });

  const targetGoodsNos = [...new Set([...pendingGoodsNos, ...rawNameJaGoodsNos])].filter(
    (g) => priority.has(g)
  );

  const updates: Array<{ goodsNo: string; from: string; to: string }> = [];
  for (const goodsNo of targetGoodsNos) {
    const ref = db.collection("oliveyoung_products_public").doc(goodsNo);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const d = snap.data() ?? {};
    const rawJa = String(d.nameJa ?? "").trim();
    const rawName = String(d.name ?? "").trim();

    const cleanedJa = cleanName(rawJa);
    const cleanedName = cleanName(rawName);

    let nextJa = "";
    if (isSafeDisplayName(cleanedJa)) nextJa = cleanedJa;
    else if (isSafeDisplayName(cleanedName)) nextJa = cleanedName;
    if (!nextJa || nextJa === rawJa) continue;

    await ref.update({
      nameJa: nextJa,
      needsNameJa: false,
      lastNameJaTranslatedAt: new Date().toISOString(),
    });
    updates.push({ goodsNo, from: rawJa, to: nextJa });
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        runDate,
        pendingCount: pendingGoodsNos.length,
        rawNameJaContainsGoodsNoCount: rawNameJaGoodsNos.length,
        priorityTargetCount: targetGoodsNos.length,
        updatedCount: updates.length,
        updatedSample: updates.slice(0, 50),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
