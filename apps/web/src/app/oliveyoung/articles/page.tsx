import Link from "next/link";
import {
  getArticleIndexKind,
  getArticleSlugsSortedForIndex,
  getArticleSpecBySlug,
} from "@/lib/oliveyoung-articles";
import { CATEGORY_CONFIG } from "@/lib/category-config";
import { getPublicSiteBaseUrl } from "@/lib/public-site-base-url";

const PAGE_H1 =
  "韓国コスメランキング比較一覧｜美容液・クリーム・化粧水まとめ";

const META_DESCRIPTION =
  "韓国コスメのOlive Youngランキングをもとに、美容液・クリーム・化粧水などカテゴリ別の比較記事を一覧。人気商品を厳選して解説しています。";

/** 一覧ページ本文（クロール・ページ価値用・約400字） */
const ARTICLES_INDEX_INTRO = (
  <>
    <p className="leading-relaxed text-zinc-700">
      本ページでは、韓国オリーブヤングのランキングを反映したデータをもとに、美容液（セラム）・保湿クリーム・化粧水（トナー）など、主要カテゴリごとに人気商品を比較できる解説記事を一覧しています。ランキングの順位だけでなく、肌悩みやテクスチャの違い、使いどころのヒントまで踏まえて読めるよう構成しており、自分に合いそうな軸から記事を選びやすくなっています。話題の新製品から定番まで厳選してピックアップし、日々のスキンケア選びの参考になれば幸いです。
    </p>
    <p className="mt-4 leading-relaxed text-zinc-700">
      日別の全件ランキングやブランドの動向をまとめて確認したい場合は、本サイトの
      <Link href="/oliveyoung" className="mx-0.5 font-medium text-blue-700 underline hover:text-blue-900">
        Olive Young トップページ
      </Link>
      から各コンテンツへアクセスできます。気になるカテゴリは下記の一覧から記事へお進みください。
    </p>
  </>
);

const CATEGORY_TEASER_SLUGS = ["serum", "cream", "toner"] as const;

export function generateMetadata() {
  const base = getPublicSiteBaseUrl();
  const path = "/oliveyoung/articles";
  const url = `${base}${path}`;
  return {
    title: PAGE_H1,
    description: META_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title: PAGE_H1,
      description: META_DESCRIPTION,
      type: "website",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_H1,
      description: META_DESCRIPTION,
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
          <h1 className="text-xl font-bold leading-snug text-zinc-900 md:text-2xl">
            {PAGE_H1}
          </h1>
          <div className="mt-5 space-y-1 text-sm md:text-base">{ARTICLES_INDEX_INTRO}</div>
        </header>

        <section
          className="rounded-xl border border-zinc-200 bg-white p-4 md:p-5"
          aria-labelledby="category-links-heading"
        >
          <h2
            id="category-links-heading"
            className="text-sm font-semibold text-zinc-800"
          >
            カテゴリ別ランキング（商品一覧）
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            比較記事とあわせて、成分・悩み別の商品リストもご利用ください。
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {CATEGORY_TEASER_SLUGS.map((slug) => {
              const cfg = CATEGORY_CONFIG[slug];
              if (!cfg) return null;
              return (
                <li key={slug} className="border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
                  <Link
                    href={`/oliveyoung/category/${slug}`}
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    {cfg.label}
                  </Link>
                  <p className="mt-1 text-zinc-600">{cfg.description}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="articles-list-heading">
          <h2
            id="articles-list-heading"
            className="text-sm font-semibold text-zinc-800"
          >
            比較記事一覧
          </h2>
          <ul className="mt-4 space-y-4">
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
        </section>

        <p className="text-sm">
          <Link href="/oliveyoung" className="text-blue-600 hover:underline">
            ← Olive Young トップへ
          </Link>
        </p>
      </div>
    </div>
  );
}
