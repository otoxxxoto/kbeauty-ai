/**
 * 最新（または指定日）のランキングに載る商品に対し、PA-API 5 で Amazon 画像を補完して Firestore に書き込む。
 *
 * **PA-API は Amazon アソシエイト側の利用資格が必要**です。403 / 資格不足は想定内であり、
 * 実装不備ではありません。資格のないアカウントでは本バッチは実行しないでください（1 回目の API 応答で終了し、大量 fail は出しません）。
 * 公開面の画像は OY + `imageAnalysis`（Vision）を本線にしてください。
 *
 * 推奨（初回）:
 *   pnpm backfill-amazon-ranking-images -- --dry-run --limit=10 --sleep-ms=1000
 *
 * 本番書き込み（例）:
 *   pnpm backfill-amazon-ranking-images -- --limit=10 --sleep-ms=1000
 *
 * 必須環境変数: PAAPI_ACCESS_KEY, PAAPI_SECRET_KEY, PAAPI_PARTNER_TAG
 * 任意: PAAPI_HOST, PAAPI_REGION, PAAPI_SEARCH_INDEX, AMAZON_IMAGE_MATCH_MIN_SCORE（既定55）
 *
 * 前提: `.env.local` に Firestore + PA-API
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { FieldValue } from "firebase-admin/firestore";
import { db } from "../src/lib/firestore";
import { extractVolumeHintFromProductName } from "../src/lib/amazon-match-score";
import { getDisplayProductNameText } from "../src/lib/oliveyoung-display";
import { getOliveYoungProductByGoodsNo } from "../src/lib/oliveyoung-products";
import {
  getRankingByDate,
  getRankingRunDates,
} from "../src/lib/oliveyoung-rankings";
import {
  createPaApi5AmazonImageProviderFromEnv,
  isPaApiAccountNotEligibleError,
} from "../src/lib/pa-api-5-amazon-image-provider";

const PRODUCTS_PUBLIC = "oliveyoung_products_public";

function parseArgs(argv: string[]) {
  let dryRun = false;
  let limit = 50;
  let sleepMs = 1000;
  let runDate: string | null = null;
  let force = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    if (a === "--force") force = true;
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
    if (a.startsWith("--sleep-ms=")) {
      const n = parseInt(a.slice("--sleep-ms=".length), 10);
      if (Number.isFinite(n) && n >= 0) sleepMs = n;
    }
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    }
  }
  return { dryRun, limit, sleepMs, runDate, force };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n)}…`;
}

type DryRunLine = {
  rank: number;
  goodsNo: string;
  adopt: "採用" | "不採用";
  score: string;
  asin: string;
  title: string;
  imageUrl: string;
  note: string;
  fullTitle?: string;
  fullImageUrl?: string;
};

function col(s: string, w: number): string {
  const t = s.length > w ? `${s.slice(0, w - 1)}…` : s;
  return t.padEnd(w, " ");
}

function printDryRunMatrix(rows: DryRunLine[], minAdopt: number) {
  console.log("\n╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗");
  console.log("║  dry-run 一覧（PA-API を実行した行のみ）                                                                          ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝");
  console.log(`閾値 AMAZON_IMAGE_MATCH_MIN_SCORE = ${minAdopt}（採用はこのスコア以上の候補のみ）\n`);

  const hdr =
    `${col("rank", 5)} | ${col("goodsNo", 14)} | ${col("採用", 6)} | ${col("score", 5)} | ${col("ASIN", 12)} | ${col("amazonTitle", 36)} | ${col("amazonImageUrl", 40)} | note`;
  console.log(hdr);
  console.log("-".repeat(Math.min(hdr.length, 140)));

  for (const r of rows) {
    console.log(
      `${col(String(r.rank), 5)} | ${col(r.goodsNo, 14)} | ${col(r.adopt, 6)} | ${col(r.score, 5)} | ${col(r.asin, 12)} | ${col(r.title, 36)} | ${col(r.imageUrl, 40)} | ${r.note}`
    );
  }

  const adopted = rows.filter((r) => r.adopt === "採用").length;
  console.log(`\n採用 ${adopted} / ${rows.length}  （不採用 ${rows.length - adopted}）`);
  if (adopted === 0 && rows.length > 0) {
    console.log("→ 閾値が高すぎる可能性: AMAZON_IMAGE_MATCH_MIN_SCORE=48 などで再試行してください。");
  }

  const hits = rows.filter((r) => r.adopt === "採用");
  console.log("\n【採用候補の JSON サンプル（最大3件）】");
  for (let i = 0; i < Math.min(3, hits.length); i += 1) {
    const r = hits[i];
    console.log(`\n--- #${i + 1} goodsNo=${r.goodsNo} ---`);
    console.log(
      JSON.stringify(
        {
          asin: r.asin,
          amazonImageUrl: r.fullImageUrl ?? r.imageUrl,
          amazonTitle: r.fullTitle ?? r.title,
          amazonMatchScore: Number(r.score),
        },
        null,
        2
      )
    );
  }
}

async function main() {
  const { dryRun, limit, sleepMs, runDate: runDateArg, force } = parseArgs(
    process.argv.slice(2)
  );

  const minAdopt =
    Number(process.env.AMAZON_IMAGE_MATCH_MIN_SCORE ?? "55") || 55;

  const provider = createPaApi5AmazonImageProviderFromEnv();
  if (!provider) {
    console.error(
      "\n[backfill-amazon] PA-API 資格情報がありません。\n" +
        "  PAAPI_ACCESS_KEY / PAAPI_SECRET_KEY / PAAPI_PARTNER_TAG を .env.local に設定してください。\n"
    );
    process.exit(1);
  }

  const runDates = await getRankingRunDates();
  const runDate = runDateArg ?? runDates[0] ?? null;
  if (!runDate) {
    console.error("[backfill-amazon] runDate を取得できません。");
    process.exit(1);
  }

  const ranking = await getRankingByDate(runDate);
  if (!ranking) {
    console.error(`[backfill-amazon] ランキングなし: ${runDate}`);
    process.exit(1);
  }

  const rows = ranking.items.slice(0, limit);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  Amazon 画像補完バッチ (PA-API 5)                        ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  runDate:     ${runDate.padEnd(43)}║`);
  console.log(`║  limit:      ${String(limit).padEnd(43)}║`);
  console.log(`║  dryRun:     ${String(dryRun).padEnd(43)}║`);
  console.log(`║  force:      ${String(force).padEnd(43)}║`);
  console.log(`║  sleepMs:    ${String(sleepMs).padEnd(43)}║`);
  console.log(`║  minScore:    ${String(minAdopt).padEnd(43)}║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  let ok = 0;
  let skip = 0;
  let fail = 0;
  const dryMatrix: DryRunLine[] = [];

  for (const row of rows) {
    const goodsNo = row.goodsNo;
    const product = await getOliveYoungProductByGoodsNo(goodsNo);
    if (!product) {
      console.warn(`[skip] 商品なし  goodsNo=${goodsNo}`);
      skip += 1;
      continue;
    }

    if (
      !force &&
      product.amazonImageUrl &&
      product.amazonMatchScore != null &&
      product.amazonMatchScore >= minAdopt
    ) {
      console.log(`[skip] 既存Amazon十分  goodsNo=${goodsNo} score=${product.amazonMatchScore}`);
      skip += 1;
      continue;
    }

    const displayName = getDisplayProductNameText({
      nameJa: product.nameJa,
      name: product.name,
      brand: product.brand,
      brandJa: product.brandJa,
    });
    const brand =
      (product.brandJa ?? "").trim() || (product.brand ?? "").trim() || undefined;
    const nameForQuery =
      displayName || product.name || product.nameJa || "";
    const volumeText =
      extractVolumeHintFromProductName(nameForQuery) || undefined;

    console.log(
      `\n── 照会  rank=#${row.rank}  goodsNo=${goodsNo}  query="${truncate(nameForQuery, 50)}"`
    );

    try {
      const match = await provider.matchProduct({
        name: nameForQuery,
        brand,
        volumeText,
      });
      if (!match) {
        console.log(`    → 候補なし（API空 or スコア < ${minAdopt}）`);
        if (dryRun) {
          dryMatrix.push({
            rank: row.rank,
            goodsNo,
            adopt: "不採用",
            score: "—",
            asin: "—",
            title: "—",
            imageUrl: "—",
            note: "no_match",
          });
        }
        skip += 1;
      } else if (dryRun) {
        console.log(
          `    → 候補あり  ASIN=${match.amazonAsin}  score=${match.amazonMatchScore}`
        );
        dryMatrix.push({
          rank: row.rank,
          goodsNo,
          adopt: "採用",
          score: String(match.amazonMatchScore),
          asin: match.amazonAsin,
          title: truncate(match.amazonTitle, 80),
          imageUrl: truncate(match.amazonImageUrl, 80),
          fullTitle: match.amazonTitle,
          fullImageUrl: match.amazonImageUrl,
          note: `>=${minAdopt}`,
        });
        ok += 1;
      } else {
        await db.collection(PRODUCTS_PUBLIC).doc(goodsNo).set(
          {
            asin: match.amazonAsin,
            amazonUrl: match.amazonUrl,
            amazonImageUrl: match.amazonImageUrl,
            amazonTitle: match.amazonTitle,
            amazonMatchScore: match.amazonMatchScore,
            amazonMatchedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        console.log(
          `    → Firestore 更新  ASIN=${match.amazonAsin}  score=${match.amazonMatchScore}`
        );
        ok += 1;
      }
    } catch (e) {
      if (isPaApiAccountNotEligibleError(e)) {
        const bar = "═".repeat(72);
        console.error(`\n${bar}`);
        console.error(
          "[backfill-amazon] PA-API が利用できません（Amazon アカウント／Associate の資格不足）。"
        );
        console.error(
          "  これは実装不備ではなく、PA-API 利用が許可されたアソシエイトアカウントでのみ有効です。"
        );
        console.error(`  HTTP ${e.httpStatus}  PA-API Code(s): ${e.paapiErrorCodes.join(", ") || "(なし)"}`);
        if (e.paapiErrorMessages.length > 0) {
          console.error(`  Message(s): ${e.paapiErrorMessages.join(" | ")}`);
        }
        console.error(
          "  → バッチを中断しました（件単位の fail 連打はしません）。再開は資格取得後に同コマンドで。"
        );
        console.error(
          "  → 画像改善の本線: OY 画像 + `pnpm report-ranking-unanalyzed-image-urls` で未解析 URL を Vision バッチへ。"
        );
        console.error(`${bar}\n`);
        process.exit(0);
      }
      console.error(`    → ERROR goodsNo=${goodsNo}`, e);
      fail += 1;
    }

    if (sleepMs > 0) await sleep(sleepMs);
  }

  if (dryRun && dryMatrix.length > 0) {
    printDryRunMatrix(dryMatrix, minAdopt);
  } else if (dryRun) {
    console.log("\n（PA-API を実行した行がありません。スキップのみ）");
  }

  console.log("\n──────── 完了 ────────");
  console.log(`ok=${ok}  skip=${skip}  fail=${fail}`);
  if (dryRun) {
    console.log(
      "\n次のステップ: 内容を確認後、同じ --limit で --dry-run を外して実行してください。"
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
