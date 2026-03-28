/**
 * Amazon ASIN / 商品URLの自動紐付け（将来実装用メモ）
 *
 * TODO: バッチまたは管理APIから実行
 * 1. 入力: 商品名（日/韓）、brand、容量表記、既存 goodsNo / productUrl
 * 2. Amazon Product Advertising API または SP-API の catalog/search で候補一覧を取得
 * 3. 各候補の title と正規化したローカル名の類似度（トークン一致・Levenshtein・ブランド一致）でスコアリング
 * 4. 閾値以上の候補のみ採用し、Firestore に以下を書き込む:
 *    - asin, amazonUrl, amazonImageUrl, amazonTitle
 *    - 必要なら primaryShop の再計算や imageSource の更新
 * 5. 低信頼候補は別フィールド（amazonMatchConfidence 等）で保留状態にする想定
 *
 * 参照: `getPrimaryShop`（明示URL優先）, `getProductImage`, `getMarketScore`
 */

export {};
