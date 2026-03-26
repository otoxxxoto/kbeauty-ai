/**
 * nameJa 補填ジョブ（スキャン既定 400 件）
 * oliveyoung_products_public のうち name 有効・nameJa なしの商品に
 * LLM で日本語補助表示名を生成して保存する。
 *
 * 広いスキャン・詳細ログは fillProductNameJaJob（pnpm oliveyoung:fill-product-name-ja）を使用。
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-name-ja
 *   pnpm run oliveyoung:fill-name-ja 20
 *   pnpm tsx src/jobs/fillOliveYoungNameJaJob.ts 20
 *
 * 第1引数: limit（デフォルト 20）
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
  getProductsMissingNameJa,
  updateProductNameJa,
} from "../services/productFirestore";
import {
  generateJapaneseProductName,
  getGeminiModelName,
} from "../lib/oliveyoung/fillNameJa";

const DEFAULT_LIMIT = 20;

function parseLimit(): number {
  const raw = process.argv[2];
  if (raw === undefined || raw === "") return DEFAULT_LIMIT;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num >= 1 ? Math.min(num, 500) : DEFAULT_LIMIT;
}

export async function runFillOliveYoungNameJa(limit: number): Promise<void> {
  const n = Math.min(Math.max(1, limit), 500);

  console.log("[FILL_NAME_JA_START]", `limit=${n}`);

  const targets = await getProductsMissingNameJa(n);
  console.log("[FILL_NAME_JA_TARGETS]", `count=${targets.length}`);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of targets) {
    processed += 1;

    if (!item.name || item.name.trim() === "") {
      skipped += 1;
      console.log("[FILL_NAME_JA_SKIP]", `goodsNo=${item.goodsNo} reason=name_empty`);
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
          "[FILL_NAME_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=empty_output name="${item.name.slice(0, 40)}..."`
        );
        continue;
      }

      await updateProductNameJa(item.goodsNo, nameJa);
      updated += 1;
      console.log(
        "[FILL_NAME_JA_ITEM]",
        `goodsNo=${item.goodsNo} name="${item.name.slice(0, 50)}${item.name.length > 50 ? "..." : ""}" nameJa="${nameJa.slice(0, 50)}${nameJa.length > 50 ? "..." : ""}"`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[FILL_NAME_JA_ITEM_FAIL]",
        `goodsNo=${item.goodsNo} model=${getGeminiModelName()} error=${msg}`
      );
    }
  }

  console.log(
    "[FILL_NAME_JA_DONE]",
    `processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );
  console.log(
    "[FILL_NAME_JA_SUMMARY]",
    `processed=${processed} updated=${updated} skipped=${skipped} failed=${failed}`
  );
}

async function main(): Promise<void> {
  await runFillOliveYoungNameJa(parseLimit());
}

main().catch((err) => {
  console.error("[FILL_NAME_JA_ERROR]", err);
  process.exit(1);
});
