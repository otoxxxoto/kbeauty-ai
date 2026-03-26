# Olive Young / apps/web 公開前チェックリスト

公開可否の判断用に、**残件を優先度付きで一覧化**する。自動集計は `computeOliveYoungLaunchReport`（下記）と手動確認を組み合わせる。

---

## 画像・人物（公開方針）

| 事項 | 方針 |
|------|------|
| **人物除去処理** | **未実装**（クロップ・ぼかし・inpainting 等は行わない）。 |
| **公開前〜現行** | **人物入り画像は表示しない**安全運用。Vision の `containsPerson` と `resolveProductDisplayImage` の優先順により、該当画像はスキップされプレースホルダーまたはモールの人物なし画像へフォールバックする。 |
| **人物除去の位置づけ** | **post-launch 改善タスク**（バックログは [IMAGE_POLICY.md](./IMAGE_POLICY.md) の P1〜P4 を参照）。 |
| **公開判断の明文化** | **「今は安全運用で公開する」**／**「人物除去は後続改善」** — 詳細ルールは [IMAGE_POLICY.md](./IMAGE_POLICY.md)。 |

自動レポートで画像まわりの件数を確認する場合: `counts.placeholderCount`（= 解決結果がプレースホルダー）、`counts.personImageOnlyCount`、`counts.noSafeImageButHasOyImageCount`（定義は `IMAGE_POLICY.md` / `product-display-image-resolve.ts` のコメント参照）。

---

## 商品名（nameJa）・韓国語残り

| 項目 | 内容 |
|------|------|
| **運用方針** | 全件即時翻訳ではなく、**優先度ベースで自動補完**（詳細は [NAME_JA_TRANSLATION_OPS.md](./NAME_JA_TRANSLATION_OPS.md)） |
| **表示の単一ソース** | `src/lib/oliveyoung-display.ts`（`getDisplayProductNameText` 等） |
| **自動レポート** | `counts.nameJaMissingHighCount` / `nameJaMissingMediumCount` / `nameJaMissingLowCount`。**tier は公開面**（TOP 注目・急上昇・カテゴリ先頭・ランキング上位50）を踏まえ、`lastRank` だけでない（`computeOliveYoungLaunchReport` のオプション・CLI/API は公開面集合を渡す） |

**公開前**: 閾値・許容範囲は上記ドキュメントの「表示面ごとの基準」と合わせて判断。  
**公開後**: nightly 翻訳ジョブ（設計は同ドキュメント）とレポートで偏りを監視。

**公開面の欠損は high 扱い**: TOP / カテゴリ先頭 / ランキング上位 50 など **表示面に載る SKU** は `lastRank` が 30 位以下でも翻訳キューでは **high 候補**（実装は [NAME_JA_TRANSLATION_OPS.md](./NAME_JA_TRANSLATION_OPS.md) の第3節）。

**日次更新直後の早押し**: **`pnpm run flag-nameja-surface-targets`**（`-- --dry-run` で確認）— 公開面 SKU に限り `needsNameJa` / `translationPriority` を付与。

**全件（公開面外の取りこぼし）**: **`pnpm run flag-nameja-nightly-targets`** / `-- --dry-run`。詳細は同ドキュメントの 5.1〜5.2 節。

**自動運用**: crawler 日次本体がデータ保存後に `surface` を実行し、夜間は `JOB_TYPE=nameja-nightly-targets` で `nightly` を1日1回実行する（手動コマンドは引き続き有効）。

---

## 収益導線（CTA）

公開面品質を崩さずにクリック率を上げるため、CTA は **「存在するリンクだけ表示」**・**「リンク0件ならブロック非表示」** を必ず満たす。

### 商品詳細（最優先）

- [ ] **ファーストビュー直下**に primary CTA（`ProductPrimaryCtaBlock`）が自然に表示される
- [ ] **中腹**に compare CTA（`ProductCompareCtaBlock`）が表示され、primary の単純重複に見えない（「比較」意図が伝わる）
- [ ] **ページ下部の本文エリア**には bottom CTA を置かない（固定フッター `BottomStickyCta` と役割が重なるため）。**最安・在庫**の主導線は固定フッターで足りること
- [ ] **外部リンクが 1 件も無い商品**では CTA ブロック自体が **非表示**になる（primary/compare いずれも）
- [ ] モバイル幅（320 / 375 / 390）で **ボタンが潰れない**・不自然な折返しにならない

