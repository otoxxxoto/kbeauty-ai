/**
 * 検索結果から商品画像を選ぶための暫定マッチング。
 * - ブランド一致（タイトルにブランド文字列が含まれる）
 * - 商品名の部分一致（トークン重なり / 部分文字列）
 * - 容量表記一致（ml/g/L 等。参照側に容量がある場合は候補にも必要）
 */

import { isUnsafeNameJa } from "../lib/oliveyoung/nameJaQuality";

/** 検索用クエリから除去するノイズ語（日本語・韓国語） */
const NOISE_PATTERNS = [
  /\s*企画\s*/g,
  /\s*限定企画\s*/g,
  /\s*限定\s*/g,
  /\s*ダブルセット\s*/g,
  /\s*ダブル\s*/g,
  /\s*セット\s*/g,
  /\s*サンプル付\s*/g,
  /\s*特典\s*/g,
  /\s*プレゼント\s*/g,
  /\s*증정\s*/g,
  /\s*기획\s*/g,
  /\s*더블\s*/g,
  /\s*택\s*1\s*/gi,
  /\s*택1\s*/g,
  /\s*N택1\s*/gi,
  /\s*〇種から選択\s*/g,
  /\s*[一二三四五六七八九十\d]+種から選択\s*/g,
  /\s*에디션\s*/g,
  /\s*\+[^\s]+(?=\s|$)/g,
  /\s*プラス[^\s]*/g,
  /\s*＋[^\s]+(?=\s|$)/g,
];

/** 美容機器・ローラー系: 付属・企画語を強めに削る（normalizeSearchLabel 後に追加適用） */
const DEVICE_EXTRA_NOISE_PATTERNS: RegExp[] = [
  /\s*プレゼント\s*/g,
  /\s*限定企画\s*/g,
  /\s*ミニプラス\s*/g,
  /\s*ミニ\s*プラス\s*/g,
  /\s*ローラーヘッド\s*/gi,
  /\s*[vVＶ]\s*ローラー\s*ヘッド\s*/gi,
  /\s*付属品\s*/g,
  /\s*付属\s*/g,
  /\s*ヘッド\s*/g,
  /\s*한정기획\s*/g,
  /\s*한정\s*/g,
  /\s*사은품\s*/g,
  /\s*전용\s*퍼프\s*/g,
  /\s*専用\s*パフ\s*/g,
];

export type MarketplaceProductType =
  | "device"
  | "skincare"
  | "makeup"
  | "lipcare"
  | "cleanser"
  | "other";

/** weak 採用を許可するのはコスメ系のみ（device / other は strong のみ） */
const WEAK_ADOPTION_ALLOWED_TYPES: ReadonlySet<MarketplaceProductType> = new Set([
  "skincare",
  "makeup",
  "lipcare",
  "cleanser",
]);

export function isWeakAdoptionAllowedForProductType(
  t: MarketplaceProductType
): boolean {
  return WEAK_ADOPTION_ALLOWED_TYPES.has(t);
}

/** ログ用: 許可される採用レベル */
export function allowedMatchLevelsLabelForProductType(t: MarketplaceProductType): "strong" | "strong|weak" {
  return isWeakAdoptionAllowedForProductType(t) ? "strong|weak" : "strong";
}

type LabelInput = {
  nameJa?: string | null;
  name?: string | null;
  brandJa?: string | null;
  brand?: string | null;
};

/**
 * 商品名・ブランドからマーケット検索向けカテゴリを推定（device は検索語圧縮に使用）
 */
