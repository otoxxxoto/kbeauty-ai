/**
 * summaryJa 補填ジョブ
 * oliveyoung_products_public のうち name あり・summaryJa なしの商品に
 * LLM で短い日本語補助説明を生成して保存する。
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-summary-ja
 *   pnpm run oliveyoung:fill-summary-ja 5
 *   pnpm tsx src/jobs/fillOliveYoungSummaryJaJob.ts 5
 *
 * 第1引数: limit（デフォルト 5）
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});
console.log("[ENV_CHECK] GEMINI_API_KEY exists=", !!process.env.GEMINI_API_KEY);

import {
  getProductsMissingSummaryJa,
  updateProductSummaryJa,
} from "../services/productFirestore";
import { generateSummaryJa } from "../lib/oliveyoung/fillSummaryJa";
import { getGeminiModelName } from "../lib/oliveyoung/fillNameJa";

const DEFAULT_LIMIT = 5;

function parseLimit(): number {
  const raw = process.argv[2];
  if (raw === undefined || raw === "") return DEFAULT_LIMIT;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num >= 1 ? Math.min(num, 500) : DEFAULT_LIMIT;
}

export async function runFillOliveYoungSummaryJa(limit: number): Promise<void> {
  const n = Math.min(Math.max(1, limit), 500);

  console.log("[FILL_SUMMARY_JA_START]", `limit=${n}`);

  const targets = await getProductsMissingSummaryJa(n);
  console.log("[FILL_SUMMARY_JA_TARGETS]", `count=${targets.length}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of targets) {
    processed += 1;

    const hasName = (item.name ?? "").trim() !== "";
    const hasNameJa = (item.nameJa ?? "").trim() !== "";
    if (!hasName && !hasNameJa) {
      skipped += 1;
      console.log("[FILL_SUMMARY_JA_SKIP]", `goodsNo=${item.goodsNo} reason=name_and_nameJa_empty`);
      continue;
    }

    try {
      const summaryJa = await generateSummaryJa({
        brand: item.brand,
        brandJa: item.brandJa,
        name: item.name,
        nameJa: item.nameJa,
        lastRank: item.lastRank,
        lastSeenRunDate: item.lastSeenRunDate,
      });

      if (summaryJa === "") {
        skipped += 1;
        console.log(
          "[FILL_SUMMARY_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=empty_output name="${(item.name || "").slice(0, 40)}..."`
        );
        continue;
      }

      const before = (item.summaryJa || "").trim() || "(empty)";
      await updateProductSummaryJa(item.goodsNo, summaryJa);
      updated += 1;
      console.log(
        "[SUMMARY_REGENERATED]",
        `goodsNo=${item.goodsNo} / field=summaryJa / before=${before.slice(0, 80)} / after=${summaryJa.slice(0, 80)}`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[FILL_SUMMARY_JA_ITEM_FAIL]",
        `goodsNo=${item.goodsNo} model=${getGeminiModelName()} error=${msg}`
      );
    }
  }

  console.log(
    "[FILL_SUMMARY_JA_DONE]",
    `processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );
  console.log(
    "[FILL_SUMMARY_JA_SUMMARY]",
    `processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );
}

async function main(): Promise<void> {
  await runFillOliveYoungSummaryJa(parseLimit());
}

main().catch((err) => {
  console.error("[FILL_SUMMARY_JA_ERROR]", err);
  process.exit(1);
});
