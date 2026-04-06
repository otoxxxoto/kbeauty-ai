import Link from "next/link";
import {
  getRankingWithProducts,
  getRankingRunDates,
} from "@/lib/oliveyoung-rankings";
import {
  getDisplayBrand,
  getEffectiveAffiliateUrls,
  type OliveYoungProductMinimal,
} from "@/lib/oliveyoung-products";
import { CATEGORY_CONFIG } from "@/lib/category-config";
import { scoreProductForCategory } from "@/lib/filter-products-by-category";
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

type ArticleSeoCategory = "toner" | "serum" | "cream" | "pack" | "cleansing";

type ArticleSeoBlock = {
  forWhomTitle: string;
  forWhomItems: string[];
  howToChooseTitle: string;
  howToChooseParagraphs: string[];
  howToChooseBullets?: string[];
};

/** slug からカテゴリ判定（量産記事は slug にカテゴリ語を含める） */
function slugToArticleCategory(slug: string): ArticleSeoCategory {
  const s = slug.toLowerCase();
  if (s.includes("cleansing")) return "cleansing";
  if (s.includes("serum")) return "serum";
  if (s.includes("toner")) return "toner";
  if (s.includes("cream")) return "cream";
  if (s.includes("pack")) return "pack";
  return "toner";
}

