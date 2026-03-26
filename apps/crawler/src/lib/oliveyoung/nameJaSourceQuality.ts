/**
 * nameJa LLM 翻訳前のソース品質（入力不足なら LLM を回さない）
 */

import { inferCategoryJaFromKoreanRawName, pickBrandDisplayLine } from "./nameJaCategoryFromRaw";

const HANGUL = /[\uAC00-\uD7AF]/g;

export type NameJaTranslationSourceInput = {
  name: string;
  brand?: string | null;
  brandJa?: string | null;
  reviewSummaryJa?: string | null;
  ingredientSummaryJa?: string | null;
  summaryJa?: string | null;
};

/** 全文が goodsNo 単体（A + 10桁以上）のみ */
export function looksLikeOnlyOliveYoungGoodsNoId(name: string): boolean {
  const t = name.trim();
  return /^A\d{10,}$/.test(t);
}

function stripGoodsNoTokens(s: string): string {
  return s.replace(/A\d{10,}/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * raw name が goodsNo だけではなく、翻訳に使える本文がある
 */
export function hasSafeRawProductName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (looksLikeOnlyOliveYoungGoodsNoId(t)) return false;
  const rest = stripGoodsNoTokens(t).replace(/[\s\-_./|｜・]+/g, "").trim();
  if (!rest) return false;
  const hangul = (t.match(HANGUL) || []).length;
  if (hangul >= 2) return true;
  if (/[ぁ-んァ-ヶ一-龥々〆ヵヶ]/.test(rest)) return true;
  if (/[a-zA-Z]{3,}/.test(rest)) return true;
  return false;
}

/** 韓国語として最低限の情報量がある（ハングルが十分） */
export function hasMeaningfulKoreanProductName(name: string): boolean {
  const t = name.trim();
  return (t.match(HANGUL) || []).length >= 3;
}

export function hasSafeBrandForNameJa(brand?: string | null, brandJa?: string | null): boolean {
  const b = pickBrandDisplayLine(brandJa, brand).trim();
  if (!b) return false;
  if (/^unknown$/i.test(b)) return false;
  if (/^A\d{10,}$/.test(b)) return false;
  return true;
}

/**
 * 要約・本文に含まれる日本語カテゴリ語（長い語を先に）
 */
const JA_TEXT_CATEGORY_NEEDLES: [string, string][] = [
  ["クッションファンデ", "クッションファンデ"],
  ["リップティント", "リップティント"],
  ["グロスティント", "グロスティント"],
  ["ウォーターティント", "ウォーターティント"],
  ["シートマスク", "シートマスク"],
  ["トナーパッド", "トナーパッド"],
  ["洗顔フォーム", "洗顔フォーム"],
  ["フェイスパウダー", "フェイスパウダー"],
  ["化粧下地", "化粧下地"],
  ["アイシャドウ", "アイシャドウ"],
  ["コンシーラー", "コンシーラー"],
  ["日焼け止め", "日焼け止め"],
  ["ハンドクリーム", "ハンドクリーム"],
  ["ボディケア", "ボディケア"],
  ["クレンジング", "クレンジング"],
  ["トリートメント", "トリートメント"],
  ["シャンプー", "シャンプー"],
  ["美容液", "美容液"],
  ["エッセンス", "エッセンス"],
  ["アンプル", "アンプル"],
  ["ローション", "ローション"],
  ["トナー", "トナー"],
  ["ミスト", "ミスト"],
  ["オイル", "オイル"],
  ["バーム", "バーム"],
  ["ティント", "ティント"],
  ["リップ", "リップ"],
  ["チーク", "チーク"],
  ["マスカラ", "マスカラ"],
  ["セラム", "セラム"],
  ["クリーム", "クリーム"],
  ["マスク", "マスク"],
];

export function inferCategoryJaFromSummaryBlob(blob: string): string | null {
  const s = String(blob ?? "").trim();
  if (!s) return null;
  const fromKo = inferCategoryJaFromKoreanRawName(s);
  if (fromKo) return fromKo;
  for (const [needle, ja] of JA_TEXT_CATEGORY_NEEDLES) {
    if (s.includes(needle)) return ja;
  }
  return null;
}

export function joinSummaryFieldsForCategory(p: {
  reviewSummaryJa?: string | null;
  ingredientSummaryJa?: string | null;
  summaryJa?: string | null;
}): string {
  return [p.reviewSummaryJa, p.ingredientSummaryJa, p.summaryJa]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim())
    .join(" ");
}

export type NameJaSourceQualityDetail = {
  translatable: boolean;
  sourceQuality: "sufficient" | "insufficient";
  hasSafeRawName: boolean;
  hasBrand: boolean;
  hasCategoryHint: boolean;
  hasMeaningfulKo: boolean;
  categoryFromName: boolean;
  categoryFromSummaries: boolean;
};

export function evaluateNameJaSourceQuality(
  input: NameJaTranslationSourceInput
): NameJaSourceQualityDetail {
  const name = String(input.name ?? "").trim();
  const hasSafeRawName = hasSafeRawProductName(name);
  const hasMeaningfulKo = hasMeaningfulKoreanProductName(name);
  const hasBrand = hasSafeBrandForNameJa(input.brand, input.brandJa);
  const categoryFromName = inferCategoryJaFromKoreanRawName(name) != null;
  const summaryBlob = joinSummaryFieldsForCategory(input);
  const categoryFromSummaries =
    !categoryFromName && summaryBlob.length > 0 && inferCategoryJaFromSummaryBlob(summaryBlob) != null;
  const hasCategoryHint = categoryFromName || categoryFromSummaries;

  const translatable =
    hasSafeRawName || hasMeaningfulKo || (hasBrand && hasCategoryHint);

  return {
    translatable,
    sourceQuality: translatable ? "sufficient" : "insufficient",
    hasSafeRawName,
    hasBrand,
    hasCategoryHint,
    hasMeaningfulKo,
    categoryFromName,
    categoryFromSummaries,
  };
}

export function hasTranslatableSourceForNameJa(input: NameJaTranslationSourceInput): boolean {
  return evaluateNameJaSourceQuality(input).translatable;
}
