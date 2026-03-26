/**
 * 人物っぽい URL の簡易ヒューリスティック（クローラー側の Vision 前処理・補助のみ）。
 * Web の表示可否は Firestore の imageAnalysis / safeImageUrl（Vision）を正とする。
 *
 * 将来の拡張候補（未実装）:
 * - 人物除去（inpainting）で公式カットを安全化
 * - 商品部分のみクロップ
 * - 背景ぼかし
 */

export type ImageCandidate = { url: string; alt?: string };

/** 部分一致で除外（韓国語・固定フレーズ向け） */
const PERSON_NG_SUBSTRINGS = [
  "model",
  "woman",
  "girl",
  "boy",
  "face",
  "portrait",
  "beautyshot",
  "beauty_shot",
  "아이돌",
  "모델",
  "인물",
  "얼굴",
  "화보",
  "모델컷",
  "착용",
] as const;

/**
 * 単語境界付きで除外（"human" 等の誤検知を避けるため "man" 単体はこちら）
 */
const PERSON_NG_WORD_REGEX =
  /\b(man|men|models?|faces?|portraits?|posing|idol|people|persons?)\b/i;

function toLower(s: string): string {
  return (s || "").toLowerCase();
}

/** 商品パッケージ・公式サムネっぽいパスを優先（スコア高いほど良い） */
function packageProductScore(url: string): number {
  const u = toLower(url);
  let score = 0;
  if (u.includes("prdtimg")) score += 4;
  if (u.includes("goods") && u.includes("img")) score += 3;
  if (u.includes("/product/") || u.includes("productimg")) score += 3;
  if (u.includes("thumbnail") || u.includes("thumb")) score += 2;
  if (u.includes("package") || u.includes("packshot")) score += 2;
  if (u.includes("cdn") && (u.includes("goods") || u.includes("item"))) score += 1;
  return score;
}

/**
 * URL・alt・ファイル名から人物っぽい画像かどうか（最低限のルール）
 */
export function looksLikePersonImage(url: string, alt?: string): boolean {
  const urlLower = toLower(url);
  const altLower = toLower(alt ?? "");
  const pathname = urlLower.split("?")[0] ?? urlLower;
  const filename = pathname.split("/").pop() ?? pathname;
  const searchText = [urlLower, altLower, filename].join(" ");

  if (PERSON_NG_WORD_REGEX.test(searchText)) return true;
  for (const kw of PERSON_NG_SUBSTRINGS) {
    if (searchText.includes(kw)) return true;
  }
  return false;
}

/**
 * 候補から人物画像を除き、パッケージっぽいURLを優先して1件選ぶ。
 * 安全な候補が無い場合は空文字（モデル表示リスクを避ける）。
 */
export function pickBestProductDisplayImage(
  candidates: ImageCandidate[]
): string {
  const valid = candidates
    .map((c) => ({ url: (c.url ?? "").trim(), alt: c.alt }))
    .filter((c) => c.url);
  if (valid.length === 0) return "";

  const nonPerson = valid.filter((c) => !looksLikePersonImage(c.url, c.alt));
  if (nonPerson.length === 0) return "";

  const sorted = [...nonPerson].sort(
    (a, b) => packageProductScore(b.url) - packageProductScore(a.url)
  );
  return sorted[0]?.url ?? "";
}