/** カテゴリ別の固定SEO補強文（UI・スキーマは据え置き） */
const ARTICLE_SEO_BY_CATEGORY: Record<ArticleSeoCategory, ArticleSeoBlock> = {
  toner: {
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
  serum: {
    forWhomTitle: "こんな人におすすめ",
    forWhomItems: [
      "美容液（セラム）で、悩みに合わせた集中ケアをしたい方",
      "韓国オリーブヤングの売れ筋から、候補を素早く洗い出したい方",
      "化粧水のあとのステップを一本足したい方",
    ],
    howToChooseTitle: "選び方のヒント",
    howToChooseParagraphs: [
      "美容液は保湿・透明感・ハリなど、訴求が商品ごとに異なります。ランキング上位から気になるものを選び、詳細ページで成分や使い方の目安を確認すると失敗が減ります。",
      "価格・在庫は店舗や時期で変わるため、各リンク先の最新情報をご確認ください。",
    ],
    howToChooseBullets: [
      "重ねづけする場合は、さっぱり系としっとり系のバランスを意識する",
      "初回は少量パックやミニサイズがあるかも確認する",
      "敏感肌はパッチテストや刺激の少なめ処方を優先する",
    ],
  },
  cream: {
    forWhomTitle: "こんな人におすすめ",
    forWhomItems: [
      "クリームで保湿やバリアサポートを仕上げたい方",
      "韓国コスメの人気ランキングから、定番・話題品を比較したい方",
      "夜用にしっとりめの1本を探している方",
    ],
    howToChooseTitle: "選び方のヒント",
    howToChooseParagraphs: [
      "クリームは油分・保湿剤のバランスで「軽い／重い」が分かれます。肌質と季節に合わせ、詳細ページのテクスチャ説明も参考にしてください。",
      "価格やセット品はショップにより異なることがあります。",
    ],
    howToChooseBullets: [
      "朝は軽め、夜はしっとりめ、と使い分けると選びやすい",
      "ニキビ肌はオイル過多になりにくい処方も候補に",
      "香りが苦手な場合は無香料寄りを探す",
    ],
  },
  pack: {
    forWhomTitle: "こんな人におすすめ",
    forWhomItems: [
      "シートパックや洗い流しパックで、短時間ケアをしたい方",
      "オリーブヤングのランキングで人気のパック系を比較したい方",
      "イベント前や乾燥が気になる日の集中ケアを探している方",
    ],
    howToChooseTitle: "選び方のヒント",
    howToChooseParagraphs: [
      "パックはシート型・クリーム型など形状と、保湿・ハリなどの訴求が様々です。ランキング上位から用途に近いものを選び、詳細で使用方法を確認してください。",
      "在庫・価格は変動しやすいため、購入前に各ショップでご確認ください。",
    ],
    howToChooseBullets: [
      "毎日使うなら刺激が控えめなものを",
      "シートはフィット感・液量のレビューも参考に",
      "洗い流しタイプは放置時間を守る",
    ],
  },
  cleansing: {
    forWhomTitle: "こんな人におすすめ",
    forWhomItems: [
      "韓国のクレンジングで、メイク落としの候補を探している方",
      "オリーブヤング人気ランキングを根拠に比較したい方",
      "オイル・バーム・ジェルなどタイプ別に検討したい方",
    ],
    howToChooseTitle: "選び方のヒント",
    howToChooseParagraphs: [
      "クレンジングはメイクの濃さ・肌の敏感さで最適タイプが変わります。ランキング上位から候補を絞り、詳細ページで洗い流し方やW洗顔の必要性を確認してください。",
      "価格・容量はショップごとに異なることがあります。",
    ],
    howToChooseBullets: [
      "濃いメイクならオイル・バーム系を候補に",
      "摩擦を減らすため、なじませ時間を守る",
      "肌が揺らぎやすいときは低刺激処方を優先する",
    ],
  },
};

/** カード内「特徴」1行（カテゴリ別の仮フレーズをローテーション） */
const CARD_FEATURE_LINES_BY_CATEGORY: Record<
  ArticleSeoCategory,
  readonly string[]
> = {
  toner: [
    "毛穴ケアに強い",
    "保湿重視",
    "韓国で人気",
    "さっぱり使いやすい",
    "定番の韓国スキンケア",
  ],
  serum: [
    "集中ケア向き",
    "浸透感を意識したい方に",
    "韓国で定番の美容液",
    "化粧水の次のステップに",
    "売れ筋セラムの一角",
  ],
  cream: [
    "保湿・密封感を補いやすい",
    "仕上げのクリームとして",
    "韓国ランキングで人気",
    "バリアサポート意識",
    "しっとりタイプの候補",
  ],
  pack: [
    "集中保湿しやすい",
    "シート・パック系の人気枠",
    "韓国でよく見る定番アイテム",
    "短時間ケア向き",
    "ランキング上位の一角",
  ],
  cleansing: [
    "メイク落としの定番枠",
    "なじませやすさを意識",
    "韓国で人気のクレンジング",
    "W洗顔との相性は詳細で確認",
    "売れ筋クレンジング候補",
  ],
};

function getArticleSeoBlocks(slug: string): ArticleSeoBlock {
  const cat = slugToArticleCategory(slug);
  return ARTICLE_SEO_BY_CATEGORY[cat];
}

function getCardFeatureLine(slug: string, index: number): string {
  const lines = CARD_FEATURE_LINES_BY_CATEGORY[slugToArticleCategory(slug)];
  return lines[index % lines.length] ?? "";
}

/** filter-products-by-category と同じ閾値（score >= 2 で掲載候補） */
const CATEGORY_SCORE_THRESHOLD = 2;

/**
 * ランキング行 → カテゴリスコア計算用の最小形。
 * summaryJa はマージされていないため未設定（name / nameJa / brand での一致のみ）。
 */
function rankingItemToMinimalForCategoryScore(
  item: RankingItemWithProduct
): OliveYoungProductMinimal {
  return {
    goodsNo: item.goodsNo,
    name: item.name,
    nameJa: item.nameJa,
    brand: item.brand,
    brandJa: item.brandJa,
    summaryJa: undefined,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
    productUrl: item.productUrl,
    pickedUrl: item.pickedUrl ?? null,
    lastRank: item.lastRank,
    lastSeenRunDate: item.lastSeenRunDate,
    updatedAt: null,
  } as OliveYoungProductMinimal;
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

  const categoryConfig = CATEGORY_CONFIG[spec.categoryConfigSlug];
  if (!categoryConfig) notFound();

  const filtered = data.items.filter(
    (item) =>
      scoreProductForCategory(
        rankingItemToMinimalForCategoryScore(item),
        categoryConfig
      ) >= CATEGORY_SCORE_THRESHOLD
  );
  filtered.sort((a, b) => a.rank - b.rank);
  const offset = spec.offset ?? 0;
  const limitN = Math.max(1, spec.limit);
  const items = filtered.slice(offset, offset + limitN);

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
          ランキングデータ日: {data.meta.runDate}／カテゴリ「
          {categoryConfig.label}」に該当する商品を、公式順位の若い順に
          {offset > 0 ? (
            <>
              並べ、先頭 {offset} 件を除いたうち最大 {spec.limit}{" "}
              件まで掲載します。
            </>
          ) : (
            <>最大 {spec.limit} 件まで掲載します。</>
          )}
          {items.length > 0 ? (
            <span>（このページでは {items.length} 件）</span>
          ) : null}
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
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
              role="status"
            >
              <p className="font-semibold">このランキングでは該当商品がありません</p>
              <p className="mt-2 leading-relaxed text-amber-900">
                掲載日 {data.meta.runDate} のランキング全体のうち、「
                {categoryConfig.label}」のキーワード基準（スコア
                {CATEGORY_SCORE_THRESHOLD} 以上）に合致する商品が見つかりませんでした。カテゴリや商品名の表記により、別日のランキングでは表示される場合があります。全商品は
                <Link
                  href={`/oliveyoung/rankings/${runDate}`}
                  className="mx-1 font-medium text-amber-800 underline hover:text-amber-950"
                >
                  日別ランキング一覧
                </Link>
                からご確認ください。
              </p>
            </div>
          ) : (
            <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, index) => (
                <ArticleProductCard
                  key={item.goodsNo}
                  item={item}
                  featureLine={getCardFeatureLine(slug, index)}
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
