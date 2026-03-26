/**
 * データ型定義（PoC版）
 */

export type Source = 'oliveyoung' | 'qoo10' | 'rakuten';

export interface ProductRaw {
  source: Source;
  url: string;
  fetched_at: string; // ISO 8601
  html_path: string; // 保存されたHTMLファイルのパス
  fetch_method?: 'http' | 'playwright'; // 取得方法
  ingredient_hint_best?: string; // ネットワークから取得した最良の成分情報
  ingredient_hint_meta?: {
    url: string;
    contentType: string;
    length: number;
    score: number;
    snippet: string;
  };
  ingredient_panel_selector?: string; // 成分パネルのセレクタ（DOM抽出用）
  network_candidates_file?: string; // network候補のデバッグファイルパス（ingredients_not_found時のデバッグ用）
}

export interface ProductParsed {
  source: Source;
  url: string;
  fetched_at: string;
  fetch_method?: 'http' | 'playwright'; // 取得方法
  parse_source?: 'dom' | 'network' | 'none'; // 成分抽出元
  title: string | null;
  brand: string | null;
  price: number | null;
  currency: 'KRW' | 'JPY' | null;
  volume_text: string | null;
  ingredients_text: string | null;
  parse_ok: boolean;
  fail_reasons: string[];
  // デバッグ用フィールド（任意）
  ingredients_raw_hint_snippet?: string; // 先頭300文字
  ingredients_normalized_snippet?: string; // 先頭300文字
  ingredients_normalize_source?: string; // normalizeFromHintsのsource
  normalized_has_common_hints?: boolean; // water/glycerin/정제수/글리세린等を含むか
  // DOM抽出デバッグ用フィールド
  ingredients_dom_text_length?: number; // 正規化前のDOM抽出テキストの文字数
  dom_delimiter_count?: number; // 正規化前のDOM抽出テキストの区切りの数
  contains_common_hints_before_normalize?: boolean; // 正規化前のDOM抽出テキストにcommon hints（water/정제수/glycerin/글리세린）が含まれるか
  // 成分セクション抽出デバッグ用フィールド（network経由でingredients_foundしたときのみ）
  ingredients_section_anchor?: string; // 見つかったアンカー（"전성분"等）
  ingredients_section_length?: number; // 抽出したセクションの長さ
  ingredients_section_snippet?: string; // 抽出したセクションの先頭200文字
}

export interface IngredientDictEntry {
  id: string;
  display_ja: string;
  aliases: string[]; // 複数言語・表記揺れ対応
}

export interface IngredientTagResult {
  found_ids: string[];
  unknown_tokens_count: number;
  matched_aliases: Record<string, string>; // alias -> id
  token_count?: number; // トークン数（デバッグ用）
}

export interface FailureLog {
  failure_type: string;
  stage: string; // 'fetch' | 'parse' | 'ingredient' | 'matching' | 'other'
  url?: string;
  input_snapshot?: any;
  output_snapshot?: any;
  human_fix?: any; // PoCでは空でOK
  created_at: string; // ISO 8601
}

/**
 * ランキング・メディア表示用の正規化商品（Firestore保存）
 * コレクション: oliveyoung_products / ドキュメントID: goodsNo
 * ランキング履歴は oliveyoung_rankings/{runId}/items に保存する
 */
export interface ProductNormalized {
  goodsNo: string;
  brand: string;
  name: string;
  pickedUrl?: string; // 成分取得元URLなど
  ingredientsRaw: string;
  tags: string[]; // 例: ['RETINOL','CICA']
  qoo10Url?: string;
  priceKRW?: number;
  /** @deprecated 最後に観測した順位は lastRank を使用 */
  rank?: number;
  /** 最後に観測した順位（ランキング実行時のみ更新） */
  lastRank?: number;
  /** 最後に順位を観測した日時 */
  lastRankAt?: string;
  /** 最後に観測したランキング実行の runId */
  lastRunId?: string;
  createdAt: string; // Firestore保存時に Timestamp へ変換
  updatedAt: string;  // 必須・Firestore保存時に Timestamp へ変換
}

/** Firestore コレクション名（crawler / web 共通） */
export const OLIVEYOUNG_PRODUCTS_COLLECTION = 'oliveyoung_products';

/** ランキングスナップショット用コレクション（実行1回 = 1ドキュメント） */
export const OLIVEYOUNG_RANKINGS_COLLECTION = 'oliveyoung_rankings';

/** ランキング実行の結果状態 */
export type RankingRunStatus = 'failed' | 'partial' | 'success';

/** ランキング実行メタ（oliveyoung_rankings/{runDate}、docId = runDate） */
export interface RankingRunMeta {
  /** 主キー。JST YYYY-MM-DD */
  runDate: string;
  source: 'oliveyoung';
  kind: 'rankings';
  limit: number;
  collected: number;
  ok: number;
  ng: number;
  /** 必ず保存。collected==0→failed, ng>0 or 重複→partial, それ以外→success */
  status: RankingRunStatus;
  startedAt: string;
  finishedAt: string;
  executionName?: string;
  /** 任意。実行識別子（主キーに使わない） */
  lastRunId?: string;
  createdAt: string;
}

/** ランキング1件（oliveyoung_rankings/{runDate}/items/{rank}、docId=rank） */
export interface RankingRunItem {
  rank: number;
  goodsNo: string;
  pickedUrl?: string;
  capturedAt: string;
  executionName?: string;
  runDate: string;
}

export interface L1MatchCandidate {
  oliveyoung_product: ProductParsed;
  matched_product: ProductParsed;
  score: number;
  brand_match: number; // 0 or 1
  volume_match: number; // 0 or 1
  name_similarity: number; // 0-1
}

export interface PocReport {
  generated_at: string;
  static_fetch_success_rate: number; // 0-1
  ingredient_parse_success_rate: number; // 0-1
  top100_tag_success_rate: number; // 0-1
  common_tag_success_rate?: number; // 0-1 (COMMON_ prefix)
  functional_tag_success_rate?: number; // 0-1 (FUNC_ prefix)
  l1_match_rate: number | null; // 0-1 or null
  stats: {
    total_fetch_attempts: number;
    successful_fetches: number;
    total_parsed: number;
    ingredients_found: number;
    top100_tagged: number;
    common_tagged?: number;
    functional_tagged?: number;
    l1_matched: number | null;
    // 補助指標
    normalized_has_common_hints_true_rate?: number; // normalized_has_common_hints===true の割合
    avg_delimiter_count?: number; // 平均delimiter数（カンマ）
    avg_dom_delimiter_count?: number; // 平均dom_delimiter_count（DOM抽出のdelimiter数）
    avg_ingredients_text_delimiter_count?: number; // 平均ingredients_textのdelimiter数（正規化後）
    common_hints_found_count?: number; // normalized_has_common_hints===true の件数
    parse_source_dom_count?: number; // parse_source='dom'の件数
    parse_source_network_count?: number; // parse_source='network'の件数
    parse_source_none_count?: number; // parse_source='none'の件数
  };
  fail_reasons_top: Array<{
    reason: string;
    count: number;
  }>;
}

