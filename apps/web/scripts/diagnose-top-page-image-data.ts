/**
 * TOPページ（急上昇 / 今日の注目）に載っている商品の画像関連 Firestore フィールドを診断する。
 *
 * 使い方（apps/web で）:
 *   pnpm diagnose-top-images
 *
 * 前提: `.env.local` に Firestore 認証（Next と同じ）
 *
 * 判定の目安:
 * - resolve が placeholder かつ「画像系フィールドがほぼ空」→ データ未投入・未解析の可能性が高い
 * - resolve が実 URL なのに別問題 → 表示ロジックを疑う（通常はフロントのバグ）
 */
import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import {
  getRankingRunDates,
  getRankingTopNWithProducts,
  getRisingProductsWithProducts,
} from "../src/lib/oliveyoung-rankings";
import { getOliveYoungProductByGoodsNo } from "../src/lib/oliveyoung-products";
import {
  resolveProductDisplayImage,
  OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH,
} from "../src/lib/product-display-image-resolve";

type Section = "急上昇" | "今日の注目";

type Row = {
  section: Section;
  goodsNo: string;
  rank?: number;
};

function isEmptyImagePipeline(p: {
  safeImageUrl?: string;
  hasSafeProductImage?: boolean;
  imageAnalysis?: unknown[] | undefined;
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  marketplaceImageMatchLevels?: Record<string, unknown> | undefined;
}): boolean {
  const noSafe = !(p.safeImageUrl ?? "").trim();
  const noFlag = p.hasSafeProductImage !== true;
  const noAnalysis = !Array.isArray(p.imageAnalysis) || p.imageAnalysis.length === 0;
  const noMall =
    !(p.amazonImage ?? "").trim() &&
    !(p.rakutenImage ?? "").trim() &&
    !(p.qoo10Image ?? "").trim();
  const levels = p.marketplaceImageMatchLevels;
  const noLevels =
    !levels ||
    typeof levels !== "object" ||
    Object.keys(levels).length === 0;
  return noSafe && noFlag && noAnalysis && noMall && noLevels;
}

