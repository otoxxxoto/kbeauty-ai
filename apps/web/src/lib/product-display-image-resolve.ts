/**
 * 商品表示画像の解決（Firestore 非依存）。
 * クライアントコンポーネントから import しても Node 専用モジュールを引きずらない。
 */

/** Firestore imageAnalysis[] の1要素（Vision Job が書き込み） */
export type ProductImageAnalysisEntry = {
  url: string;
  containsPerson: boolean;
  confidence?: number;
  isPreferredProductImage?: boolean;
  /** OY 公式クロール由来（Vision Job が付与。モール画像行には通常無し） */
  isOliveYoungOriginal?: boolean;
};

/** Amazon / 楽天 / Qoo10 由来の商品画像URL（検索マッチJob等で投入） */
export type ProductMarketplaceImages = {
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
};

export type ProductImageFields = ProductMarketplaceImages & {
  imageUrl?: string;
  thumbnailUrl?: string;
  /** OY 専用画像 URL（getProductImage チェーン用） */
  oliveYoungImageUrl?: string;
  /** 明示モール画像（Vision strong パスとは別。収益フォールバックで利用） */
  amazonImageUrl?: string;
  rakutenImageUrl?: string;
  qoo10ImageUrl?: string;
  imageUrls?: string[];
  /** Vision Job: 公式系など人物なしと判定した表示用URL */
  safeImageUrl?: string;
  hasSafeProductImage?: boolean;
  imageAnalysis?: ProductImageAnalysisEntry[];
  /** マーケット補完 Job が保存。メタがある場合は strong のチャネルのみ表示に使う */
  marketplaceImageMatchLevels?: Partial<
    Record<"amazon" | "rakuten" | "qoo10", "strong" | "weak">
  >;
};

/** 表示用プレースホルダー（同一オリジンの静的 SVG） */
export const OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH =
  "/oliveyoung-product-placeholder.svg";

export type ProductDisplayImageSource =
  | "safe_image"
  | "oy_official_safe"
  | "marketplace_strong"
  | "fallback_placeholder";

export type ProductDisplayImageResolution = {
  url: string;
  source: ProductDisplayImageSource;
  /** 「公式画像」バッジは safe_image / oy_official_safe（人物なし）のみ true */
  showOfficialImageBadge: boolean;
};

/** 将来・デバッグ用。true のときのみ OY URL を解析なし・人物ありでも表示可（バッジは付けない）。既定は使わない */
function allowOyPersonImageFromEnv(): boolean {
  return process.env.ALLOW_OY_PERSON_IMAGE === "true";
}

/** Amazon / 楽天 / Qoo10 系 CDN とみなすホスト判定（画像フォールバック等で共有） */
export function isMarketplaceHostUrl(url: string): boolean {
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

/** OY 公式クロール由来とみなす URL（Amazon/楽天/Qoo10 CDN 以外） */
export function isOliveYoungStyleProductImageUrl(url: string): boolean {
  return url.trim() !== "" && !isMarketplaceHostUrl(url);
}

/** OY 公式クロール由来とみなす画像 URL を imageUrl → thumbnailUrl → imageUrls の順で重複除去して列挙（レポート・ジョブ用） */
export function collectOyOrderedImageUrls(
  p: Pick<ProductImageFields, "imageUrl" | "thumbnailUrl" | "imageUrls">
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u?: string) => {
    const t = (u ?? "").trim();
    if (!t || seen.has(t)) return;
    if (!isOliveYoungStyleProductImageUrl(t)) return;
    seen.add(t);
    out.push(t);
  };
  push(p.imageUrl);
  push(p.thumbnailUrl);
  for (const x of p.imageUrls ?? []) {
    if (typeof x === "string") push(x);
  }
  return out;
}

function marketplaceChannelAllowed(
  levels: ProductImageFields["marketplaceImageMatchLevels"],
  channel: "amazon" | "rakuten" | "qoo10"
): boolean {
  if (!levels || typeof levels !== "object") return true;
  const keys = Object.keys(levels).filter((k) =>
    ["amazon", "rakuten", "qoo10"].includes(k)
  );
  if (keys.length === 0) return true;
  return levels[channel] === "strong";
}

/** 公開面の人物判定に利用（URL 完全一致で imageAnalysis を引く） */
export function imageAnalysisEntryForProductUrl(
  p: Pick<ProductImageFields, "imageAnalysis">,
  url: string
): ProductImageAnalysisEntry | undefined {
  const t = url.trim();
  return p.imageAnalysis?.find((e) => e.url === t);
}

