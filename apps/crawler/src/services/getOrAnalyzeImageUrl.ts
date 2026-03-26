/**
 * キャッシュ → URLヒューリスティック → Gemini の順で画像を解析
 */
import { getGeminiModelName } from "../lib/oliveyoung/fillNameJa";
import { looksLikePersonImage } from "../utils/imagePersonFilter";
import { analyzeProductImageByUrl } from "./analyzeProductImageGemini";
import {
  getCachedImageAnalysis,
  setCachedImageAnalysis,
  type CachedImageAnalysis,
} from "./imageAnalysisCacheFirestore";

export type ResolvedImageAnalysis = {
  url: string;
  containsPerson: boolean;
  confidence: number;
  isPreferredProductImage: boolean;
};

function toPreferred(gemini: {
  containsPerson: boolean;
  isProductOnlyLikely: boolean;
}): boolean {
  if (gemini.containsPerson) return false;
  return gemini.isProductOnlyLikely === true;
}

/**
 * 同一URLはキャッシュを再利用。明らかな人物URLは Gemini を呼ばずヒューリスティックで記録。
 */
export async function getOrAnalyzeImageUrl(
  url: string
): Promise<ResolvedImageAnalysis> {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      url: "",
      containsPerson: true,
      confidence: 1,
      isPreferredProductImage: false,
    };
  }

  const cached = await getCachedImageAnalysis(trimmed);
  if (cached) {
    return {
      url: trimmed,
      containsPerson: cached.containsPerson,
      confidence: cached.confidence,
      isPreferredProductImage: cached.isPreferredProductImage,
    };
  }

  if (looksLikePersonImage(trimmed)) {
    const row: CachedImageAnalysis = {
      url: trimmed,
      containsPerson: true,
      confidence: 0.55,
      isPreferredProductImage: false,
      source: "heuristic",
    };
    await setCachedImageAnalysis(row);
    return {
      url: trimmed,
      containsPerson: true,
      confidence: 0.55,
      isPreferredProductImage: false,
    };
  }

  try {
    const g = await analyzeProductImageByUrl(trimmed);
    const isPreferredProductImage = toPreferred(g);
    const row: CachedImageAnalysis = {
      url: trimmed,
      containsPerson: g.containsPerson,
      confidence: g.confidence,
      isPreferredProductImage,
      source: "gemini",
      model: getGeminiModelName(),
    };
    await setCachedImageAnalysis(row);
    return {
      url: trimmed,
      containsPerson: g.containsPerson,
      confidence: g.confidence,
      isPreferredProductImage,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[IMAGE_VISION_ERROR]", trimmed.slice(0, 120), msg);
    const row: CachedImageAnalysis = {
      url: trimmed,
      containsPerson: true,
      confidence: 0.5,
      isPreferredProductImage: false,
      source: "error",
      errorMessage: msg.slice(0, 500),
    };
    await setCachedImageAnalysis(row);
    return {
      url: trimmed,
      containsPerson: true,
      confidence: 0.5,
      isPreferredProductImage: false,
    };
  }
}
