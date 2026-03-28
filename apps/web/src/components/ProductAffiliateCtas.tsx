"use client";

import type { ReactNode } from "react";
import {
  AMAZON_AFFILIATE_REL,
  QOO10_AFFILIATE_REL,
  RAKUTEN_AFFILIATE_REL,
} from "@/lib/affiliate";
import {
  AFFILIATE_CARD_AMAZON_PRIMARY_LABEL,
  RELATED_PRODUCT_CARD_AMAZON_LABEL,
} from "@/lib/ctaCopy";
import { getAffiliateCtaOrder } from "@/lib/getPrimaryShop";
import type { PrimaryShop } from "@/lib/product-marketplace-types";

/** oliveyoung-products の getEffectiveAffiliateUrls と同形 */
export type AffiliateUrlsInput = {
  amazon: string;
  rakuten: string;
  qoo10: string;
};

export type AffiliateClickSource = "amazon" | "rakuten" | "qoo10";
type GaClickLocation = "top" | "detail" | "card";

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
    /** GA event 用（未指定時は goodsNo を使用） */
    productName?: string;
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

  const toGaLocation = (p: AffiliateClickPosition): GaClickLocation => {
    if (p === "product_detail_first") return "top";
    if (p === "product_detail_middle" || p === "product_detail_bottom") return "detail";
    return "card";
  };
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", "affiliate_click", {
      shop: source,
      product: (ctx?.productName ?? goodsNo).trim() || goodsNo,
      location: toGaLocation(position),
    });
  }
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
  /**
   * 明示URLベースの優先ショップ（getPrimaryShopFromProduct）。
   * 未指定時は null 扱いで Qoo10→楽天→Amazon のデフォルト順。
   */
  primaryShop?: PrimaryShop | null;
  /**
   * OY専用導線モード等で外部アフィリエイト行を出さない
   * （shouldSuppressAffiliateCtasForProduct）
   */
  suppressAffiliateCtas?: boolean;
  /** GA の product パラメータ用 */
  productNameForGa?: string;
};

const detailCtaBaseClass =
  "inline-flex w-full items-center justify-center rounded-lg px-4 py-3 text-sm sm:text-base font-bold text-white transition-colors";
const detailCtaClassByShop = {
  amazon: `${detailCtaBaseClass} bg-[#ff9900] hover:bg-[#e68a00]`,
  rakuten: `${detailCtaBaseClass} bg-[#bf0000] hover:bg-[#a30000]`,
  qoo10: `${detailCtaBaseClass} bg-[#ff3366] hover:bg-[#e62e5c]`,
} as const;

const cardCtaClassByShop = {
  amazon:
    "inline-flex w-full items-center justify-center rounded-lg border border-orange-200 bg-orange-100 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-200 transition-colors",
  rakuten:
    "inline-flex w-full items-center justify-center rounded-lg border border-red-200 bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-200 transition-colors",
  qoo10:
    "inline-flex w-full items-center justify-center rounded-lg border border-pink-200 bg-pink-100 px-3 py-2 text-sm font-semibold text-pink-700 hover:bg-pink-200 transition-colors",
} as const;

/**
 * Amazon / 楽天・Qoo10。href が空のボタンは出さない。
 * primaryShop で表示順を変更。
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
  primaryShop = null,
  suppressAffiliateCtas = false,
  productNameForGa,
}: ProductAffiliateCtasProps) {
  const { amazon, rakuten, qoo10 } = urls;

  if (suppressAffiliateCtas) return null;

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

  const gaCtx = {
    ctaPlacement: inferredPlacement,
    pageType: inferredPageType,
    productName: productNameForGa,
  };

  const onAmazonClick = () =>
    logAffiliateClick(goodsNo, "amazon", position, amazon, gaCtx);
  const onRakutenClick = () =>
    logAffiliateClick(goodsNo, "rakuten", position, rakuten, gaCtx);
  const onQoo10Click = () =>
    logAffiliateClick(goodsNo, "qoo10", position, qoo10, gaCtx);

  const amazonButtonLabel = amazonOnly
    ? RELATED_PRODUCT_CARD_AMAZON_LABEL
    : variant === "detail"
      ? "🛒 Amazonで最安を見る"
      : AFFILIATE_CARD_AMAZON_PRIMARY_LABEL;
  const ctaClassByShop = variant === "detail" ? detailCtaClassByShop : cardCtaClassByShop;

  if (amazonOnly) {
    if (!amazon?.trim()) return null;
    return (
      <div
        className={`flex flex-col gap-2 ${className}`.trim()}
        data-testid="product-affiliate-ctas"
        aria-label="外部ショップで見る"
      >
        <a
          href={amazon}
          target="_blank"
          rel={AMAZON_AFFILIATE_REL}
          className={ctaClassByShop.amazon}
          onClick={onAmazonClick}
        >
          {amazonButtonLabel}
        </a>
      </div>
    );
  }

  if (!amazon && !rakuten && !qoo10) {
    return null;
  }

  const order = getAffiliateCtaOrder(primaryShop ?? null);

  const nodes: ReactNode[] = [];
  for (const shop of order) {
    if (shop === "amazon" && amazon?.trim()) {
      nodes.push(
        <a
          key="amazon"
          href={amazon}
          target="_blank"
          rel={AMAZON_AFFILIATE_REL}
          className={ctaClassByShop.amazon}
          onClick={onAmazonClick}
        >
          {amazonButtonLabel}
        </a>
      );
    } else if (shop === "rakuten" && rakuten?.trim()) {
      nodes.push(
        <a
          key="rakuten"
          href={rakuten}
          target="_blank"
          rel={RAKUTEN_AFFILIATE_REL}
          className={ctaClassByShop.rakuten}
          onClick={onRakutenClick}
        >
          {variant === "detail" ? "🛒 楽天でポイント還元を見る" : "楽天で見る"}
        </a>
      );
    } else if (shop === "qoo10" && qoo10?.trim()) {
      nodes.push(
        <a
          key="qoo10"
          href={qoo10}
          target="_blank"
          rel={QOO10_AFFILIATE_REL}
          className={ctaClassByShop.qoo10}
          onClick={onQoo10Click}
        >
          {variant === "detail" ? "🛒 Qoo10でセールを見る" : "Qoo10で見る"}
        </a>
      );
    }
  }

  if (nodes.length === 0) return null;

  return (
    <div
      className={`flex flex-col gap-2 ${className}`.trim()}
      data-testid="product-affiliate-ctas"
      aria-label="外部ショップで見る"
    >
      {nodes}
    </div>
  );
}
