import Link from "next/link";
import { getBrandRankingItemByDate, getDisplayBrand } from "@/lib/brand-rankings";
import {
  getOliveYoungProductsByGoodsNos,
  getDisplayBrand as getDisplayBrandFromProduct,
  getEffectiveAffiliateUrls,
} from "@/lib/oliveyoung-products";
import { ProductDisplayImage } from "@/components/ProductDisplayImage";
import { ProductAffiliateCtas } from "@/components/ProductAffiliateCtas";
import { getDisplayProductNameText, getDisplayBrandText } from "@/lib/oliveyoung-display";
import { CATEGORY_LINKS } from "@/lib/category-config";
import type { OliveYoungProductCard } from "@/lib/oliveyoung-products";
import {
  PRODUCT_CARD_ROOT_CLASS,
  PRODUCT_CARD_IMAGE_FRAME_CLASS,
  PRODUCT_CARD_INFO_CLASS,
  PRODUCT_CARD_CTA_CLASS,
  PRODUCT_CARD_TITLE_CLASS,
  logCardLayoutDebug,
} from "@/lib/product-card-layout";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ runDate: string; brandKey: string }>;
};

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://yourdomain.com";

/** brandSummaryJa が無い場合の固定文。補完Jobで Firestore に brandSummaryJa が入れば自動で表示される */
const FALLBACK_BRAND_SUMMARY =
  "韓国オリーブヤングのランキングで確認されているブランド情報です。";

function renderRankDiff(item: {
  rankDiff?: number | null;
  isNew?: boolean;
}) {
  if (item.isNew) {
    return (
      <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        NEW
      </span>
    );
  }
  if (typeof item.rankDiff !== "number") {
    return <span className="text-zinc-400">-</span>;
  }
  if (item.rankDiff > 0) {
    return (
      <span className="font-semibold text-green-700">▲{item.rankDiff}</span>
    );
  }
  if (item.rankDiff < 0) {
    return (
      <span className="font-semibold text-red-700">
        ▼{Math.abs(item.rankDiff)}
      </span>
    );
  }
  return <span className="text-zinc-400">-</span>;
}

