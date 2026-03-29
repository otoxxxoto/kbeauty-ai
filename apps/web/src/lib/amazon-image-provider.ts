/**
 * Amazon 商品画像・ASIN 補完用プロバイダ抽象。
 * スクレイピングは行わず、Creators API（新規）または PA-API 5（既存資格）を実装側で差し替え。
 */

import type { AmazonMatchScoreComponents } from "@/lib/amazon-match-score";
import { combineAmazonMatchScore } from "@/lib/amazon-match-score";

/** 照合クエリ（商品名・ブランド・容量テキスト） */
export type AmazonProductMatchQuery = {
  name: string;
  brand?: string;
  /** 例: "50ml", "1本" */
  volumeText?: string;
};

export type AmazonImageMatchResult = {
  amazonAsin: string;
  amazonUrl: string;
  amazonImageUrl: string;
  amazonTitle: string;
  amazonMatchScore: number;
};

export interface AmazonImageProvider {
  matchProduct(
    input: AmazonProductMatchQuery
  ): Promise<AmazonImageMatchResult | null>;
}

/**
 * 認証未設定時・ローカル用。常に null。
 * PA-API 5 実装: `pa-api-5-amazon-image-provider.ts` の `PaApi5AmazonImageProvider`。
 */
export class MockAmazonImageProvider implements AmazonImageProvider {
  async matchProduct(
    _input: AmazonProductMatchQuery
  ): Promise<AmazonImageMatchResult | null> {
    return null;
  }
}

/** Job 側でスコアだけ先に確定するとき用（API が breakdown を返す想定） */
export function amazonMatchScoreFromComponents(
  c: Partial<AmazonMatchScoreComponents>
): number {
  return combineAmazonMatchScore(c);
}
