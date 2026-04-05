/**
 * 手動ブランド名の一括保存（同一 brand または同一 brandJa の全商品へ反映）。
 *
 * 保存時に isBrandManuallyEdited: true を立てる。将来、クローラー等が oliveyoung_products_public を更新するときは
 * このフラグが true のドキュメントでは brandJa（および表示に使うブランド文字列）を機械更新で上書きしないこと。
 */
import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "@/lib/firestore";
import { revalidatePath } from "next/cache";
import { getRankingRunDates } from "@/lib/oliveyoung-rankings";

const COLLECTION = "oliveyoung_products_public";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MatchedBy = "brand" | "brandJa" | "brand_or_brandJa";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const goodsNo = String(body.goodsNo ?? "").trim();
    const manualBrandJa =
      typeof body.manualBrandJa === "string"
        ? body.manualBrandJa.trim()
        : "";

    if (!goodsNo) {
      return NextResponse.json(
        { ok: false, error: "goodsNo is required" },
        { status: 400 }
      );
    }
    if (!manualBrandJa) {
      return NextResponse.json(
        { ok: false, error: "manualBrandJa is required" },
        { status: 400 }
      );
    }

    const srcRef = db.collection(COLLECTION).doc(goodsNo);
    const srcSnap = await srcRef.get();
    if (!srcSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "product_not_found" },
        { status: 404 }
      );
    }

    const src = srcSnap.data() ?? {};
    const srcBrand = String(src.brand ?? "").trim();
    const srcBrandJa = src.brandJa != null ? String(src.brandJa).trim() : "";

    if (!srcBrand && !srcBrandJa) {
      return NextResponse.json(
        {
          ok: false,
          error: "source_has_no_brand_or_brandJa",
        },
        { status: 400 }
      );
    }

    const idSet = new Set<string>();

    if (srcBrand) {
      const qBrand = await db
        .collection(COLLECTION)
        .where("brand", "==", srcBrand)
        .get();
      for (const d of qBrand.docs) idSet.add(d.id);
    }

    if (srcBrandJa) {
      const qJa = await db
        .collection(COLLECTION)
        .where("brandJa", "==", srcBrandJa)
        .get();
      for (const d of qJa.docs) idSet.add(d.id);
    }

    const ids = [...idSet];
    const matchedBy: MatchedBy =
      srcBrand && srcBrandJa
        ? "brand_or_brandJa"
        : srcBrand
          ? "brand"
          : "brandJa";

    const ts = admin.firestore.FieldValue.serverTimestamp();
    const fields = {
      manualBrandJa,
      isBrandManuallyEdited: true,
      manualBrandUpdatedAt: ts,
    };

    let batch = db.batch();
    let ops = 0;
    for (const id of ids) {
      batch.set(db.collection(COLLECTION).doc(id), fields, { merge: true });
      ops++;
      if (ops >= 500) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) {
      await batch.commit();
    }

    const updatedCount = ids.length;

    let runDate: string | null = null;
    try {
      const runDates = await getRankingRunDates();
      runDate = runDates[0] ?? null;
    } catch (e) {
      console.error("[BRAND_REVALIDATE] failed to load runDates", {
        goodsNo,
        error: (e as { message?: string })?.message ?? String(e),
      });
    }

    const paths: string[] = ["/oliveyoung"];
    if (runDate) {
      paths.push(`/oliveyoung/rankings/${runDate}`);
    }
    for (const pth of paths) {
      try {
        revalidatePath(pth);
      } catch (e) {
        console.error("[BRAND_REVALIDATE_ERROR]", {
          path: pth,
          error: (e as { message?: string })?.message ?? String(e),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      updatedCount,
      matchedBy,
    });
  } catch (err) {
    const e = err as { message?: string };
    console.error("[admin/brand-name/update]", {
      error: e?.message ?? String(err),
    });
    return NextResponse.json(
      { ok: false, error: "update_failed" },
      { status: 500 }
    );
  }
}
