/**
 * ingredientSummaryJa 用 LLM 生成（ジョブ・再生成から共通利用）
 */
import { GoogleGenAI } from "@google/genai";
import type { ProductForIngredientSummaryJa } from "../../services/ingredientSummaryJaFirestore";
import { getGeminiModelName } from "./fillNameJa";
import { isUnsafeGeneratedSummary } from "./generatedSummaryQuality";
import {
  resolveBrandDisplayNameForLlm,
  resolveProductDisplayNameForLlm,
} from "./productLabelForLlm";

const INGREDIENT_KEYWORDS: { search: string; label: string }[] = [
  { search: "cica", label: "CICA（シカ）" },
  { search: "シカ", label: "CICA（シカ）" },
  { search: "ナイアシンアミド", label: "ナイアシンアミド" },
  { search: "レチノール", label: "レチノール" },
  { search: "ヒアルロン酸", label: "ヒアルロン酸" },
  { search: "セラミド", label: "セラミド" },
  { search: "コラーゲン", label: "コラーゲン" },
  { search: "ビタミンc", label: "ビタミンC" },
  { search: "ビタミンＣ", label: "ビタミンC" },
];

function findMatchedIngredientLabels(product: ProductForIngredientSummaryJa): string[] {
  const display = resolveProductDisplayNameForLlm({
    name: product.name,
    nameJa: product.nameJa,
    brand: product.brand,
    brandJa: product.brandJa,
  });
  const sum = (product.summaryJa ?? "").trim();
  const safeSum = sum && !isUnsafeGeneratedSummary(sum) ? sum : "";
  const full = [display, product.nameJa ?? "", product.name ?? "", safeSum].join(" ").toLowerCase();
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const { search, label } of INGREDIENT_KEYWORDS) {
    const searchLower = search.toLowerCase();
    if (full.includes(searchLower) && !seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }
  return labels;
}

/** フォールバック: キーワード一致ベースの成分補助解説（Gemini 失敗時用） */
export function generateIngredientSummaryJaFallback(
  product: ProductForIngredientSummaryJa
): string {
  const labels = findMatchedIngredientLabels(product);
  if (labels.length === 0) return "";
  const list = labels.slice(0, 3).join("・");
  return `本品には${list}などの成分が含まれる場合があります。韓国オリーブヤングで人気の商品です。`;
}

const INGREDIENT_SUMMARY_JA_SYSTEM = `あなたは日本向けEC商品の成分解説を作るアシスタントです。
入力された韓国コスメの商品情報をもとに、自然な日本語の成分解説を1つだけ出力してください。

ルール:
- 出力は自然な日本語のみ。ハングル（韓国語表記）は使わない。
- 商品表示名として渡した表記のみを使い、商品コード・Aで始まる英数字のIDは本文に含めず主語にも使わない。
- 2〜3文、100〜200文字程度で、代表的な成分や期待される使用感を簡潔に説明する。
- 効果を断定しすぎず、商品情報から分かる範囲で説明する。
- 箇条書き・引用符・前置き文は使わず、説明文のみ。`;

function hasHangul(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(s);
}

function buildTextsForPrompt(product: ProductForIngredientSummaryJa): {
  productDisplayName: string;
  brandDisplay: string;
  summary: string;
} {
  const productDisplayName = resolveProductDisplayNameForLlm({
    name: product.name,
    nameJa: product.nameJa,
    brand: product.brand,
    brandJa: product.brandJa,
  });
  const brandDisplay = resolveBrandDisplayNameForLlm({
    brand: product.brand,
    brandJa: product.brandJa,
  });
  const raw = (product.summaryJa ?? "").trim();
  const summary =
    raw && !isUnsafeGeneratedSummary(raw) ? raw : "";
  return { productDisplayName, brandDisplay, summary };
}

async function generateIngredientSummaryJaWithGemini(
  product: ProductForIngredientSummaryJa,
  retryForHangul = false
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const { productDisplayName, brandDisplay, summary } = buildTextsForPrompt(product);

  const lines = [
    `商品表示名（この表記を使う。商品コードは書かない）: ${productDisplayName}`,
    `ブランド: ${brandDisplay}`,
  ];
  if (summary) lines.push(`商品説明・補足: ${summary.slice(0, 800)}`);

  const extra = retryForHangul
    ? "\n【重要】出力にハングルを含めないでください。商品名は上記の表記をそのまま使ってください。"
    : "";

  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModelName();
  const response = await ai.models.generateContent({
    model,
    contents: [
      INGREDIENT_SUMMARY_JA_SYSTEM,
      "",
      "以下をもとに、日本向けの自然な成分解説（100〜200文字、2〜3文）を日本語で1つだけ出力してください。解説文のみ出力:",
      lines.join("\n"),
      extra,
    ].join("\n"),
  });

  let text = (response as { text?: string }).text?.trim() ?? "";
  if (!text && Array.isArray((response as { candidates?: unknown[] }).candidates)) {
    const cand = (response as {
      candidates: { content?: { parts?: { text?: string }[] } }[];
    }).candidates[0];
    const part = cand?.content?.parts?.[0];
    if (part?.text) text = part.text.trim();
  }
  return sanitizeIngredientSummaryJa(text);
}

function sanitizeIngredientSummaryJa(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .trim();
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 250) s = s.slice(0, 247) + "。";
  return s;
}

/**
 * 1 商品分の成分解説を生成（Gemini → フォールバック）。unsafe な出力は空文字。
 */
export async function produceIngredientSummaryJaText(
  product: ProductForIngredientSummaryJa
): Promise<string> {
  let text = "";
  try {
    text = await generateIngredientSummaryJaWithGemini(product);
    const canRetryHangul = !!product.nameJa?.trim() && hasHangul(text);
    if (canRetryHangul) {
      console.warn("[INGREDIENT_SUMMARY_JA_HANGUL_RETRY]", `goodsNo=${product.goodsNo}`);
      text = await generateIngredientSummaryJaWithGemini(product, true);
      if (hasHangul(text)) {
        console.warn("[INGREDIENT_SUMMARY_JA_HANGUL_LEFT]", `goodsNo=${product.goodsNo}`);
      }
    } else if (hasHangul(text)) {
      console.warn("[INGREDIENT_SUMMARY_JA_HANGUL_LEFT]", `goodsNo=${product.goodsNo}`);
    }
    if (text.trim() && isUnsafeGeneratedSummary(text)) {
      text = generateIngredientSummaryJaFallback(product);
    }
  } catch (geminiErr) {
    const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
    console.warn(
      "[INGREDIENT_SUMMARY_JA_GEMINI_FALLBACK]",
      `goodsNo=${product.goodsNo} reason=${msg}`
    );
    text = generateIngredientSummaryJaFallback(product);
  }
  if (!text.trim()) return "";
  if (isUnsafeGeneratedSummary(text)) return "";
  return text.trim();
}

/** @deprecated 互換: generateIngredientSummaryJaFallback のエイリアス */
export function generateIngredientSummaryJa(product: ProductForIngredientSummaryJa): string {
  return generateIngredientSummaryJaFallback(product);
}
