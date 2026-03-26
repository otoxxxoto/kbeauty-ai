"use client";

import * as React from "react";
import Link from "next/link";
import { CTA_COPY } from "@/lib/ctaCopy";

export type ProductCardCtaVariant = "detail_primary";

export type ProductCardCtaProps = {
  goodsNo: string;
  variant?: ProductCardCtaVariant;
  className?: string;
};

/**
 * 一覧カード用CTA（初回は「詳細を見る」を主導線に固定）
 * - 将来 external CTA に差し替えられるよう variant を用意
 */
export function ProductCardCta({
  goodsNo,
  variant = "detail_primary",
  className = "",
}: ProductCardCtaProps) {
  const href = `/oliveyoung/products/${goodsNo}`;
  if (variant !== "detail_primary") return null;
  return (
    <div className={`flex ${className}`.trim()}>
      <Link
        href={href}
        className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
      >
        {CTA_COPY.card.detail}
      </Link>
    </div>
  );
}

