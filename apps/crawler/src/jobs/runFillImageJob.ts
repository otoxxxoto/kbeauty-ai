/**
 * Cloud Run Job 用エントリ
 * LIMIT 環境変数で処理件数を指定（デフォルト 5、将来 env で増やせる）
 *
 * 実行例:
 *   LIMIT=50 pnpm run oliveyoung:fill-image:job
 *   Cloud Run Job: CMD ["pnpm","run","oliveyoung:fill-image:job"] + env LIMIT=5
 */
import { runFillMissingImage } from "./fillMissingImageJob";

async function main(): Promise<void> {
  const raw = process.env.LIMIT;
  const limit = raw != null && raw !== "" ? Math.max(1, Math.min(500, parseInt(String(raw), 10) || 5)) : 5;
  await runFillMissingImage(limit);
}

main().catch((err) => {
  console.error("[FILL_IMAGE_ERROR]", err);
  process.exit(1);
});
