# nameJa（商品名日本語）補完の運用設計

## 目的

- **全件を即時に日本語化する**のではなく、**優先度と日次上限**で自動補完する。
- 「韓国語のまま表示される」件を **バグではなく運用上の許容範囲**として整理し、**どこで許容し、どこで許容しないか**を明文化する。

---

## 1. 用語

| 用語 | 意味 |
|------|------|
| **nameJa** | Firestore `oliveyoung_products_public` の日本語商品名フィールド |
| **表示名** | `getDisplayProductNameText` の結果（nameJa が安全なら nameJa、さもなければ韓国語 name 等） |
| **補完キュー** | 日本語名が未整備で、翻訳ジョブの対象になり得る商品集合 |

---

## 2. Firestore 公開ドキュメント（任意フィールド）

`oliveyoung_products_public` の各ドキュメントに、次を**任意で**持てる（未設定でも既存表示は動く）。

| フィールド | 型 | 説明 |
|------------|-----|------|
| **needsNameJa** | `boolean` | `true`: 翻訳パイプラインに明示的に載せたい。`false`: 意図的に対象外（手動・韓国語のみ許容など）。未設定: 表示ロジックから推定 |
| **translationPriority** | `"high" \| "medium" \| "low"` | バッチ処理の優先度。未設定時はレポート・ジョブ側でヒューリスティック（後述） |
| **lastNameJaTranslatedAt** | `string`（ISO8601 推奨）または Timestamp | 最後に nameJa を自動／手動で更新した日時。再実行判定・監査用 |
| **nameJaFlaggedAt** | `string`（ISO8601 推奨）または Timestamp | nightly 投入スクリプトが `needsNameJa` / `translationPriority` を付けた日時（監査・再スキャン用） |
| **translationBlockedReason** | `string` | 翻訳ジョブが保存をスキップした理由（例: `missing_source_name` / `unsafe_generated_name`）。未設定でよい |
| **nameJaSourceQuality** | `string` | 例: `insufficient`（ソース不足と判定）。補完後にジョブが削除してよい |
| **needsSourceEnrichment** | `boolean` | `true`: **元データ補完待ちキュー**（name / brand / 要約の再取得が先）。翻訳ジョブは LLM を回さないことがある |

**注意**: 表示は引き続き `oliveyoung-display.ts` のルールが単一ソース。上記は **運用・ジョブ用メタデータ**。

---

## 3. 優先度（translationPriority）の意味

| 優先度 | 想定される商品 | 備考 |
|--------|----------------|------|
| **high** | **公開面に載る商品**（下記インデックス）／手動で high を書いた商品／詳細アクセス多い商品など | `lastRank` が 50 位以下でも TOP に出れば **high 候補** |
| **medium** | 公開面外かつ `lastRank` **1〜50** | 日次上限の次枠 |
| **low** | 公開面外かつ上記以外の `lastRank` | 許容ラグが大きい |

**公開面インデックス**（実装: `buildPublicSurfaceGoodsIndex`・`oliveyoung-public-surface.ts`、`translationPriorityCandidateFromSurfaceAndRank`）:

- **TOP 注目**: 最新ランキング日の **上位 3**（入口ページ「今日の注目商品」と同じ）
- **TOP 急上昇**: `getRisingProductsWithProducts` **5 件**（入口「急上昇商品」と同じ）
- **カテゴリ先頭**: 各カテゴリの `filterProductsByCategory` 結果の **先頭 3 SKU**（カテゴリページのフィーチャー枠に合わせる）
- **ランキング上位 50**: 最新ランキング **rank 1〜50**

ジョブ・レポートでは **候補 tier** を `mergeTranslationPriorityForNightly(既存 Firestore 値, 候補)` で決定（既存 **high** 維持・**medium を low に下げない**）。

単体の「未設定時 rank のみ」フォールバックは引き続き `resolveTranslationPriorityForReport`（公開面を見ない）。**launch report / nightly / surface CLI** は公開面を含む候補を使う。

---

## 4. 表示面ごとの基準（ポリシー）

