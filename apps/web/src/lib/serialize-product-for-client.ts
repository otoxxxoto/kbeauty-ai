/**
 * Client Component に渡す前に商品の「画像解決用フィールド」だけをプレーンオブジェクト化する。
 * Firestore Timestamp や余計なキーを境界を越えさせない。
 */
import type {
  ProductImageAnalysisEntry,
  ProductImageFields,
} from "@/lib/product-display-image-resolve";

function isFirestoreTimestampLike(v: unknown): boolean {
  return (
    typeof v === "object" &&
    v !== null &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  );
}

/** デバッグ: Client に渡す直前に Timestamp 等が残っていないか */
export function logClientSerializeDebugForProduct(
  label: string,
  obj: Record<string, unknown>
): void {
  if (process.env.NEXT_PUBLIC_CLIENT_SERIALIZE_DEBUG !== "1") return;
  const suspects: string[] = [];
  const keys = [
    "updatedAt",
    "lastSeenRunDate",
    "createdAt",
    "fetchedAt",
    "priceComparison",
    "imageAnalysis",
    "marketplaceImageMatchLevels",
  ];
  for (const k of keys) {
    if (!(k in obj)) continue;
    const v = obj[k];
    if (v == null) continue;
    if (isFirestoreTimestampLike(v)) suspects.push(`${k}:Timestamp`);
    else if (typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      if (k === "priceComparison" || k === "imageAnalysis") {
        try {
          JSON.stringify(v);
        } catch {
          suspects.push(`${k}:non-JSON`);
        }
      }
    }
  }
  if (suspects.length > 0) {
    // eslint-disable-next-line no-console -- 一時デバッグ
    console.warn("[CLIENT_SERIALIZE_DEBUG]", label, suspects);
  }
}

/**
 * 画像表示に必要なフィールドだけをコピーし、値をプリミティブに正規化する。
 */
export function serializeProductImageFieldsForClient(
  p: ProductImageFields
): ProductImageFields {
  const str = (x: string | undefined): string | undefined => {
    const t = x != null ? String(x).trim() : "";
    return t || undefined;
  };

  const levels = p.marketplaceImageMatchLevels;
  let marketplaceImageMatchLevels:
    | ProductImageFields["marketplaceImageMatchLevels"]
    | undefined;
  if (levels && typeof levels === "object") {
    const out: NonNullable<ProductImageFields["marketplaceImageMatchLevels"]> =
      {};
    for (const k of ["amazon", "rakuten", "qoo10"] as const) {
      const v = levels[k];
      if (v === "strong" || v === "weak") out[k] = v;
    }
    marketplaceImageMatchLevels =
      Object.keys(out).length > 0 ? out : undefined;
  }

  let imageAnalysis: ProductImageAnalysisEntry[] | undefined;
  if (Array.isArray(p.imageAnalysis) && p.imageAnalysis.length > 0) {
    imageAnalysis = p.imageAnalysis
      .map((e) => {
        const url = String(e?.url ?? "").trim();
        if (!url) return null;
        const entry: ProductImageAnalysisEntry = {
          url,
          containsPerson: e.containsPerson === true,
        };
        if (typeof e.confidence === "number") entry.confidence = e.confidence;
        if (typeof e.isPreferredProductImage === "boolean") {
          entry.isPreferredProductImage = e.isPreferredProductImage;
        }
        if (e.isOliveYoungOriginal === true) {
          entry.isOliveYoungOriginal = true;
        }
        return entry;
      })
      .filter((x): x is ProductImageAnalysisEntry => x != null);
    if (imageAnalysis.length === 0) imageAnalysis = undefined;
  }

  return {
    ...(str(p.imageUrl) !== undefined && { imageUrl: str(p.imageUrl) }),
    ...(str(p.thumbnailUrl) !== undefined && {
      thumbnailUrl: str(p.thumbnailUrl),
    }),
    ...(Array.isArray(p.imageUrls) && p.imageUrls.length > 0
      ? {
          imageUrls: p.imageUrls
            .map((u) => String(u).trim())
            .filter(Boolean),
        }
      : {}),
    ...(str(p.safeImageUrl) !== undefined && {
      safeImageUrl: str(p.safeImageUrl),
    }),
    ...(p.hasSafeProductImage === true && {
      hasSafeProductImage: true,
    }),
    ...(str(p.amazonImage) !== undefined && {
      amazonImage: str(p.amazonImage),
    }),
    ...(str(p.rakutenImage) !== undefined && {
      rakutenImage: str(p.rakutenImage),
    }),
    ...(str(p.qoo10Image) !== undefined && { qoo10Image: str(p.qoo10Image) }),
    ...(imageAnalysis ? { imageAnalysis } : {}),
    ...(marketplaceImageMatchLevels
      ? { marketplaceImageMatchLevels }
      : {}),
  };
}
