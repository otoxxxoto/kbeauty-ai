/**
 * OliveYoung 商品メタ（brand, name, price）取得
 * HTML から簡易抽出（ランキング巡回での ProductNormalized 構築用）
 */
import * as cheerio from 'cheerio';
import { Logger } from '../utils/logger';

const logger = new Logger('OLIVEYOUNG_META');

const DETAIL_URL = (goodsNo: string) =>
  `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`;

export interface OliveYoungProductMeta {
  brand: string;
  name: string;
  priceKRW?: number;
  ingredientsRaw?: string;
}

/**
 * 商品詳細HTMLから brand, name, price を抽出
 */
export async function getOliveyoungProductMeta(goodsNo: string): Promise<OliveYoungProductMeta> {
  const url = DETAIL_URL(goodsNo);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  let brand = '';
  let name = '';
  let priceKRW: number | undefined;
  let ingredientsRaw = '';

  // meta og:title から "브랜드 - 상품명" 形式
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  if (ogTitle) {
    const parts = ogTitle.split(/\s*[-|]\s*/, 2);
    if (parts.length >= 2) {
      brand = parts[0].trim();
      name = parts[1].trim();
    } else {
      name = ogTitle.trim();
    }
  }

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() || '{}');
      const graph = json['@graph'];
      const p = graph && Array.isArray(graph) && graph[0] != null ? graph[0] : json;
      if (p.name && !name) name = p.name;
      if (p.brand?.name && !brand) brand = p.brand.name;
    } catch {}
  });

  // price
  const priceMatch = html.match(/"salePrice"\s*:\s*(\d+)/) || html.match(/"price"\s*:\s*(\d+)/);
  if (priceMatch) priceKRW = parseInt(priceMatch[1], 10);

  // ingredients (전성분) の簡易抽出
  const ingMatch = html.match(/전성분[^"]*["\s]*[:=]\s*["']([^"']+)/);
  if (ingMatch) ingredientsRaw = ingMatch[1].replace(/\\n/g, '\n').trim();

  return { brand: brand || 'Unknown', name: name || goodsNo, priceKRW, ingredientsRaw: ingredientsRaw || '' };
}
