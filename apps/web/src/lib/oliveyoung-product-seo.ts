/**
 * 商品詳細ページの title / meta description 生成（収益・検索寄せ）
 * - 韓国語そのまま・goodsNo 形式・無意味長文を避ける
 * - ブランドは先頭一致で繰り返し除去（スペーストークンに依存しない）
 */
import {
  getDisplayBrand,
  type OliveYoungProductDetail,
} from "@/lib/oliveyoung-products";
import {
  isUnsafeNameJa,
  looksLikeOliveYoungGoodsNo,
} from "@/lib/oliveyoung-display";

const HANGUL = /[\uAC00-\uD7AF]/;
const GOODS_NO_INLINE = /A\d{10,}/g;
/** タイトル全体 40 文字以内を目安（接尾辞＋{ブランド 用途}） */
const TITLE_MAX = 40;
const MAX_DESC_LEN = 155;
const FALLBACK_CATEGORY = "韓国人気コスメ";

/** デバッグ用（本番相当では console に出るため、解消後に削除推奨） */
const SEO_DEBUG_GOODS_NO = "A000000141338";

/** 検索寄せタイトル接尾辞（口コミ・効果・最安/価格を含む） */
const TITLE_SUFFIX = "の口コミ・効果は？最安・使い方まとめ";

/** 先頭ブランド除去後の余分な区切り */
const LEADING_SEPARATORS_AFTER_BRAND = /^[\s\u3000・｜|\-/:：＼/／]+/u;

/** 韓国語比率が高い場合はメタに使わない（日本語SEO向け） */
function isMostlyHangul(s: string, threshold = 0.32): boolean {
  const chars = [...s.replace(/\s/g, "")];
  if (chars.length === 0) return false;
  let h = 0;
  for (const c of chars) {
    if (HANGUL.test(c)) h++;
  }
  return h / chars.length >= threshold;
}

function stripInlineGoodsNo(s: string): string {
  return s.replace(GOODS_NO_INLINE, " ").replace(/\s+/g, " ").trim();
}

/** trim・NFKC・全角スペース等を半角スペース化・連続空白を1つ */
export function normalizeText(value: string): string {
  if (value == null || typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[\u3000\u00A0\u2000-\u200B\uFEFF]/g, " ")
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ブランド比較専用: ハイフン類を長音「ー」に寄せる（表示文字列は変えない） */
function normalizeForBrandComparison(value: string): string {
  return normalizeText(value).replace(/[‐‑‒–—―−－-]/g, "ー").trim();
}

function normalizeWhitespace(s: string): string {
  return normalizeText(s);
}

function isWeakNameJa(
  ja: string,
  ctx?: { brand?: string; brandJa?: string }
): boolean {
  const t = ja.trim();
  if (!t) return true;
  if (isUnsafeNameJa(t, ctx)) return true;
  if (isMostlyHangul(t)) return true;
  return false;
}

function isUsableName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (looksLikeOliveYoungGoodsNo(t)) return false;
  if (t === "（商品名なし）") return false;
  if (isMostlyHangul(t)) return false;
  return true;
}

/**
 * nameJa が弱い場合は name、だめならフォールバック文言（他用途向けに維持）
 */
export function pickSeoNameBase(product: {
  name?: string;
  nameJa?: string;
  brand?: string;
  brandJa?: string;
}): string {
  const ja = product.nameJa?.trim() ?? "";
  const nm = product.name?.trim() ?? "";
  const brandCtx = { brand: product.brand, brandJa: product.brandJa };
  if (ja && !isWeakNameJa(ja, brandCtx)) {
    return stripInlineGoodsNo(normalizeText(ja));
  }
  if (isUsableName(nm)) {
    return stripInlineGoodsNo(normalizeText(nm));
  }
  return FALLBACK_CATEGORY;
}

