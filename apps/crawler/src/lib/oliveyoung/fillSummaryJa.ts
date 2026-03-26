/**
 * Olive Young 商品の日本語補助説明（summaryJa）生成
 * LLM で商品名・ブランド・ランキング情報から 1〜2 文の短い説明文を生成する
 */
import { GoogleGenAI } from "@google/genai";
import { getGeminiModelName } from "./fillNameJa";
import {
  resolveBrandDisplayNameForLlm,
  resolveProductDisplayNameForLlm,
} from "./productLabelForLlm";
import { isUnsafeGeneratedSummary } from "./generatedSummaryQuality";

const SYSTEM_PROMPT = `あなたは日本向けEC商品の補助説明文を作るアシスタントです。
入力で渡す「商品表示名」「ブランド」だけを参照し、日本ユーザーに分かりやすい短い説明文を1〜2文で書いてください。
商品コード・型番・Aで始まる英数字のID（例: A000000123456）は本文に含めず、主語にも使わないでください。
誇張や断定は避け、自然な日本語で返してください。
商品名から読み取れる範囲だけを書き、不明な成分・効果は書かないでください。
ランキング情報がある場合は「オリーブヤングで確認された人気商品」程度の表現は可です。
箇条書き・引用符は使わず、説明文のみ出力してください。`;

export type GenerateSummaryJaInput = {
  brand: string;
  brandJa?: string;
  name: string;
  nameJa?: string;
  lastRank?: number | null;
  lastSeenRunDate?: string;
};

/**
 * LLM の生出力を保存用に正規化（改行をスペースに、2文超は短く、trim）
 */
export function sanitizeSummaryJa(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw
    .replace(/\r\n/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ")
    .trim();
  s = s.replace(/\s+/g, " ").trim();
  const sentences = s.split(/(?<=[。.!?])\s*/).filter(Boolean);
  if (sentences.length > 2) {
    s = sentences.slice(0, 2).join("").trim();
  }
  return s;
}

/**
 * 商品情報から日本語補助説明を1件生成する
 * 失敗時は throw。空の場合は空文字を返す（呼び出し側で保存スキップ）
 */
export async function generateSummaryJa(
  input: GenerateSummaryJaInput
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const productDisplayName = resolveProductDisplayNameForLlm({
    name: input.name,
    nameJa: input.nameJa,
    brand: input.brand,
    brandJa: input.brandJa,
  });
  const brandDisplay = resolveBrandDisplayNameForLlm({
    brand: input.brand,
    brandJa: input.brandJa,
  });

  const lines = [
    `商品表示名（説明文でこの表記を使う。商品コードは書かない）: ${productDisplayName}`,
    `ブランド: ${brandDisplay}`,
  ];
  if (input.lastRank != null && Number.isFinite(input.lastRank)) {
    lines.push(`lastRank: ${input.lastRank}`);
  }
  if (input.lastSeenRunDate?.trim()) {
    lines.push(`lastSeenRunDate: ${input.lastSeenRunDate.trim()}`);
  }
  const userMessage = lines.join("\n");

  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModelName();
  console.log("[GEMINI_MODEL]", model);

  const response = await ai.models.generateContent({
    model,
    contents: [
      SYSTEM_PROMPT,
      "",
      "以下から1〜2文の補助説明文を作成してください:",
      userMessage,
    ].join("\n"),
  });

  let text = (response as { text?: string }).text?.trim() ?? "";
  if (text === "" && Array.isArray((response as { candidates?: unknown[] }).candidates)) {
    const cand = (response as { candidates: { content?: { parts?: { text?: string }[] } }[] }).candidates[0];
    const part = cand?.content?.parts?.[0];
    if (part?.text) text = part.text.trim();
  }
  const out = sanitizeSummaryJa(text);
  if (out && isUnsafeGeneratedSummary(out)) {
    return "";
  }
  return out;
}
