/**
 * cream 2記事の掲載結果を記事ページと同じロジックでダンプ（評価用）。
 * apps/web: pnpm exec tsx scripts/evaluate-cream-articles.ts
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import type { OliveYoungProductMinimal } from "../src/lib/oliveyoung-products";
import type { CategoryConfigItem } from "../src/lib/category-config";
import { CATEGORY_CONFIG } from "../src/lib/category-config";
import {
  scoreProductForCategory,
  productMatchesAnyThemeKeyword,
} from "../src/lib/filter-products-by-category";
import {
  getRankingRunDates,
  getRankingWithProducts,
} from "../src/lib/oliveyoung-rankings";
import type { RankingItemWithProduct } from "../src/lib/oliveyoung-rankings";
import { getArticleSpecBySlug } from "../src/lib/oliveyoung-articles";

const THRESHOLD = 2;

function toMinimal(item: RankingItemWithProduct): OliveYoungProductMinimal {
  return {
    goodsNo: item.goodsNo,
    name: item.name,
    nameJa: item.nameJa,
    brand: item.brand,
    brandJa: item.brandJa,
    summaryJa: item.summaryJa,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    productUrl: item.productUrl,
    pickedUrl: item.pickedUrl ?? null,
    lastRank: item.lastRank,
    lastSeenRunDate: item.lastSeenRunDate,
    updatedAt: null,
  } as OliveYoungProductMinimal;
}

function pickItems(
  items: RankingItemWithProduct[],
  spec: NonNullable<ReturnType<typeof getArticleSpecBySlug>>,
  cat: CategoryConfigItem
): RankingItemWithProduct[] {
  const limitN = Math.max(1, spec.limit);
  let filtered = items.filter(
    (item) => scoreProductForCategory(toMinimal(item), cat) >= THRESHOLD
  );

  const themeKw = (spec.themeMatchKeywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean);
  if (themeKw.length > 0) {
    filtered = filtered.filter((item) =>
      productMatchesAnyThemeKeyword(toMinimal(item), themeKw)
    );
  }

  filtered.sort((a, b) => a.rank - b.rank);

  if (themeKw.length > 0) {
    return filtered.slice(0, limitN);
  }
  const offset = spec.offset ?? 0;
  const safeOffset = filtered.length <= offset ? 0 : offset;
  return filtered.slice(safeOffset, safeOffset + limitN);
}

async function main() {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  const general = getArticleSpecBySlug("korean-cream-ranking-compare");
  const theme = getArticleSpecBySlug("korean-cream-night-ranking-compare");
  const cat = CATEGORY_CONFIG.cream;
  if (!general || !theme || !cat) throw new Error("spec missing");

  const runDates = await getRankingRunDates();
  const runDate = runDates[0];
  if (!runDate) throw new Error("no run date");
  const data = await getRankingWithProducts(runDate);
  if (!data) throw new Error("no ranking");

  const itemsGeneral = pickItems(data.items, general, cat);
  const itemsTheme = pickItems(data.items, theme, cat);

  const gSet = new Set(itemsGeneral.map((i) => i.goodsNo));
  const bSet = new Set(itemsTheme.map((i) => i.goodsNo));
  const intersection = [...gSet].filter((g) => bSet.has(g));

  function dump(label: string, rows: RankingItemWithProduct[]) {
    console.log(`\n=== ${label} (${rows.length} 件) runDate=${runDate} ===`);
    for (const r of rows) {
      const name = (r.nameJa || r.name || "").replace(/\s+/g, " ").slice(0, 90);
      console.log(`rank=${r.rank}\t${r.goodsNo}\t${name}`);
    }
  }

  dump("korean-cream-ranking-compare (総合)", itemsGeneral);
  dump("korean-cream-night-ranking-compare (テーマ)", itemsTheme);

  console.log("\n--- 共通 goodsNo ---");
  console.log(JSON.stringify(intersection));
  console.log(
    "共通件数:",
    intersection.length,
    "/ 総合",
    itemsGeneral.length,
    "/ テーマ",
    itemsTheme.length
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
