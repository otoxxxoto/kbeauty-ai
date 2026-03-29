import Link from "next/link";
import {
  getRankingWithProducts,
  getRankingRunDates,
} from "@/lib/oliveyoung-rankings";
import { getDisplayBrand } from "@/lib/oliveyoung-products";
import { ProductDisplayImage } from "@/components/ProductDisplayImage";
import { ProductCardCta } from "@/components/ProductCardCta";
import { getDisplayProductNameText } from "@/lib/oliveyoung-display";
import { CATEGORY_LINKS } from "@/lib/category-config";
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
import type { RankingItemWithProduct } from "@/lib/oliveyoung-rankings";
import { notFound } from "next/navigation";
import {
  logImageSourceStatsIfEnabled,
  tallyImageSourcesForProducts,
} from "@/lib/image-source-stats";

type PageProps = {
  params: Promise<{ runDate: string }>;
};

function RankBadge({
  rank,
  highlight,
}: {
  rank: number;
  highlight?: boolean;
}) {
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
      className={`inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg px-2 text-sm font-bold ${highlight && isTop3 ? bg : "bg-zinc-200 text-zinc-700"}`}
    >
      #{rank}
    </span>
  );
}

function ProductCard({
  item,
  showRankBadge = true,
}: {
  item: RankingItemWithProduct;
  showRankBadge?: boolean;
}) {
  const isTop3 = item.rank <= 3;
  const displayName = getDisplayProductNameText({
    nameJa: item.nameJa,
    name: item.name,
    brand: item.brand,
    brandJa: item.brandJa,
  });
  const displayBrand = getDisplayBrand(item);

  return (
    <div
      className={`${PRODUCT_CARD_ROOT_CLASS} hover:border-zinc-300 transition-colors`}
    >
      {showRankBadge ? (
        <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
          <RankBadge rank={item.rank} highlight={isTop3} />
        </div>
      ) : null}
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
        <ProductCardOliveYoungLink
          oliveYoungUrl={item.oliveYoungUrl}
          goodsNo={item.goodsNo}
          gaAffiliate={{
            position: "ranking_card",
            pageType: "ranking",
          }}
        />
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { runDate } = await params;
  const title = `韓国コスメ人気ランキング（${runDate}）| Olive Young`;
  const description = `韓国オリーブヤングの売れ筋ランキングを日本語でまとめました（${runDate}）。人気の韓国コスメを確認できます。`;
  return {
    title,
    description,
    openGraph: { title, description },
  };
}

export default async function RankingByDatePage({ params }: PageProps) {
  logCardLayoutDebug("/oliveyoung/rankings/[runDate]", "RankingByDatePage.ProductCard");
  const { runDate } = await params;
  const data = await getRankingWithProducts(runDate);
  if (!data) notFound();

  const runDates = await getRankingRunDates();
  const currentIndex = runDates.indexOf(runDate);
  const prevRunDate =
    currentIndex >= 0 && currentIndex < runDates.length - 1
      ? runDates[currentIndex + 1]
      : null;
  const nextRunDate = currentIndex > 0 ? runDates[currentIndex - 1] : null;

  const top3 = data.items.filter((i) => i.rank <= 3);
  const newCount = data.items.filter((i) => i.isNew).length;

  logImageSourceStatsIfEnabled(
    `/oliveyoung/rankings/${runDate} (表示順・先頭50件)`,
    tallyImageSourcesForProducts(data.items.slice(0, 50))
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <nav className="flex flex-wrap gap-3 mb-6 text-sm" aria-label="ページ内導線">
        <Link href="/oliveyoung" className="text-blue-600 hover:underline">
          ← Olive Young 一覧
        </Link>
        <Link href="/oliveyoung/brands" className="text-blue-600 hover:underline">
          ブランドランキング
        </Link>
        <Link href="/oliveyoung/category" className="text-blue-600 hover:underline">
          カテゴリ別
        </Link>
        <Link href="/oliveyoung/ingredients" className="text-blue-600 hover:underline">
          成分一覧
        </Link>
        {prevRunDate && (
          <Link
            href={`/oliveyoung/rankings/${prevRunDate}`}
            className="text-blue-600 hover:underline"
          >
            ← {prevRunDate}
          </Link>
        )}
        {nextRunDate && (
          <Link
            href={`/oliveyoung/rankings/${nextRunDate}`}
            className="text-blue-600 hover:underline"
          >
            {nextRunDate} →
          </Link>
        )}
      </nav>

      {/* 導入文 */}
      <p className="text-zinc-600 leading-relaxed mb-4">
        韓国オリーブヤングで人気の商品を、日本語で見やすくまとめたランキングです。
        韓国で今注目されている韓国コスメを確認できます。
      </p>

      <h1 className="text-2xl md:text-3xl font-bold text-zinc-900">
        商品ランキング（{data.meta.runDate}）
      </h1>

      {/* サマリーブロック */}
      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-zinc-500">対象日</p>
            <p className="mt-0.5 font-semibold">{data.meta.runDate}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">総商品数</p>
            <p className="mt-0.5 font-semibold">{data.meta.totalItems}</p>
          </div>
          {newCount > 0 && (
            <div>
              <p className="text-xs text-zinc-500">NEW商品数</p>
              <p className="mt-0.5 font-semibold">{newCount}</p>
            </div>
          )}
        </div>
      </div>

      {/* TOP3 注目商品 */}
      {top3.length > 0 && (
        <section className="mt-8" aria-labelledby="top3-heading">
          <h2 id="top3-heading" className="mb-4 text-lg font-bold text-zinc-900">
            注目のトップ3
          </h2>
          <div className="grid items-stretch gap-4 sm:grid-cols-3">
            {top3.map((item) => (
              <ProductCard key={item.goodsNo} item={item} />
            ))}
          </div>
        </section>
      )}

      {/* 将来拡張用: 急上昇商品 */}
      <section className="mt-8" aria-label="急上昇商品（準備中）">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">急上昇商品</h2>
        <p className="text-sm text-zinc-500">（準備中）</p>
      </section>

      {/* 将来拡張用: 新規ランクイン */}
      <section className="mt-6" aria-label="新規ランクイン（準備中）">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">新規ランクイン</h2>
        <p className="text-sm text-zinc-500">（準備中）</p>
      </section>

      {/* 人気カテゴリ導線（既存ルーティングのみ） */}
      <section className="mt-6" aria-labelledby="category-heading">
        <h2 id="category-heading" className="text-lg font-bold text-zinc-900 mb-3">
          人気カテゴリ
        </h2>
        <ul className="flex flex-wrap gap-2">
          {CATEGORY_LINKS.map(({ slug, label }) => (
            <li key={slug}>
              <Link
                href={`/oliveyoung/category/${slug}`}
                className="inline-flex rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ランキング一覧 */}
      <section className="mt-10" aria-labelledby="list-heading">
        <h2 id="list-heading" className="mb-4 text-lg font-bold text-zinc-900">
          ランキング一覧
        </h2>
        {data.items.length === 0 ? (
          <p className="text-sm text-zinc-500">商品がありません。</p>
        ) : (
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => (
              <ProductCard key={`${item.rank}-${item.goodsNo}`} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
