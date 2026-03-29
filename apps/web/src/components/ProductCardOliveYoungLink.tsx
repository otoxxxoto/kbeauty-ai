"use client";

import { LoggedShopLink } from "@/components/LoggedShopLink";
import { isOliveYoungOfficialProductUrl } from "@/lib/oliveyoung-official-url";
import type {
  AffiliateClickPosition,
  AffiliateCtaPlacement,
  AffiliatePageType,
} from "@/components/ProductAffiliateCtas";

const cardClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 transition-colors";

/** 商品詳細・主CTA直下用（テキストリンク風・主ボタンより弱い） */
const detailClass =
  "inline-flex w-full items-center justify-center rounded-md border border-zinc-100 bg-white px-2 py-1.5 text-[11px] font-normal text-zinc-500 hover:border-zinc-200 hover:bg-zinc-50/80 hover:text-zinc-700 transition-colors";

export type ProductCardOliveYoungGaAffiliate = {
  position: AffiliateClickPosition;
  productName?: string;
  ctaPlacement?: AffiliateCtaPlacement;
  pageType?: AffiliatePageType;
};

/**
 * 出典・公式確認の補助導線。
 * 渡す `oliveYoungUrl` はサーバー側で正規化済み（DB値 ?? 公式 domain の productUrl）。
 * クリックは `LoggedShopLink`（product_click_logs）＋ GA `affiliate_click`（shop: oliveyoung）。
 */
export function ProductCardOliveYoungLink({
  oliveYoungUrl,
  goodsNo,
  className = "",
  variant = "card",
  linkLabel = "Olive Youngで見る",
  gaAffiliate,
}: {
  oliveYoungUrl?: string | null;
  goodsNo: string;
  className?: string;
  variant?: "card" | "detail";
  linkLabel?: string;
  /** 未指定時は `category_card`（一覧カード向け） */
  gaAffiliate?: ProductCardOliveYoungGaAffiliate;
}) {
  const href = oliveYoungUrl?.trim();
  if (!href || !isOliveYoungOfficialProductUrl(href)) return null;
  const base = variant === "detail" ? detailClass : cardClass;

  const ga: ProductCardOliveYoungGaAffiliate =
    gaAffiliate ?? { position: "category_card" };

  return (
    <LoggedShopLink
      href={href}
      shop="oliveyoung"
      goodsNo={goodsNo}
      className={`${base} ${className}`.trim()}
      gaAffiliateClick={{
        position: ga.position,
        productName: ga.productName,
        ctaPlacement: ga.ctaPlacement,
        pageType: ga.pageType,
      }}
    >
      {linkLabel}
    </LoggedShopLink>
  );
}
