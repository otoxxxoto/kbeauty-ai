"use client";

import type { ReactNode } from "react";
import {
  AMAZON_AFFILIATE_REL,
  QOO10_AFFILIATE_REL,
  RAKUTEN_AFFILIATE_REL,
} from "@/lib/affiliate";
import { CTA_COPY } from "@/lib/ctaCopy";
import { getAffiliateCtaOrder } from "@/lib/getPrimaryShop";
import type { PrimaryShop } from "@/lib/product-marketplace-types";
import {
  logAffiliateClick,
  type AffiliateClickPosition,
} from "@/components/ProductAffiliateCtas";
import { ProductCardOliveYoungLink } from "@/components/ProductCardOliveYoungLink";

export type ProductPrimaryCtaBlockProps = {
  goodsNo: string;
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  position?: AffiliateClickPosition;
  className?: string;
  primaryShop?: PrimaryShop | null;
  suppressAffiliateCtas?: boolean;
  productNameForGa?: string;
  /** 表示用 OY 遷移先（例: `resolveEffectiveOliveYoungUrl` 結果）。trim 後に空でなければ補助リンクを出す */
  oliveYoungUrl?: string | null;
};

function hasAnyUrl(u: { amazonUrl?: string; rakutenUrl?: string; qoo10Url?: string }): boolean {
  return !!(u.amazonUrl?.trim() || u.rakutenUrl?.trim() || u.qoo10Url?.trim());
}

export function ProductPrimaryCtaBlock({
  goodsNo,
  amazonUrl,
  rakutenUrl,
  qoo10Url,
  position = "product_detail_first",
  className = "",
  primaryShop = null,
  suppressAffiliateCtas = false,
  productNameForGa,
  oliveYoungUrl,
}: ProductPrimaryCtaBlockProps) {
  const urls = {
    amazon: (amazonUrl ?? "").trim(),
    rakuten: (rakutenUrl ?? "").trim(),
    qoo10: (qoo10Url ?? "").trim(),
  };
  const hasAffiliateUrls = hasAnyUrl({
    amazonUrl: urls.amazon,
    rakutenUrl: urls.rakuten,
    qoo10Url: urls.qoo10,
  });

  const oyTrim = oliveYoungUrl?.trim() ?? "";
  const showOySupplement = oyTrim.length > 0;

  /** 先頭1本だけ：従来どおりのソリッド主CTA */
  const ctaPrimaryBase =
    "inline-flex w-full min-h-[52px] items-center justify-center rounded-xl px-4 py-3 text-sm sm:text-base font-bold text-white shadow-md ring-2 ring-black/5 ring-offset-2 ring-offset-white transition-colors";
  /** 2本目以降：同じショップ色味でアウトライン（主と並べても主が一目で分かる） */
  const ctaSecondaryBase =
    "inline-flex w-full min-h-[44px] items-center justify-center rounded-xl border-2 px-4 py-2.5 text-sm font-semibold shadow-none transition-colors";
  const amazonPrimary = `${ctaPrimaryBase} bg-[#ff9900] hover:bg-[#e68a00]`;
  const amazonSecondary = `${ctaSecondaryBase} border-orange-300 bg-orange-50/90 text-orange-900 hover:bg-orange-100`;
  const rakutenPrimary = `${ctaPrimaryBase} bg-[#bf0000] hover:bg-[#a30000]`;
  const rakutenSecondary = `${ctaSecondaryBase} border-red-300 bg-red-50/90 text-red-900 hover:bg-red-100`;
  const qoo10Primary = `${ctaPrimaryBase} bg-[#ff3366] hover:bg-[#e62e5c]`;
  const qoo10Secondary = `${ctaSecondaryBase} border-pink-300 bg-pink-50/90 text-pink-900 hover:bg-pink-100`;

  const order = getAffiliateCtaOrder(primaryShop ?? null);
  const gaCtx = {
    ctaPlacement: "primary" as const,
    pageType: "product_detail" as const,
    productName: productNameForGa,
  };

  const nodes: ReactNode[] = [];
  if (!suppressAffiliateCtas && hasAffiliateUrls) {
    let isFirstAffiliate = true;
    for (const shop of order) {
      if (shop === "amazon" && urls.amazon) {
        const btnClass = isFirstAffiliate ? amazonPrimary : amazonSecondary;
        isFirstAffiliate = false;
        nodes.push(
        <a
          key="amazon"
          href={urls.amazon}
          target="_blank"
          rel={AMAZON_AFFILIATE_REL}
          className={btnClass}
          onClick={() =>
            logAffiliateClick({
              goodsNo,
              shop: "amazon",
              position,
              href: urls.amazon,
              ctx: gaCtx,
            })
          }
        >
          {CTA_COPY.primary.amazon}
        </a>
        );
      } else if (shop === "rakuten" && urls.rakuten) {
        const btnClass = isFirstAffiliate ? rakutenPrimary : rakutenSecondary;
        isFirstAffiliate = false;
        nodes.push(
        <a
          key="rakuten"
          href={urls.rakuten}
          target="_blank"
          rel={RAKUTEN_AFFILIATE_REL}
          className={btnClass}
          onClick={() =>
            logAffiliateClick({
              goodsNo,
              shop: "rakuten",
              position,
              href: urls.rakuten,
              ctx: gaCtx,
            })
          }
        >
          {CTA_COPY.primary.rakuten}
        </a>
        );
      } else if (shop === "qoo10" && urls.qoo10) {
        const btnClass = isFirstAffiliate ? qoo10Primary : qoo10Secondary;
        isFirstAffiliate = false;
        nodes.push(
        <a
          key="qoo10"
          href={urls.qoo10}
          target="_blank"
          rel={QOO10_AFFILIATE_REL}
          className={btnClass}
          onClick={() =>
            logAffiliateClick({
              goodsNo,
              shop: "qoo10",
              position,
              href: urls.qoo10,
              ctx: gaCtx,
            })
          }
        >
          {CTA_COPY.primary.qoo10}
        </a>
        );
      }
    }
  }

  if (nodes.length === 0 && !showOySupplement) return null;

  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 ${className}`.trim()}
      aria-label="購入先CTA（ファーストビュー）"
      data-has-oy-link={process.env.NODE_ENV === "development" ? (showOySupplement ? "yes" : "no") : undefined}
      data-oy-url={process.env.NODE_ENV === "development" ? oyTrim || undefined : undefined}
      data-oy-supplement-hidden-reason={
        process.env.NODE_ENV === "development"
          ? showOySupplement
            ? undefined
            : "empty_olive_young_url"
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-zinc-900">{CTA_COPY.primary.title}</h2>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500">{CTA_COPY.primary.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">{nodes}</div>

      {showOySupplement ? (
        <div className="mt-4 border-t border-zinc-200 pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            公式ストア
          </p>
          <ProductCardOliveYoungLink
            variant="detail"
            oliveYoungUrl={oliveYoungUrl}
            goodsNo={goodsNo}
            linkLabel={CTA_COPY.primary.oliveYoungSupplement}
            className="max-w-full"
            gaAffiliate={{
              position,
              productName: productNameForGa,
              ctaPlacement: "primary",
              pageType: "product_detail",
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
