/**
 * oliveyoung_products_public の nameJa 補填ジョブ（商品単位・一覧/詳細/SEO 用）
 *
 * 既存 fillOliveYoungNameJaJob と同じ生成・保存ロジックだが、
 * PRODUCT_NAME_JA_SCAN_LIMIT でスキャン幅を広げ、ログタグを分離（Cloud Run 運用しやすくする）。
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-product-name-ja
 *   pnpm run oliveyoung:fill-product-name-ja -- 50
 *   LIMIT=100 PRODUCT_NAME_JA_SCAN_LIMIT=3000 pnpm exec tsx src/jobs/fillProductNameJaJob.ts
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
  getProductsMissingNameJaWithStats,
  updateProductNameJa,
} from "../services/productFirestore";
import {
  generateJapaneseProductName,
  getGeminiModelName,
} from "../lib/oliveyoung/fillNameJa";

const DEFAULT_LIMIT = 20;
const DEFAULT_SCAN_LIMIT = 2500;

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

function parseScanLimit(): number {
  const raw = process.env.PRODUCT_NAME_JA_SCAN_LIMIT;
  if (raw != null && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(100, n), 5000);
  }
  return DEFAULT_SCAN_LIMIT;
}

export async function runFillProductNameJa(
  limit: number,
  scanLimit: number
): Promise<{
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const n = Math.min(Math.max(1, limit), 500);
  const scan = Math.min(Math.max(100, scanLimit), 5000);

  console.log(
    "[FILL_PRODUCT_NAME_JA_START]",
    `collection=oliveyoung_products_public limit=${n} scanLimit=${scan} model=${getGeminiModelName()}`
  );

  const {
    items: targets,
    scannedDocs,
    docsMissingNameJa,
    docsSkippedAlreadyHasNameJa,
    docsSkippedInvalidName,
  } = await getProductsMissingNameJaWithStats(n, scan);

  console.log(
    "[FILL_PRODUCT_NAME_JA_SCAN]",
    `scannedDocs=${scannedDocs} skipAlreadyHasNameJa=${docsSkippedAlreadyHasNameJa} skipInvalidName=${docsSkippedInvalidName} docsMissingNameJa=${docsMissingNameJa} targetProducts=${targets.length}`
  );

  const sample = targets
    .slice(0, 3)
    .map((t) => t.goodsNo)
    .join(",");
  console.log("[FILL_PRODUCT_NAME_JA_TARGETS]", `count=${targets.length} sampleGoodsNo=${sample || "-"}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of targets) {
    processed += 1;

    if (!item.name || item.name.trim() === "") {
      skipped += 1;
      console.log(
        "[FILL_PRODUCT_NAME_JA_SKIP]",
        `goodsNo=${item.goodsNo} reason=name_empty`
      );
      continue;
    }

    try {
      const nameJa = await generateJapaneseProductName({
        brand: item.brand,
        name: item.name,
        goodsNo: item.goodsNo,
      });

      if (nameJa === "") {
        skipped += 1;
        console.log(
          "[FILL_PRODUCT_NAME_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=empty_output name="${item.name.slice(0, 40)}${item.name.length > 40 ? "…" : ""}"`
        );
        continue;
      }

      await updateProductNameJa(item.goodsNo, nameJa);
      updated += 1;
      const namePrev = item.name.slice(0, 45) + (item.name.length > 45 ? "…" : "");
      const nameJaPrev = nameJa.slice(0, 45) + (nameJa.length > 45 ? "…" : "");
      console.log(
        "[FILL_PRODUCT_NAME_JA_ITEM_DONE]",
        `goodsNo=${item.goodsNo} name="${namePrev}" nameJa="${nameJaPrev}"`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[FILL_PRODUCT_NAME_JA_ITEM_FAIL]",
        `goodsNo=${item.goodsNo} model=${getGeminiModelName()} error=${msg}`
      );
    }
  }

  console.log(
    "[FILL_PRODUCT_NAME_JA_DONE]",
    `processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );
  console.log(
    "[FILL_PRODUCT_NAME_JA_SUMMARY]",
    `scannedDocs=${scannedDocs} skipAlreadyHasNameJa=${docsSkippedAlreadyHasNameJa} skipInvalidName=${docsSkippedInvalidName} docsMissingNameJa=${docsMissingNameJa} targetProducts=${targets.length} updated=${updated} skipped=${skipped} failed=${failed}`
  );

  return { processed, updated, skipped, failed };
}

async function main(): Promise<void> {
  await runFillProductNameJa(parseLimit(), parseScanLimit());
}

main().catch((err: unknown) => {
  console.error("[FILL_PRODUCT_NAME_JA_ERROR]", err);
  process.exit(1);
});
