# Olive Young 価格補完Job 再取得運用メモ

次の実装（再取得条件の追加等）に入る前の運用方針整理。今回は Job 改修は行わず、ルールと運用案のみ記載。

---

## 1. 現在の実装状況

### 対象条件（現行）

- **取得関数**: `getProductsMissingOliveYoungPrice(limit)`（priceComparisonOliveYoungFirestore.ts）
- **条件**:
  1. `productUrl` が存在する
  2. `priceComparison.oliveyoung.priceText` が**無い**、または**空**
- **未実装**: `fetchedAt` の日付による「古いので再取得」は**まだ入っていない**。現状は「未取得を埋める」専用。

### 保存内容（現行）

- **更新時**: Job が `updateProductPriceComparisonOliveYoung(goodsNo, entry)` で merge。
- **entry の中身**:
  - `label`: "Olive Young"
  - `priceText`: 取得した価格文字列（例: "12,800원"）
  - `url`: 当該ドキュメントの `productUrl`
  - `fetchedAt`: `new Date()`（Firestore には Timestamp として保存）
  - `source`: "oliveyoung-product-page"
- **他チャネル**: `priceComparison.amazon` 等は読み取り後にマージして保持。上書きしない。

### 実行・ログ

- **入口**: `pnpm run oliveyoung:fill-price-comparison-oliveyoung`（引数 or `LIMIT` で件数指定、最大500）
- **ログ**: PRICE_COMPARISON_OY_START / TARGETS / ITEM_DONE / SKIP_NO_PRICE / ITEM_FAIL / DONE（processed, updated, skippedNoPrice, errors）
- **対象0件**: 正常終了。ランキング本体・他補完Jobは呼ばない。

---

## 2. 再取得運用の整理

### A. 初期運用で現実的な再取得条件

| 種別 | 方針 |
|------|------|
| **未取得** | 従来どおり対象。`priceComparison.oliveyoung.priceText` が無い or 空なら必ず候補にする。 |
| **取得済みで古い** | **fetchedAt が N 日より前**のとき「再取得候補」にする。N は 7〜14 日が現実的（価格変動頻度と負荷のバランス）。 |
| **fetchedAt が無い** | 過去データで fetchedAt を保存していない場合は「古いとみなす」か「未取得と同様に再取得対象」とする。運用上は**再取得対象に含めてよい**（取得し直して fetchedAt を付与）。 |

### B. 対象抽出条件の案（次回実装用）

以下を満たすドキュメントを「候補」とし、先頭 `limit` 件を処理する。

1. **productUrl** が存在する
2. 次の**いずれか**:
   - **未取得**: `priceComparison.oliveyoung.priceText` が無い、または空
   - **再取得**: `priceComparison.oliveyoung.fetchedAt` が無い、または **fetchedAt の日付が N 日（例: 14日）より前**

**実装上の注意**

- `fetchedAt` は Firestore 上 Timestamp または Date。比較時は「現在日時 − fetchedAt ≧ N 日」で判定。
- 未取得と「古い再取得」を同じ Job で扱い、対象リストを 1 回のスキャンで作る形にすると運用が簡単。
- 閾値 N は環境変数（例: `PRICE_REFETCH_DAYS=14`）で指定できると将来調整しやすい。

### C. Job の責務（変更なし）

| 項目 | 内容 |
|------|------|
| **担当** | 価格の取得と Firestore の `priceComparison.oliveyoung` への merge のみ。ランキング本体・他補完Jobは呼ばない。 |
| **対象** | `oliveyoung_products_public`。上記「対象抽出条件」で取得したドキュメント。 |
| **limit** | 1 回の実行で処理する最大件数。指定可能（argv / LIMIT）。最大 500 等は現行どおりで可。 |
| **対象0件** | 正常終了。エラーにしない。 |
| **1件失敗** | その件は errors に加算し、次の件へ続行。全体は止めない。 |

### D. Scheduler 運用の叩き台

| 項目 | 案 |
|------|-----|
| **頻度** | **日次 1 回**で十分。価格の鮮度は日単位で更新されれば足りる。 |
| **1日複数回** | 初期は不要。キャンペーン等で鮮度を上げたい場合にのみ検討。 |
| **実行時刻** | 韓国時間の深夜〜早朝など、Olive Young 側負荷が低い時間帯が無難。日本時間で 1:00〜5:00 の間など。 |
| **limit 目安** | 全商品数が少ないうちは 100〜200。多い場合は「未取得優先＋古い再取得」を 1 日 200〜300 件ずつ回す形でよい。 |
| **Cloud Run Job + Scheduler** | 日次 1 回、`LIMIT=200` 等で Job を叩く形を想定。Scheduler の追加は今回スコープ外。 |

### E. 将来拡張（メモ）

- **強制再取得**: 特定 goodsNo だけ「fetchedAt を無視して再取得」するフラグ or 別スクリプト。
- **fetchedAt 表示強化**: 商品詳細ページでは既に「更新: YYYY-MM-DD」を表示済み。必要なら「○日前に更新」等の表記を追加可能。
- **価格履歴**: 履歴テーブル/サブコレクションは未実装。将来、価格変動の可視化や「最安値」表示をする場合は別設計。
- **最安値表示**: 複数チャネルに価格がある場合の比較・ハイライトは将来対応。

---

## 3. 次回実装に渡すときのポイント

- **対象条件の拡張**: `getProductsMissingOliveYoungPrice` 相当の「対象取得」に「**fetchedAt が無い or N 日より古い**」を追加する。
- **閾値**: 日数 N は 14 日をデフォルトにし、環境変数で上書きできるようにすると運用しやすい。
- **既存挙動**: 未取得（priceText が無い/空）は従来どおり最優先で対象に含める。
- **コード変更箇所**: 対象は `priceComparisonOliveYoungFirestore.ts` の対象取得ロジックが中心。Job 本体のループや保存処理はそのまま流用可能。

---

## 4. 今回は見送ったもの

- Job 本体のコード改修（再取得条件の実装）
- Scheduler / Cloud Run の設定
- 価格履歴・最安値表示
- 強制再取得用の個別スクリプト
