/**
 * 指定 runDate のランキング上位 N 件について、人物判定（imageAnalysis）が未登録の画像 URL を列挙する。
 *
 * **入出力契約**
 * - **stdout** … `format=ndjson`（既定）時のみ **JSON 1 行 = 1 レコード**（リダイレクト先ファイルにはこれだけが入る想定）
 * - **stderr** … 人間向けメタ・エラー・Firestore 初期化ログ（`src/lib/firestore.ts` は stderr）
 *
 *   pnpm report-ranking-unanalyzed-image-urls -- --runDate=2025-03-01 --limit=100
 *   # リダイレクト時は pnpm のスクリプト表記が stdout に混ざるのを防ぐため --silent を推奨:
 *   pnpm --silent run report-ranking-unanalyzed-image-urls -- --limit=100 2>meta.log >urls.ndjson
 *   # または: pnpm exec tsx scripts/report-ranking-unanalyzed-image-urls.ts -- --limit=100 2>meta.log >urls.ndjson
 *
 * 取り込み: `cd ../crawler && pnpm run oliveyoung:ingest-ranking-ndjson-vision -- --file=...`
 *
 * format:
 *   - ndjson (既定): { goodsNo, rank, url, sourceField } を URL ごとに 1 行（stdout）
 *   - goods-block: 集計用 JSON を stdout に 1 本出力（メタは stderr）
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
  getUnanalyzedImageEntriesPrioritized,
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
  const goodsBlocks: {
    rank: number;
    goodsNo: string;
    entries: Array<{ url: string; sourceField: string }>;
  }[] = [];

  for (const row of slice) {
    const p = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (!p) continue;
    const entries = getUnanalyzedImageEntriesPrioritized(p as any);
    if (entries.length === 0) continue;
    goodsWithAnyUnanalyzed += 1;
    goodsBlocks.push({
      rank: row.rank,
      goodsNo: row.goodsNo,
      entries: entries.map((e) => ({
        url: e.url,
        sourceField: e.sourceField,
      })),
    });
    for (const e of entries) {
      lines.push({
        goodsNo: row.goodsNo,
        rank: row.rank,
        url: e.url,
        sourceField: e.sourceField,
      });
    }
  }

  console.error(
    `[unanalyzed-urls] runDate=${runDate}  limit=${limit}  goods=${slice.length}  ` +
      `with_unanalyzed_urls=${goodsWithAnyUnanalyzed}  total_url_rows=${lines.length}`
  );

  if (format === "ndjson") {
    for (const row of lines) {
      process.stdout.write(`${JSON.stringify(row)}\n`);
    }
  } else {
    console.error(
      "[unanalyzed-urls] format=goods-block → stdout に JSON 1 本、メタは stderr 済み"
    );
    process.stdout.write(
      `${JSON.stringify(
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
      )}\n`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
