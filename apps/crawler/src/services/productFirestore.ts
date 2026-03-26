/**
 * ProductNormalized の Firestore 保存
 * - 初回: createdAt=now, updatedAt=now
 * - 更新時: createdAt は触らず updatedAt=now のみ
 * - ランキング実行時: lastRank / lastRankAt / lastRunId を更新（rank は保存しない）
 */
import { FieldValue, Firestore, Timestamp } from '@google-cloud/firestore';
import type { ProductNormalized, RankingRunItem, RankingRunMeta } from '@kbeauty-ai/core';
import {
  OLIVEYOUNG_PRODUCTS_COLLECTION,
  OLIVEYOUNG_RANKINGS_COLLECTION,
} from '@kbeauty-ai/core';
import { translateProductNameToJa } from '../lib/oliveyoung/fillNameJa';
import {
  composeFallbackNameJaBrandCategory,
  isUnsafeNameJa,
} from '../lib/oliveyoung/nameJaQuality';
import { hasTranslatableSourceForNameJa } from '../lib/oliveyoung/nameJaSourceQuality';
import { Logger } from '../utils/logger';
import {
  isUnsafeIngredientSummaryJa,
  isUnsafeReviewSummaryJa,
  isUnsafeSummaryJa,
  summaryFieldNeedsRegeneration,
} from '../lib/oliveyoung/generatedSummaryQuality';

const logger = new Logger('FIRESTORE');

/** Firestore の docId に使う runDate を必ず "YYYY-MM-DD" 文字列にする（Date を渡さない） */
function toRunDateDocId(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v != null && typeof v === 'string' && v.trim()) return v.trim();
  return String(v != null ? v : '');
}

/** 書き込み payload から undefined を除去（Firestore の undefined 拒否対策） */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

/** public に name/brand を書いてよい値か（空・Unknown は上書きしない） */
function isValidForPublic(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s !== '' && s !== 'Unknown';
}

/**
 * 保存前に nameJa を確定する。
 * existingNameJa が safe ならそのまま、そうでなければ generateJapaneseProductName で生成。
 * 翻訳した場合は [NAME_TRANSLATED] をログ出力。
 */
