/**
 * nameJa 翻訳バッチ（high / medium 優先）。
 *
 * TODO: Source enrichment job（未実装）
 * `needsSourceEnrichment === true` かつ `translationPriority === low` 等のドキュメント向けに、
 * 別ジョブで brand / name / detail summary の再取得・再補完を行う想定。
 * 実装時は crawler に `runNameJaSourceEnrichmentJob` 等を追加し、本ジョブは翻訳のみに専念する。
 *
 * @see apps/web/docs/NAME_JA_TRANSLATION_OPS.md
 */
import dotenv from 'dotenv';
import { resolve } from 'path';
import { FieldValue, Firestore } from '@google-cloud/firestore';
import { translateProductNameToJa } from '../lib/oliveyoung/fillNameJa';
import {
  composeFallbackNameJaBrandCategory,
  explainUnsafeNameJa,
  isUnsafeNameJa,
} from '../lib/oliveyoung/nameJaQuality';
import { evaluateNameJaSourceQuality, hasTranslatableSourceForNameJa } from '../lib/oliveyoung/nameJaSourceQuality';

dotenv.config({ path: resolve(process.cwd(), '.env') });

type TranslationPriority = 'high' | 'medium' | 'low';
/** default = high+medium のみ（low は --priority=all または --priority=low 等の明示時のみ） */
export type NameJaTranslatePriorityFilter = TranslationPriority | 'all' | 'default';
type PriorityFilter = NameJaTranslatePriorityFilter;

type TargetItem = {
  goodsNo: string;
  name: string;
  brand: string;
  brandJa?: string;
  nameJa?: string;
  reviewSummaryJa?: string;
  ingredientSummaryJa?: string;
  summaryJa?: string;
  translationPriority: TranslationPriority;
  lastRank: number | null;
  lastSeenRunDate?: string;
  updatedAt?: unknown;
};

type RunOptions = {
  dryRun: boolean;
  limit: number;
  priority: PriorityFilter;
};

const PRODUCTS_PUBLIC_COLLECTION =
  process.env.FIRESTORE_PRODUCTS_PUBLIC_COLLECTION || 'oliveyoung_products_public';

let _db: Firestore | null = null;
function getDb(): Firestore {
  if (!_db) {
    _db = new Firestore();
    _db.settings({ ignoreUndefinedProperties: true });
  }
  return _db;
}

function strField(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

function parseArgs(): RunOptions {
  const argv = process.argv.slice(2);
  let dryRun = false;
  let limit = 50;
  let priority: PriorityFilter = 'default';

  for (const a of argv) {
    if (a === '--dry-run' || a === '--dryRun') dryRun = true;
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n >= 1) limit = Math.min(n, 500);
    }
    if (a.startsWith('--priority=')) {
      const p = a.slice('--priority='.length).trim() as PriorityFilter;
      if (
        p === 'high' ||
        p === 'medium' ||
        p === 'low' ||
        p === 'all' ||
        p === 'default'
      ) {
        priority = p;
      }
    }
  }

  if (process.env.DRY_RUN === '1') dryRun = true;
  if (process.env.LIMIT) {
    const n = parseInt(String(process.env.LIMIT), 10);
    if (Number.isFinite(n) && n >= 1) limit = Math.min(n, 500);
  }
  if (process.env.NAMEJA_TRANSLATE_PRIORITY) {
    const p = String(process.env.NAMEJA_TRANSLATE_PRIORITY).trim() as PriorityFilter;
    if (
      p === 'high' ||
      p === 'medium' ||
      p === 'low' ||
      p === 'all' ||
      p === 'default'
    ) {
      priority = p;
    }
  }

  return { dryRun, limit, priority };
}

function toPriority(v: unknown): TranslationPriority {
  if (v === 'high' || v === 'medium' || v === 'low') return v;
  return 'low';
}

