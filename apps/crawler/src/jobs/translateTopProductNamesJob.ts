/**
 * Web TOP（急上昇・今日の注目）に載る商品のうち、nameJa が空または unsafe のものだけ
 * 韓国語 name から再翻訳して oliveyoung_products_public を更新する。
 *
 * 使い方:
 *   pnpm run oliveyoung:translate-top-product-names
 *   pnpm run oliveyoung:translate-top-product-names -- 20
 *
 * 環境変数（任意）:
 *   TOP_TRANSLATE_RISING_MAX — 急上昇枠（既定 5）
 *   TOP_TRANSLATE_SPOTLIGHT_N — 注目枠（既定 3）
 */
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Firestore } from "@google-cloud/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
});
console.log("[ENV_CHECK] GEMINI_API_KEY exists=", !!process.env.GEMINI_API_KEY);

import { collectTopRisingAndSpotlightGoodsNos } from "../lib/topPageDisplayedSlotsFirestore";
import {
  getPublicProductByGoodsNo,
  updateProductNameJa,
} from "../services/productFirestore";
import {
  getGeminiModelName,
  translateProductNameToJa,
} from "../lib/oliveyoung/fillNameJa";
import {
  composeFallbackNameJaBrandCategory,
  isUnsafeNameJa,
} from "../lib/oliveyoung/nameJaQuality";
import { hasTranslatableSourceForNameJa } from "../lib/oliveyoung/nameJaSourceQuality";

const DEFAULT_LIMIT = 20;

function parseLimit(argv: string[]): number {
  for (const a of argv) {
    if (/^\d+$/.test(a)) {
      const n = parseInt(a, 10);
      if (Number.isFinite(n)) return Math.min(Math.max(1, n), 500);
    }
  }
  return DEFAULT_LIMIT;
}

function parseRisingMax(): number {
  const raw = process.env.TOP_TRANSLATE_RISING_MAX;
  if (raw != null && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(1, n), 20);
  }
  return 5;
}

function parseSpotlightN(): number {
  const raw = process.env.TOP_TRANSLATE_SPOTLIGHT_N;
  if (raw != null && raw !== "") {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(1, n), 20);
  }
  return 3;
}

function isValidPublicName(name: string): boolean {
  const s = name.trim();
  return s !== "" && s !== "Unknown";
}

function nameJaNeedsRetranslation(
  nameJa: string,
  brand: string,
  brandJa: string
): boolean {
  const ja = nameJa.trim();
  if (ja === "") return true;
  return isUnsafeNameJa(ja, { brand, brandJa: brandJa || undefined });
}

export async function runTranslateTopProductNames(maxTranslations: number): Promise<void> {
  const risingMax = parseRisingMax();
  const spotlightN = parseSpotlightN();

  const db = new Firestore();
  db.settings({ ignoreUndefinedProperties: true });

  const { goodsNos, runDateLatest, runDatesCount } =
    await collectTopRisingAndSpotlightGoodsNos(db, {
      risingMax,
      spotlightN,
    });

  console.log(
    "[TOP_TRANSLATE_NAME_JA_START]",
    `maxTranslations=${maxTranslations} risingMax=${risingMax} spotlightN=${spotlightN} model=${getGeminiModelName()} runDateLatest=${runDateLatest ?? "-"} runDatesCount=${runDatesCount} topSlotGoods=${goodsNos.length}`
  );

  type Target = {
    goodsNo: string;
    name: string;
    brand: string;
    brandJa?: string;
    nameJaBefore: string;
    reviewSummaryJa?: string;
    ingredientSummaryJa?: string;
    summaryJa?: string;
  };

  const targets: Target[] = [];
  for (const goodsNo of goodsNos) {
    const p = await getPublicProductByGoodsNo(goodsNo);
    if (!p || !isValidPublicName(p.name)) continue;
    const nameJa = (p.nameJa ?? "").trim();
    const brand = (p.brand ?? "").trim();
    const brandJa = (p.brandJa ?? "").trim();
    if (!nameJaNeedsRetranslation(nameJa, brand, brandJa)) continue;
    targets.push({
      goodsNo: p.goodsNo,
      name: p.name.trim(),
      brand,
      brandJa: brandJa || undefined,
      nameJaBefore: nameJa,
      reviewSummaryJa: p.reviewSummaryJa,
      ingredientSummaryJa: p.ingredientSummaryJa,
      summaryJa: p.summaryJa,
    });
    if (targets.length >= maxTranslations) break;
  }

  console.log(
    "[TOP_TRANSLATE_NAME_JA_TARGETS]",
    `needTranslation=${targets.length} (capped by limit=${maxTranslations})`
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of targets) {
    try {
      if (
        !hasTranslatableSourceForNameJa({
          name: item.name,
          brand: item.brand,
          brandJa: item.brandJa,
          reviewSummaryJa: item.reviewSummaryJa,
          ingredientSummaryJa: item.ingredientSummaryJa,
          summaryJa: item.summaryJa,
        })
      ) {
        skipped += 1;
        console.log(
          "[TOP_TRANSLATE_NAME_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=missing_source_name`
        );
        continue;
      }

      const jaCtx = { brand: item.brand, brandJa: item.brandJa };
      let nameJa = await translateProductNameToJa(item.name, {
        brand: item.brand,
        brandJa: item.brandJa,
        goodsNo: item.goodsNo,
      });
      if (nameJa === "") {
        skipped += 1;
        console.log(
          "[TOP_TRANSLATE_NAME_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=empty_output`
        );
        continue;
      }
      if (isUnsafeNameJa(nameJa, jaCtx)) {
        nameJa = await translateProductNameToJa(item.name, {
          brand: item.brand,
          brandJa: item.brandJa,
          goodsNo: item.goodsNo,
        });
      }
      if (isUnsafeNameJa(nameJa, jaCtx)) {
        nameJa = composeFallbackNameJaBrandCategory(item.brand, item.brandJa, item.name);
      }
      if (nameJa === "" || isUnsafeNameJa(nameJa, jaCtx)) {
        skipped += 1;
        console.warn(
          "[TOP_TRANSLATE_NAME_JA_SKIP]",
          `goodsNo=${item.goodsNo} reason=unsafe_generated_name nameJa="${nameJa.slice(0, 80)}"`
        );
        continue;
      }
      await updateProductNameJa(item.goodsNo, nameJa);
      updated += 1;
      const beforeLog = item.nameJaBefore || "(empty)";
      console.log(
        "[NAME_JA_TRANSLATED]",
        `goodsNo=${item.goodsNo} / before=${beforeLog} / after=${nameJa} / source=top_slot`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[TOP_TRANSLATE_NAME_JA_FAIL]",
        `goodsNo=${item.goodsNo} model=${getGeminiModelName()} error=${msg}`
      );
    }
  }

  console.log(
    "[TOP_TRANSLATE_NAME_JA_DONE]",
    `updated=${updated} skipped=${skipped} failed=${failed}`
  );
}

async function main(): Promise<void> {
  const limit = parseLimit(process.argv.slice(2));
  await runTranslateTopProductNames(limit);
}

main().catch((err) => {
  console.error("[TOP_TRANSLATE_NAME_JA_ERROR]", err);
  process.exit(1);
});