function strField(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

async function ensureNameJaBeforePublicSave(params: {
  goodsNo: string;
  name: string;
  brand: string;
  existingNameJa?: string;
  brandJa?: string;
  reviewSummaryJa?: string;
  ingredientSummaryJa?: string;
  summaryJa?: string;
}): Promise<string> {
  const { goodsNo, name, brand, existingNameJa = '', brandJa = '' } = params;
  const trimmed = name.trim();
  if (!isValidForPublic(trimmed)) return '';

  const ctx = { brand: brand.trim() || undefined, brandJa: brandJa.trim() || undefined };
  if (existingNameJa && existingNameJa.trim() && !isUnsafeNameJa(existingNameJa, ctx)) {
    return existingNameJa.trim();
  }

  if (process.env.OLIVEYOUNG_DISABLE_AUTO_NAME_JA_TRANSLATE === '1') return '';

  if (
    !hasTranslatableSourceForNameJa({
      name: trimmed,
      brand: brand.trim(),
      brandJa: brandJa.trim() || undefined,
      reviewSummaryJa: params.reviewSummaryJa,
      ingredientSummaryJa: params.ingredientSummaryJa,
      summaryJa: params.summaryJa,
    })
  ) {
    return '';
  }

  try {
    let result = (
      await translateProductNameToJa(trimmed, {
        brand: brand.trim(),
        brandJa: brandJa.trim() || undefined,
        goodsNo,
      })
    ).trim();
    if (!result || isUnsafeNameJa(result, ctx)) {
      result = (
        await translateProductNameToJa(trimmed, {
          brand: brand.trim(),
          brandJa: brandJa.trim() || undefined,
          goodsNo,
        })
      ).trim();
    }
    if (!result || isUnsafeNameJa(result, ctx)) {
      result = composeFallbackNameJaBrandCategory(brand.trim(), brandJa.trim() || undefined, trimmed);
    }
    if (!result || isUnsafeNameJa(result, ctx)) return '';
    const beforeLog = existingNameJa?.trim() || '(empty)';
    console.log('[NAME_TRANSLATED]', `goodsNo=${goodsNo} / before=${beforeLog} / after=${result}`);
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[NAME_JA_TRANSLATE_FAIL]', `goodsNo=${goodsNo} error=${msg}`);
    return '';
  }
}

/** 補完必要フラグを計算（空 or unsafe なら true） */
function computeSummaryNeedsFlags(data: Record<string, unknown>): {
  needsReviewSummaryJa: boolean;
  needsIngredientSummaryJa: boolean;
  needsSummaryJa: boolean;
} {
  const r = data.reviewSummaryJa != null ? String(data.reviewSummaryJa).trim() : '';
  const i = data.ingredientSummaryJa != null ? String(data.ingredientSummaryJa).trim() : '';
  const s = data.summaryJa != null ? String(data.summaryJa).trim() : '';
  return {
    needsReviewSummaryJa: r === '' || isUnsafeReviewSummaryJa(r),
    needsIngredientSummaryJa: i === '' || isUnsafeIngredientSummaryJa(i),
    needsSummaryJa: s === '' || isUnsafeSummaryJa(s),
  };
}

/** public 更新の集計（ログ用・getAndResetPublicUpsertStats で取得） */
let publicUpsertStats = { total: 0, wroteName: 0, wroteBrand: 0, wroteBrandUnknown: 0, skipped: 0 };

export function getAndResetPublicUpsertStats(): {
  total: number;
  wroteName: number;
  wroteBrand: number;
  wroteBrandUnknown: number;
  skipped: number;
} {
  const s = { ...publicUpsertStats };
  publicUpsertStats = { total: 0, wroteName: 0, wroteBrand: 0, wroteBrandUnknown: 0, skipped: 0 };
  return s;
}

const PRODUCTS_COLLECTION =
  process.env.FIRESTORE_PRODUCTS_COLLECTION || OLIVEYOUNG_PRODUCTS_COLLECTION;
const PRODUCTS_PUBLIC_COLLECTION =
  process.env.FIRESTORE_PRODUCTS_PUBLIC_COLLECTION || 'oliveyoung_products_public';
const RANKINGS_COLLECTION =
  process.env.FIRESTORE_RANKINGS_COLLECTION || OLIVEYOUNG_RANKINGS_COLLECTION;

let _db: Firestore | null = null;

function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

export interface ProductNormalizedInput
  extends Omit<ProductNormalized, 'createdAt' | 'updatedAt'> {
  createdAt?: string;
  updatedAt?: string;
}

export interface SaveProductOptions {
  /** 今回取得した順位 → lastRank / lastRankAt / lastRunId を更新 */
  lastRank?: number;
  lastRankAt?: Date | Timestamp;
  lastRunId?: string;
}

/**
 * ProductNormalized を Firestore に保存
 * - doc 未存在 → createdAt=now, updatedAt=now
 * - doc 存在 → createdAt は維持、updatedAt=now
 * - options で lastRank を渡した場合のみ lastRank / lastRankAt / lastRunId を更新
 */
export async function saveProductNormalized(
  product: ProductNormalizedInput,
  options?: SaveProductOptions
): Promise<void> {
  const db = getDb();
  const productsRef = db.collection(PRODUCTS_COLLECTION).doc(product.goodsNo);
  const productsPublicRef = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(product.goodsNo);
  const now = Timestamp.now();

  const doc = await productsRef.get();

  const lastRankFields: Record<string, unknown> = {};
  if (options?.lastRank != null) {
    lastRankFields.lastRank = options.lastRank;
    lastRankFields.lastRankAt = options.lastRankAt instanceof Timestamp ? options.lastRankAt : Timestamp.fromDate(options.lastRankAt != null ? options.lastRankAt : new Date());
    if (options.lastRunId) lastRankFields.lastRunId = options.lastRunId;
  }

  let data: Record<string, unknown>;
  if (!doc.exists) {
    data = {
      ...product,
      createdAt: now,
      updatedAt: now,
      ...lastRankFields,
    };
    logger.info(`[save] create goodsNo=${product.goodsNo} lastRank=${options && options.lastRank != null ? options.lastRank : '-'}`);
  } else {
    const existing = doc.data()!;
    data = {
      ...product,
      createdAt: existing.createdAt,
      updatedAt: now,
      ...lastRankFields,
    };
    const lastRankVal = options && options.lastRank != null ? options.lastRank : existing.lastRank;
    logger.info(`[save] update goodsNo=${product.goodsNo} lastRank=${lastRankVal != null ? lastRankVal : '-'}`);
  }

  delete (data as Record<string, unknown>).rank;
  await productsRef.set(data, { merge: true });

  const publicPayload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (isValidForPublic(product.name)) publicPayload.name = product.name.trim();
  if (isValidForPublic(product.brand)) publicPayload.brand = product.brand.trim();
  if (product.pickedUrl && typeof product.pickedUrl === 'string' && product.pickedUrl.trim() !== '') {
    publicPayload.pickedUrl = product.pickedUrl.trim();
  }
  const publicSnap = await productsPublicRef.get();
  const existing = publicSnap.exists ? publicSnap.data() : undefined;
  if (isValidForPublic(product.name)) {
    const existingNameJa = existing?.nameJa != null ? String(existing.nameJa).trim() : '';
    const existingBrandJa = existing?.brandJa != null ? String(existing.brandJa).trim() : '';
    const nameJa = await ensureNameJaBeforePublicSave({
      goodsNo: product.goodsNo,
      name: product.name!.trim(),
      brand: (product.brand && product.brand.trim()) || '',
      existingNameJa: existingNameJa || undefined,
      brandJa: existingBrandJa || undefined,
      reviewSummaryJa: strField(existing?.reviewSummaryJa),
      ingredientSummaryJa: strField(existing?.ingredientSummaryJa),
      summaryJa: strField(existing?.summaryJa),
    });
    if (nameJa) {
      publicPayload.nameJa = nameJa;
      publicPayload.nameJaUpdatedAt = FieldValue.serverTimestamp();
    }
  }
  const flags = computeSummaryNeedsFlags(existing ?? {});
  if (flags.needsReviewSummaryJa || flags.needsIngredientSummaryJa || flags.needsSummaryJa) {
    publicPayload.needsReviewSummaryJa = flags.needsReviewSummaryJa;
    publicPayload.needsIngredientSummaryJa = flags.needsIngredientSummaryJa;
    publicPayload.needsSummaryJa = flags.needsSummaryJa;
    const fields = [
      flags.needsReviewSummaryJa && 'reviewSummaryJa',
      flags.needsIngredientSummaryJa && 'ingredientSummaryJa',
      flags.needsSummaryJa && 'summaryJa',
    ].filter(Boolean) as string[];
    console.log('[SUMMARY_FLAGGED]', `goodsNo=${product.goodsNo} / fields=${fields.join(',')}`);
  }
  await productsPublicRef.set(stripUndefined(publicPayload), { merge: true });

  // 集計は upsertPublicProduct（ランキング detail の最終 upsert）でだけ行う。ここでは加算しない。
}

/**
 * ランキングDOMから取得した name/brand/pickedUrl を oliveyoung_products_public にだけ反映（空上書き禁止・merge:true）
 * 既存の良い値を潰さない。name/brand が空のときは payload に入れない。
 */
export async function upsertPublicFromRankingItem(item: {
  goodsNo: string;
  name?: string;
  brand?: string;
  pickedUrl?: string;
  lastRank?: number;
}): Promise<void> {
  const db = getDb();
  const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(item.goodsNo);
  const payload: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (item.pickedUrl != null && String(item.pickedUrl).trim() !== '') {
    payload.pickedUrl = String(item.pickedUrl).trim();
  }
  const nameVal = item.name != null ? String(item.name).trim() : '';
  const brandVal = item.brand != null ? String(item.brand).trim() : '';
  if (nameVal !== '') payload.name = nameVal;
  if (brandVal !== '') payload.brand = brandVal;
  if (item.lastRank != null && Number.isFinite(item.lastRank)) {
    payload.lastRank = item.lastRank;
  }
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() : undefined;
  if (isValidForPublic(nameVal)) {
    const existingNameJa = existing?.nameJa != null ? String(existing.nameJa).trim() : '';
    const existingBrandJa = existing?.brandJa != null ? String(existing.brandJa).trim() : '';
    const nameJa = await ensureNameJaBeforePublicSave({
      goodsNo: item.goodsNo,
      name: nameVal,
      brand: brandVal,
      existingNameJa: existingNameJa || undefined,
      brandJa: existingBrandJa || undefined,
      reviewSummaryJa: strField(existing?.reviewSummaryJa),
      ingredientSummaryJa: strField(existing?.ingredientSummaryJa),
      summaryJa: strField(existing?.summaryJa),
    });
    if (nameJa) {
      payload.nameJa = nameJa;
      payload.nameJaUpdatedAt = FieldValue.serverTimestamp();
    }
  }
  const flags = computeSummaryNeedsFlags(existing ?? {});
  if (flags.needsReviewSummaryJa || flags.needsIngredientSummaryJa || flags.needsSummaryJa) {
    payload.needsReviewSummaryJa = flags.needsReviewSummaryJa;
    payload.needsIngredientSummaryJa = flags.needsIngredientSummaryJa;
    payload.needsSummaryJa = flags.needsSummaryJa;
    const fields = [
      flags.needsReviewSummaryJa && 'reviewSummaryJa',
      flags.needsIngredientSummaryJa && 'ingredientSummaryJa',
      flags.needsSummaryJa && 'summaryJa',
    ].filter(Boolean) as string[];
    console.log('[SUMMARY_FLAGGED]', `goodsNo=${item.goodsNo} / fields=${fields.join(',')}`);
  }
  await ref.set(stripUndefined(payload), { merge: true });

  // 集計は upsertPublicProduct（ランキング detail の最終 upsert）でだけ行う。ここでは加算しない。
}

/** oliveyoung_products_public/{goodsNo} の現在値を取得（name/brand 確認用） */
export async function getPublicProduct(goodsNo: string): Promise<{ name?: string; brand?: string } | null> {
  const db = getDb();
  const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(goodsNo);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    name: typeof d.name === 'string' ? d.name : undefined,
    brand: typeof d.brand === 'string' ? d.brand : undefined,
  };
}