### 一覧（ランキング / カテゴリ）

- [ ] 商品カードの CTA 追加で **カード高さが不揃いになっていない**
- [ ] 一覧の主導線（カード全体クリック・詳細導線）が CTA によって **埋もれていない**

### 関連商品（商品詳細ページ下部）

- [ ] 関連商品カードの **外部アフィリエイトは Amazon のみ**（楽天・Qoo10 は出さない）。**商品詳細**・**Olive Young で見る**は従来どおり

### 計測（後で判断できること）

- [ ] affiliate click ログに `ctaPlacement`（primary/compare 等）と `pageType` が含まれている（後方互換で optional 追加されている）

---

## 自動レポートの出し方

| 方法 | 手順 |
|------|------|
| **CLI** | `cd apps/web` → `pnpm exec tsx scripts/oliveyoung-launch-report.ts`（整形: `--pretty`） |
| **HTTP** | `.env` に `INTERNAL_LAUNCH_REPORT_SECRET` を設定 → `GET /api/internal/oliveyoung-launch-report` に `Authorization: Bearer <SECRET>` または `?secret=` |

出力 JSON の `counts` / `samples` / `backlogSummary` を見る。

---

## 公開判断用スナップショット（最新の `launch-report` で置き換える）

> **公開前に必ず** `cd apps/web` → `pnpm exec tsx scripts/oliveyoung-launch-report.ts --pretty` を実行し、下表を **最新の JSON で上書き**してから Go/No-Go を判断する。

### 指標の読み分け（混同しない）

| 名前 | 意味 |
|------|------|
| **`backlogSummary.high` / `medium` / `low`** | `oliveyoung-launch-report.ts` の **公開前チェック向け**集計（下記式）。 |
| **`nameJaMissingHighCount` 等** | [NAME_JA_TRANSLATION_OPS.md](./NAME_JA_TRANSLATION_OPS.md) の **翻訳バッチ優先度 tier**。Firestore に `translationPriority: high` が無いと **high は 0 になりやすい**（`lastRank` だけでは high を付けない）。 |

`backlogSummary` の定義（実装）:

- **high** = `displayNamePending` + `rawSummaryJaUnsafe` + `officialBadgeButMarketplaceImageUrl`
- **medium** = `displayNameKoreanOriginal` + `rawNameJaContainsGoodsNo` + `rawReviewSummaryUnsafe` + `rawIngredientSummaryUnsafe` + `rawBrandJaUnsafe`
- **low** = `placeholderCount`（=`imageResolvedPlaceholder`）+ `rawNameContainsGoodsNo`

### counts 抜粋（**例: 2026-03-23 実行** ※差し替え必須）

| 指標 | 例の値 | メモ |
|------|--------|------|
| `backlogSummary.high` | **32** | 公開前に最優先で減らすブロックの合算 |
| `backlogSummary.medium` | **201** | |
| `backlogSummary.low` | **292** | |
| `nameJaMissingHighCount` | **0** | tier high（未設定時は 0 になりやすい） |
| `nameJaMissingMediumCount` | **27** | |
| `nameJaMissingLowCount` | **156** | |
| `placeholderCount` | **257** | |
| `personImageOnlyCount` | **164** | |
| `displayNamePending` | **32** | `backlogSummary.high` の主因になりやすい |
| `rawSummaryJaUnsafe` | **0** | 要約 unsafe（high に加算） |
| `officialBadgeButMarketplaceImageUrl` | **0** | 通常 0 を期待 |

### `backlogSummary.high` の high サンプル分類（**例スナップショット**）

上記実行時点では **`backlogSummary.high` = 32** = `displayNamePending`（32）+ `rawSummaryJaUnsafe`（0）+ `officialBadge`（0）。

`samples.displayNamePending` 先頭を確認した分類（**今回のデータ**）:

