/**
 * 指定 runDate のランキング上位 N 件について、人物判定（imageAnalysis）が未登録の画像 URL を列挙する。
 * 出力は NDJSON（1 行 1 URL）を既定とし、`apps/crawler` の Vision バッチ等へパイプ可能。
 *
 *   pnpm report-ranking-unanalyzed-image-urls -- --runDate=2025-03-01 --limit=100
 *   pnpm report-ranking-unanalyzed-image-urls -- --limit=100 --format=goods-block
 *
 * 取り込み: `cd ../crawler && pnpm run oliveyoung:ingest-ranking-ndjson-vision -- --file=...`
 *
 * format:
 *   - ndjson (既定): {"goodsNo","rank","url"} を URL ごとに 1 行
 *   - goods-block: 商品ごとに JSON ブロック（人間向け）
 *
 * 前提: `.env.local` に Firestore（Next と同じ）
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { getOliveYoungProductByGoodsNo } from "../src/lib/oliveyoung-products";
import {
  getRankingByDate,
  getRankingRunDates,
} from "../src/lib/oliveyoung-rankings";
import {
  getUnanalyzedImageUrlsPrioritized,
  type VisionBatchImageLine,
} from "../src/lib/image-analysis-queue";

function parseArgs(argv: string[]): {
  runDate: string | null;
  limit: number;
  format: "ndjson" | "goods-block";
} {
  let runDate: string | null = null;
  let limit = 100;
  let format: "ndjson" | "goods-block" = "ndjson";
  for (const a of argv) {
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    }
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
    if (a.startsWith("--format=")) {
      const f = a.slice("--format=".length).trim();
      if (f === "goods-block") format = "goods-block";
      else format = "ndjson";
    }
  }
  return { runDate, limit, format };
}

async function main() {
  const { runDate: runDateArg, limit, format } = parseArgs(
    process.argv.slice(2)
  );

  const runDates = await getRankingRunDates();
  const runDate = runDateArg ?? runDates[0] ?? null;
  if (!runDate) {
    console.error("[unanalyzed-urls] runDate を取得できません。");
    process.exit(1);
  }

  const ranking = await getRankingByDate(runDate);
  if (!ranking) {
    console.error(`[unanalyzed-urls] ランキングなし: ${runDate}`);
    process.exit(1);
  }

  const slice = ranking.items.slice(0, limit);
  const lines: VisionBatchImageLine[] = [];
  let goodsWithAnyUnanalyzed = 0;
  const goodsBlocks: { rank: number; goodsNo: string; urls: string[] }[] = [];

  for (const row of slice) {
    const p = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (!p) continue;
    const urls = getUnanalyzedImageUrlsPrioritized(p);
    if (urls.length === 0) continue;
    goodsWithAnyUnanalyzed += 1;
    goodsBlocks.push({ rank: row.rank, goodsNo: row.goodsNo, urls });
    for (const url of urls) {
      lines.push({ goodsNo: row.goodsNo, rank: row.rank, url });
    }
  }

  console.error(
    `[unanalyzed-urls] runDate=${runDate}  limit=${limit}  goods=${slice.length}  ` +
      `with_unanalyzed_urls=${goodsWithAnyUnanalyzed}  total_url_rows=${lines.length}`
  );

  if (format === "ndjson") {
    for (const row of lines) {
      console.log(JSON.stringify(row));
    }
  } else {
    console.log(
      JSON.stringify(
        {
          runDate,
          limit,
          meta: {
            rankingItems: slice.length,
            goodsWithUnanalyzedImageUrls: goodsWithAnyUnanalyzed,
            totalUnanalyzedUrlRows: lines.length,
          },
          goods: goodsBlocks,
        },
        null,
        2
      )
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
