/**
 * 人物・モデルっぽい画像を除外し、商品パッケージ画像を優先する簡易ルール。
 * apps/web/src/lib/imagePersonFilter.ts とロジックを揃えること。
 */

export type ImageCandidate = { url: string; alt?: string };

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

const PERSON_NG_WORD_REGEX =
  /\b(man|men|models?|faces?|portraits?|posing|idol|people|persons?)\b/i;

function toLower(s: string): string {
  return (s || "").toLowerCase();
}

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

/** Web 表示用: 安全候補が無ければ空（モデル表示を避ける） */
export function pickBestProductDisplayImage(candidates: ImageCandidate[]): string {
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

/**
 * クローラー画像補完用: 上記のあと、全件NGなら先頭にフォールバック（URL未取得失敗を避ける）
 */
export function pickProductOnlyImage(candidates: ImageCandidate[]): string | undefined {
  const valid = candidates.filter((c) => c.url?.trim());
  if (valid.length === 0) return undefined;

  const best = pickBestProductDisplayImage(valid);
  if (best) return best;

  return valid[0]?.url?.trim() || undefined;
}
