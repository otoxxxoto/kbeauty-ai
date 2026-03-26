/**
 * TOP（急上昇・今日の注目）でまだ画像 URL が空の商品だけを抽出し、
 * Firestore 状態と A/B/C 分類をログする。
 * 併せて商品特定可能性・nameJa 品質・画像なしの B1/B2（補完可否）をログする。
 *
 *   pnpm run oliveyoung:diag-top-missing-images
 *   pnpm run oliveyoung:diag-top-missing-images -- 8 3      # risingMax spotlightN
 *   pnpm run oliveyoung:diag-top-missing-images -- 5 3 50   # + ランキング上位50件まで nameJa 品質スキャン
 */
import "dotenv/config";
import { Firestore } from "@google-cloud/firestore";
import {
  collectTopDisplayedImageSlots,
  collectRankingTopMergedForDiag,
  TOP_DISPLAYED_PRODUCTS_COLLECTION,
} from "../lib/topPageDisplayedSlotsFirestore";
import {
  enrichmentBucketForImageMissing,
  evaluateLowQualityNameJa,
  evaluateProductIdentifiability,
} from "../lib/oliveyoungProductIdentifiability";

function getDb(): Firestore {
  const db = new Firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function serializeVisionAt(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "object" && v !== null && "toDate" in v) {
    const fn = (v as { toDate?: () => Date }).toDate;
    if (typeof fn === "function") {
      try {
        return fn.call(v).toISOString();
      } catch {
        /* fallthrough */
      }
    }
  }
  const s = String(v).trim();
  return s || null;
}

function hasImageVisionAnalyzedAt(d: Record<string, unknown>): boolean {
  return serializeVisionAt(d.imageVisionAnalyzedAt) != null;
}

function classifyMissing(d: Record<string, unknown>): "A" | "B" | "C" {
  const safe = str(d.safeImageUrl);
  const analysis = d.imageAnalysis;
  const hasAnalysis = Array.isArray(analysis) && analysis.length > 0;
  const vision = hasImageVisionAnalyzedAt(d);

  /** TOP 診断では常に「解決 URL が空」の行だけ呼ぶ。safe があるのに空なら Web 側ロジック要調査 */
  if (safe) return "C";
  if (!vision) return "A";
  if (hasAnalysis && !safe) return "B";
  return "A";
}

