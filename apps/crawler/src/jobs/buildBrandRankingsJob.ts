/**
 * ブランド別ランキング集計ジョブ
 * oliveyoung_rankings/{runDate}/items と oliveyoung_products_public を読み、
 * brand_rankings/{runDate} と brand_rankings/{runDate}/items/{brandKey} に保存する。
 */
import { FieldValue, Firestore } from '@google-cloud/firestore';

const RANKINGS_COLLECTION = 'oliveyoung_rankings';
const PRODUCTS_PUBLIC_COLLECTION = 'oliveyoung_products_public';
const BRAND_RANKINGS_COLLECTION = 'brand_rankings';

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export type BrandAgg = {
  brand: string;
  brandKey: string;
  count: number;
  bestRank: number;
  score: number;
  goodsNos: string[];
  sampleNames: string[];
};

/** 前日 item の読み取り用（rank, bestRank, score, count を比較に使用） */
type PrevItem = {
  rank?: number;
  bestRank?: number;
  score?: number;
  count?: number;
};

/**
 * runDate (YYYY-MM-DD) の前日文字列を返す。
 */
function getPrevDate(runDate: string): string {
  const d = new Date(runDate + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 英字・数字・ハイフン中心で URL に使える brandKey を生成する。
 */
export function makeBrandKey(brand: string): string {
  const raw = (brand || '').trim().toLowerCase();
  if (!raw) return 'unknown';

  return (
    raw
      .replace(/[×✕✖]/g, 'x')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9가-힣\-]/g, '')
      .replace(/\-+/g, '-')
      .replace(/^\-|\-$/g, '') || 'unknown'
  );
}

/**
 * 指定 runDate のランキング items と public を集計し、brand_rankings に保存する。
 */
