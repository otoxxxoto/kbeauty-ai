/**
 * 商品画像の data 属性・開発時 console 用ヘルパ（本番バンドルでも軽量）。
 */

export function isProductImageLoadDebugEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** img の data-image-url 用（同一オリジンは相対パスのまま） */
export function normalizeImageDataUrl(src: string): string {
  const t = (src ?? "").trim();
  if (!t) return "";
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

export function imageSrcHostForDebug(src: string): string {
  const t = normalizeImageDataUrl(src);
  if (!t) return "";
  if (t.startsWith("/")) return "(same-origin)";
  try {
    return new URL(t).hostname;
  } catch {
    return "(parse-error)";
  }
}

export function isOliveYoungCdnUrl(url: string): boolean {
  return url.toLowerCase().includes("oliveyoung.co.kr");
}
