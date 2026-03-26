/**
 * LLM プロンプト用の商品名・ブランド解決（goodsNo は絶対に渡さない）
 * Web の表示優先と整合: safe nameJa → name（韓国語）→ ブランド
 */
import { isUnsafeNameJa } from "./nameJaQuality";

export function looksLikeOliveYoungGoodsNo(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const s = value.trim();
  return /^A\d{10,}$/.test(s);
}

/** Web の isUnsafeBrandJa と同等 */
export function isUnsafeBrandJa(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  if (t.length > 40) return true;
  if (/[\r\n]/.test(value)) return true;
  if (/THINK:/i.test(t)) return true;
  if (t.includes("ユーザーは")) return true;
  if (t.includes("アシスタント")) return true;
  if (t.includes("翻訳")) return true;
  if (t.includes("韓国語")) return true;
  if (t.includes("日本語")) return true;
  return false;
}

export type ProductLabelForLlmInput = {
  name?: string | null;
  nameJa?: string | null;
  brand?: string | null;
  brandJa?: string | null;
};

/**
 * 1. safe な nameJa
 * 2. unsafe なら name（韓国語）— goodsNo 単体は除外
 * 3. それもだめならブランド表示名
 * 4. 最後の手段のみ「(商品名なし)」— goodsNo は返さない
 */
export function resolveProductDisplayNameForLlm(input: ProductLabelForLlmInput): string {
  const brandRaw = input.brand != null ? String(input.brand).trim() : "";
  const brandJaRaw = input.brandJa != null ? String(input.brandJa).trim() : "";
  const ctx = { brand: brandRaw, brandJa: brandJaRaw };

  const ja = input.nameJa != null ? String(input.nameJa).trim() : "";
  if (ja && !isUnsafeNameJa(ja, ctx)) return ja;

  const nm = input.name != null ? String(input.name).trim() : "";
  if (nm && !looksLikeOliveYoungGoodsNo(nm) && nm !== "（商品名なし）") return nm;

  const brandLine = resolveBrandDisplayNameForLlm(input);
  if (brandLine && brandLine !== "(ブランドなし)") return brandLine;

  return "(商品名なし)";
}

export function resolveBrandDisplayNameForLlm(input: ProductLabelForLlmInput): string {
  const raw = input.brand != null ? String(input.brand).trim() : "";
  const ja = input.brandJa != null ? String(input.brandJa).trim() : "";
  if (ja && !isUnsafeBrandJa(ja)) return ja;
  if (raw && raw !== "Unknown") return raw;
  return "(ブランドなし)";
}
