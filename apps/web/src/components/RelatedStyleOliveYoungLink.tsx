import { getRelatedStyleOyHref } from "@/lib/oliveyoung-official-url";

export { getRelatedStyleOyHref } from "@/lib/oliveyoung-official-url";

const BTN_CLASS =
  "inline-flex rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

/**
 * 商品詳細「関連商品」カードと同じ OY 導線（href 決定は getRelatedStyleOyHref）
 */

export function RelatedStyleOliveYoungLink({
  productUrl,
  className = "",
  fullWidth = false,
  label = "Olive Young で見る",
}: {
  productUrl: string | null | undefined;
  className?: string;
  /** ランキング・トップの縦並び CTA 用 */
  fullWidth?: boolean;
  label?: string;
}) {
  const href = getRelatedStyleOyHref(productUrl);
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
