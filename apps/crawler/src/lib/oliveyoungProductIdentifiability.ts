/**
 * TOP / ランキング診断用: 人間・外部EC検索で商品を特定できるかのヒューリスティック。
 * apps/web の getDisplayProductTitle / PRODUCT_TITLE_PENDING_JA と整合させる。
 */

export const PRODUCT_TITLE_PENDING_JA = "商品名準備中";

export function looksLikeOliveYoungGoodsNo(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const s = value.trim();
  return /^A\d{10,}$/.test(s);
}

export type ProductNameFields = {
  goodsNo: string;
  nameJa?: string | null;
  name?: string | null;
  brand?: string | null;
  brandJa?: string | null;
};

/** Web getDisplayProductTitle に近い「カード表示タイトル」 */
export function effectiveDisplayTitle(p: ProductNameFields): string {
  const ja = (p.nameJa ?? "").trim();
  if (ja) return ja;
  const raw = (p.name ?? "").trim();
  if (raw && !looksLikeOliveYoungGoodsNo(raw) && raw !== "（商品名なし）") return raw;
  return "";
}

/**
 * マーケットプレイス画像を人間が探せるかの粗い判定。
 * true: 検索語として使えそうな商品名がある
 */
export function evaluateProductIdentifiability(p: ProductNameFields): {
  identifiable: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const g = (p.goodsNo ?? "").trim();
  const title = effectiveDisplayTitle(p).trim();
  const brand = (p.brand ?? "").trim();
  const brandJa = (p.brandJa ?? "").trim();
  const displayBrand = (brandJa || brand).trim();

  if (!title) {
    reasons.push("表示に使える商品名がない（nameJa 空・name が goodsNo 相当のみ等）");
    return { identifiable: false, reasons };
  }

  if (title === PRODUCT_TITLE_PENDING_JA) {
    reasons.push("一覧表示が「商品名準備中」相当");
    return { identifiable: false, reasons };
  }

  if (looksLikeOliveYoungGoodsNo(title)) {
    reasons.push("タイトルが goodsNo 形式のみ");
    return { identifiable: false, reasons };
  }

  if (g && title.includes(g)) {
    reasons.push("タイトルに goodsNo が含まれる（仮名・外部検索で特定困難）");
    return { identifiable: false, reasons };
  }

  if (/\sA\d{10,}\s*$/.test(title) || /^.+\sA\d{10,}$/.test(title)) {
    reasons.push("「語句 + goodsNo」形式の仮タイトル（例: ブランド名 + A000...）");
    return { identifiable: false, reasons };
  }

  const compact = title.replace(/\s/g, "");
  if (compact.length < 3) {
    reasons.push("タイトルが極端に短い");
    return { identifiable: false, reasons };
  }

  if (displayBrand && title === displayBrand) {
    reasons.push("タイトルがブランド名のみ");
    return { identifiable: false, reasons };
  }

  if (
    displayBrand &&
    title.startsWith(displayBrand) &&
    title.length <= displayBrand.length + 4
  ) {
    reasons.push("タイトルがブランド名＋極短い接尾辞のみ（商品名として不十分の可能性）");
    return { identifiable: false, reasons };
  }

  reasons.push("商品名として外部EC検索語に使えそう");
  return { identifiable: true, reasons };
}

/**
 * nameJa フィールド単体の品質問題（整備候補）。
 * 空配列 = 明確な問題なし（厳密ではない）
 */
export function evaluateLowQualityNameJa(p: ProductNameFields): string[] {
  const issues: string[] = [];
  const g = (p.goodsNo ?? "").trim();
  const nameJa = (p.nameJa ?? "").trim();
  const brand = (p.brand ?? "").trim();
  const brandJa = (p.brandJa ?? "").trim();
  const displayBrand = (brandJa || brand).trim();

  if (!nameJa) {
    issues.push("nameJa 未設定");
    return issues;
  }

  if (nameJa === PRODUCT_TITLE_PENDING_JA) {
    issues.push("商品名準備中");
  }

  if (looksLikeOliveYoungGoodsNo(nameJa)) {
    issues.push("nameJa が goodsNo 形式");
  }

  if (g && nameJa.includes(g)) {
    issues.push("nameJa に goodsNo を含む");
  }

  if (/\sA\d{10,}/.test(nameJa)) {
    issues.push("nameJa に A+数字の goodsNo パターンを含む");
  }

  const hasHangul = /[\uAC00-\uD7A3]/.test(nameJa);
  const hasJaKanaKanji = /[\u3040-\u30ff\u4e00-\u9fff]/.test(nameJa);
  if (hasHangul && !hasJaKanaKanji && nameJa.length >= 5) {
    issues.push("主にハングル（日本語の商品名が薄い・日本EC検索では不利になりやすい）");
  }

  if (nameJa.length < 4 && !looksLikeOliveYoungGoodsNo(nameJa)) {
    issues.push("nameJa が不自然に短い");
  }

  if (displayBrand && nameJa === displayBrand) {
    issues.push("nameJa がブランド名のみ");
  }

  return issues;
}

/** TOP 画像なしの補完フロー用: 特定可能なら B1、不能なら B2 */
export function enrichmentBucketForImageMissing(
  identifiable: boolean
): "B1" | "B2" {
  return identifiable ? "B1" : "B2";
}
