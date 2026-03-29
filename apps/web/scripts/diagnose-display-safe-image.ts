/**
 * display:safe_image の実体（safeImageUrl / 最終表示 URL）を集計し、代表例を出力する。
 *
 *   pnpm diagnose-display-safe-image
 *
 * 前提: `.env.local` に Firestore 認証
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { getDisplayProductNameText } from "../src/lib/oliveyoung-display";
import {
  getOliveYoungProductByGoodsNo,
  type OliveYoungProductDetail,
} from "../src/lib/oliveyoung-products";
import type { ProductImageFields } from "../src/lib/product-display-image-resolve";
import {
  getRankingByDate,
  getRankingRunDates,
  getRankingTopNWithProducts,
  getRisingProductsWithProducts,
} from "../src/lib/oliveyoung-rankings";
import { resolveProductImageForDisplay } from "../src/lib/getProductImage";
import { serializeProductImageFieldsForClient } from "../src/lib/serialize-product-for-client";
import { getRelatedProducts } from "../src/lib/oliveyoung-related";
import {
  classifySafeImageUrl,
  safeImageUrlKindDescriptionJa,
  type SafeImageUrlKind,
} from "../src/lib/safe-image-url-classify";

type Row = {
  section: string;
  goodsNo: string;
  nameShort: string;
  displayUrl: string;
  safeRaw: string;
  urlKind: SafeImageUrlKind;
};

function parseArgs(argv: string[]) {
  let runDate: string | null = null;
  for (const a of argv) {
    if (a.startsWith("--runDate=")) {
      runDate = a.slice("--runDate=".length).trim() || null;
    }
  }
  return { runDate };
}

function emptyKindCounts(): Record<SafeImageUrlKind, number> {
  return {
    vision_safe_non_mall: 0,
    vision_safe_mall_url: 0,
    placeholder_like: 0,
  };
}

async function collectSafeImageRows(
  section: string,
  products: Array<
    ProductImageFields & {
      goodsNo?: string;
      name?: string;
      nameJa?: string;
      brand?: string;
      brandJa?: string;
    }
  >
): Promise<Row[]> {
  const out: Row[] = [];
  for (const p of products) {
    const goodsNo = (p.goodsNo ?? "").trim();
    if (!goodsNo) continue;
    const plain = serializeProductImageFieldsForClient(p);
    const pipe = resolveProductImageForDisplay(plain, { goodsNo });
    if (pipe.imageSource !== "display:safe_image") continue;
    const safeRaw = (plain.safeImageUrl ?? "").trim();
    const urlKind = classifySafeImageUrl(pipe.url);
    const nameShort = getDisplayProductNameText({
      nameJa: (p as { nameJa?: string }).nameJa,
      name: (p as { name?: string }).name,
      brand: (p as { brand?: string }).brand,
      brandJa: (p as { brandJa?: string }).brandJa,
    }).slice(0, 48);
    out.push({
      section,
      goodsNo,
      nameShort,
      displayUrl: pipe.url,
      safeRaw,
      urlKind,
    });
  }
  return out;
}

async function main() {
  const { runDate: runDateArg } = parseArgs(process.argv.slice(2));
  const runDates = await getRankingRunDates();
  const runDate = runDateArg ?? runDates[0] ?? null;
  if (!runDate) {
    console.error("runDate がありません。");
    process.exit(1);
  }

  const ranking = await getRankingByDate(runDate);
  if (!ranking) {
    console.error(`ランキングなし: ${runDate}`);
    process.exit(1);
  }

  const official100: OliveYoungProductDetail[] = [];
  for (const row of ranking.items.slice(0, 100)) {
    const p = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (p) official100.push(p);
  }

  const rising = await getRisingProductsWithProducts(5);
  const top3 = await getRankingTopNWithProducts(runDate, 3);
  const entry = [...(rising?.items ?? []), ...(top3?.items ?? [])];

  let relatedRows: Row[] = [];
  const first = official100[0];
  if (first) {
    const related = await getRelatedProducts(first, {
      brandLimit: 3,
      categoryLimit: 3,
      rankLimit: 3,
    });
    relatedRows = [
      ...(await collectSafeImageRows("関連・同ブランド", related.byBrand)),
      ...(await collectSafeImageRows("関連・同カテゴリ", related.byCategory)),
      ...(await collectSafeImageRows("関連・近い順位", related.byRank)),
    ];
  }

  const rowsRanking = await collectSafeImageRows(
    "ランキング公式1〜100位",
    official100
  );
  const rowsEntry = await collectSafeImageRows("トップ急上昇+注目", entry);

  const all = [...rowsRanking, ...rowsEntry, ...relatedRows];
  const kindTotals = emptyKindCounts();
  for (const r of all) {
    kindTotals[r.urlKind] += 1;
  }

  console.log("\n======== display:safe_image 診断 ========");
  console.log(`runDate: ${runDate}`);
  console.log("\n【URL種別（集計・重複ありセクション横断）】");
  for (const k of Object.keys(kindTotals) as SafeImageUrlKind[]) {
    console.log(`  ${k}: ${kindTotals[k]}  … ${safeImageUrlKindDescriptionJa(k)}`);
  }

  const printSamples = (label: string, rs: Row[], max: number) => {
    console.log(`\n【${label}】 display:safe_image 件数: ${rs.length}`);
    const byKind = emptyKindCounts();
    for (const r of rs) byKind[r.urlKind] += 1;
    console.log("  内訳:", byKind);
    const pick = rs.slice(0, max);
    for (const r of pick) {
      console.log("\n  ---");
      console.log(`  goodsNo: ${r.goodsNo}`);
      console.log(`  name: ${r.nameShort}`);
      console.log(`  urlKind: ${r.urlKind}`);
      console.log(`  safeImageUrl: ${r.safeRaw.slice(0, 120)}${r.safeRaw.length > 120 ? "…" : ""}`);
      console.log(`  表示URL: ${r.displayUrl.slice(0, 120)}${r.displayUrl.length > 120 ? "…" : ""}`);
    }
  };

  printSamples("ランキング公式1〜100位", rowsRanking, 5);
  printSamples("トップ急上昇+注目", rowsEntry, 4);
  if (relatedRows.length) {
    printSamples("関連商品（重複あり）", relatedRows, 4);
  }

  console.log("\n【所見】");
  console.log(
    "display:safe_image は resolve の第1優先で、実体はほぼ常に Firestore の safeImageUrl（Vision が人物なしとした商品画像）。"
  );
  console.log(
    "見た目が「画像なし」に近い場合は、safe が低解像・トリミング・白飛びなどの可能性に加え、別経路（プレースホルダー→getProductImage）を確認すること。"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
