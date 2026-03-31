/**
 * ランキング上位 N 件のうち、公開面 imagePolicy が `fallback_no_image` の商品について、
 * 「なぜ人物安全な画像が選ばれなかったか」を1商品1行で可視化するレポート。
 *
 * **stdout** … NDJSON（1 行 = 理由付きレコード）
 * **stderr** … 件数・理由内訳の集計
 *
 *   pnpm --silent run report-ranking-fallback-reasons -- --limit=100 \
 *     2>ranking-fallback-reasons.meta.log >ranking-fallback-reasons.ndjson
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import {
  getOliveYoungProductByGoodsNo,
  type OliveYoungProductDetail,
} from "../src/lib/oliveyoung-products";
import { getRankingByDate, getRankingRunDates } from "../src/lib/oliveyoung-rankings";
import {
  imageAnalysisEntryForProductUrl,
  collectOyOrderedImageUrls,
  type ProductImageFields,
} from "../src/lib/product-display-image-resolve";
import {
  resolveProductImageForDisplay,
  getProductImagePersonSafeFromFields,
} from "../src/lib/getProductImage";
import { serializeProductImageFieldsForClient } from "../src/lib/serialize-product-for-client";

type ReasonCode =
  | "no_candidate_url"
  | "candidate_exists_but_not_analyzed"
  | "analyzed_contains_person"
  | "analyzed_but_not_safe_selected"
  | "unknown";

type SourceTri = "oliveYoungImageUrl" | "imageUrl" | "thumbnailUrl";

function parseArgs(argv: string[]): { runDate: string | null; limit: number } {
  let runDate: string | null = null;
  let limit = 100;
  for (const a of argv) {
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    } else if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) limit = n;
    }
  }
  return { runDate, limit };
}

function pickStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : "";
  return s || undefined;
}

function bestOyCandidateFromDetail(
  p: OliveYoungProductDetail
): { url: string; sourceField: SourceTri } | null {
  const fields: Array<{ sourceField: SourceTri; raw: string | undefined }> = [
    { sourceField: "oliveYoungImageUrl", raw: pickStr(p.oliveYoungImageUrl) },
    { sourceField: "imageUrl", raw: pickStr(p.imageUrl) },
    { sourceField: "thumbnailUrl", raw: pickStr(p.thumbnailUrl) },
  ];
  const seen = new Set<string>();
  let best: { url: string; sourceField: SourceTri } | null = null;
  const priority = (s: SourceTri): number =>
    s === "oliveYoungImageUrl" ? 3 : s === "imageUrl" ? 2 : 1;

  for (const f of fields) {
    const u = (f.raw ?? "").trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (!best || priority(f.sourceField) > priority(best.sourceField)) {
      best = { url: u, sourceField: f.sourceField };
    }
  }
  return best;
}

function classifyFallbackReason(
  plain: ProductImageFields,
  chosenCandidateUrl: string | null
): {
  reason: ReasonCode;
  analysisExists: boolean;
  analysisRowCount: number;
  matchedAnalysisUrl: string | null;
  containsPerson: boolean | null;
} {
  const analysis = plain.imageAnalysis ?? [];
  const analysisExists = analysis.length > 0;
  const analysisRowCount = analysis.length;

  const oyUrls = collectOyOrderedImageUrls(plain);

  const mallCandidates: string[] = [];
  for (const v of [
    plain.amazonImage,
    plain.rakutenImage,
    plain.qoo10Image,
    plain.amazonImageUrl,
    plain.rakutenImageUrl,
    plain.qoo10ImageUrl,
  ]) {
    const t = (v ?? "").trim();
    if (t) mallCandidates.push(t);
  }

  const candidateUrls = Array.from(
    new Set<string>([...oyUrls, ...mallCandidates].filter((u) => u && u.trim()))
  );

  if (candidateUrls.length === 0) {
    return {
      reason: "no_candidate_url",
      analysisExists,
      analysisRowCount,
      matchedAnalysisUrl: null,
      containsPerson: null,
    };
  }

  const analyzedEntries = candidateUrls
    .map((u) => imageAnalysisEntryForProductUrl(plain, u))
    .filter((e): e is NonNullable<typeof e> => !!e);

  if (!analysisExists || analyzedEntries.length === 0) {
    return {
      reason: "candidate_exists_but_not_analyzed",
      analysisExists,
      analysisRowCount,
      matchedAnalysisUrl: null,
      containsPerson: null,
    };
  }

  const allAnalyzedContainPerson = analyzedEntries.every((e) => e.containsPerson === true);
  if (allAnalyzedContainPerson) {
    return {
      reason: "analyzed_contains_person",
      analysisExists,
      analysisRowCount,
      matchedAnalysisUrl: null,
      containsPerson: null,
    };
  }

  if (chosenCandidateUrl) {
    const matched = imageAnalysisEntryForProductUrl(plain, chosenCandidateUrl);
    if (matched) {
      return {
        reason: "analyzed_but_not_safe_selected",
        analysisExists,
        analysisRowCount,
        matchedAnalysisUrl: matched.url,
        containsPerson: matched.containsPerson,
      };
    }
  }

  return {
    reason: "unknown",
    analysisExists,
    analysisRowCount,
    matchedAnalysisUrl: null,
    containsPerson: null,
  };
}

async function main() {
  const { runDate: runDateArg, limit } = parseArgs(process.argv.slice(2));

  const runDates = await getRankingRunDates();
  const runDate = runDateArg ?? runDates[0] ?? null;
  if (!runDate) {
    console.error("[fallback-reasons] runDate を取得できません。");
    process.exit(1);
  }

  const ranking = await getRankingByDate(runDate);
  if (!ranking) {
    console.error(`[fallback-reasons] ランキングなし: ${runDate}`);
    process.exit(1);
  }

  const slice = ranking.items.slice(0, limit);

  type ReasonStats = Record<ReasonCode, number>;
  const reasonStats: ReasonStats = {
    no_candidate_url: 0,
    candidate_exists_but_not_analyzed: 0,
    analyzed_contains_person: 0,
    analyzed_but_not_safe_selected: 0,
    unknown: 0,
  };

  let loaded = 0;
  let fallbackGoods = 0;

  for (const row of slice) {
    const detail = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (!detail) continue;
    loaded += 1;

    const plain = serializeProductImageFieldsForClient(detail);
    const pipe = resolveProductImageForDisplay(plain, { goodsNo: detail.goodsNo });
    if (pipe.imagePolicy !== "fallback_no_image") continue;

    fallbackGoods += 1;

    const safeImageUrl = (plain.safeImageUrl ?? "").trim() || null;
    const hasSafeProductImage = plain.hasSafeProductImage === true;

    const oyCandidate = bestOyCandidateFromDetail(detail);
    const chosenCandidateUrl = oyCandidate ? oyCandidate.url : null;
    const chosenSourceField = oyCandidate ? oyCandidate.sourceField : null;

    const reasonInfo = classifyFallbackReason(plain, chosenCandidateUrl);
    reasonStats[reasonInfo.reason] += 1;

    const analysisExists = reasonInfo.analysisExists;
    const analysisRowCount = reasonInfo.analysisRowCount;
    const matchedAnalysisUrl = reasonInfo.matchedAnalysisUrl;
    const containsPerson = reasonInfo.containsPerson;

    const labelsSummary = null;

    const line = {
      goodsNo: detail.goodsNo,
      rank: row.rank,
      imagePolicy: pipe.imagePolicy,
      safeImageUrl,
      hasSafeProductImage,
      oliveYoungImageUrl: detail.oliveYoungImageUrl ?? null,
      imageUrl: detail.imageUrl,
      thumbnailUrl: detail.thumbnailUrl,
      chosenCandidateUrl,
      chosenSourceField,
      analysisExists,
      analysisRowCount,
      matchedAnalysisUrl,
      containsPerson,
      labelsSummary,
      rejectionReason: reasonInfo.reason,
    };

    process.stdout.write(`${JSON.stringify(line)}\n`);
  }

  console.error(
    `[fallback-reasons] runDate=${runDate} loaded_products=${loaded} fallback_no_image_goods=${fallbackGoods}`
  );
  console.error(
    `[fallback-reasons] reason_stats ` +
      Object.entries(reasonStats)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ")
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

