import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "@/lib/firestore";
import { revalidatePath } from "next/cache";
import { getRankingRunDates } from "@/lib/oliveyoung-rankings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const goodsNo = String(body.goodsNo ?? "").trim();
    const manualNameJa =
      typeof body.manualNameJa === "string"
        ? body.manualNameJa.trim()
        : "";

    if (!goodsNo) {
      return NextResponse.json(
        { ok: false, error: "goodsNo is required" },
        { status: 400 }
      );
    }

    const docRef = db.collection("oliveyoung_products_public").doc(goodsNo);
    await docRef.set(
      {
        manualNameJa: manualNameJa || null,
        manualNameUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    let runDate: string | null = null;
    try {
      const runDates = await getRankingRunDates();
      runDate = runDates[0] ?? null;
    } catch (e) {
      console.error("[NAME_REVALIDATE_START] failed to load runDates", {
        goodsNo,
        error: (e as any)?.message ?? String(e),
      });
    }

    const paths: string[] = ["/oliveyoung", `/oliveyoung/products/${goodsNo}`];
    if (runDate) {
      paths.push(`/oliveyoung/rankings/${runDate}`);
    }

    console.error("[NAME_REVALIDATE_START]", { goodsNo, runDate, paths });
    for (const pth of paths) {
      try {
        revalidatePath(pth);
        console.error("[NAME_REVALIDATE_OK]", { path: pth, goodsNo, runDate });
      } catch (e) {
        console.error("[NAME_REVALIDATE_ERROR]", {
          path: pth,
          goodsNo,
          runDate,
          error: (e as any)?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = err as { message?: string };
    console.error("[admin/product-name/update]", {
      error: e?.message ?? String(err),
    });
    return NextResponse.json(
      { ok: false, error: "update_failed" },
      { status: 500 }
    );
  }
}

