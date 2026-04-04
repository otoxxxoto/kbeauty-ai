/**
 * 公開サイトのオリジン（canonical / sitemap / robots.txt で共通）。
 * NEXT_PUBLIC_SITE_URL を優先し、未設定時は NEXT_PUBLIC_APP_URL を使う。
 * どちらも無い場合のみフォールバック（従来 sitemap 側の本番想定に合わせる）。
 */
export function getPublicSiteBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  const base = raw.replace(/\/$/, "");
  return base || "https://kbeauty-lab.com";
}
