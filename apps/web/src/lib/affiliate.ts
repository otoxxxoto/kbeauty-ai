/**
 * Amazon アソシエイト等: 検索URLに tag を付与
 * NEXT_PUBLIC_AMAZON_TAG が未設定のときは tag クエリを付けない（開発用）
 */

export const AMAZON_AFFILIATE_REL = "nofollow sponsored noopener" as const;

/** 楽天アフィリエイト導線（Amazon と同値・仕様変更時はここだけ調整可） */
export const RAKUTEN_AFFILIATE_REL = "nofollow sponsored noopener" as const;

/** Qoo10 導線（アフィ拡張時は appendQoo10AffiliateParams を調整） */
export const QOO10_AFFILIATE_REL = "nofollow sponsored noopener" as const;

export function buildAmazonSearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword.trim());
  const tag = process.env.NEXT_PUBLIC_AMAZON_TAG;
  const tagTrimmed =
    tag != null && typeof tag === "string" ? tag.trim() : "";
  if (tagTrimmed) {
    return `https://www.amazon.co.jp/s?k=${encoded}&tag=${encodeURIComponent(tagTrimmed)}`;
  }
  return `https://www.amazon.co.jp/s?k=${encoded}`;
}

/**
 * 楽天市場検索（mall）URL。
 * NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID があるときだけ {@link appendRakutenAffiliateParams} でクエリ付与。
 */
export function buildRakutenSearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword.trim());
  const base = `https://search.rakuten.co.jp/search/mall/${encoded}/`;
  return appendRakutenAffiliateParams(base);
}

/**
 * 楽天検索URLへアフィリエイト用クエリを付与（パラメータ名は公式リンク形式に後から合わせやすいよう集約）。
 * 未設定時は url をそのまま返す。
 */
export function appendRakutenAffiliateParams(url: string): string {
  const raw = process.env.NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID;
  const id = raw != null && typeof raw === "string" ? raw.trim() : "";
  if (!id) return url;
  const sep = url.includes("?") ? "&" : "?";
  // 楽天アフィリエイト管理画面の「リンクURL」仕様に合わせてキー名を変更してください（例: scid, l-id 等）
  return `${url}${sep}scid=${encodeURIComponent(id)}`;
}

/**
 * Qoo10 日本向け検索URL（キーワード検索）。
 * NEXT_PUBLIC_QOO10_AFFILIATE_ID 等は {@link appendQoo10AffiliateParams} で後から差し込み。
 */
export function buildQoo10SearchUrl(keyword: string): string {
  const encoded = encodeURIComponent(keyword.trim());
  const base = `https://www.qoo10.jp/s/?keyword=${encoded}`;
  return appendQoo10AffiliateParams(base);
}

/**
 * Qoo10 URL にアフィ用クエリを付与（未設定時は url をそのまま返す）
 */
export function appendQoo10AffiliateParams(url: string): string {
  const raw = process.env.NEXT_PUBLIC_QOO10_AFFILIATE_ID;
  const id = raw != null && typeof raw === "string" ? raw.trim() : "";
  if (!id) return url;
  const sep = url.includes("?") ? "&" : "?";
  // 正式パラメータ名は Qoo10 アフィリエイト仕様に合わせて変更
  return `${url}${sep}affiliate_id=${encodeURIComponent(id)}`;
}

/** Amazon / 楽天 / Qoo10 以外の外部ショップ用 */
export function relForExternalUrl(href: string): string {
  if (typeof href !== "string" || !href.trim()) return "noopener noreferrer";
  if (/amazon\.co\.jp/i.test(href)) return AMAZON_AFFILIATE_REL;
  if (/rakuten\.co\.jp/i.test(href)) return RAKUTEN_AFFILIATE_REL;
  if (/qoo10\.jp/i.test(href)) return QOO10_AFFILIATE_REL;
  return "noopener noreferrer";
}
