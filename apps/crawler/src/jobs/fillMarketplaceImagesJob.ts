/**
 * 人物画像除外で画像なしになった商品に、
 * Amazon / 楽天 / Qoo10 の画像を自動補完する。
 *
 * 公開面優先の順序（getMarketImageFillTargets 内）:
 *   1. TOP 急上昇 → 2. TOP 注目 → 3. ランキング上位 →（将来）4. カテゴリ上位
 *
 * 使い方:
 *   pnpm run oliveyoung:fill-marketplace-images -- --top 10
 *     → TOP（急上昇+注目）のみ、最大 10 件
 *   pnpm run oliveyoung:fill-marketplace-images -- --top=10
 *   pnpm run oliveyoung:fill-marketplace-images -- --ranking-only 30
 *     → ランキングのみ。上位 30 件まで見て、最大 30 件処理（--ranking-top=50 で探索深さを増やせる）
 *   pnpm run oliveyoung:fill-marketplace-images -- --ranking-top=30
 *     → TOP → ランキングの順（既定）。ランキングは上位 30 まで参照
 *   pnpm run oliveyoung:fill-marketplace-images -- 50
 *     → TOP → ランキングの順で最大 50 件（ランキング深さは既定 30）
 *   pnpm run oliveyoung:fill-marketplace-images -- 50 --ranking-top=50
 *     → 同上だがランキングは上位 50 件まで見る
 *   pnpm run oliveyoung:fill-marketplace-images -- --goods=A000000235282 --debug
 *   DEBUG_MARKETPLACE_HTML=1 pnpm run oliveyoung:fill-marketplace-images -- 5
 */
import "dotenv/config";
import {
  fetchMarketplaceSearchImages,
  type MarketplaceSearchImagesResult,
} from "../services/fetchMarketplaceSearchImages";
import {
  clearStaleDeviceWeakMarketplaceFillIfNeeded,
  getMarketImageFillTargets,
  getProductsMissingMarketplaceImages,
  getMarketImageFillTargetsForGoodsNos,
  updateMarketplaceProductImagesWithAnalysis,
  type MarketImageFillTarget,
} from "../services/marketplaceImagesFirestore";

const DEFAULT_LIMIT = 10;
const SLEEP_MS = 600;

type MarketKey = "amazon" | "rakuten" | "qoo10";

function buildMarketOutcomeLog(fetched: MarketplaceSearchImagesResult): {
  ok: MarketKey[];
  fail: Partial<Record<MarketKey, string>>;
} {
  const ok: MarketKey[] = [];
  const fail: Partial<Record<MarketKey, string>> = {};
  const triple: { key: MarketKey; field: keyof MarketplaceSearchImagesResult }[] = [
    { key: "amazon", field: "amazonImage" },
    { key: "rakuten", field: "rakutenImage" },
    { key: "qoo10", field: "qoo10Image" },
  ];
  for (const { key, field } of triple) {
    const url = fetched[field];
    if (typeof url === "string" && url.trim()) {
      ok.push(key);
    } else {
      fail[key] = fetched.skipReasons?.[key] ?? "no_url";
    }
  }
  return { ok, fail };
}

