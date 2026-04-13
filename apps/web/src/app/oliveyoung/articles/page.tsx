import Link from "next/link";
import {
  getArticleIndexKind,
  getArticleSlugsSortedForIndex,
  getArticleSpecBySlug,
} from "@/lib/oliveyoung-articles";
import { getPublicSiteBaseUrl } from "@/lib/public-site-base-url";

export function generateMetadata() {
  const base = getPublicSiteBaseUrl();
  const path = "/oliveyoung/articles";
  const url = `${base}${path}`;
  const title = "比較記事一覧 | Olive Young ランキング";
  const description =
    "韓国コスメのランキング比較記事一覧。セラム・クリーム・トナーなど、カテゴリ別のおすすめをまとめています。";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

/**
 * 比較記事の索引（内部リンク・クロール導線用）
 */
export default function OliveYoungArticlesIndexPage() {
  const slugs = getArticleSlugsSortedForIndex();

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-3xl space-y-8 p-6">
        <header>
          <h1 className="text-2xl font-bold text-zinc-900">比較記事一覧</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Olive Young ランキングをもとにしたカテゴリ別の比較記事です。
          </p>
        </header>

        <ul className="space-y-4">
          {slugs.map((slug) => {
            const spec = getArticleSpecBySlug(slug);
            if (!spec) return null;
            const kind = getArticleIndexKind(spec);
            return (
              <li
                key={slug}
                className="rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {kind}
                  </span>
                </div>
                <Link
                  href={`/oliveyoung/articles/${slug}`}
                  className="mt-2 block text-base font-semibold text-blue-700 hover:underline"
                >
                  {spec.title}
                </Link>
                <p className="mt-1 text-sm text-zinc-600">{spec.description}</p>
              </li>
            );
          })}
        </ul>

        <p className="text-sm">
          <Link href="/oliveyoung" className="text-blue-600 hover:underline">
            ← Olive Young トップへ
          </Link>
        </p>
      </div>
    </div>
  );
}
