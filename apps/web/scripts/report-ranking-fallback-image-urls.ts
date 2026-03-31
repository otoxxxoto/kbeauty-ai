/**
 * ランキング上位 N 件のうち、公開面 imagePolicy が `fallback_no_image` の商品だけを対象に、
 * 再取得・再分析用の OY 系 URL（oliveYoungImageUrl / imageUrl / thumbnailUrl）を NDJSON で出す。
 *
 * **stdout** … JSON 行のみ（1 行 = `{ goodsNo, rank, url, sourceField }`）
 * **stderr** … 件数・内訳メタ（リダイレクト時は `pnpm --silent run ...` 推奨）
 *
 *   pnpm --silent run report-ranking-fallback-image-urls -- --limit=100 2>meta.log >fallback.ndjson
 *
 * 前提: `.env.local` に Firestore
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { getOliveYoungProductByGoodsNo } from "../src/lib/oliveyoung-products";
import type { OliveYoungProductDetail } from "../src/lib/oliveyoung-products";
import { getRankingByDate, getRankingRunDates } from "../src/lib/oliveyoung-rankings";
import { resolveProductImageForDisplay } from "../src/lib/getProductImage";
import { serializeProductImageFieldsForClient } from "../src/lib/serialize-product-for-client";

type SourceTri = "oliveYoungImageUrl" | "imageUrl" | "thumbnailUrl";

function parseArgs(argv: string[]): { runDate: string | null; limit: number } {
  let runDate: string | null = null;
  let limit = 100;
  for (const a of argv) {
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    }
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }
  return { runDate, limit };
}

function collectOyRefetchUrlEntries(
  p: OliveYoungProductDetail
): Array<{ url: string; sourceField: SourceTri }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; sourceField: SourceTri }> = [];
  const push = (u: string | undefined, sourceField: SourceTri) => {
    const t = (u ?? "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push({ url: t, sourceField });
  };
  push(p.oliveYoungImageUrl, "oliveYoungImageUrl");
  push(p.imageUrl, "imageUrl");
  push(p.thumbnailUrl, "thumbnailUrl");
  return out;
}

async function main() {
  const { runDate: runDateArg, limit } = parseArgs(process.argv.slice(2));

  const runDates = await getRankingRunDates();
  const runDate = runDateArg ?? runDates[0] ?? null;
  if (!runDate) {
    console.error("[fallback-image-urls] runDate を取得できません。");
    process.exit(1);
  }

  const ranking = await getRankingByDate(runDate);
  if (!ranking) {
    console.error(`[fallback-image-urls] ランキングなし: ${runDate}`);
    process.exit(1);
  }

  const slice = ranking.items.slice(0, limit);
  let rankSlots = slice.length;
  let loaded = 0;
  let fallbackGoods = 0;
  const urlByField: Record<SourceTri, number> = {
    oliveYoungImageUrl: 0,
    imageUrl: 0,
    thumbnailUrl: 0,
  };

  type Line = {
    goodsNo: string;
    rank: number;
    url: string;
    sourceField: SourceTri;
  };
  const lines: Line[] = [];

  for (const row of slice) {
    const p = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (!p) continue;
    loaded += 1;
    const plain = serializeProductImageFieldsForClient(p);
    const pipe = resolveProductImageForDisplay(plain, { goodsNo: p.goodsNo });
    if (pipe.imagePolicy !== "fallback_no_image") continue;

    fallbackGoods += 1;
    for (const e of collectOyRefetchUrlEntries(p)) {
      urlByField[e.sourceField] += 1;
      lines.push({
        goodsNo: p.goodsNo,
        rank: row.rank,
        url: e.url,
        sourceField: e.sourceField,
      });
    }
  }

  console.error(
    `[fallback-image-urls] runDate=${runDate}  rank_slots=${rankSlots}  loaded_products=${loaded}  ` +
      `fallback_no_image_goods=${fallbackGoods}  ndjson_rows=${lines.length}`
  );
  console.error(
    `[fallback-image-urls] url_rows_by_field oliveYoungImageUrl=${urlByField.oliveYoungImageUrl} ` +
      `imageUrl=${urlByField.imageUrl} thumbnailUrl=${urlByField.thumbnailUrl}`
  );

  for (const row of lines) {
    process.stdout.write(`${JSON.stringify(row)}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
