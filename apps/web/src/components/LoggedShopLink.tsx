"use client";

import * as React from "react";
import { relForExternalUrl } from "@/lib/affiliate";
import {
  logAffiliateClick,
  isAffiliateGaShop,
  type AffiliateClickPosition,
  type AffiliateCtaPlacement,
  type AffiliatePageType,
} from "@/components/ProductAffiliateCtas";

/**
 * 外部ショップリンク。クリック時に product_click_logs へ送信してから遷移。
 * ログ失敗しても遷移は行う（購入導線優先）。
 * `gaAffiliateClick` 指定時は `logAffiliateClick` → `emitCtaClick` で GA `affiliate_click`（page_type 等）を送る。
 */
export function LoggedShopLink({
  href,
  shop,
  goodsNo,
  className,
  children,
  gaAffiliateClick,
}: {
  href: string;
  shop: string;
  goodsNo: string;
  className?: string;
  children: React.ReactNode;
  gaAffiliateClick?: {
    position: AffiliateClickPosition;
    productName?: string;
    ctaPlacement?: AffiliateCtaPlacement;
    pageType?: AffiliatePageType;
  };
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (gaAffiliateClick && isAffiliateGaShop(shop)) {
      logAffiliateClick({
        goodsNo,
        shop,
        position: gaAffiliateClick.position,
        href,
        ctx: {
          productName: gaAffiliateClick.productName,
          ctaPlacement: gaAffiliateClick.ctaPlacement,
          pageType: gaAffiliateClick.pageType,
        },
      });
    }
    fetch("/api/log-product-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goodsNo, shop }),
    }).catch(() => {});
    window.location.href = href;
  };

  return (
    <a
      href={href}
      target="_blank"
      rel={relForExternalUrl(href)}
      onClick={handleClick}
      className={className}
    >
      {children}
    </a>
  );
}
