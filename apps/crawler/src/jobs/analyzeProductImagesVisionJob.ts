/**
 * 商品の画像候補を Vision（Gemini + キャッシュ）で解析し、
 * imageAnalysis / safeImageUrl / hasSafeProductImage を oliveyoung_products_public に保存する。
 *
 * 対象: imageVisionAnalyzedAt が未設定のドキュメントのみ（documentId 昇順で最大 limit 件）。
 * 繰り返し実行すると未解析分から順に進む。
 *
 *   pnpm run oliveyoung:analyze-product-images
 *   pnpm run oliveyoung:analyze-product-images -- 20
 *   pnpm run oliveyoung:analyze-product-images -- --top=20 50
 *     … TOP相当の goodsNo 最大20件から、未解析を最大50件処理
 *   pnpm run oliveyoung:analyze-product-images -- --goods=A000000000001,A000000000002
 *
 * 環境変数: GEMINI_API_KEY（必須・未取得キャッシュ時の API 呼び出し用）
 *
 * 将来の拡張候補（未実装）: 人物 inpainting / 商品クロップ / 背景ぼかし（Web imagePersonFilter と同趣旨）
 */
import "dotenv/config";
import { FieldPath, Firestore } from "@google-cloud/firestore";
import { getOrAnalyzeImageUrl } from "../services/getOrAnalyzeImageUrl";
import {
  mergeProductImageVisionFields,
  type ProductImageAnalysisFirestoreRow,
} from "../services/productImageVisionFirestore";
import { collectTopPageGoodsNos } from "../lib/topPageGoodsNosFirestore";

const COLLECTION = "oliveyoung_products_public";
const DEFAULT_LIMIT = 10;
const SLEEP_MS = 450;

function getDb(): Firestore {
  const db = new Firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseGoodsNosFromArgv(argv: string[]): string[] {
  const raw: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--goods=")) {
      raw.push(a.slice("--goods=".length));
      continue;
    }
    if (a === "--goods") {
      for (let j = i + 1; j < argv.length; j++) {
        const b = argv[j];
        if (b.startsWith("--")) break;
        raw.push(b);
      }
      break;
    }
  }
  return raw
    .join(" ")
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /^A\d{12}$/.test(s));
}

function parseLimit(argv: string[]): number {
  const pos = argv.filter((a) => /^\d+$/.test(a));
  const n = pos.length ? parseInt(pos[pos.length - 1], 10) : DEFAULT_LIMIT;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 200) : DEFAULT_LIMIT;
}

/** --top=20 形式。明示 --goods があるときは無視 */
function hasBareNumericArg(argv: string[]): boolean {
  return argv.some((a) => /^\d+$/.test(a));
}

function parseTopMaxFromArgv(argv: string[]): number | null {
  for (const a of argv) {
    if (a.startsWith("--top=")) {
      const n = parseInt(a.slice("--top=".length), 10);
      return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : null;
    }
  }
  const i = argv.indexOf("--top");
  if (i >= 0 && argv[i + 1] && /^\d+$/.test(argv[i + 1])) {
    return Math.min(parseInt(argv[i + 1], 10), 500);
  }
  return null;
}

function isMarketplaceHost(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("amazon.") ||
    u.includes("media-amazon") ||
    u.includes("ssl-images-amazon") ||
    u.includes("rakuten.") ||
    u.includes("qoo10") ||
    u.includes("qoo-img.com")
  );
}

/** safeImageUrl の候補: モール画像以外（主に OY 公式） */
function isOyStyleProductImageUrl(url: string): boolean {
  return url.trim() !== "" && !isMarketplaceHost(url);
}

