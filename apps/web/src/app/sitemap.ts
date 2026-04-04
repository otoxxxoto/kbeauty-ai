import type { MetadataRoute } from "next";
import { getRankingRunDates } from "@/lib/oliveyoung-rankings";
import { getAllCategorySlugs } from "@/lib/category-config";
import { getPublicSiteBaseUrl } from "@/lib/public-site-base-url";

const BASE_URL = getPublicSiteBaseUrl();
const SITEMAP_RANKING_DATE_LIMIT = 5;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const now = new Date();

  // NOTE: デプロイ安定性優先の軽量版。
  // 将来は sitemap 分割・段階的拡張（商品/ブランド/タグ）を行う。
  const fixedPages = [
    { path: "/", changeFrequency: "daily" as const, priority: 1 },
    { path: "/oliveyoung", changeFrequency: "daily" as const, priority: 0.95 },
    { path: "/oliveyoung/brands", changeFrequency: "weekly" as const, priority: 0.7 },
    { path: "/oliveyoung/category", changeFrequency: "weekly" as const, priority: 0.85 },
    { path: "/oliveyoung/tags", changeFrequency: "weekly" as const, priority: 0.6 },
    { path: "/oliveyoung/ingredients", changeFrequency: "weekly" as const, priority: 0.6 },
  ];

  for (const page of fixedPages) {
    entries.push({
      url: `${BASE_URL}${page.path}`,
      lastModified: now,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    });
  }

  // 1) カテゴリページ（静的定義のみ）
  const categorySlugs = getAllCategorySlugs();
  for (const slug of categorySlugs) {
    entries.push({
      url: `${BASE_URL}/oliveyoung/category/${slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.75,
    });
  }

  // 2) ランキング runDate（上位N件のみ）
  try {
    const rankingRunDates = (await getRankingRunDates()).slice(0, SITEMAP_RANKING_DATE_LIMIT);
    for (const runDate of rankingRunDates) {
      if (!runDate?.trim()) continue;
      entries.push({
        url: `${BASE_URL}/oliveyoung/rankings/${runDate}`,
        lastModified: now,
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
    console.log("[sitemap] rankingRunDates", { count: rankingRunDates.length });
  } catch {
    console.log("[sitemap] rankingRunDates", { count: 0, skipped: true });
  }

  console.log("[sitemap] generated", {
    totalUrls: entries.length,
    fixedPages: fixedPages.length,
    categoryPages: categorySlugs.length,
  });

  return entries;
}
