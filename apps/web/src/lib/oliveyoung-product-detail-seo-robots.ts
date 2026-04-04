import type { OliveYoungProductDetail } from "@/lib/oliveyoung-products";
import {
  getDisplayProductNameText,
  PRODUCT_TITLE_PENDING_JA,
} from "@/lib/oliveyoung-display";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import {
  resolveProductImageForDisplay,
  isResolvedProductImagePlaceholderUrl,
} from "@/lib/getProductImage";

/**
 * 商品詳細を検索インデックスから外すか（条件は明示的に2種のみ・いずれかで true）。
 *
 * 1. 画面表示と同じ基準で商品名が未整備（「商品名準備中」）
 * 2. 画面と同じ画像解決パイプラインの最終 URL がプレースホルダ相当
 *
 * 説明文の薄さや画像の「枚数」では判定しない。
 */
export function shouldNoindexOliveYoungProductDetail(
  product: OliveYoungProductDetail,
  goodsNo: string
): boolean {
  const displayName = getDisplayProductNameText({
    manualNameJa: product.manualNameJa,
    nameJa: product.nameJa,
    name: product.name,
    brand: product.brand,
    brandJa: product.brandJa,
  });
  if (displayName === PRODUCT_TITLE_PENDING_JA) return true;

  const imageFields = serializeProductImageFieldsForClient(product);
  const resolved = resolveProductImageForDisplay(imageFields, { goodsNo });
  if (isResolvedProductImagePlaceholderUrl(resolved.url)) return true;

  return false;
}
