# PROJECT BOUNDARY: kbeauty-ai / kbeauty-web

## 1. このメモの目的

- `kbeauty-ai` と `kbeauty-web` の責務境界を固定し、実装判断を迷わない状態にする。
- 引き継ぎ時に「どちらが正本か」を一目で分かるようにする。
- 独自ドメイン公開時の接続先と運用責任を明確にする。
- 将来機能追加時も、責務混在を防ぐ判断基準として使う。

## 2. 全体構成の要約

- **構成方針**: 生成と更新は `kbeauty-ai`、公開表示は `kbeauty-web`。
- **共通基盤**: Firestore を両者の共通データソースとして使う。
- **公開面**: ユーザーが触る公開サイトは `kbeauty-web`。
- **裏方処理**: 収集、整形、補完、定期更新は `kbeauty-ai`。
- **結論**: 2 リポジトリ分離は問題ではなく、運用上自然で正しい構成。

## 3. kbeauty-ai の役割（データ側の正本）

- crawler 実行によるデータ収集。
- Firestore への書き込みと更新。
- rankings データ生成。
- image 補完処理。
- `brandJa` / `nameJa` / `reviewSummaryJa` / `ingredientSummaryJa` の補完。
- Cloud Run Job / Cloud Scheduler による定期運用。
- Firestore を中心としたデータ基盤の品質維持。

補足:
- `kbeauty-ai` は利用者向け UI を提供する場所ではない。
- `kbeauty-ai` の成果物は「表示用データ」であり、表示責務は持たない。

## 4. kbeauty-web の役割（公開側の正本）

- Next.js による公開 Web サイト実装。
- トップページ、ランキング、詳細ページ等の画面提供。
- metadata、SEO、内部導線、CTA、UI/UX、デザイン。
- Firestore からデータを読み取り、閲覧者に表示。
- 読み取り時の表示補完（フォールバック）は許可。ただしデータ正本更新は行わない。

補足:
- 公開サイトとして表に出るのは `kbeauty-web`。
- 収集・更新ジョブは `kbeauty-web` に置かない。

## 5. どちらに何を実装するべきか

### kbeauty-ai に実装するもの

- 新しいデータ収集ロジック。
- Firestore への保存スキーマ変更。
- 補完ジョブ、再計算ジョブ、バックフィル。
- Scheduler 運用、ジョブ失敗時リカバリ。

### kbeauty-web に実装するもの

- 新しいページ、UI コンポーネント、デザイン改修。
- SEO 改善（title/description/構造化データ）。
- 表示フォールバック、導線改善、CVR 改善。
- フロントで必要な閲覧専用 API 層。

## 6. Firestore の位置づけ

- Firestore は `kbeauty-ai` と `kbeauty-web` の共通データソース。
- データの生成責任は `kbeauty-ai` にある。
- データの表示責任は `kbeauty-web` にある。
- 原則として、`kbeauty-web` は Firestore を読み取り中心で利用する。

## 7. Cloud Run Job / Scheduler はどちらに属するか

- Cloud Run Job / Scheduler は `kbeauty-ai` に属する。
- `kbeauty-web` 側で定期データ更新ジョブは持たない。
- 運用監視（成功/失敗、再実行、タイムアウト調整）も `kbeauty-ai` 管轄。

## 8. 独自ドメイン公開時の構成

- 独自ドメインは将来的に `kbeauty-web` 側へ接続する。
- `kbeauty-ai` は非公開の裏方処理として維持する。
- 公開 DNS、CDN、HTTPS 証明書、SEO 評価対象は `kbeauty-web` に集約する。

## 9. 実際に公開される予定のページ構成

- `/` または `/oliveyoung`（トップ）
- `/oliveyoung/rankings/[runDate]`（商品ランキング）
- `/oliveyoung/brands/[runDate]`（ブランドランキング）
- `/oliveyoung/products/[goodsNo]`（商品詳細）
- `/oliveyoung/brands/[runDate]/[brandKey]`（ブランド詳細）
- `/oliveyoung/category/[slug]`（カテゴリページ）

## 10. 将来追加される可能性があるページや機能

- 比較ページ（価格比較、類似商品比較）。
- ランキング推移ページ（runDate 横断）。
- ブランド特集ページ（編集コンテンツ）。
- 検索・フィルタ・並び替えの強化。
- 言語展開ページ（多言語表示）。

注記:
- 追加ページは `kbeauty-web` に実装し、必要データ生成は `kbeauty-ai` に追加する。

## 11. 実装判断ルール

- **表示ロジックは web**: 画面、導線、SEO、UI/UX は `kbeauty-web`。
- **データ生成・更新は ai**: 収集、補完、保存、再処理は `kbeauty-ai`。
- **表示の一時補完は web 可**: 読み取り時フォールバックは許可。
- **正本補完は ai 必須**: 欠損を恒久的に埋める処理は `kbeauty-ai` で実装。
- **迷ったら責務で判定**: 「ユーザーに見せる変更か」「データを更新する変更か」で決める。

## 12. 今後の運用方針

- 役割分離を維持する。
- `kbeauty-web` は公開品質（表示安定、SEO、導線）を主軸に改善する。
- `kbeauty-ai` はデータ品質（欠損率、更新頻度、再現性）を主軸に改善する。
- 境界をまたぐ要件は、まずこのメモの原則に照らして設計判断する。

## 13. やってはいけないこと（責務の混在）

- `kbeauty-web` に Firestore の正本更新ロジックを常設しない。
- `kbeauty-ai` に公開ページや SEO ロジックを実装しない。
- 同じデータ更新を `ai` と `web` の両方で二重実装しない。
- 緊急対応を恒久化して境界を曖昧にしない。

## 14. 一言でまとめた結論

- **「見せるのは web、作るのは ai」** を今後も不変の原則とする。

