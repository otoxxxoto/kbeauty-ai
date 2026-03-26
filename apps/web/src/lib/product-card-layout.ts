/**
 * Olive Young 一覧・ランキング・カテゴリ・ブランド・関連商品カードの共通レイアウト定数
 */

/** 画像スロット: 全カードで同一高さ（枠内は ProductDisplayImage が object-contain） */
export const PRODUCT_CARD_IMAGE_FRAME_CLASS =
  "relative h-44 w-full shrink-0 overflow-hidden rounded-lg bg-zinc-100";

/** カード外枠: グリッドで縦方向に伸ばし、CTA を下端に寄せる */
export const PRODUCT_CARD_ROOT_CLASS =
  "flex h-full min-h-0 w-full flex-col rounded-xl border border-zinc-200 bg-white p-4 transition-colors";

/** 商品情報ブロック（画像の下・CTA の上） */
export const PRODUCT_CARD_INFO_CLASS =
  "mt-3 flex min-h-0 flex-1 flex-col gap-1";

/** モール CTA 等（カード下端に固定） */
export const PRODUCT_CARD_CTA_CLASS =
  "mt-auto flex w-full shrink-0 flex-col gap-3 pt-3";

/** 商品タイトル（カード内） */
export const PRODUCT_CARD_TITLE_CLASS =
  "line-clamp-2 text-sm font-semibold leading-snug text-zinc-900";

/** カテゴリなど長めタイトル用 */
export const PRODUCT_CARD_TITLE_3_CLASS =
  "line-clamp-3 text-sm font-semibold leading-snug text-zinc-900";

/** 一時デバッグ: ページ別にどのカード実装を使っているか */
export function logCardLayoutDebug(page: string, component: string): void {
  if (process.env.NEXT_PUBLIC_CARD_LAYOUT_DEBUG !== "1") return;
  // eslint-disable-next-line no-console
  console.log("[CARD_LAYOUT_DEBUG]", page, component);
}