実装の単一ソースは `src/lib/oliveyoung-display.ts`（`getDisplayProductNameText`・`isUnsafeNameJa` 等）。運用上の「期待」は以下。

| 画面・導線 | 期待 | 備考 |
|------------|------|------|
| **TOP（急上昇・注目）** | **原則日本語**（表示名が韓国語オリジナルにフォールバックしないこと） | 高優先で nameJa 補完。未整備は `translationPriority: high` + `needsNameJa: true` |
| **カテゴリ主要商品**（先頭フィーチャー等） | **原則日本語** | 同上 |
| **商品詳細** | **日本語優先**（SEO・回遊の核） | 詳細に来た商品を次バッチで high に上げる案は **TODO**（下記） |
| **ランキング一覧** | **下位は韓国語残りを一部許容**可 | 体験上の許容。`medium`/`low` で順次補完 |
| **公開不可** | **goodsNo 形式（`A`+10桁以上）や壊れた文言をタイトルとして出さない** | `isUnsafeNameJa`・`PRODUCT_TITLE_PENDING_JA` 等で抑制済み。公開前レポートで監視 |

---

## 5. nightly translation job（設計）

### 5.1 全件スキャン（`flag-nameja-nightly-targets`）

**公開面外も含む**欠損・unsafe 件を nightly に載せる。優先度は **公開面なら high 候補**、さもなければ **`lastRank` 1〜50 `medium`、それ以外 `low`**（`mergeTranslationPriorityForNightly` で既存値と合成）。

| 項目 | 内容 |
|------|------|
| **スクリプト** | `apps/web/scripts/flag-nameja-nightly-targets.ts` |
| **実行** | `pnpm run flag-nameja-nightly-targets`（本番更新） / `pnpm run flag-nameja-nightly-targets -- --dry-run`（更新なし・ログのみ） |
| **対象** | ① `getDisplayProductNameText === 商品名準備中`（`displayNamePending` 相当） ② `nameJa` に goodsNo 混入（`containsUnsafeGoodsNoText`＝`rawNameJaContainsGoodsNo` 相当） ③ `nameJa` が非空かつ `isUnsafeNameJa` |
| **書き込み** | `needsNameJa: true`、`translationPriority`: 上記ルールの **候補**をマージした結果 |
| **ログ** | `[NAMEJA_SURFACE_PRIORITY]`（`onTop` / `onCategoryLead` / `onRankingTop50` / `nextPriority`）、`[NAMEJA_NIGHTLY_FLAG_*]`、`[NAMEJA_NIGHTLY_FLAG_DONE]` |
| **監査** | `nameJaFlaggedAt` に ISO 時刻を記録 |

### 5.2 公開面のみ即時フラグ（`flag-nameja-surface-targets`）

日次ランキング更新後など、**画面上に出ている SKU だけ**を先にキューへ載せる（nightly 全件スキャンを待たない）。

| 項目 | 内容 |
|------|------|
| **スクリプト** | `apps/web/scripts/flag-nameja-surface-targets.ts` |
| **実行** | `pnpm run flag-nameja-surface-targets` / `-- --dry-run` |
| **対象** | `mergePublicSurfaceGoodsNos` に含まれる goodsNo のうち、`flag-nameja-nightly-targets`（5.1 節）と同じ nameJa 要補完条件に合うもののみ |
| **書き込み** | 同上。候補は常に公開面なので **high 候補**（マージで既存の high / medium は下げない） |
| **ログ** | `[NAMEJA_SURFACE_PRIORITY]`、`[NAMEJA_SURFACE_FIX_DONE]`（`scanned` / `matched` / `updated` / `skipped` / `dryRun`） |

**役割分担**: **surface** = 露出 SKU の早押し。**nightly** = 全カタログの取りこぼし防止。

### 5.3 日次運用への組み込み（crawler ジョブ連携）

`apps/crawler` の日次ランキング本体（`runOliveyoungRankingsJob`）に、公開面フラグを直結して自動実行する。

