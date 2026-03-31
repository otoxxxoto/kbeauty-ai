import { Storage } from "@google-cloud/storage";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import * as admin from "firebase-admin";
import { db } from "@/lib/firestore";
import { getRankingRunDates } from "@/lib/oliveyoung-rankings";

const BUCKET = process.env.GCS_BUCKET ?? "";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    if (!BUCKET) {
      return NextResponse.json(
        { ok: false, error: "GCS bucket not configured (GCS_BUCKET)" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const goodsNo = String(formData.get("goodsNo") ?? "").trim();
    const file = formData.get("file");

    if (!goodsNo || !(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "goodsNo and file are required" },
        { status: 400 }
      );
    }

    const destination = `product-images/manual/${goodsNo}.jpg`;
    const projectId = process.env.GCP_PROJECT_ID ?? undefined;
    const storage = new Storage(projectId ? { projectId } : {});
    const bucket = storage.bucket(BUCKET);
    const gcsFile = bucket.file(destination);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await gcsFile.save(buffer, {
      contentType: file.type || "image/jpeg",
      resumable: false,
    });

    // バケット側の公開設定を前提とし、公開URLは従来どおりに組み立てる

    const imageUrl = `https://storage.googleapis.com/${BUCKET}/${destination}`;

    await db
      .collection("oliveyoung_products_public")
      .doc(goodsNo)
      .set(
        {
          manualImageUrl: imageUrl,
          manualImageSource: "upload",
          manualImageUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    let runDate: string | null = null;
    try {
      const runDates = await getRankingRunDates();
      runDate = runDates[0] ?? null;
    } catch (e) {
      console.error("[REVALIDATE_START] failed to load runDates", {
        bucket: BUCKET,
        goodsNo,
        error: (e as any)?.message ?? String(e),
      });
    }

    const paths: string[] = ["/oliveyoung", `/oliveyoung/products/${goodsNo}`];
    if (runDate) {
      paths.push(`/oliveyoung/rankings/${runDate}`);
    }

    console.error("[REVALIDATE_START]", { goodsNo, runDate, paths });
    for (const pth of paths) {
      try {
        revalidatePath(pth);
        console.error("[REVALIDATE_OK]", { path: pth, goodsNo, runDate });
      } catch (e) {
        console.error("[REVALIDATE_ERROR]", {
          path: pth,
          goodsNo,
          runDate,
          error: (e as any)?.message ?? String(e),
        });
      }
    }

    console.error("[UPLOAD_TO_GCS_OK]", {
      bucket: BUCKET,
      path: destination,
      goodsNo,
      runDate,
    });

    return NextResponse.json({ ok: true, imageUrl });
  } catch (err) {
    const e = err as { message?: string };
    console.error("[admin/product-image/upload]", {
      bucket: BUCKET,
      path: (err as any)?.path ?? null,
      error: e?.message ?? String(err),
    });
    return NextResponse.json(
      { ok: false, error: "upload_failed" },
      { status: 500 }
    );
  }
}

