/**
 * 商品詳細ページのショップCTAクリックログ
 * POST body: { goodsNo: string, shop: string }
 * Firestore product_click_logs に { goodsNo, shop, createdAt } を保存
 */
import * as admin from "firebase-admin";
import { NextResponse } from "next/server";
import { db } from "@/lib/firestore";

const ALLOWED_SHOPS = ["oliveyoung", "amazon", "rakuten", "qoo10"] as const;
const COLLECTION = "product_click_logs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const goodsNo =
      typeof body?.goodsNo === "string" ? body.goodsNo.trim() : "";
    const shop =
      typeof body?.shop === "string" ? body.shop.toLowerCase().trim() : "";

    if (!goodsNo || !ALLOWED_SHOPS.includes(shop as (typeof ALLOWED_SHOPS)[number])) {
      return NextResponse.json(
        { error: "invalid goodsNo or shop" },
        { status: 400 }
      );
    }

    await db.collection(COLLECTION).add({
      goodsNo,
      shop,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[log-product-click]", err);
    return NextResponse.json(
      { error: "failed to log" },
      { status: 500 }
    );
  }
}
