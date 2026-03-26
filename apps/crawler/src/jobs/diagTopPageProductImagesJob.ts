/**
 * TOP ページ相当の goodsNo について、products_public の画像フィールドと
 * Web と同じ解決ロジックでの表示 URL を出力する（切り分け用）。
 *
 *   pnpm run oliveyoung:diag-top-images
 *   pnpm run oliveyoung:diag-top-images -- 30   # max goodsNo 数
 */
import "dotenv/config";
import { Firestore } from "@google-cloud/firestore";
import { collectTopPageGoodsNos } from "../lib/topPageGoodsNosFirestore";
import { resolveProductDisplayImageUrlLikeWeb } from "../lib/topPageDisplayedSlotsFirestore";

const PRODUCTS_COLLECTION = "oliveyoung_products_public";

function getDb(): Firestore {
  const db = new Firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const numArg = argv.find((a) => /^\d+$/.test(a));
  const maxTop = numArg ? Math.min(parseInt(numArg, 10), 100) : 20;

  const db = getDb();
  const { goodsNos, runDateLatest, runDatesCount } = await collectTopPageGoodsNos(
    db,
    { maxTotal: maxTop }
  );

  console.log("[TOP_GOODS_NOS]", goodsNos);
  console.log("[TOP_META]", { runDateLatest, runDatesCount, maxTop });

  const rows: Record<string, unknown>[] = [];
  let firestoreHasSafe = 0;
  let resolvedDisplay = 0;
  let hasSafeButResolveEmpty = 0;

  for (const goodsNo of goodsNos) {
    const snap = await db.collection(PRODUCTS_COLLECTION).doc(goodsNo).get();
    if (!snap.exists) {
      rows.push({ goodsNo, error: "missing_public_doc" });
      continue;
    }
    const d = snap.data() ?? {};
    const safeImageUrl = str(d.safeImageUrl);
    const imageAnalysis = Array.isArray(d.imageAnalysis) ? d.imageAnalysis : null;

    const slice = {
      goodsNo,
      imageUrl: str(d.imageUrl),
      imageUrls: d.imageUrls ?? [],
      thumbnailUrl: str(d.thumbnailUrl),
      imageAnalysis,
      safeImageUrl,
      hasSafeProductImage: d.hasSafeProductImage === true,
    };

    const imageUrlsArr = Array.isArray(d.imageUrls)
      ? d.imageUrls.map((x: unknown) => str(x)).filter(Boolean)
      : undefined;
    const resolved = resolveProductDisplayImageUrlLikeWeb({
      amazonImage: str(d.amazonImage) || undefined,
      rakutenImage: str(d.rakutenImage) || undefined,
      qoo10Image: str(d.qoo10Image) || undefined,
      safeImageUrl: safeImageUrl || undefined,
      imageUrl: str(d.imageUrl) || undefined,
      thumbnailUrl: str(d.thumbnailUrl) || undefined,
      imageUrls: imageUrlsArr && imageUrlsArr.length > 0 ? imageUrlsArr : undefined,
      marketplaceImageMatchLevels:
        d.marketplaceImageMatchLevels && typeof d.marketplaceImageMatchLevels === "object"
          ? (d.marketplaceImageMatchLevels as Record<string, unknown>)
          : undefined,
      imageAnalysis:
        imageAnalysis?.map((x: unknown) => {
          if (!x || typeof x !== "object") return { url: "", containsPerson: true };
          const o = x as Record<string, unknown>;
          return {
            url: str(o.url),
            containsPerson: o.containsPerson === true,
          };
        }) ?? undefined,
    });

    if (safeImageUrl) firestoreHasSafe += 1;
    if (resolved) resolvedDisplay += 1;
    if (safeImageUrl && !resolved) hasSafeButResolveEmpty += 1;

    rows.push({
      ...slice,
      resolvedDisplayImageUrl: resolved,
    });
  }

  console.log("[TOP_PRODUCT_IMAGE_ROWS]", JSON.stringify(rows, null, 2));

  const summary = {
    topGoodsCount: goodsNos.length,
    firestoreHasNonEmptySafeImageUrl: firestoreHasSafe,
    resolvedDisplayNonEmpty: resolvedDisplay,
    hasSafeButResolveEmpty,
  };
  console.log("[TOP_IMAGE_DIAG_SUMMARY]", summary);

  let verdict: string;
  if (firestoreHasSafe < goodsNos.length * 0.3 && resolvedDisplay < goodsNos.length * 0.3) {
    verdict =
      "A寄り: TOP枠の多くが Firestore 上でも safeImageUrl / マーケット+imageAnalysis が不足。Vision 再解析や判定見直しを検討。";
  } else if (hasSafeButResolveEmpty > 0) {
    verdict =
      "B寄り: safeImageUrl はあるのに解決 URL が空の件あり。resolve ロジックまたは imageAnalysis の URL 不一致を疑う。";
  } else if (firestoreHasSafe >= resolvedDisplay) {
    verdict =
      "データと解決結果は整合。以前 TOP 補完で safeImageUrl を渡していなかった不具合は web の oliveyoung-rankings で修正済みなら、デプロイ後に再確認。";
  } else {
    verdict = "要確認: サンプル行を個別に見てください。";
  }
  console.log("[TOP_IMAGE_DIAG_VERDICT]", verdict);
}

main().catch((e) => {
  console.error("[DIAG_TOP_IMAGES_ERROR]", e);
  process.exit(1);
});
