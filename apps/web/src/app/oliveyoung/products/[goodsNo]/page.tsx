import Link from "next/link";
import {
  getOliveYoungProductByGoodsNo,
  getDisplayBrand,
  formatDateLike,
  formatFetchedAtDate,
  buildMarketplaceLinks,
  getEffectiveAffiliateUrls,
  type PriceComparison,
  type PriceComparisonEntry,
} from "@/lib/oliveyoung-products";
import { ProductDisplayImage } from "@/components/ProductDisplayImage";
import {
  getDisplayProductNameText,
  getSafeSummaryBodyOrNull,
  looksLikeOliveYoungGoodsNo,
  PRODUCT_TITLE_PENDING_JA,
  resolveProductFeatureDisplayParagraph,
} from "@/lib/oliveyoung-display";
import { getRelatedProducts } from "@/lib/oliveyoung-related";
import type { OliveYoungProductMinimal } from "@/lib/oliveyoung-related";
import { LoggedShopLink } from "@/components/LoggedShopLink";
import { ProductAffiliateCtas } from "@/components/ProductAffiliateCtas";
import { BottomStickyCta } from "@/components/BottomStickyCta";
import { CollapsibleText } from "@/components/CollapsibleText";
import { ProductPrimaryCtaBlock } from "@/components/ProductPrimaryCtaBlock";
import { ProductCompareCtaBlock } from "@/components/ProductCompareCtaBlock";
import { buildProductPageSeoMeta } from "@/lib/oliveyoung-product-seo";
import { buildProductTitle } from "@/lib/seo";
import { getRankingRunDates } from "@/lib/oliveyoung-rankings";
import { ProductSeoInternalLinks } from "@/components/ProductSeoInternalLinks";
import { CATEGORY_CONFIG } from "@/lib/category-config";
import { getMatchedCategoriesForProduct } from "@/lib/filter-products-by-category";
import { PRODUCT_SEO_BLOCKS } from "@/lib/product-page-seo-blocks";
import {
  getPrimaryShopFromProduct,
  orderCompareCtaRows,
  shouldSuppressAffiliateCtasForProduct,
} from "@/lib/getPrimaryShop";
import { notFound } from "next/navigation";
import {
  PRODUCT_CARD_ROOT_CLASS,
  PRODUCT_CARD_IMAGE_FRAME_CLASS,
  PRODUCT_CARD_INFO_CLASS,
  PRODUCT_CARD_CTA_CLASS,
  PRODUCT_CARD_TITLE_CLASS,
} from "@/lib/product-card-layout";
import {
  serializeProductImageFieldsForClient,
  logClientSerializeDebugForProduct,
} from "@/lib/serialize-product-for-client";

type PageProps = {
  params: Promise<{ goodsNo: string }>;
};

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://yourdomain.com";

export async function generateMetadata({ params }: PageProps) {
  const { goodsNo } = await params;
  const product = await getOliveYoungProductByGoodsNo(goodsNo);
  if (!product) return { title: "商品詳細 | 韓国コスメ | Olive Young" };

  const { description, selectedPattern } = buildProductPageSeoMeta(product);
  const displayName = getDisplayProductNameText({
    nameJa: product.nameJa,
    name: product.name,
    brand: product.brand,
    brandJa: product.brandJa,
  });
  const title = buildProductTitle(displayName);

  const canonical = `${BASE_URL}/oliveyoung/products/${goodsNo}`;
  if (goodsNo === "A000000141338") {
    // eslint-disable-next-line no-console -- SEO経路の一時デバッグ
    console.log("[SEO METADATA RETURN]", title);
  }

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
    },
    other: {
      "x-ctr-title-pattern": selectedPattern,
    },
  };
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  const display = value != null && value !== "" ? String(value) : "-";
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
      <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-zinc-900 break-words">
        {display}
      </dd>
    </div>
  );
}

