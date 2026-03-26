import type { MetadataRoute } from "next";
import { getRankingRunDates } from "@/lib/oliveyoung-rankings";
import {
  getBrandRankingRunDates,
  getBrandRankingByDate,
} from "@/lib/brand-rankings";
import { getProductIdsForSitemap } from "@/lib/oliveyoung-products";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://yourdomain.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // 1. 固定: /oliveyoung
  entries.push({
    url: `${BASE_URL}/oliveyoung`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1,
  });

  // 2. ランキング runDate 一覧: /oliveyoung/rankings/[runDate]
  try {
    const rankingRunDates = await getRankingRunDates();
    for (const runDate of rankingRunDates) {
      if (!runDate?.trim()) continue;
      entries.push({
        url: `${BASE_URL}/oliveyoung/rankings/${runDate}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch {
    // 取得失敗時はスキップ
  }

  // 3. ブランド runDate 一覧: /oliveyoung/brands/[runDate]
  try {
    const brandRunDates = await getBrandRankingRunDates();
    for (const runDate of brandRunDates) {
      if (!runDate?.trim()) continue;
      entries.push({
        url: `${BASE_URL}/oliveyoung/brands/${runDate}`,
        lastModified: new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      });
    }
  } catch {
    // 取得失敗時はスキップ
  }

  // 4. 商品詳細: /oliveyoung/products/[goodsNo]
  try {
    const products = await getProductIdsForSitemap();
    for (const row of products) {
      if (!row.goodsNo?.trim()) continue;
      entries.push({
        url: `${BASE_URL}/oliveyoung/products/${row.goodsNo}`,
        lastModified: row.updatedAt ?? new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // 取得失敗時はスキップ
  }

  // 5. ブランド詳細: /oliveyoung/brands/[runDate]/[brandKey]
  try {
    const brandRunDates = await getBrandRankingRunDates();
    for (const runDate of brandRunDates) {
      if (!runDate?.trim()) continue;
      const ranking = await getBrandRankingByDate(runDate);
      if (!ranking?.items?.length) continue;
      for (const item of ranking.items) {
        const key = item.brandKey?.trim();
        if (!key) continue;
        entries.push({
          url: `${BASE_URL}/oliveyoung/brands/${runDate}/${encodeURIComponent(key)}`,
          lastModified: new Date(),
          changeFrequency: "weekly",
          priority: 0.7,
        });
      }
    }
  } catch {
    // 取得失敗時はスキップ
  }

  return entries;
}
