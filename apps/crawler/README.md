# @kbeauty-ai/crawler

K-Beauty商品情報スクレイピング・成分抽出PoC

## 設計・役割分担

本プロジェクトは `kbeauty-ai`（データ基盤）と `kbeauty-web`（公開サイト）で責務を分離しています。  
実装判断の基準と運用方針は以下を参照してください。  
→ [docs/PROJECT_BOUNDARY_KBEAUTY.md](../../docs/PROJECT_BOUNDARY_KBEAUTY.md)

## OliveYoung 成分取得

**本命: description API 直接取得**

```bash
pnpm run oliveyoung:ingredients -- --goods=A000000184228,A000000xxxxx
# または
OLIVEYOUNG_GOODS_LIST="A000000184228,A000000xxxxx" pnpm run oliveyoung:ingredients
```

出力: `out/reports/oliveyoung_ingredients_<goodsNo>.json`

**GCS アップロード（オプション）**

```bash
pnpm run oliveyoung:ingredients -- --goods=A000000184228 --upload=1
# または
UPLOAD_GCS=1 pnpm run oliveyoung:ingredients -- --goods=A000000184228
```

環境変数: `GCS_BUCKET_INGREDIENTS`（例: kbeauty-public）、`GCS_PREFIX_INGREDIENTS`（例: oliveyoung/ingredients）。  
`env.example` をコピーして `.env` にし、値を設定してください。

**診断用: PoC（Playwright クリック・ネットワーク保存）**

```bash
pnpm run poc:oliveyoung
```

## Cloud Run Job: 画像補完 (kbeauty-oy-fill-images)

**重要:** この Job は画像補完専用です。`oliveyoung:rankings` / `index.ts --rankings` は使わず、画像補完専用 entry だけを起動してください。

### 方法A: 画像補完専用イメージでデプロイ（推奨）

リポジトリルートでビルド:

```bash
docker build -f apps/crawler/Dockerfile.fill-image -t <REGISTRY>/crawler-fill-image:latest .
```

このイメージのデフォルト CMD は `pnpm run oliveyoung:run-fill-image` です。  
Job の環境変数で `LIMIT=20` など件数を指定してください。

### 方法B: 既存イメージの command を上書き

同一イメージを rankings と共有する場合、Job 作成・更新時に **command** を画像補完用に設定してください。

- **command:** `pnpm` / **args:** `run`, `oliveyoung:run-fill-image`
- **環境変数:** `LIMIT=20`（任意）

どちらの方法でも、ログに `[FILL_IMAGE_START]` / `[FILL_IMAGE_ITEM]` 等が出れば画像補完専用で起動しています。`oliveyoung:rankings` や `index.ts --rankings` のログが出る場合は、Job の command がまだ rankings 用になっているため、上記のとおり設定し直してください。

### ローカルで画像補完だけ実行

```bash
pnpm run oliveyoung:run-fill-image
# または
LIMIT=20 pnpm run oliveyoung:run-fill-image
```

## 商品画像 Vision 判定（人物除外・safeImageUrl）

Gemini Vision で画像 URL を解析し、`oliveyoung_products_public` に `imageAnalysis` / `safeImageUrl` / `hasSafeProductImage` を書き込みます。  
同一 URL の結果は `image_analysis_cache`（SHA256 ドキュメント ID）にキャッシュします。

**前提:** `GEMINI_API_KEY`、Firestore クレデンシャル（ADC）

```bash
# imageVisionAnalyzedAt 未設定の商品から最大 10 件（デフォルト・documentId 昇順）
pnpm run oliveyoung:analyze-product-images

# 未解析から 25 件ずつ（繰り返すと stats の件数が増える）
pnpm run oliveyoung:analyze-product-images -- 25

# goodsNo 指定（リスト内で未解析のものだけ処理）
pnpm run oliveyoung:analyze-product-images -- --goods=A000000000001,A000000000002

# TOP ページ相当の goodsNo だけ（急上昇→注目→ランキング、既定最大 20 件）
pnpm run oliveyoung:analyze-product-images -- --top=20
# 処理上限を別指定（例: TOP 20 件を最大 50 枠まで処理）
pnpm run oliveyoung:analyze-product-images -- --top=20 50
```

### ランキング上位の未解析 URL（Web NDJSON）→ Vision 追記

