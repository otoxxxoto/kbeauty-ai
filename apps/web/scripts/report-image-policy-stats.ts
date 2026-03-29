/**
 * runDate ごとに、ランキング上位 50 / 100 件の公開面 imagePolicy 件数を出す。
 *
 *   pnpm report-image-policy-stats
 *   pnpm report-image-policy-stats -- --runDate=2025-03-01
 *
 * 前提: `.env.local` に Firestore
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import {
  getOliveYoungProductByGoodsNo,
  type OliveYoungProductDetail,
} from "../src/lib/oliveyoung-products";
import {
  getRankingByDate,
  getRankingRunDates,
} from "../src/lib/oliveyoung-rankings";
import {
  emptyImagePolicyCounts,
  tallyImagePolicyForProducts,
  formatImagePolicyCountsLine,
  type ImagePolicyCounts,
} from "../src/lib/image-display-policy-stats";

function parseArgs(argv: string[]): { runDate: string | null } {
  let runDate: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    }
  }
  return { runDate };
}

function printPolicyBlock(
  title: string,
  counts: ImagePolicyCounts,
  talliedCount: number,
  rankSlots: number
) {
  console.log(`\n=== ${title} ===`);
  console.log(`tallied_products: ${talliedCount}  rank_slots: ${rankSlots}`);
  for (const k of [
    "safe_person_free",
    "unsafe_person_possible",
    "mall_image",
    "fallback_no_image",
  ] as const) {
    console.log(`  ${k}: ${counts[k]}`);
  }
  console.log(`  (line) ${formatImagePolicyCountsLine(counts)}`);
}

async function main() {
  const { runDate: runDateArg } = parseArgs(process.argv.slice(2));
  const runDates = await getRankingRunDates();
  const runDate = runDateArg ?? runDates[0] ?? null;
  if (!runDate) {
    console.error("[image-policy-stats] runDate を取得できません。");
    process.exit(1);
  }

  const ranking = await getRankingByDate(runDate);
  if (!ranking) {
    console.error(`[image-policy-stats] ランキングなし: ${runDate}`);
    process.exit(1);
  }

  console.log(
    `\n[image-policy-stats] runDate=${runDate}  (公式 rank 昇順・上位 N 枠で集計、Firestore に無い rank はスキップ)`
  );

  const rows100 = ranking.items.slice(0, 100);
  const aligned: Array<OliveYoungProductDetail | null> = [];

  for (const row of rows100) {
    const p = await getOliveYoungProductByGoodsNo(row.goodsNo);
    aligned.push(p);
  }

  const slice50 = aligned
    .slice(0, 50)
    .filter((x): x is OliveYoungProductDetail => x != null);
  const slice100 = aligned.filter(
    (x): x is OliveYoungProductDetail => x != null
  );

  const counts50 =
    slice50.length > 0
      ? tallyImagePolicyForProducts(slice50)
      : emptyImagePolicyCounts();
  const counts100 =
    slice100.length > 0
      ? tallyImagePolicyForProducts(slice100)
      : emptyImagePolicyCounts();

  printPolicyBlock(
    `imagePolicy・公式順 上位50枠（${runDate}）`,
    counts50,
    slice50.length,
    Math.min(50, ranking.items.length)
  );
  printPolicyBlock(
    `imagePolicy・公式順 上位100枠（${runDate}）`,
    counts100,
    slice100.length,
    Math.min(100, ranking.items.length)
  );

  console.log("\n--- JSON サマリ（上位100枠・読み込めた商品）---");
  console.log(JSON.stringify(counts100, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
