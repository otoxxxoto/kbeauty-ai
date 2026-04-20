import Link from "next/link";

/**
 * korean-serum-ranking-compare 専用の軸強化ブロック（CTA・計測ロジックは触らない）
 */
export function KoreanSerumRankingComparePillarContent() {
  return (
    <div className="mt-10 space-y-8 border-t border-zinc-200 pt-10">
      <section aria-labelledby="pillar-serum-how-heading">
        <h2
          id="pillar-serum-how-heading"
          className="mb-3 text-base font-bold text-zinc-900 md:text-lg"
        >
          韓国美容液の選び方
        </h2>
        <p className="text-sm leading-relaxed text-zinc-700 md:text-[15px]">
          美容液は、化粧水で整えた肌のあとに使い、保湿・透明感・ハリ・毛穴など、いま優先したい悩みへ集中アプローチするステップです。韓国ブランドでは少量高濃度の「アンプル」形式や、複数の有効成分をバランスよく配合した製品が多く、価格帯やテクスチャの幅も広いのが魅力です。選ぶときは悩みを一つに絞り、ランキング上位から「朝は軽め・夜はしっとり」など時間帯で使い分けられる候補を探すと失敗が減ります。香りやシリコーン感など好みの項目も商品ページで確認してください。初めて使う成分は少量や低頻度から試し、刺激を感じたら休める余裕を持つと続けやすくなります。ランキングは売れ行きの指標であり、肌質との適合は個人差がある点も押さえておくと選定が安定します。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-700 md:text-[15px]">
          スキンケア全体の流れを組み立てるなら、水分の土台となる化粧水は
          <Link
            href="/oliveyoung/articles/korean-toner-ranking-compare"
            className="mx-0.5 font-medium text-blue-700 underline hover:text-blue-900"
          >
            韓国化粧水おすすめランキング比較
          </Link>
          を、保湿や密封の仕上げには
          <Link
            href="/oliveyoung/articles/korean-cream-ranking-compare"
            className="mx-0.5 font-medium text-blue-700 underline hover:text-blue-900"
          >
            韓国クリームおすすめランキング比較
          </Link>
          とあわせて読むとイメージがつかみやすくなります。美容液以外のテーマ記事も含めた一覧は
          <Link
            href="/oliveyoung/articles"
            className="mx-0.5 font-medium text-blue-700 underline hover:text-blue-900"
          >
            比較記事一覧
          </Link>
          からご覧ください。
        </p>
      </section>

      <section aria-labelledby="pillar-serum-korea-heading">
        <h2
          id="pillar-serum-korea-heading"
          className="mb-3 text-base font-bold text-zinc-900 md:text-lg"
        >
          韓国美容液の特徴
        </h2>
        <p className="text-sm leading-relaxed text-zinc-700 md:text-[15px]">
          韓国コスメの美容液は、サラッと馴染む軽いエッセンスから、オイルインやリッチな乳液寄りまでテクスチャのバリエーションが豊富です。トレンド成分をいち早くラインナップに取り込み、使い切りパックやデュアルフェーズなど「試しやすい形状」の商品も多いのが特徴です。表示は日本語・英語・ハングルが混在しやすいため、成分名や使用方法は各商品の公式説明とあわせて確認すると安心です。
        </p>
      </section>

      <section aria-labelledby="pillar-serum-ingredients-heading">
        <h2
          id="pillar-serum-ingredients-heading"
          className="mb-3 text-base font-bold text-zinc-900 md:text-lg"
        >
          成分で選ぶ美容液
        </h2>
        <p className="text-sm leading-relaxed text-zinc-700 md:text-[15px]">
          <span className="font-medium text-zinc-800">ヒアルロン酸</span>
          や
          <span className="font-medium text-zinc-800">セラミド</span>
          系は、乾燥やバリア低下が気になるときの定番で、さっぱり系からとろみのある高保湿タイプまで選べます。
          <span className="font-medium text-zinc-800">ナイアシンアミド</span>
          は皮脂・キメ・くすみなど複合的な悩みに使われやすく、初心者向けの配合も多いです。
          <span className="font-medium text-zinc-800">ビタミンC誘導体</span>
          は透明感や日焼け後のケアを意識する方向けで、刺激には個人差があります。
          <span className="font-medium text-zinc-800">レチノール（ビタミンA誘導体）</span>
          はハリ感や角質更新を狙う強めの選択肢で、濃度や使用頻度は商品の指示に沿って少しずつ始めるのがおすすめです。複数の美容液を重ねる場合は、刺激の強い成分を同日に重ねすぎず、まず一本で様子を見てから足すと肌負担を抑えやすくなります。
        </p>
      </section>
    </div>
  );
}
