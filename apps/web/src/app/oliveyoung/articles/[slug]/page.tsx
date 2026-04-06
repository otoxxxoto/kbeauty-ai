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
import { OyListingCardDevDebug } from "@/components/OyListingCardDevDebug";
import type { RankingItemWithProduct } from "@/lib/oliveyoung-rankings";
import { notFound } from "next/navigation";
import {
  getAllArticleSlugs,
  getArticleSpecBySlug,
} from "@/lib/oliveyoung-articles";
import { getPublicSiteBaseUrl } from "@/lib/public-site-base-url";

const BASE_URL = getPublicSiteBaseUrl();

/** 記事 slug 別の固定SEO補強文（データスキーマは変えずページ内のみ） */
const ARTICLE_SEO_BLOCKS: Record<
  string,
  {
    forWhomTitle: string;
    forWhomItems: string[];
    howToChooseTitle: string;
    howToChooseParagraphs: string[];
    howToChooseBullets?: string[];
  }
> = {
  "korean-toner-ranking-compare": {
    forWhomTitle: "こんな人におすすめ",
    forWhomItems: [
      "韓国コスメの化粧水（トナー）で、売れ筋や定番を短時間で把握したい方",
      "オリーブヤングの人気ランキングを参考に、購入候補を絞り込みたい方",
      "洗顔後の保湿・整肌用の1本を探している方",
    ],
    howToChooseTitle: "選び方のヒント",
    howToChooseParagraphs: [
      "化粧水は、肌状態・季節・好みのテクスチャ（さっぱり／しっとり）で最適が変わります。まずはランキング上位の中から、自分の悩みに近い商品の詳細ページで成分や口コミ要約を確認すると選びやすくなります。",
      "価格や在庫はショップで異なることがあるため、気になった商品は各ECのリンクから最新情報をご確認ください。",
    ],
    howToChooseBullets: [
      "乾燥が気になるときは、保湿寄りの処方を意識する",
      "さっぱり使いたいときは、軽めのトナー・化粧水を候補にする",
      "初めてのブランドは、まず小容量やセット品の有無もチェックする",
    ],
  },
};

const DEFAULT_ARTICLE_SEO = ARTICLE_SEO_BLOCKS["korean-toner-ranking-compare"];

/** カード内「特徴」1行（仮・固定フレーズを順番でローテーション） */
const CARD_FEATURE_COMMENT_LINES = [
  "毛穴ケアに強い",
  "保湿重視",
  "韓国で人気",
  "さっぱり使いやすい",
  "定番の韓国スキンケア",
] as const;

function getArticleSeoBlocks(slug: string) {
  return ARTICLE_SEO_BLOCKS[slug] ?? DEFAULT_ARTICLE_SEO;
}

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

function ArticleProductCard({
  item,
  featureLine,
}: {
  item: RankingItemWithProduct;
  featureLine: string;
}) {
  const displayName = getDisplayProductNameText({
    nameJa: item.nameJa,
    name: item.name,
    brand: item.brand,
    brandJa: item.brandJa,
  });
  const displayBrand = getDisplayBrand(item);
  const primaryShop = getPrimaryShopFromProduct(item);
  const suppressAffiliate = shouldSuppressAffiliateCtasForProduct(item);
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
          <p className="mt-2 text-sm leading-snug text-gray-600">特徴：{featureLine}</p>
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
  const seo = getArticleSeoBlocks(slug);

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
          <div className="mb-6" aria-labelledby="article-for-whom-heading">
            <h2
              id="article-for-whom-heading"
              className="mb-2 text-base font-bold text-zinc-900"
            >
              {seo.forWhomTitle}
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {seo.forWhomItems.map((t) => (
                <li key={t}>
                  <p className="inline">{t}</p>
                </li>
              ))}
            </ul>
          </div>

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
              {items.map((item, index) => (
                <ArticleProductCard
                  key={item.goodsNo}
                  item={item}
                  featureLine={
                    CARD_FEATURE_COMMENT_LINES[
                      index % CARD_FEATURE_COMMENT_LINES.length
                    ] ?? ""
                  }
                />
              ))}
            </div>
          )}

          <div className="mt-8" aria-labelledby="article-how-to-heading">
            <h2
              id="article-how-to-heading"
              className="mb-2 text-base font-bold text-zinc-900"
            >
              {seo.howToChooseTitle}
            </h2>
            {seo.howToChooseParagraphs.map((p, i) => (
              <p key={`how-p-${i}`} className="mb-3 text-sm text-zinc-700">
                {p}
              </p>
            ))}
            {seo.howToChooseBullets && seo.howToChooseBullets.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
                {seo.howToChooseBullets.map((t) => (
                  <li key={t}>
                    <p className="inline">{t}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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