/** nameJa からカテゴリを抽出（スクラブ・ローション・ミスト・トナー・クリーム） */
const CATEGORY_KEYWORDS = [
  { re: /スクラブ/u, label: "スクラブ" },
  { re: /ローション/u, label: "ローション" },
  { re: /ミスト/u, label: "ミスト" },
  { re: /トナー/u, label: "トナー" },
  { re: /クリーム/u, label: "クリーム" },
] as const;

export function extractCategoryFromNameJa(nameJa: string): string {
  if (!nameJa?.trim() || isMostlyHangul(nameJa)) return FALLBACK_CATEGORY;
  const t = stripInlineGoodsNo(normalizeText(nameJa));
  for (const { re, label } of CATEGORY_KEYWORDS) {
    if (re.test(t)) return label;
  }
  return FALLBACK_CATEGORY;
}

/** 効果ワード（簡易・固定候補から1つ選ぶ） */
const BENEFIT_KEYWORDS: { re: RegExp; label: string }[] = [
  { re: /スカルプ|頭皮|ヘア/u, label: "頭皮クレンジング" },
  { re: /保湿|うるおい|ヒアルロン/u, label: "高保湿" },
  { re: /ニキビ|アクネ|皮脂/u, label: "ニキビケア" },
  { re: /敏感|低刺激|無添加/u, label: "敏感肌対応" },
  { re: /毛穴|角質|クレンジング/u, label: "毛穴ケア" },
  { re: /美白|ビタミンC|ブライトニング/u, label: "美白" },
  { re: /エイジング|アンチエイジ/u, label: "エイジングケア" },
  { re: /日焼け|UV|SPF|サンケア/u, label: "UVケア" },
];

export function pickBenefit(nameBase: string): string {
  if (!nameBase || nameBase === FALLBACK_CATEGORY) return "スキンケア";
  const t = normalizeWhitespace(nameBase);
  for (const { re, label } of BENEFIT_KEYWORDS) {
    if (re.test(t)) return label;
  }
  return "スキンケア";
}

/**
 * rawName 先頭に brandCandidates のいずれかが付く限り、
 * prefix を剥がし、その後の区切り文字も除去（while で繰り返し）。
 * 候補は長い順（brandJa を先に確実に剥がす）。
 */
export function stripLeadingBrand(
  rawName: string,
  brandCandidates: (string | null | undefined)[]
): string {
  let resultOriginal = normalizeText(rawName);
  let resultCompare = normalizeForBrandComparison(resultOriginal);
  const candidates = brandCandidates
    .map((c) => {
      const original = normalizeText(String(c ?? ""));
      return {
        original,
        compare: normalizeForBrandComparison(original),
      };
    })
    .filter((c) => c.original.length > 0)
    .sort((a, b) => b.original.length - a.original.length);

  if (!resultOriginal || candidates.length === 0) return resultOriginal;

  let guard = 0;
  let changed = true;
  while (changed && guard++ < 40) {
    changed = false;
    for (const cand of candidates) {
      if (resultCompare.startsWith(cand.compare)) {
        resultOriginal = resultOriginal.slice(cand.original.length);
        resultOriginal = resultOriginal
          .replace(LEADING_SEPARATORS_AFTER_BRAND, "")
          .trim();
        resultOriginal = normalizeText(resultOriginal);
        resultCompare = normalizeForBrandComparison(resultOriginal);
        changed = true;
        break;
      }
    }
  }
  return resultOriginal;
}

function forceRemoveBrandFromName(name: string, brand: string): string {
  if (!brand) return normalizeText(name);

  let result = normalizeText(name);
  const b = normalizeText(brand);
  const cb = normalizeForBrandComparison(b);

  let guard = 0;
  while (
    normalizeForBrandComparison(result).startsWith(cb) &&
    guard < 40
  ) {
    result = result.slice(b.length);
    result = result.replace(/^[\s・\-｜:：/]+/, "");
    guard += 1;
  }

  return result.trim();
}

