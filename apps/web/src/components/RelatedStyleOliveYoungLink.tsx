import { resolveOyNavigableUrl } from "@/lib/product-shop-cta-links";
import { RelatedStyleOliveYoungLinkClient } from "@/components/RelatedStyleOliveYoungLinkClient";
import type { RelatedStyleOliveYoungTrack } from "@/lib/cta-click-analytics";

/**
 * OY 導線: productUrl → pickedUrl → oliveYoungUrl（いずれも getRelatedStyleOyHref 通過）
 * href は Server で解決し、計測は Client 子に委譲（Firestore 依存をクライアントに持ち込まない）
 */
export function RelatedStyleOliveYoungLink({
  productUrl,
  pickedUrl,
  oliveYoungUrl,
  className = "",
  fullWidth = false,
  label = "Olive Young で見る",
  track,
}: {
  productUrl?: string | null;
  pickedUrl?: string | null;
  oliveYoungUrl?: string | null;
  className?: string;
  fullWidth?: boolean;
  label?: string;
  track?: RelatedStyleOliveYoungTrack;
}) {
  const href = resolveOyNavigableUrl({
    productUrl,
    pickedUrl,
    oliveYoungUrl,
  });
  if (!href) return null;

  return (
    <RelatedStyleOliveYoungLinkClient
      href={href}
      className={className}
      fullWidth={fullWidth}
      label={label}
      track={track}
    />
  );
}