| タイミング | 実行 | ログ |
|------|------|------|
| 日次データ更新直後（ランキング/商品保存後） | `pnpm run flag-nameja-surface-targets`（crawler から起動） | `[DAILY_NAMEJA_SURFACE_START]` / `[DAILY_NAMEJA_SURFACE_DONE]` |
| 夜間バッチ（1日1回） | `pnpm run flag-nameja-nightly-targets`（`JOB_TYPE=nameja-nightly-targets`） | `[DAILY_NAMEJA_NIGHTLY_START]` / `[DAILY_NAMEJA_NIGHTLY_DONE]` |

`*_DONE` ログには最低 `elapsedMs` / `scanned` / `matched` / `updated` / `skipped` を出す。

### 5.4 nightly 実翻訳ジョブ（`oliveyoung:nameja-translate`）

フラグ付けだけでなく、`needsNameJa === true` を実際に翻訳して確定する実行ジョブ（crawler 側）。

#### 優先度フィルタ（既定）

- **既定**では **`translationPriority` が `high` と `medium` のドキュメントだけ**を処理する（`low` は対象外）。
- **`low` を含める**には **`--priority=all`** を付ける（`high → medium → low` の順で上限まで拾う）。
- **単一優先度だけ**処理する例: `--priority=low`（low のみ。運用・バックフィル用）。
- **`--priority=default`** で明示的に既定（high+medium）に戻せる。
- 環境変数 **`NAMEJA_TRANSLATE_PRIORITY`**: 未設定時は既定（high+medium）。`all` / `high` / `medium` / `low` / `default` が指定可能。

`[NAMEJA_TRANSLATE_START]` の `prioritiesResolved` で実際に走る優先度配列を確認できる。

#### ソース不足と low の扱い

- 翻訳前に **ソース品質**を判定し、**情報不足**（商品名が goodsNo のみ・ブランド+カテゴリ推定もできない等）の場合は **LLM を呼ばない**。
- そのとき **`translationPriority === low` かつ情報不足**の件は、集計上 **`blockedLowInsufficientSource`** とし、**high/medium で情報不足**の件は **`blockedMissingSource`** とする（いずれもスキップログ理由は `missing_source_name`）。
- Firestore には次をマージする（`dry-run` では書かない）:
  - `translationBlockedReason: "missing_source_name"`
  - `nameJaSourceQuality: "insufficient"`
  - `needsSourceEnrichment: true`（**元データ補完待ちキュー**。将来の source enrichment ジョブの対象候補）
- `needsNameJa` は **`true` のまま**（翻訳はデータが揃ってから）。

**low でソースが十分な場合**（`--priority=all` 等で low がバッチに入っているとき）のみ LLM 翻訳に進む。

| 項目 | 内容 |
|------|------|
| **スクリプト** | `apps/crawler/src/jobs/runNameJaTranslationJob.ts` |
| **実行** | `pnpm run oliveyoung:nameja-translate` |
| **オプション** | `--dry-run` / `--limit=20` / `--priority=` に `default`（既定・high+medium） / `high` / `medium` / `low` / `all` |
| **対象** | `needsNameJa == true` かつ上記優先度フィルタに合致するドキュメント |
| **順序** | 処理する優先度ごとに **high → medium → low**（`pickTargets` で指定された優先度のみクエリ） |
| **成功時更新** | `nameJa`、`needsNameJa=false`、`lastNameJaTranslatedAt`、`nameJaUpdatedAt`、`updatedAt`、および `translationBlockedReason` / `nameJaSourceQuality` / `needsSourceEnrichment` を **削除**（FieldValue.delete） |
| **unsafe 生成時** | 保存しない。`translationBlockedReason: unsafe_generated_name` 等をマージ（`needsSourceEnrichment` は削除） |

