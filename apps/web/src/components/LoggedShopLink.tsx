"use client";

import * as React from "react";
import { relForExternalUrl } from "@/lib/affiliate";

/**
 * 外部ショップリンク。クリック時に product_click_logs へ送信してから遷移。
 * ログ失敗しても遷移は行う（購入導線優先）。
 */
export function LoggedShopLink({
  href,
  shop,
  goodsNo,
  className,
  children,
}: {
  href: string;
  shop: string;
  goodsNo: string;
  className?: string;
  children: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
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
