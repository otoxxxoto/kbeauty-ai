"use client";

import * as React from "react";
import {
  AMAZON_AFFILIATE_REL,
  QOO10_AFFILIATE_REL,
  RAKUTEN_AFFILIATE_REL,
} from "@/lib/affiliate";
import { CTA_COPY } from "@/lib/ctaCopy";
import {
  logAffiliateClick,
  type AffiliateClickPosition,
} from "@/components/ProductAffiliateCtas";

export type ProductPrimaryCtaBlockProps = {
  goodsNo: string;
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  position?: AffiliateClickPosition;
  className?: string;
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
}: ProductPrimaryCtaBlockProps) {
  const urls = {
    amazon: (amazonUrl ?? "").trim(),
    rakuten: (rakutenUrl ?? "").trim(),
    qoo10: (qoo10Url ?? "").trim(),
  };
  if (!hasAnyUrl({ amazonUrl: urls.amazon, rakutenUrl: urls.rakuten, qoo10Url: urls.qoo10 })) {
    return null;
  }

  const primaryBtn =
    "inline-flex w-full min-h-[48px] items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm sm:text-base font-bold text-white shadow-md shadow-emerald-900/20 hover:bg-emerald-700 transition-colors";
  const subBtn =
    "inline-flex w-full min-h-[44px] items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 transition-colors";

  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 ${className}`.trim()}
      aria-label="購入先CTA（ファーストビュー）"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-zinc-900">{CTA_COPY.primary.title}</h2>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500">{CTA_COPY.primary.subtitle}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {urls.amazon ? (
          <a
            href={urls.amazon}
            target="_blank"
            rel={AMAZON_AFFILIATE_REL}
            className={primaryBtn}
            onClick={() =>
              logAffiliateClick(goodsNo, "amazon", position, urls.amazon, {
                ctaPlacement: "primary",
                pageType: "product_detail",
              })
            }
          >
            {CTA_COPY.primary.amazon}
          </a>
        ) : null}
        {urls.rakuten ? (
          <a
            href={urls.rakuten}
            target="_blank"
            rel={RAKUTEN_AFFILIATE_REL}
            className={subBtn}
            onClick={() =>
              logAffiliateClick(goodsNo, "rakuten", position, urls.rakuten, {
                ctaPlacement: "primary",
                pageType: "product_detail",
              })
            }
          >
            {CTA_COPY.primary.rakuten}
          </a>
        ) : null}
        {urls.qoo10 ? (
          <a
            href={urls.qoo10}
            target="_blank"
            rel={QOO10_AFFILIATE_REL}
            className={subBtn}
            onClick={() =>
              logAffiliateClick(goodsNo, "qoo10", position, urls.qoo10, {
                ctaPlacement: "primary",
                pageType: "product_detail",
              })
            }
          >
            {CTA_COPY.primary.qoo10}
          </a>
        ) : null}
      </div>
    </section>
  );
}

