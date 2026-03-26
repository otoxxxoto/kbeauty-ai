/**
 * ingredientSummaryJa 補完ジョブ（ランキング本体と完全分離）
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-ingredient-summary-ja
 *   pnpm run oliveyoung:fill-ingredient-summary-ja 30
 */
import "dotenv/config";
import {
  getProductsMissingIngredientSummaryJa,
  updateProductIngredientSummaryJa,
} from "../services/ingredientSummaryJaFirestore";
import { produceIngredientSummaryJaText } from "../lib/oliveyoung/ingredientSummaryGeneration";

const DEFAULT_LIMIT = 50;

function parseLimit(): number {
  const arg = process.argv[2];
  if (arg !== undefined && arg !== "") {
    const n = parseInt(arg, 10);
    if (Number.isFinite(n)) return Math.min(Math.max(1, n), 500);
  }
  const env = process.env.LIMIT;
  if (env != null && env !== "") {
    const n = parseInt(String(env), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(1, n), 500);
  }
  return DEFAULT_LIMIT;
}

function parseForceRegenerate(): boolean {
  const v = String(process.env.FORCE_REGENERATE ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export async function runFillIngredientSummaryJa(
  limit: number
): Promise<{
  processed: number;
  updated: number;
  skipped: number;
  skippedNoMatch: number;
  errors: number;
}> {
  const n = Math.min(Math.max(1, limit), 500);
  const forceRegenerate = parseForceRegenerate();

  console.log(
    "[INGREDIENT_SUMMARY_JA_START]",
    `limit=${n} forceRegenerate=${forceRegenerate} env_FORCE_REGENERATE=${JSON.stringify(process.env.FORCE_REGENERATE ?? "(unset)")}`
  );

  const targets = await getProductsMissingIngredientSummaryJa(n, forceRegenerate);
  const sampleGoodsNo = targets.slice(0, 3).map((p) => p.goodsNo).join(",");
  console.log(
    "[INGREDIENT_SUMMARY_JA_TARGETS]",
    `count=${targets.length} forceRegenerate=${forceRegenerate} sampleGoodsNo=${sampleGoodsNo || "-"}`
  );

  if (targets.length === 0) {
    console.log(
      "[INGREDIENT_SUMMARY_JA_DONE]",
      "processed=0 updated=0 skipped=0 skippedNoMatch=0 errors=0"
    );
    return {
      processed: 0,
      updated: 0,
      skipped: 0,
      skippedNoMatch: 0,
      errors: 0,
    };
  }

  let updated = 0;
  let skippedNoMatch = 0;
  let errors = 0;

  for (const product of targets) {
    try {
      const text = await produceIngredientSummaryJaText(product);
      if (!text.trim()) {
        skippedNoMatch += 1;
        console.log(
          "[INGREDIENT_SUMMARY_JA_SKIP_NO_MATCH]",
          `goodsNo=${product.goodsNo} name=${(product.nameJa || product.name || "").slice(0, 25)}`
        );
        continue;
      }
      const before = (product.ingredientSummaryJa || "").trim() || "(empty)";
      await updateProductIngredientSummaryJa(product.goodsNo, text);
      updated += 1;
      console.log(
        "[SUMMARY_REGENERATED]",
        `goodsNo=${product.goodsNo} / field=ingredientSummaryJa / before=${before.slice(0, 80)} / after=${text.slice(0, 80)}`
      );
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[INGREDIENT_SUMMARY_JA_ITEM_FAIL]",
        `goodsNo=${product.goodsNo} error=${msg}`
      );
    }
  }

  const processed = targets.length;
  const skipped = processed - updated - skippedNoMatch - errors;
  console.log(
    "[INGREDIENT_SUMMARY_JA_DONE]",
    `processed=${processed} updated=${updated} skipped=${skipped} skippedNoMatch=${skippedNoMatch} errors=${errors} forceRegenerate=${forceRegenerate}`
  );
  return {
    processed,
    updated,
    skipped,
    skippedNoMatch,
    errors,
  };
}

async function main(): Promise<void> {
  const limit = parseLimit();
  await runFillIngredientSummaryJa(limit);
}

main().catch((err) => {
  console.error("[INGREDIENT_SUMMARY_JA_ERROR]", err);
  process.exit(1);
});
