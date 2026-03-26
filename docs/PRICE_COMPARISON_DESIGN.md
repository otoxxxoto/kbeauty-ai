# 価格比較（priceComparison）設計整理メモ

次の実装（価格取得Job等）に入る前の設計方針整理。コード変更は行わず、方針のみ記載。

---

## 1. 現在の実装状況

### 表示側（商品詳細ページ）

- **取得**: `getOliveYoungProductByGoodsNo(goodsNo)` で Firestore `oliveyoung_products_public/{goodsNo}` を取得。返却型 `OliveYoungProductDetail` に `priceComparison?: PriceComparison` を含む。
- **表示ロジック**: `getPriceComparisonRows(product.priceComparison)` で「priceText または url が存在する」チャネルだけを抽出。1件以上あれば「価格比較」セクションでリスト表示（EC名・priceText・「サイトで見る」リンク）、0件なら「（準備中）」。
- **購入導線**: 上部「購入・価格を確認する」は従来どおり検索リンクベース（Olive Young で見る / Amazon・楽天・Qoo10 で探す）。価格比較セクションは補助。

### 型定義（現状）

- **PriceComparisonEntry**: `label?`, `priceText?`, `url?`（すべて任意）
- **PriceComparison**: `oliveyoung?`, `amazon?`, `rakuten?`, `qoo10?`（各 PriceComparisonEntry）
- 保存側（価格取得Job）は未実装。Firestore に `priceComparison` が無くても表示は「（準備中）」で問題なし。

---

## 2. 設計整理

### A. 初期実装で現実的な範囲

| 項目 | 方針 |
|------|------|
| **まず何を実装するか** | Olive Young 実価格のみ先行。既に `productUrl` があり、同一商品への紐付けが明確なため実装しやすい。 |
| **Olive Young** | ランキング/商品取得で既に持っている商品ページURLを利用。価格テキストはスクレイピングまたは公式APIがあれば取得。実価格＋`productUrl` を `priceComparison.oliveyoung` に保存するのが現実的。 |
| **Amazon / 楽天 / Qoo10** | 初期は**検索リンク維持**のままがよい。個別商品一致は誤一致リスクが高く、ASIN・楽天商品ID等の管理が別途必要。価格比較セクションには「Olive Young のみ実データ」「他は従来どおり上部の検索リンク」で十分。 |

### B. 保存データ案

**PriceComparisonEntry に持たせるとよいフィールド**

| フィールド | 必須/任意 | 説明 |
|------------|-----------|------|
| **label** | 任意 | 表示名（例: "Olive Young"）。無ければチャネルキーから表示名を生成済みなので省略可。 |
| **priceText** | 任意 | 表示用価格文字列（例: "12,800ウォン" "¥1,200"）。単位・通貨は取得元に依存。 |
| **url** | 任意 | 商品ページURL。購入導線用。 |
| **fetchedAt** | 任意（推奨） | 価格取得日時。将来の「更新日時表示」「古いデータの再取得」に利用。 |
| **source** | 任意 | 取得元の識別子（例: "scrape" / "api"）。デバッグ・運用用。 |

**必須の考え方**

- 表示可能な「行」として出す条件は現状どおり **priceText または url のいずれかが存在** でよい。
- 両方無いエントリは保存しない、または保存しても表示しない。
- チャネル単位（oliveyoung / amazon 等）ごとに任意フィールドのため、既存ドキュメントに無くても問題なし。

### C. 取得Jobの責務（将来実装時）

| 項目 | 方針 |
|------|------|
| **Jobの担当** | 価格比較データの取得と Firestore への merge 更新のみ。ランキング本体・商品一覧取得・refetch は一切呼ばない。 |
| **対象コレクション** | `oliveyoung_products_public`。ドキュメント単位で `priceComparison`（および必要なら `priceComparisonUpdatedAt`）を merge。 |
| **対象条件** | 例: `productUrl` が存在する商品のうち、`priceComparison` が無い／古い／未取得のもの。limit 指定可能にし、対象0件なら正常終了。 |
| **分離** | ランキング本体Job・補完Job（reviewSummaryJa / ingredientSummaryJa 等）とは完全分離。価格比較更新Jobからそれらを呼ばない。 |

### D. 一致精度リスク（Amazon / 楽天 / Qoo10）

| リスク | 説明 |
|--------|------|
| **商品の一意性** | 韓国商品名・日本語名と、各ECの商品ID（ASIN・楽天商品ID等）は自動対応が難しく、手動紐付けや別システムが必要。 |
| **検索一致の不安定さ** | 検索結果1件目＝当該商品とは限らない。別商品・類似品を「最安」として表示すると誤導になる。 |
| **初期段階で安全な範囲** | Olive Young のみ実価格＋URL。他ECは検索リンクのままにし、個別一致リンク・実価格表示はデータ基盤と検証が整ってから検討。 |

### E. 将来拡張（メモ）

- **最安値表示**: 複数チャネルに priceText がある場合、パースして最安をハイライトする等。単位・通貨の正規化が必要。
- **更新日時表示**: `fetchedAt` または `priceComparisonUpdatedAt` を一覧・詳細に表示。
- **比較記事導線**: カテゴリ別「価格比較記事」ページへのリンクを、商品詳細から張る等。
- **アフィリエイトURL差し替え**: url をアフィリエイト用に差し替える場合は、表示時または保存時のポリシーを別途定義。今回の設計では「まだアフィリエイトURL前提にしない」。

---

## 3. 次回実装に渡すときのポイント

- **Jobは Olive Young 実価格（＋既存 productUrl）の取得・保存に限定**すると、責務が明確で安全。
- **保存スキーマ**は現行の `PriceComparison` / `PriceComparisonEntry` に `fetchedAt`・`source` を追加する程度で足りる。既存の label / priceText / url はそのまま。
- **対象0件時は正常終了**。ランキング本体・他補完Jobとは分離を厳守。

---

## 4. 今回は見送ったもの

- 価格取得Jobの実装
- Amazon / 楽天 / Qoo10 の実価格取得・個別一致
- 最安値表示・更新日時表示のUI実装
- アフィリエイトURLの扱い
- コード変更（本メモは設計整理のみ）
