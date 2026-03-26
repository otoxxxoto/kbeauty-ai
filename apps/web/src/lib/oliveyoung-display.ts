/**
 * Olive Young Web 共通の表示用ヘルパー（商品名・ブランド・goodsNo 判定）
 */

/** Olive Young の goodsNo 形式っぽい文字列（タイトル欄に出さない） */
export function looksLikeOliveYoungGoodsNo(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const s = value.trim();
  return /^A\d{10,}$/.test(s);
}

/** name / nameJa がともに不十分なときの一覧・カード用 */
export const PRODUCT_TITLE_PENDING_JA = "商品名準備中";

/** 文中に紛れ込む goodsNo（A + 10桁以上） */
const GOODS_NO_INLINE = /A\d{10,}/;

/**
 * 化粧品カテゴリっぽい語（要約文の具体性判定などで使用）
 */
const PRODUCT_PURPOSE_HINT =
  /(クリーム|セラム|エッセンス|ローション|トナー|ミスト|オイル|バーム|マスク|パック|クレンジング|洗顔|下地|リップ|アイシャドウ|マスカラ|ファンデ|コンシーラ|シャンプー|トリートメント|美容液|化粧水|乳液|日焼け|サンケア|ボディ|ハンド|ネイル|パウダー|スクラブ)/;

export const MIN_SAFE_NAMEJA_GRAPHEMES = 4;

export type ProductNameDisplayInput = {
  nameJa?: string | null;
  name?: string | null;
  brand?: string | null;
  brandJa?: string | null;
};

export type UnsafeNameJaReason =
  | "empty"
  | "unknown_token"
  | "forbidden_word"
  | "weak_generic_only"
  | "contains_goods_no"
  | "pending_placeholder"
  | "too_short";

function nameJaGraphemeCount(t: string): number {
  return [...t].length;
}

export function isWeakGenericStandaloneCategoryJa(t: string): boolean {
  const compact = t.trim().replace(/\s+/g, "");
  return compact === "セラム" || compact === "クリーム" || compact === "マスク";
}

export function containsUnknownLikeInNameJa(t: string): boolean {
  return /unknown/i.test(t) || t.includes("アンノウン");
}

export function containsForbiddenNameJaFragments(t: string): boolean {
  if (t.includes("商品")) return true;
  if (t.includes("製品")) return true;
  if (t.includes("美容ケア")) return true;
  if (t.includes("化粧品")) return true;
  return false;
}