| 分類 | 件数（目安） | 内容 |
|------|----------------|------|
| **商品名準備中** | **32**（= high 全体） | 画面表示が `商品名準備中`（`getDisplayProductNameText`） |
| **A000… 混入**（raw `nameJa`） | **0**（high 専用では別指標 `rawNameJaContainsGoodsNo` = 11 を参照） | high サンプル自体は「準備中」起因 |
| **韓国語のまま** | **0**（high 内） | 韓国語フォールバックは `displayNameKoreanOriginal` → **medium** 側（今回 **151**） |
| **unsafe summary** | **0** | `rawSummaryJaUnsafe` |
| **その他** | **0** | 画像バッジ矛盾も **0** |

→ **公開前に潰す high 残件は、今回データでは「商品名準備中」32 件が主戦場**（要約・バッジ矛盾はゼロ）。

---

## 公開前に潰す high 残件 / 公開後運用でよい medium・low 残件

### 公開前に潰す **high 残件**（原則）

- **第一に `backlogSummary.high` と `samples.displayNamePending` / `rawSummaryJaUnsafe` / `officialBadgeInconsistent` を見る**（`nameJaMissingHighCount` だけでは足りない）。
- **`displayNamePending` が主因**なら: `nameJa` の投入・修正、または `name` / `nameJa` の正規化で「商品名準備中」を解消する。
- **`rawSummaryJaUnsafe` > 0** なら: `summaryJa` を手直し or 生成ジョブの再実行。
- **`officialBadgeButMarketplaceImageUrl` > 0** なら: `resolveProductDisplayImage` とデータの整合調査（通常 0）。

### 公開後運用でよい **medium / low 残件**（目安）

- **`nameJaMissingMediumCount` / `nameJaMissingLowCount`**: nightly 翻訳・優先度付き補完で段階的に削減（[NAME_JA_TRANSLATION_OPS.md](./NAME_JA_TRANSLATION_OPS.md)）。ランキング下位の韓国語残りはここに含まれる想定。
- **`backlogSummary.medium`**: 韓国語表示・口コミ/成分 unsafe 等。**閾値を決めて**継続改善（全件ゼロは必須にしない運用も可）。
- **`placeholderCount` / `personImageOnlyCount`（主に `backlogSummary.low`）**: 画像ポリシー上の非表示の結果として許容するか、[IMAGE_POLICY.md](./IMAGE_POLICY.md) と合わせて判断。人物除去は post-launch。

---

## 確認項目一覧（優先度）

### High（公開前に極力ゼロに近づける）

| 項目 | 内容 | 自動 / 手動 |
|------|------|-------------|
| 商品名が「準備中」 | 画面表示が `商品名準備中`（日本語名未整備） | 自動: `displayNamePending` |
| 要約が unsafe | `summaryJa` が goodsNo 混入・テンプレ暴走等（`isUnsafeGeneratedSummary`） | 自動: `rawSummaryJaUnsafe` |
| 公式バッジと画像 URL の矛盾 | モール CDN なのに公式バッジ（通常 0 件であるべき） | 自動: `officialBadgeButMarketplaceImageUrl` |
| 内部リンク 404 | 死リンク・誤ルート | 手動: ビルド + リンクチェッカ（`checklistHints.internalLinks404`） |

### Medium（品質・SEO・信頼性）

| 項目 | 内容 | 自動 / 手動 |
|------|------|-------------|
| 韓国語名フォールバック | 日本語名が無く韓国語 `name` を表示 | 自動: `displayNameKoreanOriginal` |
| nameJa に A000… 混入 | データ上の goodsNo 文字列混入 | 自動: `rawNameJaContainsGoodsNo` |
| 口コミ要約 unsafe | `reviewSummaryJa` がガードに引っかかる | 自動: `rawReviewSummaryUnsafe` |
| 成分解説 unsafe | `ingredientSummaryJa` がガードに引っかかる | 自動: `rawIngredientSummaryUnsafe` |
| brandJa 異常 | LLM 暴走・長文等（`isUnsafeBrandJa`） | 自動: `rawBrandJaUnsafe` |
| metadata / OGP | title / description / OG の抜け・重複 | 手動: 下記「主要ページ」 |
| CTA 文言の揺れ | 同一導線で表記がバラつく | 手動: `ProductAffiliateCtas` 等を grep |

