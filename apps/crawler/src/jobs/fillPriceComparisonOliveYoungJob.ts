/**
 * priceComparison.oliveyoung 補完ジョブ（ランキング本体と完全分離）
 * oliveyoung_products_public のうち productUrl があり、
 * 未取得 or priceComparison.oliveyoung.fetchedAt が古い商品について、
 * Olive Young 商品ページから価格を取得し priceComparison.oliveyoung に保存する。
 *
 * 初期実装: Olive Young のみ。Amazon / 楽天 / Qoo10 は触らない。
 * 再取得: PRICE_REFETCH_DAYS で日数閾値（未指定時 14 日）。古い取得分も対象。
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-price-comparison-oliveyoung
 *   PRICE_REFETCH_DAYS=14 pnpm run oliveyoung:fill-price-comparison-oliveyoung
 *   LIMIT=20 pnpm run oliveyoung:fill-price-comparison-oliveyoung
 */
import "dotenv/config";
import { getOliveyoungProductMeta } from "../sources/oliveyoungMeta";
import {
  getProductsMissingOliveYoungPrice,
  updateProductPriceComparisonOliveYoung,
  type ProductForPriceComparisonOliveYoungWithReason,
  type OliveYoungPriceEntry,
} from "../services/priceComparisonOliveYoungFirestore";

const DEFAULT_LIMIT = 50;
const DEFAULT_REFETCH_DAYS = 14;
const SOURCE_LABEL = "Olive Young";
const SOURCE_VALUE = "oliveyoung-product-page";

/**
 * Olive Young 商品ページから表示用価格テキストを取得（初期は oliveyoungMeta の salePrice/price を利用）。
 * 将来セレクタやAPIが変わった場合はこの関数のみ差し替え可能。
 */
export async function fetchOliveYoungPriceText(
  goodsNo: string
): Promise<string | null> {
  const meta = await getOliveyoungProductMeta(goodsNo);
  if (meta.priceKRW == null || !Number.isFinite(meta.priceKRW)) return null;
  return `${meta.priceKRW.toLocaleString()}원`;
}

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

function parseRefetchDays(): number {
  const env = process.env.PRICE_REFETCH_DAYS;
  if (env != null && env !== "") {
    const n = parseInt(String(env), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_REFETCH_DAYS;
}

export async function runFillPriceComparisonOliveYoung(
  limit: number,
  refetchDays: number = DEFAULT_REFETCH_DAYS
): Promise<{
  processed: number;
  updated: number;
  skippedNoPrice: number;
  errors: number;
  missingCount: number;
  staleCount: number;
}> {
  const n = Math.min(Math.max(1, limit), 500);

  console.log("[PRICE_COMPARISON_OY_START]", `limit=${n} refetchDays=${refetchDays}`);

  const targets = await getProductsMissingOliveYoungPrice(n, refetchDays);
  const missingCount = targets.filter((t) => t.reason === "missing").length;
  const staleCount = targets.filter((t) => t.reason === "stale").length;
  console.log(
    "[PRICE_COMPARISON_OY_TARGETS]",
    `count=${targets.length} missing=${missingCount} stale=${staleCount}`
  );

  if (targets.length === 0) {
    console.log(
      "[PRICE_COMPARISON_OY_DONE]",
      "processed=0 updated=0 skippedNoPrice=0 errors=0 missing=0 stale=0"
    );
    return {
      processed: 0,
      updated: 0,
      skippedNoPrice: 0,
      errors: 0,
      missingCount: 0,
      staleCount: 0,
    };
  }

  let updated = 0;
  let skippedNoPrice = 0;
  let errors = 0;

  for (const product of targets) {
    try {
      const priceText = await fetchOliveYoungPriceText(product.goodsNo);
      if (!priceText || !priceText.trim()) {
        skippedNoPrice += 1;
        console.log(
          "[PRICE_COMPARISON_OY_SKIP_NO_PRICE]",
          `goodsNo=${product.goodsNo} name=${(product.nameJa || product.name || "").slice(0, 25)}`
        );
        continue;
      }
      const entry: OliveYoungPriceEntry = {
        label: SOURCE_LABEL,
        priceText: priceText.trim(),
        url: product.productUrl.trim(),
        fetchedAt: new Date(),
        source: SOURCE_VALUE,
      };
      await updateProductPriceComparisonOliveYoung(product.goodsNo, entry);
      updated += 1;
      console.log(
        "[PRICE_COMPARISON_OY_ITEM_DONE]",
        `goodsNo=${product.goodsNo} priceText=${priceText.slice(0, 20)}`
      );
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[PRICE_COMPARISON_OY_ITEM_FAIL]",
        `goodsNo=${product.goodsNo} error=${msg}`
      );
    }
  }

  const processed = targets.length;
  console.log(
    "[PRICE_COMPARISON_OY_DONE]",
    `processed=${processed} updated=${updated} skippedNoPrice=${skippedNoPrice} errors=${errors} missing=${missingCount} stale=${staleCount}`
  );
  return {
    processed,
    updated,
    skippedNoPrice,
    errors,
    missingCount,
    staleCount,
  };
}

async function main(): Promise<void> {
  const limit = parseLimit();
  const refetchDays = parseRefetchDays();
  await runFillPriceComparisonOliveYoung(limit, refetchDays);
}

main().catch((err) => {
  console.error("[PRICE_COMPARISON_OY_ERROR]", err);
  process.exit(1);
});
