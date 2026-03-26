import Link from "next/link";
import { redirect } from "next/navigation";
import { getLatestBrandRanking, getBrandRankingRunDates } from "@/lib/brand-rankings";

/**
 * /oliveyoung/brands … 最新 runDate を表示（最新日へリダイレクト）
 */
export default async function BrandsPage() {
  const latest = await getLatestBrandRanking();
  if (latest) {
    redirect(`/oliveyoung/brands/${latest.runDate}`);
  }

  const runDates = await getBrandRankingRunDates();
  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold">Olive Young ブランド 랭킹</h1>
      <p className="mt-2 text-zinc-500">対象日のデータがありません。</p>
      {runDates.length > 0 ? (
        <p className="mt-2 text-sm">
          <Link href="/oliveyoung" className="text-blue-600 hover:underline">
            OliveYoung 一覧へ
          </Link>
        </p>
      ) : (
        <p className="mt-2 text-sm">
          <Link href="/oliveyoung" className="text-blue-600 hover:underline">
            OliveYoung 一覧へ
          </Link>
        </p>
      )}
    </div>
  );
}
