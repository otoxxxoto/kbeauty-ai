import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CATEGORY_CONFIG,
  getCategoryConfigBySlug,
  getAllCategorySlugs,
  type CategorySlug,
} from "@/lib/category-config";
import {
  getAllOliveYoungProductsMinimal,
  getDisplayBrand,
} from "@/lib/oliveyoung-products";
import { ProductDisplayImage } from "@/components/ProductDisplayImage";
import { getCategoryAppealLabel } from "@/lib/product-card-appeal";
import { buildCategoryTitle } from "@/lib/seo";
import {
  getDisplayProductNameText,
  getSafeSummaryBodyOrNull,
} from "@/lib/oliveyoung-display";
import { filterProductsByCategory } from "@/lib/filter-products-by-category";
import { getRankingRunDates } from "@/lib/oliveyoung-rankings";
import {
  PRODUCT_CARD_ROOT_CLASS,
  PRODUCT_CARD_IMAGE_FRAME_CLASS,
  PRODUCT_CARD_INFO_CLASS,
  PRODUCT_CARD_CTA_CLASS,
  PRODUCT_CARD_TITLE_CLASS,
  logCardLayoutDebug,
} from "@/lib/product-card-layout";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import { ProductCardOliveYoungLink } from "@/components/ProductCardOliveYoungLink";
import { resolveEffectiveOliveYoungUrl } from "@/lib/oliveyoung-official-url";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type CategoryProduct = Awaited<ReturnType<typeof getAllOliveYoungProductsMinimal>>[number];

