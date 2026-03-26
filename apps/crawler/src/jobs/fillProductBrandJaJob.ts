/**
 * oliveyoung_products_public の brandJa 補填ジョブ（商品・一覧・ブランドページ表示用）
 *
 * 既存 fillBrandJaJob は brand_rankings のみ更新するため、商品 doc の brandJa は埋まらない。
 * 本ジョブは「brand あり・brandJa なし」の商品だけを対象に、同一 brand につき LLM は1回、
 * 該当する全 goodsNo に同じ brandJa を書き込む。
 *
 * Cloud Run Job 例:
 *   LIMIT=50 BRAND_JA_SCAN_LIMIT=3000 node dist/jobs/fillProductBrandJaJob.js
 *
 * ローカル:
 *   pnpm run oliveyoung:fill-product-brand-ja
 *   pnpm run oliveyoung:fill-product-brand-ja -- 30
 *   LIMIT=100 BRAND_JA_SCAN_LIMIT=2500 pnpm exec tsx src/jobs/fillProductBrandJaJob.ts
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
  getProductGroupsMissingBrandJa,
  updateManyProductsBrandJa,
} from "../services/productFirestore";
import { generateBrandJa } from "../lib/oliveyoung/fillBrandJa";
import { getGeminiModelName } from "../lib/oliveyoung/fillNameJa";

const DEFAULT_LIMIT_BRANDS = 20;
const DEFAULT_SCAN_LIMIT = 2500;

function parseLimitBrands(): number {
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
  return DEFAULT_LIMIT_BRANDS;
}

function parseScanLimit(): number {
  const raw = process.env.BRAND_JA_SCAN_LIMIT;
  if (raw != null && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(100, n), 5000);
  }
  return DEFAULT_SCAN_LIMIT;
}

export async function runFillProductBrandJa(
  limitBrands: number,
  scanLimit: number
): Promise<{
  brandsProcessed: number;
  productsUpdated: number;
  brandsSkippedEmptyBrand: number;
  brandsSkippedEmptyLlm: number;
  brandsFailed: number;
}> {
  const maxBrands = Math.min(Math.max(1, limitBrands), 500);
  const scan = Math.min(Math.max(100, scanLimit), 5000);

  console.log(
    "[FILL_PRODUCT_BRAND_JA_START]",
    `collection=oliveyoung_products_public maxBrands=${maxBrands} scanLimit=${scan} model=${getGeminiModelName()}`
  );

  const {
    groups,
    scannedDocs,
    docsMissingBrandJa,
    uniqueBrandsBeforeSlice,
    docsSkippedAlreadyHasBrandJa,
    docsSkippedInvalidBrand,
  } = await getProductGroupsMissingBrandJa(maxBrands, scan);

  console.log(
    "[FILL_PRODUCT_BRAND_JA_SCAN]",
    `scannedDocs=${scannedDocs} skipAlreadyHasBrandJa=${docsSkippedAlreadyHasBrandJa} skipInvalidBrand=${docsSkippedInvalidBrand} docsMissingBrandJa=${docsMissingBrandJa} uniqueBrandsMissing=${uniqueBrandsBeforeSlice} targetBrandGroups=${groups.length}`
  );

  const sample = groups
    .slice(0, 3)
    .map((g) => `${g.brand.slice(0, 20)}(${g.goodsNos.length})`)
    .join(" | ");
  console.log("[FILL_PRODUCT_BRAND_JA_TARGETS]", `sample=${sample || "-"}`);

  let brandsProcessed = 0;
  let productsUpdated = 0;
  let brandsSkippedEmptyBrand = 0;
  let brandsSkippedEmptyLlm = 0;
  let brandsFailed = 0;

  for (const group of groups) {
    const { brand, goodsNos } = group;
    if (!brand || goodsNos.length === 0) {
      brandsSkippedEmptyBrand += 1;
      console.log("[FILL_PRODUCT_BRAND_JA_SKIP]", "reason=empty_brand_or_goods");
      continue;
    }

    brandsProcessed += 1;

    try {
      const brandJa = await generateBrandJa({
        brand,
        brandKey: undefined,
      });

      if (brandJa === "") {
        brandsSkippedEmptyLlm += 1;
        console.log(
          "[FILL_PRODUCT_BRAND_JA_SKIP]",
          `reason=empty_llm brand="${brand.slice(0, 40)}" goodsCount=${goodsNos.length}`
        );
        continue;
      }

      const nWritten = await updateManyProductsBrandJa(goodsNos, brandJa);
      productsUpdated += nWritten;
      console.log(
        "[FILL_PRODUCT_BRAND_JA_BRAND_DONE]",
        `brand="${brand.slice(0, 50)}" brandJa="${brandJa.slice(0, 50)}" productsUpdated=${nWritten}`
      );
    } catch (err) {
      brandsFailed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[FILL_PRODUCT_BRAND_JA_BRAND_FAIL]",
        `brand="${brand.slice(0, 40)}" goodsCount=${goodsNos.length} error=${msg}`
      );
    }
  }

  console.log(
    "[FILL_PRODUCT_BRAND_JA_DONE]",
    `brandsProcessed=${brandsProcessed} productsUpdated=${productsUpdated} brandsSkippedEmptyBrand=${brandsSkippedEmptyBrand} brandsSkippedEmptyLlm=${brandsSkippedEmptyLlm} brandsFailed=${brandsFailed}`
  );
  console.log(
    "[FILL_PRODUCT_BRAND_JA_SUMMARY]",
    `scannedDocs=${scannedDocs} skipAlreadyHasBrandJa=${docsSkippedAlreadyHasBrandJa} skipInvalidBrand=${docsSkippedInvalidBrand} docsMissingBrandJa=${docsMissingBrandJa} uniqueBrandsMissing=${uniqueBrandsBeforeSlice} targetBrandGroups=${groups.length} productsUpdated=${productsUpdated} skippedLlm=${brandsSkippedEmptyLlm} failed=${brandsFailed}`
  );

  return {
    brandsProcessed,
    productsUpdated,
    brandsSkippedEmptyBrand,
    brandsSkippedEmptyLlm,
    brandsFailed,
  };
}

async function main(): Promise<void> {
  const limitBrands = parseLimitBrands();
  const scanLimit = parseScanLimit();
  await runFillProductBrandJa(limitBrands, scanLimit);
}

main().catch((err: unknown) => {
  console.error("[FILL_PRODUCT_BRAND_JA_ERROR]", err);
  process.exit(1);
});
