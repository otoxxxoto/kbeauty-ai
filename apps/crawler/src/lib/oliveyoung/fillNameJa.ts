/**
 * Olive Young 商品名の日本語補助表示名（nameJa）生成
 * 形式: ブランド行 + 半角スペース + 種別（LLM が種別部分を生成）
 */
import { GoogleGenAI } from "@google/genai";
import { inferCategoryJaFromKoreanRawName, pickBrandDisplayLine } from "./nameJaCategoryFromRaw";

export const GEMINI_MODEL_DEFAULT = "gemini-2.5-flash";

export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL_DEFAULT;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** LLM がブランドを繰り返した場合に先頭を落とす */
function stripLeadingBrandFromSuffix(suffix: string, brandLine: string): string {
  let s = suffix.trim();
  const b = brandLine.trim();
  if (!b) return s;
  const re = new RegExp(`^${escapeRegExp(b)}\\s+`, "i");
  s = s.replace(re, "").trim();
  if (s.length > 0 && s.toLowerCase() === b.toLowerCase()) return "";
  return s;
}

const SYSTEM_PROMPT_SUFFIX = `あなたは日本向けECの商品名用アシスタントです。
ブランド名はシステム側で付与するため、出力にブランド名を含めないでください。
韓国語の商品名を読み、「ブランドの直後に付ける種別・ライン名」部分だけを日本語で1行で出力してください。
例: リップティント、セラム、マスク EX、ウォータークリーム 50ml、企画セット 2個入り
- 内容量・数量（mL、g、枚、本、個入り、セット表記など）は原文にあれば可能な限り残す
- カテゴリ語（クリーム、セラム、ティント、クッションファンデ、マスク、トナー等）を自然に含める
禁止:
- 出力に「商品」「製品」という語を含めない（部分一致も不可）
- 「Unknown」「unknown」「アンノウン」を含めない
- ブランド名だけの出力、意味のない1〜2語だけの出力
不自然に短くまとめすぎないでください。
型番・商品コード（Aで始まる長い英数字列）は含めないでください。
余計な説明、括弧での長い注釈は付けないでください。`;

export type GenerateNameJaInput = {
  brand: string;
  brandJa?: string;
  name: string;
  goodsNo?: string;
};

/**
 * LLM の生出力を保存用に正規化（引用符・改行除去、trim）
 */
export function sanitizeGeneratedNameJa(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .trim();
  const quoted = /^["'\u201C\u201D\u201E\u201F\u2033\u2036](.*)["'\u201C\u201D\u201E\u201F\u2033\u2036]$/s;
  const m = s.match(quoted);
  if (m) s = m[1].trim();
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * 種別部分のみ LLM で生成し、「ブランド行 + 種別」に組み立てる
 */
export async function generateJapaneseProductName(
  input: GenerateNameJaInput
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const brandLine = pickBrandDisplayLine(input.brandJa, input.brand);
  const inferred = inferCategoryJaFromKoreanRawName(input.name);

  const userMessage = [
    SYSTEM_PROMPT_SUFFIX,
    "",
    "以下の韓国語商品名から、種別・ライン名部分のみを1行で出力してください。",
    inferred
      ? `推定カテゴリ（参考）: ${inferred} — これに近い自然な表現でよい`
      : "推定カテゴリ: ルールから特定できず。文脈から種別を推測してください。",
    `brand（参考・出力に含めない）: ${input.brand || "(なし)"}`,
    input.brandJa ? `brandJa（参考・出力に含めない）: ${input.brandJa}` : "",
    `name: ${input.name}`,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModelName();
  console.log("[GEMINI_MODEL]", model);

  const response = await ai.models.generateContent({
    model,
    contents: userMessage,
  });

  let text = (response as { text?: string }).text?.trim() ?? "";
  if (text === "" && Array.isArray((response as { candidates?: unknown[] }).candidates)) {
    const cand = (response as { candidates: { content?: { parts?: { text?: string }[] } }[] }).candidates[0];
    const part = cand?.content?.parts?.[0];
    if (part?.text) text = part.text.trim();
  }

  let suffix = stripLeadingBrandFromSuffix(sanitizeGeneratedNameJa(text), brandLine);
  const part = (suffix || inferred || "").trim();

  if (!brandLine) {
    return part || "";
  }
  return [brandLine, part].filter(Boolean).join(" ").trim();
}

/**
 * 韓国語商品名から nameJa を生成（ブランド + 種別）
 */
export async function translateProductNameToJa(
  koreanName: string,
  ctx?: { brand?: string; brandJa?: string; goodsNo?: string }
): Promise<string> {
  const name = (koreanName || "").trim();
  if (!name) return "";
  return generateJapaneseProductName({
    brand: ctx?.brand ?? "",
    brandJa: ctx?.brandJa,
    name,
    goodsNo: ctx?.goodsNo,
  });
}
