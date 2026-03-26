/**
 * summaryJa / ingredientSummaryJa / reviewSummaryJa が空または unsafe の商品を再生成する。
 *
 * 使い方:
 *   pnpm run oliveyoung:regenerate-bad-summaries
 *   pnpm run oliveyoung:regenerate-bad-summaries -- 20
 *   pnpm run oliveyoung:regenerate-bad-summaries -- --goods=A000000234422
 *
 * 環境変数: SUMMARY_REGEN_SCAN_LIMIT（既定 2500）
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

import { generateSummaryJa } from "../lib/oliveyoung/fillSummaryJa";
import { getGeminiModelName } from "../lib/oliveyoung/fillNameJa";
import { produceIngredientSummaryJaText } from "../lib/oliveyoung/ingredientSummaryGeneration";
import { produceReviewSummaryJaText } from "../lib/oliveyoung/reviewSummaryGeneration";
import { isUnsafeGeneratedSummary } from "../lib/oliveyoung/generatedSummaryQuality";
import {
  getProductsNeedingSummaryRegeneration,
  updateProductSummaryJa,
  type ProductSummaryRegenCandidate,
} from "../services/productFirestore";
import {
  updateProductIngredientSummaryJa,
  type ProductForIngredientSummaryJa,
} from "../services/ingredientSummaryJaFirestore";
import {
  updateProductReviewSummaryJa,
  type ProductForReviewSummaryJa,
} from "../services/reviewSummaryJaFirestore";

const DEFAULT_LIMIT = 20;
const DEFAULT_SCAN = 2500;

function clip(s: string | undefined, max = 160): string {
  const t = (s ?? "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "(empty)";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export type RegenerateBadSummariesCli = {
  limit: number;
  scanLimit: number;
  goodsNo?: string;
};

export function parseRegenerateBadSummariesArgs(argv: string[]): RegenerateBadSummariesCli {
  let limit = DEFAULT_LIMIT;
  let goodsNo: string | undefined;
  for (const a of argv) {
    if (a.startsWith("--goods=")) {
      goodsNo = a.slice("--goods=".length).trim() || undefined;
      continue;
    }
    if (/^\d+$/.test(a)) {
      const n = parseInt(a, 10);
      if (Number.isFinite(n)) limit = Math.min(Math.max(1, n), 500);
    }
  }
  let scanLimit = DEFAULT_SCAN;
  const scanRaw = process.env.SUMMARY_REGEN_SCAN_LIMIT;
  if (scanRaw != null && scanRaw !== "") {
    const n = parseInt(String(scanRaw), 10);
    if (Number.isFinite(n)) scanLimit = Math.min(Math.max(100, n), 5000);
  }
  return { limit, scanLimit, goodsNo };
}

function toIngredientProduct(c: ProductSummaryRegenCandidate): ProductForIngredientSummaryJa {
  return {
    goodsNo: c.goodsNo,
    name: c.name,
    nameJa: c.nameJa,
    brand: c.brand,
    brandJa: c.brandJa,
    summaryJa: c.summaryJa,
    ingredientSummaryJa: c.ingredientSummaryJa,
  };
}

function toReviewProduct(c: ProductSummaryRegenCandidate): ProductForReviewSummaryJa {
  return {
    goodsNo: c.goodsNo,
    name: c.name,
    nameJa: c.nameJa,
    brand: c.brand,
    brandJa: c.brandJa,
    summaryJa: c.summaryJa,
    reviewSummaryJa: c.reviewSummaryJa,
  };
}

export async function runRegenerateBadSummaries(cli: RegenerateBadSummariesCli): Promise<void> {
  const { limit, scanLimit, goodsNo } = cli;
  console.log(
    "[REGEN_BAD_SUMMARIES_START]",
    `limit=${limit} scanLimit=${scanLimit} model=${getGeminiModelName()} goodsNo=${goodsNo ?? "-"}`
  );

  const targets = await getProductsNeedingSummaryRegeneration(limit, scanLimit, goodsNo);
  console.log("[REGEN_BAD_SUMMARIES_TARGETS]", `count=${targets.length}`);

  let fieldsDone = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of targets) {
    for (const field of c.fields) {
      const before =
        field === "summaryJa"
          ? c.summaryJa
          : field === "ingredientSummaryJa"
            ? c.ingredientSummaryJa
            : c.reviewSummaryJa;

      try {
        let after = "";
        if (field === "summaryJa") {
          after = await generateSummaryJa({
            brand: c.brand,
            brandJa: c.brandJa,
            name: c.name,
            nameJa: c.nameJa,
            lastRank: c.lastRank,
            lastSeenRunDate: c.lastSeenRunDate,
          });
        } else if (field === "ingredientSummaryJa") {
          after = await produceIngredientSummaryJaText(toIngredientProduct(c));
        } else {
          after = await produceReviewSummaryJaText(toReviewProduct(c));
        }

        if (!after.trim() || isUnsafeGeneratedSummary(after)) {
          skipped += 1;
          console.warn(
            "[REGEN_BAD_SUMMARIES_SKIP]",
            `goodsNo=${c.goodsNo} field=${field} reason=empty_or_still_unsafe`
          );
          continue;
        }

        if (field === "summaryJa") {
          await updateProductSummaryJa(c.goodsNo, after);
          c.summaryJa = after;
        } else if (field === "ingredientSummaryJa") {
          await updateProductIngredientSummaryJa(c.goodsNo, after);
          c.ingredientSummaryJa = after;
        } else {
          await updateProductReviewSummaryJa(c.goodsNo, after);
          c.reviewSummaryJa = after;
        }

        fieldsDone += 1;
        console.log(
          "[SUMMARY_REGENERATED]",
          `goodsNo=${c.goodsNo} / field=${field} / before=${clip(before)} / after=${clip(after)}`
        );
      } catch (e) {
        failed += 1;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(
          "[REGEN_BAD_SUMMARIES_FAIL]",
          `goodsNo=${c.goodsNo} field=${field} error=${msg}`
        );
      }
    }
  }

  console.log(
    "[REGEN_BAD_SUMMARIES_DONE]",
    `products=${targets.length} fieldsUpdated=${fieldsDone} skipped=${skipped} failed=${failed}`
  );
}

async function main(): Promise<void> {
  await runRegenerateBadSummaries(parseRegenerateBadSummariesArgs(process.argv.slice(2)));
}

main().catch((err) => {
  console.error("[REGEN_BAD_SUMMARIES_ERROR]", err);
  process.exit(1);
});
