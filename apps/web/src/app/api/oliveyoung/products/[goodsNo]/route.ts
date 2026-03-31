/**
 * Olive Young 商品1件取得 API（oliveyoung_products_public）
 * GET /api/oliveyoung/products/[goodsNo]
 */
import { NextResponse } from "next/server";
import {
  getOliveYoungProductByGoodsNo,
  resolveProductDisplayImage,
  getEffectiveAffiliateUrls,
  type ProductDisplayImageSource,
} from "@/lib/oliveyoung-products";

export type OliveYoungProductApiResponse = {
  goodsNo: string;
  name: string;
  nameJa?: string | null;
  summaryJa?: string | null;
  brand: string;
  productUrl: string;
  /** Amazon / 楽天 / Qoo10 由来（任意） */
  amazonImage?: string | null;
  rakutenImage?: string | null;
  qoo10Image?: string | null;
  amazonUrl?: string | null;
  rakutenUrl?: string | null;
  qoo10Url?: string | null;
  imageUrl: string;
  thumbnailUrl: string;
  safeImageUrl?: string | null;
  hasSafeProductImage?: boolean | null;
  imageAnalysis?: unknown;
  /** 表示用（OY fallback・プレースホルダー含む） */
  displayImageUrl: string;
  displayImageSource: ProductDisplayImageSource;
  /** 「公式画像」バッジ相当（safe_image / 人物なし oy_official_safe のみ true） */
  displayImageShowOfficialBadge: boolean;
  /** CTA用（明示URLまたは検索フォールバック） */
  effectiveAffiliateUrls: {
    amazon: string;
    rakuten: string;
    qoo10: string;
  };
  lastRank: number | null;
  lastSeenRank: number | null;
  lastSeenRunDate: string | null;
  [key: string]: unknown;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ goodsNo: string }> }
) {
  const goodsNo = decodeURIComponent((await context.params).goodsNo ?? "").trim();
  if (!goodsNo) {
    return NextResponse.json(
      { error: "goodsNo required" },
      { status: 400 }
    );
  }

  const product = await getOliveYoungProductByGoodsNo(goodsNo);
  if (!product) {
    return NextResponse.json(
      { error: "not_found", goodsNo },
      { status: 404 }
    );
  }

  const displayResolved = resolveProductDisplayImage(product as any);

  const body: OliveYoungProductApiResponse = {
    goodsNo: product.goodsNo,
    name: product.name,
    nameJa: product.nameJa ?? null,
    summaryJa: product.summaryJa ?? null,
    brand: product.brand,
    productUrl: product.productUrl,
    amazonImage: product.amazonImage ?? null,
    rakutenImage: product.rakutenImage ?? null,
    qoo10Image: product.qoo10Image ?? null,
    amazonUrl: product.amazonUrl ?? null,
    rakutenUrl: product.rakutenUrl ?? null,
    qoo10Url: product.qoo10Url ?? null,
    imageUrl: product.imageUrl,
    thumbnailUrl: product.thumbnailUrl,
    safeImageUrl: product.safeImageUrl ?? null,
    hasSafeProductImage: product.hasSafeProductImage ?? null,
    imageAnalysis: product.imageAnalysis ?? null,
    displayImageUrl: displayResolved.url,
    displayImageSource: displayResolved.source,
    displayImageShowOfficialBadge: displayResolved.showOfficialImageBadge,
    effectiveAffiliateUrls: getEffectiveAffiliateUrls(product),
    lastRank: product.lastRank,
    lastSeenRank: product.lastSeenRank,
    lastSeenRunDate: product.lastSeenRunDate,
  };

  return NextResponse.json(body);
}