export type PublicProductForLocalize = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  summaryJa?: string;
  reviewSummaryJa?: string;
  ingredientSummaryJa?: string;
  brand: string;
  brandJa?: string;
  lastRank: number | null;
  lastSeenRunDate?: string;
};

/**
 * oliveyoung_products_public/{goodsNo} を1件取得（nameJa/summaryJa 補填ジョブ用）
 */
export async function getPublicProductByGoodsNo(
  goodsNo: string
): Promise<PublicProductForLocalize | null> {
  const trimmed = (goodsNo || '').trim();
  if (!trimmed) return null;
  const db = getDb();
  const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(trimmed);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const name = d.name != null ? String(d.name).trim() : '';
  const nameJa = d.nameJa != null ? String(d.nameJa).trim() : undefined;
  const summaryJa = d.summaryJa != null ? String(d.summaryJa).trim() : undefined;
  const reviewSummaryJa =
    d.reviewSummaryJa != null ? String(d.reviewSummaryJa).trim() : undefined;
  const ingredientSummaryJa =
    d.ingredientSummaryJa != null ? String(d.ingredientSummaryJa).trim() : undefined;
  const lastRank =
    d.lastRank != null && Number.isFinite(Number(d.lastRank))
      ? Number(d.lastRank)
      : null;
  const brandJa = d.brandJa != null ? String(d.brandJa).trim() : '';
  return {
    goodsNo: trimmed,
    name,
    nameJa: nameJa || undefined,
    summaryJa: summaryJa || undefined,
    reviewSummaryJa: reviewSummaryJa || undefined,
    ingredientSummaryJa: ingredientSummaryJa || undefined,
    brand: d.brand != null ? String(d.brand).trim() : '',
    brandJa: brandJa || undefined,
    lastRank,
    lastSeenRunDate:
      d.lastSeenRunDate != null ? String(d.lastSeenRunDate).trim() : undefined,
  };
}

/** 画像URLとして有効か（undefined / null / 空文字 / 空白のみ は無効） */
function hasImageUrl(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value !== 'string') return false;
  return value.trim() !== '';
}

export type ProductMissingImagesItem = {
  goodsNo: string;
  imageUrl: string;
  thumbnailUrl: string;
  productUrl?: string;
  lastSeenRunDate?: string;
  updatedAt?: unknown;
};

/**
 * 画像不足の商品を抽出（imageUrl または thumbnailUrl が無い/空）
 * 優先: lastSeenRunDate desc, updatedAt desc。limit で件数制限。
 */
export async function getProductsMissingImages(
  limit: number
): Promise<ProductMissingImagesItem[]> {
  const n = Math.min(Math.max(1, limit), 500);
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);
  const snap = await col.orderBy('updatedAt', 'desc').limit(400).get();

  const missing: ProductMissingImagesItem[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name != null ? String(data.name).trim() : '';
    if (name === '') continue;
    const imageUrl = data.imageUrl != null ? String(data.imageUrl) : '';
    const thumbnailUrl = data.thumbnailUrl != null ? String(data.thumbnailUrl) : '';
    if (hasImageUrl(imageUrl) && hasImageUrl(thumbnailUrl)) continue;
    const lastSeenRunDate = data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined;
    const productUrl = data.productUrl != null ? String(data.productUrl).trim() : undefined;
    missing.push({
      goodsNo: doc.id,
      imageUrl: imageUrl.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      productUrl: productUrl || undefined,
      lastSeenRunDate: lastSeenRunDate || undefined,
      updatedAt: data.updatedAt,
    });
  }

  missing.sort((a, b) => {
    const aDate = a.lastSeenRunDate || '';
    const bDate = b.lastSeenRunDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aUpd = a.updatedAt;
    const bUpd = b.updatedAt;
    if (aUpd == null && bUpd == null) return 0;
    if (aUpd == null) return 1;
    if (bUpd == null) return -1;
    const aMs = typeof (aUpd as { toMillis?: () => number }).toMillis === 'function'
      ? (aUpd as { toMillis: () => number }).toMillis()
      : 0;
    const bMs = typeof (bUpd as { toMillis?: () => number }).toMillis === 'function'
      ? (bUpd as { toMillis: () => number }).toMillis()
      : 0;
    return bMs - aMs;
  });

  return missing.slice(0, n);
}

/**
 * oliveyoung_products_public/{goodsNo} に imageUrl, thumbnailUrl, imageUpdatedAt を保存（画像補完ジョブ用）
 */
