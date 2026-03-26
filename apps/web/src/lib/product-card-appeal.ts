/**
 * カテゴリページ等の商品カード用・小さな訴求ラベル（1枚につき1つ想定）
 */
export function getCategoryAppealLabel(categorySlug: string): string | null {
  if (categorySlug === "scalp-care") return "頭皮ケア向け";
  if (categorySlug === "ceramide") return "保湿向け";
  if (categorySlug === "back-acne") return "背中ニキビ向け";
  return null;
}
