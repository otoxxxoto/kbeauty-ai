"use client";

import * as React from "react";
import {
  AMAZON_AFFILIATE_REL,
  QOO10_AFFILIATE_REL,
  RAKUTEN_AFFILIATE_REL,
} from "@/lib/affiliate";
import { CTA_COPY } from "@/lib/ctaCopy";
import { logAffiliateClick, type AffiliateClickPosition } from "@/components/ProductAffiliateCtas";

export type CompareShopKey = "amazon" | "rakuten" | "qoo10";

export type ProductCompareCtaRow = {
  shop: CompareShopKey;
  label: string;
  href: string;
  /** 将来拡張: 価格表示（任意） */
  priceText?: string;
  /** 将来拡張: cheapest/おすすめ等 */
  badge?: string;
};

export type ProductCompareCtaBlockProps = {
  goodsNo: string;
  title?: string;
  subtitle?: string;
  rows: ProductCompareCtaRow[];
  position?: AffiliateClickPosition;
  className?: string;
};

function relForShop(shop: CompareShopKey): string {
  if (shop === "amazon") return AMAZON_AFFILIATE_REL;
  if (shop === "rakuten") return RAKUTEN_AFFILIATE_REL;
  return QOO10_AFFILIATE_REL;
}

export function ProductCompareCtaBlock({
  goodsNo,
  title = CTA_COPY.compare.title,
  subtitle = CTA_COPY.compare.subtitle,
  rows,
  position = "product_detail_middle",
  className = "",
}: ProductCompareCtaBlockProps) {
  const visible = rows.filter((r) => r.href.trim());
  if (visible.length === 0) return null;

  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6 ${className}`.trim()}
      aria-label="購入先比較CTA"
    >
      <h2 className="text-base sm:text-lg font-bold text-zinc-900">{title}</h2>
      <p className="mt-1 text-xs sm:text-sm text-zinc-500">{subtitle}</p>

      <div className="mt-4 grid grid-cols-1 gap-2">
        {visible.map((r) => {
          const hasPrice = !!r.priceText?.trim();
          const hint =
            r.shop === "amazon"
              ? CTA_COPY.compare.row.amazon.hint
              : r.shop === "rakuten"
                ? CTA_COPY.compare.row.rakuten.hint
                : CTA_COPY.compare.row.qoo10.hint;
          return (
            <a
              key={r.shop}
              href={r.href}
              target="_blank"
              rel={relForShop(r.shop)}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50/40 px-4 py-3 hover:bg-zinc-50 transition-colors"
              onClick={() =>
                logAffiliateClick(goodsNo, r.shop, position, r.href, {
                  ctaPlacement: "compare",
                  pageType: "product_detail",
                })
              }
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-900">{r.label}</span>
                  {r.badge ? (
                    <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      {r.badge}
                    </span>
                  ) : null}
                </div>
                {hasPrice ? (
                  <div className="mt-0.5 text-xs text-zinc-600">{r.priceText}</div>
                ) : (
                  <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>
                )}
              </div>
              <span className="shrink-0 text-xs font-semibold text-emerald-700">
                {CTA_COPY.compare.cta}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}