function RelatedProductCard({ p }: { p: OliveYoungProductMinimal }) {
  const displayName = getDisplayProductNameText({
    nameJa: p.nameJa,
    name: p.name,
    brand: p.brand,
    brandJa: p.brandJa,
  });
  const displayBrand = getDisplayBrand(p);
  const affiliateUrls = getEffectiveAffiliateUrls(p);
  const primaryShop = getPrimaryShopFromProduct(p);
  const suppressAffiliate = shouldSuppressAffiliateCtasForProduct(p);
  return (
    <div className={PRODUCT_CARD_ROOT_CLASS}>
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
              直近順位: #{p.lastRank}
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
            商品詳細
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
          urls={affiliateUrls}
          variant="card"
          className=""
          position="related_card"
          amazonOnly
          primaryShop={primaryShop}
          suppressAffiliateCtas={suppressAffiliate}
          productNameForGa={displayName}
        />
      </div>
    </div>
  );
}

const PRICE_COMPARISON_LABELS: Record<string, string> = {
  oliveyoung: "Olive Young",
  amazon: "Amazon",
  rakuten: "楽天",
  qoo10: "Qoo10",
};

const SHOP_KEYS = ["oliveyoung", "amazon", "rakuten", "qoo10"] as const;
export type ShopKey = (typeof SHOP_KEYS)[number];

/** 表示可能な価格比較行（priceText または url が存在するもの）。shop はクリックログ用 */
function getPriceComparisonRows(
  pc: PriceComparison | undefined
): { label: string; shop: ShopKey; priceText?: string; url?: string; fetchedAt?: unknown }[] {
  if (!pc) return [];
  const rows: { label: string; shop: ShopKey; priceText?: string; url?: string; fetchedAt?: unknown }[] = [];
  for (const key of SHOP_KEYS) {
    const entry: PriceComparisonEntry | undefined = pc[key];
    if (!entry) continue;
    if (!(entry.priceText?.trim() || entry.url?.trim())) continue;
    rows.push({
      label: entry.label?.trim() || PRICE_COMPARISON_LABELS[key] || key,
      shop: key,
      priceText: entry.priceText?.trim() || undefined,
      url: entry.url?.trim() || undefined,
      ...(entry.fetchedAt !== undefined && { fetchedAt: entry.fetchedAt }),
    });
  }
  return rows;
}