主ログ:
- `[NAMEJA_TRANSLATE_START]`（`prioritiesResolved` 含む）
- `[NAMEJA_TRANSLATE_SOURCE_QUALITY]`
- `[NAMEJA_TRANSLATE_PICKED]`
- `[NAMEJA_TRANSLATE_SUCCESS]`
- `[NAMEJA_TRANSLATE_SKIP]`（`missing_source_name` / `already_safe` / `unsafe_generated_name` / `dry_run`）
- `[NAMEJA_TRANSLATE_ERROR]`
- `[NAMEJA_TRANSLATE_DONE]`（**必須集計**: `blockedMissingSource`、`blockedAlreadySafe`、`blockedUnsafeGenerated`、`blockedLowInsufficientSource`）

**目的**: **翻訳可能な商品だけ**を high/medium 中心に処理し、品質とコストを両立する。情報不足の low は **翻訳キューではなく補完待ち**として分離する。

1. **抽出**: `needsNameJa == true` + 優先度フィルタ
2. **ソース判定**: 不足なら LLM スキップ + `needsSourceEnrichment`
3. **処理**: 十分なソースのみ LLM で `nameJa` 生成
4. **成功後**: `needsNameJa = false`、ブロック用フィールド削除

**失敗時**: リトライ・デッドレターはジョブ基盤に依存。レポートの `nameJaMissing*` で偏りを監視。

---

### 5.5 Source enrichment ジョブ（将来・未実装）

**TODO（実装予定）**: `needsSourceEnrichment === true` の商品に対し、**別ジョブ**で以下を行う想定。

- ランキング DOM / 詳細 API 等から **brand・name・要約フィールド**の再取得・再補完
- 補完後に `needsSourceEnrichment` を落とし、再度 nightly 翻訳ジョブで `nameJa` を生成可能にする

実装時は crawler に専用ジョブ（例: `runNameJaSourceEnrichmentJob.ts`）を追加し、本節 5.4 の翻訳ジョブとは **役割を分離**する。コード先頭の TODO コメントも参照。

---

## 6. 商品詳細アクセス時の優先度昇格（案・未実装 TODO）

- **案**: 商品詳細が一定回数以上閲覧された（または初回詳細表示で）`translationPriority: "high"` と `needsNameJa: true` をマージ更新する。
- **現状**: **未実装**。実装時は `lastDetailViewAt` / `detailViewCount` 等のフィールド設計と、プライバシー・ログ基盤との整合が必要。

---

## 7. 公開前 / 公開後の役割分担（目安）

| フェーズ | 主担当 | 内容 |
|----------|--------|------|
| **公開前** | プロダクト / コンテンツ | ポリシー確定、サンプル確認、`PRE_LAUNCH_CHECKLIST`、launch report で `displayNameKoreanOriginal` 等を閾値管理 |
| **公開後** | 自動ジョブ + 監視 | nightly 翻訳、Firestore メタ更新、launch report / アラートで `nameJaMissing*` の偏りを確認 |
| **随時** | 手動 | 炎上・クレーム商品の個別 `nameJa` 修正、`needsNameJa: false` でキューから外す等 |

---

## 8. 関連コード・ドキュメント

- 表示: `src/lib/oliveyoung-display.ts`
- 公開面 goodsNo: `src/lib/oliveyoung-public-surface.ts`（`buildPublicSurfaceGoodsIndex`）
- レポート: `src/lib/oliveyoung-launch-report.ts`（`nameJaMissing*` は公開面を考慮）
- nightly: `scripts/flag-nameja-nightly-targets.ts`・即時: `scripts/flag-nameja-surface-targets.ts` + `mergeTranslationPriorityForNightly` / `translationPriorityCandidateFromSurfaceAndRank`（`oliveyoung-products.ts`）
- チェックリスト: `docs/PRE_LAUNCH_CHECKLIST.md`

---

## 9. 変更履歴

- 翻訳ジョブ既定を **high/medium のみ**に変更。`low` は `--priority=all` 等で明示時のみ。ソース不足は `needsSourceEnrichment` で補完待ちキューに分離。DONE 集計に `blockedLowInsufficientSource` 等を追加。5.5 source enrichment（将来）を追記。
- 初版: 優先度ベース運用・表示基準・nightly 設計・詳細昇格 TODO を明文化
