/**
 * Web 側 oliveyoung-display.ts の isUnsafeGeneratedSummary と同等（同期推奨）
 * summaryJa / ingredientSummaryJa / reviewSummaryJa の再生成判定に使用
 */

const GOODS_NO_INLINE = /A\d{10,}/;

/** 本文中で goodsNo が文の主題（「A000…は」）になっている */
const GOODS_NO_AS_TOPIC = /(?:^|[。\n])\s*A\d{10,}\s*は/u;

const SUMMARY_GENERIC_CLOSING =
  /(が期待されます|と期待されます|であることが期待|と考えられます|が期待できるでしょう)(?:[。．.!！?？]|$)/;

const SUMMARY_SUBSTANCE_HINT =
  /(クリーム|セラム|エッセンス|ローション|トナー|ミスト|オイル|バーム|マスク|パック|クレンジング|洗顔|下地|リップ|美容液|化粧水|乳液|日焼け|サンケア|ボディ|ハンド|成分|配合|無添加|刺激|低刺激|保湿|うるおい|ハリ|ツヤ|シワ|シミ|毛穴|肌|乾燥|敏感肌|ニキビ|皮脂|香り|テクスチャ|アルコール|防腐)/;

const PRODUCT_PURPOSE_HINT =
  /(クリーム|セラム|エッセンス|ローション|トナー|ミスト|オイル|バーム|マスク|パック|クレンジング|洗顔|下地|リップ|アイシャドウ|マスカラ|ファンデ|コンシーラ|シャンプー|トリートメント|美容液|化粧水|乳液|日焼け|サンケア|ボディ|ハンド|ネイル|パウダー|スクラブ)/;

export function containsUnsafeGoodsNoText(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  return GOODS_NO_INLINE.test(value);
}

/** 生成要約・説明文が画面／保存に不適切か（空は false） */
export function isUnsafeGeneratedSummary(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  return isUnsafeSummaryCore(t);
}

/** 未設定または unsafe なら再生成対象 */
export function summaryFieldNeedsRegeneration(value: string | null | undefined): boolean {
  const t = value != null ? String(value).trim() : "";
  if (t === "") return true;
  return isUnsafeGeneratedSummary(t);
}

/** reviewSummaryJa 専用の unsafe 判定（口コミ要約） */
export function isUnsafeReviewSummaryJa(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  return isUnsafeSummaryCore(t);
}

/** ingredientSummaryJa 専用の unsafe 判定（成分解説） */
export function isUnsafeIngredientSummaryJa(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  return isUnsafeSummaryCore(t);
}

/** summaryJa 専用の unsafe 判定（補助説明） */
export function isUnsafeSummaryJa(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  return isUnsafeSummaryCore(t);
}

/**
 * 共通 unsafe 条件（goodsNo 混入・仮文・極端に短い・テンプレだけ）
 * A000... / goodsNo 主語 / 明らかに仮文 / 極端に短い / 意味が薄いテンプレ
 */
function isUnsafeSummaryCore(t: string): boolean {
  if (containsUnsafeGoodsNoText(t)) return true;
  if (/^A\d{10,}\s*は/u.test(t)) return true;
  if (GOODS_NO_AS_TOPIC.test(t)) return true;
  if (t.length < 30) return true;
  if (
    t.length <= 200 &&
    SUMMARY_GENERIC_CLOSING.test(t) &&
    !SUMMARY_SUBSTANCE_HINT.test(t) &&
    !PRODUCT_PURPOSE_HINT.test(t)
  ) {
    return true;
  }
  if (/^(商品名|製品名|要約|説明).{0,12}(準備中|未取得|未設定|TBD|要確認|なし)/i.test(t))
    return true;
  return false;
}
