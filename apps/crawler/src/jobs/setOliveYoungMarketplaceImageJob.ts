/**
 * B 分類など「マーケット画像を手動で載せて Web 表示を埋める」用の単発更新。
 *
 * 重要: Web の resolveProductDisplayImageUrl は Amazon / 楽天 / Qoo10 について
 * **imageAnalysis 内に同一 URL があり containsPerson===false のときだけ**表示する。
 * そのため本ジョブはデフォルトで imageAnalysis にエントリを upsert する。
 *
 *   pnpm run oliveyoung:set-market-image -- --goods=A000000234422 --market=amazon --url="https://..."
 *   pnpm run oliveyoung:set-market-image -- --goods=A000000234422 --market=rakuten --url="https://..."
 *   pnpm run oliveyoung:set-market-image -- --goods=A000000234422 --market=qoo10 --url="https://..."
 *
 * safeImageUrl のみ（Vision 不要・analysis 不要）:
 *   pnpm run oliveyoung:set-market-image -- --goods=... --market=safe --url="https://..."
 *
 * imageAnalysis を触らない（非推奨・通常は表示されない）:
 *   ... --no-merge-analysis
 *
 * ドライラン:
 *   ... --dry-run
 */
import "dotenv/config";
import { FieldValue, Firestore } from "@google-cloud/firestore";

const COLLECTION = "oliveyoung_products_public";

type Market = "amazon" | "rakuten" | "qoo10" | "safe";

const FIELD_BY_MARKET: Record<Exclude<Market, "safe">, string> = {
  amazon: "amazonImage",
  rakuten: "rakutenImage",
  qoo10: "qoo10Image",
};

function getDb(): Firestore {
  const db = new Firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function getArg(argv: string[], key: string): string | undefined {
  const prefixed = argv.find((a) => a.startsWith(`${key}=`));
  if (prefixed) {
    const v = prefixed.slice(key.length + 1).trim();
    return v || undefined;
  }
  const i = argv.indexOf(key);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) {
    return argv[i + 1].trim() || undefined;
  }
  return undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function parseMarket(raw: string | undefined): Market | null {
  if (!raw) return null;
  const m = raw.trim().toLowerCase();
  if (m === "amazon" || m === "rakuten" || m === "qoo10" || m === "safe") return m;
  return null;
}

function mergeImageAnalysisEntry(
  existing: unknown,
  imageUrl: string,
  merge: boolean
): Record<string, unknown>[] | undefined {
  if (!merge) return undefined;
  const normalizedUrl = imageUrl.trim();
  const prev = Array.isArray(existing) ? existing : [];
  const kept = prev.filter((item) => {
    if (!item || typeof item !== "object") return true;
    const u = String((item as Record<string, unknown>).url ?? "").trim();
    return u !== normalizedUrl;
  });
  kept.push({
    url: normalizedUrl,
    containsPerson: false,
    confidence: 1,
    isPreferredProductImage: true,
    source: "manual_market_image_job",
  });
  return kept as Record<string, unknown>[];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const goodsNo = getArg(argv, "--goods");
  const market = parseMarket(getArg(argv, "--market"));
  const url = getArg(argv, "--url");
  const dryRun = hasFlag(argv, "--dry-run");
  const noMergeAnalysis = hasFlag(argv, "--no-merge-analysis");

  if (!goodsNo || !market || !url) {
    console.error(
      "[SET_MARKET_IMAGE_USAGE]",
      "pnpm run oliveyoung:set-market-image -- --goods=<goodsNo> --market=amazon|rakuten|qoo10|safe --url=<https://...> [--dry-run] [--no-merge-analysis]"
    );
    process.exit(1);
  }

  const trimmedUrl = url.trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    console.error("[SET_MARKET_IMAGE_ERROR]", "url は http(s) で始まる必要があります");
    process.exit(1);
  }

  const db = getDb();
  const ref = db.collection(COLLECTION).doc(goodsNo);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error("[SET_MARKET_IMAGE_ERROR]", "doc が存在しません", goodsNo);
    process.exit(1);
  }

  const data = snap.data() ?? {};

  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (market === "safe") {
    payload.safeImageUrl = trimmedUrl;
    payload.hasSafeProductImage = true;
  } else {
    const field = FIELD_BY_MARKET[market];
    payload[field] = trimmedUrl;
    const merged = mergeImageAnalysisEntry(
      data.imageAnalysis,
      trimmedUrl,
      !noMergeAnalysis
    );
    if (merged) {
      payload.imageAnalysis = merged;
    }
  }

  console.log("[SET_MARKET_IMAGE_PLAN]", {
    goodsNo,
    market,
    fields: Object.keys(payload).filter((k) => k !== "updatedAt"),
    mergeImageAnalysis: market !== "safe" && !noMergeAnalysis,
    dryRun,
  });

  if (dryRun) {
    console.log("[SET_MARKET_IMAGE_DRY_RUN]", JSON.stringify(payload, null, 2));
    return;
  }

  await ref.update(payload);
  console.log("[SET_MARKET_IMAGE_OK]", { goodsNo, market });
  console.log(
    "[SET_MARKET_IMAGE_NOTE]",
    market === "safe"
      ? "safeImageUrl を設定済み。TOP / 詳細 / カテゴリは resolve でそのまま使われます。"
      : noMergeAnalysis
        ? "警告: --no-merge-analysis のため Web で表示されない可能性が高いです（imageAnalysis に同一 URL・containsPerson:false が必要）。"
        : "マーケット画像フィールドと imageAnalysis を更新済み。ブラウザで /oliveyoung と商品詳細を確認してください。"
  );
}

main().catch((e) => {
  console.error("[SET_MARKET_IMAGE_ERROR]", e);
  process.exit(1);
});
