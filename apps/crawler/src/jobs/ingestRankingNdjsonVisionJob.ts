/**
 * `apps/web` の `report-ranking-unanalyzed-image-urls` が出す NDJSON（1 行 { goodsNo, rank, url, sourceField? }）を読み、
 * 各行を Gemini Vision（getOrAnalyzeImageUrl）で解析して `imageAnalysis` にマージ保存する。
 *
 * 既に同一 URL の imageAnalysis 行がある場合はスキップ。
 * `imageVisionAnalyzedAt` は付けない（部分追記。全件一括は `oliveyoung:analyze-product-images`）。
 *
 * 使い方:
 *   cd apps/crawler
 *   pnpm oliveyoung:ingest-ranking-ndjson-vision -- --file=../web/out.ndjson
 *   pnpm report-ranking-unanalyzed-image-urls ... 2>nul | pnpm oliveyoung:ingest-ranking-ndjson-vision
 *
 * オプション:
 *   --file=path     NDJSON ファイル（省略時は stdin がパイプされていれば stdin）
 *   --limit=N       最大 N 行まで処理
 *   --sleep-ms=450  各行の API 間隔
 *   --dry-run       Firestore へ書かない
 *
 * 環境変数: GEMINI_API_KEY（必須）、Firestore は ADC / 既存と同じ
 */
import "dotenv/config";
import * as fs from "fs";
import * as readline from "readline";
import { Firestore } from "@google-cloud/firestore";
import { getOrAnalyzeImageUrl } from "../services/getOrAnalyzeImageUrl";
import { mergeProductImageVisionFieldsPartial } from "../services/productImageVisionFirestore";
import type { ProductImageAnalysisFirestoreRow } from "../services/productImageVisionFirestore";
import {
  buildProductImageUrlOrderFromDocData,
  isOyStyleProductImageUrlForVision,
  parseImageAnalysisFromDocData,
  pickSafeImageUrlFromVisionAnalysis,
  uniqueUrlsInOrderVision,
} from "../services/productImageVisionUrlHelpers";

const COLLECTION = "oliveyoung_products_public";
const DEFAULT_SLEEP_MS = 450;

function getDb(): Firestore {
  const db = new Firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(argv: string[]) {
  let file: string | null = null;
  let limit = Infinity;
  let sleepMs = DEFAULT_SLEEP_MS;
  let dryRun = false;
  for (const a of argv) {
    if (a.startsWith("--file=")) file = a.slice("--file=".length).trim() || null;
    if (a === "--dry-run") dryRun = true;
    if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n >= 1) limit = n;
    }
    if (a.startsWith("--sleep-ms=")) {
      const n = parseInt(a.slice("--sleep-ms=".length), 10);
      if (Number.isFinite(n) && n >= 0) sleepMs = n;
    }
  }
  return { file, limit, sleepMs, dryRun };
}

type NdjsonLine = { goodsNo: string; rank: number; url: string };

function parseNdjsonLine(line: string): NdjsonLine | null {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const goodsNo = String(o.goodsNo ?? "").trim();
    const url = String(o.url ?? "").trim();
    if (!goodsNo || !url) return null;
    const rankRaw = o.rank;
    const rank =
      typeof rankRaw === "number" && Number.isFinite(rankRaw)
        ? rankRaw
        : parseInt(String(rankRaw ?? ""), 10);
    return {
      goodsNo,
      rank: Number.isFinite(rank) ? rank : 0,
      url,
    };
  } catch {
    return null;
  }
}

async function* lineIterator(
  file: string | null
): AsyncGenerator<string, void, undefined> {
  if (file) {
    const text = await fs.promises.readFile(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) yield line;
    }
    return;
  }
  if (process.stdin.isTTY) {
    console.error(
      "[ingest-ndjson-vision] stdin が TTY です。--file=... を指定するか、パイプで NDJSON を渡してください。"
    );
    process.exit(1);
  }
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (line.trim()) yield line;
  }
}

