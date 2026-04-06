import Link from "next/link";
import {
  getRankingWithProducts,
  getRankingRunDates,
} from "@/lib/oliveyoung-rankings";
import {
  getDisplayBrand,
  getEffectiveAffiliateUrls,
} from "@/lib/oliveyoung-products";
import { ProductDisplayImage } from "@/components/ProductDisplayImage";
import { ProductCardCta } from "@/components/ProductCardCta";
import { ProductAffiliateCtas } from "@/components/ProductAffiliateCtas";
import { getDisplayProductNameText } from "@/lib/oliveyoung-display";
import {
  getPrimaryShopFromProduct,
  shouldSuppressAffiliateCtasForProduct,
} from "@/lib/getPrimaryShop";
import {
  PRODUCT_CARD_ROOT_CLASS,
  PRODUCT_CARD_IMAGE_FRAME_CLASS,
  PRODUCT_CARD_INFO_CLASS,
  PRODUCT_CARD_CTA_CLASS,
  PRODUCT_CARD_TITLE_CLASS,
} from "@/lib/product-card-layout";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import { RelatedStyleOliveYoungLink } from "@/components/RelatedStyleOliveYoungLink";
import { resolveOyNavigableUrl } from "@/lib/product-shop-cta-links";
import { OyListingCardDevDebug } from "@/components/OyListingCardDevDebug";
import type { RankingItemWithProduct } from "@/lib/oliveyoung-rankings";
import { notFound } from "next/navigation";
import {
  getAllArticleSlugs,
  getArticleSpecBySlug,
} from "@/lib/oliveyoung-articles";
import { getPublicSiteBaseUrl } from "@/lib/public-site-base-url";

const BASE_URL = getPublicSiteBaseUrl();

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): { slug: string }[] {
  return getAllArticleSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const spec = getArticleSpecBySlug(slug);
  if (!spec) {
    return { title: "記事 | Olive Young" };
  }
  const canonical = `${BASE_URL}/oliveyoung/articles/${spec.slug}`;
  const title = spec.title;
  const description = spec.description;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "article",
      url: canonical,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

function RankBadge({ rank }: { rank: number }) {
  const isTop3 = rank <= 3;
  const bg =
    rank === 1
      ? "bg-zinc-800 text-white"
      : rank === 2
        ? "bg-zinc-600 text-white"
        : rank === 3
          ? "bg-zinc-500 text-white"
          : "bg-zinc-200 text-zinc-700";
  return (
    <span
      className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-sm font-bold ${isTop3 ? bg : "bg-zinc-200 text-zinc-700"}`}
    >
      #{rank}
    </span>
  );
}

function ArticleProductCard({ item }: { item: RankingItemWithProduct }) {
  const displayName = getDisplayProductNameText({
    nameJa: item.nameJa,
    name: item.name,
    brand: item.brand,
    brandJa: item.brandJa,
  });
  const displayBrand = getDisplayBrand(item);
  const primaryShop = getPrimaryShopFromProduct(item);
  const suppressAffiliate = shouldSuppressAffiliateCtasForProduct(item);
  const oyHref = resolveOyNavigableUrl({
    productUrl: item.productUrl,
    pickedUrl: item.pickedUrl,
    oliveYoungUrl: item.oliveYoungUrl,
  });
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div
      className={`${PRODUCT_CARD_ROOT_CLASS} hover:border-zinc-300 transition-colors`}
      data-debug-article-card={isDev ? "1" : undefined}
    >
      <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
        <RankBadge rank={item.rank} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={PRODUCT_CARD_IMAGE_FRAME_CLASS}>
          <ProductDisplayImage
            product={serializeProductImageFieldsForClient(item)}
            alt={displayName}
            goodsNo={item.goodsNo}
          />
        </div>
        <div className={PRODUCT_CARD_INFO_CLASS}>
          <div className={PRODUCT_CARD_TITLE_CLASS}>{displayName}</div>
          {displayBrand ? (
            <div className="shrink-0 text-xs text-zinc-500">{displayBrand}</div>
          ) : null}
          {typeof item.lastRank === "number" && (
            <div className="shrink-0 text-xs text-zinc-400">
              順位 #{item.lastRank}
            </div>
          )}
        </div>
      </div>
      <div className={`${PRODUCT_CARD_CTA_CLASS} flex flex-col gap-1.5`}>
        <ProductCardCta goodsNo={item.goodsNo} />
        <RelatedStyleOliveYoungLink
          productUrl={item.productUrl}
          pickedUrl={item.pickedUrl}
          oliveYoungUrl={item.oliveYoungUrl}
          fullWidth
          label="Olive Youngで見る"
          track={{
            goodsNo: item.goodsNo,
            pageType: "article",
            ctaPlacement: "article_card",
            productName: displayName,
          }}
        />
        {isDev && item.oyListingDebug ? (
          <OyListingCardDevDebug d={item.oyListingDebug} />
        ) : null}
        <ProductAffiliateCtas
          goodsNo={item.goodsNo}
          urls={getEffectiveAffiliateUrls(item)}
          variant="card"
          className=""
          position="article_card"
          pageType="article"
          ctaPlacement="article_card"
          primaryShop={primaryShop}
          suppressAffiliateCtas={suppressAffiliate}
          productNameForGa={displayName}
          amazonOnly
        />
      </div>
    </div>
  );
}

export default async function OliveYoungArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const spec = getArticleSpecBySlug(slug);
  if (!spec) notFound();

  const runDates = await getRankingRunDates();
  const runDate =
    spec.runDate === "latest"
      ? (runDates[0] ?? null)
      : spec.runDate.trim();
  if (!runDate) notFound();

  const data = await getRankingWithProducts(runDate);
  if (!data) notFound();

  const items = data.items.slice(0, Math.max(1, spec.limit));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <nav className="mb-6 flex flex-wrap gap-3 text-sm" aria-label="ページ内導線">
        <Link href="/oliveyoung" className="text-blue-600 hover:underline">
          ← Olive Young 一覧
        </Link>
        <Link
          href={`/oliveyoung/rankings/${runDate}`}
          className="text-blue-600 hover:underline"
        >
          ランキング（{runDate}）
        </Link>
      </nav>

      <article>
        <h1 className="text-2xl font-bold text-zinc-900 md:text-3xl">
          {spec.title}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          ランキングデータ日: {data.meta.runDate}（上位 {spec.limit} 件を掲載）
        </p>
        <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {spec.intro}
        </p>

        <section className="mt-10" aria-labelledby="article-ranking-heading">
          <h2
            id="article-ranking-heading"
            className="mb-4 text-lg font-bold text-zinc-900"
          >
            人気商品ランキング（比較）
          </h2>
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">表示できる商品がありません。</p>
          ) : (
            <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <ArticleProductCard key={item.goodsNo} item={item} />
              ))}
            </div>
          )}
        </section>
      </article>

      <section
        className="mt-12 rounded-xl border border-zinc-200 bg-zinc-50 p-4"
        aria-labelledby="article-footer-nav"
      >
        <h2
          id="article-footer-nav"
          className="mb-3 text-sm font-semibold text-zinc-800"
        >
          関連ページ
        </h2>
        <ul className="flex flex-col gap-2 text-sm">
          <li>
            <Link
              href={`/oliveyoung/rankings/${runDate}`}
              className="text-blue-600 hover:underline"
            >
              本日の全件ランキングを見る（{runDate}）
            </Link>
          </li>
          <li>
            <Link href="/oliveyoung" className="text-blue-600 hover:underline">
              Olive Young トップページ
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
