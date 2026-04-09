/**
 * serum スコア>=2 のプール全件の name / nameJa / summaryJa を出力（キーワード設計用）
 * apps/web: pnpm exec tsx scripts/dump-serum-pool-texts.ts
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import type { OliveYoungProductMinimal } from "../src/lib/oliveyoung-products";
import { CATEGORY_CONFIG } from "../src/lib/category-config";
import { scoreProductForCategory } from "../src/lib/filter-products-by-category";
import {
  getRankingRunDates,
  getRankingWithProducts,
} from "../src/lib/oliveyoung-rankings";
import type { RankingItemWithProduct } from "../src/lib/oliveyoung-rankings";

const THRESHOLD = 2;
const serum = CATEGORY_CONFIG.serum!;

function toMinimal(item: RankingItemWithProduct): OliveYoungProductMinimal {
  return {
    goodsNo: item.goodsNo,
    name: item.name,
    nameJa: item.nameJa,
    brand: item.brand,
    brandJa: item.brandJa,
    summaryJa: item.summaryJa,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    productUrl: item.productUrl,
    pickedUrl: item.pickedUrl ?? null,
    lastRank: item.lastRank,
    lastSeenRunDate: item.lastSeenRunDate,
    updatedAt: null,
  } as OliveYoungProductMinimal;
}

async function main() {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  const runDates = await getRankingRunDates();
  const data = await getRankingWithProducts(runDates[0]!);
  if (!data) throw new Error("no data");

  const pool = data.items
    .filter(
      (item) => scoreProductForCategory(toMinimal(item), serum) >= THRESHOLD
    )
    .sort((a, b) => a.rank - b.rank);

  const rows = pool.map((item) => ({
    rank: item.rank,
    goodsNo: item.goodsNo,
    name: item.name,
    nameJa: item.nameJa ?? "",
    summaryJa: item.summaryJa ?? "",
  }));

  console.log(JSON.stringify({ runDate: runDates[0], count: rows.length }, null, 2));
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