`apps/web` の `report-ranking-unanalyzed-image-urls` が **stdout** に出す 1 行 1 JSON（`goodsNo` / `rank` / `url` / `sourceField`。**メタ・Firestore 初期化は stderr**）を読み、行ごとに Gemini で解析して `oliveyoung_products_public.imageAnalysis` へ **マージ**します。  
**同一 URL の行が既にあればスキップ**。`imageVisionAnalyzedAt` は付けません（部分追記。全件のし直しは上記 `oliveyoung:analyze-product-images`）。

```bash
# 例: Web で NDJSON をファイルに保存してから実行（メタは stderr）
cd apps/web
pnpm --silent run report-ranking-unanalyzed-image-urls -- --limit=100 2>ranking-unanalyzed.meta.log > ../crawler/ranking-unanalyzed.ndjson
cd ../crawler
pnpm run oliveyoung:ingest-ranking-ndjson-vision -- --file=ranking-unanalyzed.ndjson

# stdin パイプ（Unix 系）
# pnpm report-ranking-unanalyzed-image-urls -- --limit=100 2>/dev/null | (cd ../crawler && pnpm exec tsx src/jobs/ingestRankingNdjsonVisionJob.ts)

# ドライラン・先頭 20 行だけ
pnpm run oliveyoung:ingest-ranking-ndjson-vision -- --dry-run --file=ranking-unanalyzed.ndjson --limit=20
```

オプション: `--sleep-ms=450`（API 間隔）、`--limit=N`（処理する **有効 NDJSON 行**の上限）。

Web 表示は **Vision 済み** のみ（未解析の raw `imageUrl` は使いません）。本ジョブ実行後に画像が出ます。

### TOP ページ専用診断（Firestore vs 表示 URL）

TOP と同じソースで `goodsNo` を集め、`oliveyoung_products_public` の画像フィールドと Web 相当の `resolvedDisplayImageUrl` を一覧します。  
ログ: `[TOP_GOODS_NOS]` / `[TOP_PRODUCT_IMAGE_ROWS]` / `[TOP_IMAGE_DIAG_SUMMARY]` / `[TOP_IMAGE_DIAG_VERDICT]`（A: データ不足寄り / B: 表示ロジック寄り）。

```bash
pnpm run oliveyoung:diag-top-images
pnpm run oliveyoung:diag-top-images -- 30   # 最大 goodsNo 数（既定 20、上限 100）
```

### TOP で「画像なし」の商品だけ（ピンポイント診断）

`/oliveyoung` の **急上昇カード＋今日の注目 TOP3** だけを対象に、`resolveProductDisplayImageUrl` 相当が空のスロットを抽出し、Firestore の画像フィールドと A/B/C 分類を出します。

- `[TOP_IMAGE_MISSING]` … スロット情報（`riseRank` は急上昇枠内の順 1..n）
- `[TOP_IMAGE_MISSING_FIRESTORE]` … 各 `goodsNo` の Firestore 状態＋分類
- `[TOP_IMAGE_MISSING_GOODS_ARG]` … `--goods=` 用カンマ区切り（重複 `goodsNo` は 1 回だけ）
- `[TOP_IMAGE_MISSING_GOODS_ARG_B]` … **分類 B だけ**（マケプレ画像補完向け）。空なら `(none)`
- `[TOP_IMAGE_MISSING_CLASSIFICATION]` … A/B/C 件数サマリ
- `[TOP_PRODUCT_IDENTIFIABILITY]` … TOP カード各件の `identifiable` と理由（外部ECで探せる商品名か）
- `[TOP_IMAGE_MISSING_ENRICHMENT_READY]` … 画像なしスロットの **B1（補完可）/ B2（先に名前置換）** と Vision の A/B/C
- `[TOP_IMAGE_MISSING_ENRICHMENT_SUMMARY]` … 画像なしの B1/B2 件数
- `[TOP_PRODUCT_EXAMPLE_A000000234422]` … 例示 goodsNo の分類（TOP またはランキング500マージ）
- `[LOW_QUALITY_NAMEJA]` … nameJa 品質候補（`source`: `top_slot` / `ranking_top`）

```bash
pnpm run oliveyoung:diag-top-missing-images
# 急上昇最大件数・注目件数（既定 5 と 3）
pnpm run oliveyoung:diag-top-missing-images -- 5 3
# 第3引数: ランキング上位から nameJa 品質スキャン件数（既定 30。内部で最大500件マージし例示 goodsNo 解決に利用）
pnpm run oliveyoung:diag-top-missing-images -- 5 3 50
```