export function detectMarketplaceProductType(p: LabelInput): MarketplaceProductType {
  const blob = `${p.nameJa ?? ""} ${p.name ?? ""} ${p.brandJa ?? ""} ${p.brand ?? ""}`
    .normalize("NFKC")
    .toLowerCase();

  const deviceRe =
    /美顔器|ローラー|デバイス|기기|롤러|부스터|ブースター|ブースタージェル|v\s*ローラー|vローラー|ｖローラー|age[-\s]*r|エイジ\s*[rｒ]|エイジーアール|エイジアール|メソッド|高周波|\bems\b|\brf\b/i;
  if (deviceRe.test(blob)) return "device";

  if (/洗顔|クレンジング|cleansing|클렌징|폼|フォーム/.test(blob)) return "cleanser";
  if (/リップ|립|ティント|tint|口紅|唇/.test(blob)) return "lipcare";
  if (
    /アイシャドウ|アイライナー|マスカラ|チーク|ファンデ|コンシーラ|パウダー|メイク/.test(blob)
  ) {
    return "makeup";
  }
  if (
    /クリーム|美容液|セラム|エッセンス|トナー|化粧水|乳液|パック|マスク|アンプル|ampoule|serum|토너|에센스|크림/.test(
      blob
    )
  ) {
    return "skincare";
  }
  return "other";
}

