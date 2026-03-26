/**
 * reviewSummaryJa 用 LLM 生成（ジョブ・再生成から共通利用）
 */
import { GoogleGenAI } from "@google/genai";
import type { ProductForReviewSummaryJa } from "../../services/reviewSummaryJaFirestore";
import { getGeminiModelName } from "./fillNameJa";
import { isUnsafeGeneratedSummary } from "./generatedSummaryQuality";
import {
  resolveBrandDisplayNameForLlm,
  resolveProductDisplayNameForLlm,
} from "./productLabelForLlm";

const REVIEW_SUMMARY_JA_SYSTEM = `あなたは日本向けECサイトの口コミ要約アシスタントです。
入力された韓国コスメの商品情報をもとに、日本語で「箇条書き＋まとめ文」の口コミ要約を1つだけ出力してください。

出力形式（必ずこの形で出力する）:
・ポイント1
・ポイント2
・ポイント3

まとめ文

ルール:
- 出力は自然な日本語のみ。ハングル（韓国語表記）は使わない。
- 商品表示名・ブランドは入力で渡した表記のみを使う。商品コード・Aで始まる英数字のIDは含めず主語にも使わない。
- 箇条書きは3行程度にまとめ、最後に1〜2文のまとめ文を書く。全体で100〜150文字以上を目安にする。
- 宣伝文句になりすぎず、実際の使用感・良い点・注意点が伝わるように簡潔に書く。`;

function hasHangul(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  return /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(s);
}

function buildPromptLabels(product: ProductForReviewSummaryJa): {
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
  const summary = raw && !isUnsafeGeneratedSummary(raw) ? raw : "";
  return { productDisplayName, brandDisplay, summary };
}

async function generateReviewSummaryJaWithGemini(
  product: ProductForReviewSummaryJa,
  retryForHangul = false
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const { productDisplayName, brandDisplay, summary } = buildPromptLabels(product);

  const lines = [
    `商品表示名（この表記を使う。商品コードは書かない）: ${productDisplayName}`,
    `ブランド: ${brandDisplay}`,
  ];
  if (summary) lines.push(`説明・補足: ${summary.slice(0, 800)}`);

  const extra = retryForHangul
    ? "\n【重要】出力にハングルを含めないでください。商品名・ブランド名は上記の表記をそのまま使ってください。"
    : "";

  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModelName();
  const response = await ai.models.generateContent({
    model,
    contents: [
      REVIEW_SUMMARY_JA_SYSTEM,
      "",
      "以下を日本語の自然な要約（100〜200文字、2〜3文）にしてください。要約文のみ出力:",
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
  return sanitizeReviewSummaryJa(text);
}

function sanitizeReviewSummaryJa(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  s = s
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line, idx, arr) => !(line === "" && arr[Math.max(0, idx - 1)] === ""))
    .join("\n")
    .trim();
  if (s.length > 500) s = s.slice(0, 497) + "…";
  return s;
}

export function generateReviewSummaryJaFallback(product: ProductForReviewSummaryJa): string {
  const name = resolveProductDisplayNameForLlm({
    name: product.name,
    nameJa: product.nameJa,
    brand: product.brand,
    brandJa: product.brandJa,
  });
  const brand = resolveBrandDisplayNameForLlm({
    brand: product.brand,
    brandJa: product.brandJa,
  });
  const rawSum = (product.summaryJa ?? "").trim();
  const summary =
    rawSum && !isUnsafeGeneratedSummary(rawSum) ? rawSum : "";

  if (summary.length > 0 && summary.length <= 120) {
    return `${summary} 韓国オリーブヤングで人気の商品です。`;
  }
  if (summary.length > 120) {
    const first = summary.slice(0, 80).trim();
    const end = first.endsWith("。") ? "" : "。";
    return `${first}${end} 韓国オリーブヤングで人気の商品です。`;
  }

  if (brand && brand !== "(ブランドなし)") {
    return `${name}は${brand}の商品です。韓国オリーブヤングで人気のアイテムとして確認されています。`;
  }
  return `${name}は韓国オリーブヤングで人気の商品です。`;
}

/**
 * 1 商品分の口コミ要約を生成。unsafe な出力は空文字。
 */
export async function produceReviewSummaryJaText(
  product: ProductForReviewSummaryJa
): Promise<string> {
  let text = "";
  try {
    text = await generateReviewSummaryJaWithGemini(product);
    const canRetryHangul =
      !!(product.nameJa?.trim() || product.brandJa?.trim()) && hasHangul(text);
    if (canRetryHangul) {
      console.warn("[REVIEW_SUMMARY_JA_HANGUL_RETRY]", `goodsNo=${product.goodsNo}`);
      text = await generateReviewSummaryJaWithGemini(product, true);
      if (hasHangul(text)) {
        console.warn("[REVIEW_SUMMARY_JA_HANGUL_LEFT]", `goodsNo=${product.goodsNo}`);
      }
    } else if (hasHangul(text)) {
      console.warn("[REVIEW_SUMMARY_JA_HANGUL_LEFT]", `goodsNo=${product.goodsNo}`);
    }
    if (text.trim() && isUnsafeGeneratedSummary(text)) {
      text = generateReviewSummaryJaFallback(product);
    }
  } catch (geminiErr) {
    const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
    console.warn(
      "[REVIEW_SUMMARY_JA_GEMINI_FALLBACK]",
      `goodsNo=${product.goodsNo} reason=${msg}`
    );
    text = generateReviewSummaryJaFallback(product);
  }
  if (!text.trim()) return "";
  if (isUnsafeGeneratedSummary(text)) return "";
  return text.trim();
}

/** @deprecated 互換 */
export function generateReviewSummaryJa(product: ProductForReviewSummaryJa): string {
  return generateReviewSummaryJaFallback(product);
}
