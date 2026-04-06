/**
 * Olive Young 比較・カテゴリ記事のスペック（最小・コード内定義）。
 * 記事が増えたら本オブジェクトに slug を追加する。
 */

export type OliveYoungArticleRunDate = "latest" | string;

export type OliveYoungArticleSpec = {
  slug: string;
  title: string;
  /** meta description（目安 120〜160 字） */
  description: string;
  /** 本文冒頭（HTML なし・プレーンテキスト） */
  intro: string;
  limit: number;
  runDate: OliveYoungArticleRunDate;
};

const ARTICLES: Record<string, OliveYoungArticleSpec> = {
  "korean-toner-ranking-compare": {
    slug: "korean-toner-ranking-compare",
    title: "韓国化粧水おすすめランキング｜Olive Young人気商品比較",
    description:
      "韓国オリーブヤングの人気ランキングをもとに、化粧水（トナー）のおすすめ商品を比較。上位商品の詳細・購入先リンクから最安や在庫を確認できます。",
    intro:
      "本記事では、韓国オリーブヤングの公式ランキングデータに基づき、人気の化粧水（トナー）カテゴリに位置づけられる売れ筋商品をピックアップして比較します。表示順位・商品情報はランキング取得日時点のものです。気になる商品は詳細ページや各ショップで価格・在庫をご確認ください。",
    limit: 10,
    runDate: "latest",
  },
};

export function getArticleSpecBySlug(slug: string): OliveYoungArticleSpec | null {
  const s = (slug || "").trim();
  return ARTICLES[s] ?? null;
}

export function getAllArticleSlugs(): string[] {
  return Object.keys(ARTICLES);
}
