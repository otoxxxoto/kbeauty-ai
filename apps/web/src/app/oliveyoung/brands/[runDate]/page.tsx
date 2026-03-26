import Link from "next/link";
import {
  getBrandRankingByDate,
  getBrandRankingRunDates,
  getDisplayBrand,
} from "@/lib/brand-rankings";
import { notFound } from "next/navigation";

type PageProps = {
  params: Promise<{ runDate: string }>;
};

type TableRow = {
  brandKey: string;
  brand: string;
  brandJa?: string;
  count: number;
  bestRank: number;
  score: number;
  rank?: number;
  rankDiff?: number | null;
  isNew?: boolean;
};

function renderRankDiff(row: { rankDiff?: number | null; isNew?: boolean }) {
  if (row.isNew) {
    return (
      <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
        NEW
      </span>
    );
  }

  if (typeof row.rankDiff !== "number") {
    return <span className="text-zinc-400">-</span>;
  }

  if (row.rankDiff > 0) {
    return <span className="font-semibold text-green-700">▲{row.rankDiff}</span>;
  }

  if (row.rankDiff < 0) {
    return <span className="font-semibold text-red-700">▼{Math.abs(row.rankDiff)}</span>;
  }

  return <span className="text-zinc-400">-</span>;
}

export default async function BrandRankingByDatePage({ params }: PageProps) {
  const { runDate } = await params;
  const data = await getBrandRankingByDate(runDate);
  if (!data) notFound();

  const runDates = await getBrandRankingRunDates();
  const currentIndex = runDates.indexOf(runDate);
  const prevRunDate =
    currentIndex >= 0 && currentIndex < runDates.length - 1
      ? runDates[currentIndex + 1]
      : null;
  const nextRunDate = currentIndex > 0 ? runDates[currentIndex - 1] : null;
  const rows: TableRow[] = data.items as TableRow[];

  const risingBrands = rows
    .filter(
      (item) =>
        !item.isNew &&
        typeof item.rankDiff === "number" &&
        item.rankDiff > 0
    )
    .sort((a, b) => (b.rankDiff ?? 0) - (a.rankDiff ?? 0))
    .slice(0, 5);

  const newBrands = rows
    .filter((item) => item.isNew)
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .slice(0, 5);

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-bold">Olive Young ブランド 랭킹</h1>
      <p className="mt-1 text-zinc-600">対象日: {data.runDate}</p>
      <p className="text-sm text-zinc-500">総ブランド数: {data.totalBrands}</p>
      <p className="text-xs text-zinc-500 mt-1">
        前日比は前回集計時点のブランド順位との差です。NEW は前回未ランクインです。
      </p>

      <div className="flex gap-3 my-4 text-sm">
        <Link href="/oliveyoung/brands" className="text-blue-600 hover:underline">
          ← 最新
        </Link>
        {prevRunDate && (
          <Link
            href={`/oliveyoung/brands/${prevRunDate}`}
            className="text-blue-600 hover:underline"
          >
            ← {prevRunDate}
          </Link>
        )}
        {nextRunDate && (
          <Link
            href={`/oliveyoung/brands/${nextRunDate}`}
            className="text-blue-600 hover:underline"
          >
            {nextRunDate} →
          </Link>
        )}
        <Link href="/oliveyoung" className="text-blue-600 hover:underline">
          OliveYoung 一覧
        </Link>
      </div>

      {data.items.length === 0 ? (
        <p className="text-zinc-500">表示するブランドがありません。</p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-bold mb-3">急上昇ブランド TOP5</h2>
              {risingBrands.length === 0 ? (
                <p className="text-sm text-zinc-500">該当なし</p>
              ) : (
                <ul className="space-y-2">
                  {risingBrands.map((item) => (
                    <li
                      key={item.brandKey}
                      className="flex items-center justify-between text-sm"
                    >
                      <Link
                        href={`/oliveyoung/brands/${data.runDate}/${item.brandKey}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {getDisplayBrand(item)} ({item.brandKey})
                      </Link>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-green-700">
                          ▲{item.rankDiff}
                        </span>
                        <span className="text-zinc-500">#{item.rank}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-bold mb-3">NEWランクインブランド</h2>
              {newBrands.length === 0 ? (
                <p className="text-sm text-zinc-500">該当なし</p>
              ) : (
                <ul className="space-y-2">
                  {newBrands.map((item) => (
                    <li
                      key={item.brandKey}
                      className="flex items-center justify-between text-sm"
                    >
                      <Link
                        href={`/oliveyoung/brands/${data.runDate}/${item.brandKey}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {getDisplayBrand(item)} ({item.brandKey})
                      </Link>
                      <span className="flex items-center gap-2">
                        <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                          NEW
                        </span>
                        <span className="text-zinc-500">#{item.rank}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="overflow-x-auto border border-zinc-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-100 border-b border-zinc-200">
                <th className="text-left p-3 font-semibold">順位</th>
                <th className="text-left p-3 font-semibold">前日比</th>
                <th className="text-left p-3 font-semibold">ブランド</th>
                <th className="text-right p-3 font-semibold">ランクイン数</th>
                <th className="text-right p-3 font-semibold">最高順位</th>
                <th className="text-right p-3 font-semibold">スコア</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.brandKey}
                  className="border-b border-zinc-100 hover:bg-zinc-50"
                >
                  <td className="p-3">{row.rank ?? idx + 1}</td>
                  <td className="p-3">{renderRankDiff(row)}</td>
                  <td className="p-3 font-medium">
                    <Link
                      href={`/oliveyoung/brands/${data.runDate}/${row.brandKey}`}
                      className="text-blue-700 hover:underline"
                    >
                      {getDisplayBrand(row)} ({row.brandKey})
                    </Link>
                  </td>
                  <td className="p-3 text-right">{row.count}</td>
                  <td className="p-3 text-right">{row.bestRank}</td>
                  <td className="p-3 text-right">{row.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}