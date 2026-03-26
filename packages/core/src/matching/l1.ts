/**
 * L1名寄せ（ルールベース）
 * brand_match, volume_match, name_similarity を計算
 */
import { ProductParsed, L1MatchCandidate } from '../types';
import { get as levenshteinDistance } from 'fast-levenshtein';

/**
 * 文字列正規化（名寄せ用）
 */
function normalizeForMatching(text: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 名前類似度計算（Levenshtein距離ベース）
 */
export function calculateNameSimilarity(name1: string | null, name2: string | null): number {
  const n1 = normalizeForMatching(name1);
  const n2 = normalizeForMatching(name2);
  
  if (!n1 || !n2) return 0;
  if (n1 === n2) return 1;
  
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(n1, n2);
  return 1 - distance / maxLen;
}

/**
 * 容量マッチ判定（簡易パース）
 * 例: "50ml" vs "50ml" → 1, "50ml" vs "30g" → 0
 */
export function calculateVolumeMatch(vol1: string | null, vol2: string | null): number {
  if (!vol1 || !vol2) return 0;
  
  // 数値と単位を抽出（簡易版）
  const extractVolume = (text: string): { value: number | null; unit: string | null } => {
    const match = text.match(/(\d+(?:\.\d+)?)\s*(ml|g|kg|l|oz|fl\s*oz)/i);
    if (match) {
      return { value: parseFloat(match[1]), unit: match[2].toLowerCase() };
    }
    return { value: null, unit: null };
  };
  
  const v1 = extractVolume(vol1);
  const v2 = extractVolume(vol2);
  
  if (v1.value === null || v2.value === null || v1.unit === null || v2.unit === null) {
    return 0;
  }
  
  // 単位が一致し、値が同じ（または近い：±5%許容）なら1
  if (v1.unit === v2.unit && Math.abs(v1.value - v2.value) / Math.max(v1.value, v2.value) < 0.05) {
    return 1;
  }
  
  return 0;
}

/**
 * ブランドマッチ判定
 */
export function calculateBrandMatch(brand1: string | null, brand2: string | null): number {
  if (!brand1 || !brand2) return 0;
  
  const n1 = normalizeForMatching(brand1);
  const n2 = normalizeForMatching(brand2);
  
  return n1 === n2 ? 1 : 0;
}

/**
 * L1スコア計算（PoC版）
 * brand*0.4 + volume*0.2 + nameSim*0.4
 */
export function calculateL1Score(
  brandMatch: number,
  volumeMatch: number,
  nameSimilarity: number
): number {
  return brandMatch * 0.4 + volumeMatch * 0.2 + nameSimilarity * 0.4;
}

/**
 * Olive Young商品と他サイト商品のL1マッチ候補を返す
 */
export function findL1Matches(
  oliveyoungProduct: ProductParsed,
  candidates: ProductParsed[],
  threshold: number = 0.85
): L1MatchCandidate[] {
  const matches: L1MatchCandidate[] = [];
  
  for (const candidate of candidates) {
    const brandMatch = calculateBrandMatch(oliveyoungProduct.brand, candidate.brand);
    const volumeMatch = calculateVolumeMatch(oliveyoungProduct.volume_text, candidate.volume_text);
    const nameSim = calculateNameSimilarity(oliveyoungProduct.title, candidate.title);
    const score = calculateL1Score(brandMatch, volumeMatch, nameSim);
    
    if (score >= threshold) {
      matches.push({
        oliveyoung_product: oliveyoungProduct,
        matched_product: candidate,
        score,
        brand_match: brandMatch,
        volume_match: volumeMatch,
        name_similarity: nameSim,
      });
    }
  }
  
  // スコア降順でソート
  matches.sort((a, b) => b.score - a.score);
  
  // 上位3件を返す
  return matches.slice(0, 3);
}