export async function updateProductImageFields(
  goodsNo: string,
  imageUrl: string,
  thumbnailUrl: string
): Promise<void> {
  const db = getDb();
  const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(goodsNo);
  await ref.set(
    {
      imageUrl: imageUrl.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      imageUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export type ProductMissingNameJaItem = {
  goodsNo: string;
  name: string;
  brand: string;
  lastSeenRunDate?: string;
  updatedAt?: unknown;
};

export type GetProductsMissingNameJaScanStats = {
  items: ProductMissingNameJaItem[];
  scannedDocs: number;
  /** name 有効・nameJa 空の候補（ソート前・スライス前の件数） */
  docsMissingNameJa: number;
  docsSkippedAlreadyHasNameJa: number;
  docsSkippedInvalidName: number;
};

async function queryProductsMissingNameJa(
  limit: number,
  scanLimit: number
): Promise<GetProductsMissingNameJaScanStats> {
  const n = Math.min(Math.max(1, limit), 500);
  const scan = Math.min(Math.max(100, scanLimit), 5000);
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);
  const snap = await col.orderBy('updatedAt', 'desc').limit(scan).get();

  const missing: ProductMissingNameJaItem[] = [];
  let docsSkippedAlreadyHasNameJa = 0;
  let docsSkippedInvalidName = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name != null ? String(data.name).trim() : '';
    const nameJa = data.nameJa != null ? String(data.nameJa).trim() : '';
    if (!isValidForPublic(name)) {
      docsSkippedInvalidName += 1;
      continue;
    }
    if (nameJa !== '') {
      docsSkippedAlreadyHasNameJa += 1;
      continue;
    }
    missing.push({
      goodsNo: doc.id,
      name,
      brand: data.brand != null ? String(data.brand).trim() : '',
      lastSeenRunDate: data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined,
      updatedAt: data.updatedAt,
    });
  }

  const docsMissingNameJa = missing.length;

  missing.sort((a, b) => {
    const aDate = a.lastSeenRunDate || '';
    const bDate = b.lastSeenRunDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aUpd = a.updatedAt;
    const bUpd = b.updatedAt;
    if (aUpd == null && bUpd == null) return 0;
    if (aUpd == null) return 1;
    if (bUpd == null) return -1;
    const aMs = typeof (aUpd as { toMillis?: () => number }).toMillis === 'function'
      ? (aUpd as { toMillis: () => number }).toMillis()
      : 0;
    const bMs = typeof (bUpd as { toMillis?: () => number }).toMillis === 'function'
      ? (bUpd as { toMillis: () => number }).toMillis()
      : 0;
    return bMs - aMs;
  });

  const items = missing.slice(0, n);

  return {
    items,
    scannedDocs: snap.docs.length,
    docsMissingNameJa,
    docsSkippedAlreadyHasNameJa,
    docsSkippedInvalidName,
  };
}

/**
 * nameJa が未設定の商品を取得（name 有効・nameJa なし or 空）
 * 優先: lastSeenRunDate desc, updatedAt desc。limit で件数制限。
 * @param scanLimit updatedAt desc で読む最大ドキュメント数（既定 400）
 */
export async function getProductsMissingNameJa(
  limit: number,
  scanLimit: number = 400
): Promise<ProductMissingNameJaItem[]> {
  return (await queryProductsMissingNameJa(limit, scanLimit)).items;
}

/**
 * getProductsMissingNameJa と同条件に加え、スキャン統計を返す（補完 Job のログ用）
 */
export async function getProductsMissingNameJaWithStats(
  limit: number,
  scanLimit: number
): Promise<GetProductsMissingNameJaScanStats> {
  return queryProductsMissingNameJa(limit, scanLimit);
}

export type ProductNeedingNameJaTranslationItem = {
  goodsNo: string;
  name: string;
  brand: string;
  /** 翻訳前の nameJa（空の場合は未設定） */
  nameJaBefore?: string;
  brandJa?: string;
  lastSeenRunDate?: string;
  updatedAt?: unknown;
};

export type GetProductsNeedingNameJaTranslationStats = {
  items: ProductNeedingNameJaTranslationItem[];
  scannedDocs: number;
  docsNeedingTranslation: number;
  docsSkippedOkNameJa: number;
  docsSkippedInvalidName: number;
};

function nameJaNeedsRetranslation(
  nameJa: string,
  brand: string,
  brandJa: string
): boolean {
  const ja = nameJa.trim();
  if (ja === '') return true;
  return isUnsafeNameJa(ja, { brand, brandJa: brandJa || undefined });
}

async function queryProductsNeedingNameJaTranslation(
  limit: number,
  scanLimit: number,
  goodsNoFilter?: string
): Promise<GetProductsNeedingNameJaTranslationStats> {
  const n = Math.min(Math.max(1, limit), 500);
  const scan = Math.min(Math.max(100, scanLimit), 5000);
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);

  if (goodsNoFilter && goodsNoFilter.trim() !== '') {
    const doc = await col.doc(goodsNoFilter.trim()).get();
    if (!doc.exists) {
      return {
        items: [],
        scannedDocs: 1,
        docsNeedingTranslation: 0,
        docsSkippedOkNameJa: 0,
        docsSkippedInvalidName: 1,
      };
    }
    const data = doc.data()!;
    const name = data.name != null ? String(data.name).trim() : '';
    const nameJa = data.nameJa != null ? String(data.nameJa).trim() : '';
    const brand = data.brand != null ? String(data.brand).trim() : '';
    const brandJa = data.brandJa != null ? String(data.brandJa).trim() : '';
    if (!isValidForPublic(name)) {
      return {
        items: [],
        scannedDocs: 1,
        docsNeedingTranslation: 0,
        docsSkippedOkNameJa: 0,
        docsSkippedInvalidName: 1,
      };
    }
    if (!nameJaNeedsRetranslation(nameJa, brand, brandJa)) {
      return {
        items: [],
        scannedDocs: 1,
        docsNeedingTranslation: 0,
        docsSkippedOkNameJa: 1,
        docsSkippedInvalidName: 0,
      };
    }
    return {
      items: [
        {
          goodsNo: doc.id,
          name,
          brand,
          nameJaBefore: nameJa || undefined,
          brandJa: brandJa || undefined,
          lastSeenRunDate:
            data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined,
          updatedAt: data.updatedAt,
        },
      ],
      scannedDocs: 1,
      docsNeedingTranslation: 1,
      docsSkippedOkNameJa: 0,
      docsSkippedInvalidName: 0,
    };
  }

  const snap = await col.orderBy('updatedAt', 'desc').limit(scan).get();
  const candidates: ProductNeedingNameJaTranslationItem[] = [];
  let docsSkippedOkNameJa = 0;
  let docsSkippedInvalidName = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name != null ? String(data.name).trim() : '';
    const nameJa = data.nameJa != null ? String(data.nameJa).trim() : '';
    const brand = data.brand != null ? String(data.brand).trim() : '';
    const brandJa = data.brandJa != null ? String(data.brandJa).trim() : '';
    if (!isValidForPublic(name)) {
      docsSkippedInvalidName += 1;
      continue;
    }
    if (!nameJaNeedsRetranslation(nameJa, brand, brandJa)) {
      docsSkippedOkNameJa += 1;
      continue;
    }
    candidates.push({
      goodsNo: doc.id,
      name,
      brand,
      nameJaBefore: nameJa || undefined,
      brandJa: brandJa || undefined,
      lastSeenRunDate:
        data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined,
      updatedAt: data.updatedAt,
    });
  }

  const docsNeedingTranslation = candidates.length;
  candidates.sort((a, b) => {
    const aDate = a.lastSeenRunDate || '';
    const bDate = b.lastSeenRunDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aUpd = a.updatedAt;
    const bUpd = b.updatedAt;
    if (aUpd == null && bUpd == null) return 0;
    if (aUpd == null) return 1;
    if (bUpd == null) return -1;
    const aMs =
      typeof (aUpd as { toMillis?: () => number }).toMillis === 'function'
        ? (aUpd as { toMillis: () => number }).toMillis()
        : 0;
    const bMs =
      typeof (bUpd as { toMillis?: () => number }).toMillis === 'function'
        ? (bUpd as { toMillis: () => number }).toMillis()
        : 0;
    return bMs - aMs;
  });

  return {
    items: candidates.slice(0, n),
    scannedDocs: snap.docs.length,
    docsNeedingTranslation,
    docsSkippedOkNameJa,
    docsSkippedInvalidName,
  };
}

