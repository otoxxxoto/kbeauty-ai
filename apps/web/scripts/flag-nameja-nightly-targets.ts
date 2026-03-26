/**
 * displayNamePending / rawNameJaContainsGoodsNo / nameJa unsafe を nightly 翻訳キューへ投入する。
 * 公開面（TOP・カテゴリ先頭・ランキング上位50 等）の商品は lastRank に関わらず high 候補。
 *
 * 使い方（apps/web）:
 *   pnpm run flag-nameja-nightly-targets              （Firestore 更新）
 *   pnpm run flag-nameja-nightly-targets -- --dry-run （更新なし・ログのみ）
 */
import { resolve } from "path";
import { config } from "dotenv";
import type { DocumentReference } from "firebase-admin/firestore";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { db } from "../src/lib/firestore";
import {
  buildPublicSurfaceGoodsIndex,
  getPublicSurfacePlacement,
  isOnPublicSurface,
  isOnTopEntrySurface,
} from "../src/lib/oliveyoung-public-surface";
import {
  getAllOliveYoungProductsMinimal,
  mergeTranslationPriorityForNightly,
  translationPriorityCandidateFromSurfaceAndRank,
} from "../src/lib/oliveyoung-products";
import {
  containsUnsafeGoodsNoText,
  getDisplayProductNameText,
  isUnsafeNameJa,
  PRODUCT_TITLE_PENDING_JA,
} from "../src/lib/oliveyoung-display";

const COLLECTION = "oliveyoung_products_public";

/** ログ用。複数該当時は reason を both とし、reasons に列挙 */
function buildReasonLabels(
  pending: boolean,
  rawJaGoodsNo: boolean,
  unsafeJa: boolean
): { reason: string; reasons: string[] } {
  const reasons: string[] = [];
  if (pending) reasons.push("displayNamePending");
  if (rawJaGoodsNo) reasons.push("rawNameJaContainsGoodsNo");
  if (unsafeJa) reasons.push("nameJaUnsafe");
  const reason = reasons.length > 1 ? "both" : reasons[0] ?? "none";
  return { reason, reasons };
}

function parseDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

function main() {
  const dryRun = parseDryRun();
  // eslint-disable-next-line no-console -- CLI
  console.log("[NAMEJA_NIGHTLY_FLAG_START]", JSON.stringify({ dryRun }));
  return run(dryRun);
}

async function run(dryRun: boolean) {
  const products = await getAllOliveYoungProductsMinimal();
  const surfaceIndex = await buildPublicSurfaceGoodsIndex(products);

  let scanned = 0;
  let matched = 0;
  let wouldUpdateCount = 0;
  let skipped = 0;
  let updated = 0;

  const ops: { ref: DocumentReference; payload: Record<string, unknown> }[] = [];

  for (const p of products) {
    scanned += 1;
    const ja = (p.nameJa ?? "").trim();
    const pending = getDisplayProductNameText(p) === PRODUCT_TITLE_PENDING_JA;
    const rawJaGoodsNo = !!ja && containsUnsafeGoodsNoText(ja);
    const unsafeJa = !!ja && isUnsafeNameJa(ja, p);

    if (!pending && !rawJaGoodsNo && !unsafeJa) continue;

    matched += 1;
    const { reason, reasons } = buildReasonLabels(pending, rawJaGoodsNo, unsafeJa);

    const placement = getPublicSurfacePlacement(p.goodsNo, surfaceIndex);
    const onPublicSurface = isOnPublicSurface(placement);
    const existingPriority = p.translationPriority;
    const translationPriorityCandidate = translationPriorityCandidateFromSurfaceAndRank(
      onPublicSurface,
      p.lastRank
    );
    const nextPriority = mergeTranslationPriorityForNightly(
      existingPriority,
      translationPriorityCandidate
    );

    // eslint-disable-next-line no-console -- CLI
    console.log(
      "[NAMEJA_SURFACE_PRIORITY]",
      JSON.stringify({
        goodsNo: p.goodsNo,
        onTop: isOnTopEntrySurface(placement),
        onCategoryLead: placement.onCategoryLead,
        onRankingTop50: placement.onRankingTop50,
        nextPriority,
      })
    );

    const sameNeeds = p.needsNameJa === true;
    const samePriority = existingPriority === nextPriority;
    const wouldUpdate = !sameNeeds || !samePriority;

    // eslint-disable-next-line no-console -- CLI
    console.log(
      "[NAMEJA_NIGHTLY_FLAG_ITEM]",
      JSON.stringify({
        goodsNo: p.goodsNo,
        currentNeedsNameJa: p.needsNameJa ?? null,
        currentTranslationPriority: existingPriority ?? null,
        onPublicSurface,
        translationPriorityCandidate,
        nextTranslationPriority: nextPriority,
        reason,
        reasons,
        lastRank: p.lastRank,
        wouldUpdate,
      })
    );

    if (!wouldUpdate) {
      skipped += 1;
      // eslint-disable-next-line no-console -- CLI
      console.log(
        "[NAMEJA_NIGHTLY_FLAG_SKIP]",
        JSON.stringify({
          goodsNo: p.goodsNo,
          reason: "no_change",
        })
      );
      continue;
    }

    wouldUpdateCount += 1;
    const payload: Record<string, unknown> = {
      needsNameJa: true,
      translationPriority: nextPriority,
      nameJaFlaggedAt: new Date().toISOString(),
    };

    if (!dryRun) {
      ops.push({
        ref: db.collection(COLLECTION).doc(p.goodsNo),
        payload,
      });
    }
  }

  if (!dryRun && ops.length > 0) {
    const BATCH = 400;
    for (let i = 0; i < ops.length; i += BATCH) {
      const chunk = ops.slice(i, i + BATCH);
      const batch = db.batch();
      for (const { ref, payload } of chunk) {
        batch.update(ref, payload);
      }
      await batch.commit();
      updated += chunk.length;
    }
  }

  // eslint-disable-next-line no-console -- CLI
  console.log(
    "[NAMEJA_NIGHTLY_FLAG_DONE]",
    JSON.stringify({
      scanned,
      matched,
      /** dry-run 時は「更新予定件数」、本実行時は実際の Firestore 更新件数 */
      updated: dryRun ? wouldUpdateCount : updated,
      skipped,
      dryRun,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
