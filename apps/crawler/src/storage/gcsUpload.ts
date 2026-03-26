/**
 * GCS への JSON アップロード（ingredients など）
 */
import { Storage } from "@google-cloud/storage";

const storage = new Storage();

export async function uploadJsonString(params: {
  bucket: string;
  destination: string; // e.g. oliveyoung/ingredients/A000....json
  jsonString: string;
  cacheControl?: string;
}): Promise<{ gsUri: string; publicUrl: string }> {
  const { bucket, destination, jsonString } = params;
  const cacheControl = params.cacheControl != null ? params.cacheControl : "public, max-age=300"; // 5min cache

  const b = storage.bucket(bucket);
  const file = b.file(destination);

  await file.save(jsonString, {
    contentType: "application/json; charset=utf-8",
    metadata: { cacheControl },
    resumable: false,
  });

  const gsUri = `gs://${bucket}/${destination}`;
  const publicUrl = `https://storage.googleapis.com/${bucket}/${destination}`;
  return { gsUri, publicUrl };
}

/**
 * GCS からファイル内容を取得（存在しなければ null）
 */
export async function downloadFileContent(params: {
  bucket: string;
  destination: string;
}): Promise<string | null> {
  const b = storage.bucket(params.bucket);
  const file = b.file(params.destination);
  try {
    const [contents] = await file.download();
    return contents.toString("utf8");
  } catch (e: unknown) {
    const err = e as { code?: number };
    if (err?.code === 404) return null;
    throw e;
  }
}
