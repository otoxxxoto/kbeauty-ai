import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";

const BUCKET = process.env.GCS_BUCKET ?? "";
const PREFIX = (process.env.GCS_PREFIX ?? "oliveyoung/ingredients").replace(/\/+$/, "");
const INDEX_FILE = "index.json";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!BUCKET) {
    return NextResponse.json(
      { error: "GCS bucket not configured (GCS_BUCKET)" },
      { status: 500, headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=60" } }
    );
  }

  const destination = PREFIX ? `${PREFIX}/${INDEX_FILE}` : INDEX_FILE;

  try {
    const projectId = process.env.GCP_PROJECT_ID ?? undefined;
    const storage = new Storage(projectId ? { projectId } : {});
    const file = storage.bucket(BUCKET).file(destination);
    const [contents] = await file.download();
    const data = JSON.parse(contents.toString("utf8"));
    return NextResponse.json(data, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=300" },
    });
  } catch (e: unknown) {
    const err = e as { code?: number; statusCode?: number };
    if (err?.code === 404 || err?.statusCode === 404) {
      return NextResponse.json(
        { updatedAt: new Date().toISOString(), items: [] },
        { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=60" } }
      );
    }
    console.error("[api/oliveyoung/ingredients/index] GCS error", err?.code ?? e);
    return NextResponse.json(
      { error: "GCS read failed" },
      { status: 500, headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=60" } }
    );
  }
}