function toMillis(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'object' && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

async function queryTargetsByPriority(priority: TranslationPriority, limit: number): Promise<TargetItem[]> {
  const db = getDb();
  const snap = await db
    .collection(PRODUCTS_PUBLIC_COLLECTION)
    .where('needsNameJa', '==', true)
    .where('translationPriority', '==', priority)
    .limit(Math.max(100, limit * 3))
    .get();

  const items: TargetItem[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name != null ? String(data.name).trim() : '';
    if (!name) continue;
    items.push({
      goodsNo: doc.id,
      name,
      brand: data.brand != null ? String(data.brand).trim() : '',
      brandJa: data.brandJa != null ? String(data.brandJa).trim() : undefined,
      nameJa: data.nameJa != null ? String(data.nameJa).trim() : undefined,
      reviewSummaryJa: strField(data.reviewSummaryJa),
      ingredientSummaryJa: strField(data.ingredientSummaryJa),
      summaryJa: strField(data.summaryJa),
      translationPriority: toPriority(data.translationPriority),
      lastRank:
        data.lastRank != null && Number.isFinite(Number(data.lastRank))
          ? Number(data.lastRank)
          : null,
      lastSeenRunDate:
        data.lastSeenRunDate != null ? String(data.lastSeenRunDate).trim() : undefined,
      updatedAt: data.updatedAt,
    });
  }

  items.sort((a, b) => {
    const ar = a.lastRank != null ? a.lastRank : 999999;
    const br = b.lastRank != null ? b.lastRank : 999999;
    if (ar !== br) return ar - br;
    const ad = a.lastSeenRunDate || '';
    const bd = b.lastSeenRunDate || '';
    if (ad !== bd) return bd.localeCompare(ad);
    return toMillis(b.updatedAt) - toMillis(a.updatedAt);
  });
  return items;
}

function resolveTranslationPriorities(filter: PriorityFilter): TranslationPriority[] {
  if (filter === 'all') return ['high', 'medium', 'low'];
  if (filter === 'default') return ['high', 'medium'];
  return [filter];
}

async function pickTargets(options: RunOptions): Promise<TargetItem[]> {
  const priorities = resolveTranslationPriorities(options.priority);

  const out: TargetItem[] = [];
  for (const p of priorities) {
    if (out.length >= options.limit) break;
    const rest = options.limit - out.length;
    const chunk = await queryTargetsByPriority(p, rest);
    for (const item of chunk) {
      if (out.length >= options.limit) break;
      out.push(item);
    }
  }
  return out;
}

function sourceInputFromItem(item: TargetItem) {
  return {
    name: item.name,
    brand: item.brand,
    brandJa: item.brandJa,
    reviewSummaryJa: item.reviewSummaryJa,
    ingredientSummaryJa: item.ingredientSummaryJa,
    summaryJa: item.summaryJa,
  };
}

export async function runNameJaTranslationJob(options?: Partial<RunOptions>): Promise<void> {
  const parsed = parseArgs();
  const opt: RunOptions = { ...parsed, ...options };
  const prioritiesResolved = resolveTranslationPriorities(opt.priority);

  console.log(
    '[NAMEJA_TRANSLATE_START]',
    JSON.stringify({
      dryRun: opt.dryRun,
      limit: opt.limit,
      priority: opt.priority,
      prioritiesResolved,
      collection: PRODUCTS_PUBLIC_COLLECTION,
    })
  );

  const picked = await pickTargets(opt);

  let translated = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let blockedMissingSource = 0;
  let blockedAlreadySafe = 0;
  let blockedUnsafeGenerated = 0;
  let blockedLowInsufficientSource = 0;

  for (const item of picked) {
    const srcIn = sourceInputFromItem(item);
    const quality = evaluateNameJaSourceQuality(srcIn);

    console.log(
      '[NAMEJA_TRANSLATE_SOURCE_QUALITY]',
      JSON.stringify({
        goodsNo: item.goodsNo,
        rawName: item.name,
        brand: item.brand,
        hasSafeRawName: quality.hasSafeRawName,
        hasBrand: quality.hasBrand,
        hasCategoryHint: quality.hasCategoryHint,
        sourceQuality: quality.sourceQuality,
        hasMeaningfulKo: quality.hasMeaningfulKo,
        categoryFromName: quality.categoryFromName,
        categoryFromSummaries: quality.categoryFromSummaries,
      })
    );

    console.log(
      '[NAMEJA_TRANSLATE_PICKED]',
      JSON.stringify({
        goodsNo: item.goodsNo,
        currentPriority: item.translationPriority,
        currentNameJa: item.nameJa ?? null,
        rawName: item.name,
      })
    );

    const currentJa = (item.nameJa ?? '').trim();
    if (currentJa && !isUnsafeNameJa(currentJa, { brand: item.brand, brandJa: item.brandJa })) {
      blockedAlreadySafe += 1;
      skipped += 1;
      console.log(
        '[NAMEJA_TRANSLATE_SKIP]',
        JSON.stringify({ goodsNo: item.goodsNo, reason: 'already_safe' })
      );
      continue;
    }

    const emptyName = !item.name.trim();
    const insufficientSource =
      emptyName || !hasTranslatableSourceForNameJa(srcIn);
    if (insufficientSource) {
      skipped += 1;
      if (item.translationPriority === 'low') {
        blockedLowInsufficientSource += 1;
      } else {
        blockedMissingSource += 1;
      }
      console.log(
        '[NAMEJA_TRANSLATE_SKIP]',
        JSON.stringify({
          goodsNo: item.goodsNo,
          reason: 'missing_source_name',
          translationPriority: item.translationPriority,
          blockedBucket:
            item.translationPriority === 'low' ? 'low_insufficient_source' : 'missing_source',
        })
      );
      if (!opt.dryRun) {
        await getDb()
          .collection(PRODUCTS_PUBLIC_COLLECTION)
          .doc(item.goodsNo)
          .set(
            {
              translationBlockedReason: 'missing_source_name',
              nameJaSourceQuality: 'insufficient',
              needsSourceEnrichment: true,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
      continue;
    }

    if (opt.dryRun) {
      skipped += 1;
      console.log(
        '[NAMEJA_TRANSLATE_SKIP]',
        JSON.stringify({ goodsNo: item.goodsNo, reason: 'dry_run' })
      );
      continue;
    }

    try {
      const jaCtx = { brand: item.brand, brandJa: item.brandJa };
      let nextNameJa = (
        await translateProductNameToJa(item.name, {
          brand: item.brand,
          brandJa: item.brandJa,
          goodsNo: item.goodsNo,
        })
      ).trim();
      let unsafeReason = explainUnsafeNameJa(nextNameJa, jaCtx);

      if (unsafeReason !== null) {
        console.log(
          '[NAMEJA_TRANSLATE_UNSAFE]',
          JSON.stringify({
            goodsNo: item.goodsNo,
            attempt: 1,
            generatedName: nextNameJa,
            unsafeReason,
          })
        );
        nextNameJa = (
          await translateProductNameToJa(item.name, {
            brand: item.brand,
            brandJa: item.brandJa,
            goodsNo: item.goodsNo,
          })
        ).trim();
        unsafeReason = explainUnsafeNameJa(nextNameJa, jaCtx);
      }

      if (unsafeReason !== null) {
        console.log(
          '[NAMEJA_TRANSLATE_UNSAFE]',
          JSON.stringify({
            goodsNo: item.goodsNo,
            attempt: 2,
            generatedName: nextNameJa,
            unsafeReason,
          })
        );
        nextNameJa = composeFallbackNameJaBrandCategory(item.brand, item.brandJa, item.name).trim();
        unsafeReason = explainUnsafeNameJa(nextNameJa, jaCtx);
      }

      if (unsafeReason !== null) {
        blockedUnsafeGenerated += 1;
        skipped += 1;
        console.log(
          '[NAMEJA_TRANSLATE_SKIP]',
          JSON.stringify({
            goodsNo: item.goodsNo,
            reason: 'unsafe_generated_name',
            generatedName: nextNameJa,
            unsafeReason,
          })
        );
        await getDb()
          .collection(PRODUCTS_PUBLIC_COLLECTION)
          .doc(item.goodsNo)
          .set(
            {
              translationBlockedReason: 'unsafe_generated_name',
              nameJaSourceQuality: 'insufficient',
              needsSourceEnrichment: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        continue;
      }

      translated += 1;
      await getDb()
        .collection(PRODUCTS_PUBLIC_COLLECTION)
        .doc(item.goodsNo)
        .set(
          {
            nameJa: nextNameJa,
            needsNameJa: false,
            lastNameJaTranslatedAt: FieldValue.serverTimestamp(),
            nameJaUpdatedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            translationBlockedReason: FieldValue.delete(),
            nameJaSourceQuality: FieldValue.delete(),
            needsSourceEnrichment: FieldValue.delete(),
          },
          { merge: true }
        );
      updated += 1;

      console.log(
        '[NAMEJA_TRANSLATE_SUCCESS]',
        JSON.stringify({
          goodsNo: item.goodsNo,
          before: currentJa || null,
          after: nextNameJa,
          priority: item.translationPriority,
        })
      );
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        '[NAMEJA_TRANSLATE_ERROR]',
        JSON.stringify({ goodsNo: item.goodsNo, reason: 'llm_error', error: msg })
      );
    }
  }

  console.log(
    '[NAMEJA_TRANSLATE_DONE]',
    JSON.stringify({
      scanned: picked.length,
      picked: picked.length,
      translated,
      updated,
      skipped,
      failed,
      blockedMissingSource,
      blockedAlreadySafe,
      blockedUnsafeGenerated,
      blockedLowInsufficientSource,
      dryRun: opt.dryRun,
    })
  );
}

if (require.main === module) {
  runNameJaTranslationJob().catch((e) => {
    console.error('[NAMEJA_TRANSLATE_FATAL]', e);
    process.exit(1);
  });
}