/** 型ライン（AGE-R / エイジR）を抽出・表記統一 */
export function extractDeviceModelLine(source: string): string {
  const t = source.normalize("NFKC");
  if (/エイジーアール|エイジアール/.test(t)) return "エイジR";
  if (/エイジ\s*[RＲr]/.test(t)) return "エイジR";
  if (/age[-\s]*r/i.test(source)) return "エイジR";
  return "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ブランド語を除き、ブースター / Vローラー 等の主機能語を残す */
export function buildDeviceCorePhrase(mainProductName: string, brandStrings: string[]): string {
  let t = mainProductName.normalize("NFKC").trim();
  for (const b of brandStrings) {
    const bb = b.trim();
    if (bb.length >= 2) {
      t = t.replace(new RegExp(escapeRegExp(bb), "g"), " ");
    }
  }
  t = t.replace(/ブースタージェル/g, "ブースター");
  t = t.replace(/\broller\b/gi, "ローラー");
  t = t.replace(/\bbooster\b/gi, "ブースター");
  t = t.replace(/\s*([VＶv])\s*ローラー/gi, " Vローラー");
  t = t.replace(/ｖ\s*ローラー/gi, " Vローラー");
  t = removeVolumeFromProductName(t);
  t = t.replace(/\s*ジェル\s*/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** 検索用に主機能語の空白を詰める（例: ブースター Vローラー → ブースターVローラー） */
export function compactDeviceCoreForQuery(core: string): string {
  let s = core.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*([VＶv])\s*ローラー/gi, "Vローラー");
  s = s.replace(/\s*ブースター\s*/g, "ブースター");
  s = s.replace(/ブースター\s+Vローラー/gi, "ブースターVローラー");
  s = s.replace(/ /g, "");
  s = s.replace(/[Ｖｖ]/g, "V");
  return s.trim();
}

/**
 * type=device 向け検索語 A→D（狭い順）。ブランド・型・主機能語の組合せ。
 */
export function buildDeviceMarketplaceSearchQueries(label: MarketplaceSearchLabel): string[] {
  const brand = label.brand.trim();
  const model = extractDeviceModelLine(
    `${label.originalNameJa} ${label.originalName} ${label.mainProductName}`
  );
  const brands = [label.brand, label.brandJa ?? ""].map((x) => x.trim()).filter((x) => x.length >= 2);
  let coreSpaced = buildDeviceCorePhrase(label.mainProductName, brands);
  if (!coreSpaced.trim() && model) {
    coreSpaced = `${model} ブースター`.trim();
  }
  if (!coreSpaced.trim()) {
    coreSpaced = label.mainProductName.trim();
  }
  const core = compactDeviceCoreForQuery(coreSpaced);

  const queries: string[] = [];
  if (brand && model && core) queries.push(`${brand} ${model} ${core}`.trim());
  if (brand && core) queries.push(`${brand} ${core}`.trim());
  if (model && core) queries.push(`${model} ${core}`.trim());
  if (core) queries.push(core);
  if (coreSpaced && coreSpaced.replace(/\s+/g, "") !== core) {
    queries.push(coreSpaced.slice(0, 180));
  }
  return queries;
}

function buildGenericMarketplaceSearchQueries(label: MarketplaceSearchLabel): string[] {
  const { mainProductName, brand, volume } = label;
  if (!mainProductName.trim()) return [];

  const queries: string[] = [];
  const withVolume = volume ? `${mainProductName} ${volume}`.trim() : mainProductName;

  if (brand && volume) {
    queries.push(`${brand} ${withVolume}`.trim());
  }
  if (brand) {
    queries.push(`${brand} ${mainProductName}`.trim());
  }
  if (volume) {
    queries.push(withVolume);
  }
  queries.push(mainProductName);

  return queries;
}

/** 括弧内を除去（外側の括弧種は維持） */
function removeBracketContents(s: string): string {
  let out = s;
  out = out.replace(/\[[^\]]*\]/g, " ");
  out = out.replace(/【[^】]*】/g, " ");
  out = out.replace(/（[^）]*）/g, " ");
  out = out.replace(/\([^)]*\)/g, " ");
  out = out.replace(/［[^］]*］/g, " ");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

/** 検索用ラベルからノイズを除去（容量は残す） */
export function normalizeSearchLabel(s: string): string {
  if (!s || typeof s !== "string") return "";
  let out = removeBracketContents(s.trim());
  for (const re of NOISE_PATTERNS) {
    out = out.replace(re, " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/** 機器系: 通常ノイズ除去に加え付属・企画語を削り、ブースタージェル→ブースター */
export function normalizeSearchLabelForDevice(s: string): string {
  let out = normalizeSearchLabel(s);
  for (const re of DEVICE_EXTRA_NOISE_PATTERNS) {
    out = out.replace(re, " ");
  }
  out = out.replace(/ブースタージェル/g, "ブースター");
  out = out.replace(/ブースター\s+ジェル/g, "ブースター");
  out = out.replace(/\s+/g, " ").trim();
  return out;
}

/** 容量表記を抽出（例: 95ml, 11ml, 100g） */
export function extractVolumeString(text: string): string {
  const t = (text || "").trim();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(ml|g|oz|l)\b/i);
  if (!m) return "";
  const num = m[1].replace(",", ".");
  const unit = m[2].toLowerCase();
  return `${num}${unit}`;
}

/** 主商品名から容量表記を除去 */
function removeVolumeFromProductName(s: string): string {
  return (s || "").replace(/\s*\d+(?:[.,]\d+)?\s*(?:ml|g|oz|l)\b\s*/gi, " ").replace(/\s+/g, " ").trim();
}

export type MarketplaceSearchLabel = {
  productName: string;
  mainProductName: string;
  brand: string;
  /** 韓国語ブランド等（主機能語抽出時に名前から除去） */
  brandJa?: string;
  volume: string;
  originalNameJa: string;
  originalName: string;
  marketplaceProductType: MarketplaceProductType;
};

/**
 * マーケット検索用の searchLabel を構築。
 * 優先: safe な nameJa → name。ブランドは別変数で保持。
 * device 型は検索ラベルを機器向けに圧縮。
 */
export function buildMarketplaceSearchLabel(
  p: LabelInput,
  options?: { productType?: MarketplaceProductType }
): MarketplaceSearchLabel {
  const marketplaceProductType = options?.productType ?? detectMarketplaceProductType(p);
  const brand = (p.brandJa?.trim() || p.brand?.trim() || "").trim();
  const brandJaOnly = p.brandJa?.trim() || undefined;
  const ctx = { brand, brandJa: brandJaOnly };

  let rawName = "";
  if (p.nameJa?.trim() && !isUnsafeNameJa(p.nameJa, ctx)) {
    rawName = p.nameJa.trim();
  } else if (p.name?.trim()) {
    rawName = p.name.trim();
  }

  const productName =
    marketplaceProductType === "device"
      ? normalizeSearchLabelForDevice(rawName)
      : normalizeSearchLabel(rawName);
  const volume = extractVolumeString(rawName);
  const mainProductName = removeVolumeFromProductName(productName) || productName;

  return {
    productName,
    mainProductName,
    brand,
    brandJa: brandJaOnly,
    volume,
    originalNameJa: (p.nameJa || "").trim(),
    originalName: (p.name || "").trim(),
    marketplaceProductType,
  };
}

function dedupeQueriesPreserveOrder(queries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of queries) {
    const t = q.trim();
    if (t.length < 2) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t.slice(0, 180));
  }
  return out;
}

/**
 * 段階検索用クエリ。
 * - device: ブランド+型+主機能（A→D）を先頭にし、圧縮ラベルでの汎用段階を後ろに少しだけ付与
 * - その他: 従来どおり 容量・ブランド・主名の組合せ
 */
export function buildMarketplaceSearchQueries(label: MarketplaceSearchLabel): string[] {
  if (!label.mainProductName.trim()) return [];

  if (label.marketplaceProductType === "device") {
    const deviceQs = buildDeviceMarketplaceSearchQueries(label);
    const genericQs = buildGenericMarketplaceSearchQueries(label);
    const merged = [...deviceQs, ...genericQs.slice(0, 3)];
    return dedupeQueriesPreserveOrder(merged);
  }

  return dedupeQueriesPreserveOrder(buildGenericMarketplaceSearchQueries(label));
}

export function normalizeMatchText(s: string): string {
  return (s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * タイトル比較用: 検索ラベル正規化 → NFKC・小文字・記号除去・空白圧縮・容量表記の詰め
 */
export function normalizeTitleForMatch(s: string): string {
  if (!s || typeof s !== "string") return "";
  let out = normalizeSearchLabel(s.trim());
  out = out.normalize("NFKC").toLowerCase();
  out = out.replace(/[^\p{L}\p{N}\s]/gu, " ");
  out = out.replace(/\s+/g, " ").trim();
  out = out.replace(/(\d+(?:[.,]\d+)?)\s*(ml|g|oz|l)\b/gi, (_, n: string, u: string) => {
    return `${n.replace(",", ".")}${u.toLowerCase()}`;
  });
  return out.replace(/\s+/g, " ").trim();
}

/** ブランド表記ゆれ（全半角・空白）を寄せた比較用キー */
function brandNormKey(s: string): string {
  return normalizeTitleForMatch(s).replace(/\s+/g, "");
}

/** 同長文字列で置換 1 文字まで許容（カタカナ表記ゆれ用・例: オプラ / オフラ） */
function hammingAtMostOne(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
    if (diff > 1) return false;
  }
  return true;
}

function brandFuzzyInCandidateTitle(brandCompact: string, candCompact: string): boolean {
  if (brandCompact.length < 3 || brandCompact.length > 16) return false;
  const L = brandCompact.length;
  for (let i = 0; i + L <= candCompact.length; i++) {
    const slice = candCompact.slice(i, i + L);
    if (hammingAtMostOne(brandCompact, slice)) return true;
  }
  return false;
}

/** 容量を正規化キーに（例 50ml, 100g） */
export function extractVolumeKeys(text: string): Set<string> {
  const t = (text || "").toLowerCase();
  const set = new Set<string>();
  const re = /(\d+(?:[.,]\d+)?)\s*(ml|g|oz|l)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const num = m[1].replace(",", ".");
    let unit = m[2].toLowerCase();
    if (unit === "m") unit = "ml";
    set.add(`${num}${unit}`);
  }
  return set;
}

export function brandMatchesTitle(brand: string, title: string): boolean {
  const b = normalizeMatchText(brand);
  const ti = normalizeMatchText(title);
  if (!b || b.length < 2) return true;
  return ti.includes(b);
}

export function nameOverlapScore(reference: string, candidateTitle: string): number {
  const ref = normalizeMatchText(reference);
  const cand = normalizeMatchText(candidateTitle);
  if (!ref) return 0.4;
  if (cand.includes(ref) || ref.includes(cand)) return 0.95;
  const refTokens = ref.split(/[\s/・，,、|]+/).filter((t) => t.length >= 2);
  if (refTokens.length === 0) return 0.3;
  let hit = 0;
  for (const tok of refTokens) {
    if (cand.includes(tok)) hit++;
  }
  return hit / refTokens.length;
}

export function volumeMatches(reference: string, candidateTitle: string): boolean {
  const r = extractVolumeKeys(reference);
  const c = extractVolumeKeys(candidateTitle);
  if (r.size === 0) return true;
  if (c.size === 0) return false;
  for (const k of r) {
    if (c.has(k)) return true;
  }
  return false;
}

export type ImageMatchCandidate = { title: string; imageUrl: string };

export type ProductForImageMatch = {
  brand: string;
  brandJa?: string;
  name: string;
  nameJa?: string;
};

export type MarketplaceImageMatchLevel = "strong" | "weak";

function collectBrandStrings(p: ProductForImageMatch): string[] {
  const ja = p.brandJa?.trim();
  const ko = p.brand?.trim();
  const set = new Set<string>();
  if (ja) set.add(ja);
  if (ko) set.add(ko);
  return [...set];
}

/** いずれかのブランド表記がタイトル（正規化）に含まれる／ブランド未設定なら true */
export function brandMatchesProductTitle(
  product: ProductForImageMatch,
  candidateTitle: string
): boolean {
  const brands = collectBrandStrings(product);
  const cand = normalizeTitleForMatch(candidateTitle);
  const meaningful = brands.filter((b) => brandNormKey(b).length >= 2);
  if (meaningful.length === 0) return true;
  const candCompact = cand.replace(/\s+/g, "");
  for (const b of meaningful) {
    const bn = normalizeTitleForMatch(b);
    const bk = brandNormKey(b);
    if (bn && cand.includes(bn)) return true;
    if (bk.length >= 2 && candCompact.includes(bk)) return true;
    if (brandFuzzyInCandidateTitle(bk, candCompact)) return true;
  }
  return false;
}

/**
 * 参照商品名からキーワードヒット数（区切り＋部分一致補助）
 */
export function countKeywordOverlapHits(refNorm: string, candNorm: string): number {
  if (!refNorm) return 0;
  if (candNorm.includes(refNorm)) return Math.max(3, 2);
  if (refNorm.includes(candNorm) && candNorm.length >= 4) return 2;
  const tokens = refNorm.split(/[\s/・，,、|]+/).filter((t) => t.length >= 2);
  let hits = 0;
  const seen = new Set<string>();
  for (const t of tokens) {
    if (candNorm.includes(t) && !seen.has(t)) {
      seen.add(t);
      hits++;
    }
  }
  if (hits === 0 && refNorm.length >= 5) {
    const step = 3;
    for (let i = 0; i + 4 <= refNorm.length; i += step) {
      const frag = refNorm.slice(i, i + 4);
      if (frag.length >= 4 && candNorm.includes(frag)) hits++;
    }
    hits = Math.min(hits, 6);
  }
  return hits;
}

export type MarketplaceCandidateMatchDetail = {
  score: number;
  brandMatched: boolean;
  keywordOverlapCount: number;
  sizeMatched: boolean;
  normalizedCandidateTitle: string;
  normalizedRefName: string;
  matchLevel: MarketplaceImageMatchLevel | null;
  /** 型名・シリーズ・主機能語（AGE-R / Vローラー / ブースター等）の参照↔候補一致 */
  modelLineMatched: boolean;
  /** detectMarketplaceProductType === "device" で別ルールを適用したか */
  deviceRuleApplied: boolean;
  /** strong/weak に入らなかった主因（採用時は null） */
  whyRejected: string | null;
};

/**
 * 参照テキストに現れる device ライン指標ごとに、候補正規化タイトルへ同指標が含まれるか。
 * 指標が参照に1つも無い場合は false（keywordOverlap + 容量ルートに寄せる）
 */
export function computeModelLineMatched(referenceBlob: string, candNorm: string): boolean {
  const refL = (referenceBlob || "").normalize("NFKC").toLowerCase();
  const candL = candNorm || "";

  type Pair = { ref: RegExp; cand: RegExp };
  const pairs: Pair[] = [
    {
      ref: /エイジーアール|エイジアール|エイジ\s*[rｒ]|age[-\s]*r|에이지\s*알|에이지알/,
      cand: /エイジーアール|エイジアール|エイジ\s*[rｒ]|age[-\s]*r|에이지\s*알|에이지알|a\s*g\s*e\s*[-]?\s*r/,
    },
    {
      ref: /v\s*ローラー|vローラー|ｖローラー|ブイ\s*ローラー|브이\s*롤러|브이롤러|v\s*roller/,
      cand: /v\s*ローラー|vローラー|ｖローラー|ブイ\s*ローラー|브이\s*롤러|브이롤러|v\s*roller/,
    },
    {
      ref: /ブースター|booster|부스터/,
      cand: /ブースター|booster|부스터/,
    },
  ];

  const active = pairs.filter((p) => p.ref.test(refL));
  if (active.length === 0) return false;
  return active.every((p) => p.cand.test(candL));
}

function computeMatchWhyRejected(p: {
  productType: MarketplaceProductType;
  deviceRuleApplied: boolean;
  matchLevel: MarketplaceImageMatchLevel | null;
  brandMatched: boolean;
  modelLineMatched: boolean;
  keywordOverlapCount: number;
  sizeMatched: boolean;
  refHasVolume: boolean;
}): string | null {
  if (p.matchLevel === "strong") return null;
  if (p.matchLevel === "weak" && !isWeakAdoptionAllowedForProductType(p.productType)) {
    return p.productType === "device"
      ? "weak_not_allowed_for_device"
      : "weak_not_allowed_for_product_type";
  }
  if (p.matchLevel === "weak") return null;
  if (p.deviceRuleApplied) {
    const { modelLineMatched: ml, keywordOverlapCount: kw, sizeMatched: volOk, refHasVolume } = p;
    const weak2 = kw >= 3 && volOk;
    const weak1 = ml && kw >= 1;
    if (weak1 || weak2) return null;

    if (ml && kw < 1) return "low_keyword_overlap";
    if (refHasVolume && !volOk && kw >= 3) return "size_mismatch";
    if (!ml && kw < 3) return "no_model_line";
    return "low_keyword_overlap";
  }
  if (!p.brandMatched) return "no_brand";
  if (p.refHasVolume && !p.sizeMatched) return "size_mismatch";
  return "low_keyword_overlap";
}

/**
 * 1 候補の strong / weak 判定とスコア（ログ・ソート用）
 */
export function analyzeMarketplaceImageCandidate(
  product: ProductForImageMatch,
  candidate: ImageMatchCandidate
): MarketplaceCandidateMatchDetail {
  const rawName = (product.nameJa?.trim() || product.name?.trim() || "").trim();
  const refNameNorm = normalizeTitleForMatch(rawName);
  const candNorm = normalizeTitleForMatch(candidate.title);
  const refBlob = `${rawName} ${collectBrandStrings(product).join(" ")}`.trim();
  const refHasVolume = extractVolumeKeys(refBlob).size > 0;
  const volOk = volumeMatches(refBlob, candidate.title);
  const brandMatched = brandMatchesProductTitle(product, candidate.title);
  const keywordOverlapCount = countKeywordOverlapHits(refNameNorm, candNorm);
  const overlapRatio = nameOverlapScore(rawName, candidate.title);

  const productType = detectMarketplaceProductType(product);
  const deviceRuleApplied = productType === "device";
  const modelLineMatched = computeModelLineMatched(refBlob, candNorm);

  let matchLevel: MarketplaceImageMatchLevel | null = null;
  if (deviceRuleApplied) {
    const strongVol = !refHasVolume || volOk;
    if (modelLineMatched && keywordOverlapCount >= 2 && strongVol) {
      matchLevel = "strong";
    } else if (
      (modelLineMatched && keywordOverlapCount >= 1) ||
      (keywordOverlapCount >= 3 && volOk)
    ) {
      matchLevel = "weak";
    }
  } else if (brandMatched) {
    const strongVol = !refHasVolume || volOk;
    if (keywordOverlapCount >= 2 && strongVol) {
      matchLevel = "strong";
    } else if (keywordOverlapCount >= 1) {
      matchLevel = "weak";
    }
  }

  const score = deviceRuleApplied
    ? keywordOverlapCount * 35 +
      (brandMatched ? 25 : 0) +
      (modelLineMatched ? 30 : 0) +
      (volOk ? 25 : 0) +
      Math.round(overlapRatio * 40)
    : keywordOverlapCount * 35 +
      (brandMatched ? 40 : 0) +
      (volOk ? 25 : 0) +
      Math.round(overlapRatio * 40);

  const whyRejected = computeMatchWhyRejected({
    productType,
    deviceRuleApplied,
    matchLevel,
    brandMatched,
    modelLineMatched,
    keywordOverlapCount,
    sizeMatched: volOk,
    refHasVolume,
  });

  return {
    score,
    brandMatched,
    keywordOverlapCount,
    sizeMatched: volOk,
    normalizedCandidateTitle: candNorm.slice(0, 400),
    normalizedRefName: refNameNorm.slice(0, 400),
    matchLevel,
    modelLineMatched,
    deviceRuleApplied,
    whyRejected,
  };
}

function sortKeyForPick(detail: MarketplaceCandidateMatchDetail): number {
  if (!detail.matchLevel) return -1;
  const tier = detail.matchLevel === "strong" ? 1_000_000 : 500_000;
  return tier + detail.score;
}

export type MarketplacePickResult = {
  url: string;
  matchLevel: MarketplaceImageMatchLevel;
  candidateIndex: number;
};

/**
 * strong を優先し、無ければ weak を採用（公開面画像補完向け）
 */
export function pickBestMarketplaceImageWithLevel(
  product: ProductForImageMatch,
  candidates: ImageMatchCandidate[]
): MarketplacePickResult | undefined {
  const productType = detectMarketplaceProductType(product);
  const weakOk = isWeakAdoptionAllowedForProductType(productType);
  type Row = {
    candidateIndex: number;
    candidate: ImageMatchCandidate;
    detail: MarketplaceCandidateMatchDetail;
    key: number;
  };
  const rows: Row[] = [];
  candidates.forEach((candidate, candidateIndex) => {
    if (!candidate.imageUrl?.trim()) return;
    const detail = analyzeMarketplaceImageCandidate(product, candidate);
    const key = sortKeyForPick(detail);
    if (!detail.matchLevel || key < 0) return;
    if (detail.matchLevel === "weak" && !weakOk) return;
    rows.push({ candidateIndex, candidate, detail, key });
  });
  if (rows.length === 0) return undefined;
  rows.sort((a, b) => b.key - a.key);
  const best = rows[0]!;
  return {
    url: best.candidate.imageUrl.trim(),
    matchLevel: best.detail.matchLevel!,
    candidateIndex: best.candidateIndex,
  };
}

/** 表示用: スコア降順（ログ上位 N 件） */
export function rankMarketplaceCandidatesByScore(
  product: ProductForImageMatch,
  candidates: ImageMatchCandidate[]
): Array<{
  candidateIndex: number;
  candidate: ImageMatchCandidate;
  detail: MarketplaceCandidateMatchDetail;
  sortScore: number;
}> {
  const out: Array<{
    candidateIndex: number;
    candidate: ImageMatchCandidate;
    detail: MarketplaceCandidateMatchDetail;
    sortScore: number;
  }> = [];
  const productType = detectMarketplaceProductType(product);
  const weakOk = isWeakAdoptionAllowedForProductType(productType);
  candidates.forEach((candidate, candidateIndex) => {
    if (!candidate.imageUrl?.trim()) return;
    const detail = analyzeMarketplaceImageCandidate(product, candidate);
    const sortScore =
      detail.score +
      (detail.matchLevel === "strong" ? 10_000 : 0) +
      (detail.matchLevel === "weak" && weakOk ? 5_000 : 0) +
      (detail.matchLevel === "weak" && !weakOk ? -500_000 : 0);
    out.push({ candidateIndex, candidate, detail, sortScore });
  });
  out.sort((a, b) => b.sortScore - a.sortScore);
  return out;
}

/**
 * マッチスコア。負値は不採用（後方互換・単一判定相当）
 */
export function scoreMarketplaceImageCandidate(
  product: ProductForImageMatch,
  candidate: ImageMatchCandidate
): number {
  const d = analyzeMarketplaceImageCandidate(product, candidate);
  if (!d.matchLevel) return -1;
  if (
    d.matchLevel === "weak" &&
    !isWeakAdoptionAllowedForProductType(detectMarketplaceProductType(product))
  ) {
    return -1;
  }
  return d.score;
}

export function pickBestMarketplaceImage(
  product: ProductForImageMatch,
  candidates: ImageMatchCandidate[]
): string | undefined {
  return pickBestMarketplaceImageWithLevel(product, candidates)?.url;
}
