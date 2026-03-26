# TODO: 画像パイプライン（post-launch）

人物除去は **未実装**。方針・定義は [IMAGE_POLICY.md](./IMAGE_POLICY.md)。

運用でチェックボックスを更新すること。

- [ ] **P1 — 人物入り画像の件数集計**  
  - `pnpm launch-report` の `personImageOnlyCount` / `noSafeImageButHasOyImageCount` / `placeholderCount` を定期確認  
  - 必要ならダッシュボード・Slack 通知

- [ ] **P2 — 商品中心クロップの実験**  
  - サンプル SKU・オフライン品質評価・サムネ枠との整合

- [ ] **P3 — 人物マスク + inpainting の検証**  
  - 品質・レイテンシ・コスト・失敗時フォールバック

- [ ] **P4 — `safeImageUrl` 再生成フロー**  
  - ジョブ設計・Firestore 更新・ロールバック・表示キャッシュ
