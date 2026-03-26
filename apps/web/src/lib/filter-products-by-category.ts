import type { OliveYoungProductMinimal } from "@/lib/oliveyoung-products";
import type { CategoryConfigItem } from "@/lib/category-config";
import { CATEGORY_CONFIG } from "@/lib/category-config";

export function normalizeForCategoryMatch(text: string): string {
  return (text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchText(product: OliveYoungProductMinimal): string {
  return normalizeForCategoryMatch(
    [
      product.nameJa ?? "",
      product.name ?? "",
      product.summaryJa ?? "",
      product.brandJa ?? "",
      product.brand ?? "",
    ].join(" ")
  );
}

export function scoreProductForCategory(
  product: OliveYoungProductMinimal,
  category: CategoryConfigItem
): number {
  const haystack = buildSearchText(product);
  const strongKeywords = category.strongKeywords ?? [];
  const keywords = category.keywords ?? [];
  const excludeKeywords = category.excludeKeywords ?? [];

  for (const keyword of excludeKeywords) {
    if (haystack.includes(normalizeForCategoryMatch(keyword))) return -999;
  }

  let score = 0;
  for (const keyword of strongKeywords) {
    if (haystack.includes(normalizeForCategoryMatch(keyword))) score += 3;
  }
  for (const keyword of keywords) {
    if (haystack.includes(normalizeForCategoryMatch(keyword))) score += 1;
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[CATEGORY SCORE]", {
      goodsNo: product.goodsNo,
      slug: category.slug,
      score,
    });
  }
  return score;
}

export function getMatchedCategoriesForProduct(
  product: OliveYoungProductMinimal
): { slug: string; score: number }[] {
  return Object.values(CATEGORY_CONFIG)
    .map((category) => ({
      slug: category.slug,
      score: scoreProductForCategory(product, category),
    }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
}

export function filterProductsByCategory(
  products: OliveYoungProductMinimal[],
  category: CategoryConfigItem
): OliveYoungProductMinimal[] {
  return products
    .map((p) => ({ product: p, score: scoreProductForCategory(p, category) }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.product);
}