export function explainUnsafeNameJa(
  value: string | null | undefined,
  _ctx?: Pick<ProductNameDisplayInput, "brand" | "brandJa">
): UnsafeNameJaReason | null {
  if (value == null || typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return "empty";
  if (t === PRODUCT_TITLE_PENDING_JA) return "pending_placeholder";
  if (GOODS_NO_INLINE.test(t)) return "contains_goods_no";
  if (containsUnknownLikeInNameJa(t)) return "unknown_token";
  if (containsForbiddenNameJaFragments(t)) return "forbidden_word";
  if (isWeakGenericStandaloneCategoryJa(t)) return "weak_generic_only";
  if (nameJaGraphemeCount(t) < MIN_SAFE_NAMEJA_GRAPHEMES) return "too_short";
  return null;
}

/**
 * 画面表示に使うべきでない nameJa（禁止語・Unknown 混入・短すぎ・goodsNo 混入等）
 * null / undefined は false（未設定は別扱い）
 */
export function isUnsafeNameJa(
  value: string | null | undefined,
  ctx?: Pick<ProductNameDisplayInput, "brand" | "brandJa">
): boolean {
  return explainUnsafeNameJa(value, ctx) !== null;
}

/**
 * 一覧・カード・詳細の表示用商品名。
 * - nameJa が安全 → nameJa
 * - nameJa が不安全で name が使える → name（韓国語オリジナル名のフォールバック）
 * - 両方ダメ → 商品名準備中
 */
export function getDisplayProductNameText(product: ProductNameDisplayInput): string {
  const ja = product.nameJa?.trim() ?? "";
  const raw = product.name?.trim() ?? "";
  if (ja && !isUnsafeNameJa(ja, product)) return ja;
  if (raw && !looksLikeOliveYoungGoodsNo(raw) && raw !== "（商品名なし）") return raw;
  return PRODUCT_TITLE_PENDING_JA;
}

/**
 * @deprecated 新規は getDisplayProductNameText を使用（brand 引数で低品質 nameJa を弾ける）
 */
export function getDisplayProductTitle(input: ProductNameDisplayInput): string {
  return getDisplayProductNameText(input);
}

/**
 * brandJa が LLM 暴走・説明文混入などの異常値かどうか。
 * 該当する場合は画面では brand にフォールバックする。
 */
export function isUnsafeBrandJa(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  if (t.length > 40) return true;
  if (/[\r\n]/.test(value)) return true;
  if (/THINK:/i.test(t)) return true;
  if (t.includes("ユーザーは")) return true;
  if (t.includes("アシスタント")) return true;
  if (t.includes("翻訳")) return true;
  if (t.includes("韓国語")) return true;
  if (t.includes("日本語")) return true;
  return false;
}

/**
 * ブランド表示の統一入口。安全な brandJa のみ採用し、それ以外は brand。
 */
export function getDisplayBrandText(input: {
  brand?: string | null;
  brandJa?: string | null;
}): string {
  const raw = input.brand?.trim() || "";
  const ja = input.brandJa?.trim() || "";
  if (ja && !isUnsafeBrandJa(ja)) return ja;
  return raw || "";
}

// ---------------------------------------------------------------------------
// 口コミ要約・成分・商品特徴など LLM 生成本文の表示ガード（goodsNo 混入・テンプレ暴走）
// ---------------------------------------------------------------------------

/** 口コミ要約・成分説明などの本文に Olive Young 形式の goodsNo が含まれる */
export function containsUnsafeGoodsNoText(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  return GOODS_NO_INLINE.test(value);
}

/** 本文中で goodsNo が文の主題（「A000…は」）になっている */
const GOODS_NO_AS_TOPIC = /(?:^|[。\n])\s*A\d{10,}\s*は/u;

/** 具体性の薄い締め（商品名なしのテンプレっぽい文） */
const SUMMARY_GENERIC_CLOSING =
  /(が期待されます|と期待されます|であることが期待|と考えられます|が期待できるでしょう)(?:[。．.!！?？]|$)/;

const SUMMARY_SUBSTANCE_HINT =
  /(クリーム|セラム|エッセンス|ローション|トナー|ミスト|オイル|バーム|マスク|パック|クレンジング|洗顔|下地|リップ|美容液|化粧水|乳液|日焼け|サンケア|ボディ|ハンド|成分|配合|無添加|刺激|低刺激|保湿|うるおい|ハリ|ツヤ|シワ|シミ|毛穴|肌|乾燥|敏感肌|ニキビ|皮脂|香り|テクスチャ|アルコール|防腐)/;

/**
 * 画面に出さないべき生成要約・説明文（空文字は false＝「未設定」扱い）
 */
export function isUnsafeGeneratedSummary(value: string | null | undefined): boolean {
  if (value == null || typeof value !== "string") return false;
  const t = value.trim();
  if (!t) return false;
  if (containsUnsafeGoodsNoText(t)) return true;
  if (/^A\d{10,}\s*は/u.test(t)) return true;
  if (GOODS_NO_AS_TOPIC.test(t)) return true;
  if (
    t.length <= 200 &&
    SUMMARY_GENERIC_CLOSING.test(t) &&
    !SUMMARY_SUBSTANCE_HINT.test(t) &&
    !PRODUCT_PURPOSE_HINT.test(t)
  ) {
    return true;
  }
  return false;
}

/** safe な本文だけ返す。unsafe または空は null */
export function getSafeSummaryBodyOrNull(value: string | null | undefined): string | null {
  const t = typeof value === "string" ? value.trim() : "";
  if (!t) return null;
  if (isUnsafeGeneratedSummary(t)) return null;
  return t;
}

/** 商品特徴ブロックで本文がすべて足りないとき（比較導線向け） */
export const SUMMARY_DISPLAY_FALLBACK_COMPARE =
  "商品情報を確認しながら価格・在庫を比較できます。";

/** 補助メッセージ */
export const SUMMARY_DISPLAY_FALLBACK_UPDATING = "詳細情報は順次更新中です。";

/** 従来の短い固定文（弱い特徴文として扱い、単体ではメイン本文に使わない） */
export const PRODUCT_FEATURE_FALLBACK_LEGACY = "韓国オリーブヤングで確認された商品情報です。";

/** 固定文・プレースホルダーに近い商品特徴 summaryJa か */
export function isWeakProductFeatureSummaryJa(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t === PRODUCT_FEATURE_FALLBACK_LEGACY) return true;
  const noPeriod = t.replace(/[。．.]+$/u, "").trim();
  const fbCore = PRODUCT_FEATURE_FALLBACK_LEGACY.replace(/[。．.]+$/u, "").trim();
  if (noPeriod === fbCore) return true;
  if (/韓国オリーブヤングで確認された商品情報/.test(t) && t.length <= 48) return true;
  return false;
}

