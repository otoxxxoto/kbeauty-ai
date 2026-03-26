"use client";

import {
  AMAZON_AFFILIATE_REL,
  QOO10_AFFILIATE_REL,
  RAKUTEN_AFFILIATE_REL,
} from "@/lib/affiliate";
import {
  AFFILIATE_CARD_AMAZON_PRIMARY_LABEL,
  RELATED_PRODUCT_CARD_AMAZON_LABEL,
} from "@/lib/ctaCopy";

/** oliveyoung-products の getEffectiveAffiliateUrls と同形 */
export type AffiliateUrlsInput = {
  amazon: string;
  rakuten: string;
  qoo10: string;
};

export type AffiliateClickSource = "amazon" | "rakuten" | "qoo10";

/** affiliate_click の position（計測用） */
export type AffiliateClickPosition =
  | "product_detail_first"
  | "product_detail_middle"
  | "product_detail_bottom"
  | "category_card"
  | "featured_card"
  | "rising_card"
  | "ranking_card"
  | "brand_card"
  | "related_card";

export type AffiliateCtaPlacement =
  | "primary"
  | "compare"
  | "bottom"
  | "ranking_card"
  | "category_card";

export type AffiliatePageType = "product_detail" | "ranking" | "category";

/** 将来DB保存用。現状は console のみ */
export function logAffiliateClick(
  goodsNo: string,
  source: AffiliateClickSource,
  position: AffiliateClickPosition,
  href?: string,
  ctx?: {
    /** CTA の役割/配置（後方互換: 未指定なら省略） */
    ctaPlacement?: AffiliateCtaPlacement;
    /** 画面種別（後方互換: 未指定なら省略） */
    pageType?: AffiliatePageType;
  }
): void {
  const payload: Record<string, unknown> = {
    goodsNo,
    source,
    position,
  };
  if (href != null && href !== "") payload.href = href;
  if (ctx?.ctaPlacement) payload.ctaPlacement = ctx.ctaPlacement;
  if (ctx?.pageType) payload.pageType = ctx.pageType;
  console.log("affiliate_click", payload);
}

type ProductAffiliateCtasProps = {
  goodsNo: string;
  urls: AffiliateUrlsInput;
  /** カード一覧用 / 詳細用で余白・文字サイズ調整 */
  variant?: "card" | "detail";
  className?: string;
  /** クリックログ用の表示箇所 */
  position?: AffiliateClickPosition;
  /** CTA の役割/配置（任意）。未指定なら position から推定（可能な範囲） */
  ctaPlacement?: AffiliateCtaPlacement;
  /** pageType（任意）。未指定なら ctaPlacement から推定 */
  pageType?: AffiliatePageType;
  /** true のとき Amazon のみ（楽天・Qoo10 は出さない）。関連商品カードの一覧性向上用 */
  amazonOnly?: boolean;
};

const primaryClassCard =
  "inline-flex w-full min-h-[40px] items-center justify-center rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors";

const primaryClassDetail =
  "inline-flex w-full min-h-[48px] items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm sm:text-base font-bold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-700 transition-colors";

/** カード内は縦積み前提。横並びで狭幅になると文言が2行に割れるため w-full + 短めラベル */
const subClassCard =
  "inline-flex w-full min-h-[36px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors whitespace-nowrap";

const subClassDetail =
  "inline-flex flex-1 min-h-[44px] min-w-[120px] items-center justify-center rounded-lg border-2 border-zinc-300 bg-zinc-50 px-3 py-2.5 text-xs sm:text-sm font-semibold text-zinc-800 hover:bg-white transition-colors";

/**
 * Amazon（主CTA・緑）/ 楽天・Qoo10（サブ）。href が空のボタンは出さない。
 */
export function ProductAffiliateCtas({
  goodsNo,
  urls,
  variant = "card",
  className = "",
  position = "category_card",
  ctaPlacement,
  pageType,
  amazonOnly = false,
}: ProductAffiliateCtasProps) {
  const { amazon, rakuten, qoo10 } = urls;
  if (amazonOnly) {
    if (!amazon?.trim()) return null;
  } else if (!amazon && !rakuten && !qoo10) {
    return null;
  }

  const primaryCls = variant === "detail" ? primaryClassDetail : primaryClassCard;
  const subCls = variant === "detail" ? subClassDetail : subClassCard;

  const inferredPlacement: AffiliateCtaPlacement | undefined =
    ctaPlacement ??
    (position === "ranking_card"
      ? "ranking_card"
      : position === "category_card"
        ? "category_card"
        : undefined);

  const inferredPageType: AffiliatePageType | undefined =
    pageType ??
    (inferredPlacement === "ranking_card"
      ? "ranking"
      : inferredPlacement === "category_card"
        ? "category"
        : undefined);

  const onAmazonClick = () =>
    logAffiliateClick(goodsNo, "amazon", position, amazon, {
      ctaPlacement: inferredPlacement,
      pageType: inferredPageType,
    });
  const onRakutenClick = () =>
    logAffiliateClick(goodsNo, "rakuten", position, rakuten, {
      ctaPlacement: inferredPlacement,
      pageType: inferredPageType,
    });
  const onQoo10Click = () =>
    logAffiliateClick(goodsNo, "qoo10", position, qoo10, {
      ctaPlacement: inferredPlacement,
      pageType: inferredPageType,
    });

  const amazonButtonLabel = amazonOnly
    ? RELATED_PRODUCT_CARD_AMAZON_LABEL
    : AFFILIATE_CARD_AMAZON_PRIMARY_LABEL;

  return (
    <div
      className={`flex flex-col gap-2 ${className}`.trim()}
      data-testid="product-affiliate-ctas"
      aria-label="外部ショップで見る"
    >
      {amazon ? (
        <a
          href={amazon}
          target="_blank"
          rel={AMAZON_AFFILIATE_REL}
          className={primaryCls}
          onClick={onAmazonClick}
        >
          {amazonButtonLabel}
        </a>
      ) : null}
      {!amazonOnly && (rakuten || qoo10) ? (
        <div
          className={
            variant === "card"
              ? "flex w-full flex-col gap-2"
              : "flex w-full flex-wrap gap-2"
          }
        >
          {rakuten ? (
            <a
              href={rakuten}
              target="_blank"
              rel={RAKUTEN_AFFILIATE_REL}
              className={subCls}
              onClick={onRakutenClick}
            >
              {variant === "card" ? "楽天で見る" : "楽天で価格をチェック"}
            </a>
          ) : null}
          {qoo10 ? (
            <a
              href={qoo10}
              target="_blank"
              rel={QOO10_AFFILIATE_REL}
              className={subCls}
              onClick={onQoo10Click}
            >
              {variant === "card" ? "Qoo10で見る" : "Qoo10で価格をチェック"}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

