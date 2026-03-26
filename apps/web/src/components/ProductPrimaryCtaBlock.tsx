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

  const ctaBase =
    "inline-flex w-full min-h-[50px] items-center justify-center rounded-xl px-4 py-3 text-sm sm:text-base font-bold text-white shadow-sm transition-colors";
  const amazonBtn = `${ctaBase} bg-[#ff9900] hover:bg-[#e68a00]`;
  const rakutenBtn = `${ctaBase} bg-[#bf0000] hover:bg-[#a30000]`;
  const qoo10Btn = `${ctaBase} bg-[#ff3366] hover:bg-[#e62e5c]`;

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

      <div className="mt-4 flex flex-col gap-3">
        {urls.amazon ? (
          <a
            href={urls.amazon}
            target="_blank"
            rel={AMAZON_AFFILIATE_REL}
            className={amazonBtn}
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
            className={rakutenBtn}
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
            className={qoo10Btn}
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

