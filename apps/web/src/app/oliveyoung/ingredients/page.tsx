"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type IndexItem = {
  goodsNo: string;
  publicPath: string;
  collectedAt: string;
  hasIngredients: boolean;
};

type IndexData = {
  updatedAt: string;
  items: IndexItem[];
};

export default function OliveYoungIngredientsIndexPage() {
  const [data, setData] = useState<IndexData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const url = `${base}/api/oliveyoung/ingredients/index`;
    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((body: IndexData & { error?: string }) => {
        if (body.error) {
          setError(body.error);
          setData(null);
        } else {
          setData({
            updatedAt: body.updatedAt ?? "",
            items: Array.isArray(body.items) ? body.items : [],
          });
          setError(null);
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setData(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const items = data?.items ?? [];
  const filtered =
    filter.trim() === ""
      ? items
      : items.filter((i) =>
          i.goodsNo.toLowerCase().includes(filter.trim().toLowerCase())
        );

  return (
    <main className="p-6 max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Olive Young 成分一覧</h1>
      <p className="text-sm flex gap-4">
        <Link href="/oliveyoung" className="text-blue-600 hover:underline">
          ← 商品ランキング
        </Link>
        <Link href="/oliveyoung/tags" className="text-blue-600 hover:underline">
          タグ一覧 →
        </Link>
        <Link href="/oliveyoung/brands" className="text-blue-600 hover:underline">
          ブランドランキング →
        </Link>
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="filter" className="text-sm font-medium">
          goodsNo で絞り込み
        </label>
        <input
          id="filter"
          type="text"
          placeholder="例: A000000184228"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-zinc-300 rounded px-3 py-2 text-sm"
        />
      </div>

      {loading && <p className="text-zinc-500">読み込み中...</p>}
      {error && (
        <div className="p-4 bg-red-50 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          <p className="text-sm text-zinc-500">
            index 更新: {data.updatedAt} / 件数: {filtered.length}
            {filter.trim() ? `（フィルタ: ${filter}）` : ""}
          </p>
          <ul className="space-y-2">
            {filtered.map((item) => (
              <li
                key={item.goodsNo}
                className="flex items-center gap-3 py-2 border-b border-zinc-200"
              >
                <Link
                  href={item.publicPath}
                  className="font-mono text-blue-600 underline"
                >
                  {item.goodsNo}
                </Link>
                <span className="text-xs text-zinc-500">
                  {item.collectedAt.slice(0, 10)}
                </span>
                {item.hasIngredients ? (
                  <span className="text-xs text-green-600">成分あり</span>
                ) : (
                  <span className="text-xs text-amber-600">成分なし</span>
                )}
              </li>
            ))}
          </ul>
          {filtered.length === 0 && (
            <p className="text-zinc-500 text-sm">
              {items.length === 0
                ? "登録件数が0です。"
                : "該当する goodsNo がありません。"}
            </p>
          )}
        </>
      )}
    </main>
  );
}
