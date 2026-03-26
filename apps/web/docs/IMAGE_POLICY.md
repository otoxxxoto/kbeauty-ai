# 商品画像ポリシー（Olive Young / apps/web）

本文書は **表示用画像の解決ルール** と **公開時の安全方針** を定める。実装の単一ソースは `src/lib/product-display-image-resolve.ts` の `resolveProductDisplayImage` である。

---

## 方針サマリ

| 項目 | 内容 |
|------|------|
| **人物除去** | **未実装**。画像から人物を自動で消す処理（クロップ・ぼかし・inpainting 等）は行わない。 |
| **公開前〜現行** | **人物が写っている画像は表示しない**（Vision Job の `containsPerson` と解決順によりスキップし、次候補またはプレースホルダーへ）。 |
| **人物除去の位置づけ** | **post-launch 改善**（後続タスク）。詳細は本文末のバックログ参照。 |

例外: デバッグ用に `ALLOW_OY_PERSON_IMAGE=true` を設定した場合のみ、OY 公式 URL で人物あり・解析欠如も表示しうる（本番運用では使わない）。

---

## `safeImageUrl` の定義

- **意味**: Vision Job 等で **人物なし** と判定済みの URL を、パイプラインが **表示用に確定** したときに Firestore に保存するフィールド。
- **表示上の優先度**: `resolveProductDisplayImage` の **第1優先**。設定されていれば常にこれを採用し、「公式画像」バッジを付与する。
- **補足**: `hasSafeProductImage` などのフラグはデータ側のメタであり、解決ロジックの主キーは `safeImageUrl` 文字列の有無。

---

## Olive Young（OY）公式画像の扱い

- **対象 URL**: `imageUrl` / `thumbnailUrl` / `imageUrls` のうち、Amazon・楽天・Qoo10 等の **モール CDN でない** URL（`isOliveYoungStyleProductImageUrl`）。
- **採用条件（通常運用）**:
  - `safeImageUrl` が無いとき、上記 OY URL を順に見る。
  - `imageAnalysis` に同一 URL のエントリがあり、**`containsPerson === false`** のものだけ採用する。
  - 解析が無い URL は **スキップ**（人物未判定の OY 画像は出さない）。
- **「公式画像」バッジ**: `safe_image` または `oy_official_safe` で表示する画像に限り付与。

---

## Marketplace（Amazon / 楽天 / Qoo10）strong の扱い

- **前提**: `amazonImage` / `rakutenImage` / `qoo10Image` に URL があり、`imageAnalysis` で **同一 URL が人物なし** と判定されていること。
- **`marketplaceImageMatchLevels`**: メタが付いている場合、該当チャネルが **`strong`** のときだけモール画像を表示に使う（`weak` のみでは使わない）。
- **バッジ**: モール由来は **「公式画像」バッジを付けない**。

---

## プレースホルダーに落とす条件

次のいずれかで、表示 URL は静的 SVG（`OLIVEYOUNG_PRODUCT_IMAGE_FALLBACK_PATH`）になる。

1. **safeImageUrl も無く**、OY 候補がすべて「人物あり」または「未解析」のため OY を採用できない。
2. モール画像も、strong 条件・人物なし条件を満たさない（未解析・人物あり・weak のみ等）。

---

## 人物除去が「未実装」であること

- 現状パイプラインは **検出（Vision）と表示抑制** までである。
- **人物領域のクロップ・ぼかし、inpainting による除去** は行わない。よって「人物入りの OY 画像を加工して出す」経路はない。
- 公開判断: **「今は安全運用で公開する」**＝上記ルールで人物入りを出さない。**「人物除去は後続改善」**＝別途バックログで実装する。

---

## 実装候補（post-launch）

| 方向 | 概要 | リスク・注意 |
|------|------|----------------|
| **商品中心クロップ** | 人物が写っていても商品領域のみ切り出し | 誤クロップ・縦長サムネの崩れ。学習データ要否。 |
| **人物領域のぼかし** | プライバシー寄り。ブランドイメージは損なう可能性 | 規約・見た目の許容。 |
| **セグメンテーション + inpainting** | 背景復元で人物のみ消去 | コスト・品質ばらつき・処理時間。 |
| **`safeImageUrl` 再生成フロー** | 上記いずれかの出力を Job で書き戻し | 冪等性・差し替えタイミング・ロールバック。 |

---

## バックログ（優先度）

チェックリスト形式: [TODO_IMAGE_POST_LAUNCH.md](./TODO_IMAGE_POST_LAUNCH.md)

> 詳細なチケット化はプロジェクト運用に合わせて分割すること。

| 優先度 | タスク |
|--------|--------|
| **P1** | **人物入り画像の件数集計**（レポート指標の整備・ダッシュボード化）。`launch-report` の `personImageOnlyCount` / `noSafeImageButHasOyImageCount` / `placeholderCount` を運用で見る。 |
| **P2** | **商品中心クロップの実験**（サンプル SKU・オフライン評価）。 |
| **P3** | **人物マスク + inpainting の検証**（品質・レイテンシ・コスト）。 |
| **P4** | **`safeImageUrl` 再生成フロー**（ジョブ設計・Firestore 更新・表示との整合）。 |

---

## 関連ファイル

- `src/lib/product-display-image-resolve.ts` … 解決・`collectOyOrderedImageUrls`・レポート用ヘルパ
- `src/lib/oliveyoung-launch-report.ts` … 公開前レポート集計
- `src/components/ProductDisplayImage.tsx` … 読み込み失敗時のプレースホルダー
- `docs/PRE_LAUNCH_CHECKLIST.md` … 公開前チェック（画像方針の参照）
