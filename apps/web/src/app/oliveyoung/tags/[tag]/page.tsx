import Link from "next/link";
import { getProductsByTag } from "@/lib/oliveyoung/getProductsByTag";

type PageProps = {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ mode?: string }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { tag } = await params;
  const { mode: modeParam } = await searchParams;
  const tagUpper = String(tag || "").toUpperCase();
  const mode = modeParam === "recent" ? "recent" : "rank";

  const items = await getProductsByTag(tagUpper, mode);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold">OliveYoung Tag: {tagUpper}</h1>

      <div className="flex gap-3 my-4">
        <Link
          href={`/oliveyoung/tags/${tagUpper}?mode=rank`}
          className={`px-3 py-1 rounded text-sm ${
            mode === "rank"
              ? "bg-zinc-800 text-white"
              : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
          }`}
        >
          rank
        </Link>
        <Link
          href={`/oliveyoung/tags/${tagUpper}?mode=recent`}
          className={`px-3 py-1 rounded text-sm ${
            mode === "recent"
              ? "bg-zinc-800 text-white"
              : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
          }`}
        >
          recent
        </Link>
      </div>

      {items.length === 0 && <p className="text-zinc-500">no items</p>}

      <div className="flex flex-col gap-3">
        {items.map((p) => (
          <div
            key={p.goodsNo}
            className="border border-zinc-200 rounded-lg p-4 hover:border-zinc-300"
          >
            <div className="font-semibold">
              {typeof p.rank === "number" && `#${p.rank} `}
              <Link
                href={`/oliveyoung/products/${p.goodsNo}`}
                className="text-blue-600 hover:underline"
              >
                {p.name || p.goodsNo}
              </Link>
            </div>
            <div className="text-sm text-zinc-600">{p.brand ?? "-"}</div>
            <div className="text-xs text-zinc-500 font-mono mt-0.5">
              {p.goodsNo}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              updatedAt:{" "}
              {p.updatedAt?.toDate?.()?.toISOString?.()?.slice(0, 19) ?? "-"}
            </div>
            {p.qoo10Url && (
              <div className="mt-2">
                <a
                  href={p.qoo10Url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Qoo10 ↗
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