async function main() {
  const runDates = await getRankingRunDates();
  const runDate = runDates[0] ?? null;

  const rows: Row[] = [];

  const rising = await getRisingProductsWithProducts(5);
  if (rising?.items.length) {
    for (const item of rising.items) {
      rows.push({
        section: "急上昇",
        goodsNo: item.goodsNo,
        rank: item.rank,
      });
    }
  }

  if (runDate) {
    const top = await getRankingTopNWithProducts(runDate, 3);
    if (top?.items.length) {
      for (const item of top.items) {
        rows.push({
          section: "今日の注目",
          goodsNo: item.goodsNo,
          rank: item.rank,
        });
      }
    }
  }

  const seen = new Set<string>();
  const uniqueGoodsNos: string[] = [];
  for (const r of rows) {
    if (seen.has(r.goodsNo)) continue;
    seen.add(r.goodsNo);
    uniqueGoodsNos.push(r.goodsNo);
  }

  // eslint-disable-next-line no-console -- CLI
  console.log("=== TOP 表示商品 goodsNo（再実行用・重複除去） ===");
  // eslint-disable-next-line no-console -- CLI
  console.log(JSON.stringify(uniqueGoodsNos, null, 2));
  // eslint-disable-next-line no-console -- CLI
  console.log("");
  // eslint-disable-next-line no-console -- CLI
  console.log(`対象 runDate（注目）: ${runDate ?? "(なし)"}`);
  // eslint-disable-next-line no-console -- CLI
  console.log("");

  let placeholderWithEmptyPipeline = 0;
  let placeholderWithData = 0;
  let resolvedOk = 0;

  for (const r of rows) {
    const p = await getOliveYoungProductByGoodsNo(r.goodsNo);
    if (!p) {
      // eslint-disable-next-line no-console -- CLI
      console.log(
        `--- ${r.section} goodsNo=${r.goodsNo} rank=${r.rank ?? "-"} ---\n  oliveyoung_products_public にドキュメントなし\n`
      );
      continue;
    }

    const resolution = resolveProductDisplayImage(p);
    const isPlaceholder =
      resolution.url === OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH ||
      resolution.source === "fallback_placeholder";

    const pipelineEmpty = isEmptyImagePipeline(p);
    const hasOyCrawl =
      !!(p.imageUrl ?? "").trim() ||
      !!(p.thumbnailUrl ?? "").trim() ||
      (Array.isArray(p.imageUrls) && p.imageUrls.length > 0);

    if (isPlaceholder && pipelineEmpty) {
      placeholderWithEmptyPipeline++;
    } else if (isPlaceholder && !pipelineEmpty) {
      placeholderWithData++;
    } else {
      resolvedOk++;
    }

    // eslint-disable-next-line no-console -- CLI
    console.log(`--- ${r.section} goodsNo=${r.goodsNo} rank=${r.rank ?? "-"} ---`);
    // eslint-disable-next-line no-console -- CLI
    console.log(
      JSON.stringify(
        {
          safeImageUrl: (p.safeImageUrl ?? "").trim() || null,
          hasSafeProductImage: p.hasSafeProductImage === true,
          imageAnalysisCount: Array.isArray(p.imageAnalysis)
            ? p.imageAnalysis.length
            : 0,
          amazonImage: (p.amazonImage ?? "").trim() || null,
          rakutenImage: (p.rakutenImage ?? "").trim() || null,
          qoo10Image: (p.qoo10Image ?? "").trim() || null,
          marketplaceImageMatchLevels: p.marketplaceImageMatchLevels ?? null,
          /** クロール由来の OY 系 URL の有無（解析前でも true になり得る） */
          hasOyCrawlImageFields: hasOyCrawl,
          imageUrlLen: (p.imageUrl ?? "").trim().length,
          thumbnailUrlLen: (p.thumbnailUrl ?? "").trim().length,
          imageUrlsCount: Array.isArray(p.imageUrls) ? p.imageUrls.length : 0,
          resolveProductDisplayImage: {
            url: resolution.url,
            source: resolution.source,
            isPlaceholderUi: isPlaceholder,
          },
          emptyPipeline_heuristic: pipelineEmpty,
        },
        null,
        2
      )
    );
    // eslint-disable-next-line no-console -- CLI
    console.log("");
  }

  // eslint-disable-next-line no-console -- CLI
  console.log("=== 集計（同一 goodsNo が両セクションにいると二重計上） ===");
  // eslint-disable-next-line no-console -- CLI
  console.log(
    JSON.stringify(
      {
        rowsChecked: rows.length,
        uniqueGoodsNos: uniqueGoodsNos.length,
        resolveShowsRealImage: resolvedOk,
        placeholder_but_pipelineHasSomeData: placeholderWithData,
        placeholder_and_pipelineLooksEmpty: placeholderWithEmptyPipeline,
      },
      null,
      2
    )
  );
  // eslint-disable-next-line no-console -- CLI
  console.log("");
  // eslint-disable-next-line no-console -- CLI
  console.log("=== 結論の目安 ===");
  if (placeholderWithEmptyPipeline > 0 && resolvedOk === 0 && placeholderWithData === 0) {
    // eslint-disable-next-line no-console -- CLI
    console.log(
      "→ **データ未投入・未解析の可能性が高い**: 対象商品の safeImage / imageAnalysis / モール画像・levels が空で、プレースホルダーに落ちている。"
    );
  } else if (placeholderWithData > 0) {
    // eslint-disable-next-line no-console -- CLI
    console.log(
      "→ **データは一部あるが表示条件を満たしていない**: Vision の人物判定・strong 条件・OY 解析待ちなど。パイプライン確認が必要。"
    );
  } else if (resolvedOk > 0 && placeholderWithEmptyPipeline === 0 && placeholderWithData === 0) {
    // eslint-disable-next-line no-console -- CLI
    console.log(
      "→ **表示ロジック上は実画像 URL に解決できている**: 画面上だけプレースホルダーなら、ネットワーク・URL 無効・別バグを疑う。"
    );
  } else {
    // eslint-disable-next-line no-console -- CLI
    console.log(
      "→ **混在**: 上記 JSON 各行の resolve / emptyPipeline を見て判断してください。"
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
