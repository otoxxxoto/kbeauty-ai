/**
 * Qoo10 名寄せ（フェイルセーフ必須）
 * 403/タイムアウト等で止めず、qoo10Url を未設定のまま次へ進む
 */
import { Logger } from '../utils/logger';

const logger = new Logger('QOO10');

function toShortReason(e: unknown): string {
  if (e instanceof Error) {
    const msg = e.message || e.name || 'unknown';
    if (msg.includes('403') || (e as any)?.status === 403) return '403';
    if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) return 'timeout';
    return msg.slice(0, 80);
  }
  return String(e).slice(0, 80);
}

/**
 * Qoo10 で brand + name から商品URLを検索
 * 失敗時は例外を投げず undefined を返し、logger.warn で記録
 */
export async function findQoo10Url(
  brand: string,
  name: string,
  goodsNo: string
): Promise<string | undefined> {
  let qoo10Url: string | undefined = undefined;
  try {
    qoo10Url = await searchQoo10Products(brand, name);
  } catch (e) {
    logger.warn(`[QOO10] skipped goodsNo=${goodsNo} reason=${toShortReason(e)}`);
    qoo10Url = undefined;
  }
  return qoo10Url;
}

/**
 * Qoo10 検索の実装（Bot対策で 403/タイムアウト が発生し得る）
 * 内部で fetch 等を呼ぶ想定
 */
async function searchQoo10Products(brand: string, name: string): Promise<string | undefined> {
  const query = `${brand} ${name}`.trim();
  if (!query) return undefined;

  const url = `https://www.qoo10.jp/s/?keyword=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeout);

    if (res.status === 403) throw new Error('403');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const html = await res.text();
    const match = html.match(/href="(https:\/\/www\.qoo10\.jp\/[^"]+)"[^>]*>/);
    return match ? match[1] : undefined;
  } finally {
    clearTimeout(timeout);
  }
}
