/**
 * Olive Young 公式サイトの商品・店舗導線 URL 判定（一覧カードの暫定フォールバック用）
 */

function parseOliveYoungUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const href = /^https?:\/\//i.test(s)
      ? s
      : /^\/\//.test(s)
        ? `https:${s}`
        : `https://${s}`;
    return new URL(href);
  } catch {
    return null;
  }
}

function hostnameFromUrl(raw: string): string | null {
  const u = parseOliveYoungUrl(raw);
  return u ? u.hostname.toLowerCase() : null;
}

/** 明らかに API / JSON レスポンスと思われる OY URL かどうか（商品詳細・店舗導線には使わない） */
export function isOliveYoungApiLikeUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  const lower = s.toLowerCase();

  // 拡張子・クエリから JSON/API レスポンスっぽいものを除外
  if (/\.(json|do)(\?|$)/.test(lower)) return true;
  if (/[?&]callback=/.test(lower)) return true;

  const u = parseOliveYoungUrl(lower);
  const path = u?.pathname.toLowerCase() ?? lower;

  if (path.startsWith("/api/") || path === "/api") return true;
  if (path.includes("/api/")) return true;
  if (path.includes("/goods/api") || path.includes("/goodsapi")) return true;
  if (path.includes("/article/api") || path.includes("/articles/api")) return true;

  return false;
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
  if (isOliveYoungApiLikeUrl(lower)) return false;
  const host = hostnameFromUrl(s);
  if (host) {
    const isOyHost =
      host === "oliveyoung.co.kr" ||
      host.endsWith(".oliveyoung.co.kr") ||
      host === "oliveyoung.com" ||
      host.endsWith(".oliveyoung.com") ||
      host === "m.oliveyoung.com" ||
      host.endsWith(".m.oliveyoung.com");
    if (isOyHost) {
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console -- dev debug
        console.log("[OY_URL_DEBUG] official_host", { raw, host });
      }
      return true;
    }
  }
  // 解析不能時はドメイン文字列の含有のみ（レガシー・コピペURL）
  if (lower.includes("oliveyoung.co.kr") && !isOliveYoungApiLikeUrl(lower)) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dev debug
      console.log("[OY_URL_DEBUG] fallback_contains_co_kr", { raw });
    }
    return true;
  }
  if (/\boliveyoung\.com\b/i.test(s) && !isOliveYoungApiLikeUrl(lower)) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console -- dev debug
      console.log("[OY_URL_DEBUG] fallback_contains_com", { raw });
    }
    return true;
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- dev debug
    console.log("[OY_URL_DEBUG] not_official", { raw });
  }
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

/**
 * 表示用の最終的な Olive Young 導線 URL を復元する。
 * 優先順:
 * 1. oliveYoungUrl が official なら採用
 * 2. productUrl が official なら採用
 * 3. pickedUrl が official なら採用
 * 4. それ以外は null
 */
export function resolveEffectiveOliveYoungUrl(args: {
  oliveYoungUrl?: string | null;
  productUrl?: string | null;
  pickedUrl?: string | null;
}): string | null {
  const isDev = process.env.NODE_ENV === "development";

  const trim = (v?: string | null) => (v ?? "").trim() || null;
  const candOlive = trim(args.oliveYoungUrl);
  const candProduct = trim(args.productUrl);
  const candPicked = trim(args.pickedUrl);

  let chosen: string | null = null;
  let source: "oliveYoungUrl" | "productUrl" | "pickedUrl" | "none" = "none";

  if (candOlive && isOliveYoungOfficialProductUrl(candOlive)) {
    chosen = candOlive;
    source = "oliveYoungUrl";
  } else if (candProduct && isOliveYoungOfficialProductUrl(candProduct)) {
    chosen = candProduct;
    source = "productUrl";
  } else if (candPicked && isOliveYoungOfficialProductUrl(candPicked)) {
    chosen = candPicked;
    source = "pickedUrl";
  }

  if (isDev) {
    // eslint-disable-next-line no-console -- dev debug
    console.log("[OY_EFFECTIVE_URL]", {
      raw: {
        oliveYoungUrl: args.oliveYoungUrl ?? null,
        productUrl: args.productUrl ?? null,
        pickedUrl: args.pickedUrl ?? null,
      },
      chosen,
      source,
    });
  }

  return chosen;
}
