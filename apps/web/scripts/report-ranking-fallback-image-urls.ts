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
type Candidate = {
  sourceField: SourceTri;
  rawValue: string | undefined;
  normalizedUrl: string;
  urlLength: number;
};

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

function sourcePriority(s: SourceTri): number {
  if (s === "oliveYoungImageUrl") return 3;
  if (s === "imageUrl") return 2;
  return 1;
}

function getSourceRawFields(
  p: OliveYoungProductDetail
): Array<{ sourceField: SourceTri; rawValue: string | undefined }> {
  return [
    { sourceField: "oliveYoungImageUrl", rawValue: p.oliveYoungImageUrl },
    { sourceField: "imageUrl", rawValue: p.imageUrl },
    { sourceField: "thumbnailUrl", rawValue: p.thumbnailUrl },
  ];
}

function normalizeUrl(raw: string | undefined): string {
  return (raw ?? "").trim();
}

function validateCandidateUrl(
  url: string,
  sourceField: SourceTri
): { ok: true } | { ok: false; reason: string } {
  if (!url) return { ok: false, reason: "empty" };
  if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "not_http_https" };
  if (url.length < 40) return { ok: false, reason: "too_short_global" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "url_parse_failed" };
  }

  if (!parsed.hostname) return { ok: false, reason: "missing_hostname" };

  const looksLikeImage = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
  if (!looksLikeImage) return { ok: false, reason: "no_image_extension" };

  const isOliveYoungHost = /oliveyoung\.co\.kr$/i.test(parsed.hostname);
  if (isOliveYoungHost && url.length < 80) {
    return { ok: false, reason: "too_short_oliveyoung_url" };
  }

  if (sourceField === "oliveYoungImageUrl" && url.length < 80) {
    return { ok: false, reason: "too_short_for_oliveYoungImageUrl" };
  }

  return { ok: true };
}

function chooseBestCandidate(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const p = sourcePriority(b.sourceField) - sourcePriority(a.sourceField);
    if (p !== 0) return p;
    return b.urlLength - a.urlLength;
  });
  return sorted[0] ?? null;
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
    urlLength: number;
  };
  const lines: Line[] = [];
  const seenOutputUrls = new Set<string>();
  let badUrlSkips = 0;
  let dupUrlSkips = 0;

  for (const row of slice) {
    const p = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (!p) continue;
    loaded += 1;
    const plain = serializeProductImageFieldsForClient(p);
    const pipe = resolveProductImageForDisplay(plain, { goodsNo: p.goodsNo });
    if (pipe.imagePolicy !== "fallback_no_image") continue;

    fallbackGoods += 1;
    const sourceFields = getSourceRawFields(p);
    console.error(
      `[TRACE_GOODS_URL_FIELDS] goodsNo=${p.goodsNo} rank=${row.rank} ` +
        `oliveYoungImageUrl=${JSON.stringify(sourceFields[0]?.rawValue ?? "")} ` +
        `imageUrl=${JSON.stringify(sourceFields[1]?.rawValue ?? "")} ` +
        `thumbnailUrl=${JSON.stringify(sourceFields[2]?.rawValue ?? "")}`
    );

    const candidateByUrl = new Map<string, Candidate>();
    for (const f of sourceFields) {
      const normalizedUrl = normalizeUrl(f.rawValue);
      const validity = validateCandidateUrl(normalizedUrl, f.sourceField);
      if (!validity.ok) {
        badUrlSkips += 1;
        console.error(
          `[SKIP_BAD_URL] goodsNo=${p.goodsNo} rank=${row.rank} sourceField=${f.sourceField} ` +
            `reason=${validity.reason} raw=${JSON.stringify(f.rawValue ?? "")}`
        );
        continue;
      }
      const prev = candidateByUrl.get(normalizedUrl);
      const candidate: Candidate = {
        sourceField: f.sourceField,
        rawValue: f.rawValue,
        normalizedUrl,
        urlLength: normalizedUrl.length,
      };
      if (!prev || sourcePriority(candidate.sourceField) > sourcePriority(prev.sourceField)) {
        candidateByUrl.set(normalizedUrl, candidate);
      }
    }

    const best = chooseBestCandidate([...candidateByUrl.values()]);
    if (!best) continue;

    if (seenOutputUrls.has(best.normalizedUrl)) {
      dupUrlSkips += 1;
      console.error(
        `[SKIP_DUP_URL] goodsNo=${p.goodsNo} rank=${row.rank} sourceField=${best.sourceField} ` +
          `url=${JSON.stringify(best.normalizedUrl)}`
      );
      continue;
    }

    seenOutputUrls.add(best.normalizedUrl);
    console.error(
      `[SELECT_URL] goodsNo=${p.goodsNo} rank=${row.rank} sourceField=${best.sourceField} ` +
        `urlLength=${best.urlLength} raw=${JSON.stringify(best.rawValue ?? "")}`
    );

    urlByField[best.sourceField] += 1;
    lines.push({
      goodsNo: p.goodsNo,
      rank: row.rank,
      url: best.normalizedUrl,
      sourceField: best.sourceField,
      urlLength: best.urlLength,
    });
  }

  console.error(
    `[fallback-image-urls] runDate=${runDate}  rank_slots=${rankSlots}  loaded_products=${loaded}  ` +
      `fallback_no_image_goods=${fallbackGoods}  ndjson_rows=${lines.length}  ` +
      `skip_bad_url=${badUrlSkips} skip_dup_url=${dupUrlSkips}`
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
