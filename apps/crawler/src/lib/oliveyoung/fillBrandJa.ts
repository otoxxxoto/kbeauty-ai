/**
 * Olive Young ブランド名の日本語補助表示名（brandJa）生成
 * LLM で韓国語ブランド名 → 日本向け自然な表記に変換する
 */
import { GoogleGenAI } from "@google/genai";
import { getGeminiModelName } from "./fillNameJa";

const SYSTEM_PROMPT = `あなたは日本向けECブランド名整形アシスタントです。
韓国語ブランド名を、日本ユーザーに分かりやすい自然な日本語表記へ変換してください。
意味を大きく変えず、不明な固有名詞は無理に訳さず、可能なら自然なカタカナ・日本語表記にしてください。
不自然なら原文を保持してもよいです。
出力はブランド名のみ、1行で返してください。余計な説明文や引用符は付けないでください。`;

export type GenerateBrandJaInput = {
  brand: string;
  brandKey?: string;
  rank?: number;
  count?: number;
};

/**
 * LLM の生出力を保存用に正規化（引用符・改行除去、trim）
 */
export function sanitizeBrandJa(raw: string): string {
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
 * 韓国語ブランド名から日本語補助表示名を1件生成する
 * 失敗時は throw。空の場合は空文字を返す（呼び出し側で保存スキップ）
 */
export async function generateBrandJa(
  input: GenerateBrandJaInput
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const lines = [`brand: ${input.brand}`];
  if (input.brandKey?.trim()) lines.push(`brandKey: ${input.brandKey.trim()}`);
  if (input.rank != null && Number.isFinite(input.rank)) lines.push(`rank: ${input.rank}`);
  if (input.count != null && Number.isFinite(input.count)) lines.push(`count: ${input.count}`);
  const userMessage = [SYSTEM_PROMPT, "", "以下を日本語ブランド名1行に変換してください:", ...lines].join("\n");

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
  return sanitizeBrandJa(text);
}
