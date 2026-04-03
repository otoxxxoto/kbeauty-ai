/**
 * 商品カード・API 向け: OY / Amazon / 楽天 / Qoo10 の遷移 URL を1か所で決定する。
 * - 表示可否は isAvailable のみ（UI はここに表示ロジックを持たない）
 * - OY は DB の productUrl → pickedUrl → oliveYoungUrl のみ（goodsNo からの URL 捏造はしない）
 */
import { getEffectiveAffiliateUrls } from "@/lib/oliveyoung-products";
import { getRelatedStyleOyHref } from "@/lib/oliveyoung-official-url";

export type ShopCtaSlot = { url: string; isAvailable: boolean };

export type ProductShopCtaLinks = {
  oy: ShopCtaSlot;
  amazon: ShopCtaSlot;
  rakuten: ShopCtaSlot;
  qoo10: ShopCtaSlot;
};

function slot(url: string): ShopCtaSlot {
  const u = (url ?? "").trim();
  return { url: u, isAvailable: u.length > 0 };
}

/**
 * OY: 空・API ライク以外を productUrl → pickedUrl → oliveYoungUrl で採用。ダメなら空文字。
 */
export function resolveOyNavigableUrl(input: {
  productUrl?: string | null;
  pickedUrl?: string | null;
  oliveYoungUrl?: string | null;
}): string {
  return (
    getRelatedStyleOyHref(input.productUrl) ||
    getRelatedStyleOyHref(input.pickedUrl) ||
    getRelatedStyleOyHref(input.oliveYoungUrl) ||
    ""
  );
}

export type ProductShopCtaInput = {
  goodsNo: string;
  productUrl?: string | null;
  pickedUrl?: string | null;
  oliveYoungUrl?: string | null;
  amazonUrl?: string | null;
  rakutenUrl?: string | null;
  qoo10Url?: string | null;
  name?: string | null;
  nameJa?: string | null;
};

export function resolveProductShopCtaLinks(p: ProductShopCtaInput): ProductShopCtaLinks {
  const aff = getEffectiveAffiliateUrls({
    amazonUrl: p.amazonUrl ?? undefined,
    rakutenUrl: p.rakutenUrl ?? undefined,
    qoo10Url: p.qoo10Url ?? undefined,
    name: p.name ?? undefined,
    nameJa: p.nameJa ?? undefined,
  });

  const oyRaw = resolveOyNavigableUrl({
    productUrl: p.productUrl,
    pickedUrl: p.pickedUrl,
    oliveYoungUrl: p.oliveYoungUrl,
  });

  return {
    oy: slot(oyRaw),
    amazon: slot(aff.amazon),
    rakuten: slot(aff.rakuten),
    qoo10: slot(aff.qoo10),
  };
}
