/**
 * Web 側 oliveyoung-display.ts の isUnsafeNameJa と同一判定（apps/web と同期すること）
 * 低品質 nameJa の再翻訳対象判定に使用
 */

import { inferCategoryJaFromKoreanRawName, pickBrandDisplayLine } from "./nameJaCategoryFromRaw";

export const PRODUCT_TITLE_PENDING_JA = "商品名準備中";

/** 安全とみなす最小文字数（Unicode コードポイント単位） */
export const MIN_SAFE_NAMEJA_GRAPHEMES = 4;

/** 文中に紛れ込む goodsNo（A + 10桁以上） */
export const GOODS_NO_INLINE = /A\d{10,}/;

export type NameJaUnsafeContext = {
  brand?: string | null;
  brandJa?: string | null;
};

export type UnsafeNameJaReason =
  | "empty"
  | "unknown_token"
  | "forbidden_word"
  | "weak_generic_only"
  | "contains_goods_no"
  | "pending_placeholder"
  | "too_short";

function nameJaGraphemeCount(t: string): number {
  return [...t].length;
}

/** 生成結果全体がセラム/クリーム/マスク の単語のみ */
export function isWeakGenericStandaloneCategoryJa(t: string): boolean {
  const compact = t.trim().replace(/\s+/g, "");
  return compact === "セラム" || compact === "クリーム" || compact === "マスク";
}

/** 禁止語（部分一致）※ pending は explain 順序で先に除外 */
export function containsForbiddenNameJaFragments(t: string): boolean {
  if (t.includes("商品")) return true;
  if (t.includes("製品")) return true;
  if (t.includes("美容ケア")) return true;
  if (t.includes("化粧品")) return true;
  return false;
}

export function containsUnknownLikeInNameJa(t: string): boolean {
  return /unknown/i.test(t) || t.includes("アンノウン");
}

/**
 * 保存・表示に使うべきでない nameJa の理由（null は「問題なし」）
 */
export function explainUnsafeNameJa(
  value: string | null | undefined,
  _ctx?: NameJaUnsafeContext
): UnsafeNameJaReason | null {
  if (value == null || typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return "empty";
  if (t === PRODUCT_TITLE_PENDING_JA) return "pending_placeholder";
  if (GOODS_NO_INLINE.test(t)) return "contains_goods_no";
  if (containsUnknownLikeInNameJa(t)) return "unknown_token";
  if (containsForbiddenNameJaFragments(t)) return "forbidden_word";
  if (isWeakGenericStandaloneCategoryJa(t)) return "weak_generic_only";
  if (nameJaGraphemeCount(t) < MIN_SAFE_NAMEJA_GRAPHEMES) return "too_short";
  return null;
}

/**
 * 保存・表示に使うべきでない nameJa
 */
export function isUnsafeNameJa(
  value: string | null | undefined,
  ctx?: NameJaUnsafeContext
): boolean {
  return explainUnsafeNameJa(value, ctx) !== null;
}

/**
 * LLM 不調時のフォールバック: raw から goodsNo 風トークン除去・記号除去・trim
 */
export function fallbackNameJaFromRawName(raw: string): string {
  let s = String(raw ?? "").replace(GOODS_NO_INLINE, " ");
  s = s.replace(/[^\u3040-\u30ff\u4e00-\u9fff\uAC00-\uD7A3a-zA-Z0-9\s・／.\-+×%]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * ブランド行と推定カテゴリの両方が揃うときだけ「ブランド + カテゴリ」を返す（片方だけは返さない）
 */
export function composeFallbackNameJaBrandCategory(
  brand: string,
  brandJa: string | undefined,
  rawName: string
): string {
  const brandLine = pickBrandDisplayLine(brandJa, brand);
  const cat = inferCategoryJaFromKoreanRawName(rawName);
  if (brandLine && cat) return `${brandLine} ${cat}`.trim();
  return "";
}
