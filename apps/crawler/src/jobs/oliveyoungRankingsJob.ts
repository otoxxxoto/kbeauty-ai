/**
 * OliveYoung ランキング巡回ジョブ
 * collectRankingGoodsNos → 各商品: ingredients取得 → Firestore (商品は lastRank/lastRunId、ランキングは oliveyoung_rankings/{runDate})
 * 主キーは runDate (JST YYYY-MM-DD)。runId は実行識別として meta.lastRunId に保存。items は (runDate, rank) で保存。
 * status は必ず保存: collected==0→failed, ng>0 or 重複→partial, それ以外→success。
 */
import { collectRankingGoodsNos } from '../sources/oliveyoungRanking';
import type { RankingItem } from '../sources/oliveyoungRanking';
import { fetchAndBuildIngredientsPayload, fetchDetailNameBrand, normalizeBrandCandidate, pickBrandFromName } from '../sources/oliveyoungIngredients';
import { getAndResetPublicUpsertStats, getExistingProductIds, getPublicProduct, saveRankingHistoryItem, saveRankingItem, saveRankingRun, upsertPublicFromRankingItem, upsertPublicProduct } from '../services/productFirestore';
import { Logger } from '../utils/logger';
import { buildBrandRankings } from './buildBrandRankingsJob';
import { refetchOliveYoungMissingImages } from './refetchOliveYoungMissingImagesJob';
import { runDailyNameJaSurfaceFlagging } from './nameJaOpsJob';

const logger = new Logger('RANKING');

/** 毎日必ず商品詳細取得する上位件数（31位以下は未存在のみ取得） */
const DAILY_DETAIL_REFRESH_RANK_LIMIT =
  (typeof process.env.DETAIL_LIMIT !== 'undefined' && process.env.DETAIL_LIMIT !== ''
    ? parseInt(process.env.DETAIL_LIMIT, 10)
    : 30);
const EFFECTIVE_DETAIL_REFRESH_LIMIT =
  Number.isFinite(DAILY_DETAIL_REFRESH_RANK_LIMIT) && DAILY_DETAIL_REFRESH_RANK_LIMIT >= 1
    ? DAILY_DETAIL_REFRESH_RANK_LIMIT
    : 30;

/** 日次ジョブ最後の画像なし補完件数（将来 env 化しやすい形） */
const DAILY_MISSING_IMAGE_REFILL_LIMIT =
  (typeof process.env.DAILY_MISSING_IMAGE_REFILL_LIMIT !== 'undefined' &&
   process.env.DAILY_MISSING_IMAGE_REFILL_LIMIT !== ''
    ? parseInt(process.env.DAILY_MISSING_IMAGE_REFILL_LIMIT, 10)
    : 20);
const EFFECTIVE_MISSING_IMAGE_REFILL_LIMIT =
  Number.isFinite(DAILY_MISSING_IMAGE_REFILL_LIMIT) && DAILY_MISSING_IMAGE_REFILL_LIMIT >= 0
    ? DAILY_MISSING_IMAGE_REFILL_LIMIT
    : 20;

export interface OliveyoungRankingsJobParams {
  limit?: number;
  dryRun?: boolean;
}

function parseArgs(): OliveyoungRankingsJobParams {
  const argv = process.argv.slice(2);
  let limit = 100;
  let dryRun = false;

  for (const a of argv) {
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (!isNaN(n) && n > 0) limit = n;
    }
    if (a === '--dryRun=1' || a === '--dry-run=1') dryRun = true;
  }

  if (process.env.OLIVEYOUNG_RANKINGS_LIMIT) {
    const n = parseInt(process.env.OLIVEYOUNG_RANKINGS_LIMIT, 10);
    if (!isNaN(n) && n > 0) limit = n;
  }
  if (process.env.OLIVEYOUNG_DRY_RUN === '1') dryRun = true;

  return { limit, dryRun };
}

/** 空でない最初の値を返す（?? 禁止・Cloud Run 互換） */
function pickEnv(...vals: Array<string | undefined | null>): string | undefined {
  for (const v of vals) {
    const s = (v == null ? '' : String(v)).trim();
    if (s) return s;
  }
  return undefined;
}

/** executionName: Cloud Run なら CLOUD_RUN_EXECUTION / K_REVISION、なければ "local" */
function getExecutionName(): string {
  return (
    pickEnv(
      process.env.CLOUD_RUN_EXECUTION,
      process.env.K_REVISION,
      process.env.CLOUD_RUN_JOB
    ) || 'local'
  );
}

