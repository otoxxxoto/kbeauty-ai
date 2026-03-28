"use client";

import { LoggedShopLink } from "@/components/LoggedShopLink";

const baseClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition-colors";

/**
 * 一覧カード用: 出典確認の補助導線（`oliveYoungUrl` のみ）。
 * クリックは `LoggedShopLink`（product_click_logs）で既存計測と揃える。
 */
export function ProductCardOliveYoungLink({
  oliveYoungUrl,
  goodsNo,
  className = "",
}: {
  oliveYoungUrl?: string | null;
  goodsNo: string;
  className?: string;
}) {
  const href = oliveYoungUrl?.trim();
  if (!href) return null;
  return (
    <LoggedShopLink
      href={href}
      shop="oliveyoung"
      goodsNo={goodsNo}
      className={`${baseClass} ${className}`.trim()}
    >
      Olive Youngで見る
    </LoggedShopLink>
  );
}
