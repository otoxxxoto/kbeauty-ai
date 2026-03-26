/**
 * oliveyoung_products_public の画像 Vision 関連フィールドを集計する。
 *
 *   pnpm run oliveyoung:image-analysis:stats
 *
 * 環境変数: Firestore 用 ADC（他ジョブと同様）
 */
import "dotenv/config";
import { Firestore } from "@google-cloud/firestore";

const COLLECTION = "oliveyoung_products_public";

function getDb(): Firestore {
  const db = new Firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function hasNonEmptySafeImageUrl(data: Record<string, unknown>): boolean {
  return str(data.safeImageUrl) !== "";
}

function hasImageAnalysisArray(data: Record<string, unknown>): boolean {
  return Array.isArray(data.imageAnalysis) && data.imageAnalysis.length > 0;
}

type Stats = {
  total: number;
  safeImageUrlCount: number;
  hasSafeProductImageCount: number;
  imageAnalysisCount: number;
  analyzedButNoSafeImageCount: number;
  /** mergeProductImageVisionFields で触ったドキュメント数の目安 */
  imageVisionAnalyzedAtCount: number;
};

type SampleRow = {
  goodsNo: string;
  imageUrl: string;
  imageUrls: unknown;
  thumbnailUrl: string;
  imageAnalysis: unknown;
  safeImageUrl: string;
  hasSafeProductImage: boolean;
};

function pickSamples(
  docs: { id: string; data: Record<string, unknown> }[],
  max: number
): SampleRow[] {
  const out: SampleRow[] = [];
  const used = new Set<string>();

  const pushFrom = (d: { id: string; data: Record<string, unknown> }) => {
    if (out.length >= max || used.has(d.id)) return;
    used.add(d.id);
    const data = d.data;
    out.push({
      goodsNo: d.id,
      imageUrl: str(data.imageUrl),
      imageUrls: data.imageUrls ?? [],
      thumbnailUrl: str(data.thumbnailUrl),
      imageAnalysis: data.imageAnalysis ?? null,
      safeImageUrl: str(data.safeImageUrl),
      hasSafeProductImage: data.hasSafeProductImage === true,
    });
  };

  // 1) imageAnalysis あり（Vision 結果の中身確認用）
  for (const d of docs) {
    if (hasImageAnalysisArray(d.data)) pushFrom(d);
  }
  // 2) まだ足りなければ imageUrl 等はあるが safe が空のもの（未解析っぽい）
  for (const d of docs) {
    if (out.length >= max) break;
    const data = d.data;
    const hasRaw =
      str(data.imageUrl) !== "" ||
      str(data.thumbnailUrl) !== "" ||
      (Array.isArray(data.imageUrls) && data.imageUrls.length > 0);
    if (hasRaw && !hasNonEmptySafeImageUrl(data)) pushFrom(d);
  }
  // 3) それでも足りなければ先頭から
  for (const d of docs) {
    if (out.length >= max) break;
    pushFrom(d);
  }

  return out;
}

function recommendationText(stats: Stats): string {
  const { total, safeImageUrlCount, imageAnalysisCount, imageVisionAnalyzedAtCount } =
    stats;
  if (total === 0) {
    return "ドキュメント0件。コレクション名・プロジェクトを確認してください。";
  }
  const ratioSafe = safeImageUrlCount / total;
  const ratioAnalysis = imageAnalysisCount / total;
  const ratioTouched = imageVisionAnalyzedAtCount / total;

  const lines: string[] = [];
  lines.push(
    `比率: safeImageUrl=${(ratioSafe * 100).toFixed(1)}%, imageAnalysis=${(ratioAnalysis * 100).toFixed(1)}%, imageVisionAnalyzedAt=${(ratioTouched * 100).toFixed(1)}%`
  );

  if (ratioTouched < 0.05 && ratioAnalysis < 0.05) {
    lines.push(
      "【推定】Visionジョブがほぼ回っていないか、極少数です。`pnpm run oliveyoung:analyze-product-images` を十分な件数で実行すると、画像なしは減ります（現状は Web が未解析を出さない設計のため正常挙動）。"
    );
    lines.push("→ 次の一手: 全件またはバッチで解析を進める（判断 A に近いが、先に実行量を増やす段階）。");
    return lines.join("\n");
  }

  if (ratioAnalysis >= 0.1 && ratioSafe < 0.05) {
    lines.push(
      "【推定】解析済みドキュメントはあるが safeImageUrl がほとんど無い。containsPerson 判定や OY URL 判定（isOyStyle）が厳しめの可能性（判断 B を検討）。"
    );
    return lines.join("\n");
  }

  if (ratioSafe >= 0.1) {
    lines.push(
      "【推定】safeImageUrl が一定数ある。残りは未実行分の可能性が高い → 全件解析を進める（判断 A）。"
    );
    return lines.join("\n");
  }

  lines.push(
    "【推定】中間状態。サンプル JSON の imageAnalysis を見て、人物フラグの付き方を確認してください。"
  );
  return lines.join("\n");
}

export async function runImageAnalysisStats(): Promise<void> {
  const db = getDb();
  console.log("[IMAGE_ANALYSIS_STATS] scanning collection=", COLLECTION);

  const snap = await db.collection(COLLECTION).get();

  const stats: Stats = {
    total: 0,
    safeImageUrlCount: 0,
    hasSafeProductImageCount: 0,
    imageAnalysisCount: 0,
    analyzedButNoSafeImageCount: 0,
    imageVisionAnalyzedAtCount: 0,
  };

  const docRows: { id: string; data: Record<string, unknown> }[] = [];

  for (const doc of snap.docs) {
    stats.total += 1;
    const data = doc.data() as Record<string, unknown>;
    docRows.push({ id: doc.id, data });

    if (hasNonEmptySafeImageUrl(data)) stats.safeImageUrlCount += 1;
    if (data.hasSafeProductImage === true) stats.hasSafeProductImageCount += 1;
    if (hasImageAnalysisArray(data)) {
      stats.imageAnalysisCount += 1;
      if (!hasNonEmptySafeImageUrl(data)) {
        stats.analyzedButNoSafeImageCount += 1;
      }
    }
    if (data.imageVisionAnalyzedAt != null) stats.imageVisionAnalyzedAtCount += 1;
  }

  console.log("\n=== AGGREGATE (oliveyoung_products_public) ===\n");
  console.log(JSON.stringify(stats, null, 2));

  const samples = pickSamples(docRows, 5);
  console.log("\n=== SAMPLE PRODUCTS (max 5; imageAnalysis 優先 → raw 画像ありで safe 空) ===\n");
  for (const s of samples) {
    console.log(JSON.stringify(s, null, 2));
    console.log("---");
  }

  console.log("\n=== VISION JOB 実行状況（Firestore から分かる範囲） ===\n");
  console.log(
    [
      "- ジョブ本体の成功/失敗件数は Cloud Run / ローカルログの [IMAGE_VISION_OK] / [IMAGE_VISION_FAIL] を参照。",
      `- 本集計の imageVisionAnalyzedAtCount=${stats.imageVisionAnalyzedAtCount} は「少なくとも1回 merge された」ドキュメント数の目安。`,
      `- imageAnalysisCount=${stats.imageAnalysisCount} は配列が1件以上入っているドキュメント数。`,
      `- ジョブを 10〜25 件だけ回している場合、total に対して上記が小さいのは正常。`,
    ].join("\n")
  );

  console.log("\n=== 暫定判断のヒント ===\n");
  console.log(recommendationText(stats));
  console.log("");
}

async function main(): Promise<void> {
  await runImageAnalysisStats();
}

main().catch((e) => {
  console.error("[IMAGE_ANALYSIS_STATS_ERROR]", e);
  process.exit(1);
});