const EXAMPLE_GOODS_NO = "A000000234422";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const nums = argv.filter((a) => /^\d+$/.test(a)).map((a) => parseInt(a, 10));
  const risingMax = nums[0] ?? 5;
  const spotlightN = nums[1] ?? 3;
  const rankingTopScan = nums[2] ?? 30;

  const db = getDb();
  const { slots, runDateLatest, runDatesCount } = await collectTopDisplayedImageSlots(
    db,
    { risingMax, spotlightN }
  );

  console.log("[TOP_DISPLAYED_META]", {
    runDateLatest,
    runDatesCount,
    risingMax,
    spotlightN,
    rankingTopScan,
    totalSlots: slots.length,
  });

  for (const s of slots) {
    const fields = {
      goodsNo: s.goodsNo,
      nameJa: s.nameJa,
      name: s.name,
      brandJa: s.brandJa,
      brand: s.brand,
    };
    const { identifiable, reasons } = evaluateProductIdentifiability(fields);
    console.log("[TOP_PRODUCT_IDENTIFIABILITY]", {
      goodsNo: s.goodsNo,
      nameJa: s.nameJa ?? "",
      name: s.name,
      brandJa: s.brandJa ?? "",
      brand: s.brand,
      section: s.section,
      rank: s.rank,
      identifiable,
      reason: reasons.join(" / "),
    });
  }

  const lowQualityLogged = new Set<string>();
  for (const s of slots) {
    const fields = {
      goodsNo: s.goodsNo,
      nameJa: s.nameJa,
      name: s.name,
      brandJa: s.brandJa,
      brand: s.brand,
    };
    const issues = evaluateLowQualityNameJa(fields);
    if (issues.length === 0) continue;
    if (lowQualityLogged.has(s.goodsNo)) continue;
    lowQualityLogged.add(s.goodsNo);
    console.log("[LOW_QUALITY_NAMEJA]", {
      goodsNo: s.goodsNo,
      nameJa: s.nameJa ?? "",
      name: s.name,
      brandJa: s.brandJa ?? "",
      brand: s.brand,
      reason: issues.join(" / "),
      source: "top_slot",
    });
  }

  const rankingMergedLimit = runDateLatest
    ? Math.max(rankingTopScan, 500)
    : 0;
  const rankingRowsMerged =
    runDateLatest && rankingMergedLimit > 0
      ? await collectRankingTopMergedForDiag(db, runDateLatest, rankingMergedLimit)
      : [];

  if (rankingTopScan > 0) {
    for (const r of rankingRowsMerged.slice(0, rankingTopScan)) {
      const fields = {
        goodsNo: r.goodsNo,
        nameJa: r.nameJa,
        name: r.name,
        brandJa: r.brandJa,
        brand: r.brand,
      };
      const issues = evaluateLowQualityNameJa(fields);
      if (issues.length === 0) continue;
      if (lowQualityLogged.has(r.goodsNo)) continue;
      lowQualityLogged.add(r.goodsNo);
      console.log("[LOW_QUALITY_NAMEJA]", {
        goodsNo: r.goodsNo,
        nameJa: r.nameJa ?? "",
        name: r.name,
        brandJa: r.brandJa ?? "",
        brand: r.brand,
        reason: issues.join(" / "),
        source: "ranking_top",
        rank: r.rank,
      });
    }
  }

  const missing = slots.filter((s) => !s.resolvedImageUrl.trim());
  console.log("[TOP_IMAGE_MISSING_COUNT]", {
    missing: missing.length,
    withImage: slots.length - missing.length,
  });

  const goodsArgList: string[] = [];
  const classifications: { goodsNo: string; class: "A" | "B" | "C" }[] = [];

  for (const s of missing) {
    const snap = await db.collection(TOP_DISPLAYED_PRODUCTS_COLLECTION).doc(s.goodsNo).get();
    const d = (snap.data() ?? {}) as Record<string, unknown>;
    const cls = classifyMissing(d);

    const nameFields = {
      goodsNo: s.goodsNo,
      nameJa: s.nameJa,
      name: s.name,
      brandJa: s.brandJa,
      brand: s.brand,
    };
    const { identifiable, reasons: idReasons } = evaluateProductIdentifiability(nameFields);
    const enrichmentBucket = enrichmentBucketForImageMissing(identifiable);

    const imageAnalysis = Array.isArray(d.imageAnalysis) ? d.imageAnalysis : null;
    const riseRank = s.section === "rising" ? s.slotIndex : undefined;

    console.log("[TOP_IMAGE_MISSING_ENRICHMENT_READY]", {
      goodsNo: s.goodsNo,
      enrichmentBucket,
      enrichmentNote:
        enrichmentBucket === "B1"
          ? "商品特定可能 → マーケットプレイス画像補完を進められる"
          : "商品特定不能 → 先に nameJa / name 整備が必要",
      identifiable,
      identifiabilityReason: idReasons.join(" / "),
      visionClass: cls,
    });

    console.log("[TOP_IMAGE_MISSING]", {
      goodsNo: s.goodsNo,
      nameJa: s.nameJa ?? "",
      name: s.name,
      brandJa: s.brandJa ?? "",
      brand: s.brand,
      section: s.section,
      rank: s.rank,
      riseRank,
      rankDiff: s.rankDiff,
      isNew: s.isNew,
      displayImageUrl: "",
      resolvedImageUrl: s.resolvedImageUrl,
    });

    console.log("[TOP_IMAGE_MISSING_FIRESTORE]", {
      goodsNo: s.goodsNo,
      class: cls,
      imageUrl: str(d.imageUrl),
      imageUrls: d.imageUrls ?? [],
      thumbnailUrl: str(d.thumbnailUrl),
      imageAnalysis,
      safeImageUrl: str(d.safeImageUrl),
      hasSafeProductImage: d.hasSafeProductImage === true,
      imageVisionAnalyzedAt: serializeVisionAt(d.imageVisionAnalyzedAt),
      amazonImage: str(d.amazonImage),
      rakutenImage: str(d.rakutenImage),
      qoo10Image: str(d.qoo10Image),
    });

    classifications.push({ goodsNo: s.goodsNo, class: cls });
  }

  const seenGoods = new Set<string>();
  for (const s of missing) {
    if (seenGoods.has(s.goodsNo)) continue;
    seenGoods.add(s.goodsNo);
    goodsArgList.push(s.goodsNo);
  }

  const argLine = goodsArgList.join(",");
  console.log("[TOP_IMAGE_MISSING_GOODS_ARG]", argLine);

  const bGoodsOrdered: string[] = [];
  const seenB = new Set<string>();
  for (const c of classifications) {
    if (c.class !== "B") continue;
    if (seenB.has(c.goodsNo)) continue;
    seenB.add(c.goodsNo);
    bGoodsOrdered.push(c.goodsNo);
  }
  console.log("[TOP_IMAGE_MISSING_GOODS_ARG_B]", bGoodsOrdered.join(",") || "(none)");

  const summary = { A: 0, B: 0, C: 0 };
  for (const c of classifications) {
    summary[c.class] += 1;
  }
  console.log("[TOP_IMAGE_MISSING_CLASSIFICATION]", {
    ...summary,
    note: {
      A: "imageVisionAnalyzedAt なし（未解析・再解析候補）",
      B: "Vision 済・imageAnalysis あり・safeImageUrl なし（マケプレ画像補完候補）",
      C: "safeImageUrl ありだが表示解決が空（Web 参照ロジック要確認）",
    },
  });

  let b1 = 0;
  let b2 = 0;
  for (const s of missing) {
    const { identifiable } = evaluateProductIdentifiability({
      goodsNo: s.goodsNo,
      nameJa: s.nameJa,
      name: s.name,
      brandJa: s.brandJa,
      brand: s.brand,
    });
    if (identifiable) b1 += 1;
    else b2 += 1;
  }
  console.log("[TOP_IMAGE_MISSING_ENRICHMENT_SUMMARY]", {
    missingSlots: missing.length,
    enrichmentB1_marketplaceReady: b1,
    enrichmentB2_nameWorkFirst: b2,
    note: "B1/B2 は Vision の A/B/C とは別。画像なしスロットの「人間が商品を特定できるか」",
  });

  const exampleSlot = slots.find((x) => x.goodsNo === EXAMPLE_GOODS_NO);
  const exampleMissing = missing.find((x) => x.goodsNo === EXAMPLE_GOODS_NO);
  if (exampleSlot) {
    const id = evaluateProductIdentifiability({
      goodsNo: exampleSlot.goodsNo,
      nameJa: exampleSlot.nameJa,
      name: exampleSlot.name,
      brandJa: exampleSlot.brandJa,
      brand: exampleSlot.brand,
    });
    const bucket = enrichmentBucketForImageMissing(id.identifiable);
    console.log("[TOP_PRODUCT_EXAMPLE_A000000234422]", {
      goodsNo: EXAMPLE_GOODS_NO,
      onTopCards: true,
      hasImage: Boolean(exampleSlot.resolvedImageUrl.trim()),
      imageMissingOnTop: Boolean(exampleMissing),
      identifiable: id.identifiable,
      enrichmentBucketIfImageMissing: exampleMissing ? bucket : "N/A（TOPで画像あり）",
      why:
        bucket === "B2" || !id.identifiable
          ? "商品名が goodsNo や「ブランド+番号」に近い・未整備のため、外部ECで同一商品を探せない → 先に nameJa 整備（class B の画像問題の前にブロッカー）"
          : "商品名で特定可能 → マーケプレ画像補完（set-market-image 等）に進める",
      reason: id.reasons.join(" / "),
      nameJa: exampleSlot.nameJa ?? "",
      name: exampleSlot.name,
      brandJa: exampleSlot.brandJa ?? "",
      brand: exampleSlot.brand,
    });
  } else if (runDateLatest && rankingRowsMerged.length > 0) {
    const r = rankingRowsMerged.find((x) => x.goodsNo === EXAMPLE_GOODS_NO);
    if (r) {
      const id = evaluateProductIdentifiability({
        goodsNo: r.goodsNo,
        nameJa: r.nameJa,
        name: r.name,
        brandJa: r.brandJa,
        brand: r.brand,
      });
      const bucket = enrichmentBucketForImageMissing(id.identifiable);
      console.log("[TOP_PRODUCT_EXAMPLE_A000000234422]", {
        goodsNo: EXAMPLE_GOODS_NO,
        onTopCards: false,
        inRankingMergedScan: true,
        rank: r.rank,
        hasImage: Boolean(r.resolvedImageUrl.trim()),
        identifiable: id.identifiable,
        enrichmentBucketIfImageMissing: !r.resolvedImageUrl.trim() ? bucket : "N/A（画像あり）",
        why:
          !id.identifiable
            ? "商品名が goodsNo や「ブランド+番号」型の仮名だと特定不能 → B2（先に nameJa / name 整備）"
            : "商品名で特定可能 → 画像が無ければ B1（マーケプレ補完可）",
        reason: id.reasons.join(" / "),
        nameJa: r.nameJa ?? "",
        name: r.name,
        brandJa: r.brandJa ?? "",
        brand: r.brand,
      });
    } else {
      console.log("[TOP_PRODUCT_EXAMPLE_A000000234422]", {
        goodsNo: EXAMPLE_GOODS_NO,
        onTopCards: false,
        inRankingMergedScan: false,
        note: "TOP 外かつランキング上位500件に無し。Firestore を直接確認してください。",
      });
    }
  } else {
    console.log("[TOP_PRODUCT_EXAMPLE_A000000234422]", {
      goodsNo: EXAMPLE_GOODS_NO,
      onTopCards: false,
      note: "runDate なしのためランキングマージ診断不可。",
    });
  }
}

main().catch((e) => {
  console.error("[DIAG_TOP_MISSING_IMAGES_ERROR]", e);
  process.exit(1);
});
