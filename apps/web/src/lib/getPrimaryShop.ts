import type {
  AffiliateMarketplace,
  PrimaryShop,
} from "@/lib/product-marketplace-types";

/** 明示URLのみで優先ショップを決定（検索URLフォールバックは含めない） */
export type PrimaryShopUrlInput = {
  amazonUrl?: string;
  qoo10Url?: string;
  rakutenUrl?: string;
  /** 商品ページURL（OY）。productUrl と別名で持つ場合用 */
  oliveYoungUrl?: string;
};

const AFFILIATE_ORDER: Record<PrimaryShop, AffiliateMarketplace[]> = {
  amazon: ["amazon", "rakuten", "qoo10"],
  qoo10: ["qoo10", "rakuten", "amazon"],
  rakuten: ["rakuten", "qoo10", "amazon"],
  /** OYのみのときはアフィリエイト行は別扱い（空＝マーケットCTA非表示のシグナル） */
  oliveyoung: [],
};

/** 未確定時は韓国コスメ向けに Qoo10 を先に */
const DEFAULT_AFFILIATE_ORDER: AffiliateMarketplace[] = [
  "qoo10",
  "rakuten",
  "amazon",
];

/**
 * 1. amazonUrl → amazon
 * 2. qoo10Url → qoo10
 * 3. rakutenUrl → rakuten
 * 4. oliveYoungUrl → oliveyoung
 * 5. なし → null
 */
export function getPrimaryShop(input: PrimaryShopUrlInput): PrimaryShop | null {
  const a = input.amazonUrl?.trim();
  const q = input.qoo10Url?.trim();
  const r = input.rakutenUrl?.trim();
  const o = input.oliveYoungUrl?.trim();
  if (a) return "amazon";
  if (q) return "qoo10";
  if (r) return "rakuten";
  if (o) return "oliveyoung";
  return null;
}

export function resolvePrimaryShop(
  override: PrimaryShop | null | undefined,
  input: PrimaryShopUrlInput
): PrimaryShop | null {
  if (override != null) return override;
  return getPrimaryShop(input);
}

export function hasExplicitAffiliateUrl(p: {
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
}): boolean {
  return !!(
    p.amazonUrl?.trim() ||
    p.rakutenUrl?.trim() ||
    p.qoo10Url?.trim()
  );
}

/**
 * Amazon/楽天/Qoo10 の明示URLが無く、かつ primaryShop が oliveyoung（または専用 oliveYoungUrl のみ）のとき:
 * 検索フォールバックのアフィリエイトCTAを出さない（OY専用導線に寄せる）。
 * ※ productUrl（クロール由来の通常OYリンク）はここに含めない（全件 oliveyoung 扱いになるため）。
 */
export function shouldSuppressAffiliateCtasForProduct(p: {
  primaryShop?: PrimaryShop | null;
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  /** Firestore 専用。未設定なら primaryShop のみで判定 */
  oliveYoungUrl?: string;
}): boolean {
  if (hasExplicitAffiliateUrl(p)) return false;
  const explicit = resolvePrimaryShop(p.primaryShop, {
    amazonUrl: p.amazonUrl,
    qoo10Url: p.qoo10Url,
    rakutenUrl: p.rakutenUrl,
    oliveYoungUrl: p.oliveYoungUrl?.trim() || undefined,
  });
  return explicit === "oliveyoung";
}

/**
 * CTA 並び用。productUrl は渡さない（常にセットのため primary が歪む）。
 */
export function getPrimaryShopFromProduct(p: {
  primaryShop?: PrimaryShop | null;
  amazonUrl?: string;
  rakutenUrl?: string;
  qoo10Url?: string;
  oliveYoungUrl?: string;
}): PrimaryShop | null {
  return resolvePrimaryShop(p.primaryShop, {
    amazonUrl: p.amazonUrl,
    qoo10Url: p.qoo10Url,
    rakutenUrl: p.rakutenUrl,
    oliveYoungUrl: p.oliveYoungUrl?.trim() || undefined,
  });
}

/**
 * アフィリエイトCTAの表示順（href は呼び出し側で effective から解決）
 */
export function getAffiliateCtaOrder(
  primaryShop: PrimaryShop | null
): AffiliateMarketplace[] {
  if (primaryShop === "oliveyoung") return [];
  if (primaryShop && primaryShop in AFFILIATE_ORDER) {
    return AFFILIATE_ORDER[primaryShop];
  }
  return DEFAULT_AFFILIATE_ORDER;
}

type CompareRowShop = "amazon" | "rakuten" | "qoo10";

/** 比較CTA行を primaryShop の並びに揃える（存在する行のみ・余りは末尾） */
export function orderCompareCtaRows<T extends { shop: CompareRowShop; href: string }>(
  rows: T[],
  primaryShop: PrimaryShop | null
): T[] {
  const order = getAffiliateCtaOrder(primaryShop);
  const byShop = new Map(rows.map((r) => [r.shop, r]));
  const seen = new Set<CompareRowShop>();
  const out: T[] = [];
  for (const s of order) {
    const row = byShop.get(s);
    if (row?.href?.trim()) {
      out.push(row);
      seen.add(s);
    }
  }
  for (const r of rows) {
    if (!seen.has(r.shop) && r.href?.trim()) out.push(r);
  }
  return out;
}
