/**
 * ショップ CTA の GA4 `affiliate_click` 共通送信（フェーズ1）。
 * - 新パラメータ: page_type, cta_placement, goods_no, product_name（任意）
 * - 後方互換: product, location（従来の粗い位置）
 */

export type CtaClickShop = "amazon" | "rakuten" | "qoo10" | "oliveyoung";

/** GA・分析用の画面種別（一覧系と詳細を横断比較） */
export type CtaPageType = "top" | "ranking" | "detail" | "related" | "brand" | "category";

export type EmitCtaClickArgs = {
  shop: CtaClickShop;
  pageType: CtaPageType;
  /** 同一 pageType 内のボタン位置（例: rising_card, primary） */
  ctaPlacement: string;
  goodsNo: string;
  productName?: string;
};

function legacyGaLocation(
  pageType: CtaPageType,
  ctaPlacement: string
): "top" | "detail" | "card" {
  if (pageType === "detail" && ctaPlacement === "primary") return "top";
  if (
    pageType === "detail" &&
    (ctaPlacement === "compare" || ctaPlacement === "bottom")
  ) {
    return "detail";
  }
  return "card";
}

/**
 * GA4 `affiliate_click`。クライアントでのみ送信（SSR では no-op）。
 */
export function emitCtaClick(args: EmitCtaClickArgs): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  const { shop, pageType, ctaPlacement, goodsNo, productName } = args;
  const product = (productName ?? goodsNo).trim() || goodsNo;

  window.gtag("event", "affiliate_click", {
    shop,
    page_type: pageType,
    cta_placement: ctaPlacement,
    goods_no: goodsNo,
    ...(productName != null && String(productName).trim() !== ""
      ? { product_name: String(productName).trim() }
      : {}),
    product,
    location: legacyGaLocation(pageType, ctaPlacement),
  });
}

function inferPageType(position: string, ctxPageType?: string): CtaPageType {
  const c = ctxPageType?.trim();
  if (c === "product_detail") return "detail";
  if (c === "top") return "top";
  if (c === "related") return "related";
  if (c === "brand") return "brand";
  if (c === "ranking") return "ranking";
  if (c === "category") return "category";
  if (c === "detail") return "detail";

  switch (position) {
    case "product_detail_first":
    case "product_detail_middle":
    case "product_detail_bottom":
      return "detail";
    case "category_card":
      return "category";
    case "ranking_card":
      return "ranking";
    case "featured_card":
    case "rising_card":
      return "top";
    case "brand_card":
      return "brand";
    case "related_card":
      return "related";
    default:
      return "detail";
  }
}

function inferCtaPlacement(position: string, ctxCtaPlacement?: string): string {
  const p = ctxCtaPlacement?.trim();
  if (p) return p;
  switch (position) {
    case "product_detail_first":
      return "primary";
    case "product_detail_middle":
      return "compare";
    case "product_detail_bottom":
      return "bottom";
    default:
      return position;
  }
}

/**
 * `logAffiliateClick` 用: position + 任意 ctx から emit 引数へ。
 */
export function resolveCtaEmitParamsFromLegacy(input: {
  position: string;
  ctx?: { pageType?: string; ctaPlacement?: string; productName?: string };
  goodsNo: string;
  shop: CtaClickShop;
  productName?: string;
}): EmitCtaClickArgs {
  const { position, ctx, goodsNo, shop, productName } = input;
  const pageType = inferPageType(position, ctx?.pageType);
  const ctaPlacement = inferCtaPlacement(position, ctx?.ctaPlacement);
  const name = productName ?? ctx?.productName;
  return {
    shop,
    pageType,
    ctaPlacement,
    goodsNo,
    ...(name != null && String(name).trim() !== ""
      ? { productName: String(name).trim() }
      : {}),
  };
}

export type RelatedStyleOliveYoungTrack = {
  goodsNo: string;
  pageType: CtaPageType;
  ctaPlacement: string;
  productName?: string;
};
