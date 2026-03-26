/**
 * 単品再取得 CLI: goodsNo を1件だけ再取得して oliveyoung_products_public を更新する
 *
 * 使い方:
 *   pnpm tsx src/jobs/refetchOliveYoungProductJob.ts A000000223414
 *
 * 共通の runRefetchProductDetail を利用。
 */
import { runRefetchProductDetail } from '../services/refetchProductDetail';

async function main(): Promise<void> {
  const goodsNo = process.argv[2]?.trim();
  if (!goodsNo) {
    console.error('Usage: pnpm tsx src/jobs/refetchOliveYoungProductJob.ts <goodsNo>');
    process.exit(1);
  }

  console.log('[REFETCH_PRODUCT_START]', 'goodsNo=' + goodsNo);

  const result = await runRefetchProductDetail(goodsNo);

  if (result.ok) {
    console.log('[REFETCH_PRODUCT_DONE]', 'goodsNo=' + goodsNo);
  } else {
    console.error('[REFETCH_PRODUCT_ERROR]', 'goodsNo=' + goodsNo, result.error);
    process.exit(1);
  }
}

main();
