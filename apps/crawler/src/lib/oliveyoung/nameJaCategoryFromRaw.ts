/**
 * 韓国語 raw 商品名から日本語カテゴリ語を推定（ルールベース）
 * 長いパターンを先に評価する（部分一致の誤検出を減らす）
 */

export type CategoryRule = { pattern: RegExp; ja: string };

/** 先頭から順に最初の一致のみ採用 */
export const KOREAN_TO_JA_CATEGORY_RULES: CategoryRule[] = [
  { pattern: /립틴트|립\s*틴트/u, ja: "リップティント" },
  { pattern: /글로우\s*틴트|글로스\s*틴트/u, ja: "グロスティント" },
  { pattern: /워터\s*틴트/u, ja: "ウォーターティント" },
  { pattern: /틴트/u, ja: "ティント" },
  { pattern: /쿠션/u, ja: "クッションファンデ" },
  { pattern: /크림/u, ja: "クリーム" },
  { pattern: /세럼|에센스/u, ja: "セラム" },
  { pattern: /앰플|앰풀/u, ja: "アンプル" },
  { pattern: /마스크\s*팩|마스크팩|시트\s*마스크/u, ja: "シートマスク" },
  { pattern: /마스크/u, ja: "マスク" },
  { pattern: /패드/u, ja: "トナーパッド" },
  { pattern: /토너|스킨/u, ja: "トナー" },
  { pattern: /로션|에멀전/u, ja: "ローション" },
  { pattern: /미스트/u, ja: "ミスト" },
  { pattern: /클렌징|클렌저/u, ja: "クレンジング" },
  { pattern: /폼|거품/u, ja: "洗顔フォーム" },
  { pattern: /립스틱|립\s*스틱/u, ja: "リップスティック" },
  { pattern: /립\s*밤|립밤/u, ja: "リップバーム" },
  { pattern: /립(?!틴)/u, ja: "リップ" },
  { pattern: /선크림|선\s*크림|자외선/u, ja: "日焼け止め" },
  { pattern: /파우더|팩트/u, ja: "フェイスパウダー" },
  { pattern: /프라이머|베이스/u, ja: "化粧下地" },
  { pattern: /아이\s*섀도|아이섀도/u, ja: "アイシャドウ" },
  { pattern: /마스카라/u, ja: "マスカラ" },
  { pattern: /아이라이너/u, ja: "アイライナー" },
  { pattern: /블러셔/u, ja: "チーク" },
  { pattern: /컨실러/u, ja: "コンシーラー" },
  { pattern: /샴푸/u, ja: "シャンプー" },
  { pattern: /컨디셔너|린스|트리트먼트/u, ja: "トリートメント" },
  { pattern: /바디/u, ja: "ボディケア" },
  { pattern: /핸드\s*크림|핸드크림/u, ja: "ハンドクリーム" },
  { pattern: /오일/u, ja: "オイル" },
  { pattern: /밤/u, ja: "バーム" },
];

export function inferCategoryJaFromKoreanRawName(raw: string): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  for (const { pattern, ja } of KOREAN_TO_JA_CATEGORY_RULES) {
    if (pattern.test(s)) return ja;
  }
  return null;
}

/** 表示用ブランド行（brandJa 優先、なければ brand） */
export function pickBrandDisplayLine(brandJa?: string | null, brand?: string | null): string {
  const j = typeof brandJa === "string" ? brandJa.trim() : "";
  if (j) return j;
  const b = typeof brand === "string" ? brand.trim() : "";
  return b;
}