### Low（許容しうるが把握はしておく）

| 項目 | 内容 | 自動 / 手動 |
|------|------|-------------|
| 画像プレースホルダー | ポリシー上オフにした結果、表示がプレースホルダー | 自動: `placeholderCount`（`imageResolvedPlaceholder` と同値） |
| OY はあるが safe 無し | `safeImageUrl` 無し・OY 系 URL は1件以上（データ観点） | 自動: `noSafeImageButHasOyImageCount` |
| 人物のみでプレースホルダー | OY URL がすべて解析済み「人物あり」かつ表示がプレースホルダー | 自動: `personImageOnlyCount`（人物除去未実装時の「隠している」寄りの指標） |
| name に A000… | クロール生データの混入（表示はフォールバックされることが多い） | 自動: `rawNameContainsGoodsNo` |
| 実画像 404 | サーバー resolve は通るが CDN が落ちている | 手動: サンプル URL をブラウザ確認（`brokenImageClientNote`） |

---

## 文言・データの参照実装

- 商品名: `getDisplayProductNameText` / `isUnsafeNameJa` / `looksLikeOliveYoungGoodsNo`（`oliveyoung-display.ts`）
- 要約・口コミ・成分: `isUnsafeGeneratedSummary` / `getSafeSummaryBodyOrNull`
- 画像: `resolveProductDisplayImage`（`product-display-image-resolve.ts`）
- 画像ポリシー全文: [IMAGE_POLICY.md](./IMAGE_POLICY.md)

---

## rel / target（外部リンク）

| 種別 | 想定 | 実装の場所 |
|------|------|------------|
| Amazon / 楽天 / Qoo10（アフィ） | `target=_blank`, `rel` に `nofollow sponsored noopener` | `affiliate.ts` + `ProductAffiliateCtas.tsx` |
| 価格比較・LoggedShopLink | `relForExternalUrl(href)` | `LoggedShopLink.tsx` |
| Olive Young 直リンク | 多く `rel="noreferrer"` | 各 `page.tsx` の `<a>` |

方針: アフィは `sponsored`、一般外部は最低 `noopener noreferrer`。

---

## metadata / OGP（主要ページ）

コード上のエントリ（必要に応じてファイルを開いて確認）:

- **TOP** — `src/app/oliveyoung/page.tsx` … `generateMetadata`
- **ランキング** — `src/app/oliveyoung/rankings/[runDate]/page.tsx`
- **カテゴリ** — `src/app/oliveyoung/category/[slug]/page.tsx`
- **商品詳細** — `src/app/oliveyoung/products/[goodsNo]/page.tsx` + `buildProductPageSeoMeta`
- **ブランド詳細** — `src/app/oliveyoung/brands/[runDate]/[brandKey]/page.tsx`

確認観点: `title` / `description` の長さ、OGP `openGraph`、`twitter`、`alternates.canonical`（商品・ブランド）。

---

## Crawler / Firestore

- 商品本文・画像の補正は `apps/crawler` 側ジョブと Firestore `oliveyoung_products_public` の整合を取る。
- レポートの件数が減らない場合は、先にバッチ投入・Vision / 翻訳ジョブの成否を確認。

---

## 完了条件（このドキュメントのゴール）

- [ ] **画像**: 人物除去は未実装・公開は人物入り非表示で行う、が関係者と文書で一致している（[IMAGE_POLICY.md](./IMAGE_POLICY.md)）
- [ ] `backlogSummary` の high / medium / low が把握できている（**`nameJaMissing*` とは別指標**であることを理解している）
- [ ] 上記「公開判断用スナップショット」を **最新の `launch-report` で更新**した
- [ ] **high 残件**が「商品名準備中 / unsafe 要約 / バッジ矛盾」のどれに該当するか切り分けでき、**公開前に潰す範囲**と **追加修正**の可否を判断できた
- [ ] `samples` の goodsNo でブラウザ確認できる
- [ ] 内部リンク・rel・metadata を手動観点で 1 周した記録がある
- [ ] 公開 Go / No-Go の判断ができる
