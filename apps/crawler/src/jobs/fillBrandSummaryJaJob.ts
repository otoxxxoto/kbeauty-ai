/**
 * brandSummaryJa 補完ジョブ（ランキング本体と完全分離）
 * brand_rankings/{runDate}/items のうち brandSummaryJa が無いものに
 * 短い日本語説明を生成して保存する。将来 AI 生成に差し替え可能な関数分離。
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-brand-summary-ja
 *   pnpm run oliveyoung:fill-brand-summary-ja 2026-03-14
 *   pnpm run oliveyoung:fill-brand-summary-ja 2026-03-14 30
 *   RUN_DATE=2026-03-14 LIMIT=20 pnpm run oliveyoung:fill-brand-summary-ja
 *
 * 第1引数: runDate（省略時は最新 runDate を使用）
 * 第2引数: limit（省略時は env LIMIT または 50）
 */
import "dotenv/config";
import {
  getLatestBrandRankingRunDate,
  getBrandRankingItemsMissingBrandSummaryJa,
  updateBrandRankingBrandSummaryJa,
  type BrandRankingItemForBrandSummaryJa,
} from "../services/brandRankingsFirestore";

const DEFAULT_LIMIT = 50;

/**
 * 1〜2文の短いブランド説明を生成（テンプレートベース）。
 * 将来 AI 生成に差し替えやすいよう関数分離。
 */
export function generateBrandSummaryJa(
  item: BrandRankingItemForBrandSummaryJa
): string {
  const name = (item.brandJa || item.brand || "").trim() || "このブランド";
  const count = item.count ?? 0;
  if (count > 0) {
    return `${name}は韓国オリーブヤングのランキングで${count}商品がランクインしている人気ブランドです。`;
  }
  return `${name}は韓国オリーブヤングのランキングで注目されているブランドです。`;
}

function parseRunDate(): string | null {
  const arg = process.argv[2]?.trim();
  if (arg) return arg;
  return process.env.RUN_DATE?.trim() || null;
}

function parseLimit(): number {
  const arg = process.argv[3];
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

export async function runFillBrandSummaryJa(
  runDate: string,
  limit: number
): Promise<{ processed: number; updated: number; skipped: number; errors: number }> {
  const n = Math.min(Math.max(1, limit), 500);

  console.log("[BRAND_SUMMARY_JA_START]", `runDate=${runDate} limit=${n}`);

  const targets = await getBrandRankingItemsMissingBrandSummaryJa(runDate, n);
  console.log("[BRAND_SUMMARY_JA_TARGETS]", `count=${targets.length}`);

  if (targets.length === 0) {
    console.log("[BRAND_SUMMARY_JA_DONE]", "processed=0 updated=0 skipped=0 errors=0");
    return { processed: 0, updated: 0, skipped: 0, errors: 0 };
  }

  let updated = 0;
  let errors = 0;

  for (const item of targets) {
    try {
      const text = generateBrandSummaryJa(item);
      if (!text.trim()) continue;
      await updateBrandRankingBrandSummaryJa(runDate, item.brandKey, text);
      updated += 1;
      console.log(
        "[BRAND_SUMMARY_JA_ITEM_DONE]",
        `brandKey=${item.brandKey} brand=${(item.brandJa || item.brand || "").slice(0, 30)}`
      );
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[BRAND_SUMMARY_JA_ITEM_FAIL]", `brandKey=${item.brandKey} error=${msg}`);
    }
  }

  const processed = targets.length;
  const skipped = processed - updated - errors;
  console.log(
    "[BRAND_SUMMARY_JA_DONE]",
    `processed=${processed} updated=${updated} skipped=${skipped} errors=${errors}`
  );
  return { processed, updated, skipped, errors };
}

async function main(): Promise<void> {
  let runDate = parseRunDate();
  if (!runDate) {
    runDate = await getLatestBrandRankingRunDate();
    if (!runDate) {
      console.log("[BRAND_SUMMARY_JA_DONE] no runDate available, exiting");
      process.exit(0);
    }
    console.log("[BRAND_SUMMARY_JA_RUN_DATE]", `using latest runDate=${runDate}`);
  }

  const limit = parseLimit();
  await runFillBrandSummaryJa(runDate, limit);
}

main().catch((err) => {
  console.error("[BRAND_SUMMARY_JA_ERROR]", err);
  process.exit(1);
});