function BrandProductCard({ p }: { p: OliveYoungProductCard }) {
  const displayName = getDisplayProductNameText({
    nameJa: p.nameJa,
    name: p.name,
    brand: p.brand,
    brandJa: p.brandJa,
  });
  const displayBrand = getDisplayBrandFromProduct(p);
  return (
    <div
      className={`${PRODUCT_CARD_ROOT_CLASS} hover:border-zinc-300 transition-colors`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={PRODUCT_CARD_IMAGE_FRAME_CLASS}>
          <ProductDisplayImage
            product={serializeProductImageFieldsForClient(p)}
            alt={displayName}
            goodsNo={p.goodsNo}
          />
        </div>
        <div className={PRODUCT_CARD_INFO_CLASS}>
          <div className={PRODUCT_CARD_TITLE_CLASS}>{displayName}</div>
          {displayBrand ? (
            <div className="shrink-0 text-xs text-zinc-500">{displayBrand}</div>
          ) : null}
          {typeof p.lastRank === "number" && (
            <div className="shrink-0 text-xs text-zinc-500">
              順位 #{p.lastRank}
            </div>
          )}
        </div>
      </div>
      <div className={PRODUCT_CARD_CTA_CLASS}>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/oliveyoung/products/${p.goodsNo}`}
            className="inline-flex rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
          >
            商品詳細を見る
          </Link>
          {p.productUrl ? (
            <a
              href={p.productUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Olive Young で見る
            </a>
          ) : null}
        </div>
        <ProductAffiliateCtas
          goodsNo={p.goodsNo}
          urls={getEffectiveAffiliateUrls(p)}
          variant="card"
          className=""
          position="brand_card"
        />
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { runDate, brandKey } = await params;
  const detail = await getBrandRankingItemByDate(runDate, brandKey);

  const brandName =
    (detail
      ? getDisplayBrandText({ brand: detail.brand, brandJa: detail.brandJa }).trim()
      : "") || "Olive Young ブランド";

  const fallbackTitle = "韓国コスメ ブランド | Olive Young";
  const fallbackDescription =
    "韓国オリーブヤングのランキングで注目されているブランドの商品一覧を確認できるページです。";

  if (!detail) {
    const canonical = `${BASE_URL}/oliveyoung/brands/${runDate}/${brandKey}`;
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      alternates: { canonical },
      openGraph: {
        title: fallbackTitle,
        description: fallbackDescription,
        type: "article",
        url: canonical,
      },
      twitter: {
        card: "summary_large_image",
        title: fallbackTitle,
        description: fallbackDescription,
      },
    };
  }

  const title = `${brandName} の人気商品 | 韓国コスメ ブランド | Olive Young`;
  const summaryJa = detail.brandSummaryJa?.trim();
  const description =
    summaryJa && summaryJa.length > 0
      ? summaryJa.length > 150
        ? `${summaryJa.slice(0, 147).trim()}…`
        : summaryJa
      : `${brandName}は韓国オリーブヤングのランキングで注目されているブランドです。このブランドの人気商品や順位動向を確認できます。`;
  const canonical = `${BASE_URL}/oliveyoung/brands/${runDate}/${brandKey}`;

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

export default async function BrandDetailPage({ params }: PageProps) {
  logCardLayoutDebug("/oliveyoung/brands/[runDate]/[brandKey]", "BrandDetailPage.BrandProductCard");
  const { runDate, brandKey } = await params;
  const item = await getBrandRankingItemByDate(runDate, brandKey);

  if (!item) notFound();

  const displayBrand = getDisplayBrand(item);
  const showOriginalBrand =
    item.brand?.trim() && item.brand.trim() !== (displayBrand || "").trim();
  const productCards = item.goodsNos?.length
    ? await getOliveYoungProductsByGoodsNos(item.goodsNos)
    : [];

  // brandSummaryJa があれば表示、無ければ固定文（取得は getBrandRankingItemByDate で実施済み）
  const brandSummaryText = item.brandSummaryJa?.trim() || FALLBACK_BRAND_SUMMARY;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <nav className="flex flex-wrap gap-3 mb-6 text-sm" aria-label="ページ内導線">
        <Link
          href={`/oliveyoung/brands/${runDate}`}
          className="text-blue-600 hover:underline"
        >
          ← ランキング一覧（{runDate}）
        </Link>
        <Link href="/oliveyoung/brands" className="text-blue-600 hover:underline">
          最新ランキング
        </Link>
        <Link
          href={`/oliveyoung/rankings/${runDate}`}
          className="text-blue-600 hover:underline"
        >
          商品ランキング（{runDate}）
        </Link>
        <Link href="/oliveyoung" className="text-blue-600 hover:underline">
          Olive Young 一覧
        </Link>
        <Link href="/oliveyoung/category" className="text-blue-600 hover:underline">
          カテゴリ別
        </Link>
      </nav>

      {/* ファーストビュー: 導入文・ブランド名 */}
      <header className="mb-6">
        <p className="text-zinc-600 leading-relaxed mb-4">
          韓国オリーブヤングのランキングで注目されているブランドです。
          このブランドの人気商品や順位動向を確認できます。
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-zinc-900">
          {displayBrand || item.brand || "（ブランド名なし）"}
        </h1>
        {showOriginalBrand && (
          <p className="mt-1 text-sm text-zinc-500" aria-label="原文のブランド名">
            原文: {item.brand}
          </p>
        )}
        <p className="mt-2 text-sm text-zinc-500">対象日: {runDate}</p>
      </header>

      {/* ブランドについて（brandSummaryJa があれば表示、無ければ固定文） */}
      <section className="mb-8" aria-labelledby="brand-about-heading">
        <h2 id="brand-about-heading" className="text-lg font-bold text-zinc-900 mb-3">
          ブランドについて
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-5">
          <p className="text-zinc-700 leading-relaxed">{brandSummaryText}</p>
        </div>
      </section>

      {/* ブランドのランキング情報 */}
      <section className="mb-8" aria-labelledby="brand-stats-heading">
        <h2 id="brand-stats-heading" className="text-lg font-bold text-zinc-900 mb-3">
          ランキング情報
        </h2>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">現在順位</p>
            <p className="text-xl font-bold mt-1 text-zinc-900">#{item.rank}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">前日比</p>
            <div className="text-lg mt-1">{renderRankDiff(item)}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">ランクイン数</p>
            <p className="text-xl font-bold mt-1 text-zinc-900">{item.count}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">最高順位</p>
            <p className="text-xl font-bold mt-1 text-zinc-900">{item.bestRank}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 max-w-xs">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">スコア</p>
          <p className="text-xl font-bold mt-1 text-zinc-900">{item.score}</p>
        </div>
      </section>

      {/* このブランドで人気の商品 */}
      <section className="mb-10" aria-labelledby="products-heading">
        <h2 id="products-heading" className="mb-4 text-lg font-bold text-zinc-900">
          このブランドで人気の商品
        </h2>
        {productCards.length === 0 ? (
          <p className="text-sm text-zinc-500">商品情報がありません。</p>
        ) : (
          <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {productCards.map((p) => (
              <BrandProductCard key={p.goodsNo} p={p} />
            ))}
          </div>
        )}
      </section>

      {/* 将来拡張用: ブランド比較 */}
      <section className="mb-8" aria-label="ブランド比較（準備中）">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">ブランド比較</h2>
        <p className="text-sm text-zinc-500">（準備中）</p>
      </section>

      {/* 将来拡張用: 関連ブランド */}
      <section className="mb-8" aria-label="関連ブランド（準備中）">
        <h2 className="text-lg font-bold text-zinc-900 mb-2">関連ブランド</h2>
        <p className="text-sm text-zinc-500">（準備中）</p>
      </section>

      {/* 回遊: カテゴリ導線 */}
      <section className="border-t border-zinc-200 pt-8" aria-labelledby="category-heading">
        <h2 id="category-heading" className="text-lg font-bold text-zinc-900 mb-3">
          カテゴリ別に見る
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
    </div>
  );
}
