/**
 * ランキング巡回の統合実行
 * crawlOliveYoungRanking → 各商品: 取得→正規化→Qoo10名寄せ（フェイルセーフ）→Firestore保存
 */
import { crawlOliveYoungRanking } from '../sources/oliveyoungRanking';
import { getOliveyoungProductMeta } from '../sources/oliveyoungMeta';
import { getOliveyoungIngredients } from '../sources/oliveyoungIngredients';
import { findQoo10Url } from '../services/qoo10';
import { saveProductNormalized } from '../services/productFirestore';
import { Logger } from '../utils/logger';

const logger = new Logger('RANKING_CRAWL');

export async function runRankingCrawl(): Promise<void> {
  const items = await crawlOliveYoungRanking();
  logger.info(`[ranking] fetched ${items.length} items`);

  for (const { goodsNo, rank } of items) {
    try {
      const meta = await getOliveyoungProductMeta(goodsNo);
      const ingredientsResult = await getOliveyoungIngredients(goodsNo);

      const ingredientsRaw =
        ingredientsResult.ok && ingredientsResult.ingredientsText
          ? ingredientsResult.ingredientsText
          : meta.ingredientsRaw || '';

      let qoo10Url: string | undefined = undefined;
      try {
        qoo10Url = await findQoo10Url(meta.brand, meta.name, goodsNo);
      } catch (e: any) {
        logger.warn(`[QOO10] skipped goodsNo=${goodsNo} reason=${e && typeof (e as Error).message === 'string' ? (e as Error).message : e}`);
        qoo10Url = undefined;
      }

      const product = {
        goodsNo,
        brand: meta.brand,
        name: meta.name,
        ingredientsRaw,
        tags: [],
        ...(ingredientsResult.pickedUrl && { pickedUrl: ingredientsResult.pickedUrl }),
        ...(qoo10Url && { qoo10Url }),
        ...(meta.priceKRW != null && { priceKRW: meta.priceKRW }),
      };

      await saveProductNormalized(product, { lastRank: rank, lastRankAt: new Date() });
    } catch (e: any) {
      logger.error(`[ranking] ERROR goodsNo=${goodsNo}`, e && typeof (e as Error).message === 'string' ? (e as Error).message : e);
    }
  }

  logger.info('[ranking] done');
}
