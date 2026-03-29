/**
 * Olive Young 公式サイトの商品・店舗導線 URL 判定（一覧カードの暫定フォールバック用）
 */

function hostnameFromUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const href = /^https?:\/\//i.test(s) ? s : /^\/\//.test(s) ? `https:${s}` : `https://${s}`;
    return new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 公式 Olive Young の商品ページ・店舗導線として扱う URL か。
 * - ホスト: oliveyoung.co.kr / *.oliveyoung.co.kr、oliveyoung.com / www 等
 * - プロトコル省略や // 始まりも許容
 */
export function isOliveYoungOfficialProductUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  const lower = s.toLowerCase();
  const host = hostnameFromUrl(s);
  if (host) {
    if (host === "oliveyoung.co.kr" || host.endsWith(".oliveyoung.co.kr")) return true;
    if (host === "oliveyoung.com" || host.endsWith(".oliveyoung.com")) return true;
    if (host === "m.oliveyoung.com" || host.endsWith(".m.oliveyoung.com")) return true;
  }
  // 解析不能時はドメイン文字列の含有のみ（レガシー・コピペURL）
  if (lower.includes("oliveyoung.co.kr")) return true;
  if (/\boliveyoung\.com\b/i.test(s)) return true;
  return false;
}

/**
 * 一覧・カード用の正規化済み OY 導線 URL。
 * - Firestore の `oliveYoungUrl` があれば優先（中身はそのまま信頼）
 * - 無ければ `productUrl` が公式 OY ドメインならそれを採用
 * - それでも無ければ `pickedUrl` が公式 OY なら採用（`productUrl` が空・非公式で `pickedUrl` に公式ページがあるケース向け）
 */
export function resolveNormalizedOliveYoungUrl(
  oliveYoungUrlFromDb: string | undefined,
  productUrl: string | undefined,
  pickedUrl?: string | undefined
): string | undefined {
  const db = oliveYoungUrlFromDb?.trim();
  if (db) return db;
  const pu = productUrl?.trim();
  if (pu && isOliveYoungOfficialProductUrl(pu)) return pu;
  const pk = pickedUrl?.trim();
  if (pk && isOliveYoungOfficialProductUrl(pk)) return pk;
  return undefined;
}
