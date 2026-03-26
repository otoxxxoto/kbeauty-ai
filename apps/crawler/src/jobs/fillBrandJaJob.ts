/**
 * brand_rankings の brandJa 補填ジョブ（brand_rankings のみ更新。ランキング本体 Job は呼ばない）
 *
 * 【products_public との関係】
 * - 本 Job は `brand_rankings/{runDate}/items/{brandKey}` にだけ `brandJa` を書く。
 * - `fillProductBrandJaJob` は `oliveyoung_products_public` のみ更新。コレクションが異なるため競合しない。
 * - Web は brandJa 未設定時に products_public を表示補完するが、本 Job で rank 側を埋めると表示が安定する。
 *
 * runDate の決め方（優先順）:
 *   1. 第1引数が YYYY-MM-DD 形式 → その日付
 *   2. 第1引数が `latest` または未指定 → 環境変数 BRAND_RANKINGS_RUN_DATE / RUN_DATE（`latest` 可）
 *   3. 上記が空または `latest` → Firestore の brand_rankings から最新 doc id（getLatestBrandRankingRunDate）
 *
 * limit: 第2引数、なければ環境変数 LIMIT（既定 20、最大 500）
 *
 * Cloud Run / Scheduler 例（oliveyoung:job + src/index.ts が in-process で本モジュールを呼ぶ）:
 *   JOB_TYPE=fill-brand-ja LIMIT=50
 *   または明示日: BRAND_RANKINGS_RUN_DATE=2026-03-14
 *
 * ローカル:
 *   pnpm run oliveyoung:fill-brand-ja
 *   pnpm run oliveyoung:fill-brand-ja -- 2026-03-14 30
 *   pnpm exec tsx src/jobs/fillBrandJaJob.ts latest 100
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** tsx / node でこのファイルがエントリのときだけ true（index から import しても main は動かない） */
function isMainModule(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(arg)).href;
  } catch {
    return false;
  }
}

dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});
console.log("[ENV_CHECK] GEMINI_API_KEY exists=", !!process.env.GEMINI_API_KEY);

import {
  getBrandRankingItemsMissingBrandJaWithStats,
  getLatestBrandRankingRunDate,
  updateBrandRankingBrandJa,
} from "../services/brandRankingsFirestore";
import { generateBrandJa } from "../lib/oliveyoung/fillBrandJa";
import { getGeminiModelName } from "../lib/oliveyoung/fillNameJa";

const DEFAULT_LIMIT = 20;
const RUN_DATE_ARG_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type FillBrandJaResult = {
  runDate: string;
  runDateSource: "argv" | "env" | "latest";
  limit: number;
  totalItemDocs: number;
  skippedHasBrandJa: number;
  skippedEmptyBrand: number;
  missingBeforeLimit: number;
  targetCount: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
};

export function parseLimitFromArgvOrEnv(): number {
  const rawArg = process.argv[3];
  if (rawArg !== undefined && rawArg !== "") {
    const n = parseInt(rawArg, 10);
    if (Number.isFinite(n)) return Math.min(Math.max(1, n), 500);
  }
  const env = process.env.LIMIT;
  if (env != null && env !== "") {
    const n = parseInt(String(env), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(1, n), 500);
  }
  return DEFAULT_LIMIT;
}

/**
 * runDate を解決（argv → env → latest）
 */
export async function resolveBrandJaRunDate(): Promise<{
  runDate: string;
  source: "argv" | "env" | "latest";
}> {
  const arg1 = process.argv[2]?.trim();
  if (arg1 && RUN_DATE_ARG_PATTERN.test(arg1)) {
    return { runDate: arg1, source: "argv" };
  }
  if (arg1 && arg1.toLowerCase() === "latest") {
    const latest = await getLatestBrandRankingRunDate();
    if (!latest) {
      throw new Error(
        "[FILL_BRAND_JA] No brand_rankings documents found (cannot use latest)"
      );
    }
    return { runDate: latest, source: "latest" };
  }

  const fromEnv =
    process.env.BRAND_RANKINGS_RUN_DATE?.trim() ||
    process.env.RUN_DATE?.trim() ||
    "";
  if (fromEnv && fromEnv.toLowerCase() !== "latest") {
    if (!RUN_DATE_ARG_PATTERN.test(fromEnv)) {
      throw new Error(
        `[FILL_BRAND_JA] Invalid BRAND_RANKINGS_RUN_DATE/RUN_DATE: "${fromEnv}" (expected YYYY-MM-DD)`
      );
    }
    return { runDate: fromEnv, source: "env" };
  }

  const latest = await getLatestBrandRankingRunDate();
  if (!latest) {
    throw new Error(
      "[FILL_BRAND_JA] No brand_rankings runDate. Pass YYYY-MM-DD as argv[2] or set BRAND_RANKINGS_RUN_DATE."
    );
  }
  return { runDate: latest, source: "latest" };
}

