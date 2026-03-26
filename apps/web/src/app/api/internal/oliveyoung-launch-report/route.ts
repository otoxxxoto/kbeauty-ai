import { NextResponse } from "next/server";
import { getAllOliveYoungProductsMinimal } from "@/lib/oliveyoung-products";
import { computeOliveYoungLaunchReport } from "@/lib/oliveyoung-launch-report";
import {
  buildPublicSurfaceGoodsIndex,
  mergePublicSurfaceGoodsNos,
} from "@/lib/oliveyoung-public-surface";

/**
 * 公開前レポート JSON。`INTERNAL_LAUNCH_REPORT_SECRET` と一致する Bearer または ?secret= のみ許可。
 * 本番では必ず強いシークレットを設定すること。
 */
export async function GET(request: Request) {
  const secret = process.env.INTERNAL_LAUNCH_REPORT_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "INTERNAL_LAUNCH_REPORT_SECRET is not configured" },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const qp = new URL(request.url).searchParams.get("secret")?.trim();
  const token = bearer || qp;
  if (!token || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const products = await getAllOliveYoungProductsMinimal();
  const surfaceIndex = await buildPublicSurfaceGoodsIndex(products);
  const publicSurfaceGoods = mergePublicSurfaceGoodsNos(surfaceIndex);
  const report = computeOliveYoungLaunchReport(products, { publicSurfaceGoods });
  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
