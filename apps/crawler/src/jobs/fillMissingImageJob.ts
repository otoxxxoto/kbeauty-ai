/**
 * 画像補完専用ジョブ（軽量・ランキング完全分離）
 *
 * 入力: Firestore oliveyoung_products_public のうち
 *   - imageUrl が空 or 無い、または thumbnailUrl が空 or 無い
 * の商品のみ LIMIT 件取得。
 *
 * 処理: 各商品について productUrl があればそのURL、無ければ goodsNo で商品詳細URLを組み立て、
 * そのページを 1 回だけ HTTP 取得し、og:image と必要なら img のみ抽出。
 * ランキング一覧取得・rank 再計算・name/brand 再評価・brandPick・evaluateNameBrand は一切行わない。
 *
 * 保存: imageUrl, thumbnailUrl, imageUpdatedAt のみ更新。
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-image
 *   pnpm run oliveyoung:fill-image 20
 *   pnpm tsx src/jobs/fillMissingImageJob.ts 20
 */
import {
  getProductsMissingImagesForFillImage,
  updateProductImageFieldsForFillImage,
} from "../services/fillImageFirestore";
import { fetchProductImagesOnly } from "../services/fetchProductImagesOnly";

const DEFAULT_LIMIT = 5;

function parseLimit(): number {
  const raw = process.argv[2];
  if (raw === undefined || raw === "") return DEFAULT_LIMIT;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) && num >= 1 ? Math.min(num, 500) : DEFAULT_LIMIT;
}

/**
 * 画像補完を limit 件まで実行。ランキング・name/brand 処理は一切通さない。
 */
export async function runFillMissingImage(limit: number): Promise<void> {
  const n = Math.min(Math.max(1, limit), 500);

  console.log("[FILL_IMAGE_START]", `limit=${n}`);

  const targets = await getProductsMissingImagesForFillImage(n);
  console.log("[FILL_IMAGE_TARGETS]", `count=${targets.length}`);

  let processed = 0;
  let success = 0;
  let failed = 0;

  for (const item of targets) {
    processed += 1;
    const beforeImage = item.imageUrl ? "set" : "empty";
    const beforeThumb = item.thumbnailUrl ? "set" : "empty";
    console.log(
      "[FILL_IMAGE_ITEM]",
      `goodsNo=${item.goodsNo} beforeImage=${beforeImage} beforeThumb=${beforeThumb}`
    );

    try {
      const { imageUrl, thumbnailUrl } = await fetchProductImagesOnly(
        item.goodsNo,
        item.productUrl
      );
      const main = (imageUrl && imageUrl.trim()) ? imageUrl.trim() : "";
      const thumb = (thumbnailUrl && thumbnailUrl.trim()) ? thumbnailUrl.trim() : main;

      if (!main && !thumb) {
        console.log(
          "[FILL_IMAGE_ITEM_DONE]",
          `goodsNo=${item.goodsNo} afterImage=empty afterThumb=empty`
        );
        continue;
      }

      const finalImage = main || thumb;
      const finalThumb = thumb || main;
      await updateProductImageFieldsForFillImage(item.goodsNo, finalImage, finalThumb);
      success += 1;
      console.log(
        "[FILL_IMAGE_ITEM_DONE]",
        `goodsNo=${item.goodsNo} afterImage=${finalImage.slice(0, 50)}... afterThumb=${finalThumb.slice(0, 50)}...`
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[FILL_IMAGE_ITEM_FAIL]", `goodsNo=${item.goodsNo} error=${msg}`);
      console.log(
        "[FILL_IMAGE_ITEM_DONE]",
        `goodsNo=${item.goodsNo} afterImage=error afterThumb=error`
      );
    }
  }

  console.log(
    "[FILL_IMAGE_DONE]",
    `processed=${processed} success=${success} failed=${failed}`
  );
}

async function main(): Promise<void> {
  await runFillMissingImage(parseLimit());
}

main().catch((err) => {
  console.error("[FILL_IMAGE_ERROR]", err);
  process.exit(1);
});