/** 先頭の1文を取る（改行は空白化）。maxLen 超は「…」 */
function takeFirstSentenceJa(raw: string, maxLen: number): string {
  const one = raw.replace(/\r\n/g, "\n").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (!one) return "";
  const m = one.match(/^(.+?[。！？])(.*)$/u);
  const first = m ? m[1].trim() : one.slice(0, maxLen);
  let out = first;
  if (out.length > maxLen) out = `${out.slice(0, Math.max(1, maxLen - 1)).trim()}…`;
  return out;
}

/** 箇条書き行から短いフラグメントを最大 max 個 */
function extractBulletFragments(text: string, max: number): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const stripped = trimmed.replace(/^[・\-\*●•･・]\s*/u, "").trim();
    const looksBullet = stripped !== trimmed || /^[・\-\*●•･]/u.test(trimmed);
    if (!looksBullet) continue;
    if (stripped.length >= 2 && stripped.length <= 48) {
      out.push(stripped);
      if (out.length >= max) break;
    }
  }
  return out;
}

/**
 * reviewSummaryJa / ingredientSummaryJa（すでに safe フィルタ済み想定）から商品特徴向け短い 1〜2 文
 */
export function buildProductFeatureFromReviewAndIngredient(
  reviewJa: string | undefined | null,
  ingredientJa: string | undefined | null
): string {
  const r = (reviewJa ?? "").trim();
  const ing = (ingredientJa ?? "").trim();

  const bullets = r ? extractBulletFragments(r, 3) : [];
  let fromReview = "";
  if (bullets.length >= 1) {
    const joined = bullets.slice(0, 2).join("、");
    fromReview = joined;
    if (!/[。！？]$/u.test(fromReview)) {
      fromReview = `${fromReview}といった声が多く見られます`;
    }
  } else if (r) {
    fromReview = takeFirstSentenceJa(r, 140);
  }

  let fromIng = "";
  if (ing) {
    fromIng = takeFirstSentenceJa(ing, 100);
  }

  if (fromReview && fromIng) {
    const a = /[。！？]$/u.test(fromReview) ? fromReview : `${fromReview}。`;
    const b = /[。！？]$/u.test(fromIng) ? fromIng : `${fromIng}`;
    return `${a}${b}`;
  }
  if (fromReview) return /[。！？]$/u.test(fromReview) ? fromReview : `${fromReview}。`;
  if (fromIng) return /[。！？]$/u.test(fromIng) ? fromIng : `${fromIng}。`;
  return "";
}

export type ProductFeatureDisplayInput = {
  summaryJa?: string | null;
  reviewSummaryJa?: string | null;
  ingredientSummaryJa?: string | null;
};

/**
 * 商品特徴の表示用段落。
 * - summaryJa が safe かつ十分な長さ → そのまま
 * - それ以外は口コミ・成分の safe な片方／両方から合成
 * - だめなら SUMMARY_DISPLAY_FALLBACK_COMPARE
 */
export function resolveProductFeatureDisplayParagraph(
  product: ProductFeatureDisplayInput
): string {
  const safeSummary = getSafeSummaryBodyOrNull(product.summaryJa);
  if (safeSummary && !isWeakProductFeatureSummaryJa(safeSummary)) {
    return safeSummary;
  }
  const safeReview = getSafeSummaryBodyOrNull(product.reviewSummaryJa);
  const safeIng = getSafeSummaryBodyOrNull(product.ingredientSummaryJa);
  const composed = buildProductFeatureFromReviewAndIngredient(safeReview, safeIng).trim();
  if (composed) return composed;
  return SUMMARY_DISPLAY_FALLBACK_COMPARE;
}
