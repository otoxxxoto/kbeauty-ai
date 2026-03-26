/**
 * 指定 goodsNo 1件に対して nameJa / summaryJa を生成して保存する補助ジョブ
 *
 * 使い方:
 *   pnpm run oliveyoung:localize-one A000000223414
 *   pnpm tsx src/jobs/fillOliveYoungLocalizedFieldsForOneJob.ts A000000223414
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
  getPublicProductByGoodsNo,
  updateProductNameJa,
  updateProductSummaryJa,
} from "../services/productFirestore";
import { generateJapaneseProductName } from "../lib/oliveyoung/fillNameJa";
import { generateSummaryJa } from "../lib/oliveyoung/fillSummaryJa";

export async function runFillOliveYoungLocalizedFieldsForOne(
  goodsNo: string
): Promise<void> {
  const trimmed = (goodsNo || "").trim();
  if (!trimmed) {
    throw new Error("goodsNo is required");
  }

  console.log("[LOCALIZE_ONE_START]", `goodsNo=${trimmed}`);

  const product = await getPublicProductByGoodsNo(trimmed);
  if (!product) {
    throw new Error(`Product not found: ${trimmed}`);
  }

  const needsNameJa =
    !(product.nameJa ?? "").trim() && (product.name ?? "").trim();
  const needsSummaryJa =
    !(product.summaryJa ?? "").trim() &&
    ((product.name ?? "").trim() || (product.nameJa ?? "").trim());

  let currentNameJa = product.nameJa ?? "";
  if (needsNameJa) {
    const nameJa = await generateJapaneseProductName({
      brand: product.brand,
      brandJa: product.brandJa,
      name: product.name,
      goodsNo: product.goodsNo,
    });
    if (nameJa) {
      await updateProductNameJa(product.goodsNo, nameJa);
      currentNameJa = nameJa;
      console.log("[LOCALIZE_ONE_NAME_JA]", `goodsNo=${product.goodsNo} nameJa="${nameJa}"`);
    }
  }

  if (needsSummaryJa) {
    const summaryJa = await generateSummaryJa({
      brand: product.brand,
      brandJa: product.brandJa,
      name: product.name,
      nameJa: currentNameJa || undefined,
      lastRank: product.lastRank,
      lastSeenRunDate: product.lastSeenRunDate,
    });
    if (summaryJa) {
      await updateProductSummaryJa(product.goodsNo, summaryJa);
      console.log("[LOCALIZE_ONE_SUMMARY_JA]", `goodsNo=${product.goodsNo} summaryJa="${summaryJa}"`);
    }
  }

  console.log("[LOCALIZE_ONE_DONE]", `goodsNo=${product.goodsNo}`);
}

async function main(): Promise<void> {
  const goodsNo = process.argv[2]?.trim();
  if (!goodsNo) {
    console.error("Usage: pnpm tsx src/jobs/fillOliveYoungLocalizedFieldsForOneJob.ts <goodsNo>");
    process.exit(1);
  }

  await runFillOliveYoungLocalizedFieldsForOne(goodsNo);
}

main().catch((err) => {
  console.error("[LOCALIZE_ONE_ERROR]", err);
  process.exit(1);
});
