/**
 * 公開面 `imagePolicy`（resolveProductImageForDisplay）の件数集計。
 */

import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import {
  resolveProductImageForDisplay,
  type PublicImageDisplayPolicy,
} from "@/lib/getProductImage";
import type { ProductImageFields } from "@/lib/product-display-image-resolve";

export type ImagePolicyCounts = Record<PublicImageDisplayPolicy, number>;

export function emptyImagePolicyCounts(): ImagePolicyCounts {
  return {
    safe_person_free: 0,
    unsafe_person_possible: 0,
    mall_image: 0,
    fallback_no_image: 0,
  };
}

export function tallyImagePolicyForProducts(
  products: Array<ProductImageFields & { goodsNo?: string }>
): ImagePolicyCounts {
  const c = emptyImagePolicyCounts();
  for (const p of products) {
    const plain = serializeProductImageFieldsForClient(p);
    const pipe = resolveProductImageForDisplay(plain, {
      goodsNo: p.goodsNo,
    });
    c[pipe.imagePolicy] += 1;
  }
  return c;
}

export function formatImagePolicyCountsLine(c: ImagePolicyCounts): string {
  const parts = (
    [
      "safe_person_free",
      "unsafe_person_possible",
      "mall_image",
      "fallback_no_image",
    ] as const
  ).map((k) => `${k}=${c[k]}`);
  return parts.join("  ");
}
