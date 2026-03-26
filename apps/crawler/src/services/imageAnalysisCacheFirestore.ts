/**
 * 画像URL単位の Vision 判定キャッシュ（image_analysis_cache）
 */
import { FieldValue, Firestore } from "@google-cloud/firestore";
import { createHash } from "node:crypto";

const CACHE_COLLECTION = "image_analysis_cache";

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export function urlToCacheDocId(url: string): string {
  return createHash("sha256").update(url.trim(), "utf8").digest("hex");
}

export type CachedImageAnalysis = {
  url: string;
  containsPerson: boolean;
  confidence: number;
  isPreferredProductImage: boolean;
  model?: string;
  source?: "gemini" | "heuristic" | "error";
  errorMessage?: string;
};

export async function getCachedImageAnalysis(
  url: string
): Promise<CachedImageAnalysis | null> {
  const id = urlToCacheDocId(url);
  const snap = await getDb().collection(CACHE_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  if (d.url == null || typeof d.containsPerson !== "boolean") return null;
  return {
    url: String(d.url),
    containsPerson: d.containsPerson === true,
    confidence: typeof d.confidence === "number" ? d.confidence : 0,
    isPreferredProductImage: d.isPreferredProductImage === true,
    model: d.model != null ? String(d.model) : undefined,
    source:
      d.source === "heuristic" || d.source === "error" || d.source === "gemini"
        ? d.source
        : undefined,
    errorMessage: d.errorMessage != null ? String(d.errorMessage) : undefined,
  };
}

export async function setCachedImageAnalysis(
  row: CachedImageAnalysis
): Promise<void> {
  const id = urlToCacheDocId(row.url);
  await getDb()
    .collection(CACHE_COLLECTION)
    .doc(id)
    .set(
      {
        url: row.url.trim(),
        containsPerson: row.containsPerson,
        confidence: row.confidence,
        isPreferredProductImage: row.isPreferredProductImage,
        model: row.model,
        source: row.source,
        errorMessage: row.errorMessage,
        analyzedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}