function forceDedupBrandAtTitleStart(title: string, brand: string): string {
  if (!brand) return normalizeText(title);

  let result = normalizeText(title);
  const b = normalizeText(brand);
  const cb = normalizeForBrandComparison(b);

  let guard = 0;
  while (guard < 40) {
    const compareTitle = normalizeForBrandComparison(result);
    const withSpace = `${cb} ${cb}`;
    const noSpace = `${cb}${cb}`;

    if (!compareTitle.startsWith(withSpace) && !compareTitle.startsWith(noSpace)) {
      break;
    }

    let tail = result;
    if (tail.startsWith(b)) {
      tail = tail.slice(b.length);
    }
    tail = tail.replace(LEADING_SEPARATORS_AFTER_BRAND, "").trim();
    tail = forceRemoveBrandFromName(tail, brand);
    result = normalizeText(`${b} ${tail}`);
    guard += 1;
  }

  return result.trim();
}

/** SEO用: 古い角質 → 頭皮 or スカルプ（文脈で選択） */
function applyUseWordKeywordReplacements(useWord: string): string {
  if (!useWord.includes("古い角質")) return useWord;
  const preferScalp = /スカルプ|頭皮/u.test(useWord);
  return useWord.replace(/古い角質/gu, () => (preferScalp ? "スカルプ" : "頭皮"));
}

/** nameJa || name をそのまま（SEO 用 raw）。可能なら goodsNo 断片を除去 */
function getSeoRawName(product: OliveYoungProductDetail): string {
  return stripInlineGoodsNo(normalizeText(pickSeoNameBase(product)));
}

function clampTitleNamePrefix(prefix: string, maxTotal: number): string {
  const suffixLen = TITLE_SUFFIX.length;
  let maxPrefix = maxTotal - suffixLen;
  if (maxPrefix < 6) maxPrefix = 6;
  let p = normalizeText(prefix);
  if (p.length <= maxPrefix) return p;
  p = `${p.slice(0, Math.max(1, maxPrefix - 1)).trim()}…`;
  return p;
}

