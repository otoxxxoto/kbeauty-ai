import Link from "next/link";
import { loadIngredientDict } from "@kbeauty-ai/core";

/**
 * タグ一覧（Top100 辞書から）
 * 各タグをクリックで /oliveyoung/tags/[tag] へ
 */
export default async function TagsPage() {
  const dict = loadIngredientDict();

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-bold">OliveYoung タグ一覧</h1>
      <p className="text-sm text-zinc-600 mt-1">
        Top100 辞書の成分タグ。クリックで該当商品一覧へ
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {dict.map((entry) => (
          <Link
            key={entry.id}
            href={`/oliveyoung/tags/${entry.id}`}
            className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded text-sm"
          >
            {entry.display_ja} ({entry.id})
          </Link>
        ))}
      </div>
    </div>
  );
}