/** priceText から数値を抽出（比較用）。失敗時は null */
function parsePriceNumber(priceText: string): number | null {
  const digits = priceText.replace(/[^\d]/g, "");
  if (digits === "") return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

/** 最安の行インデックス。複数ある場合は最初の最安。判定不可なら null */
function getCheapestIndex(
  rows: { priceText?: string; url?: string }[]
): number | null {
  const withPrice = rows
    .map((r, i) => ({ i, n: r.priceText ? parsePriceNumber(r.priceText) : null }))
    .filter((x) => x.n != null) as { i: number; n: number }[];
  if (withPrice.length === 0) return null;
  const min = Math.min(...withPrice.map((x) => x.n));
  const first = withPrice.find((x) => x.n === min);
  return first?.i ?? null;
}

type PriceRow = {
  label: string;
  shop: ShopKey;
  priceText?: string;
  url?: string;
  fetchedAt?: unknown;
};

function resolveCheapestHref(
  rows: PriceRow[],
  cheapestIndex: number | null,
  productUrl: string,
  amazonSearchUrl: string
): string {
  if (cheapestIndex !== null && rows[cheapestIndex]?.url?.trim()) {
    return rows[cheapestIndex].url!.trim();
  }
  const firstUrl = rows.find((r) => r.url?.trim())?.url?.trim();
  if (firstUrl) return firstUrl;
  if (productUrl.trim()) return productUrl.trim();
  return amazonSearchUrl;
}

/** 購入先CTAブロック（最安バッジ・ボタン強調・縦並び）。クリック時は LoggedShopLink でログ送信 */
function ShopCtaBlock({
  rows,
  cheapestIndex,
  title,
  showFetchedAt,
  sectionId,
  goodsNo,
  productNameForGa,
}: {
  rows: PriceRow[];
  cheapestIndex: number | null;
  title: string;
  showFetchedAt?: boolean;
  sectionId?: string;
  goodsNo: string;
  /** GA affiliate_click の product 用 */
  productNameForGa?: string;
}) {
  const id = sectionId ?? "shop-cta-heading";
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-bold text-zinc-900 mb-4">
        {title}
      </h2>
      <p className="text-sm text-zinc-500 mb-4">
        在庫・価格は各ショップでご確認ください。
      </p>
      <ul className="flex flex-col gap-3 list-none p-0 m-0">
        {rows.map((row, i) => {
          const isCheapest = cheapestIndex === i;
          const hasUrl = !!row.url?.trim();
          const btnClass = isCheapest
            ? "inline-flex items-center justify-center w-full min-h-[48px] rounded-lg bg-emerald-600 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-700 shadow-sm transition-colors"
            : "inline-flex items-center justify-center w-full min-h-[48px] rounded-lg border-2 border-zinc-300 bg-white px-4 py-3 text-base font-medium text-zinc-800 hover:bg-zinc-50 transition-colors";
          return (
            <li key={i} className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-zinc-900">{row.label}</span>
                {isCheapest && (
                  <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    最安
                  </span>
                )}
                {row.priceText && (
                  <span className="text-sm font-medium text-zinc-700">{row.priceText}</span>
                )}
              </div>
              {showFetchedAt && row.fetchedAt ? (() => {
                const fetchedLabel = formatFetchedAtDate(row.fetchedAt);
                return fetchedLabel ? (
                  <span className="text-xs text-zinc-500">更新: {fetchedLabel}</span>
                ) : null;
              })() : null}
              {hasUrl && (
                <LoggedShopLink
                  href={row.url!}
                  shop={row.shop}
                  goodsNo={goodsNo}
                  className={btnClass}
                  gaAffiliateClick={{
                    position: "product_detail_bottom",
                    productName: productNameForGa,
                    pageType: "product_detail",
                  }}
                >
                  {isCheapest ? "最安価格で見る" : "このショップで見る"}
                </LoggedShopLink>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { goodsNo } = await params;
  const product = await getOliveYoungProductByGoodsNo(goodsNo);
  if (!product) notFound();

  const [related, rankingRunDates] = await Promise.all([
    getRelatedProducts(product, {
      brandLimit: 3,
      categoryLimit: 3,
      rankLimit: 3,
    }),
    getRankingRunDates(),
  ]);
  const latestRunDate = rankingRunDates[0] ?? null;

  const displayName = getDisplayProductNameText({
    nameJa: product.nameJa,
    name: product.name,
    brand: product.brand,
    brandJa: product.brandJa,
  });
  const displayBrand = getDisplayBrand(product);
  const rawNameTrim = product.name?.trim() ?? "";
  const showOriginalName =
    !!rawNameTrim &&
    !looksLikeOliveYoungGoodsNo(rawNameTrim) &&
    rawNameTrim !== displayName.trim();
  const showOriginalBrand =
    product.brand?.trim() && product.brand.trim() !== (displayBrand || "").trim();
  const searchKeyword =
    displayName !== PRODUCT_TITLE_PENDING_JA
      ? displayName
      : product.name?.trim() || product.nameJa?.trim() || "";
  const safeReviewSummary = getSafeSummaryBodyOrNull(product.reviewSummaryJa);
  const safeIngredientSummary = getSafeSummaryBodyOrNull(product.ingredientSummaryJa);
  const summaryText = resolveProductFeatureDisplayParagraph(product);
  const marketplaceLinks = buildMarketplaceLinks(searchKeyword);
  const displayRank = product.lastRank ?? product.lastSeenRank ?? "-";
  const priceRows = getPriceComparisonRows(product.priceComparison);
  const cheapestIndex = getCheapestIndex(priceRows);
  const cheapestHref = resolveCheapestHref(
    priceRows,
    cheapestIndex,
    product.productUrl,
    marketplaceLinks.amazon
  );
  const affiliateUrls = getEffectiveAffiliateUrls(product);
  const primaryShop = getPrimaryShopFromProduct(product);
  const suppressAffiliate = shouldSuppressAffiliateCtasForProduct(product);
  const affiliateUrlCount =
    (affiliateUrls.amazon ? 1 : 0) +
    (affiliateUrls.rakuten ? 1 : 0) +
    (affiliateUrls.qoo10 ? 1 : 0);
  const ctaDebugEnabled = process.env.NEXT_PUBLIC_CTA_DEBUG === "1";
  const matchedCategories = getMatchedCategoriesForProduct(product);
  const primaryCategorySlug = matchedCategories[0]?.slug ?? "dry-skin";
  const primaryCategoryLabel =
    CATEGORY_CONFIG[primaryCategorySlug as keyof typeof CATEGORY_CONFIG]?.label ?? "乾燥肌・保湿";

  logClientSerializeDebugForProduct(
    "product-detail",
    product as unknown as Record<string, unknown>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto pb-28 sm:pb-32">
      {/* パンくず・戻る */}
      <nav className="flex flex-wrap gap-3 mb-6 text-sm text-zinc-600" aria-label="パンくず">
        <Link href="/oliveyoung" className="text-blue-600 hover:underline">
          ← Olive Young 一覧
        </Link>
        <Link href="/oliveyoung/brands" className="text-blue-600 hover:underline">
          ← ブランドランキング
        </Link>
      </nav>

      {/* ファーストビュー: 画像・商品名・ブランド・一言・購入導線 */}
      <header className="mb-8">
        <div className="grid gap-6 md:grid-cols-[minmax(200px,360px)_1fr]">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="relative mx-auto flex aspect-square w-full max-w-[360px] items-center justify-center overflow-hidden rounded-lg bg-zinc-100">
              <ProductDisplayImage
                product={serializeProductImageFieldsForClient(product)}
                alt={displayName}
                goodsNo={goodsNo}
              />
            </div>
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 leading-tight">
              {displayName}
            </h1>
            {showOriginalName && (
              <p className="mt-1 text-sm text-zinc-500" aria-label="原文の商品名">
                原文: {product.name}
              </p>
            )}
            {displayBrand && (
              <p className="mt-2 text-base font-medium text-zinc-700">
                {displayBrand}
              </p>
            )}
            {showOriginalBrand && (
              <p className="mt-0.5 text-sm text-zinc-500" aria-label="原文のブランド名">
                原文: {product.brand}
              </p>
            )}
            {safeReviewSummary && (
              <section aria-label="口コミ要約" className="mt-3">
                <div className="text-xs font-semibold text-zinc-500 mb-1">口コミ要約</div>
                <p className="text-sm leading-relaxed text-zinc-800 whitespace-pre-line">
                  {safeReviewSummary}
                </p>
              </section>
            )}
            <div className="mt-3 text-sm leading-relaxed text-zinc-600">
              <CollapsibleText
                text={summaryText}
                collapsedLines={5}
                className="leading-relaxed"
              />
            </div>
            <div className="mt-6 space-y-3">
              <ProductPrimaryCtaBlock
                goodsNo={goodsNo}
                amazonUrl={affiliateUrls.amazon}
                rakutenUrl={affiliateUrls.rakuten}
                qoo10Url={affiliateUrls.qoo10}
                position="product_detail_first"
                primaryShop={primaryShop}
                suppressAffiliateCtas={suppressAffiliate}
                productNameForGa={displayName}
                oliveYoungUrl={product.oliveYoungUrl}
              />
              {ctaDebugEnabled ? (
                <details className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-600">
                  <summary className="cursor-pointer select-none font-semibold">
                    CTA Debug（確認用）
                  </summary>
                  <div className="mt-2 space-y-1">
                    <div>affiliateUrls: {affiliateUrlCount} / 3</div>
                    <div>amazon: {affiliateUrls.amazon ? "yes" : "no"}</div>
                    <div>rakuten: {affiliateUrls.rakuten ? "yes" : "no"}</div>
                    <div>qoo10: {affiliateUrls.qoo10 ? "yes" : "no"}</div>
                    <div>
                      OY supplement URL（正規化後）:{" "}
                      {product.oliveYoungUrl ? "yes" : "no"}
                    </div>
                    <div>productUrl フィールド: {product.productUrl ? "yes" : "no"}</div>
                    <div>pickedUrl フィールド: {product.pickedUrl ? "yes" : "no"}</div>
                    <div>
                      primary/compare:{" "}
                      {affiliateUrlCount > 0 ? "renderable" : "hidden"}
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* 商品特徴（十分な summaryJa → review/成分から合成 → 固定文） */}
      <section className="mb-8" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-lg font-bold text-zinc-900 mb-3">
          商品特徴
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-5">
          <p className="text-zinc-700 leading-relaxed whitespace-pre-line">
            {summaryText}
          </p>
        </div>
      </section>

      <section className="mb-8 space-y-6" aria-label="商品の補足説明">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-bold text-zinc-900 mb-2">{PRODUCT_SEO_BLOCKS.concerns.title}</h2>
          <p className="text-sm text-zinc-700 leading-relaxed">{PRODUCT_SEO_BLOCKS.concerns.body}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-bold text-zinc-900 mb-2">{PRODUCT_SEO_BLOCKS.reviews.title}</h2>
          <p className="text-sm text-zinc-700 leading-relaxed">{PRODUCT_SEO_BLOCKS.reviews.body}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="text-lg font-bold text-zinc-900 mb-2">{PRODUCT_SEO_BLOCKS.usage.title}</h2>
          <p className="text-sm text-zinc-700 leading-relaxed">{PRODUCT_SEO_BLOCKS.usage.body}</p>
        </div>
      </section>

      <section className="mb-8 rounded-lg border border-zinc-100 bg-zinc-50/60 p-4" aria-label="関連一覧への導線">
        <p className="text-sm text-zinc-700 leading-relaxed">
          <Link
            href={`/oliveyoung/category/${primaryCategorySlug}`}
            className="font-medium text-blue-600 hover:underline"
          >
            {primaryCategoryLabel}の商品一覧
          </Link>
          もあわせてご覧ください。
          {related.byBrand.length > 0 ? (
            <>
              {" "}
              <a href="#related-brand-heading" className="font-medium text-blue-600 hover:underline">
                同ブランドの人気商品
              </a>
              もページ下部でチェックできます。
            </>
          ) : latestRunDate ? (
            <>
              {" "}
              <Link
                href={`/oliveyoung/brands/${latestRunDate}`}
                className="font-medium text-blue-600 hover:underline"
              >
                この日付のブランドランキング
              </Link>
              も参考にできます。
            </>
          ) : (
            <>
              {" "}
              <Link href="/oliveyoung/brands" className="font-medium text-blue-600 hover:underline">
                ブランドランキング一覧
              </Link>
              も参考にできます。
            </>
          )}
        </p>
      </section>

      <ProductSeoInternalLinks
        product={{
          nameJa: product.nameJa,
          name: product.name,
          summaryJa: getSafeSummaryBodyOrNull(product.summaryJa) ?? undefined,
        }}
        latestRunDate={latestRunDate}
      />

      <ProductCompareCtaBlock
        goodsNo={goodsNo}
        rows={
          suppressAffiliate
            ? []
            : orderCompareCtaRows(
                [
                  affiliateUrls.amazon
                    ? {
                        shop: "amazon" as const,
                        label: "Amazonで見る",
                        href: affiliateUrls.amazon,
                      }
                    : null,
                  affiliateUrls.rakuten
                    ? {
                        shop: "rakuten" as const,
                        label: "楽天で見る",
                        href: affiliateUrls.rakuten,
                      }
                    : null,
                  affiliateUrls.qoo10
                    ? {
                        shop: "qoo10" as const,
                        label: "Qoo10で見る",
                        href: affiliateUrls.qoo10,
                      }
                    : null,
                ].filter((r): r is NonNullable<typeof r> => r != null),
                primaryShop
              )
        }
        position="product_detail_middle"
        className="my-10 md:my-12"
      />

      {!product.productUrl && product.pickedUrl ? (
        <p className="mb-6 text-xs text-zinc-500 break-all">
          取得元URL:{" "}
          <a
            href={product.pickedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {product.pickedUrl}
          </a>
        </p>
      ) : null}

      {/* 購入先・価格（詳細一覧）。#section-price-compare はファーストビュー「価格を比較」からジャンプ */}
      {priceRows.length > 0 && (
        <section id="section-price-compare" className="mb-8 scroll-mt-24">
          <ShopCtaBlock
            rows={priceRows}
            cheapestIndex={cheapestIndex}
            title="購入先・価格"
            showFetchedAt
            sectionId="shop-cta-price"
            goodsNo={goodsNo}
            productNameForGa={displayName}
          />
        </section>
      )}
      {priceRows.length === 0 && (
        <section
          id="section-price-compare"
          className="mb-8 scroll-mt-24"
          aria-labelledby="price-comparison-heading"
        >
          <h2 id="price-comparison-heading" className="text-lg font-bold text-zinc-900 mb-2">
            価格比較
          </h2>
          <p className="text-sm text-zinc-500">（準備中）</p>
        </section>
      )}
      {/* 成分・特徴（ingredientSummaryJa があれば表示） */}
      {safeIngredientSummary && (
        <section className="mb-10" aria-labelledby="ingredient-summary-heading">
          <h2 id="ingredient-summary-heading" className="text-lg font-bold text-zinc-900 mb-2">
            ■ 成分・特徴
          </h2>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
            <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-line">
              {safeIngredientSummary}
            </p>
          </div>
        </section>
      )}

      {/* 商品情報（順位・日付など） */}
      <section className="mb-8" aria-labelledby="info-heading">
        <h2 id="info-heading" className="text-lg font-bold text-zinc-900 mb-3">
          商品情報
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoCard label="ブランド" value={displayBrand || product.brand || undefined} />
          <InfoCard label="商品ID" value={product.goodsNo} />
          <InfoCard label="直近順位" value={displayRank} />
          <InfoCard label="確認日" value={product.lastSeenRunDate} />
          <InfoCard label="更新日時" value={formatDateLike(product.updatedAt)} />
          <InfoCard label="データソース" value={product.source || undefined} />
        </dl>
      </section>

      {/* 非公式明記（fixed CTA で隠れないよう本ページ内に表示。共通フッターとは別） */}
      <section
        className="mb-10 mt-2 scroll-mt-24 pt-8 pb-2"
        aria-label="サイトに関する注意"
      >
        <p className="text-xs leading-relaxed text-zinc-500 mb-3">
          本サイトは公式サイトではありません。掲載情報は参考情報として提供しています。
        </p>
        <p className="text-xs leading-relaxed text-zinc-500">
          画像・商品情報の詳細はリンク先の販売ページもあわせてご確認ください。
        </p>
      </section>

      <section className="mb-10" aria-label="関連カテゴリ">
        <h2 className="text-lg font-bold text-zinc-900 mb-3">関連カテゴリ</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {matchedCategories.length > 0 ? (
            matchedCategories.map(({ slug }) => (
              <Link
                key={slug}
                href={`/oliveyoung/category/${slug}`}
                className="text-blue-600 hover:underline"
              >
                {CATEGORY_CONFIG[slug]?.label ?? slug}
              </Link>
            ))
          ) : (
            <span className="text-zinc-500">関連カテゴリは準備中です。</span>
          )}
        </div>
      </section>

      {/* 関連商品（ページ下部・回遊） */}
      {(related.byBrand.length > 0 ||
        related.byCategory.length > 0 ||
        related.byRank.length > 0) && (
        <div className="relative z-10 border-t border-zinc-200 pt-10 space-y-10 pb-2">
          <h2 className="text-xl font-bold text-zinc-900">関連商品</h2>
          {related.byBrand.length > 0 && (
            <section aria-labelledby="related-brand-heading">
              <h3 id="related-brand-heading" className="text-base font-semibold text-zinc-800 mb-3">
                同ブランドの人気商品
              </h3>
              <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.byBrand.map((p) => (
                  <RelatedProductCard key={p.goodsNo} p={p} />
                ))}
              </div>
            </section>
          )}
          {related.byCategory.length > 0 && (
            <section aria-labelledby="related-category-heading">
              <h3 id="related-category-heading" className="text-base font-semibold text-zinc-800 mb-3">
                同カテゴリの人気商品
              </h3>
              <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.byCategory.map((p) => (
                  <RelatedProductCard key={p.goodsNo} p={p} />
                ))}
              </div>
            </section>
          )}
          {related.byRank.length > 0 && (
            <section aria-labelledby="related-rank-heading">
              <h3 id="related-rank-heading" className="text-base font-semibold text-zinc-800 mb-3">
                近い順位の商品
              </h3>
              <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {related.byRank.map((p) => (
                  <RelatedProductCard key={p.goodsNo} p={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <BottomStickyCta hasPrice={true} targetId="section-price-compare" />
    </div>
  );
}
