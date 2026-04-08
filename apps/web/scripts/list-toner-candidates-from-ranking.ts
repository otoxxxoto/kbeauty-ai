/**
 * latest ランキングから toner カテゴリスコア >= 2 の候補を一覧化（キュレーション用）。
 * apps/web: pnpm exec tsx scripts/list-toner-candidates-from-ranking.ts
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
const toner = CATEGORY_CONFIG.toner;
if (!toner) throw new Error("toner config missing");

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

/** 保湿寄せの目安（自動ラベル用・最終判断は人） */
const MOISTURE_HINTS =
  /保湿|うるおい|モイスチャ|ハイドラ|ヒアルロン|セラミド|ceramide|hyaluronic|乾燥|しっとり|高保湿|水分補給|みずみずし|hydrat|moistur|イドラビオ|イドラ|hydra/i;

function moistureHintText(item: RankingItemWithProduct): string {
  return [item.nameJa, item.name, item.summaryJa ?? ""].join(" ");
}

function isMoistureHint(item: RankingItemWithProduct): boolean {
  return MOISTURE_HINTS.test(moistureHintText(item));
}

async function main() {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  const runDates = await getRankingRunDates();
  const runDate = runDates[0];
  if (!runDate) {
    console.error("No ranking dates");
    process.exit(1);
  }
  const data = await getRankingWithProducts(runDate);
  if (!data) {
    console.error("No ranking for", runDate);
    process.exit(1);
  }

  const candidates = data.items
    .map((item) => ({
      item,
      score: scoreProductForCategory(toMinimal(item), toner),
    }))
    .filter((x) => x.score >= THRESHOLD)
    .sort((a, b) => a.item.rank - b.item.rank);

  const rows = candidates.map(({ item, score }) => ({
    goodsNo: item.goodsNo,
    rank: item.rank,
    nameJa: item.nameJa ?? "",
    name: item.name,
    brandJa: item.brandJa ?? "",
    brand: item.brand,
    score,
    moistureHint: isMoistureHint(item),
  }));

  const moistureRows = rows.filter((r) => r.moistureHint);
  const generalPreferred = rows.filter((r) => !r.moistureHint);

  console.log("=== toner candidates (score >= " + THRESHOLD + ") ===");
  console.log("runDate:", runDate, "total ranking items:", data.items.length);
  console.log("toner candidate count:", rows.length);
  console.log("");

  console.log("| rank | goodsNo | nameJa | brandJa | score | moistureHint |");
  console.log("| ---: | --- | --- | --- | ---: | :--- |");
  for (const r of rows) {
    const nj = (r.nameJa || r.name).replace(/\|/g, "\\|").slice(0, 60);
    const bj = (r.brandJa || r.brand).replace(/\|/g, "\\|").slice(0, 24);
    console.log(
      `| ${r.rank} | ${r.goodsNo} | ${nj} | ${bj} | ${r.score} | ${r.moistureHint ? "yes" : ""} |`
    );
  }

  console.log("");
  console.log("--- JSON (full) ---");
  console.log(JSON.stringify(rows, null, 2));

  console.log("");
  console.log(
    "--- 総合記事向け（トナー候補すべてを rank 昇順・最大10。タイトルどおり化粧水のみ） ---"
  );
  const allByRank = rows.slice(0, 10).map((r) => r.goodsNo);
  console.log(JSON.stringify(allByRank));

  console.log("");
  console.log(
    "--- 保湿寄りを先に並べた案（保湿ヒント → 残りを rank 昇順・最大10） ---"
  );
  const moistureFirst = [...moistureRows, ...generalPreferred]
    .slice(0, 10)
    .map((r) => r.goodsNo);
  console.log(JSON.stringify(moistureFirst));

  console.log("");
  console.log(
    "--- 参考: 保湿キーワード無しのみ（件数が少ないときは上の「全候補」案を使うこと） ---"
  );
  console.log(JSON.stringify(generalPreferred.slice(0, 10).map((r) => r.goodsNo)));

  if (rows.length < 10) {
    console.log("");
    console.log(
      `(注) トナー候補は ${rows.length} 件のみ。10件埋めたい場合はスコア閾値・キーワード・summaryJa 充填など別途検討が必要です。`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
