/**
 * 画像補完専用ジョブ（ランキング本体と分離）
 * Cloud Run Job を別で作成してスケジュール実行する想定。
 * 失敗してもランキング本体に影響しない。
 */
import "dotenv/config";
import { runFillMissingImage } from "./fillMissingImageJob";

async function main(): Promise<void> {
  const limit = Number(process.env.LIMIT || 5);
  console.log(`[RUN_FILL_IMAGE_JOB] limit=${limit}`);
  await runFillMissingImage(limit);
}

main().catch((err) => {
  console.error("[RUN_FILL_IMAGE_JOB_ERROR]", err);
  process.exit(1);
});
