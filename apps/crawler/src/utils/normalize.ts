/**
 * データ正規化ユーティリティ
 */

/**
 * 価格文字列を数値に変換
 * "12,000원" → 12000
 */
export function parsePrice(text: string | null): number | null {
  if (!text) return null;
  
  // 数値のみ抽出（カンマ、通貨記号を除去）
  const match = text.replace(/[^\d]/g, '');
  const num = parseInt(match, 10);
  
  return isNaN(num) ? null : num;
}

/**
 * 通貨判定（簡易版）
 */
export function detectCurrency(text: string | null, source: string): 'KRW' | 'JPY' | null {
  if (!text) return null;
  
  const lower = text.toLowerCase();
  if (lower.includes('원') || lower.includes('won') || source === 'oliveyoung') {
    return 'KRW';
  }
  if (lower.includes('円') || lower.includes('yen') || source === 'rakuten') {
    return 'JPY';
  }
  
  return null;
}

/**
 * テキストクリーンアップ（前後の空白・改行を削除）
 */
export function cleanText(text: string | null): string | null {
  if (!text) return null;
  return text.trim().replace(/\s+/g, ' ') || null;
}



