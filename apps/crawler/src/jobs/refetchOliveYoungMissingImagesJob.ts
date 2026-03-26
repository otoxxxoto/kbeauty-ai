/**
 * 画像なし商品の補完再取得 CLI / 日次ジョブ組み込み用
 * oliveyoung_products_public のうち imageUrl/thumbnailUrl が無い商品だけ詳細再取得する
 *
 * 使い方:
 *   pnpm tsx src/jobs/refetchOliveYoungMissingImagesJob.ts 20
 *   pnpm run oliveyoung:refetch-missing-images
 *
 * 第1引数: limit（デフォルト 20）
 */
import { getProductsMissingImages } from '../services/productFirestore';
import { runRefetchProductDetail } from '../services/refetchProductDetail';

function hasImage(value: string | undefined): boolean {
  return value != null && typeof value === 'string' && value.trim() !== '';
}

/**
 * 画像なし商品の補完を limit 件まで実行（日次ジョブから呼び出す中核関数）
 */
export async function refetchOliveYoungMissingImages(limit: number): Promise<void> {
  const n = Math.min(Math.max(1, limit), 500);

  console.log('[REFETCH_MISSING_IMAGES_START]', `limit=${n}`);

  const targets = await getProductsMissingImages(n);
  console.log('[REFETCH_MISSING_IMAGES_TARGETS]', `count=${targets.length}`);

  let success = 0;
  let failed = 0;

  for (const item of targets) {
    const beforeImage = hasImage(item.imageUrl);
    const beforeThumb = hasImage(item.thumbnailUrl);

    console.log(
      '[REFETCH_MISSING_IMAGES_ITEM]',
      `goodsNo=${item.goodsNo}`,
      `beforeImage=${beforeImage}`,
      `beforeThumb=${beforeThumb}`
    );

    const result = await runRefetchProductDetail(item.goodsNo);

    if (result.ok) {
      success += 1;
      const afterImage = hasImage(result.imageUrl);
      const afterThumb = hasImage(result.thumbnailUrl);
      console.log(
        '[REFETCH_MISSING_IMAGES_ITEM_DONE]',
        `goodsNo=${item.goodsNo}`,
        `afterImage=${afterImage}`,
        `afterThumb=${afterThumb}`
      );
    } else {
      failed += 1;
      console.warn(
        '[REFETCH_MISSING_IMAGES_ITEM_FAIL]',
        `goodsNo=${item.goodsNo}`,
        `error=${result.error ?? 'unknown'}`
      );
    }
  }

  console.log(
    '[REFETCH_MISSING_IMAGES_DONE]',
    `processed=${targets.length}`,
    `success=${success}`,
    `failed=${failed}`
  );
}

function parseLimit(): number {
  const raw = process.argv[2];
  if (raw === undefined || raw === '') return 20;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num >= 1 ? Math.min(num, 500) : 20;
}

async function main(): Promise<void> {
  await refetchOliveYoungMissingImages(parseLimit());
}

main().catch((err) => {
  console.error('[REFETCH_MISSING_IMAGES_ERROR]', err);
  process.exit(1);
});