export async function buildBrandRankings(runDate: string): Promise<{
  runDate: string;
  totalBrands: number;
  totalItems: number;
}> {
  const runDateTrimmed = (runDate || '').trim();
  if (!runDateTrimmed) {
    throw new Error('runDate is required');
  }

  console.log('[BRAND_RANKINGS_COLLECTIONS]', `RANKINGS_COLLECTION=${RANKINGS_COLLECTION}`, `PRODUCTS_PUBLIC_COLLECTION=${PRODUCTS_PUBLIC_COLLECTION}`, `BRAND_RANKINGS_COLLECTION=${BRAND_RANKINGS_COLLECTION}`);
  console.log(`[BRAND_RANKINGS_START] runDate=${runDateTrimmed}`);

  const db = getDb();
  const parentRef = db.collection(RANKINGS_COLLECTION).doc(runDateTrimmed);
  const parentSnap = await parentRef.get();

  if (!parentSnap.exists) {
    throw new Error(`ranking doc not found: ${runDateTrimmed}`);
  }

  const itemsSnap = await parentRef
    .collection('items')
    .orderBy('rank', 'asc')
    .get();

  console.log(`[BRAND_RANKINGS_ITEMS] runDate=${runDateTrimmed} count=${itemsSnap.size}`);

  const agg = new Map<string, BrandAgg>();
  let totalItems = 0;

  for (const doc of itemsSnap.docs) {
    const data = doc.data();
    const goodsNo = String(data.goodsNo || '').trim();
    const rank = Number(data.rank || 0);

    if (!goodsNo || !rank) continue;
    totalItems++;

    const productSnap = await db
      .collection(PRODUCTS_PUBLIC_COLLECTION)
      .doc(goodsNo)
      .get();
    if (!productSnap.exists) continue;

    const product = productSnap.data() || {};
    const brand = String(product.brand || '').trim();
    const name = String(product.name || '').trim();

    if (!brand) continue;

    const brandKey = makeBrandKey(brand);
    const prev = agg.get(brandKey);

    if (!prev) {
      agg.set(brandKey, {
        brand,
        brandKey,
        count: 1,
        bestRank: rank,
        score: 101 - rank,
        goodsNos: goodsNo ? [goodsNo] : [],
        sampleNames: name ? [name] : [],
      });
    } else {
      prev.count += 1;
      prev.bestRank = Math.min(prev.bestRank, rank);
      prev.score += 101 - rank;

      if (goodsNo && prev.goodsNos.length < 10 && !prev.goodsNos.includes(goodsNo)) {
        prev.goodsNos.push(goodsNo);
      }

      if (name && prev.sampleNames.length < 10 && !prev.sampleNames.includes(name)) {
        prev.sampleNames.push(name);
      }
    }
  }

  let rows = Array.from(agg.values());
  rows = rows.filter((r) => {
    const b = (r.brand || '').trim();
    return b && b.toLowerCase() !== 'unknown';
  });
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
    return b.count - a.count;
  });

  const rankedRows = rows.map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));

  const prevRunDate = getPrevDate(runDateTrimmed);
  console.log(`[BRAND_RANKINGS_PREV] runDate=${runDateTrimmed} prevRunDate=${prevRunDate}`);

  const prevMap = new Map<string, PrevItem>();
  try {
    const prevParentRef = db.collection(BRAND_RANKINGS_COLLECTION).doc(prevRunDate);
    const prevParentSnap = await prevParentRef.get();
    if (prevParentSnap.exists) {
      const prevItemsSnap = await prevParentRef.collection('items').get();
      for (const doc of prevItemsSnap.docs) {
        const data = doc.data();
        const key = String(data.brandKey ?? doc.id).trim();
        if (!key) continue;
        prevMap.set(key, {
          rank: data.rank != null ? Number(data.rank) : undefined,
          bestRank: data.bestRank != null ? Number(data.bestRank) : undefined,
          score: data.score != null ? Number(data.score) : undefined,
          count: data.count != null ? Number(data.count) : undefined,
        });
      }
    }
  } catch {
    // 前日データが無くてもエラーにしない
  }

  console.log(
    '[BRAND_RANK_ASSIGN]',
    rankedRows.slice(0, 5).map((row) => ({
      brand: row.brand,
      brandKey: row.brandKey,
      rank: row.rank,
      score: row.score,
      bestRank: row.bestRank,
      count: row.count,
    }))
  );

  const outParentRef = db.collection(BRAND_RANKINGS_COLLECTION).doc(runDateTrimmed);

  await outParentRef.set(
    {
      runDate: runDateTrimmed,
      totalBrands: rankedRows.length,
      totalItems,
      status: 'success',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const batch = db.batch();

  for (const row of rankedRows) {
    const currentRank = row.rank;
    const prev = prevMap.get(row.brandKey);

    let prevBestRank: number | null = null;
    let prevScore: number | null = null;
    let prevCount: number | null = null;
    let rankDiff: number | null = null;
    let scoreDiff: number | null = null;
    let countDiff: number | null = null;
    let isNew = true;

    if (prev) {
      isNew = false;
      prevBestRank = prev.bestRank ?? null;
      prevScore = prev.score ?? null;
      prevCount = prev.count ?? null;
      rankDiff = prev.rank != null ? prev.rank - currentRank : null;
      scoreDiff = prev.score != null ? row.score - prev.score : null;
      countDiff = prev.count != null ? row.count - prev.count : null;
    }

    const ref = outParentRef.collection('items').doc(row.brandKey);
    batch.set(
      ref,
      {
        brand: row.brand,
        brandKey: row.brandKey,
        rank: row.rank,
        count: row.count,
        bestRank: row.bestRank,
        score: row.score,
        goodsNos: row.goodsNos,
        sampleNames: row.sampleNames,
        prevBestRank,
        prevScore,
        prevCount,
        rankDiff,
        scoreDiff,
        countDiff,
        isNew,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();

  console.log(
    `[BRAND_RANKINGS_DONE_V2] runDate=${runDateTrimmed} totalBrands=${rankedRows.length} totalItems=${totalItems}`
  );
  console.log(
    `[BRAND_RANKINGS_DONE_V3] runDate=${runDateTrimmed} firstBrand=${rankedRows[0]?.brand ?? ''} firstRank=${rankedRows[0]?.rank ?? ''}`
  );

  return {
    runDate: runDateTrimmed,
    totalBrands: rankedRows.length,
    totalItems,
  };
}

/** CLI: pnpm run oliveyoung:brand-rankings -- 2026-03-10 */
if (process.argv[1]?.includes('buildBrandRankingsJob')) {
  const runDate = process.argv[2]?.trim();
  if (!runDate) {
    console.error('Usage: pnpm run oliveyoung:brand-rankings -- <runDate>');
    process.exit(1);
  }
  buildBrandRankings(runDate)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
