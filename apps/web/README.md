K-Beauty 表示用 Web（Next.js App Router）

## セットアップ

```bash
cd apps/web
pnpm install
```

環境変数: `env.local.example` をコピーして `.env.local` にリネームし、GCS のバケット名を設定してください。

- `NEXT_PUBLIC_ING_BUCKET` … 例: kbeauty-public
- `NEXT_PUBLIC_ING_PREFIX` … 例: oliveyoung/ingredients（デフォルトのままでも可）
- `NEXT_PUBLIC_AMAZON_TAG` … Amazon アソシエイトのストアID（例: `yourid-22`）。未設定でも動作しますが検索URLに `tag` は付きません。
- `NEXT_PUBLIC_RAKUTEN_AFFILIATE_ID` … 楽天アフィリエイト用ID（検索リンクにクエリで付与）。未設定でも楽天検索URLは動作します。
- `NEXT_PUBLIC_QOO10_AFFILIATE_ID` … Qoo10 用ID（検索リンクにクエリで付与）。未設定でも Qoo10 検索URLは動作します。

## 商品画像（人物除外）

一覧・詳細のサムネイルは **safeImageUrl → OY 公式（imageAnalysis で人物なしのみ）→ マーケット strong（Vision 済み）→ プレースホルダー** の順で解決します（`resolveProductDisplayImage`）。  
**人物除去（クロップ・inpainting 等）は未実装**。公開時は人物入り画像を出さない安全運用。ルールと post-launch バックログは [docs/IMAGE_POLICY.md](./docs/IMAGE_POLICY.md)。  
データ投入は `apps/crawler` の `pnpm run oliveyoung:analyze-product-images` を参照してください。

### ランキング上位100・未解析 URL → Vision（本線パイプライン）

候補 URL の優先順は `src/lib/image-analysis-queue.ts`（`getUnanalyzedImageUrlsPrioritized`）。  
**NDJSON 契約（1 行）:** `{"goodsNo":"A…","rank":1,"url":"https://…"}` — `apps/crawler` の `oliveyoung:ingest-ranking-ndjson-vision` がそのまま読み込みます。

**1. 解析前スナップショット（比較用・stdout に JSON のみ）**

```bash
pnpm report-image-policy-stats -- --snapshot-json --label=before > policy-before.json
```
（人間向けの表は stderr に出ます。）

**2. 上位 100 枠の未解析 URL 抽出（stdout = NDJSON、メタは stderr）**

```bash
pnpm report-ranking-unanalyzed-image-urls -- --limit=100 2>ranking-unanalyzed.meta.log > ranking-unanalyzed.ndjson
```

**3. Vision 解析 → Firestore `imageAnalysis` 追記**（`GEMINI_API_KEY` と Firestore 認証が必要）

```bash
cd ../crawler
pnpm run oliveyoung:ingest-ranking-ndjson-vision -- --file=../web/ranking-unanalyzed.ndjson
```

**4. 解析後スナップショット**

```bash
cd ../web
pnpm report-image-policy-stats -- --snapshot-json --label=after > policy-after.json
pnpm compare-image-policy-snapshots policy-before.json policy-after.json
```

**5. ざっくり確認**（表のみ）: `pnpm report-image-policy-stats`（`--runDate=` 可）

- **見る指標:** `safe_person_free` の増加、`fallback_no_image` の減少（上位 50 / 100 枠のどちらも `compare-image-policy-snapshots` に表示）。

### Amazon PA-API（画像補完バッチ・任意）

`pnpm backfill-amazon-ranking-images` は **Product Advertising API 5.0** を使います。**PA-API の利用は Amazon アソシエイトアカウントの承認・資格が必要**です。資格がない場合は HTTP 403 等となり、**実装不備ではなくアカウント側の制限**です。資格のあるアカウントでのみ実行してください。当面は上記の OY + `imageAnalysis` を本線にしてください。

## 開発サーバー

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000) を開く。

## 公開前チェック（Olive Young）

- チェックリスト: [docs/PRE_LAUNCH_CHECKLIST.md](./docs/PRE_LAUNCH_CHECKLIST.md)
- 集計 JSON: `pnpm launch-report` または `pnpm launch-report:pretty`（`.env.local` 必須）
- HTTP: `INTERNAL_LAUNCH_REPORT_SECRET` 設定後、`GET /api/internal/oliveyoung-launch-report` + `Authorization: Bearer <SECRET>`

## OliveYoung ingredients 表示

Cloud Storage にアップロード済みの `oliveyoung_ingredients_<goodsNo>.json` を表示します。

**動作確認手順:**

1. `cd apps/web`
2. `pnpm install`
3. `.env.local` に `NEXT_PUBLIC_ING_BUCKET` と `NEXT_PUBLIC_ING_PREFIX` を設定（`env.local.example` をコピー）
4. `pnpm dev`
5. ブラウザで [http://localhost:3000/oliveyoung/A000000184228](http://localhost:3000/oliveyoung/A000000184228) を開く

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