/** JST 固定で YYYY-MM-DD（docId 用・必ず string） */
function getRunDateJst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

/** JST で YYYYMMDD_HHmm */
function getRunIdPrefixJst(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {} as Record<string, string>);
  return `${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}`;
}

/** runId = YYYYMMDD_HHmm_{executionName} */
function getRunId(executionName: string): string {
  return `${getRunIdPrefixJst()}_${executionName}`;
}

/** rank 重複があるか */
function hasDuplicateRank(items: RankingItem[]): boolean {
  const ranks = items.map((i) => i.rank);
  return new Set(ranks).size !== ranks.length;
}

/** ランキング保存前の検証ログ（rank 重複チェック含む） */
function logRankingValidation(
  items: RankingItem[],
  runId: string,
  executionName: string,
  runDate: string
): void {
  const ranks = items.map((i) => i.rank);
  const uniqueRanks = new Set(ranks);
  const uniqueGoodsNo = new Set(items.map((i) => i.goodsNo));
  const hasDupRank = uniqueRanks.size !== ranks.length;
  const minRank = ranks.length > 0 ? Math.min(...ranks) : 0;
  const maxRank = ranks.length > 0 ? Math.max(...ranks) : 0;

  logger.info(
    `[RANKING] runId=${runId} executionName=${executionName} runDate=${runDate} uniqueRanksCount=${uniqueRanks.size} minRank=${minRank} maxRank=${maxRank} hasDupRank=${hasDupRank} uniqueGoodsNoCount=${uniqueGoodsNo.size}`
  );
  if (hasDupRank) {
    logger.warn('[RANKING] duplicate rank detected (processing continues)');
  }
}

/** status: collected>=1 なら success、collected===0 のときだけ failed（detail 失敗は run 失敗にしない） */
function computeRankingStatus(collected: number): 'failed' | 'success' {
  if (collected === 0) return 'failed';
  return 'success';
}

