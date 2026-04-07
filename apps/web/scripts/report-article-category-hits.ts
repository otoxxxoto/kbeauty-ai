/**
 * 記事カテゴリ判定のヒット件数（summaryJa なし vs あり）を最新ランキングで比較。
 * apps/web: pnpm exec tsx scripts/report-article-category-hits.ts
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import type { OliveYoungProductMinimal } from "../src/lib/oliveyoung-products";
import { CATEGORY_CONFIG } from "../src/lib/category-config";
import {
  getRankingRunDates,
  getRankingWithProducts,
} from "../src/lib/oliveyoung-rankings";
import type { RankingItemWithProduct } from "../src/lib/oliveyoung-rankings";
import {
  getAllArticleSlugs,
  getArticleSpecBySlug,
} from "../src/lib/oliveyoung-articles";

const THRESHOLD = 2;

const CATEGORY_SLUGS = [
  "toner",
  "serum",
  "cream",
  "mask-pack",
  "cleansing",
] as const;

function toMinimal(
  item: RankingItemWithProduct,
  useSummaryJa: boolean
): OliveYoungProductMinimal {
  return {
    goodsNo: item.goodsNo,
    name: item.name,
    nameJa: item.nameJa,
    brand: item.brand,
    brandJa: item.brandJa,
    summaryJa: useSummaryJa ? item.summaryJa : undefined,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    productUrl: item.productUrl,
    pickedUrl: item.pickedUrl ?? null,
    lastRank: item.lastRank,
    lastSeenRunDate: item.lastSeenRunDate,
    updatedAt: null,
  } as OliveYoungProductMinimal;
}

async function main() {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  const { scoreProductForCategory } = await import(
    "../src/lib/filter-products-by-category"
  );

  function countForCategory(
    items: RankingItemWithProduct[],
    categorySlug: string,
    useSummaryJa: boolean
  ): number {
    const category = CATEGORY_CONFIG[categorySlug];
    if (!category) return 0;
    return items.filter(
      (item) =>
        scoreProductForCategory(toMinimal(item, useSummaryJa), category) >=
        THRESHOLD
    ).length;
  }

  const runDates = await getRankingRunDates();
  const runDate = runDates[0];
  if (!runDate) {
    console.error("No ranking run dates");
    process.exit(1);
  }
  const data = await getRankingWithProducts(runDate);
  if (!data) {
    console.error("No ranking for", runDate);
    process.exit(1);
  }
  const items = data.items;
  const withSummary = items.filter((i) => (i.summaryJa ?? "").trim().length > 0)
    .length;

  console.log(
    JSON.stringify(
      {
        runDate,
        totalRankingItems: items.length,
        itemsWithSummaryJa: withSummary,
      },
      null,
      2
    )
  );
  console.log(
    "--- per category (before = no summaryJa in score input, after = with summaryJa) ---"
  );
  for (const slug of CATEGORY_SLUGS) {
    const before = countForCategory(items, slug, false);
    const after = countForCategory(items, slug, true);
    console.log(
      JSON.stringify({ category: slug, before, after, delta: after - before })
    );
  }

  console.log("--- per article slug (after only, category from spec) ---");
  for (const slug of getAllArticleSlugs()) {
    const spec = getArticleSpecBySlug(slug);
    if (!spec) continue;
    const after = countForCategory(items, spec.categoryConfigSlug, true);
    console.log(
      JSON.stringify({
        articleSlug: slug,
        category: spec.categoryConfigSlug,
        hitsAfter: after,
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
