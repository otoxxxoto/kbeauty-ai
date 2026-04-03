import { resolveOyHrefForListingItem } from "@/lib/oliveyoung-official-url";

export {
  getRelatedStyleOyHref,
  resolveOyHrefForListingItem,
} from "@/lib/oliveyoung-official-url";

const BTN_CLASS =
  "inline-flex rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

/**
 * OY 導線: productUrl → pickedUrl → buildOliveYoungProductUrl(goodsNo)
 */

export function RelatedStyleOliveYoungLink({
  goodsNo,
  productUrl,
  pickedUrl,
  className = "",
  fullWidth = false,
  label = "Olive Young で見る",
}: {
  goodsNo: string;
  productUrl?: string | null;
  pickedUrl?: string | null;
  className?: string;
  /** ランキング・トップの縦並び CTA 用 */
  fullWidth?: boolean;
  label?: string;
}) {
  const href = resolveOyHrefForListingItem({
    goodsNo,
    productUrl,
    pickedUrl,
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
