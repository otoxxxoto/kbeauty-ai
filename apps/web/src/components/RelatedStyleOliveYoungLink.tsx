import { resolveOyNavigableUrl } from "@/lib/product-shop-cta-links";

export { getRelatedStyleOyHref } from "@/lib/oliveyoung-official-url";
export {
  resolveOyNavigableUrl,
  resolveProductShopCtaLinks,
} from "@/lib/product-shop-cta-links";

const BTN_CLASS =
  "inline-flex rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

/**
 * OY 導線: productUrl → pickedUrl → oliveYoungUrl（いずれも getRelatedStyleOyHref 通過）
 */

export function RelatedStyleOliveYoungLink({
  productUrl,
  pickedUrl,
  oliveYoungUrl,
  className = "",
  fullWidth = false,
  label = "Olive Young で見る",
}: {
  productUrl?: string | null;
  pickedUrl?: string | null;
  oliveYoungUrl?: string | null;
  className?: string;
  /** ランキング・トップの縦並び CTA 用 */
  fullWidth?: boolean;
  label?: string;
}) {
  const href = resolveOyNavigableUrl({
    productUrl,
    pickedUrl,
    oliveYoungUrl,
  });
  if (!href) return null;

  const base = fullWidth
    ? `${BTN_CLASS} w-full items-center justify-center`
    : BTN_CLASS;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${base} ${className}`.trim()}
    >
      {label}
    </a>
  );
}