function parseArgs(argv: string[]): {
  limit: number;
  topOnly: boolean;
  rankingOnly: boolean;
  rankingTop: number | null;
  legacy: boolean;
  debug: boolean;
  goodsFilter: string | null;
} {
  let limit = DEFAULT_LIMIT;
  let topOnly = false;
  let rankingOnly = false;
  let rankingTop: number | null = null;
  let legacy = false;
  let debug = false;
  let goodsFilter: string | null = null;

  for (const a of argv) {
    if (a === "--top" || a.startsWith("--top=")) {
      rankingOnly = false;
      topOnly = true;
      if (a.startsWith("--top=")) {
        const v = parseInt(a.slice("--top=".length), 10);
        if (Number.isFinite(v)) limit = Math.min(Math.max(1, v), 100);
      }
      continue;
    }
    if (a === "--ranking-only") {
      topOnly = false;
      rankingOnly = true;
      continue;
    }
    if (a === "--legacy") {
      legacy = true;
      continue;
    }
    if (a === "--debug") {
      debug = true;
      continue;
    }
    if (a.startsWith("--goods=")) {
      goodsFilter = a.slice("--goods=".length).trim() || null;
      continue;
    }
    if (a.startsWith("--ranking-top=")) {
      const v = parseInt(a.slice("--ranking-top=".length), 10);
      if (Number.isFinite(v)) rankingTop = Math.min(Math.max(0, v), 200);
      continue;
    }
    if (/^\d+$/.test(a)) {
      const n = parseInt(a, 10);
      if (Number.isFinite(n)) limit = Math.min(Math.max(1, n), 100);
    }
  }
  return { limit, topOnly, rankingOnly, rankingTop, legacy, debug, goodsFilter };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runWithTargets(
  targets: MarketImageFillTarget[],
  opts?: { debug?: boolean }
): Promise<void> {
  const debug = opts?.debug ?? false;
  for (const t of targets) {
    const rankPart = t.rank != null ? ` / rank=${t.rank}` : "";
    console.log(
      "[MARKET_IMAGE_TARGETS]",
      `goodsNo=${t.goodsNo} / source=${t.source}${rankPart} / nameJa=${t.nameJa ?? ""} / name=${t.name} / brandJa=${t.brandJa ?? ""} / brand=${t.brand}`
    );
  }

  let filled = 0;
  let skipped = 0;

  for (const t of targets) {
    const product = {
      brand: t.brand,
      brandJa: t.brandJa,
      name: t.name,
      nameJa: t.nameJa,
    };
    try {
      const staleCleared = await clearStaleDeviceWeakMarketplaceFillIfNeeded(t.goodsNo, product);
      if (staleCleared) {
        console.log("[MARKET_IMAGE_STALE_CLEARED]", {
          goodsNo: t.goodsNo,
          reason: "device_weak_fill_or_force_list",
        });
      }
      const fetched = await fetchMarketplaceSearchImages(product, {
        goodsNo: t.goodsNo,
        debugHtml: debug,
      });
      const { ok, fail } = buildMarketOutcomeLog(fetched);

      const toSave: { amazonImage?: string; rakutenImage?: string; qoo10Image?: string } = {};
      if (fetched.amazonImage) toSave.amazonImage = fetched.amazonImage;
      if (fetched.rakutenImage) toSave.rakutenImage = fetched.rakutenImage;
      if (fetched.qoo10Image) toSave.qoo10Image = fetched.qoo10Image;

      console.log("[MARKET_IMAGE_SUMMARY]", {
        goodsNo: t.goodsNo,
        source: t.source,
        rank: t.rank ?? null,
        marketsOk: ok,
        marketsFail: fail,
        anyFilled: ok.length > 0,
      });

      if (Object.keys(toSave).length === 0) {
        const reasons = fetched.skipReasons
          ? [
              fetched.skipReasons.amazon && `amazon:${fetched.skipReasons.amazon}`,
              fetched.skipReasons.rakuten && `rakuten:${fetched.skipReasons.rakuten}`,
              fetched.skipReasons.qoo10 && `qoo10:${fetched.skipReasons.qoo10}`,
            ]
              .filter(Boolean)
              .join(",")
          : "no_candidates";
        console.log("[MARKET_IMAGE_SKIPPED]", `goodsNo=${t.goodsNo} / source=${t.source} / reason=${reasons}`);
        skipped += 1;
      } else {
        await updateMarketplaceProductImagesWithAnalysis(t.goodsNo, toSave, {
          imageMatchLevels: fetched.imageMatchLevels,
        });
        const levelByField: Record<string, MarketKey> = {
          amazonImage: "amazon",
          rakutenImage: "rakuten",
          qoo10Image: "qoo10",
        };
        for (const [field, url] of Object.entries(toSave)) {
          if (url) {
            const mk = levelByField[field];
            const matchLevel =
              mk && fetched.imageMatchLevels ? fetched.imageMatchLevels[mk] : undefined;
            console.log(
              "[MARKET_IMAGE_FILLED]",
              `goodsNo=${t.goodsNo} / source=${t.source} / market=${field} / matchLevel=${matchLevel ?? "n/a"} / imageUrl=${url}`
            );
          }
        }
        filled += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(
        "[MARKET_IMAGE_SKIPPED]",
        `goodsNo=${t.goodsNo} / source=${t.source} / reason=error:${msg.slice(0, 60)}`
      );
      skipped += 1;
    }
    await sleep(SLEEP_MS);
  }

  console.log("[FILL_MARKETPLACE_IMAGES_DONE]", `filled=${filled} skipped=${skipped}`);
}

export async function runFillMarketplaceImages(
  limit: number,
  options?: {
    topOnly?: boolean;
    rankingOnly?: boolean;
    rankingTop?: number | null;
    legacy?: boolean;
    debug?: boolean;
    goodsFilter?: string | null;
  }
): Promise<void> {
  const debug = options?.debug ?? false;

  if (options?.goodsFilter) {
    const goodsNos = options.goodsFilter.split(",").map((g) => g.trim()).filter(Boolean);
    const targets = await getMarketImageFillTargetsForGoodsNos(goodsNos);
    console.log("[FILL_MARKETPLACE_IMAGES_START]", {
      mode: "goods_filter",
      targets: targets.length,
      goodsNos,
      debug,
    });
    if (targets.length === 0) {
      console.log("[FILL_MARKETPLACE_IMAGES_DONE]", "filled=0 skipped=0 (no targets for goodsNos)");
      return;
    }
    await runWithTargets(targets, { debug });
    return;
  }

  if (options?.legacy) {
    const targets = await getProductsMissingMarketplaceImages(limit);
    console.log("[FILL_MARKETPLACE_IMAGES_START]", {
      mode: "legacy",
      targets: targets.length,
      limit,
      debug,
    });
    if (targets.length === 0) {
      console.log("[FILL_MARKETPLACE_IMAGES_DONE]", "filled=0 skipped=0 (no targets)");
      return;
    }
    const asTargets: MarketImageFillTarget[] = targets.map((p) => ({
      goodsNo: p.goodsNo,
      name: p.name,
      nameJa: p.nameJa,
      brand: p.brand,
      brandJa: p.brandJa,
      source: "ranking",
    }));
    await runWithTargets(asTargets, { debug });
    return;
  }

  const rankingTopVal = options?.rankingTop !== null && options?.rankingTop !== undefined
    ? options.rankingTop
    : 30;

  const targets = await getMarketImageFillTargets({
    topOnly: options?.topOnly ?? false,
    rankingOnly: options?.rankingOnly ?? false,
    rankingTop: rankingTopVal,
    limit,
  });

  const mode = options?.topOnly
    ? "top_only"
    : options?.rankingOnly
      ? "ranking_only"
      : "top_then_ranking";

  console.log("[FILL_MARKETPLACE_IMAGES_START]", {
    mode,
    targets: targets.length,
    limit,
    topOnly: options?.topOnly,
    rankingOnly: options?.rankingOnly,
    rankingTop: rankingTopVal,
    debug,
  });
  if (targets.length === 0) {
    console.log("[FILL_MARKETPLACE_IMAGES_DONE]", "filled=0 skipped=0 (no targets)");
    return;
  }
  await runWithTargets(targets, { debug });
}

async function main(): Promise<void> {
  const { limit, topOnly, rankingOnly, rankingTop, legacy, debug, goodsFilter } = parseArgs(
    process.argv.slice(2)
  );
  await runFillMarketplaceImages(limit, {
    topOnly: topOnly || undefined,
    rankingOnly: rankingOnly || undefined,
    rankingTop: rankingTop !== null ? rankingTop : undefined,
    legacy,
    debug,
    goodsFilter,
  });
}

main().catch((err) => {
  console.error("[FILL_MARKETPLACE_IMAGES_ERROR]", err);
  process.exit(1);
});