export async function runFillBrandJa(
  runDate: string,
  limit: number,
  options?: { runDateSource?: FillBrandJaResult["runDateSource"] }
): Promise<FillBrandJaResult> {
  const n = Math.min(Math.max(1, limit), 500);
  const runDateTrimmed = (runDate || "").trim();
  const source = options?.runDateSource ?? "argv";

  console.log(
    "[FILL_BRAND_JA_START]",
    `runDate=${runDateTrimmed} runDateSource=${source} limit=${n} collection=brand_rankings model=${getGeminiModelName()}`
  );

  const {
    targets,
    totalItemDocs,
    skippedHasBrandJa,
    skippedEmptyBrand,
    missingBeforeLimit,
  } = await getBrandRankingItemsMissingBrandJaWithStats(runDateTrimmed, n);

  console.log(
    "[FILL_BRAND_JA_SCAN]",
    `totalItemDocs=${totalItemDocs} skipHasBrandJa=${skippedHasBrandJa} skipEmptyBrand=${skippedEmptyBrand} missingBrandJa=${missingBeforeLimit} targetSlice=${targets.length} limit=${n}`
  );

  const sample = targets
    .slice(0, 3)
    .map((t) => t.brandKey)
    .join(",");
  console.log("[FILL_BRAND_JA_TARGETS]", `count=${targets.length} sampleBrandKey=${sample || "-"}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of targets) {
    processed += 1;

    if (!item.brand || item.brand.trim() === "") {
      skipped += 1;
      console.log("[FILL_BRAND_JA_SKIP]", `brandKey=${item.brandKey} reason=brand_empty`);
      continue;
    }

    try {
      const brandJa = await generateBrandJa({
        brand: item.brand,
        brandKey: item.brandKey,
        rank: item.rank,
        count: item.count,
      });

      if (brandJa === "") {
        skipped += 1;
        console.log(
          "[FILL_BRAND_JA_SKIP]",
          `brandKey=${item.brandKey} reason=empty_llm_output brand="${item.brand.slice(0, 30)}..."`
        );
        continue;
      }

      await updateBrandRankingBrandJa(runDateTrimmed, item.brandKey, brandJa);
      updated += 1;
      console.log(
        "[FILL_BRAND_JA_ITEM_DONE]",
        `brandKey=${item.brandKey} brand="${item.brand.slice(0, 40)}" brandJa="${brandJa.slice(0, 40)}"`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[FILL_BRAND_JA_ITEM_FAIL]",
        `brandKey=${item.brandKey} model=${getGeminiModelName()} error=${msg}`
      );
    }
  }

  const result: FillBrandJaResult = {
    runDate: runDateTrimmed,
    runDateSource: source,
    limit: n,
    totalItemDocs,
    skippedHasBrandJa,
    skippedEmptyBrand,
    missingBeforeLimit,
    targetCount: targets.length,
    processed,
    updated,
    skipped,
    failed,
  };

  console.log(
    "[FILL_BRAND_JA_DONE]",
    `processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );
  console.log(
    "[FILL_BRAND_JA_SUMMARY]",
    `runDate=${runDateTrimmed} runDateSource=${source} totalItemDocs=${totalItemDocs} skipHasBrandJa=${skippedHasBrandJa} skipEmptyBrand=${skippedEmptyBrand} missingBrandJa=${missingBeforeLimit} targetSlice=${targets.length} processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );

  return result;
}

async function main(): Promise<void> {
  const { runDate, source } = await resolveBrandJaRunDate();
  const limit = parseLimitFromArgvOrEnv();
  await runFillBrandJa(runDate, limit, { runDateSource: source });
}

if (isMainModule()) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[FILL_BRAND_JA_ERROR]", err);
    console.error(`
Usage:
  pnpm exec tsx src/jobs/fillBrandJaJob.ts [runDate|latest] [limit]

  runDate: YYYY-MM-DD または latest（省略時は BRAND_RANKINGS_RUN_DATE / 最新 doc）
  limit: 省略時は LIMIT env または ${DEFAULT_LIMIT}

Examples:
  pnpm run oliveyoung:fill-brand-ja
  BRAND_RANKINGS_RUN_DATE=2026-03-14 LIMIT=50 pnpm run oliveyoung:fill-brand-ja
`);
    if (!msg.includes("[FILL_BRAND_JA]")) {
      console.error(msg);
    }
    process.exit(1);
  });
}