/**
 * nameJa が空、または isUnsafeNameJa に該当する商品を取得（再翻訳ジョブ用）
 */
export async function getProductsNeedingNameJaTranslation(
  limit: number,
  scanLimit: number = 2500,
  goodsNoFilter?: string
): Promise<ProductNeedingNameJaTranslationItem[]> {
  return (await queryProductsNeedingNameJaTranslation(limit, scanLimit, goodsNoFilter)).items;
}

export async function getProductsNeedingNameJaTranslationWithStats(
  limit: number,
  scanLimit: number,
  goodsNoFilter?: string
): Promise<GetProductsNeedingNameJaTranslationStats> {
  return queryProductsNeedingNameJaTranslation(limit, scanLimit, goodsNoFilter);
}

/**
 * oliveyoung_products_public/{goodsNo} に nameJa と nameJaUpdatedAt を保存
 */
export async function updateProductNameJa(
  goodsNo: string,
  nameJa: string
): Promise<void> {
  const db = getDb();
  const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(goodsNo);
  await ref.set(
    {
      nameJa: nameJa.trim(),
      nameJaUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export type ProductMissingSummaryJaItem = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  summaryJa?: string;
  brand: string;
  brandJa?: string;
  lastRank?: number | null;
  lastSeenRunDate?: string;
  updatedAt?: unknown;
};

/**
 * summaryJa が未設定、または unsafe（goodsNo 混入等）の商品を取得
 * 優先: lastSeenRunDate desc, updatedAt desc。limit で件数制限。
 */
export async function getProductsMissingSummaryJa(
  limit: number
): Promise<ProductMissingSummaryJaItem[]> {
  const n = Math.min(Math.max(1, limit), 500);
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);
  const snap = await col.orderBy('updatedAt', 'desc').limit(400).get();

  const missing: ProductMissingSummaryJaItem[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name != null ? String(data.name).trim() : '';
    const summaryJa = data.summaryJa != null ? String(data.summaryJa).trim() : '';
    const needsFlag = data.needsSummaryJa === true;
    const contentNeedsWork = summaryJa === '' || summaryFieldNeedsRegeneration(summaryJa);
    const isTarget = needsFlag || contentNeedsWork;
    if (name === '' || !isTarget) continue;
    const lastRank = data.lastRank != null && Number.isFinite(Number(data.lastRank))
      ? Number(data.lastRank)
      : undefined;
    const brandJa = data.brandJa != null ? String(data.brandJa).trim() : '';
    missing.push({
      goodsNo: doc.id,
      name,
      nameJa: data.nameJa != null ? String(data.nameJa).trim() : undefined,
      summaryJa: summaryJa || undefined,
      brand: data.brand != null ? String(data.brand).trim() : '',
      brandJa: brandJa || undefined,
      lastRank: lastRank ?? null,
      lastSeenRunDate: data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined,
      updatedAt: data.updatedAt,
    });
  }

  missing.sort((a, b) => {
    const aDate = a.lastSeenRunDate || '';
    const bDate = b.lastSeenRunDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aUpd = a.updatedAt;
    const bUpd = b.updatedAt;
    if (aUpd == null && bUpd == null) return 0;
    if (aUpd == null) return 1;
    if (bUpd == null) return -1;
    const aMs = typeof (aUpd as { toMillis?: () => number }).toMillis === 'function'
      ? (aUpd as { toMillis: () => number }).toMillis()
      : 0;
    const bMs = typeof (bUpd as { toMillis?: () => number }).toMillis === 'function'
      ? (bUpd as { toMillis: () => number }).toMillis()
      : 0;
    return bMs - aMs;
  });

  return missing.slice(0, n);
}

export type ProductSummaryRegenCandidate = {
  goodsNo: string;
  name: string;
  nameJa?: string;
  brand: string;
  brandJa?: string;
  summaryJa?: string;
  ingredientSummaryJa?: string;
  reviewSummaryJa?: string;
  lastRank: number | null;
  lastSeenRunDate?: string;
  updatedAt?: unknown;
  /** 再生成が必要なフィールド */
  fields: Array<'summaryJa' | 'ingredientSummaryJa' | 'reviewSummaryJa'>;
};

function collectSummaryRegenFields(data: {
  summaryJa?: string;
  ingredientSummaryJa?: string;
  reviewSummaryJa?: string;
  needsSummaryJa?: unknown;
  needsIngredientSummaryJa?: unknown;
  needsReviewSummaryJa?: unknown;
}): Array<'summaryJa' | 'ingredientSummaryJa' | 'reviewSummaryJa'> {
  const fields: Array<'summaryJa' | 'ingredientSummaryJa' | 'reviewSummaryJa'> = [];
  const s = data.summaryJa != null ? String(data.summaryJa).trim() : '';
  const i = data.ingredientSummaryJa != null ? String(data.ingredientSummaryJa).trim() : '';
  const r = data.reviewSummaryJa != null ? String(data.reviewSummaryJa).trim() : '';
  const needsS = data.needsSummaryJa === true;
  const needsI = data.needsIngredientSummaryJa === true;
  const needsR = data.needsReviewSummaryJa === true;
  if (needsS || summaryFieldNeedsRegeneration(s)) fields.push('summaryJa');
  if (needsI || summaryFieldNeedsRegeneration(i)) fields.push('ingredientSummaryJa');
  if (needsR || summaryFieldNeedsRegeneration(r)) fields.push('reviewSummaryJa');
  return fields;
}

/**
 * summary / ingredient / review のいずれかが空または unsafe な商品を返す（一括再生成ジョブ用）
 */
export async function getProductsNeedingSummaryRegeneration(
  limit: number,
  scanLimit: number = 2500,
  goodsNoFilter?: string
): Promise<ProductSummaryRegenCandidate[]> {
  const n = Math.min(Math.max(1, limit), 500);
  const scan = Math.min(Math.max(100, scanLimit), 5000);
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);

  const toCandidate = (
    id: string,
    data: Record<string, unknown>
  ): ProductSummaryRegenCandidate | null => {
    const name = data.name != null ? String(data.name).trim() : '';
    if (!isValidForPublic(name)) return null;
    const summaryJa = data.summaryJa != null ? String(data.summaryJa).trim() : '';
    const ingredientSummaryJa =
      data.ingredientSummaryJa != null ? String(data.ingredientSummaryJa).trim() : '';
    const reviewSummaryJa =
      data.reviewSummaryJa != null ? String(data.reviewSummaryJa).trim() : '';
    const fields = collectSummaryRegenFields({
      summaryJa,
      ingredientSummaryJa,
      reviewSummaryJa,
      needsSummaryJa: data.needsSummaryJa,
      needsIngredientSummaryJa: data.needsIngredientSummaryJa,
      needsReviewSummaryJa: data.needsReviewSummaryJa,
    });
    if (fields.length === 0) return null;
    const lastRank =
      data.lastRank != null && Number.isFinite(Number(data.lastRank))
        ? Number(data.lastRank)
        : null;
    const brandJa = data.brandJa != null ? String(data.brandJa).trim() : '';
    return {
      goodsNo: id,
      name,
      nameJa: data.nameJa != null ? String(data.nameJa).trim() : undefined,
      brand: data.brand != null ? String(data.brand).trim() : '',
      brandJa: brandJa || undefined,
      summaryJa: summaryJa || undefined,
      ingredientSummaryJa: ingredientSummaryJa || undefined,
      reviewSummaryJa: reviewSummaryJa || undefined,
      lastRank,
      lastSeenRunDate:
        data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined,
      updatedAt: data.updatedAt,
      fields,
    };
  };

  if (goodsNoFilter && goodsNoFilter.trim() !== '') {
    const doc = await col.doc(goodsNoFilter.trim()).get();
    if (!doc.exists) return [];
    const c = toCandidate(doc.id, doc.data()!);
    return c ? [c] : [];
  }

  const snap = await col.orderBy('updatedAt', 'desc').limit(scan).get();
  const out: ProductSummaryRegenCandidate[] = [];
  for (const doc of snap.docs) {
    const c = toCandidate(doc.id, doc.data());
    if (c) out.push(c);
  }

  out.sort((a, b) => {
    const aDate = a.lastSeenRunDate || '';
    const bDate = b.lastSeenRunDate || '';
    if (aDate !== bDate) return bDate.localeCompare(aDate);
    const aUpd = a.updatedAt;
    const bUpd = b.updatedAt;
    if (aUpd == null && bUpd == null) return 0;
    if (aUpd == null) return 1;
    if (bUpd == null) return -1;
    const aMs =
      typeof (aUpd as { toMillis?: () => number }).toMillis === 'function'
        ? (aUpd as { toMillis: () => number }).toMillis()
        : 0;
    const bMs =
      typeof (bUpd as { toMillis?: () => number }).toMillis === 'function'
        ? (bUpd as { toMillis: () => number }).toMillis()
        : 0;
    return bMs - aMs;
  });

  return out.slice(0, n);
}

