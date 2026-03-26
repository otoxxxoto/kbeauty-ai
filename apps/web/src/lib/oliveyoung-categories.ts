/**
 * Olive Young カテゴリ
 * 商品の nameJa / name / summaryJa による簡易キーワード一致で分類
 */

export type CategorySlug =
  | "mask"
  | "serum"
  | "cream"
  | "scalp"
  | "body-care";

export const CATEGORY_SLUGS: CategorySlug[] = [
  "mask",
  "serum",
  "cream",
  "scalp",
  "body-care",
];

export const CATEGORY_DISPLAY_NAMES: Record<CategorySlug, string> = {
  mask: "マスクパック",
  serum: "美容液",
  cream: "クリーム",
  scalp: "頭皮ケア",
  "body-care": "ボディケア",
};

/** カテゴリ別メタデータ（title, description, h1） */
export const CATEGORY_META: Record<
  CategorySlug,
  { title: string; description: string; h1: string }
> = {
  mask: {
    title: "韓国マスクパック人気ランキング | Olive Young",
    description:
      "韓国オリーブヤングで人気のマスクパック商品を一覧で確認できるページです。",
    h1: "韓国マスクパック人気ランキング",
  },
  serum: {
    title: "韓国美容液人気ランキング | Olive Young",
    description:
      "韓国オリーブヤングで人気の美容液・セラム商品を一覧で確認できるページです。",
    h1: "韓国美容液人気ランキング",
  },
  cream: {
    title: "韓国クリーム人気ランキング | Olive Young",
    description:
      "韓国オリーブヤングで人気のクリーム商品を一覧で確認できるページです。",
    h1: "韓国クリーム人気ランキング",
  },
  scalp: {
    title: "韓国頭皮ケア人気ランキング | Olive Young",
    description:
      "韓国オリーブヤングで人気の頭皮ケア・スカルプ系商品を一覧で確認できるページです。",
    h1: "韓国頭皮ケア人気ランキング",
  },
  "body-care": {
    title: "韓国ボディケア人気ランキング | Olive Young",
    description:
      "韓国オリーブヤングで人気のボディケア商品を一覧で確認できるページです。",
    h1: "韓国ボディケア人気ランキング",
  },
};

const MASK_KEYWORDS = [
  "マスク",
  "マスクパック",
  "シートマスク",
  "mask",
  "마스크",
  "팩",
];
const SERUM_KEYWORDS = [
  "美容液",
  "セラム",
  "アンプル",
  "serum",
  "ampoule",
  "세럼",
  "앰플",
];
const CREAM_KEYWORDS = ["クリーム", "保湿クリーム", "cream", "크림"];

/** 頭皮・スカルプ（他より先に判定） */
const SCALP_KEYWORDS = [
  "スカルプ",
  "頭皮",
  "scalp",
  "スカルプシャンプー",
  "두피",
];
/** ボディ（フェイス用クリームより先に「ボディ」を優先） */
const BODY_CARE_KEYWORDS = [
  "ボディ",
  "ボディケア",
  "ボディローション",
  "ボディミルク",
  "ボディクリーム",
  "ハンド&ボディ",
  "body care",
  "body lotion",
  "body cream",
  "바디",
];

function buildSearchText(product: {
  nameJa?: string | null;
  name?: string | null;
  summaryJa?: string | null;
}): string {
  const parts = [
    product.nameJa ?? "",
    product.name ?? "",
    product.summaryJa ?? "",
  ].filter(Boolean);
  return parts.join(" ").toLowerCase();
}

function matchKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

/**
 * 商品をカテゴリに分類（nameJa / name / summaryJa のキーワード一致）
 */
export function detectCategory(product: {
  nameJa?: string | null;
  name?: string | null;
  summaryJa?: string | null;
}): CategorySlug | null {
  const text = buildSearchText(product);
  if (matchKeywords(text, SCALP_KEYWORDS)) return "scalp";
  if (matchKeywords(text, MASK_KEYWORDS)) return "mask";
  if (matchKeywords(text, SERUM_KEYWORDS)) return "serum";
  if (matchKeywords(text, BODY_CARE_KEYWORDS)) return "body-care";
  if (matchKeywords(text, CREAM_KEYWORDS)) return "cream";
  return null;
}

const VALID_SLUGS = new Set<string>(CATEGORY_SLUGS);

export function getCategoryBySlug(
  slug: string
): { slug: CategorySlug; displayName: string; meta: (typeof CATEGORY_META)[CategorySlug] } | null {
  const s = slug?.trim().toLowerCase();
  if (!s || !VALID_SLUGS.has(s as CategorySlug)) return null;
  const key = s as CategorySlug;
  return {
    slug: key,
    displayName: CATEGORY_DISPLAY_NAMES[key],
    meta: CATEGORY_META[key],
  };
}

export function isCategorySlug(slug: string): slug is CategorySlug {
  return VALID_SLUGS.has(slug?.trim().toLowerCase());
}

/**
 * 指定カテゴリに属する商品一覧を取得（lastRank 昇順 → name → updatedAt）
 */
export async function getProductsForCategory(
  slug: CategorySlug
): Promise<
  Array<{
    goodsNo: string;
    name: string;
    nameJa?: string;
    brand: string;
    brandJa?: string;
    amazonImage?: string;
    rakutenImage?: string;
    qoo10Image?: string;
    amazonUrl?: string;
    rakutenUrl?: string;
    qoo10Url?: string;
    imageUrl: string;
    thumbnailUrl: string;
    productUrl: string;
    lastRank: number | null;
    lastSeenRunDate: string | null;
  }>
> {
  const { getAllOliveYoungProductsMinimal } = await import(
    "@/lib/oliveyoung-products"
  );
  const all = await getAllOliveYoungProductsMinimal();
  const filtered = all.filter((p) => detectCategory(p) === slug);
  const rankNum = (r: number | null) => (r != null && Number.isFinite(r) ? r : 999999);
  const updatedAtMs = (u: unknown): number => {
    if (!u) return 0;
    if (typeof u === "object" && u !== null && "toDate" in u && typeof (u as { toDate: () => Date }).toDate === "function") {
      return (u as { toDate: () => Date }).toDate().getTime();
    }
    return 0;
  };
  filtered.sort((a, b) => {
    const ra = rankNum(a.lastRank);
    const rb = rankNum(b.lastRank);
    if (ra !== rb) return ra - rb;
    const na = (a.nameJa ?? a.name ?? "").trim();
    const nb = (b.nameJa ?? b.name ?? "").trim();
    if (na !== nb) return na.localeCompare(nb);
    return updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt);
  });
  return filtered.map((p) => ({
    goodsNo: p.goodsNo,
    name: p.name,
    nameJa: p.nameJa,
    brand: p.brand,
    brandJa: p.brandJa,
    amazonImage: p.amazonImage,
    rakutenImage: p.rakutenImage,
    qoo10Image: p.qoo10Image,
    amazonUrl: p.amazonUrl,
    rakutenUrl: p.rakutenUrl,
    qoo10Url: p.qoo10Url,
    imageUrl: p.imageUrl,
    thumbnailUrl: p.thumbnailUrl,
    productUrl: p.productUrl,
    lastRank: p.lastRank,
    lastSeenRunDate: p.lastSeenRunDate,
  }));
}
