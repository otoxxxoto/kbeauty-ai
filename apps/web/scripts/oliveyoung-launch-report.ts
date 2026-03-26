/**
 * 公開前レポートを stdout に JSON で出力する。
 *
 * 使い方（apps/web ディレクトリで）:
 *   pnpm launch-report
 *   pnpm launch-report:pretty
 *
 * 前提: `.env.local` に Firestore 用の認証が設定されていること（Next と同じ）。
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { getAllOliveYoungProductsMinimal } from "../src/lib/oliveyoung-products";
import { computeOliveYoungLaunchReport } from "../src/lib/oliveyoung-launch-report";
import { buildPublicSurfaceGoodsIndex, mergePublicSurfaceGoodsNos } from "../src/lib/oliveyoung-public-surface";

async function main() {
  const pretty = process.argv.includes("--pretty");
  const products = await getAllOliveYoungProductsMinimal();
  const surfaceIndex = await buildPublicSurfaceGoodsIndex(products);
  const publicSurfaceGoods = mergePublicSurfaceGoodsNos(surfaceIndex);
  const report = computeOliveYoungLaunchReport(products, { publicSurfaceGoods });
  // eslint-disable-next-line no-console -- CLI 出力
  console.log(JSON.stringify(report, null, pretty ? 2 : undefined));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