/**
 * oliveyoung_products_public/{goodsNo} に summaryJa と summaryJaUpdatedAt を保存
 */
export async function updateProductSummaryJa(
  goodsNo: string,
  summaryJa: string
): Promise<void> {
  const db = getDb();
  const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(goodsNo);
  await ref.set(
    {
      summaryJa: summaryJa.trim(),
      summaryJaUpdatedAt: FieldValue.serverTimestamp(),
      needsSummaryJa: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export type FlagUnsafeSummariesResult = {
  scanned: number;
  flagged: number;
  fieldsFlagged: { review: number; ingredient: number; summary: number };
};

/**
 * 既存の public 商品をスキャンし、unsafe な summary 系フィールドを持つ商品に needs* フラグを立てる
 */
export async function flagProductsWithUnsafeSummaries(
  scanLimit: number = 2000
): Promise<FlagUnsafeSummariesResult> {
  const scan = Math.min(Math.max(100, scanLimit), 5000);
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);
  const snap = await col.orderBy('updatedAt', 'desc').limit(scan).get();

  let flagged = 0;
  const fieldsFlagged = { review: 0, ingredient: 0, summary: 0 };

  for (const doc of snap.docs) {
    const data = doc.data();
    const flags = computeSummaryNeedsFlags(data);
    if (!flags.needsReviewSummaryJa && !flags.needsIngredientSummaryJa && !flags.needsSummaryJa) {
      continue;
    }

    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (flags.needsReviewSummaryJa) {
      update.needsReviewSummaryJa = true;
      fieldsFlagged.review += 1;
    }
    if (flags.needsIngredientSummaryJa) {
      update.needsIngredientSummaryJa = true;
      fieldsFlagged.ingredient += 1;
    }
    if (flags.needsSummaryJa) {
      update.needsSummaryJa = true;
      fieldsFlagged.summary += 1;
    }

    await doc.ref.set(update, { merge: true });
    flagged += 1;
    const fields = [
      flags.needsReviewSummaryJa && 'reviewSummaryJa',
      flags.needsIngredientSummaryJa && 'ingredientSummaryJa',
      flags.needsSummaryJa && 'summaryJa',
    ].filter(Boolean) as string[];
    console.log('[SUMMARY_FLAGGED]', `goodsNo=${doc.id} / fields=${fields.join(',')}`);
  }

  return {
    scanned: snap.docs.length,
    flagged,
    fieldsFlagged,
  };
}

/** brand ごとに brandJa 未設定の商品 docId をまとめたもの（商品用 brandJa 補完ジョブ） */
export type ProductBrandJaGroup = {
  brand: string;
  goodsNos: string[];
};

export type GetProductGroupsMissingBrandJaStats = {
  groups: ProductBrandJaGroup[];
  scannedDocs: number;
  /** brand あり・brandJa 空のドキュメント数（スキャン内） */
  docsMissingBrandJa: number;
  /** スキャン内で見つかったユニーク brand 数（スライス前） */
  uniqueBrandsBeforeSlice: number;
  /** スキャン内で brandJa 既にあり（対象外） */
  docsSkippedAlreadyHasBrandJa: number;
  /** スキャン内で brand 空または Unknown（対象外） */
  docsSkippedInvalidBrand: number;
};

/**
 * oliveyoung_products_public を updatedAt desc でスキャンし、
 * brand が有効・brandJa が空の商品を brand 文字列でグループ化する。
 * 先頭から最大 maxBrands 個のユニーク brand だけ返す（同一 brand は LLM 1 回でまとめて更新するため）。
 * brand が空または Unknown の行は対象外（既存の public ルールに合わせる）。
 */
export async function getProductGroupsMissingBrandJa(
  maxBrands: number,
  scanLimit: number
): Promise<GetProductGroupsMissingBrandJaStats> {
  const maxB = Math.min(Math.max(1, maxBrands), 500);
  const scan = Math.min(Math.max(100, scanLimit), 5000);
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);
  const snap = await col.orderBy('updatedAt', 'desc').limit(scan).get();

  const order: string[] = [];
  const brandToGoods = new Map<string, string[]>();
  let docsSkippedAlreadyHasBrandJa = 0;
  let docsSkippedInvalidBrand = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const brand = data.brand != null ? String(data.brand).trim() : '';
    const brandJa = data.brandJa != null ? String(data.brandJa).trim() : '';
    if (!isValidForPublic(brand)) {
      docsSkippedInvalidBrand += 1;
      continue;
    }
    if (brandJa !== '') {
      docsSkippedAlreadyHasBrandJa += 1;
      continue;
    }

    const goodsNo = doc.id;
    if (!goodsNo) continue;

    if (!brandToGoods.has(brand)) {
      brandToGoods.set(brand, []);
      order.push(brand);
    }
    brandToGoods.get(brand)!.push(goodsNo);
  }

  const docsMissingBrandJa = [...brandToGoods.values()].reduce((a, ids) => a + ids.length, 0);
  const uniqueBrandsBeforeSlice = order.length;

  const groups: ProductBrandJaGroup[] = [];
  for (const brand of order) {
    if (groups.length >= maxB) break;
    const goodsNos = brandToGoods.get(brand);
    if (goodsNos && goodsNos.length > 0) {
      groups.push({ brand, goodsNos: [...goodsNos] });
    }
  }

  return {
    groups,
    scannedDocs: snap.docs.length,
    docsMissingBrandJa,
    uniqueBrandsBeforeSlice,
    docsSkippedAlreadyHasBrandJa,
    docsSkippedInvalidBrand,
  };
}