function CategoryProductCard({
  p,
  appealLabel,
}: {
  p: CategoryProduct;
  /** カテゴリ訴求など（1枚につき1つ想定） */
  appealLabel?: string | null;
}) {
  const displayName = getDisplayProductNameText({
    nameJa: p.nameJa,
    name: p.name,
    brand: p.brand,
    brandJa: p.brandJa,
  });
  const displayBrand = getDisplayBrand(p);
  const cardSummary = getSafeSummaryBodyOrNull(p.summaryJa);
  const detailHref = `/oliveyoung/products/${p.goodsNo}`;
  return (
    <div
      className={`${PRODUCT_CARD_ROOT_CLASS} hover:border-zinc-300 transition-colors`}
    >
      <Link href={detailHref} className="group flex min-h-0 flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg">
        <div className={PRODUCT_CARD_IMAGE_FRAME_CLASS}>
          <ProductDisplayImage
            product={serializeProductImageFieldsForClient(p)}
            alt={displayName}
            goodsNo={p.goodsNo}
          />
        </div>
        <div className={PRODUCT_CARD_INFO_CLASS}>
          {appealLabel ? (
            <span className="mb-1 inline-flex shrink-0 rounded bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
              {appealLabel}
            </span>
          ) : null}
          <div className={`${PRODUCT_CARD_TITLE_CLASS} group-hover:text-blue-800`}>{displayName}</div>
          {displayBrand ? (
            <div className="shrink-0 text-xs text-zinc-500">{displayBrand}</div>
          ) : null}
          {cardSummary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600">
              {cardSummary}
            </p>
          ) : null}
          {typeof p.lastRank === "number" && (
            <div className="shrink-0 text-xs text-zinc-400">順位 #{p.lastRank}</div>
          )}
          <span className="mt-2 text-xs font-medium text-blue-600 group-hover:underline">
            商品ページを開く →
          </span>
        </div>
      </Link>
      <div className={`${PRODUCT_CARD_CTA_CLASS} flex flex-col gap-1.5`}>
        <Link
          href={detailHref}
          className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          商品詳細を見る
        </Link>
        <ProductCardOliveYoungLink
          oliveYoungUrl={resolveEffectiveOliveYoungUrl({
            oliveYoungUrl: p.oliveYoungUrl,
            productUrl: p.productUrl,
            pickedUrl: undefined,
          })}
          goodsNo={p.goodsNo}
          gaAffiliate={{
            position: "category_card",
            pageType: "category",
          }}
        />
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const cat = getCategoryConfigBySlug(slug);
  if (!cat) return { title: "カテゴリ | Olive Young" };
  const title = buildCategoryTitle(cat.label);
  const description = cat.description;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  logCardLayoutDebug("/oliveyoung/category/[slug]", "CategoryPage.CategoryProductCard");
  const { slug } = await params;
  const cat = getCategoryConfigBySlug(slug);
  if (!cat) notFound();

  const [allProducts, runDates] = await Promise.all([
    getAllOliveYoungProductsMinimal(),
    getRankingRunDates(),
  ]);
  const products = filterProductsByCategory(allProducts, cat);
  const latestRunDate = runDates[0] ?? null;
  const categorySlugs = getAllCategorySlugs();

  const featured = products.slice(0, 3);
  const list = products;

  const faqJsonLd =
    cat.faq && cat.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: cat.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a,
            },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-zinc-50">
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}
      <div className="p-6 max-w-5xl mx-auto space-y-8">
        {/* 回遊導線 */}
        <nav className="flex flex-wrap gap-3 text-sm" aria-label="ページ内導線">
          <Link href="/oliveyoung" className="text-blue-600 hover:underline">
            ← Olive Young 一覧
          </Link>
          {latestRunDate ? (
            <Link
              href={`/oliveyoung/rankings/${latestRunDate}`}
              className="text-blue-600 hover:underline"
            >
              商品ランキング
            </Link>
          ) : (
            <Link href="/oliveyoung" className="text-blue-600 hover:underline">
              ランキング
            </Link>
          )}
          <Link href="/oliveyoung/brands" className="text-blue-600 hover:underline">
            ブランドランキング
          </Link>
          {categorySlugs.map((s) => {
            const isCurrent = s === slug;
            return (
              <Link
                key={s}
                href={`/oliveyoung/category/${s}`}
                className={
                  isCurrent
                    ? "font-semibold text-blue-700 underline"
                    : "text-blue-600 hover:underline"
                }
              >
                {CATEGORY_CONFIG[s].label}
              </Link>
            );
          })}
        </nav>

        {/* ページ上部: 見出し・導入文（日本語カテゴリ名を前面に） */}
        <header>
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900">
            {cat.label}におすすめの商品
          </h1>
          <p className="mt-2 text-zinc-600 leading-relaxed">{cat.description}</p>
          <p className="mt-2 text-sm text-zinc-500">{products.length} 件</p>
        </header>

        {cat.introHeading?.trim() && cat.introText?.trim() ? (
          <section aria-labelledby="seo-intro-heading" className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 id="seo-intro-heading" className="text-lg font-bold text-zinc-900">
              {cat.introHeading.trim()}
            </h2>
            <p className="mt-2 text-sm text-zinc-700 leading-relaxed">{cat.introText.trim()}</p>
          </section>
        ) : null}

        {/* 注目のトップ3 */}
        {featured.length > 0 && (
          <section aria-labelledby="top3-heading">
            <h2 id="top3-heading" className="text-lg font-bold text-zinc-900 mb-4">
              注目の商品
            </h2>
            <div className="grid items-stretch gap-4 sm:grid-cols-3">
              {featured.map((p) => (
                <CategoryProductCard
                  key={p.goodsNo}
                  p={p}
                  appealLabel={getCategoryAppealLabel(slug) ?? "人気"}
                />
              ))}
            </div>
          </section>
        )}

        {/* 商品一覧 */}
        <section aria-labelledby="list-heading">
          <h2 id="list-heading" className="text-lg font-bold text-zinc-900 mb-4">
            商品一覧
          </h2>
          {list.length === 0 ? (
            <p className="text-sm text-zinc-500">該当する商品がありません。</p>
          ) : (
            <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((p) => (
                <CategoryProductCard
                  key={p.goodsNo}
                  p={p}
                  appealLabel={getCategoryAppealLabel(slug) ?? undefined}
                />
              ))}
            </div>
          )}
        </section>

        {cat.sectionHeading?.trim() && cat.sectionText?.trim() ? (
          <section aria-labelledby="seo-section-heading" className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 id="seo-section-heading" className="text-lg font-bold text-zinc-900">
              {cat.sectionHeading.trim()}
            </h2>
            <p className="mt-2 text-sm text-zinc-700 leading-relaxed">{cat.sectionText.trim()}</p>
          </section>
        ) : null}

        {cat.faq && cat.faq.length > 0 ? (
          <section aria-labelledby="faq-heading" className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 id="faq-heading" className="text-lg font-bold text-zinc-900 mb-4">
              よくある質問
            </h2>
            <dl className="space-y-4 m-0">
              {cat.faq.map((item, i) => (
                <div key={i} className="border-b border-zinc-100 pb-4 last:border-0 last:pb-0">
                  <dt className="text-sm font-semibold text-zinc-900">{item.q}</dt>
                  <dd className="mt-1.5 text-sm text-zinc-600 leading-relaxed m-0">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section aria-label="関連カテゴリ">
          <h2 className="text-lg font-bold text-zinc-900 mb-2">関連カテゴリ</h2>
          <div className="flex flex-wrap gap-3">
            {(cat.relatedCategories ?? [])
              .filter((s) => s in CATEGORY_CONFIG && s !== slug)
              .map((s) => (
                <Link
                  key={s}
                  href={`/oliveyoung/category/${s}`}
                  className="text-blue-600 hover:underline"
                >
                  {CATEGORY_CONFIG[s].label}
                </Link>
              ))}
          </div>
        </section>

        {/* 他カテゴリ導線 */}
        <section aria-labelledby="other-categories-heading">
          <h2 id="other-categories-heading" className="sr-only">
            他のカテゴリを見る
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500 mb-2">他のカテゴリ</p>
            <div className="flex flex-wrap gap-3">
              {categorySlugs.map((s) => {
                const isCurrent = s === slug;
                return (
                  <Link
                    key={s}
                    href={`/oliveyoung/category/${s}`}
                    className={
                      isCurrent
                        ? "font-semibold text-blue-700 underline"
                        : "text-blue-600 hover:underline"
                    }
                  >
                    {CATEGORY_CONFIG[s].label}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* 他カテゴリ・ランキング・ブランド（下部回遊） */}
        <section className="border-t border-zinc-200 pt-8" aria-labelledby="more-heading">
          <h2 id="more-heading" className="text-lg font-bold text-zinc-900 mb-3">
            もっと見る
          </h2>
          <div className="flex flex-wrap gap-3">
            {categorySlugs.filter((s) => s !== slug).map((s) => (
              <Link
                key={s}
                href={`/oliveyoung/category/${s}`}
                className="inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {CATEGORY_CONFIG[s].label}
              </Link>
            ))}
            {latestRunDate && (
              <Link
                href={`/oliveyoung/rankings/${latestRunDate}`}
                className="inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                商品ランキング
              </Link>
            )}
            <Link
              href="/oliveyoung/brands"
              className="inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              ブランドランキング
            </Link>
          </div>
        </section>

        <section
          aria-labelledby="more-popular-heading"
          className="rounded-xl border border-blue-100 bg-blue-50/40 p-5"
        >
          <h2 id="more-popular-heading" className="text-base font-bold text-zinc-900">
            人気商品をもっと見る
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            ランキング全体や他カテゴリから、気になる商品の詳細ページへ進めます。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {latestRunDate ? (
              <Link
                href={`/oliveyoung/rankings/${latestRunDate}`}
                className="inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                商品ランキング一覧へ
              </Link>
            ) : null}
            <Link
              href="/oliveyoung"
              className="inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Olive Young 一覧（トップ）
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
