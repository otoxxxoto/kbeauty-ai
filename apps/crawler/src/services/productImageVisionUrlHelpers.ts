/**
 * analyzeProductImagesVisionJob / NDJSON 取り込みで共通の URL 並び・safe 候補選定
 */
import type { ProductImageAnalysisFirestoreRow } from "./productImageVisionFirestore";

function pushStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s || "";
}

export function isMarketplaceHostForVision(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("amazon.") ||
    u.includes("media-amazon") ||
    u.includes("ssl-images-amazon") ||
    u.includes("rakuten.") ||
    u.includes("qoo10") ||
    u.includes("qoo-img.com")
  );
}

export function isOyStyleProductImageUrlForVision(url: string): boolean {
  return url.trim() !== "" && !isMarketplaceHostForVision(url);
}

export function uniqueUrlsInOrderVision(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Firestore 生データから Vision ジョブと同じ URL 列（重複除去・順序固定）
 */
export function buildProductImageUrlOrderFromDocData(
  data: Record<string, unknown>
): string[] {
  const urls: string[] = [];
  urls.push(pushStr(data.amazonImage));
  urls.push(pushStr(data.rakutenImage));
  urls.push(pushStr(data.qoo10Image));
  urls.push(pushStr(data.imageUrl));
  urls.push(pushStr(data.thumbnailUrl));
  const arr = data.imageUrls;
  if (Array.isArray(arr)) {
    for (const x of arr) urls.push(pushStr(x));
  }
  return uniqueUrlsInOrderVision(urls);
}

export function pickSafeImageUrlFromVisionAnalysis(
  analysis: ProductImageAnalysisFirestoreRow[],
  urlOrder: string[]
): string {
  const idx = new Map(urlOrder.map((u, i) => [u, i]));
  const candidates = analysis.filter(
    (a) => !a.containsPerson && isOyStyleProductImageUrlForVision(a.url)
  );
  candidates.sort((a, b) => {
    const ap = a.isPreferredProductImage ? 1 : 0;
    const bp = b.isPreferredProductImage ? 1 : 0;
    if (bp !== ap) return bp - ap;
    const ac = a.confidence ?? 0;
    const bc = b.confidence ?? 0;
    if (bc !== ac) return bc - ac;
    return (idx.get(a.url) ?? 999) - (idx.get(b.url) ?? 999);
  });
  return candidates[0]?.url?.trim() ?? "";
}

export function parseImageAnalysisFromDocData(
  data: Record<string, unknown>
): ProductImageAnalysisFirestoreRow[] {
  const raw = data.imageAnalysis;
  if (!Array.isArray(raw)) return [];
  const out: ProductImageAnalysisFirestoreRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const url = String(o.url ?? "").trim();
    if (!url) continue;
    out.push({
      url,
      containsPerson: Boolean(o.containsPerson),
      confidence:
        typeof o.confidence === "number" && Number.isFinite(o.confidence)
          ? o.confidence
          : undefined,
      isPreferredProductImage:
        o.isPreferredProductImage === true ? true : undefined,
      isOliveYoungOriginal:
        typeof o.isOliveYoungOriginal === "boolean"
          ? o.isOliveYoungOriginal
          : isOyStyleProductImageUrlForVision(url),
    });
  }
  return out;
}
