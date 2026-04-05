import Link from "next/link";
import { getRankingByDate, getRankingRunDates } from "@/lib/oliveyoung-rankings";
import { getOliveYoungProductByGoodsNo } from "@/lib/oliveyoung-products";
import { serializeProductImageFieldsForClient } from "@/lib/serialize-product-for-client";
import { resolveProductImageForDisplay } from "@/lib/getProductImage";
import { getDisplayBrand, getDisplayName } from "@/lib/oliveyoung-products";
import { UploadManualImageForm } from "./upload-form";
import { ManualNameForm } from "./name-form";
import { ManualBrandForm } from "./brand-form";

type ImageKind = "official" | "non_official" | "fallback";
type FilterKind = "fallback_only" | "non_official_only" | "all";

function classifyImageKind(imageSource: string): ImageKind {
  if (
    imageSource === "manual_image" ||
    imageSource === "oliveyoung" ||
    imageSource === "display:safe_image" ||
    imageSource === "display:oy_official_safe"
  ) {
    return "official";
  }
  if (
    imageSource === "amazon" ||
    imageSource === "rakuten" ||
    imageSource === "qoo10" ||
    imageSource === "display:marketplace_strong"
  ) {
    return "non_official";
  }
  return "fallback";
}

async function getReviewItems(limit: number, filter: FilterKind) {
  const runDates = await getRankingRunDates();
  const runDate = runDates[0] ?? null;
  if (!runDate) return { runDate: null as string | null, items: [] as AdminItem[] };

  const ranking = await getRankingByDate(runDate);
  if (!ranking) return { runDate, items: [] as AdminItem[] };

  const slice = ranking.items.slice(0, limit);
  const out: AdminItem[] = [];

  for (const row of slice) {
    const detail = await getOliveYoungProductByGoodsNo(row.goodsNo);
    if (!detail) continue;
    const plain = serializeProductImageFieldsForClient(detail as any);
    const pipe = resolveProductImageForDisplay(plain, { goodsNo: detail.goodsNo });
    const kind = classifyImageKind(pipe.imageSource);

    if (filter === "fallback_only" && kind !== "fallback") continue;
    if (filter === "non_official_only" && kind !== "non_official") continue;

    out.push({
      goodsNo: detail.goodsNo,
      rank: row.rank,
      name: getDisplayName(detail),
      brand: getDisplayBrand(detail),
      imagePolicy: pipe.imagePolicy,
      imageSource: pipe.imageSource,
      imageKind: kind,
      displayImageUrl: pipe.url,
      manualImageUrl: detail.manualImageUrl ?? null,
      manualNameJa: detail.manualNameJa ?? null,
      manualBrandJa: detail.manualBrandJa ?? null,
    });
  }

  return { runDate, items: out };
}

type PageProps = {
  searchParams: Promise<{ filter?: FilterKind }>;
};

type AdminItem = {
  goodsNo: string;
  rank: number;
  name: string;
  brand: string;
  imagePolicy: string;
  imageSource: string;
  imageKind: ImageKind;
  displayImageUrl: string;
  manualImageUrl: string | null;
  manualNameJa?: string | null;
  manualBrandJa?: string | null;
};

export default async function AdminImageReviewPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filter: FilterKind = sp?.filter ?? "non_official_only";
  const { runDate, items } = await getReviewItems(100, filter);

  const FILTER_LABELS: { value: FilterKind; label: string }[] = [
    { value: "non_official_only", label: "非公式画像のみ" },
    { value: "fallback_only", label: "fallbackのみ" },
    { value: "all", label: "すべて" },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-4 text-2xl font-bold text-zinc-900">画像レビュー</h1>
      {runDate ? (
        <p className="mb-2 text-sm text-zinc-600">対象日: {runDate}</p>
      ) : (
        <p className="mb-2 text-sm text-zinc-600">ランキングデータがありません。</p>
      )}
      <p className="mb-4 text-sm text-zinc-600">
        公式画像以外を使っている商品や、fallback_no_image の商品に対して、手動で画像をアップロードできます。
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500">フィルタ:</span>
        {FILTER_LABELS.map((opt) => {
          const isActive = filter === opt.value;
          return (
            <Link
              key={opt.value}
              href={`/oliveyoung/admin/image-review?filter=${opt.value}`}
              className={`inline-flex items-center rounded-full border px-3 py-1 ${
                isActive
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <AdminImageCard key={item.goodsNo} item={item} />
        ))}
      </div>
    </div>
  );
}

function AdminImageCard({ item }: { item: AdminItem }) {
  const hasManual = Boolean((item.manualImageUrl ?? "").trim());
  const hasManualName = Boolean((item.manualNameJa ?? "").trim());
  const hasManualBrand = Boolean((item.manualBrandJa ?? "").trim());
  const kindLabel =
    item.imageKind === "official"
      ? "公式画像"
      : item.imageKind === "non_official"
        ? "非公式画像"
        : "fallback";

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-sm"
      data-image-source={item.imageSource}
      data-image-kind={item.imageKind}
      data-manual-name={hasManualName ? "yes" : "no"}
      data-manual-brand={hasManualBrand ? "yes" : "no"}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-[2rem] items-center justify-center rounded bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700">
          #{item.rank}
        </span>
        <span className="truncate text-xs text-zinc-500">{item.goodsNo}</span>
      </div>
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="truncate font-medium text-zinc-500">{item.brand}</span>
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            item.imageKind === "official"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : item.imageKind === "non_official"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {item.imageSource}
        </span>
      </div>
      <div className="line-clamp-2 text-xs text-zinc-800">{item.name}</div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{kindLabel}</span>
        <span>
          {hasManual ? "manual画像あり" : "manual画像なし"} /{" "}
          {hasManualName ? "manual名あり" : "manual名なし"} /{" "}
          {hasManualBrand ? "manualブランドあり" : "manualブランドなし"}
        </span>
      </div>
      <div className="mt-2 h-32">
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded bg-zinc-100">
          {item.displayImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.displayImageUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-zinc-500">画像なし</span>
          )}
        </div>
      </div>
      <UploadManualImageForm goodsNo={item.goodsNo} />
      <ManualNameForm
        goodsNo={item.goodsNo}
        initialName={item.manualNameJa ?? item.name ?? ""}
      />
      <ManualBrandForm
        goodsNo={item.goodsNo}
        displayBrand={item.brand}
        initialManualBrand={(item.manualBrandJa ?? "").trim()}
      />
    </div>
  );
}
