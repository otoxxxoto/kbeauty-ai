import Link from "next/link";
import {
  getRankingRunDates,
  getRankingTopNWithProducts,
  getRisingProductsWithProducts,
} from "@/lib/oliveyoung-rankings";
import {
  getDisplayBrand as getDisplayBrandProduct,
  getEffectiveAffiliateUrls,
} from "@/lib/oliveyoung-products";
import {
  getPrimaryShopFromProduct,
  shouldSuppressAffiliateCtasForProduct,
} from "@/lib/getPrimaryShop";
import { ProductDisplayImage } from "@/components/ProductDisplayImage";
import { ProductAffiliateCtas } from "@/components/ProductAffiliateCtas";
import { getDisplayProductNameText } from "@/lib/oliveyoung-display";
import { getBrandRankingByDate, getDisplayBrand } from "@/lib/brand-rankings";
import { CATEGORY_CONFIG, CATEGORY_LINKS } from "@/lib/category-config";

/** 入口ページで目立たせるカテゴリ（内部リンク強化） */
const SPOTLIGHT_CATEGORY_SLUGS = ["scalp-care", "ceramide", "back-acne"] as const;
import {
  PRODUCT_CARD_ROOT_CLASS,
  PRODUCT_CARD_IMAGE_FRAME_CLASS,
  PRODUCT_CARD_INFO_CLASS,
  PRODUCT_CARD_CTA_CLASS,
  PRODUCT_CARD_TITLE_CLASS,
} from "@/lib/product-card-layout";
import { buildOliveYoungEntryTitle } from "@/lib/seo";

const PAGE_TITLE = buildOliveYoungEntryTitle();
const PAGE_DESCRIPTION =
  "韓国コスメの人気動向を、Olive Young ランキングで日本語で確認できる入口です。人気商品・急上昇ブランドを毎日更新。";

export function generateMetadata() {
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
    },
  };
}

/**
 * /oliveyoung … メディア入口ページ
 * ヒーロー・サマリー・注目商品 TOP3・急上昇/NEWブランド・導線
 */
