/**
 * Amazon ASIN / 各モールURL・画像・優先ショップ・スコア用の拡張フィールド。
 * Firestore `oliveyoung_products_public` への段階的投入を想定したオプショナル設計。
 */

/** 収益導線の優先ショップ（明示URLベースで決定。DB上書き可） */
export type PrimaryShop = "amazon" | "qoo10" | "rakuten" | "oliveyoung";

/** アフィリエイトCTAで並べ替え対象になるモール（OYは別コンポーネント） */
export type AffiliateMarketplace = "amazon" | "rakuten" | "qoo10";

/**
 * getProductImage の出所（表示用プレースホルダーと区別）
 * ※ ProductDisplayImageSource（Vision/strong判定用）とは役割が異なる
 */
export type ProductRevenueImageSource =
  | "amazon"
  | "rakuten"
  | "qoo10"
  | "oliveyoung"
  | "fallback_no_image";

/**
 * 商品ごとのマーケット／収益向けフィールド（既存 amazonImage 等と併存可能）
 */
export type ProductMarketplaceFields = {
  asin?: string;
  amazonUrl?: string;
  /** 明示的なAmazon商品画像（未設定時は amazonImage へフォールバック可） */
  amazonImageUrl?: string;
  amazonTitle?: string;
  rakutenUrl?: string;
  rakutenImageUrl?: string;
  rakutenTitle?: string;
  qoo10Url?: string;
  qoo10ImageUrl?: string;
  qoo10Title?: string;
  /** OY公式商品URL（未設定時は productUrl を利用する想定） */
  oliveYoungUrl?: string;
  oliveYoungImageUrl?: string;
  /**
   * Firestore での優先ショップ上書き。
   * 未設定時は getPrimaryShop（明示URL優先度）で決定。
   */
  primaryShop?: PrimaryShop | null;
  /**
   * 収益用画像の出所（Job が getProductImage と同優先度で確定させた場合のキャッシュ）
   */
  imageSource?: ProductRevenueImageSource;
  /** Job やバッチで付与する売れ筋スコア（任意・ denormalized） */
  marketScore?: number;
};

export type ProductImagePickResult = {
  url: string;
  imageSource: ProductRevenueImageSource;
};

export type MarketScoreBreakdown = {
  rankingScore: number;
  trendScore: number;
  imageScore: number;
  affiliateScore: number;
  textScore: number;
  marketScore: number;
};
