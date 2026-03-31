/**
 * runDate ごとに、ランキング上位 50 / 100 件の公開面 imagePolicy 件数を出す。
 *
 *   pnpm report-image-policy-stats
 *   pnpm report-image-policy-stats -- --runDate=2025-03-01
 *   pnpm report-image-policy-stats -- --snapshot-json --label=before > policy.json
 *     … 人間向けは stderr、stdout には top50/top100 を含む JSON のみ（解析前後の比較用）
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

function parseArgs(argv: string[]): {
  runDate: string | null;
  snapshotJson: boolean;
  label: string | null;
} {
  let runDate: string | null = null;
  let snapshotJson = false;
  let label: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    }
    if (a === "--snapshot-json" || a === "--json") snapshotJson = true;
    if (a.startsWith("--label=")) {
      label = a.slice("--label=".length).trim() || null;
    }
  }
  return { runDate, snapshotJson, label };
}

function printPolicyBlock(
  title: string,
  counts: ImagePolicyCounts,
  talliedCount: number,
  rankSlots: number,
  out: typeof console.log
) {
  out(`\n=== ${title} ===`);
  out(`tallied_products: ${talliedCount}  rank_slots: ${rankSlots}`);
  for (const k of [
    "safe_person_free",
    "unsafe_person_possible",
    "mall_image",
    "fallback_no_image",
  ] as const) {
    out(`  ${k}: ${counts[k]}`);
  }
  out(`  (line) ${formatImagePolicyCountsLine(counts)}`);
}

async function main() {
  const { runDate: runDateArg, snapshotJson, label } = parseArgs(
    process.argv.slice(2)
  );
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

  const out = snapshotJson
    ? console.error.bind(console)
    : console.log.bind(console);

  out(
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
      ? tallyImagePolicyForProducts(slice50 as any)
      : emptyImagePolicyCounts();
  const counts100 =
    slice100.length > 0
      ? tallyImagePolicyForProducts(slice100 as any)
      : emptyImagePolicyCounts();

  printPolicyBlock(
    `imagePolicy・公式順 上位50枠（${runDate}）`,
    counts50,
    slice50.length,
    Math.min(50, ranking.items.length),
    out
  );
  printPolicyBlock(
    `imagePolicy・公式順 上位100枠（${runDate}）`,
    counts100,
    slice100.length,
    Math.min(100, ranking.items.length),
    out
  );

  out("\n--- JSON サマリ（上位100枠・読み込めた商品）---");
  out(JSON.stringify(counts100, null, 2));

  if (snapshotJson) {
    const payload = {
      runDate,
      label: label ?? undefined,
      top50: counts50,
      top100: counts100,
      meta: {
        tallied50: slice50.length,
        tallied100: slice100.length,
        rankSlots50: Math.min(50, ranking.items.length),
        rankSlots100: Math.min(100, ranking.items.length),
      },
    };
    console.log(JSON.stringify(payload, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
