/**
 * nameJa が空、または isUnsafeNameJa（Web と同一判定）の商品を
 * 韓国語 name から再翻訳し oliveyoung_products_public に保存する。
 *
 * 使い方:
 *   pnpm run oliveyoung:translate-product-names
 *   pnpm run oliveyoung:translate-product-names -- 50
 *   pnpm run oliveyoung:translate-product-names -- --goods=A000000234422
 *
 * 環境変数:
 *   PRODUCT_NAME_JA_SCAN_LIMIT — スキャン上限（既定 2500）
 *   OLIVEYOUNG_DISABLE_AUTO_NAME_JA_TRANSLATE — upsert 時の自動翻訳は別（1 で無効）
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
  getProductsNeedingNameJaTranslationWithStats,
  updateProductNameJa,
} from "../services/productFirestore";
import {
  getGeminiModelName,
  translateProductNameToJa,
} from "../lib/oliveyoung/fillNameJa";
import { isUnsafeNameJa } from "../lib/oliveyoung/nameJaQuality";

const DEFAULT_LIMIT = 50;
const DEFAULT_SCAN_LIMIT = 2500;

export type TranslateProductNamesCli = {
  limit: number;
  scanLimit: number;
  goodsNo?: string;
};

export function parseTranslateProductNamesArgs(argv: string[]): TranslateProductNamesCli {
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
  const scanRaw = process.env.PRODUCT_NAME_JA_SCAN_LIMIT;
  let scanLimit = DEFAULT_SCAN_LIMIT;
  if (scanRaw != null && scanRaw !== "") {
    const n = parseInt(String(scanRaw), 10);
    if (Number.isFinite(n)) scanLimit = Math.min(Math.max(100, n), 5000);
  }
  return { limit, scanLimit, goodsNo };
}

export async function runTranslateOliveYoungProductNames(
  cli: TranslateProductNamesCli
): Promise<void> {
  const { limit, scanLimit, goodsNo } = cli;
  console.log(
    "[TRANSLATE_NAME_JA_START]",
    `limit=${limit} scanLimit=${scanLimit} model=${getGeminiModelName()} goodsNo=${goodsNo ?? "-"}`
  );

  const stats = await getProductsNeedingNameJaTranslationWithStats(
    limit,
    scanLimit,
    goodsNo
  );

  console.log(
    "[TRANSLATE_NAME_JA_SCAN]",
    `scanned=${stats.scannedDocs} targets=${stats.items.length} okJaSkipped=${stats.docsSkippedOkNameJa} invalidName=${stats.docsSkippedInvalidName}`
  );

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of stats.items) {
    processed += 1;
    const before = item.nameJaBefore ?? "";

    if (!item.name || item.name.trim() === "") {
      skipped += 1;
      console.log(
        "[TRANSLATE_NAME_JA_SKIP]",
        `goodsNo=${item.goodsNo} reason=name_empty`
      );
      continue;
    }

    try {
      const nameJa = await translateProductNameToJa(item.name, {
        brand: item.brand,
        goodsNo: item.goodsNo,
      });

      if (nameJa === "") {
        skipped += 1;
        console.log(
          "[TRANSLATE_NAME_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=empty_output`
        );
        continue;
      }

      if (isUnsafeNameJa(nameJa, { brand: item.brand, brandJa: item.brandJa })) {
        skipped += 1;
        console.warn(
          "[TRANSLATE_NAME_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=still_unsafe_after_llm nameJa="${nameJa.slice(0, 80)}"`
        );
        continue;
      }

      await updateProductNameJa(item.goodsNo, nameJa);
      updated += 1;
      const beforeLog = before || "(empty)";
      console.log(
        "[NAME_JA_TRANSLATED]",
        `goodsNo=${item.goodsNo} / before=${beforeLog} / after=${nameJa}`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[TRANSLATE_NAME_JA_FAIL]",
        `goodsNo=${item.goodsNo} model=${getGeminiModelName()} error=${msg}`
      );
    }
  }

  console.log(
    "[TRANSLATE_NAME_JA_DONE]",
    `processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );
}

async function main(): Promise<void> {
  const cli = parseTranslateProductNamesArgs(process.argv.slice(2));
  await runTranslateOliveYoungProductNames(cli);
}

main().catch((err) => {
  console.error("[TRANSLATE_NAME_JA_ERROR]", err);
  process.exit(1);
});