const BATCH_SIZE = 400;

/**
 * 複数 goodsNo に同じ brandJa を merge 保存（1 brand あたり1回の LLM 結果を流し込む）
 * @returns 更新したドキュメント数
 */
export async function updateManyProductsBrandJa(
  goodsNos: string[],
  brandJa: string
): Promise<number> {
  const text = (brandJa || '').trim();
  if (!text || goodsNos.length === 0) return 0;
  const db = getDb();
  const ids = [...new Set(goodsNos.map((g) => String(g).trim()).filter(Boolean))];
  let written = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const goodsNo of chunk) {
      const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(goodsNo);
      batch.set(
        ref,
        {
          brandJa: text,
          brandJaUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
    written += chunk.length;
  }

  return written;
}

/**
 * oliveyoung_products_public に存在する goodsNo の集合を返す（商品詳細取得対象の選定用）
 */
export async function getExistingProductIds(goodsNos: string[]): Promise<Set<string>> {
  if (!Array.isArray(goodsNos) || goodsNos.length === 0) return new Set();
  const db = getDb();
  const col = db.collection(PRODUCTS_PUBLIC_COLLECTION);
  const refs = goodsNos.map((g) => col.doc(String(g).trim())).filter((r) => r.id !== '');
  if (refs.length === 0) return new Set();
  const snaps = await db.getAll(...refs);
  const existing = new Set<string>();
  for (const snap of snaps) {
    if (snap.exists && snap.id) existing.add(snap.id);
  }
  return existing;
}

const PRODUCT_DETAIL_BASE_URL = 'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do';

/**
 * ランキング detail 取得結果を oliveyoung_products_public に upsert。
 * 保存項目: goodsNo, name, brand, productUrl, imageUrl, thumbnailUrl, lastSeenRank, lastSeenRunDate, source, updatedAt
 * brand: 空または Unknown のときは更新しない。ブランドが取れたときだけ更新し、既存が '' または Unknown のときのみ書き込む（wroteBrand=true）。
 */
export async function upsertPublicProduct(params: {
  goodsNo: string;
  name?: string;
  brand?: string;
  lastSeenRank: number;
  runDate: string;
  imageUrl?: string;
  thumbnailUrl?: string;
}): Promise<{ wroteName: boolean; wroteBrand: boolean; wroteBrandUnknown: boolean }> {
  const db = getDb();
  const ref = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(params.goodsNo);
  const existingSnap = await ref.get();
  const existing = existingSnap.exists
    ? (existingSnap.data() as {
        brand?: string;
        name?: string;
        nameJa?: string;
        brandJa?: string;
        reviewSummaryJa?: unknown;
        ingredientSummaryJa?: unknown;
        summaryJa?: unknown;
      } | undefined)
    : undefined;
  const existingBrandRaw = existing?.brand != null ? String(existing.brand).trim() : '';
  const existingIsEmptyOrUnknown = existingBrandRaw === '' || existingBrandRaw === 'Unknown';

  const productUrl = `${PRODUCT_DETAIL_BASE_URL}?goodsNo=${encodeURIComponent(params.goodsNo)}`;

  const nameVal = params.name != null ? String(params.name).trim() : '';
  const brandVal = params.brand != null ? String(params.brand).trim() : '';

  const payload: Record<string, unknown> = {
    goodsNo: params.goodsNo,
    productUrl,
    imageUrl: params.imageUrl != null && String(params.imageUrl).trim() !== '' ? String(params.imageUrl).trim() : undefined,
    thumbnailUrl: params.thumbnailUrl != null && String(params.thumbnailUrl).trim() !== '' ? String(params.thumbnailUrl).trim() : undefined,
    lastSeenRank: params.lastSeenRank,
    lastSeenRunDate: toRunDateDocId(params.runDate),
    updatedAt: FieldValue.serverTimestamp(),
    source: 'ranking_detail',
  };
  if (nameVal !== '') payload.name = nameVal;

  // brand: 空または Unknown のときは更新しない。取れたときだけ、かつ既存が '' または Unknown のときのみ更新
  if (brandVal !== '' && brandVal !== 'Unknown' && existingIsEmptyOrUnknown) {
    payload.brand = brandVal;
  }

  const mergedName =
    nameVal !== ''
      ? nameVal
      : existing?.name != null
        ? String(existing.name).trim()
        : '';
  const existingNameJa = existing?.nameJa != null ? String(existing.nameJa).trim() : '';
  const existingBrandJa = existing?.brandJa != null ? String(existing.brandJa).trim() : '';
  const effectiveBrand =
    brandVal !== '' && brandVal !== 'Unknown' ? brandVal : existingBrandRaw;
  if (isValidForPublic(mergedName)) {
    const nameJa = await ensureNameJaBeforePublicSave({
      goodsNo: params.goodsNo,
      name: mergedName,
      brand: effectiveBrand,
      existingNameJa: existingNameJa || undefined,
      brandJa: existingBrandJa || undefined,
      reviewSummaryJa: strField(existing?.reviewSummaryJa),
      ingredientSummaryJa: strField(existing?.ingredientSummaryJa),
      summaryJa: strField(existing?.summaryJa),
    });
    if (nameJa) {
      payload.nameJa = nameJa;
      payload.nameJaUpdatedAt = FieldValue.serverTimestamp();
    }
  }
  const flags = computeSummaryNeedsFlags(existing ?? {});
  if (flags.needsReviewSummaryJa || flags.needsIngredientSummaryJa || flags.needsSummaryJa) {
    payload.needsReviewSummaryJa = flags.needsReviewSummaryJa;
    payload.needsIngredientSummaryJa = flags.needsIngredientSummaryJa;
    payload.needsSummaryJa = flags.needsSummaryJa;
    const fields = [
      flags.needsReviewSummaryJa && 'reviewSummaryJa',
      flags.needsIngredientSummaryJa && 'ingredientSummaryJa',
      flags.needsSummaryJa && 'summaryJa',
    ].filter(Boolean) as string[];
    console.log('[SUMMARY_FLAGGED]', `goodsNo=${params.goodsNo} / fields=${fields.join(',')}`);
  }

  await ref.set(stripUndefined(payload), { merge: true });

  console.log(
    '[PRODUCT_PUBLIC_UPSERT]',
    JSON.stringify({
      goodsNo: params.goodsNo,
      name: payload.name ?? '',
      brand: payload.brand ?? '',
      productUrl,
      imageUrl: payload.imageUrl ?? '',
      thumbnailUrl: payload.thumbnailUrl ?? '',
      lastSeenRank: params.lastSeenRank,
      lastSeenRunDate: payload.lastSeenRunDate,
    })
  );

  const wroteName = payload.name != null;
  const hasFinalBrand = !!(params.brand != null && String(params.brand).trim());
  publicUpsertStats.total += 1;
  if (wroteName) publicUpsertStats.wroteName += 1;
  if (hasFinalBrand) publicUpsertStats.wroteBrand += 1;
  else publicUpsertStats.wroteBrandUnknown += 1;
  if (!wroteName && !hasFinalBrand) publicUpsertStats.skipped += 1;

  const wroteBrand = payload.brand != null && payload.brand !== 'Unknown';
  const wroteBrandUnknown = !hasFinalBrand;

  return { wroteName, wroteBrand, wroteBrandUnknown };
}

/**
 * ランキング実行メタを oliveyoung_rankings/{runDate} に保存（docId = runDate 文字列のみ）
 * createdAt は初回のみ serverTimestamp、updatedAt は常に serverTimestamp。undefined は strip する。
 */
export async function saveRankingRun(meta: RankingRunMeta): Promise<void> {
  const runDateRaw = meta.runDate;
  if (runDateRaw == null || (typeof runDateRaw === 'string' && !runDateRaw.trim())) {
    logger.warn('[saveRankingRun] runDate is empty, skip');
    return;
  }
  const docId = toRunDateDocId(runDateRaw);
  logger.info(`[saveRankingRun] runDate=${docId} typeof runDateRaw=${typeof runDateRaw} docPath=oliveyoung_rankings/${docId}`);
  const db = getDb();
  const ref = db.collection(RANKINGS_COLLECTION).doc(docId);
  const doc = await ref.get();

  const startedAtStr =
    meta.startedAt != null
      ? typeof meta.startedAt === 'string'
        ? meta.startedAt
        : (meta.startedAt as Date).toISOString()
      : undefined;
  const finishedAtStr =
    meta.finishedAt != null
      ? typeof meta.finishedAt === 'string'
        ? meta.finishedAt
        : (meta.finishedAt as Date).toISOString()
      : undefined;
  const createdAtValue = doc.exists
    ? undefined
    : meta.createdAt != null
      ? typeof meta.createdAt === 'string'
        ? meta.createdAt
        : (meta.createdAt as Date).toISOString()
      : FieldValue.serverTimestamp();

  const data = stripUndefined({
    ...meta,
    runDate: docId,
    startedAt: startedAtStr,
    finishedAt: finishedAtStr,
    updatedAt: FieldValue.serverTimestamp(),
    ...(createdAtValue !== undefined ? { createdAt: createdAtValue } : {}),
  });
  await ref.set(data, { merge: true });
  logger.info(`[saveRankingRun] runDate=${docId} collected=${meta.collected} ok=${meta.ok} ng=${meta.ng}`);
}

/**
 * ランキング1件を oliveyoung_rankings/{runDate}/items/{rank} に保存（docId = rank）
 * runDate は必ず string。undefined は strip し、capturedAt が無い場合は補う。
 */
export async function saveRankingItem(
  runDate: string,
  item: RankingRunItem
): Promise<void> {
  const docId = toRunDateDocId(runDate);
  const db = getDb();
  const ref = db
    .collection(RANKINGS_COLLECTION)
    .doc(docId)
    .collection('items')
    .doc(String(item.rank));
  const capturedAtVal =
    item.capturedAt != null
      ? typeof item.capturedAt === 'string'
        ? item.capturedAt
        : (item.capturedAt as Date).toISOString()
      : new Date().toISOString();
  const data = stripUndefined({
    ...item,
    capturedAt: capturedAtVal,
  });
  await ref.set(data, { merge: true });
}

/**
 * ランキング履歴: oliveyoung_rankings/{runDate} の updatedAt を更新し、
 * items/{rank} に rank, goodsNo, name, brand, updatedAt を保存（商品ループ内で呼ぶ）
 * runDate は必ず string（docId に Date を渡さない）
 */
export async function saveRankingHistoryItem(
  runDate: string,
  item: { rank: number; goodsNo: string; name: string; brand: string }
): Promise<void> {
  const docId = toRunDateDocId(runDate);
  const db = getDb();
  const rankingDocRef = db.collection(RANKINGS_COLLECTION).doc(docId);
  await rankingDocRef.set(
    { updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  const itemRef = rankingDocRef.collection('items').doc(String(item.rank));
  const itemData = stripUndefined({
    rank: item.rank,
    goodsNo: item.goodsNo,
    name: item.name,
    brand: item.brand,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await itemRef.set(itemData, { merge: true });
}