**分類:** A＝`imageVisionAnalyzedAt` なし（未解析）／B＝Vision 済・`imageAnalysis` あり・`safeImageUrl` なし（マケプレ補完向け）／C＝`safeImageUrl` はあるのに解決 URL が空（表示ロジック要調査）。

**画像なしの補完可否（B1/B2）:** Vision A/B/C とは別。**B1**＝商品特定可能→マーケプレ画像補完可。**B2**＝特定不能→先に `nameJa` / `name` 整備。

### マーケット画像の手動補完（B 分類・単品）

Web は Amazon / 楽天 / Qoo10 の URL を使うとき **その URL と一致する `imageAnalysis` 行があり `containsPerson===false` であること**が必須です（URL フィールドだけでは表示されません）。

```bash
pnpm run oliveyoung:set-market-image -- --goods=A000000234422 --market=amazon --url="https://..."
# 楽天 / Qoo10
pnpm run oliveyoung:set-market-image -- --goods=... --market=rakuten --url="https://..."
pnpm run oliveyoung:set-market-image -- --goods=... --market=qoo10 --url="https://..."
# safeImageUrl のみ（analysis 不要）
pnpm run oliveyoung:set-market-image -- --goods=... --market=safe --url="https://..."
```

- デフォルト: 指定マーケットの画像フィールド **＋** `imageAnalysis` に `{ url, containsPerson: false, ... }` を upsert
- `--no-merge-analysis`: `imageAnalysis` を更新しない（通常は画面に出ないので非推奨）
- `--dry-run`: 更新内容のみ表示

更新後、TOP・商品詳細・カテゴリはいずれも `resolveProductDisplayImageUrl` 経由のため、同じルールで画像が載ります。

### 保存状況の集計（画像なしの切り分け）

`oliveyoung_products_public` について、`safeImageUrl` / `imageAnalysis` / `hasSafeProductImage` / `imageVisionAnalyzedAt` の件数とサンプル 5 件を表示します。

```bash
pnpm run oliveyoung:image-analysis:stats
```

Vision ジョブの成功・失敗件数は実行ログ（`[IMAGE_VISION_OK]` / `[IMAGE_VISION_FAIL]`）を参照してください。Firestore にはジョブ履歴コレクションはありません。

## テスト

```bash
pnpm run test
pnpm run test:ingredients  # OliveYoung 成分取得の最小テスト
```

## nameJa 優先度の自動運用（surface / nightly）

公開面の日本語補完フラグは `apps/web` のスクリプトを crawler から起動して日次運用に組み込む。

- **日次ランキング本体の直後**: `runOliveyoungRankingsJob` 内で `flag-nameja-surface-targets` を自動実行  
  ログ: `[DAILY_NAMEJA_SURFACE_START]` / `[DAILY_NAMEJA_SURFACE_DONE]`
- **夜間 1 日 1 回**: `JOB_TYPE=nameja-nightly-targets`（または `pnpm run oliveyoung:nameja-nightly-targets`）で `flag-nameja-nightly-targets` を実行  
  ログ: `[DAILY_NAMEJA_NIGHTLY_START]` / `[DAILY_NAMEJA_NIGHTLY_DONE]`

### 手動実行（従来どおり）

```bash
# apps/web で直接
pnpm run flag-nameja-surface-targets -- --dry-run
pnpm run flag-nameja-nightly-targets -- --dry-run

# apps/crawler 側の夜間ジョブ実行
JOB_TYPE=nameja-nightly-targets pnpm run oliveyoung:job
# または
pnpm run oliveyoung:nameja-nightly-targets
```

## nightly 実翻訳ジョブ（needsNameJa 消化）

フラグ付け済み (`needsNameJa=true`) 商品を、優先度順 (`high` → `medium` → `low`) で翻訳して保存します。

```bash
# 通常実行
pnpm run oliveyoung:nameja-translate

# dry-run（保存なし）
pnpm run oliveyoung:nameja-translate -- --dry-run

# 件数制限
pnpm run oliveyoung:nameja-translate -- --limit=20

# 優先度絞り込み
pnpm run oliveyoung:nameja-translate -- --priority=high --limit=20

# JOB_TYPE 経由
JOB_TYPE=nameja-translate pnpm run oliveyoung:job
```

失敗・unsafe 生成時は既存 `nameJa` を壊さず、`needsNameJa=true` のまま次回再実行で回復できます。
