/**
 * 急上昇 or ランキングから OY ボタンが出ない商品を1件探し、URL 経路の実値を出す。
 * apps/web: pnpm exec tsx scripts/diagnose-oy-one-hidden.ts
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import {
  getRankingRunDates,
  getRankingWithProducts,
  getRisingProductsWithProducts,
} from "../src/lib/oliveyoung-rankings";
import { getOliveYoungProductByGoodsNo } from "../src/lib/oliveyoung-products";
import {
  mergeOliveYoungListingProductUrl,
  getRelatedStyleOyHref,
  isOliveYoungApiLikeUrl,
} from "../src/lib/oliveyoung-official-url";
import { resolveOyNavigableUrl } from "../src/lib/product-shop-cta-links";

function summarize(raw: string | null | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return { trim: "", apiLike: false, getHref: null as string | null };
  return {
    trim: s,
    apiLike: isOliveYoungApiLikeUrl(s),
    getHref: getRelatedStyleOyHref(s),
  };
}

async function main() {
  console.error(
    "[diagnose-oy-one-hidden] Firestore参照（コンソールと照合用）",
    JSON.stringify(
      {
        collectionId: "oliveyoung_products_public",
        documentPathPattern: "oliveyoung_products_public/{goodsNo}",
        getOliveYoungProductByGoodsNo: "上記 doc を1件読み、返却の productUrl は merge 済み（生の data.productUrl ではない）",
        env_FIREBASE_PROJECT_ID_or_equivalent:
          process.env.FIREBASE_PROJECT_ID?.trim() ||
          process.env.GCP_PROJECT_ID?.trim() ||
          process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
          null,
        rawDocDumpScript:
          "生フィールドのみ出す場合: pnpm exec tsx scripts/diagnose-oy-firestore-raw-by-goodsno.ts <goodsNo>",
      },
      null,
      2
    )
  );

  const runDates = await getRankingRunDates();
  const latest = runDates[0] ?? null;

  type Candidate = { source: string; goodsNo: string };
  const candidates: Candidate[] = [];

  const rising = await getRisingProductsWithProducts(8);
  if (rising?.items.length) {
    for (const item of rising.items) {
      candidates.push({ source: "top_rising", goodsNo: item.goodsNo });
    }
  }

  if (latest) {
    const full = await getRankingWithProducts(latest);
    if (full?.items.length) {
      for (const item of full.items.slice(0, 30)) {
        candidates.push({
          source: `ranking_${latest}`,
          goodsNo: item.goodsNo,
        });
      }
    }
  }

  let picked: {
    source: string;
    goodsNo: string;
    db: Awaited<ReturnType<typeof getOliveYoungProductByGoodsNo>>;
    mergedProductUrl: string;
    pickedUrl: string | null;
    oliveYoungUrl: string | null | undefined;
  } | null = null;

  for (const c of candidates) {
    const db = await getOliveYoungProductByGoodsNo(c.goodsNo);
    const mergedProductUrl = mergeOliveYoungListingProductUrl({
      productUrl: db?.productUrl,
      pickedUrl: db?.pickedUrl,
      oliveYoungUrl: db?.oliveYoungUrl,
    });
    const pickedUrl = db?.pickedUrl ?? null;
    const oliveYoungUrl = db?.oliveYoungUrl;
    const final = resolveOyNavigableUrl({
      productUrl: mergedProductUrl,
      pickedUrl,
      oliveYoungUrl,
    });
    if (!final) {
      picked = {
        source: c.source,
        goodsNo: c.goodsNo,
        db,
        mergedProductUrl,
        pickedUrl,
        oliveYoungUrl,
      };
      break;
    }
  }

  if (!picked) {
    console.log(
      JSON.stringify(
        {
          message:
            "急上昇枠＋ランキング上位30件のいずれも resolveOyNavigableUrl が非空でした。別日付・別セクションで再実行するか、手動で goodsNo を指定してください。",
          runDates: runDates.slice(0, 3),
        },
        null,
        2
      )
    );
    return;
  }

  const dbPu = picked.db?.productUrl ?? null;
  const dbPk = picked.pickedUrl;
  const dbOy = picked.oliveYoungUrl ?? null;

  const pu = summarize(dbPu);
  const pk = summarize(dbPk);
  const oy = summarize(dbOy);
  const merged = summarize(picked.mergedProductUrl);

  const resolveInput = {
    productUrl: picked.mergedProductUrl,
    pickedUrl: picked.pickedUrl,
    oliveYoungUrl: picked.oliveYoungUrl ?? null,
  };
  const resolved = resolveOyNavigableUrl(resolveInput);

  console.log(
    JSON.stringify(
      {
        pickedFrom: picked.source,
        goodsNo: picked.goodsNo,
        renderPath: {
          topRising:
            "apps/web/src/app/oliveyoung/page.tsx → RelatedStyleOliveYoungLink（ProductPrimaryCtaBlock ではない）",
          rankingPage:
            "apps/web/src/app/oliveyoung/rankings/[runDate]/page.tsx → ProductCard（内部） → RelatedStyleOliveYoungLink",
        },
        note:
          "一覧・急上昇はいずれも RelatedStyleOliveYoungLink。子は resolveOyNavigableUrl のみ（href 空なら null）。",
        firestoreRaw: {
          productUrl: dbPu,
          pickedUrl: dbPk,
          oliveYoungUrl: dbOy,
        },
        cardPropsAsServer: {
          productUrl: picked.mergedProductUrl,
          pickedUrl: picked.pickedUrl,
          oliveYoungUrl: picked.oliveYoungUrl ?? null,
        },
        getRelatedStyleOyHref_each: {
          productUrl_db: pu.getHref,
          pickedUrl_db: pk.getHref,
          oliveYoungUrl_db: oy.getHref,
          mergedListingProductUrl: merged.getHref,
        },
        apiLikeFlags: {
          productUrl_db: pu.apiLike,
          pickedUrl_db: pk.apiLike,
          oliveYoungUrl_db: oy.apiLike,
          mergedListingProductUrl: merged.apiLike,
        },
        resolveOyNavigableUrl_result: resolved || "(empty string)",
        classification: !dbPu?.trim() && !dbPk?.trim() && !dbOy?.trim()
          ? "A: 元データに使えるURLがない（3フィールドとも空）"
          : pu.apiLike && pk.apiLike && oy.apiLike
            ? "B: すべて API ライク除外（実URLはあるが isOliveYoungApiLikeUrl）"
            : merged.trim && !merged.getHref
            ? "B: merge 後の productUrl が API ライクで弾かれ、他も通らない"
            : !resolved && (dbPu?.trim() || dbPk?.trim() || dbOy?.trim())
            ? "B: 一部に文字列はあるが getRelatedStyleOyHref がすべて null（APIライク等）"
            : "（要再確認）",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
