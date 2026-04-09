/**
 * brightening 用 themeMatchKeywords のヒット数シミュレーション
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

const CURRENT = [
  "透明",
  "トーン",
  "美白",
  "ナイアシン",
  "ビタミン",
  "VC",
  "くすみ",
  "ナイアシンアミド",
  "비타민",
  "나이아신",
  "비타민c",
];

/** 追加案（実データに出現する表記から） */
const PROPOSED_ADD = [
  "跡",
  "痕跡",
  "흔적",
  "b3",
  "レチノール",
  "pdrn",
  "毛穴",
  "マデカ",
];

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

  function countHits(keys: string[]) {
    const hit = pool.filter((item) =>
      productMatchesAnyThemeKeyword(toMinimal(item), keys)
    );
    return { n: hit.length, goodsNos: hit.map((i) => i.goodsNo) };
  }

  console.log("runDate:", runDates[0], "pool:", pool.length);
  console.log("CURRENT only:", countHits(CURRENT));
  console.log("PROPOSED_ADD only:", countHits(PROPOSED_ADD));
  console.log("CURRENT + PROPOSED_ADD:", countHits([...CURRENT, ...PROPOSED_ADD]));

  const minimalAdd = ["跡", "흔적", "b3", "pdrn", "レチノール", "毛穴"];
  console.log("CURRENT + minimalAdd (6):", countHits([...CURRENT, ...minimalAdd]));

  for (const k of PROPOSED_ADD) {
    console.log(`  [${k}]`, countHits([k]).n, countHits([k]).goodsNos);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