async function processOneLine(
  db: Firestore,
  row: NdjsonLine,
  opts: { dryRun: boolean; sleepMs: number }
): Promise<"ok" | "skip_dup" | "skip_no_doc"> {
  const { goodsNo, url, rank } = row;
  const ref = db.collection(COLLECTION).doc(goodsNo);
  const snap = await ref.get();
  if (!snap.exists) {
    console.warn("[INGEST_SKIP_NO_DOC]", { goodsNo, rank, url: url.slice(0, 80) });
    return "skip_no_doc";
  }

  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const existing = parseImageAnalysisFromDocData(data);
  if (existing.some((e) => e.url === url)) {
    console.log("[INGEST_SKIP_DUP]", { goodsNo, rank, url: url.slice(0, 80) });
    return "skip_dup";
  }

  const r = await getOrAnalyzeImageUrl(url);
  const newRow: ProductImageAnalysisFirestoreRow = {
    url: r.url,
    containsPerson: r.containsPerson,
    confidence: r.confidence,
    isPreferredProductImage: r.isPreferredProductImage,
    isOliveYoungOriginal: isOyStyleProductImageUrlForVision(r.url),
  };

  const merged = [...existing, newRow];
  const baseOrder = buildProductImageUrlOrderFromDocData(data);
  const urlOrder = baseOrder.includes(url)
    ? baseOrder
    : uniqueUrlsInOrderVision([...baseOrder, url]);
  const safeImageUrl = pickSafeImageUrlFromVisionAnalysis(merged, urlOrder);
  const hasSafeProductImage = safeImageUrl !== "";

  if (opts.dryRun) {
    console.log("[INGEST_DRY_RUN]", {
      goodsNo,
      rank,
      containsPerson: newRow.containsPerson,
      safe: hasSafeProductImage ? safeImageUrl.slice(0, 60) : "",
    });
  } else {
    await mergeProductImageVisionFieldsPartial(goodsNo, {
      imageAnalysis: merged,
      safeImageUrl,
      hasSafeProductImage,
    });
    console.log("[INGEST_OK]", {
      goodsNo,
      rank,
      containsPerson: newRow.containsPerson,
      analysisRows: merged.length,
    });
  }

  if (opts.sleepMs > 0) await sleep(opts.sleepMs);
  return "ok";
}

async function main(): Promise<void> {
  const { file, limit, sleepMs, dryRun } = parseArgs(process.argv.slice(2));

  console.error("[ingest-ndjson-vision] start", {
    file: file ?? "(stdin)",
    limit: Number.isFinite(limit) ? limit : "∞",
    sleepMs,
    dryRun,
  });

  const db = getDb();
  let linesConsumed = 0;
  let ok = 0;
  let skipDup = 0;
  let skipNoDoc = 0;
  let fail = 0;
  let badLine = 0;

  for await (const line of lineIterator(file)) {
    const row = parseNdjsonLine(line);
    if (!row) {
      badLine += 1;
      continue;
    }
    if (linesConsumed >= limit) break;
    linesConsumed += 1;
    try {
      const res = await processOneLine(db, row, { dryRun, sleepMs });
      if (res === "ok") ok += 1;
      else if (res === "skip_dup") skipDup += 1;
      else if (res === "skip_no_doc") skipNoDoc += 1;
    } catch (e) {
      fail += 1;
      console.warn(
        "[INGEST_FAIL]",
        row.goodsNo,
        e instanceof Error ? e.message : e
      );
    }
  }

  console.error("[ingest-ndjson-vision] summary", {
    ndjson_rows_processed: linesConsumed,
    ok,
    skip_dup: skipDup,
    skip_no_doc: skipNoDoc,
    fail,
    bad_or_empty_lines: badLine,
    dryRun,
  });
}

main().catch((e) => {
  console.error("[ingest-ndjson-vision] FATAL", e);
  process.exit(1);
});
