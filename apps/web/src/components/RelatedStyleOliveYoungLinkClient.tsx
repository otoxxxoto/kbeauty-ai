"use client";

import {
  emitCtaClick,
  type RelatedStyleOliveYoungTrack,
} from "@/lib/cta-click-analytics";

const BTN_CLASS =
  "inline-flex rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

/**
 * 一覧系 OY ボタン（href は Server 側で解決済み）。クリックで GA のみ。
 */
export function RelatedStyleOliveYoungLinkClient({
  href,
  className = "",
  fullWidth = false,
  label = "Olive Young で見る",
  track,
}: {
  href: string;
  className?: string;
  fullWidth?: boolean;
  label?: string;
  track?: RelatedStyleOliveYoungTrack;
}) {
  const base = fullWidth
    ? `${BTN_CLASS} w-full items-center justify-center`
    : BTN_CLASS;

  const onClick = () => {
    if (!track) return;
    emitCtaClick({
      shop: "oliveyoung",
      pageType: track.pageType,
      ctaPlacement: track.ctaPlacement,
      goodsNo: track.goodsNo,
      ...(track.productName != null && track.productName.trim() !== ""
        ? { productName: track.productName.trim() }
        : {}),
    });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${base} ${className}`.trim()}
      onClick={onClick}
    >
      {label}
    </a>
  );
}
