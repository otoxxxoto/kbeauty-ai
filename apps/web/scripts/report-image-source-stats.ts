/**
 * imageSource 分布を集計して stdout に出す。
 *
 *   pnpm report-image-source-stats
 *   pnpm report-image-source-stats -- --runDate=2025-03-01
 *
 * 前提: `.env.local` に Firestore 認証（Next と同じ）
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { getOliveYoungProductByGoodsNo } from "../src/lib/oliveyoung-products";
import {
  getRankingByDate,
  getRankingRunDates,
  getRankingWithProducts,
  getRisingProductsWithProducts,
  getRankingTopNWithProducts,
  sortRankingItemsByImageVisualBoost,
} from "../src/lib/oliveyoung-rankings";
import {
  dominantImageSourceBucket,
  type ImageSourceStatBucket,
  IMAGE_SOURCE_STAT_BUCKETS,
  tallyImageSourcesForProducts,
  tallyImageSourcesForRelatedGroups,
} from "../src/lib/image-source-stats";
import { getRelatedProducts } from "../src/lib/oliveyoung-related";

function parseArgs(argv: string[]): { runDate: string | null } {
  let runDate: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    }
  }
  return { runDate };
}

function printBlock(title: string, counts: Record<ImageSourceStatBucket, number>) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const dom = dominantImageSourceBucket(counts);
  console.log(`\n=== ${title} ===`);
  console.log(`total: ${total}`);
  for (const k of IMAGE_SOURCE_STAT_BUCKETS) {
    console.log(`  ${k}: ${counts[k]}`);
  }
  console.log(`fallback_no_image: ${counts.fallback_no_image}`);
  console.log(`dominant: ${dom ?? "(n/a)"}`);
}

async function main() {
  const { runDate: runDateArg } = parseArgs(process.argv.slice(2));
  const runDates = await getRankingRunDates();
  const runDate = runDateArg ?? runDates[0] ?? null;
  if (!runDate) {
    console.error("ランキング runDate が取得できません。");
    process.exit(1);
  }

  // --- 公式順 1〜50 位（集計の主目的）---
  const ranking = await getRankingByDate(runDate);
  if (!ranking) {
    console.error(`ランキングが見つかりません: ${runDate}`);
    process.exit(1);
  }

  const officialTop50 = ranking.items.slice(0, 50);
  const officialProducts = [];
  for (const row of officialTop50) {
    const p = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (p) officialProducts.push(p);
  }
  const officialCounts = tallyImageSourcesForProducts(officialProducts as any);
  printBlock(`ランキング公式1〜50位（${runDate}）`, officialCounts);

  // --- 注目・おすすめ枠向け「画像ブースト」順の先頭50件（公開一覧は公式 rank 順）---
  const withProducts = await getRankingWithProducts(runDate);
  if (withProducts) {
    const display50 = sortRankingItemsByImageVisualBoost(withProducts.items).slice(
      0,
      50
    );
    const displayCounts = tallyImageSourcesForProducts(display50);
    printBlock(
      `画像ブースト順・先頭50件（${runDate}・レポート用）`,
      displayCounts
    );
  }

  // --- トップ: 急上昇 + 注目TOP3 ---
  const rising = await getRisingProductsWithProducts(5);
  const top3 = await getRankingTopNWithProducts(runDate, 3);
  const entry = [...(rising?.items ?? []), ...(top3?.items ?? [])];
  if (entry.length > 0) {
    printBlock(
      "トップ（急上昇 + 今日の注目TOP3）",
      tallyImageSourcesForProducts(entry as any)
    );
  }

  // --- 関連商品: 先頭の公式50件のうち最初の1商品を基準にサンプル ---
  const sample = officialProducts[0];
  if (sample) {
    const related = await getRelatedProducts(sample, {
      brandLimit: 3,
      categoryLimit: 3,
      rankLimit: 3,
    });
    printBlock(
      `関連商品サンプル（基準 goodsNo=${sample.goodsNo}）`,
      tallyImageSourcesForRelatedGroups(related)
    );
  }

  // サマリ（報告用1行）
  console.log("\n--- サマリ（公式1〜50位）---");
  console.log(JSON.stringify(officialCounts, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
