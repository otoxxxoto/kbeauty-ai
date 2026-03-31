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
import {
  imageSrcHostForDebug,
  isOliveYoungCdnUrl,
  isProductImageLoadDebugEnabled,
  normalizeImageDataUrl,
} from "@/lib/image-display-debug";

type Props = {
  product: ProductImageFields;
  /** アクセシビリティ用（画面には出さずラッパーに aria-label で渡す） */
  alt: string;
  /** 外枠（親の画像スロット内で h-full w-full を想定） */
  className?: string;
  /** 一時デバッグ用（IMG_RESOLVE_DEBUG / IMAGE_SOURCE） */
  goodsNo?: string;
};

const isDev = isProductImageLoadDebugEnabled();

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
 *
 * 診断: `data-image-source` / `data-image-host` / `data-image-url`（img に付与）。
 * development のみ onLoad/onError で [PRODUCT_IMAGE_LOAD] を console 出力。
 *
 * バックフィル: 未解析 URL の列挙は `getUnanalyzedImageUrlsPrioritized`（`pnpm report-ranking-unanalyzed-image-urls`、stdout は NDJSON のみ）。
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
  const pipelineRef = useRef(pipeline);
  pipelineRef.current = pipeline;

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

  const dataUrl = normalizeImageDataUrl(displaySrc);
  const dataHost = imageSrcHostForDebug(displaySrc);
  const pipelineUrlNorm = normalizeImageDataUrl(pipeline.url);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      if (!isDev) return;
      const el = e.currentTarget;
      const src = el.currentSrc || el.src;
      // eslint-disable-next-line no-console -- development のみ
      console.log("[PRODUCT_IMAGE_LOAD]", {
        event: "load",
        goodsNo: goodsNo ?? "",
        imageSource: pipelineRef.current.imageSource,
        imagePolicy: pipelineRef.current.imagePolicy,
        displaySource: pipelineRef.current.displaySource,
        srcHost: imageSrcHostForDebug(src),
        displayedUrl: src,
        pipelineUrl: pipelineRef.current.url,
        naturalWidth: el.naturalWidth,
        naturalHeight: el.naturalHeight,
        isOliveYoungCdn: isOliveYoungCdnUrl(src),
      });
    },
    [goodsNo]
  );

  const onError = useCallback(() => {
    const failedUrl = displaySrc;
    const pip = pipelineRef.current;
    if (isDev) {
      // eslint-disable-next-line no-console -- development のみ
      console.warn("[PRODUCT_IMAGE_LOAD]", {
        event: "error",
        goodsNo: goodsNo ?? "",
        imageSource: pip.imageSource,
        imagePolicy: pip.imagePolicy,
        displaySource: pip.displaySource,
        srcHost: imageSrcHostForDebug(failedUrl),
        /** 失敗したリクエスト URL（プレースホルダー切替前） */
        failedUrl: normalizeImageDataUrl(failedUrl) || failedUrl,
        pipelineUrl: pip.url,
        isOliveYoungCdn: isOliveYoungCdnUrl(failedUrl),
        note: "次フレームで OY プレースホルダーへ切替（1回のみ）",
      });
    }
    if (swappedToPlaceholderRef.current) return;
    if (displaySrc === OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH) return;
    swappedToPlaceholderRef.current = true;
    setDisplaySrc(OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH);
  }, [displaySrc, goodsNo]);

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
      imagePolicy: pipeline.imagePolicy,
      usedFallback,
    });
  }, [goodsNo, pipeline.url, pipeline.imageSource, displaySrc]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_IMAGE_SOURCE_DEBUG !== "1") return;
    // eslint-disable-next-line no-console -- 一時デバッグ
    console.log("[IMAGE_SOURCE_DEBUG]", {
      goodsNo: goodsNo ?? "",
      imageSource: pipeline.imageSource,
      imagePolicy: pipeline.imagePolicy,
      displaySource: pipeline.displaySource,
    });
  }, [goodsNo, pipeline.imageSource, pipeline.imagePolicy, pipeline.displaySource]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ONE_PERSON_IMAGE_DEBUG !== "1") return;
    // eslint-disable-next-line no-console -- 一時デバッグ
    console.log("[ONE_PERSON_IMAGE_DEBUG]", {
      goodsNo: goodsNo ?? "",
      chosenDisplayUrl: displaySrc,
      displaySource: pipeline.displaySource,
      imageSource: pipeline.imageSource,
      imagePolicy: pipeline.imagePolicy,
      safeImageUrl: plain.safeImageUrl ?? null,
      hasSafeProductImage: plain.hasSafeProductImage === true,
      matchedAnalysisContainsPerson: matchedAnalysis?.containsPerson ?? null,
    });
  }, [
    goodsNo,
    displaySrc,
    pipeline.displaySource,
    pipeline.imageSource,
    pipeline.imagePolicy,
    plain.safeImageUrl,
    plain.hasSafeProductImage,
    matchedAnalysis?.containsPerson,
  ]);

  const devOpenHref =
    isDev && /^https?:\/\//i.test(dataUrl) ? dataUrl : undefined;

  return (
    <div
      role="img"
      aria-label={alt}
      data-image-source={pipeline.imageSource}
      data-image-policy={isDev ? pipeline.imagePolicy : undefined}
      data-image-pipeline-url={pipelineUrlNorm || undefined}
      data-image-display-url={dataUrl || undefined}
      data-image-display-host={dataHost || undefined}
      title={
        isDev
          ? `${pipeline.imageSource} | ${truncateForTitle(pipeline.url)}`
          : undefined
      }
      className={`relative flex h-full w-full min-h-0 items-center justify-center ${className}`}
    >
      {devOpenHref && !showingPlaceholder ? (
        <a
          href={devOpenHref}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-1 top-1 z-20 rounded bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 shadow-sm ring-1 ring-zinc-200 hover:bg-blue-50"
          title="画像URLを新規タブで開く（development のみ表示）"
          onClick={(ev) => ev.stopPropagation()}
        >
          開く
        </a>
      ) : null}
      {/* 薄い背景＋内側リングで object-contain の余白を把握しやすく（小さいサムネでも「枠だけ」に見えにくくする） */}
      <div className="flex h-full w-full min-h-0 items-center justify-center overflow-hidden rounded-[inherit] bg-gradient-to-b from-zinc-100 to-zinc-200/80 ring-1 ring-inset ring-zinc-200/70">
        {/* eslint-disable-next-line @next/next/no-img-element -- 外部 CDN 動的 URL */}
        <img
          src={displaySrc}
          alt=""
          decoding="async"
          onLoad={handleLoad}
          onError={onError}
          data-image-source={pipeline.imageSource}
          data-image-policy={isDev ? pipeline.imagePolicy : undefined}
          data-image-host={dataHost || undefined}
          data-image-url={dataUrl || undefined}
          data-image-pipeline-url={pipelineUrlNorm || undefined}
          className="h-full w-full object-contain object-center"
        />
      </div>
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

function truncateForTitle(s: string, max = 120): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
