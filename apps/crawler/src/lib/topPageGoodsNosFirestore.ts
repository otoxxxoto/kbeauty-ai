/**
 * Web TOP (/oliveyoung) と同じソース（oliveyoung_rankings）から
 * 急上昇・注目TOP3・ランキング続きの goodsNo を収集する。
 */
import { Firestore } from "@google-cloud/firestore";

const RANKINGS_COLLECTION = "oliveyoung_rankings";

export type RankingItemRow = {
  rank: number;
  goodsNo: string;
  name: string;
  brand: string;
  rankDiff: number | null;
  isNew: boolean;
};

async function getRankingRunDates(db: Firestore): Promise<string[]> {
  const snap = await db.collection(RANKINGS_COLLECTION).get();
  const dates = snap.docs.map((d) => d.id).filter(Boolean);
  dates.sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  return dates;
}

export async function getRankingItems(
  db: Firestore,
  runDate: string
): Promise<RankingItemRow[] | null> {
  const runDateTrimmed = (runDate || "").trim();
  if (!runDateTrimmed) return null;

  const docRef = db.collection(RANKINGS_COLLECTION).doc(runDateTrimmed);
  const [metaSnap, itemsSnap] = await Promise.all([
    docRef.get(),
    docRef.collection("items").get(),
  ]);

  if (!metaSnap.exists) return null;

  return itemsSnap.docs
    .map((d) => {
      const data = d.data();
      const rank = data.rank != null ? Number(data.rank) : parseInt(d.id, 10);
      if (Number.isNaN(rank)) return null;
      return {
        rank,
        goodsNo: String(data.goodsNo ?? "").trim(),
        name: String(data.name ?? "").trim(),
        brand: String(data.brand ?? "").trim(),
        rankDiff: data.rankDiff != null ? Number(data.rankDiff) : null,
        isNew: !!data.isNew,
      };
    })
    .filter((r): r is RankingItemRow => r !== null && r.goodsNo !== "")
    .sort((a, b) => a.rank - b.rank);
}

/** Web getRisingProductsWithProducts と同じ並びの急上昇候補（メタ付き） */
export type RisingCandidate = {
  row: RankingItemRow;
  rankDiff?: number;
  isNew: boolean;
};

export function pickRisingCandidates(
  latest: RankingItemRow[],
  prev: RankingItemRow[],
  maxItems: number
): RisingCandidate[] {
  const prevRankByGoodsNo = new Map<string, number>();
  for (const row of prev) {
    if (row.goodsNo) prevRankByGoodsNo.set(row.goodsNo, row.rank);
  }

  const candidates: RisingCandidate[] = [];
  for (const row of latest) {
    const prevRank = prevRankByGoodsNo.get(row.goodsNo);
    if (prevRank === undefined) {
      candidates.push({ row, isNew: true });
    } else if (prevRank > row.rank) {
      candidates.push({ row, rankDiff: prevRank - row.rank, isNew: false });
    }
  }

  const risingFirst = candidates
    .filter((c) => !c.isNew && (c.rankDiff ?? 0) > 0)
    .sort((a, b) => (b.rankDiff ?? 0) - (a.rankDiff ?? 0));
  const newFirst = candidates
    .filter((c) => c.isNew)
    .sort((a, b) => a.row.rank - b.row.rank);
  return [...risingFirst, ...newFirst].slice(0, maxItems);
}

/**
 * 急上昇候補の goodsNo（Web getRisingProductsWithProducts と同順）
 */
function risingGoodsNos(
  latest: RankingItemRow[],
  prev: RankingItemRow[],
  maxItems: number
): string[] {
  return pickRisingCandidates(latest, prev, maxItems).map((c) => c.row.goodsNo);
}

export type CollectTopPageGoodsOptions = {
  /** 合計の上限（既定 20） */
  maxTotal?: number;
  /** 急上昇枠（Web と同じ 5） */
  risingMax?: number;
  /** 注目 TOP N（Web と同じ 3） */
  topN?: number;
  /** ランキング本表から追加で連続取得する件数 */
  extraFromRanking?: number;
};

/**
 * TOP で画像カードになり得る goodsNo を一意に並べた配列（先頭ほど TOP 表示に近い）
 */
export async function collectTopPageGoodsNos(
  db: Firestore,
  options: CollectTopPageGoodsOptions = {}
): Promise<{
  goodsNos: string[];
  runDateLatest: string | null;
  runDatesCount: number;
}> {
  const maxTotal = options.maxTotal ?? 20;
  const risingMax = options.risingMax ?? 5;
  const topN = options.topN ?? 3;
  const extraFromRanking = options.extraFromRanking ?? 12;

  const runDates = await getRankingRunDates(db);
  if (runDates.length === 0) {
    return { goodsNos: [], runDateLatest: null, runDatesCount: 0 };
  }

  const latest = runDates[0];
  const latestItems = await getRankingItems(db, latest);
  if (!latestItems) {
    return { goodsNos: [], runDateLatest: latest, runDatesCount: runDates.length };
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (g: string) => {
    const t = (g || "").trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    ordered.push(t);
  };

  if (runDates.length >= 2) {
    const prevItems = await getRankingItems(db, runDates[1]);
    if (prevItems) {
      for (const g of risingGoodsNos(latestItems, prevItems, risingMax)) {
        push(g);
      }
    }
  }

  for (const row of latestItems.slice(0, topN)) {
    push(row.goodsNo);
  }

  for (const row of latestItems.slice(topN, topN + extraFromRanking)) {
    push(row.goodsNo);
  }

  return {
    goodsNos: ordered.slice(0, maxTotal),
    runDateLatest: latest,
    runDatesCount: runDates.length,
  };
}
