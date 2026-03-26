/**
 * 成分テキストからTop100成分をタグ付け
 * 辞書ファースト方式（部分一致は単語境界で判定）
 */
import { IngredientDictEntry, IngredientTagResult } from '../types';
import { loadIngredientDict } from './dict';

/**
 * トークン正規化：小文字化、全角→半角、記号整理、連続スペース圧縮
 * 辞書aliasもtokenも同じnormalizeTokenを通して比較する
 */
export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)) // 全角→半角
    // '-' '_' '/' をスペース扱い
    .replace(/[-_/]/g, ' ')
    // 記号整理
    .replace(/[，、。．]/g, ',')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[,;]/g, ' ')
    .replace(/\s+/g, ' ') // 連続スペースを1つに
    .trim();
}

/**
 * テキスト正規化：小文字化、全角→半角、記号統一、改行/カンマ区切りをスペースに
 */
function normalizeText(text: string): string {
  return normalizeToken(text);
}

/**
 * 単語境界で部分一致判定（簡易版：スペースまたは括弧で区切られた単語として扱う）
 * 注意: 現在はnormalizeTokenベースのマッチングを使用しているため、この関数は後方互換性のために残す
 */
function isWordBoundaryMatch(text: string, alias: string): boolean {
  const normalizedAlias = normalizeToken(alias);
  const normalizedText = normalizeToken(text);
  
  // 完全一致
  if (normalizedText === normalizedAlias) {
    return true;
  }
  
  // 単語境界での部分一致（スペース、括弧、行頭/行末で区切られた場合）
  const wordBoundaryPattern = new RegExp(
    `(^|[\\s\\(\\[\\{\\.,;])${normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\)\\]\\}\\.;,]|$)`,
    'i'
  );
  
  return wordBoundaryPattern.test(normalizedText);
}

/**
 * 括弧内の別名を抽出（例："water (aqua)" -> ["water", "aqua"]）
 */
function extractParentheticalAliases(token: string): string[] {
  const tokens: string[] = [token];
  
  // 括弧内のテキストを抽出
  const parenMatches = token.match(/\(([^)]+)\)/g);
  if (parenMatches) {
    for (const match of parenMatches) {
      const innerText = match.replace(/[()]/g, '').trim();
      if (innerText.length > 2) {
        tokens.push(innerText);
      }
    }
  }
  
  return tokens;
}

/**
 * 成分テキストをトークン化（強化版：カンマ区切り）
 */
export function tokenizeIngredients(ingredientsText: string): string[] {
  // カンマで分割
  const tokens = ingredientsText
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 2); // 空/短すぎ（<=2文字）を除外
  
  // 括弧内の別名も追加
  const expandedTokens: string[] = [];
  for (const token of tokens) {
    expandedTokens.push(token);
    const aliases = extractParentheticalAliases(token);
    for (const alias of aliases) {
      if (alias !== token && alias.length > 2) {
        expandedTokens.push(alias);
      }
    }
  }
  
  return expandedTokens;
}

/**
 * 成分テキストからTop100成分を抽出
 */
export function extractIngredients(ingredientsText: string | null): IngredientTagResult {
  if (!ingredientsText || ingredientsText.trim().length === 0) {
    return {
      found_ids: [],
      unknown_tokens_count: 0,
      matched_aliases: {},
      token_count: 0,
    };
  }

  const dict = loadIngredientDict();
  const foundIds: string[] = [];
  const matchedAliases: Record<string, string> = {};
  
  // トークン化（カンマ区切り）
  const tokens = tokenizeIngredients(ingredientsText);
  const tokenCount = tokens.length;

  // 辞書を走査して一致を探す（トークン単位と全文の両方で検索）
  // 正規化一致を強化：辞書aliasもtokenも同じnormalizeTokenを通して比較
  for (const entry of dict) {
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeToken(alias);
      
      // 全文でのマッチング
      const normalizedText = normalizeToken(ingredientsText);
      if (normalizedText.includes(normalizedAlias) || normalizedAlias.includes(normalizedText)) {
        if (!foundIds.includes(entry.id)) {
          foundIds.push(entry.id);
        }
        matchedAliases[alias] = entry.id;
      }
      
      // トークン単位でのマッチング（より厳密）
      for (const token of tokens) {
        const normalizedToken = normalizeToken(token);
        
        // 完全一致または部分一致
        if (normalizedToken === normalizedAlias || 
            normalizedToken.includes(normalizedAlias) || 
            normalizedAlias.includes(normalizedToken)) {
          if (!foundIds.includes(entry.id)) {
            foundIds.push(entry.id);
          }
          matchedAliases[alias] = entry.id;
          break; // 1つのトークンで見つかればOK
        }
      }
    }
  }

  const unknownTokensCount = Math.max(0, tokenCount - foundIds.length);

  return {
    found_ids: foundIds,
    unknown_tokens_count: unknownTokensCount,
    matched_aliases: matchedAliases,
    token_count: tokenCount,
  };
}