export default async function OliveYoungEntryPage() {
  const runDates = await getRankingRunDates();
  const runDate = runDates[0] ?? null;

  const [productData, brandData, risingData] = await Promise.all([
    runDate ? getRankingTopNWithProducts(runDate, 3) : null,
    runDate ? getBrandRankingByDate(runDate) : null,
    getRisingProductsWithProducts(5),
  ]);

  const totalProducts = productData?.meta.totalItems ?? 0;
  const totalBrands = brandData?.totalBrands ?? 0;
  const newBrandCount = brandData ? brandData.items.filter((i) => i.isNew).length : 0;

  const risingBrands = brandData
    ? brandData.items
        .filter((i) => !i.isNew && typeof i.rankDiff === "number" && i.rankDiff > 0)
        .sort((a, b) => (b.rankDiff ?? 0) - (a.rankDiff ?? 0))
        .slice(0, 5)
    : [];
  const newBrands = brandData
    ? brandData.items
        .filter((i) => i.isNew)
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .slice(0, 5)
    : [];

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="p-6 max-w-4xl mx-auto space-y-10">
        {/* ヒーロー */}
        <section className="pt-4 pb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-zinc-900">
            韓国コスメ人気ランキング | Olive Young
          </h1>
          <p className="mt-3 text-zinc-600">
            韓国オリーブヤングの人気商品やブランド動向を、日本語で分かりやすく確認できる入口です。
            人気ランキング・急上昇ブランドを毎日更新でチェックできます。
          </p>
          {runDate && (
            <p className="mt-2 text-sm text-zinc-500">対象日: {runDate}（毎日更新）</p>
          )}

          {/* 人気カテゴリ（目立つ位置・主要3件） */}
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby="spotlight-categories-heading">
            <h2 id="spotlight-categories-heading" className="text-sm font-semibold text-zinc-800">
              人気カテゴリから探す
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              悩みや成分から、韓国コスメの一覧へすぐ移動できます。
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {SPOTLIGHT_CATEGORY_SLUGS.map((slug) => {
                const label = CATEGORY_CONFIG[slug]?.label ?? slug;
                return (
                  <Link
                    key={slug}
                    href={`/oliveyoung/category/${slug}`}
                    className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50/80 px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100 hover:border-blue-300 transition-colors"
                  >
                    {label}
                  </Link>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              商品の特徴や価格の目安は、各商品の
              <Link href={runDate ? `/oliveyoung/rankings/${runDate}` : "/oliveyoung/category"} className="text-blue-600 hover:underline mx-0.5">
                詳細ページ
              </Link>
              からご確認いただけます。
            </p>
          </section>

          {/* 全カテゴリ（一覧） */}
          <div className="mt-5">
            <p className="text-sm font-medium text-zinc-700 mb-2">すべてのカテゴリ</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_LINKS.map(({ slug, label }) => (
                <Link
                  key={slug}
                  href={`/oliveyoung/category/${slug}`}
                  className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-800 transition-colors"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {runDate && (
              <>
                <Link
                  href={`/oliveyoung/rankings/${runDate}`}
                  className="inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  商品ランキングを見る
                </Link>
                <Link
                  href={brandData ? `/oliveyoung/brands/${runDate}` : "/oliveyoung/brands"}
                  className="inline-flex rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  ブランドランキングを見る
                </Link>
              </>
            )}
            {!runDate && (
              <Link
                href="/oliveyoung/brands"
                className="inline-flex rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                ブランドランキングを見る
              </Link>
            )}
          </div>
        </section>

        {runDate ? (
          <>
            {/* サマリーカード */}
            <section>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">対象日</p>
                  <p className="mt-0.5 font-semibold">{runDate}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">総商品数</p>
                  <p className="mt-0.5 font-semibold">{totalProducts}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">総ブランド数</p>
                  <p className="mt-0.5 font-semibold">{totalBrands > 0 ? totalBrands : "-"}</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <p className="text-xs text-zinc-500">NEWブランド数</p>
                  <p className="mt-0.5 font-semibold">{newBrandCount > 0 ? newBrandCount : "-"}</p>
                </div>
              </div>
            </section>

            {/* 中部: カテゴリ導線の再掲（スクロールで見つけやすく） */}
            <section aria-label="カテゴリから探す（再掲）" className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-3">
              <p className="text-xs font-medium text-zinc-600 mb-2">悩み・成分から探す</p>
              <div className="flex flex-wrap gap-2">
                {SPOTLIGHT_CATEGORY_SLUGS.map((slug) => (
                  <Link
                    key={`mid-${slug}`}
                    href={`/oliveyoung/category/${slug}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {CATEGORY_CONFIG[slug]?.label ?? slug}
                  </Link>
                ))}
                <span className="text-zinc-300" aria-hidden>|</span>
                <Link href="/oliveyoung/category" className="text-sm text-blue-600 hover:underline">
                  カテゴリ一覧
                </Link>
              </div>
            </section>

            {/* 急上昇商品（直近2日比較・今日の注目より上に配置） */}
            {risingData && risingData.items.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-zinc-900 mb-4">
                  今、急上昇している人気商品
                </h2>
                <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {risingData.items.map((item) => {
                    const displayName = getDisplayProductNameText({
                      nameJa: item.nameJa,
                      name: item.name,
                      brand: item.brand,
                      brandJa: item.brandJa,
                    });
                    const primaryShop = getPrimaryShopFromProduct(item);
                    const suppressAffiliate = shouldSuppressAffiliateCtasForProduct(item);
                    return (
                      <div
                        key={item.goodsNo}
                        className={`${PRODUCT_CARD_ROOT_CLASS} hover:border-emerald-300 hover:shadow-sm`}
                      >
                        <Link
                          href={`/oliveyoung/products/${item.goodsNo}`}
                          className="group flex min-h-0 flex-1 flex-col"
                        >
                          <div className={PRODUCT_CARD_IMAGE_FRAME_CLASS}>
                            <ProductDisplayImage product={item} alt={displayName} />
                          </div>
                          <div className={PRODUCT_CARD_INFO_CLASS}>
                            <div className="shrink-0">
                              <span className="mb-1 inline-flex rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                                急上昇
                              </span>
                            </div>
                            <div
                              className={`${PRODUCT_CARD_TITLE_CLASS} group-hover:text-emerald-800`}
                            >
                              {displayName}
                            </div>
                            {getDisplayBrandProduct(item) ? (
                              <div className="shrink-0 text-xs text-zinc-500">
                                {getDisplayBrandProduct(item)}
                              </div>
                            ) : null}
                            <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2">
                              <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md bg-zinc-200 px-1.5 text-xs font-bold text-zinc-700">
                                #{item.rank}
                              </span>
                              {item.isNew ? (
                                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                                  NEW
                                </span>
                              ) : item.rankDiff != null && item.rankDiff > 0 ? (
                                <span className="inline-flex items-center rounded-md bg-emerald-100 px-2.5 py-1 text-sm font-bold text-emerald-800">
                                  ▲+{item.rankDiff}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </Link>
                        <div className={`${PRODUCT_CARD_CTA_CLASS} flex flex-col gap-2`}>
                          <Link
                            href={`/oliveyoung/products/${item.goodsNo}`}
                            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            商品詳細を見る
                          </Link>
                          <ProductAffiliateCtas
                            goodsNo={item.goodsNo}
                            urls={getEffectiveAffiliateUrls(item)}
                            variant="card"
                            className=""
                            position="rising_card"
                            primaryShop={primaryShop}
                            suppressAffiliateCtas={suppressAffiliate}
                            productNameForGa={displayName}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 今日の注目商品 TOP3 */}
            {productData && productData.items.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-zinc-900 mb-4">今日の注目商品</h2>
                <div className="grid items-stretch gap-4 sm:grid-cols-3">
                  {productData.items.map((item) => {
                    const displayName = getDisplayProductNameText({
                      nameJa: item.nameJa,
                      name: item.name,
                      brand: item.brand,
                      brandJa: item.brandJa,
                    });
                    const primaryShop = getPrimaryShopFromProduct(item);
                    const suppressAffiliate = shouldSuppressAffiliateCtasForProduct(item);
                    return (
                      <div
                        key={item.goodsNo}
                        className={PRODUCT_CARD_ROOT_CLASS}
                      >
                        <div className="flex min-h-0 flex-1 flex-col">
                          <div className="mb-2 flex shrink-0 items-center gap-2">
                            <span
                              className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-sm font-bold ${
                                item.rank <= 3
                                  ? "bg-zinc-700 text-white"
                                  : "bg-zinc-200 text-zinc-700"
                              }`}
                            >
                              #{item.rank}
                            </span>
                          </div>
                          <Link
                            href={`/oliveyoung/products/${item.goodsNo}`}
                            className="group flex min-h-0 flex-1 flex-col"
                          >
                            <div className={PRODUCT_CARD_IMAGE_FRAME_CLASS}>
                              <ProductDisplayImage product={item} alt={displayName} />
                            </div>
                            <div className={PRODUCT_CARD_INFO_CLASS}>
                              <div className="shrink-0">
                                <span className="mb-1 inline-flex rounded bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
                                  人気
                                </span>
                              </div>
                              <div className={PRODUCT_CARD_TITLE_CLASS}>
                                {displayName}
                              </div>
                              {getDisplayBrandProduct(item) ? (
                                <div className="shrink-0 text-xs text-zinc-500">
                                  {getDisplayBrandProduct(item)}
                                </div>
                              ) : null}
                            </div>
                          </Link>
                        </div>
                        <div className={`${PRODUCT_CARD_CTA_CLASS} flex flex-col gap-2`}>
                          <Link
                            href={`/oliveyoung/products/${item.goodsNo}`}
                            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            商品詳細を見る
                          </Link>
                          <ProductAffiliateCtas
                            goodsNo={item.goodsNo}
                            urls={getEffectiveAffiliateUrls(item)}
                            variant="card"
                            className=""
                            position="featured_card"
                            primaryShop={primaryShop}
                            suppressAffiliateCtas={suppressAffiliate}
                            productNameForGa={displayName}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 急上昇ブランド TOP5 / NEWランクインブランド */}
            {(risingBrands.length > 0 || newBrands.length > 0) && (
              <section className="grid gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h2 className="text-base font-bold text-zinc-900 mb-3">急上昇ブランド TOP5</h2>
                  {risingBrands.length === 0 ? (
                    <p className="text-sm text-zinc-500">該当なし</p>
                  ) : (
                    <ul className="space-y-2">
                      {risingBrands.map((item) => (
                        <li key={item.brandKey} className="flex items-center justify-between text-sm">
                          <Link
                            href={`/oliveyoung/brands/${runDate}/${item.brandKey}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {getDisplayBrand(item)}
                          </Link>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="font-semibold text-green-700">▲{item.rankDiff}</span>
                            <span className="text-zinc-500">#{item.rank ?? "-"}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h2 className="text-base font-bold text-zinc-900 mb-3">NEWランクインブランド</h2>
                  {newBrands.length === 0 ? (
                    <p className="text-sm text-zinc-500">該当なし</p>
                  ) : (
                    <ul className="space-y-2">
                      {newBrands.map((item) => (
                        <li key={item.brandKey} className="flex items-center justify-between text-sm">
                          <Link
                            href={`/oliveyoung/brands/${runDate}/${item.brandKey}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {getDisplayBrand(item)}
                          </Link>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                              NEW
                            </span>
                            <span className="text-zinc-500">#{item.rank ?? "-"}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 導線カード */}
            <section className="grid gap-4 sm:grid-cols-2">
              <Link
                href={`/oliveyoung/rankings/${runDate}`}
                className="flex flex-col rounded-xl border-2 border-zinc-200 bg-white p-6 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <h3 className="text-lg font-bold text-zinc-900">商品ランキングを見る</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  人気商品の順位・画像・詳細へ
                </p>
                <span className="mt-4 text-sm font-medium text-blue-600">一覧へ →</span>
              </Link>
              <Link
                href={brandData ? `/oliveyoung/brands/${runDate}` : "/oliveyoung/brands"}
                className="flex flex-col rounded-xl border-2 border-zinc-200 bg-white p-6 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <h3 className="text-lg font-bold text-zinc-900">ブランドランキングを見る</h3>
                <p className="mt-1 text-sm text-zinc-600">
                  最新のブランド動向・ランクイン商品へ
                </p>
                <span className="mt-4 text-sm font-medium text-blue-600">一覧へ →</span>
              </Link>
            </section>
          </>
        ) : (
          /* データなし時 */
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <p className="text-zinc-600">現在、ランキングデータがありません。</p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <Link href="/oliveyoung/brands" className="text-blue-600 hover:underline">
                ブランドランキングを見る
              </Link>
              <Link href="/oliveyoung/tags" className="text-blue-600 hover:underline">
                タグ一覧 →
              </Link>
            </div>
          </section>
        )}

        {/* 補助文 */}
        <footer className="pt-4 pb-8 text-center text-sm text-zinc-500">
          商品詳細ページやブランド詳細ページから、韓国コスメの人気動向を継続的に確認できます。
        </footer>
      </div>
    </div>
  );
}
