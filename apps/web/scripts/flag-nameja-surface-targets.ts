/**
 * 公開面に載る商品だけを対象に、nameJa 要補完（準備中 / A000 混入 / unsafe）へ
 * `needsNameJa` + `translationPriority: high` を即時付与（nightly 待ち削減）。
 *
 * 使い方（apps/web）:
 *   pnpm run flag-nameja-surface-targets
 *   pnpm run flag-nameja-surface-targets -- --dry-run
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
  isOnTopEntrySurface,
  mergePublicSurfaceGoodsNos,
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

function parseDryRun(): boolean {
  return process.argv.includes("--dry-run");
}

async function main() {
  const dryRun = parseDryRun();
  // eslint-disable-next-line no-console -- CLI
  console.log("[NAMEJA_SURFACE_FIX_START]", JSON.stringify({ dryRun }));

  const products = await getAllOliveYoungProductsMinimal();
  const surfaceIndex = await buildPublicSurfaceGoodsIndex(products);
  const surfaceSet = mergePublicSurfaceGoodsNos(surfaceIndex);
  const byNo = new Map(products.map((p) => [p.goodsNo, p]));

  let scanned = 0;
  let matched = 0;
  let wouldUpdateCount = 0;
  let skipped = 0;
  let updated = 0;
  const ops: { ref: DocumentReference; payload: Record<string, unknown> }[] = [];

  for (const goodsNo of surfaceSet) {
    scanned += 1;
    const p = byNo.get(goodsNo);
    if (!p) continue;

    const ja = (p.nameJa ?? "").trim();
    const pending = getDisplayProductNameText(p) === PRODUCT_TITLE_PENDING_JA;
    const rawJaGoodsNo = !!ja && containsUnsafeGoodsNoText(ja);
    const unsafeJa = !!ja && isUnsafeNameJa(ja, p);

    if (!pending && !rawJaGoodsNo && !unsafeJa) continue;

    matched += 1;
    const placement = getPublicSurfacePlacement(goodsNo, surfaceIndex);
    const translationPriorityCandidate = translationPriorityCandidateFromSurfaceAndRank(
      true,
      p.lastRank
    );
    const nextPriority = mergeTranslationPriorityForNightly(
      p.translationPriority,
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
    const samePriority = p.translationPriority === nextPriority;
    const wouldUpdate = !sameNeeds || !samePriority;

    if (!wouldUpdate) {
      skipped += 1;
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
    "[NAMEJA_SURFACE_FIX_DONE]",
    JSON.stringify({
      scanned,
      matched,
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
