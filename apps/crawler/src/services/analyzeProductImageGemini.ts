/**
 * Gemini Vision で商品画像に人物が写っているか・商品単体かを判定
 */
import { GoogleGenAI, createPartFromBase64, createUserContent } from "@google/genai";
import { request } from "undici";
import { getGeminiModelName } from "../lib/oliveyoung/fillNameJa";

const VISION_PROMPT = `You are a strict content classifier for e-commerce product photos.

Look at the image and answer ONLY with a single JSON object (no markdown, no code fence) using this exact shape:
{"containsPerson":boolean,"isProductOnlyLikely":boolean,"confidence":number}

Rules:
- containsPerson: true if any recognizable human face, full/partial body, hands clearly used as a model shot, or obvious human skin as the main subject (not tiny background crowd). Cosmetic swatches on skin with no face may still be containsPerson true if a person is the focus.
- isProductOnlyLikely: true if the image is mainly product packaging, bottle, jar, or product-only flat lay with no prominent person.
- confidence: your confidence 0.0 to 1.0 for containsPerson.

When unsure whether a person is visible, prefer containsPerson: true to be safe.`;

export type GeminiImageAnalysisResult = {
  containsPerson: boolean;
  isProductOnlyLikely: boolean;
  confidence: number;
};

function parseJsonLoose(text: string): GeminiImageAnalysisResult | null {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
    const containsPerson = o.containsPerson === true;
    const isProductOnlyLikely = o.isProductOnlyLikely === true;
    const confidence =
      typeof o.confidence === "number" && Number.isFinite(o.confidence)
        ? Math.max(0, Math.min(1, o.confidence))
        : 0.7;
    return { containsPerson, isProductOnlyLikely, confidence };
  } catch {
    return null;
  }
}

function guessMimeFromUrl(url: string, contentType: string | undefined): string {
  const ct = (contentType || "").split(";")[0]?.trim().toLowerCase();
  if (ct && ct.startsWith("image/")) return ct;
  const u = url.toLowerCase();
  if (u.includes(".png")) return "image/png";
  if (u.includes(".webp")) return "image/webp";
  if (u.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

/**
 * 画像 URL を取得して Gemini で解析
 */
export async function analyzeProductImageByUrl(
  imageUrl: string
): Promise<GeminiImageAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey?.trim()) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const res = await request(imageUrl, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KBeautyImageBot/1.0; +https://example.invalid)",
      Accept: "image/*,*/*;q=0.8",
    },
    headersTimeout: 15000,
    bodyTimeout: 20000,
  });

  if (res.statusCode !== 200) {
    throw new Error(`Image fetch HTTP ${res.statusCode}`);
  }

  const buf = Buffer.from(await res.body.arrayBuffer());
  if (buf.length < 100 || buf.length > 8 * 1024 * 1024) {
    throw new Error(`Image size invalid: ${buf.length} bytes`);
  }

  const mime = guessMimeFromUrl(
    imageUrl,
    res.headers["content-type"] as string | undefined
  );
  const base64 = buf.toString("base64");

  const ai = new GoogleGenAI({ apiKey });
  const model = getGeminiModelName();

  const response = await ai.models.generateContent({
    model,
    contents: createUserContent([
      { text: VISION_PROMPT },
      createPartFromBase64(base64, mime),
    ]),
  });

  let text = (response as { text?: string }).text?.trim() ?? "";
  if (
    text === "" &&
    Array.isArray((response as { candidates?: unknown[] }).candidates)
  ) {
    const cand = (response as { candidates: { content?: { parts?: { text?: string }[] } }[] })
      .candidates[0];
    const part = cand?.content?.parts?.[0];
    if (part?.text) text = part.text.trim();
  }

  const parsed = parseJsonLoose(text);
  if (!parsed) {
    throw new Error(`Failed to parse Gemini vision JSON: ${text.slice(0, 200)}`);
  }
  return parsed;
}
