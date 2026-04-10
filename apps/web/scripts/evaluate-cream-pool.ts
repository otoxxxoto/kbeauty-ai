/**
 * cream カテゴリ score>=2 プール件数と name 一覧（キーワード設計用）
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import type { OliveYoungProductMinimal } from "../src/lib/oliveyoung-products";
import { CATEGORY_CONFIG } from "../src/lib/category-config";
import {
  scoreProductForCategory,
  productMatchesAnyThemeKeyword,
} from "../src/lib/filter-products-by-category";
import {
  getRankingRunDates,
  getRankingWithProducts,
} from "../src/lib/oliveyoung-rankings";
import type { RankingItemWithProduct } from "../src/lib/oliveyoung-rankings";

const THRESHOLD = 2;
const cream = CATEGORY_CONFIG.cream!;

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
      (item) => scoreProductForCategory(toMinimal(item), cream) >= THRESHOLD
    )
    .sort((a, b) => a.rank - b.rank);

  console.log("runDate:", runDates[0], "cream pool (>=2):", pool.length);
  for (const r of pool) {
    const t = (r.nameJa || r.name || "").replace(/\s+/g, " ").slice(0, 100);
    console.log(`rank=${r.rank}\t${r.goodsNo}\t${t}`);
  }

  const sets: Record<string, string[]> = {
    night: ["ナイト", "夜", "night", "나이트", "スリーピング", "sleeping"],
    barrier: ["バリア", "barrier", "アトバリア", "セラミド", "ceramide"],
    moisture: ["保湿", "水分", "ヒアルロン", "히알루론", "うるおい"],
    soothing: ["シカ", "cica", "スージング", "マデカ", "鎮静", "민감"],
    bright_pore: ["ブライト", "毛穴", "シミ", "bright"],
  };

  console.log("\n--- theme keyword hit counts (within pool) ---");
  for (const [label, keys] of Object.entries(sets)) {
    const hit = pool.filter((item) =>
      productMatchesAnyThemeKeyword(toMinimal(item), keys)
    );
    console.log(label, hit.length, hit.map((i) => i.goodsNo));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
