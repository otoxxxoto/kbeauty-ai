/**
 * Olive Young 比較・カテゴリ記事のスペック（最小・コード内定義）。
 * 記事が増えたら本オブジェクトに slug を追加する。
 */

export type OliveYoungArticleRunDate = "latest" | string;

/** `CATEGORY_CONFIG` のキーと一致させる（記事内でランキング商品を絞り込む） */
export type OliveYoungArticleCategoryConfigSlug =
  | "toner"
  | "serum"
  | "cream"
  | "cleansing"
  | "mask-pack";

export type OliveYoungArticleSpec = {
  slug: string;
  title: string;
  /** meta description（目安 120〜160 字） */
  description: string;
  /** 本文冒頭（HTML なし・プレーンテキスト） */
  intro: string;
  limit: number;
  /**
   * カテゴリ該当商品を rank 順に並べたあと、先頭から何件スキップするか（同カテゴリ記事の差分用）。
   * `themeMatchKeywords` がある記事では無視される。
   */
  offset?: number;
  /**
   * 指定時は自動カテゴリ判定より優先。`runDate` のランキング行から goodsNo で引き、存在しない ID はスキップ。
   * 表示順は記事ページ側で公式 rank 昇順に整列する（spec の配列順は候補集合の定義用）。
   */
  goodsNos?: string[];
  /**
   * `goodsNos` 未指定時のみ有効。カテゴリスコア通過後、name/nameJa/summaryJa/brand 合成テキストに
   * いずれかが含まれる行だけ残す（OR）。並びは rank 昇順、`limit` のみ（offset なし）。
   */
  themeMatchKeywords?: string[];
  runDate: OliveYoungArticleRunDate;
  categoryConfigSlug: OliveYoungArticleCategoryConfigSlug;
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
    /** toner スコア候補のみ（rank 40, 77 想定・runDate 更新時は要メンテ） */
    goodsNos: ["A000000226081", "A000000182630"],
    runDate: "latest",
    categoryConfigSlug: "toner",
  },
  "korean-toner-moisture-ranking-compare": {
    slug: "korean-toner-moisture-ranking-compare",
    title: "韓国化粧水（保湿向け）おすすめ｜Olive Youngランキング比較",
    description:
      "保湿・うるおい重視の韓国化粧水を、オリーブヤングの人気ランキングから比較。売れ筋上位のトナー候補を一覧でチェックし、詳細・価格確認へ進めます。",
    intro:
      "乾燥やもちもち肌を目指す方向けに、韓国オリーブヤングのランキングから化粧水（トナー）カテゴリに該当する候補のうち、保湿・うるおい寄りの訴求が強い商品を中心に比較用として掲載しています。現時点の自動判定では該当候補が限られるため、総合の化粧水記事と同じ商品が並ぶ場合があります。ランキング順位は取得日時点のものです。肌質に合うかは商品ページの成分・説明もあわせてご確認ください。",
    limit: 10,
    /** toner スコア候補のみ（総合記事と同集合・表示順は rank 昇順） */
    goodsNos: ["A000000226081", "A000000182630"],
    runDate: "latest",
    categoryConfigSlug: "toner",
  },
  "korean-serum-ranking-compare": {
    slug: "korean-serum-ranking-compare",
    title: "韓国美容液（セラム）おすすめランキング｜Olive Young人気比較",
    description:
      "韓国コスメの美容液・セラムを、オリーブヤング売れ筋ランキングから比較。上位商品の詳細ページと主要ECリンクで価格・在庫を確認できます。",
    intro:
      "美容液（セラム）は、化粧水のあとに使う集中ケアアイテムとして人気です。本記事では韓国オリーブヤングのランキングデータをもとに、注目の売れ筋をピックアップして比較します。表示はランキング取得日時点です。",
    limit: 10,
    runDate: "latest",
    categoryConfigSlug: "serum",
  },
  "korean-serum-brightening-ranking-compare": {
    slug: "korean-serum-brightening-ranking-compare",
    title: "韓国美容液（透明感・くすみ対策）おすすめ｜OYランキング比較",
    description:
      "透明感やくすみが気になる方向けに、韓国オリーブヤングの人気ランキングから美容液・セラムを比較。ランキング上位品の詳細・購入導線をまとめました。",
    intro:
      "くすみや明るさが気になる肌へ、韓国で人気の美容液（セラム）をランキング観点から一覧します。オリーブヤングの公式ランキングを根拠にした比較記事で、順位は取得時点のものです。効果感には個人差があります。本記事では同カテゴリ内の別候補も比較対象として掲載しています。",
    limit: 10,
    themeMatchKeywords: [
      "透明",
      "トーン",
      "美白",
      "ナイアシン",
      "ビタミン",
      "VC",
      "くすみ",
      "ナイアシンアミド",
      "비타민",
      "나이아신",
      "비타민c",
    ],
    runDate: "latest",
    categoryConfigSlug: "serum",
  },
  "korean-cream-ranking-compare": {
    slug: "korean-cream-ranking-compare",
    title: "韓国クリームおすすめランキング｜Olive Young人気商品比較",
    description:
      "韓国スキンケアのクリームを、オリーブヤングの人気ランキングから比較。保湿・仕上げ用の売れ筋候補を、詳細ページとショップリンク付きで紹介します。",
    intro:
      "クリームは保湿やバリアサポートの要となるステップです。韓国オリーブヤングのランキングに基づき、人気の高い商品を取り上げて比較します。テクスチャや香りは商品により異なるため、詳細ページもご覧ください。",
    limit: 10,
    runDate: "latest",
    categoryConfigSlug: "cream",
  },
  "korean-cream-night-ranking-compare": {
    slug: "korean-cream-night-ranking-compare",
    title: "韓国ナイトクリームおすすめ｜Olive Youngランキングで比較",
    description:
      "夜用・しっとり仕上げの韓国クリームを、オリーブヤング売れ筋ランキングから比較。上位商品の成分や口コミは詳細ページ、価格は各ECで確認できます。",
    intro:
      "夜の保湿を厚めにしたい方向けに、韓国オリーブヤングのランキングに載るクリーム系の人気商品をまとめました。ランキング順はデータ取得日基準です。脂性肌の方はテクスチャの重さにも注意して選ぶとよいです。",
    limit: 10,
    runDate: "latest",
    categoryConfigSlug: "cream",
  },
  "korean-pack-ranking-compare": {
    slug: "korean-pack-ranking-compare",
    title: "韓国パックおすすめランキング｜Olive Young人気商品比較",
    description:
      "シートパックや洗い流しパックなど、韓国オリーブヤングで人気のパックをランキングから比較。集中ケアの候補を一覧し、詳細・購入リンクへつなげます。",
    intro:
      "パックは短時間でうるおいやハリ感を補いやすいアイテムです。本記事では韓国オリーブヤングの公式ランキングを参照し、売れ筋のパック関連商品をピックアップします。表示順位は取得日時点です。",
    limit: 10,
    runDate: "latest",
    categoryConfigSlug: "mask-pack",
  },
  "korean-pack-sheet-ranking-compare": {
    slug: "korean-pack-sheet-ranking-compare",
    title: "韓国シートマスクおすすめ｜Olive Youngランキング比較",
    description:
      "韓国のシートマスク・フェイスパックを、オリーブヤング人気ランキングから比較。上位アイテムの詳細確認や、Amazon 等での価格チェックに便利です。",
    intro:
      "手軽に集中保湿できるシートマスクは、韓国コスメの定番です。オリーブヤングのランキングデータをもとに人気商品を並べ、比較の土台にしてください。使用感は肌状態で変わるため、詳細ページの説明も参考にしてください。",
    limit: 10,
    runDate: "latest",
    categoryConfigSlug: "mask-pack",
  },
  "korean-cleansing-ranking-compare": {
    slug: "korean-cleansing-ranking-compare",
    title: "韓国クレンジングおすすめランキング｜Olive Young人気比較",
    description:
      "韓国のクレンジング（オイル・バーム・ウォーター等）を、オリーブヤング売れ筋ランキングから比較。メイク落とし候補を一覧し、詳細・価格確認へ進めます。",
    intro:
      "クレンジングは肌荒れを防ぐ第一歩です。韓国オリーブヤングのランキングに基づき、人気のクレンジング関連商品を取り上げます。メイクの濃さや肌質に合わせてタイプを選び、詳細ページで処方を確認してください。",
    limit: 10,
    runDate: "latest",
    categoryConfigSlug: "cleansing",
  },
  "korean-cleansing-oil-ranking-compare": {
    slug: "korean-cleansing-oil-ranking-compare",
    title: "韓国クレンジングオイルおすすめ｜Olive Youngランキング比較",
    description:
      "クレンジングオイル人気の韓国コスメを、オリーブヤングのランキングから比較。溶けやすさ・洗い上がりの参考に、上位商品の詳細と購入リンクをまとめました。",
    intro:
      "オイルタイプはリップやマスカラなど落としにくいメイク向きのことが多いです。韓国オリーブヤングのランキングを参照し、売れ筋のクレンジングオイル候補を一覧します。順位は取得日時点。敏感肌の方はパッチテストを推奨します。",
    limit: 10,
    runDate: "latest",
    categoryConfigSlug: "cleansing",
  },
};

export function getArticleSpecBySlug(slug: string): OliveYoungArticleSpec | null {
  const s = (slug || "").trim();
  return ARTICLES[s] ?? null;
}

export function getAllArticleSlugs(): string[] {
  return Object.keys(ARTICLES);
}
