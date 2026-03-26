/**
 * Qoo10 スクレイピング（Phase 1では最小実装、任意）
 * 検索結果から商品名と価格を数件取得
 */
import { ProductParsed, FailureLog } from '@kbeauty-ai/core';
import { fetchHTML } from '../utils/http';
import { parsePrice, detectCurrency, cleanText } from '../utils/normalize';
import { appendFailureLog } from '../storage/jsonStore';
import { Logger } from '../utils/logger';
import * as cheerio from 'cheerio';

const logger = new Logger('QOO10');

/**
 * 検索結果から商品情報を取得（最小実装）
 */
export async function searchProducts(query: string, maxResults: number = 5): Promise<ProductParsed[]> {
  // Phase 1では実装を最小限に（必要に応じて後で拡張）
  logger.info(`Qoo10 search not implemented yet: ${query}`);
  return [];
}



