/**
 * 補完系パイプライン（親 Job）
 *
 * 順に実行:
 *   1. fill-product-brand-ja
 *   2. fill-product-name-ja
 *   3. fill-review-summary-ja
 *   4. fill-ingredient-summary-ja
 *
 * 各ステップは別プロセス（pnpm script）で起動する。個別 Job ファイル末尾の main() と衝突しない。
 *
 * 件数（ステップごと）:
 *   PRODUCT_BRAND_JA_LIMIT       （既定 20）
 *   PRODUCT_NAME_JA_LIMIT      （既定 20）
 *   REVIEW_SUMMARY_JA_LIMIT    （既定 30、review が重いので小め推奨）
 *   INGREDIENT_SUMMARY_JA_LIMIT（既定 30）
 *
 * スキャン幅などは子が参照する既存 env のまま（例: BRAND_JA_SCAN_LIMIT, PRODUCT_NAME_JA_SCAN_LIMIT）。
 * 各ステップに渡す LIMIT のみ上書きする。
 *
 * その他: FORCE_REGENERATE は process.env を継承（review / ingredient で利用）。
 *
 * Cloud Run / Scheduler:
 *   JOB_TYPE=fill-products-enrich（index 経由）または
 *   pnpm run oliveyoung:fill-products-enrich
 */
import dotenv from "dotenv";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);

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
const __dirname = path.dirname(__filename);
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});

const SCRIPTS = {
  brand: "oliveyoung:fill-product-brand-ja",
  name: "oliveyoung:fill-product-name-ja",
  review: "oliveyoung:fill-review-summary-ja",
  ingredient: "oliveyoung:fill-ingredient-summary-ja",
} as const;

const DEFAULT_PRODUCT_BRAND_JA_LIMIT = 20;
const DEFAULT_PRODUCT_NAME_JA_LIMIT = 20;
/** review は LLM が重い — Cloud Run timeout 対策で既定は控えめ */
const DEFAULT_REVIEW_SUMMARY_JA_LIMIT = 30;
const DEFAULT_INGREDIENT_SUMMARY_JA_LIMIT = 30;

function parseStepLimit(envKey: string, defaultVal: number): number {
  const raw = process.env[envKey];
  if (raw != null && String(raw).trim() !== "") {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(1, n), 500);
  }
  return defaultVal;
}

function runStep(
  script: string,
  stepId: string,
  envOverrides: Record<string, string>
): boolean {
  console.log(
    "[FILL_PRODUCTS_ENRICH_STEP_BEGIN]",
    `step=${stepId} script=${script}`
  );
  const r = spawnSync("pnpm", ["run", script], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: { ...process.env, ...envOverrides },
  });
  const exitCode = r.status;
  const ok = exitCode === 0;
  console.log(
    "[FILL_PRODUCTS_ENRICH_STEP_END]",
    `step=${stepId} ok=${ok ? 1 : 0} exitCode=${exitCode ?? "null"}`
  );
  return ok;
}

export async function runFillProductsEnrich(): Promise<{
  ok: boolean;
  failedSteps: string[];
}> {
  const brandLimit = parseStepLimit(
    "PRODUCT_BRAND_JA_LIMIT",
    DEFAULT_PRODUCT_BRAND_JA_LIMIT
  );
  const nameLimit = parseStepLimit(
    "PRODUCT_NAME_JA_LIMIT",
    DEFAULT_PRODUCT_NAME_JA_LIMIT
  );
  const reviewLimit = parseStepLimit(
    "REVIEW_SUMMARY_JA_LIMIT",
    DEFAULT_REVIEW_SUMMARY_JA_LIMIT
  );
  const ingredientLimit = parseStepLimit(
    "INGREDIENT_SUMMARY_JA_LIMIT",
    DEFAULT_INGREDIENT_SUMMARY_JA_LIMIT
  );

  const t0 = Date.now();
  console.log(
    "[FILL_PRODUCTS_ENRICH_START]",
    `PRODUCT_BRAND_JA_LIMIT=${brandLimit} PRODUCT_NAME_JA_LIMIT=${nameLimit} REVIEW_SUMMARY_JA_LIMIT=${reviewLimit} INGREDIENT_SUMMARY_JA_LIMIT=${ingredientLimit} BRAND_JA_SCAN_LIMIT=${process.env.BRAND_JA_SCAN_LIMIT ?? "(inherit)"} PRODUCT_NAME_JA_SCAN_LIMIT=${process.env.PRODUCT_NAME_JA_SCAN_LIMIT ?? "(inherit)"}`
  );

  const failedSteps: string[] = [];

  if (
    !runStep(SCRIPTS.brand, "fill-product-brand-ja", {
      LIMIT: String(brandLimit),
    })
  ) {
    failedSteps.push("fill-product-brand-ja");
  }

  if (
    !runStep(SCRIPTS.name, "fill-product-name-ja", {
      LIMIT: String(nameLimit),
    })
  ) {
    failedSteps.push("fill-product-name-ja");
  }

  if (
    !runStep(SCRIPTS.review, "fill-review-summary-ja", {
      LIMIT: String(reviewLimit),
    })
  ) {
    failedSteps.push("fill-review-summary-ja");
  }

  if (
    !runStep(SCRIPTS.ingredient, "fill-ingredient-summary-ja", {
      LIMIT: String(ingredientLimit),
    })
  ) {
    failedSteps.push("fill-ingredient-summary-ja");
  }

  const elapsedMs = Date.now() - t0;
  const ok = failedSteps.length === 0;
  console.log(
    "[FILL_PRODUCTS_ENRICH_DONE]",
    `ok=${ok ? 1 : 0} elapsedMs=${elapsedMs} failedSteps=${failedSteps.length ? failedSteps.join(",") : "-"}`
  );
  console.log(
    "[FILL_PRODUCTS_ENRICH_SUMMARY]",
    `steps=4 elapsedMs=${elapsedMs} failed=${failedSteps.join("|") || "none"}`
  );

  return { ok, failedSteps };
}

async function main(): Promise<void> {
  const { ok, failedSteps } = await runFillProductsEnrich();
  if (!ok) {
    console.error(
      "[FILL_PRODUCTS_ENRICH_ERROR]",
      `failedSteps=${failedSteps.join(",")}`
    );
    process.exit(1);
  }
  process.exit(0);
}

if (isMainModule()) {
  main().catch((err: unknown) => {
    console.error("[FILL_PRODUCTS_ENRICH_FATAL]", err);
    process.exit(1);
  });
}