export async function runOliveyoungRankingsJob(
  params?: OliveyoungRankingsJobParams
): Promise<void> {
  const startTime = Date.now();
  const { limit, dryRun } = { ...parseArgs(), ...params };
  const startedAt = new Date();
  const executionName = getExecutionName();
  const runDate = getRunDateJst();
  const runId = getRunId(executionName);

  console.log('[CONFIG] DAILY_DETAIL_REFRESH_RANK_LIMIT=', EFFECTIVE_DETAIL_REFRESH_LIMIT);

  const items = await collectRankingGoodsNos({ limit });

  if (items.length === 0) {
    logger.info('[RANKING] collected=0, saving run with status=failed');
    if (!dryRun) {
      const nowIso = new Date().toISOString();
      await saveRankingRun({
        runDate,
        lastRunId: runId,
        source: 'oliveyoung',
        kind: 'rankings',
        limit,
        collected: 0,
        ok: 0,
        ng: 0,
        status: 'failed',
        startedAt: startedAt.toISOString(),
        finishedAt: nowIso,
        executionName,
        createdAt: nowIso,
      });
    }
    console.log(`[PERF] totalMs=${Date.now() - startTime}`);
    return;
  }

  logRankingValidation(items, runId, executionName, runDate);

  // ランキング一覧は全件維持。商品詳細取得対象は「上位 N 件は毎日」「31位以下は未存在のみ」
  const sortedItems = [...items].sort(
    (a, b) => (a.rank != null ? a.rank : 9999) - (b.rank != null ? b.rank : 9999)
  );
  const allGoodsNos = sortedItems.map((x) => x.goodsNo);
  const existingProductIds = await getExistingProductIds(allGoodsNos);

  const fetchTargets = sortedItems.filter((item) => {
    const rankVal = item.rank != null ? item.rank : 9999;
    if (rankVal <= EFFECTIVE_DETAIL_REFRESH_LIMIT) return true;
    return !existingProductIds.has(item.goodsNo);
  });
  const skippedTargets = sortedItems.filter((item) => {
    const rankVal = item.rank != null ? item.rank : 9999;
    return rankVal > EFFECTIVE_DETAIL_REFRESH_LIMIT && existingProductIds.has(item.goodsNo);
  });

  console.log(
    `[DETAIL_FETCH_POLICY] total=${sortedItems.length} fetchTargets=${fetchTargets.length} skipped=${skippedTargets.length}`
  );
  console.log(
    '[DETAIL_FETCH_TARGETS_TOP]',
    JSON.stringify(
      fetchTargets.slice(0, 20).map((item) => ({
        goodsNo: item.goodsNo,
        rank: item.rank,
        reason: (item.rank != null ? item.rank : 9999) <= EFFECTIVE_DETAIL_REFRESH_LIMIT ? 'top30' : 'new_below_30',
      }))
    )
  );
  console.log(
    '[DETAIL_FETCH_SKIPPED_TOP]',
    JSON.stringify(
      skippedTargets.slice(0, 20).map((item) => ({
        goodsNo: item.goodsNo,
        rank: item.rank,
        reason: 'existing_below_30',
      }))
    )
  );

  const failReasons: Record<string, number> = {};
  let okCount = 0;
  let ngCount = 0;

  const detailGoodsNoSet = new Set(fetchTargets.map((t) => t.goodsNo));

  for (const item of items) {
    const { goodsNo, rank } = item;

    // rank > DETAIL_LIMIT: detail（getGoodsDetail）は開かず、ランキング履歴のみ保存
    if (!detailGoodsNoSet.has(goodsNo)) {
      if (!dryRun) {
        await saveRankingHistoryItem(runDate, { rank, goodsNo, name: goodsNo, brand: '' });
      }
      okCount++;
      continue;
    }

    logger.info(`[RANKING] processing goodsNo=${goodsNo} rank=${rank}`);
    try {
      const result = await fetchAndBuildIngredientsPayload(goodsNo, {
        lastRank: rank,
        lastRunId: runId,
        dryRun,
      });
      if (result.ok) {
        okCount++;
      } else {
        ngCount++;
        const reason = result.reason != null && result.reason !== '' ? result.reason : 'unknown';
        failReasons[reason] = (failReasons[reason] != null ? failReasons[reason] : 0) + 1;
        logger.warn(`[RANKING] ng goodsNo=${goodsNo} reason=${reason}`);
      }
      if (!dryRun) {
        const name = result.name != null && result.name !== '' ? result.name : goodsNo;
        const brand = result.brand != null && result.brand !== '' ? result.brand : '';
        await saveRankingHistoryItem(runDate, { rank, goodsNo, name, brand });
        await upsertPublicFromRankingItem({
          goodsNo: item.goodsNo,
          name: item.name,
          brand: item.brand,
          pickedUrl: item.pickedUrl,
        });
      }
    } catch (e: any) {
      ngCount++;
      const reason = e && typeof (e as Error).message === 'string' ? (e as Error).message : String(e);
      failReasons[reason] = (failReasons[reason] != null ? failReasons[reason] : 0) + 1;
      logger.error(`[RANKING] ERROR goodsNo=${item.goodsNo}`, reason);
      if (!dryRun) {
        await saveRankingHistoryItem(runDate, { rank: item.rank, goodsNo: item.goodsNo, name: item.goodsNo, brand: '' });
        await upsertPublicFromRankingItem({
          goodsNo: item.goodsNo,
          name: item.name,
          brand: item.brand,
          pickedUrl: item.pickedUrl,
        });
      }
    }
  }

  const finishedAt = new Date();
  logger.info(`[RANKING] done ok=${okCount} ng=${ngCount} runId=${runId}${dryRun ? ' dryRun=1' : ''}`);

  // ランキング後処理: fetchTargets のみ fetchDetailNameBrand で name/brand を public に反映
  const DETAIL_CONCURRENCY = 3;
  const detailResults: {
    goodsNo: string;
    rank: number;
    name?: string;
    title?: string;
    nameCandidate?: string;
    brand?: string;
    pickedUrl?: string;
    pickedBrandReason?: string;
    brandSelectorHit?: boolean;
    imageUrl?: string;
    thumbnailUrl?: string;
  }[] = [];
  if (fetchTargets.length > 0 && !dryRun) {
    for (let i = 0; i < fetchTargets.length; i += DETAIL_CONCURRENCY) {
      const chunk = fetchTargets.slice(i, i + DETAIL_CONCURRENCY);
      const chunkResults = await Promise.all(
        chunk.map(async (item, chunkIdx) => {
          const globalIdx = i + chunkIdx;
          if (globalIdx < 3) {
            console.log(`[DETAIL] start goodsNo=${item.goodsNo} rank=${item.rank}`);
          }
          try {
            const r = await fetchDetailNameBrand(item.goodsNo, { rank: item.rank });

            const titleRaw =
              (r.title && r.title.trim()) ? r.title.trim() : '';

            const nameRaw =
              (r.name && r.name.trim()) ? r.name.trim() : '';

            const nameCandidateRaw =
              (r.nameCandidate && r.nameCandidate.trim())
                ? r.nameCandidate.trim()
                : (nameRaw || titleRaw || '');

            const brandRaw =
              (r.brand && r.brand.trim()) ? r.brand.trim() : '';

            const execId =
              process.env.CLOUD_RUN_EXECUTION || process.env.CLOUD_RUN_JOB || 'local';

            logger.info(
              `[DETAIL_RETURN_DEBUG_V3] exec=${execId} goodsNo=${item.goodsNo} rank=${item.rank} ` +
              `r.name=${JSON.stringify(nameRaw)} ` +
              `r.title=${JSON.stringify(titleRaw)} ` +
              `r.nameCandidate=${JSON.stringify(nameCandidateRaw)} ` +
              `r.brand=${JSON.stringify(brandRaw)}`
            );

            return {
              goodsNo: item.goodsNo,
              rank: item.rank,
              name: nameRaw || nameCandidateRaw || titleRaw,
              title: titleRaw,
              nameCandidate: nameCandidateRaw || nameRaw || titleRaw,
              brand: brandRaw,
              pickedUrl: r.pickedUrl,
              pickedBrandReason: r.pickedBrandReason,
              brandSelectorHit: r.brandSelectorHit,
            };
          } catch (e: unknown) {
            const err = e as { message?: string };
            const message = err != null && err.message != null ? err.message : String(e);
            console.warn('[DETAIL_FAIL]', { goodsNo: item.goodsNo, rank: item.rank, message });
            if (/timeout|Timeout|TimeoutError/i.test(message)) {
              console.warn(`[DETAIL] skip by timeout`, { goodsNo: item.goodsNo, rank: item.rank });
            }
            return {
              goodsNo: item.goodsNo,
              rank: item.rank,
              name: '',
              title: '',
              nameCandidate: '',
              brand: '',
              pickedUrl: '',
              pickedBrandReason: '',
              brandSelectorHit: false,
            };
          }
        })
      );
      for (const r of chunkResults.slice(0, 3)) {
        logger.info(
          `[CHUNK_RESULT_DEBUG] goodsNo=${r.goodsNo} rank=${r.rank} name=${JSON.stringify(r.name || '')} title=${JSON.stringify(r.title || '')} nameCandidate=${JSON.stringify(r.nameCandidate || '')} brand=${JSON.stringify(r.brand || '')}`
        );
      }

      for (const r of chunkResults) {
        detailResults.push({
          goodsNo: r.goodsNo,
          rank: r.rank,
          name: r.name || '',
          title: r.title || '',
          nameCandidate: r.nameCandidate || r.name || r.title || '',
          brand: r.brand || '',
          pickedUrl: r.pickedUrl,
          pickedBrandReason: r.pickedBrandReason,
          brandSelectorHit: r.brandSelectorHit,
          imageUrl: r.imageUrl,
          thumbnailUrl: r.thumbnailUrl,
        });
      }
    }
    for (const d of detailResults.slice(0, 3)) {
      logger.info(
        `[CHUNK_RESULT_DEBUG] goodsNo=${d.goodsNo} rank=${d.rank} ` +
        `name=${JSON.stringify(d.name || '')} ` +
        `title=${JSON.stringify(d.title || '')} ` +
        `nameCandidate=${JSON.stringify(d.nameCandidate || '')} ` +
        `brand=${JSON.stringify(d.brand || '')}`
      );
    }
    for (const d of detailResults.slice(0, 3)) {
      logger.info(
        `[DETAIL_RESULT_DEBUG] goodsNo=${d.goodsNo} rank=${d.rank} name=${JSON.stringify(d.name || '')} title=${JSON.stringify(d.title || '')} nameCandidate=${JSON.stringify(d.nameCandidate || '')} brand=${JSON.stringify(d.brand || '')}`
      );
    }

    logger.info(
      `[BEFORE_BRAND_PICK_LOOP] exec=${process.env.CLOUD_RUN_EXECUTION || process.env.CLOUD_RUN_JOB || 'local'} detailResultsCount=${detailResults.length}`
    );

    // brandPick 直前のフォールバック（空文字は無効、空なら Unknown にしログで分かるようにする）
    for (const item of detailResults) {
      item.name =
        (item.name && item.name.trim()) ? item.name.trim() :
        (item.title && item.title.trim()) ? item.title.trim() :
        '';

      item.title =
        (item.title && item.title.trim()) ? item.title.trim() :
        (item.name && item.name.trim()) ? item.name.trim() :
        '';

      const raw =
        (item.nameCandidate && item.nameCandidate.trim()) ? item.nameCandidate.trim() :
        (item.name && item.name.trim()) ? item.name.trim() :
        (item.title && item.title.trim()) ? item.title.trim() :
        '';

      item.nameCandidate = raw || 'Unknown';

      if (item.nameCandidate === 'Unknown') {
        logger.info(`[BRAND_PICK_FALLBACK] goodsNo=${item.goodsNo} rank=${item.rank} nameCandidate=Unknown (name/title empty)`);
      }
    }

    for (const item of detailResults) {
      logger.info(
        `[BRAND_PICK_LOOP_ITEM] goodsNo=${item.goodsNo} rank=${item.rank} name=${JSON.stringify(item.name ?? '')} title=${JSON.stringify(item.title ?? '')} nameCandidate=${JSON.stringify(item.nameCandidate ?? '')} brand=${JSON.stringify(item.brand ?? '')}`
      );

      const input = (item.nameCandidate || item.name || item.title || '').trim();
      logger.info(
        `[BRAND_PICK_INPUT_V8] goodsNo=${item.goodsNo} rank=${item.rank} input=${JSON.stringify(input)}`
      );

      try {
        logger.info(
          `[BRAND_PICK_DEBUG_KEYS] goodsNo=${item.goodsNo} keys=${Object.keys(item).slice(0, 40).join(',')}`
        );
        logger.info(
          `[BRAND_PICK_DEBUG_NAMEFIELDS] goodsNo=${item.goodsNo} name=${JSON.stringify(item.name != null ? item.name : '')} nameCandidate=${JSON.stringify(item.nameCandidate != null ? item.nameCandidate : '')} title=${JSON.stringify(item.title != null ? item.title : '')}`
        );

        const existing = await getPublicProduct(item.goodsNo);
        const beforeBrand = existing != null && existing.brand != null ? existing.brand : '';

        const nameCandidate = (item.nameCandidate || item.name || item.title || '').trim();
        const normalizedItemBrand = normalizeBrandCandidate(item.brand || '');
        const pickedBrand = pickBrandFromName(input);

        logger.info(
          `[BRAND_PICK_RESULT_V9] goodsNo=${item.goodsNo} rank=${item.rank} input=${JSON.stringify(input)} pickedBrand=${JSON.stringify(pickedBrand)} beforeBrand=${JSON.stringify(item.brand || '')}`
        );

        logger.info(
          `[BRAND_PICK] goodsNo=${item.goodsNo} beforeBrand=${item.brand || 'Unknown'} pickedBrand=${pickedBrand} reason=${pickedBrand === 'Unknown' ? 'empty' : 'name_first_token'} name=${JSON.stringify(nameCandidate)}`
        );

        const finalBrand =
          pickedBrand && pickedBrand !== 'Unknown'
            ? pickedBrand
            : normalizedItemBrand || '';

        const hasFinalBrand = !!(finalBrand && finalBrand.trim());

        logger.info(
          `[FINAL_BRAND_CHECK_V11] goodsNo=${item.goodsNo} rank=${item.rank} ` +
          `input=${JSON.stringify(input)} ` +
          `pickedBrand=${JSON.stringify(pickedBrand)} ` +
          `itemBrand=${JSON.stringify(item.brand || '')} ` +
          `normalizedItemBrand=${JSON.stringify(normalizedItemBrand)} ` +
          `finalBrand=${JSON.stringify(finalBrand)}`
        );

        const finalName = (item.name && item.name.trim()) ? item.name.trim() : '';
        logger.info(
          `[PUBLIC_UPSERT_ITEM_V10] goodsNo=${item.goodsNo} rank=${item.rank} name=${JSON.stringify(finalName || '')} brand=${JSON.stringify(finalBrand || '')}`
        );

        const { wroteName, wroteBrand, wroteBrandUnknown } = await upsertPublicProduct({
          goodsNo: item.goodsNo,
          name: item.name,
          brand: finalBrand,
          lastSeenRank: item.rank,
          runDate,
          imageUrl: item.imageUrl,
          thumbnailUrl: item.thumbnailUrl,
        });

        logger.info(
          `[PUBLIC_UPSERT] goodsNo=${item.goodsNo} rank=${item.rank} wroteName=${wroteName} wroteBrand=${wroteBrand} wroteBrandUnknown=${wroteBrandUnknown}`
        );
      } catch (e: unknown) {
        const msg = e != null && typeof (e as Error).message === 'string' ? (e as Error).message : String(e);
        logger.warn('[PUBLIC_UPSERT] skip', { goodsNo: item.goodsNo, rank: item.rank, message: msg });
      }
    }
  }

  if (!dryRun) {
    const pub = getAndResetPublicUpsertStats();
    logger.info(
      `[PUBLIC_UPSERT_SUMMARY_V10] total=${detailResults.length} wroteName=${pub.wroteName} wroteBrand=${pub.wroteBrand} wroteBrandUnknown=${pub.wroteBrandUnknown} skipped=${pub.skipped}`
    );
    if (pub.total > 0) {
      logger.info(
        `[RANKING] publicUpsert: total=${pub.total} wroteName=${pub.wroteName} wroteBrand=${pub.wroteBrand} wroteBrandUnknown=${pub.wroteBrandUnknown} skipped=${pub.skipped}`
      );
    }
  }

  const topReasons = Object.entries(failReasons)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  if (topReasons.length > 0) {
    logger.info('[RANKING] fail reasons top:', topReasons.map(([r, c]) => `${r}:${c}`).join(', '));
  }

  if (!dryRun) {
    const nowIso = finishedAt.toISOString();
    const status = computeRankingStatus(items.length);
    await saveRankingRun({
      runDate,
      lastRunId: runId,
      source: 'oliveyoung',
      kind: 'rankings',
      limit,
      collected: items.length,
      ok: okCount,
      ng: ngCount,
      status,
      startedAt: startedAt.toISOString(),
      finishedAt: nowIso,
      executionName,
      createdAt: nowIso,
    });
    const capturedAt = nowIso;
    const detailByGoodsNo = new Map(
      (detailResults as { goodsNo: string; name?: string; brand?: string; pickedUrl?: string }[]).map((d) => [
        d.goodsNo,
        {
          name: d.name != null ? d.name : '',
          brand: d.brand != null ? d.brand : 'Unknown',
          detailUrl: d.pickedUrl != null ? d.pickedUrl : '',
        },
      ])
    );
    for (const item of items) {
      const detail = detailByGoodsNo.get(item.goodsNo);
      await saveRankingItem(runDate, {
        rank: item.rank,
        goodsNo: item.goodsNo,
        capturedAt,
        executionName,
        runDate,
        ...(detail && { name: detail.name, brand: detail.brand, detailUrl: detail.detailUrl }),
        updatedAt: nowIso,
      } as Parameters<typeof saveRankingItem>[1]);
    }

    // 日次更新直後に公開面優先フラグを付与（失敗は本体失敗として扱う）
    try {
      await runDailyNameJaSurfaceFlagging();
    } catch (err) {
      console.error('[DAILY_NAMEJA_SURFACE_ERROR]', err);
      throw err;
    }

    try {
      console.log(`[JOB] start build brand rankings runDate=${runDate}`);
      await buildBrandRankings(runDate);
      console.log(`[JOB] finish build brand rankings runDate=${runDate}`);
    } catch (err) {
      console.error(`[JOB] build brand rankings failed runDate=${runDate}`, err);
      throw err;
    }

    if (EFFECTIVE_MISSING_IMAGE_REFILL_LIMIT >= 1) {
      try {
        console.log('[JOB] start missing image refill');
        await refetchOliveYoungMissingImages(EFFECTIVE_MISSING_IMAGE_REFILL_LIMIT);
        console.log('[JOB] finish missing image refill');
      } catch (err) {
        console.error('[JOB] missing image refill failed', err);
      }
    }
  }

  console.log(
    `[DETAIL_FETCH_SUMMARY] runDate=${runDate} totalRankingItems=${items.length} fetched=${fetchTargets.length} skipped=${skippedTargets.length} topRefreshLimit=${EFFECTIVE_DETAIL_REFRESH_LIMIT}`
  );

  const elapsed = Date.now() - startTime;
  console.log(`[PERF] totalMs=${elapsed}`);
  console.log(`[JOB] OliveYoung daily pipeline done runDate=${runDate}`);
}