/**
 * 表示用画像の解決（詳細・一覧・API 共通）。
 *
 * 優先順:
 * 1. safeImageUrl
 * 2. OY 公式 URL（モール以外）のうち imageAnalysis で containsPerson===false と判定できるもののみ
 * 3. マーケット画像（imageAnalysis で人物なし、かつ marketplaceImageMatchLevels が strong またはメタ未設定）
 * 4. 静的プレースホルダー SVG
 *
 * ALLOW_OY_PERSON_IMAGE=true のときのみ (2) で解析欠如・人物ありも表示可（バッジなし・通常運用では使わない）。
 */
export function resolveProductDisplayImage(
  p: ProductImageFields
): ProductDisplayImageResolution {
  const safe = (p.safeImageUrl ?? "").trim();
  if (safe) {
    return {
      url: safe,
      source: "safe_image",
      showOfficialImageBadge: true,
    };
  }

  const allowOyPerson = allowOyPersonImageFromEnv();
  for (const u of collectOyOrderedImageUrls(p)) {
    const a = imageAnalysisEntryForProductUrl(p, u);
    if (a && !a.containsPerson) {
      return {
        url: u,
        source: "oy_official_safe",
        showOfficialImageBadge: true,
      };
    }
    if (allowOyPerson && (!a || a.containsPerson)) {
      return {
        url: u,
        source: "oy_official_safe",
        showOfficialImageBadge: false,
      };
    }
  }

  const tryMarketplace = (
    u: string | undefined,
    channel: "amazon" | "rakuten" | "qoo10"
  ): string => {
    const url = (u ?? "").trim();
    if (!url) return "";
    if (!marketplaceChannelAllowed(p.marketplaceImageMatchLevels, channel))
      return "";
    const a = imageAnalysisEntryForProductUrl(p, url);
    if (!a) return "";
    if (a.containsPerson) return "";
    return url;
  };

  const amz = tryMarketplace(p.amazonImage, "amazon");
  if (amz) {
    return {
      url: amz,
      source: "marketplace_strong",
      showOfficialImageBadge: false,
    };
  }
  const rak = tryMarketplace(p.rakutenImage, "rakuten");
  if (rak) {
    return {
      url: rak,
      source: "marketplace_strong",
      showOfficialImageBadge: false,
    };
  }
  const q = tryMarketplace(p.qoo10Image, "qoo10");
  if (q) {
    return {
      url: q,
      source: "marketplace_strong",
      showOfficialImageBadge: false,
    };
  }

  return {
    url: OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH,
    source: "fallback_placeholder",
    showOfficialImageBadge: false,
  };
}

export function resolveProductDisplayImageUrl(p: ProductImageFields): string {
  return resolveProductDisplayImage(p).url;
}

export function productDisplayImageIsPlaceholder(url: string): boolean {
  const t = url.trim();
  return (
    t === OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH ||
    t.endsWith("oliveyoung-product-placeholder.svg")
  );
}

/**
 * `safeImageUrl` が無く、かつ OY 系の画像 URL が1件以上ある（Firestore 上の生データ観点）。
 */
export function hasOyStyleUrlsButNoSafeImageUrl(p: ProductImageFields): boolean {
  if ((p.safeImageUrl ?? "").trim()) return false;
  return collectOyOrderedImageUrls(p).length > 0;
}

/**
 * 通常モード（ALLOW_OY_PERSON_IMAGE オフ）で表示がプレースホルダーに落ち、
 * OY 系 URL がすべて Vision で「人物あり」と解析済みである場合に true。
 * （解析欠如の OY URL がある商品は含めない＝別パイプライン課題）
 */
export function isOyPersonAnalyzedAllContainPersonAndPlaceholder(
  p: ProductImageFields
): boolean {
  if (allowOyPersonImageFromEnv()) return false;
  const r = resolveProductDisplayImage(p);
  if (r.source !== "fallback_placeholder") return false;
  const oy = collectOyOrderedImageUrls(p);
  if (oy.length === 0) return false;
  for (const u of oy) {
    const a = imageAnalysisEntryForProductUrl(p, u);
    if (!a) return false;
    if (!a.containsPerson) return false;
  }
  return true;
}