function uniqueUrlsInOrder(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    const t = u.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Firestore に imageVisionAnalyzedAt が入っていれば「解析済み」とみなす */
function isImageVisionAlreadyAnalyzed(data: Record<string, unknown>): boolean {
  return data.imageVisionAnalyzedAt != null;
}

function pickSafeImageUrl(
  analysis: ProductImageAnalysisFirestoreRow[],
  urlOrder: string[]
): string {
  const idx = new Map(urlOrder.map((u, i) => [u, i]));
  const candidates = analysis.filter(
    (a) => !a.containsPerson && isOyStyleProductImageUrl(a.url)
  );
  candidates.sort((a, b) => {
    const ap = a.isPreferredProductImage ? 1 : 0;
    const bp = b.isPreferredProductImage ? 1 : 0;
    if (bp !== ap) return bp - ap;
    const ac = a.confidence ?? 0;
    const bc = b.confidence ?? 0;
    if (bc !== ac) return bc - ac;
    return (idx.get(a.url) ?? 999) - (idx.get(b.url) ?? 999);
  });
  return candidates[0]?.url?.trim() ?? "";
}

async function analyzeOneProduct(
  goodsNo: string,
  data: Record<string, unknown>
): Promise<void> {
  const pushStr = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).trim();
    return s || "";
  };

  const urls: string[] = [];
  urls.push(pushStr(data.amazonImage));
  urls.push(pushStr(data.rakutenImage));
  urls.push(pushStr(data.qoo10Image));
  urls.push(pushStr(data.imageUrl));
  urls.push(pushStr(data.thumbnailUrl));
  const arr = data.imageUrls;
  if (Array.isArray(arr)) {
    for (const x of arr) urls.push(pushStr(x));
  }

  const urlOrder = uniqueUrlsInOrder(urls);
  if (urlOrder.length === 0) {
    await mergeProductImageVisionFields(goodsNo, {
      imageAnalysis: [],
      safeImageUrl: "",
      hasSafeProductImage: false,
    });
    console.log("[IMAGE_VISION_SKIP]", goodsNo, "no_urls");
    return;
  }

  const imageAnalysis: ProductImageAnalysisFirestoreRow[] = [];

  for (const u of urlOrder) {
    const r = await getOrAnalyzeImageUrl(u);
    imageAnalysis.push({
      url: r.url,
      containsPerson: r.containsPerson,
      confidence: r.confidence,
      isPreferredProductImage: r.isPreferredProductImage,
      isOliveYoungOriginal: isOyStyleProductImageUrl(r.url),
    });
    await sleep(SLEEP_MS);
  }

  const safeImageUrl = pickSafeImageUrl(imageAnalysis, urlOrder);
  const hasSafeProductImage = safeImageUrl !== "";

  await mergeProductImageVisionFields(goodsNo, {
    imageAnalysis,
    safeImageUrl,
    hasSafeProductImage,
  });

  console.log(
    "[IMAGE_VISION_OK]",
    goodsNo,
    `urls=${urlOrder.length}`,
    `safe=${hasSafeProductImage ? "yes" : "no"}`
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const goodsNosFromArg = parseGoodsNosFromArgv(argv);
  const db = getDb();

  type DocRow = { id: string; data: Record<string, unknown> };

  let selectionMode: "collection" | "goods" | "top" = "collection";
  let effectiveGoodsNos = goodsNosFromArg;
  let topMeta: { runDateLatest: string | null; runDatesCount: number } | null = null;

  if (goodsNosFromArg.length === 0) {
    const topMax = parseTopMaxFromArgv(argv);
    if (topMax != null) {
      const topResult = await collectTopPageGoodsNos(db, { maxTotal: topMax });
      effectiveGoodsNos = topResult.goodsNos;
      selectionMode = "top";
      topMeta = {
        runDateLatest: topResult.runDateLatest,
        runDatesCount: topResult.runDatesCount,
      };
      console.log("[TOP_GOODS_NOS]", effectiveGoodsNos);
    }
  } else {
    selectionMode = "goods";
  }

  let effectiveLimit = parseLimit(argv);
  if (selectionMode === "top" && effectiveGoodsNos.length > 0 && !hasBareNumericArg(argv)) {
    effectiveLimit = Math.min(200, Math.max(effectiveGoodsNos.length, DEFAULT_LIMIT));
    console.log("[TOP_VISION_LIMIT_INFER]", {
      inferredLimit: effectiveLimit,
      note: "数値引数が無いため TOP 収集件数に合わせて処理上限を設定",
    });
  }

  if (selectionMode === "top" && effectiveGoodsNos.length > 0 && topMeta) {
    console.log("[TOP_VISION_REANALYZE]", {
      topMax: parseTopMaxFromArgv(argv),
      collectedGoods: effectiveGoodsNos.length,
      runDateLatest: topMeta.runDateLatest,
      runDatesCount: topMeta.runDatesCount,
      processLimit: effectiveLimit,
    });
  }

  let fetchedCount = 0;
  let alreadyAnalyzedCount = 0;
  let pendingRows: DocRow[] = [];

  if (effectiveGoodsNos.length > 0) {
    const rows: DocRow[] = [];
    for (const g of effectiveGoodsNos) {
      const snap = await db.collection(COLLECTION).doc(g).get();
      if (snap.exists) {
        rows.push({ id: snap.id, data: (snap.data() ?? {}) as Record<string, unknown> });
      } else {
        console.warn("[IMAGE_VISION_MISSING_DOC]", g);
      }
    }
    fetchedCount = rows.length;
    for (const r of rows) {
      if (isImageVisionAlreadyAnalyzed(r.data)) alreadyAnalyzedCount += 1;
      else pendingRows.push(r);
    }
  } else {
    const snap = await db.collection(COLLECTION).orderBy(FieldPath.documentId()).get();
    fetchedCount = snap.docs.length;
    for (const d of snap.docs) {
      const data = (d.data() ?? {}) as Record<string, unknown>;
      if (isImageVisionAlreadyAnalyzed(data)) alreadyAnalyzedCount += 1;
      else pendingRows.push({ id: d.id, data });
    }
  }

  const pendingCount = pendingRows.length;
  const selectedRows = pendingRows.slice(0, effectiveLimit);
  const selectedCount = selectedRows.length;
  const selectedGoodsNos = selectedRows.map((r) => r.id);

  console.log("[IMAGE_VISION_BATCH_FILTER]", {
    mode: selectionMode,
    fetchedCount,
    alreadyAnalyzedCount,
    pendingCount,
  });

  console.log("[IMAGE_VISION_BATCH_TARGETS]", {
    requestedLimit: effectiveLimit,
    selectedCount,
    goodsNos: selectedGoodsNos.slice(0, 10),
  });

  console.log(
    "[IMAGE_VISION_START]",
    `selected=${selectedCount}`,
    selectionMode === "collection"
      ? `collectionScan=${fetchedCount}`
      : `goodsList=${effectiveGoodsNos.length}`
  );

  if (selectedCount === 0) {
    console.log("[IMAGE_VISION_BATCH_SUMMARY]", {
      requestedLimit: effectiveLimit,
      newlyProcessed: 0,
      failed: 0,
      alreadyAnalyzedSkipped: alreadyAnalyzedCount,
      remainingUnanalyzedEstimate: 0,
      note: "no_pending_docs",
    });
    console.log("[IMAGE_VISION_DONE]", "ok=0 fail=0 (nothing to do)");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const doc of selectedRows) {
    try {
      await analyzeOneProduct(doc.id, doc.data);
      ok += 1;
    } catch (e) {
      fail += 1;
      console.warn(
        "[IMAGE_VISION_FAIL]",
        doc.id,
        e instanceof Error ? e.message : e
      );
    }
  }

  const remainingUnanalyzedEstimate = Math.max(0, pendingCount - selectedCount);

  console.log("[IMAGE_VISION_BATCH_SUMMARY]", {
    requestedLimit: effectiveLimit,
    newlyProcessed: ok,
    failed: fail,
    alreadyAnalyzedSkipped: alreadyAnalyzedCount,
    remainingUnanalyzedEstimate,
  });

  console.log("[IMAGE_VISION_DONE]", `ok=${ok} fail=${fail}`);
}

main().catch((err) => {
  console.error("[IMAGE_VISION_FATAL]", err);
  process.exit(1);
});
