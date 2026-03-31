import { getRankingByDate, getRankingRunDates } from "@/lib/oliveyoung-rankings";
import { getOliveYoungProductByGoodsNo } from "@/lib/oliveyoung-products";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import { resolveProductImageForDisplay } from "@/lib/getProductImage";
import { getDisplayBrand, getDisplayName } from "@/lib/oliveyoung-products";
import { UploadManualImageForm } from "./upload-form";

async function getFallbackItems(limit: number) {
  const runDates = await getRankingRunDates();
  const runDate = runDates[0] ?? null;
  if (!runDate) return { runDate: null, items: [] as any[] };

  const ranking = await getRankingByDate(runDate);
  if (!ranking) return { runDate, items: [] as any[] };

  const slice = ranking.items.slice(0, limit);
  const out: Array<{
    goodsNo: string;
    rank: number;
    name: string;
    brand: string;
    imagePolicy: string;
    manualImageUrl: string | null;
  }> = [];

  for (const row of slice) {
    const detail = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (!detail) continue;
    const plain = serializeProductImageFieldsForClient(detail as any);
    const pipe = resolveProductImageForDisplay(plain, { goodsNo: detail.goodsNo });
    if (pipe.imagePolicy !== "fallback_no_image") continue;
    out.push({
      goodsNo: detail.goodsNo,
      rank: row.rank,
      name: getDisplayName(detail),
      brand: getDisplayBrand(detail),
      imagePolicy: pipe.imagePolicy,
      manualImageUrl: detail.manualImageUrl ?? null,
    });
  }

  return { runDate, items: out };
}

export default async function AdminImageReviewPage() {
  const { runDate, items } = await getFallbackItems(100);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 text-2xl font-bold text-zinc-900">
        画像レビュー（fallback_no_image 対象）
      </h1>
      {runDate ? (
        <p className="mb-4 text-sm text-zinc-600">対象日: {runDate}</p>
      ) : (
        <p className="mb-4 text-sm text-zinc-600">ランキングデータがありません。</p>
      )}
      <p className="mb-6 text-sm text-zinc-600">
        fallback_no_image になっている商品に対して、手動で画像をアップロードできます。
      </p>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <AdminImageCard key={item.goodsNo} item={item} />
        ))}
      </div>
    </div>
  );
}

type AdminItem = Awaited<ReturnType<typeof getFallbackItems>>["items"][number];

function AdminImageCard({ item }: { item: AdminItem }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-[2rem] items-center justify-center rounded bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700">
          #{item.rank}
        </span>
        <span className="truncate text-xs text-zinc-500">{item.goodsNo}</span>
      </div>
      <div className="text-xs font-medium text-zinc-500">{item.brand}</div>
      <div className="line-clamp-2 text-xs text-zinc-800">{item.name}</div>
      <div className="mt-2 h-32">
        {/* 簡易表示: manualImage があればそれを、なければ placeholder 相当のカード */}
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded bg-zinc-100">
          {item.manualImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.manualImageUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-zinc-500">手動画像なし</span>
          )}
        </div>
      </div>
      <UploadManualImageForm goodsNo={item.goodsNo} />
    </div>
  );
}
