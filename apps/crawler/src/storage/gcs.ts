/**
 * Google Cloud Storage アップロード（Cloud Run で使い回し可能）
 */
import { Storage } from '@google-cloud/storage';

const storage = new Storage();

/**
 * アップロード後の公開URLを返す（bucket は名前、destPath はスラッシュ区切りパス）
 */
export function publicUrl(bucket: string, destPath: string): string {
  const path = destPath.replace(/^\//, '');
  return `https://storage.googleapis.com/${bucket}/${path}`;
}

/**
 * ローカルファイルを GCS にアップロード
 */
export async function uploadFileToGCS(
  localPath: string,
  bucket: string,
  destPath: string,
  contentType: string
): Promise<string> {
  const dest = destPath.replace(/^\//, '');
  await storage.bucket(bucket).upload(localPath, {
    destination: dest,
    metadata: { contentType },
  });
  return publicUrl(bucket, dest);
}

/**
 * 文字列を GCS にアップロード
 */
export async function uploadStringToGCS(
  content: string,
  bucket: string,
  destPath: string,
  contentType: string
): Promise<string> {
  const dest = destPath.replace(/^\//, '');
  const file = storage.bucket(bucket).file(dest);
  const buffer = Buffer.from(content, 'utf-8');
  await file.save(buffer, {
    metadata: { contentType },
  });
  return publicUrl(bucket, dest);
}
