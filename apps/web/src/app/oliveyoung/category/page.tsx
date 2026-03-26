import Link from "next/link";
import { CATEGORY_CONFIG, getAllCategorySlugs } from "@/lib/category-config";
import { getAllOliveYoungProductsMinimal } from "@/lib/oliveyoung-products";
import { filterProductsByCategory } from "@/lib/filter-products-by-category";

export default async function CategoryIndexPage() {
  const allProducts = await getAllOliveYoungProductsMinimal();
  const slugs = getAllCategorySlugs();
  const categoryCards = slugs
    .map((slug) => {
      const config = CATEGORY_CONFIG[slug];
      const count = filterProductsByCategory(allProducts, config).length;
      const minCount = config.minProductCount ?? 0;
      return { slug, config, count, visible: count >= minCount };
    })
    .filter((item) => item.visible);

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900">カテゴリ一覧</h1>
      <p className="text-sm text-zinc-600">
        悩み・用途キーワード別のカテゴリページです。気になるテーマから商品を確認できます。
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {categoryCards.map(({ slug, config, count }) => (
          <Link
            key={slug}
            href={`/oliveyoung/category/${slug}`}
            className="rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300"
          >
            <div className="text-sm font-semibold text-zinc-900">{config.label}</div>
            <div className="mt-1 text-xs text-zinc-600">{config.description}</div>
            <div className="mt-2 text-xs text-zinc-500">{count}件</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
