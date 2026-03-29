"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  productDisplayImageIsPlaceholder,
  OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH,
  type ProductImageFields,
} from "@/lib/product-display-image-resolve";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import {
  resolveProductImageForDisplay,
  PRODUCT_NO_IMAGE_PATH,
  isResolvedProductImagePlaceholderUrl,
} from "@/lib/getProductImage";

type Props = {
  product: ProductImageFields;
  /** アクセシビリティ用（画面には出さずラッパーに aria-label で渡す） */
  alt: string;
  /** 外枠（親の画像スロット内で h-full w-full を想定） */
  className?: string;
  /** 一時デバッグ用（IMG_RESOLVE_DEBUG / IMAGE_SOURCE） */
  goodsNo?: string;
};

function productImageStableKey(
  p: ProductImageFields,
  goodsNo?: string
): string {
  const ia =
    p.imageAnalysis?.map((e) => `${e.url}\t${e.containsPerson}`).join("\n") ?? "";
  let levelsJson = "";
  try {
    levelsJson = JSON.stringify(p.marketplaceImageMatchLevels ?? {});
  } catch {
    levelsJson = "";
  }
  return [
    goodsNo ?? "",
    p.safeImageUrl ?? "",
    p.amazonImage ?? "",
    p.rakutenImage ?? "",
    p.qoo10Image ?? "",
    p.oliveYoungImageUrl ?? "",
    p.amazonImageUrl ?? "",
    p.rakutenImageUrl ?? "",
    p.qoo10ImageUrl ?? "",
    p.imageUrl ?? "",
    p.thumbnailUrl ?? "",
    (p.imageUrls ?? []).join(","),
    levelsJson,
    ia,
  ].join("\n");
}

function sanitizeInitialSrc(url: string): string {
  const t = (url ?? "").trim();
  if (!t) return OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH;
  // プロトコル相対 URL（//cdn...）は img で有効
  if (t.startsWith("//")) return t;
  if (
    t.startsWith("/") ||
    t.startsWith("http://") ||
    t.startsWith("https://")
  ) {
    return t;
  }
  return OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH;
}

/**
 * 商品画像表示: 枠いっぱいに contain、読み込み失敗時はプレースホルダーへ1回だけ切替。
 * alt テキストの露出・broken icon を避けるため img は alt="" とし、親に aria-label を付与。
 */
export function ProductDisplayImage({
  product,
  alt,
  className = "",
  goodsNo,
}: Props) {
  const plain = useMemo(
    () => serializeProductImageFieldsForClient(product),
    [product]
  );
  const pipeline = useMemo(
    () => resolveProductImageForDisplay(plain, { goodsNo }),
    [plain, goodsNo]
  );
  const stableKey = useMemo(
    () => productImageStableKey(plain, goodsNo),
    [plain, goodsNo]
  );

  const [displaySrc, setDisplaySrc] = useState(() =>
    sanitizeInitialSrc(
      resolveProductImageForDisplay(
        serializeProductImageFieldsForClient(product),
        { goodsNo }
      ).url
    )
  );
  const swappedToPlaceholderRef = useRef(false);

  // stableKey のみ: 親の object 参照が毎レンダー変わっても画像 URL が同じならリセットしない
  useEffect(() => {
    const next = resolveProductImageForDisplay(plain, { goodsNo });
    setDisplaySrc(sanitizeInitialSrc(next.url));
    swappedToPlaceholderRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plain は stableKey と同一レンダーで対応
  }, [stableKey]);

  const showingPlaceholder =
    isResolvedProductImagePlaceholderUrl(displaySrc) ||
    displaySrc === OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH;

  const showBadge = !showingPlaceholder && pipeline.showOfficialImageBadge;
  const matchedAnalysis = plain.imageAnalysis?.find(
    (e) => e.url === pipeline.url
  );

  const onError = useCallback(() => {
    if (swappedToPlaceholderRef.current) return;
    if (displaySrc === OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH) return;
    swappedToPlaceholderRef.current = true;
    setDisplaySrc(OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH);
  }, [displaySrc]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_IMG_RESOLVE_DEBUG !== "1") return;
    const usedFallback =
      displaySrc === OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH ||
      productDisplayImageIsPlaceholder(displaySrc) ||
      displaySrc === PRODUCT_NO_IMAGE_PATH;
    // eslint-disable-next-line no-console -- 一時デバッグ
    console.log("[IMG_RESOLVE_DEBUG]", {
      goodsNo: goodsNo ?? "",
      pipelineUrl: pipeline.url,
      finalDisplayedUrl: displaySrc,
      imageSource: pipeline.imageSource,
      usedFallback,
    });
  }, [goodsNo, pipeline.url, pipeline.imageSource, displaySrc]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_IMAGE_SOURCE_DEBUG !== "1") return;
    // eslint-disable-next-line no-console -- 一時デバッグ
    console.log("[IMAGE_SOURCE_DEBUG]", {
      goodsNo: goodsNo ?? "",
      imageSource: pipeline.imageSource,
      displaySource: pipeline.displaySource,
    });
  }, [goodsNo, pipeline.imageSource, pipeline.displaySource]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ONE_PERSON_IMAGE_DEBUG !== "1") return;
    // eslint-disable-next-line no-console -- 一時デバッグ
    console.log("[ONE_PERSON_IMAGE_DEBUG]", {
      goodsNo: goodsNo ?? "",
      chosenDisplayUrl: displaySrc,
      displaySource: pipeline.displaySource,
      imageSource: pipeline.imageSource,
      safeImageUrl: plain.safeImageUrl ?? null,
      hasSafeProductImage: plain.hasSafeProductImage === true,
      matchedAnalysisContainsPerson: matchedAnalysis?.containsPerson ?? null,
    });
  }, [
    goodsNo,
    displaySrc,
    pipeline.displaySource,
    pipeline.imageSource,
    plain.safeImageUrl,
    plain.hasSafeProductImage,
    matchedAnalysis?.containsPerson,
  ]);

  return (
    <div
      role="img"
      aria-label={alt}
      data-image-source={pipeline.imageSource}
      className={`relative flex h-full w-full min-h-0 items-center justify-center ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 外部 CDN 動的 URL */}
      <img
        src={displaySrc}
        alt=""
        decoding="async"
        onError={onError}
        className="h-full w-full object-contain object-center"
      />
      {showBadge ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-t from-zinc-900/15 via-transparent to-transparent"
            aria-hidden
          />
          <span className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-zinc-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-[2px]">
            公式画像
          </span>
        </>
      ) : null}
    </div>
  );
}
