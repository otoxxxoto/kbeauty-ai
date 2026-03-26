import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";

/**
 * ローカルで GCS を読むための作業ガイド（GCP 側の手順）
 * ----------------------------------------
 * 1. GCP コンソールでサービスアカウントを作成
 * 2. キー（JSON）をダウンロード
 * 3. 対象バケットに Storage Object Viewer (roles/storage.objectViewer) を付与
 * 4. 環境変数 GOOGLE_APPLICATION_CREDENTIALS にキーファイルのパスを設定
 * 5. apps/web/.env.local に以下を設定（サーバのみ参照するため NEXT_PUBLIC_* は不要）
 *    GCS_BUCKET=kbeauty-ai-data
 *    GCS_PREFIX=oliveyoung/ingredients
 *    GCP_PROJECT_ID=（任意）
 */

const BUCKET = process.env.GCS_BUCKET ?? "";
const PREFIX = (process.env.GCS_PREFIX ?? "oliveyoung/ingredients").replace(/\/+$/, "");

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApiBody =
  | { ok: true; goodsNo: string; data: unknown }
  | { ok: false; goodsNo: string; error: string };

function json(body: ApiBody, status: number, cacheControl: string): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ goodsNo: string }> }
) {
  const goodsNo = decodeURIComponent((await context.params).goodsNo ?? "")
    .trim()
    .split(/[,\s]+/)[0];

  if (!goodsNo) {
    return json(
      { ok: false, goodsNo: "", error: "goodsNo required" },
      400,
      "s-maxage=60, stale-while-revalidate=60"
    );
  }

  if (!BUCKET) {
    return json(
      { ok: false, goodsNo, error: "GCS bucket not configured (GCS_BUCKET)" },
      500,
      "s-maxage=60, stale-while-revalidate=60"
    );
  }

  const destination = PREFIX ? `${PREFIX}/${goodsNo}.json` : `${goodsNo}.json`;

  try {
    const projectId = process.env.GCP_PROJECT_ID ?? undefined;
    const storage = new Storage(projectId ? { projectId } : {});
    const file = storage.bucket(BUCKET).file(destination);
    const [contents] = await file.download();
    const raw = contents.toString("utf8");

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      console.error("[api/oliveyoung/ingredients] JSON parse failed", {
        goodsNo,
        destination: `${BUCKET}/${destination}`,
      });
      return json(
        { ok: false, goodsNo, error: "Invalid JSON from upstream" },
        502,
        "s-maxage=60, stale-while-revalidate=60"
      );
    }

    return json(
      { ok: true, goodsNo, data },
      200,
      "s-maxage=300, stale-while-revalidate=300"
    );
  } catch (e: unknown) {
    const err = e as { code?: number; statusCode?: number; message?: string };
    const is404 = err?.code === 404 || err?.statusCode === 404;

    if (is404) {
      return json(
        { ok: false, goodsNo, error: "not_found" },
        404,
        "s-maxage=60, stale-while-revalidate=60"
      );
    }

    console.error("[api/oliveyoung/ingredients] GCS error", {
      goodsNo,
      destination: `${BUCKET}/${destination}`,
      code: err?.code ?? err?.statusCode,
      message: err?.message ?? String(e),
    });
    return json(
      { ok: false, goodsNo, error: err?.message ?? "GCS read failed" },
      500,
      "s-maxage=60, stale-while-revalidate=60"
    );
  }
}
