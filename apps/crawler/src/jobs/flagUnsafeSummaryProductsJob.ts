/**
 * 既存の oliveyoung_products_public をスキャンし、
 * unsafe な summary 系フィールドを持つ商品に needs* フラグを立てる
 *
 * 使い方:
 *   pnpm run oliveyoung:flag-unsafe-summaries
 *   pnpm run oliveyoung:flag-unsafe-summaries 5000
 */
import "dotenv/config";
import { flagProductsWithUnsafeSummaries } from "../services/productFirestore";

const DEFAULT_SCAN_LIMIT = 2000;

function parseScanLimit(): number {
  const arg = process.argv[2];
  if (arg !== undefined && arg !== "") {
    const n = parseInt(arg, 10);
    if (Number.isFinite(n)) return Math.min(Math.max(100, n), 5000);
  }
  const env = process.env.SCAN_LIMIT;
  if (env != null && env !== "") {
    const n = parseInt(String(env), 10);
    if (Number.isFinite(n)) return Math.min(Math.max(100, n), 5000);
  }
  return DEFAULT_SCAN_LIMIT;
}

export async function runFlagUnsafeSummaryProducts(
  scanLimit: number
): Promise<void> {
  console.log("[FLAG_UNSAFE_SUMMARIES_START]", `scanLimit=${scanLimit}`);

  const result = await flagProductsWithUnsafeSummaries(scanLimit);

  console.log(
    "[FLAG_UNSAFE_SUMMARIES_DONE]",
    `scanned=${result.scanned} flagged=${result.flagged} ` +
      `fields={review:${result.fieldsFlagged.review} ingredient:${result.fieldsFlagged.ingredient} summary:${result.fieldsFlagged.summary}}`
  );
}

async function main(): Promise<void> {
  const scanLimit = parseScanLimit();
  await runFlagUnsafeSummaryProducts(scanLimit);
}

main().catch((err) => {
  console.error("[FLAG_UNSAFE_SUMMARIES_ERROR]", err);
  process.exit(1);
});