function clampMainLabel(mainLabel: string, maxLen = 22): string {
  const t = normalizeText(mainLabel);
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(1, maxLen - 1)).trim()}…`;
}

type CtrTemplate = "classic" | "problem" | "compare";
type TitlePattern = "A" | "B" | "C";

function pickBenefitLabel(cleanName: string): string {
  const t = normalizeText(cleanName);
  if (/頭皮|スカルプ/u.test(t)) return "頭皮ケア";
  if (/皮脂/u.test(t)) return "皮脂ケア";
  if (/角質/u.test(t)) return "角質ケア";
  if (/保湿|セラミド|うるおい/u.test(t)) return "高保湿";
  if (/敏感|低刺激/u.test(t)) return "敏感肌ケア";
  if (/乾燥/u.test(t)) return "乾燥対策";
  if (/ボディ/u.test(t)) return "ボディケア";
  if (/肌荒れ/u.test(t)) return "肌荒れケア";
  if (/ニキビ|アクネ/u.test(t)) return "ニキビ対策";
  if (/クッション|ベース/u.test(t)) return "崩れにくさ";
  if (/毛穴/u.test(t)) return "毛穴カバー";
  if (/ツヤ/u.test(t)) return "ツヤ肌";
  return pickBenefit(t);
}

function pickCtrTemplate(cleanName: string, benefitLabel: string): CtrTemplate {
  const t = normalizeText(cleanName);
  if (
    /頭皮|スカルプ|保湿|敏感|乾燥|肌荒れ|ニキビ/u.test(t) ||
    /頭皮|保湿|敏感|肌荒れ|ニキビ/u.test(benefitLabel)
  ) {
    return "problem";
  }
  if (/比較|セット|企画|増量|限定|最安|価格/u.test(t)) {
    return "compare";
  }
  return "classic";
}

function renderTitleByTemplate(
  mainLabel: string,
  benefitLabel: string,
  selectedTemplate: CtrTemplate
): string {
  if (selectedTemplate === "problem") {
    return `${mainLabel}は${benefitLabel}にいい？口コミ・最安まとめ`;
  }
  if (selectedTemplate === "compare") {
    return `${mainLabel}の口コミは？価格比較・最安情報まとめ`;
  }
  return `${mainLabel}の口コミ・効果は？最安・使い方まとめ`;
}

function buildCtrDescription(
  mainLabel: string,
  benefitLabel: string,
  selectedTemplate: CtrTemplate
): string {
  if (selectedTemplate === "problem") {
    return normalizeText(
      `${mainLabel}は${benefitLabel}が気になる方に人気。口コミ・効果・価格比較をまとめています。`
    );
  }
  return normalizeText(
    `${mainLabel}の口コミや効果、使い方をまとめています。最安価格や在庫情報もチェックできます。`
  );
}

function pickTitlePattern(_product: OliveYoungProductDetail): TitlePattern {
  const source = String(_product.goodsNo || "");
  let sum = 0;
  for (const ch of source) sum += ch.charCodeAt(0);
  const idx = sum % 3;
  return idx === 0 ? "A" : idx === 1 ? "B" : "C";
}

export type ProductSeoMeta = {
  title: string;
  description: string;
  selectedPattern: TitlePattern;
};

/**
 * 検索流入向け title / description
 * titlePrefix = {brandDisplay} + " " + cleanName（cleanName は先頭ブランド繰り返し除去）
 */
export function buildProductPageSeoMeta(
  product: OliveYoungProductDetail
): ProductSeoMeta {
  const goodsNo = product.goodsNo;
  const brand = product.brand ?? "";
  const brandJa = product.brandJa ?? "";
  const brandFromDisplay = getDisplayBrand(product);
  const brandDisplay =
    brandFromDisplay && !isMostlyHangul(brandFromDisplay)
      ? stripInlineGoodsNo(normalizeText(brandFromDisplay))
      : "";

  const rawName = getSeoRawName(product);
  const strippedOnce = stripLeadingBrand(rawName, [brandJa, brand]);
  const removedBrandJa = forceRemoveBrandFromName(strippedOnce, brandJa || "");
  const removedBrand = forceRemoveBrandFromName(strippedOnce, brand || "");
  let cleanName = strippedOnce;
  cleanName = forceRemoveBrandFromName(cleanName, brandJa || "");
  cleanName = forceRemoveBrandFromName(cleanName, brand || "");
  cleanName = applyUseWordKeywordReplacements(cleanName);
  cleanName = normalizeText(cleanName);
  if (!cleanName) {
    cleanName = FALLBACK_CATEGORY;
  }

  const titlePrefix =
    brandDisplay.length > 0
      ? normalizeText(`${brandDisplay} ${cleanName}`)
      : cleanName;

  const benefitLabel = pickBenefitLabel(cleanName);
  const selectedTemplate = pickCtrTemplate(cleanName, benefitLabel);
  const titlePattern = pickTitlePattern(product);

  let mainLabel = titlePrefix;
  mainLabel = clampMainLabel(mainLabel, 22);

  const titlePrefixBeforeClamp = mainLabel;
  const titleA = `${mainLabel}の口コミ・効果は？最安・使い方まとめ`;
  const titleB = `${mainLabel}は${benefitLabel}にいい？口コミ・最安まとめ`;
  const titleC = `${mainLabel}は本当に${benefitLabel}できる？口コミ・最安まとめ`;
  let finalTitleBeforeDedup: string;
  switch (titlePattern) {
    case "A":
      finalTitleBeforeDedup = titleA;
      break;
    case "B":
      finalTitleBeforeDedup = titleB;
      break;
    case "C":
      finalTitleBeforeDedup = titleC;
      break;
    default:
      finalTitleBeforeDedup = titleA;
      break;
  }
  const finalTitleAfterDedup = forceDedupBrandAtTitleStart(
    finalTitleBeforeDedup,
    brandDisplay
  );

  let title = finalTitleAfterDedup;
  if (title.length > TITLE_MAX) {
    const clampedMain = clampTitleNamePrefix(mainLabel, TITLE_MAX);
    const rebuilt = renderTitleByTemplate(
      clampedMain,
      benefitLabel,
      selectedTemplate
    );
    const rebuiltA = `${clampedMain}の口コミ・効果は？最安・使い方まとめ`;
    const rebuiltB = `${clampedMain}は${benefitLabel}にいい？口コミ・最安まとめ`;
    const rebuiltC = `${clampedMain}は本当に${benefitLabel}できる？口コミ・最安まとめ`;
    const rebuiltByPattern =
      titlePattern === "A" ? rebuiltA : titlePattern === "B" ? rebuiltB : rebuiltC;
    title = forceDedupBrandAtTitleStart(rebuiltByPattern, brandDisplay);
  }
  const titleAfterClamp = title;

  if (goodsNo === SEO_DEBUG_GOODS_NO) {
    // eslint-disable-next-line no-console -- 一時デバッグ（A000000141338）
    console.log("[SEO TRACE 1]", {
      goodsNo,
      brand,
      brandJa,
      brandDisplay,
      rawName,
      cleanName,
    });
    // eslint-disable-next-line no-console -- 一時デバッグ（A000000141338）
    console.log("[SEO TRACE 2]", {
      strippedOnce,
      removedBrandJa,
      removedBrand,
    });
    // eslint-disable-next-line no-console -- 一時デバッグ（A000000141338）
    console.log("[SEO TRACE 3]", {
      titlePrefixBeforeClamp,
      titleAfterClamp,
      finalTitleBeforeDedup,
      finalTitleAfterDedup,
    });
    // eslint-disable-next-line no-console -- 一時デバッグ（A000000141338）
    console.log("[SEO CHARCODES]", {
      brandDisplay,
      rawNameStart: rawName.slice(0, 30),
      brandDisplayChars: Array.from(brandDisplay || "").map((c) => c.charCodeAt(0)),
      rawNameStartChars: Array.from((rawName || "").slice(0, 20)).map((c) => c.charCodeAt(0)),
    });
    // eslint-disable-next-line no-console -- 一時デバッグ（A000000141338）
    console.log("[SEO FINAL TITLE]", title);
    // eslint-disable-next-line no-console -- 一時デバッグ（A000000141338）
    console.log("[SEO TRACE FIXED]", {
      goodsNo,
      brand,
      brandJa,
      brandDisplay,
      rawName,
      cleanName,
      finalTitle: title,
      normalizedBrandDisplay: normalizeForBrandComparison(brandDisplay || ""),
      normalizedRawNameStart: normalizeForBrandComparison((rawName || "").slice(0, 30)),
    });
    // eslint-disable-next-line no-console -- CTRテンプレート確認用
    console.log("[CTR SEO]", {
      goodsNo,
      mainLabel,
      benefitLabel,
      selectedTemplate,
      finalTitle: title,
      finalDescription: buildCtrDescription(mainLabel, benefitLabel, selectedTemplate),
    });
    // eslint-disable-next-line no-console -- A/B/Cパターン確認
    console.log("[CTR TEST]", {
      goodsNo,
      selectedPattern: titlePattern,
      title,
    });
    // eslint-disable-next-line no-console -- goodsNo固定パターン確認
    console.log("[CTR TEST FIXED]", {
      goodsNo,
      selectedPattern: titlePattern,
      title,
    });
    // eslint-disable-next-line no-console -- 一時デバッグ（A000000141338）
    console.log("[SEO DEBUG]", {
      goodsNo,
      brand,
      brandJa,
      brandDisplay,
      rawName,
      cleanName,
      finalTitle: title,
    });
  }

  let description = buildCtrDescription(mainLabel, benefitLabel, selectedTemplate);

  if (description.length > MAX_DESC_LEN) {
    description = description.slice(0, MAX_DESC_LEN - 1).trim();
    const last = Math.max(
      description.lastIndexOf("。"),
      description.lastIndexOf("、")
    );
    if (last >= 70) description = `${description.slice(0, last + 1)}`;
    else description = `${description}…`;
  }

  return { title, description, selectedPattern: titlePattern };
}
