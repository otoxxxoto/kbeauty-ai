"use client";

import * as React from "react";
import { CollapsibleText } from "@/components/CollapsibleText";
import { relForExternalUrl } from "@/lib/affiliate";

export type RevenueCtaPayload = {
  goodsNo: string;
  productUrl: string;
  cheapestHref: string;
  marketplaceAmazon: string;
  reviewSummaryJa?: string;
  ingredientSummaryJa?: string;
};

export function logProductCtaClick(
  goodsNo: string,
  position: "first" | "middle" | "last",
  type: "cheapest" | "compare" | "stock"
) {
  console.log("CTA_CLICK", { goodsNo, position, type });
}

function TrustBlock({
  title,
  text,
  emptyHint,
}: {
  title: string;
  text?: string;
  emptyHint: string;
}) {
  const body = text?.trim();
  return (
    <div className="mt-4 pt-4 border-t border-zinc-100">
      <div className="text-xs font-semibold text-zinc-500 mb-1">{title}</div>
      <div className="rounded-lg bg-zinc-50 p-3">
        {body ? (
          <CollapsibleText
            text={body}
            collapsedLines={5}
            className="text-sm text-zinc-700 leading-relaxed"
          />
        ) : (
          <p className="text-sm text-zinc-700 leading-relaxed">{emptyHint}</p>
        )}
      </div>
    </div>
  );
}

/** 主CTA（ファースト／最下部で同系の見た目に揃える） */
const primaryCtaClass =
  "flex w-full min-h-[56px] sm:min-h-[60px] items-center justify-center rounded-xl bg-emerald-600 px-6 py-4 text-lg sm:text-xl font-extrabold text-white shadow-lg shadow-emerald-900/25 ring-2 ring-emerald-500/30 hover:bg-emerald-700 hover:shadow-xl transition-all";

const subCtaClass =
  "flex flex-1 min-h-[40px] items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs sm:text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors";

/** ファーストビュー：理由 → 主CTA（全幅・最大）→ 従属サブ */
export function ProductFirstRevenueCtas(props: RevenueCtaPayload) {
  const {
    goodsNo,
    productUrl,
    cheapestHref,
    marketplaceAmazon,
    reviewSummaryJa,
    ingredientSummaryJa,
  } = props;

  return (
    <div
      className="rounded-xl border-2 border-zinc-200 bg-white p-5 shadow-md"
      aria-label="購入・価格の導線"
    >
      {/* 押す理由 → すぐ主CTA（余白を詰める） */}
      <div className="flex flex-wrap gap-2 mb-2">
        <span className="text-xs font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-md">
          ランキング上位商品
        </span>
        <span className="text-xs font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-md">
          口コミ評価あり
        </span>
        <span className="text-xs font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-md">
          今人気の商品
        </span>
      </div>

      <ul className="mb-2 list-none space-y-1 pl-0 m-0 text-sm text-zinc-700">
        <li>価格差が出やすい商品です</li>
        <li>在庫切れ前にチェック</li>
      </ul>
      <p className="mb-3 text-[11px] leading-snug text-zinc-500">
        価格は変動する場合があります。複数ショップで比較できます。
      </p>

      <a
        href={cheapestHref}
        target="_blank"
        rel={relForExternalUrl(cheapestHref)}
        className={primaryCtaClass}
        onClick={() => logProductCtaClick(goodsNo, "first", "cheapest")}
      >
        今すぐ最安・在庫を確認
      </a>
      <p className="mt-2 text-center text-[11px] leading-snug text-zinc-500">
        最安は日々変動しています。人気商品のため在庫切れ前の確認がおすすめです。
      </p>

      <p className="mt-3 mb-1.5 text-[11px] font-medium text-zinc-400 uppercase tracking-wide">
        そのほかの行動
      </p>
      <div className="flex flex-col sm:flex-row gap-2 w-full">
        <a
          href="#section-price-compare"
          className={subCtaClass}
          onClick={() => logProductCtaClick(goodsNo, "first", "compare")}
        >
          今すぐ価格を比較
        </a>
        <a
          href={productUrl || cheapestHref || marketplaceAmazon}
          target="_blank"
          rel={relForExternalUrl(
            productUrl || cheapestHref || marketplaceAmazon
          )}
          className={subCtaClass}
          onClick={() => logProductCtaClick(goodsNo, "first", "stock")}
        >
          在庫を確認
        </a>
      </div>

      <TrustBlock
        title="口コミ要約（参考）"
        text={reviewSummaryJa}
        emptyHint="口コミ要約は準備中です。購入前に各ショップのレビューをご確認ください。"
      />
      <TrustBlock
        title="成分・特徴（参考）"
        text={ingredientSummaryJa}
        emptyHint="成分解説は準備中です。表示は参考用途です。"
      />
    </div>
  );
}

/** 読了後の刈り取り：余白・枠・中央・主行動を明確に */
export function ProductMiddleRevenueCtas(props: RevenueCtaPayload) {
  const { goodsNo, productUrl, cheapestHref, reviewSummaryJa, ingredientSummaryJa } = props;
  const stockHref = productUrl || cheapestHref;
  const rev = reviewSummaryJa?.trim();
  const ing = ingredientSummaryJa?.trim();

  return (
    <section
      className="my-12 md:my-16 py-10 md:py-14 px-5 md:px-8 rounded-2xl border-2 border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 via-white to-zinc-50/80 shadow-md"
      aria-label="読了後の購入導線"
    >
      <div className="max-w-lg mx-auto flex flex-col items-center text-center">
        <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">
          ここまで読んだ方へ
        </p>
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          <span className="text-xs font-bold text-emerald-900 bg-white/90 border border-emerald-200 px-2.5 py-1 rounded-md shadow-sm">
            ランキング上位商品
          </span>
          <span className="text-xs font-bold text-emerald-900 bg-white/90 border border-emerald-200 px-2.5 py-1 rounded-md shadow-sm">
            口コミ評価あり
          </span>
        </div>

        {(rev || ing) && (
          <div className="mb-6 w-full text-left text-sm text-zinc-600 leading-relaxed bg-white/60 rounded-lg p-4 border border-zinc-100">
            {rev && (
              <div className="mb-4 last:mb-0">
                <div className="font-semibold text-zinc-800">口コミ要約</div>
                <CollapsibleText
                  text={rev}
                  collapsedLines={5}
                  className="mt-1 text-sm text-zinc-600 leading-relaxed"
                />
              </div>
            )}
            {ing && (
              <div className="mb-0">
                <div className="font-semibold text-zinc-800">成分・特徴</div>
                <CollapsibleText
                  text={ing}
                  collapsedLines={5}
                  className="mt-1 text-sm text-zinc-600 leading-relaxed"
                />
              </div>
            )}
          </div>
        )}

        <ul className="mb-3 w-full max-w-md list-none space-y-1 pl-0 m-0 text-sm text-zinc-700 text-left">
          <li>価格差が出やすい商品です</li>
          <li>在庫切れ前にチェック</li>
        </ul>

        <a
          href={stockHref}
          target="_blank"
          rel={relForExternalUrl(stockHref)}
          className={`${primaryCtaClass} max-w-md`}
          onClick={() => logProductCtaClick(goodsNo, "middle", "stock")}
        >
          今すぐ価格・在庫を確認
        </a>
        <p className="mt-2 w-full max-w-md text-center text-[11px] leading-snug text-zinc-500">
          最安は日々変動しています
        </p>

        <div className="mt-4 flex flex-col sm:flex-row gap-2 w-full max-w-md justify-center">
          <a
            href={cheapestHref}
            target="_blank"
            rel={relForExternalUrl(cheapestHref)}
            className={subCtaClass}
            onClick={() => logProductCtaClick(goodsNo, "middle", "cheapest")}
          >
            今すぐ最安・在庫を確認
          </a>
          <a
            href="#section-price-compare"
            className={subCtaClass}
            onClick={() => logProductCtaClick(goodsNo, "middle", "compare")}
          >
            今すぐ価格を比較
          </a>
        </div>
      </div>
    </section>
  );
}

/** 最後の押し込み：主CTAをファースト相当に＋迷い向け理由 */
export function ProductBottomRevenueCtas(props: RevenueCtaPayload) {
  const { goodsNo, cheapestHref, marketplaceAmazon } = props;

  return (
    <div
      className="rounded-xl border-2 border-zinc-200 bg-white p-6 md:p-7 mb-10 shadow-md"
      aria-label="ページ下部の購入導線"
    >
      <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2">
        まだ迷っている方へ
      </p>
      <div className="flex flex-wrap gap-2 mb-2">
        <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-md">
          今人気の商品です
        </span>
        <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-md">
          価格差が出やすい商品です
        </span>
        <span className="text-xs font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-md">
          在庫切れ前にチェック
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-md">
          ランキング上位商品
        </span>
        <span className="text-xs font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-md">
          口コミ評価あり
        </span>
      </div>

      <a
        href={cheapestHref}
        target="_blank"
        rel={relForExternalUrl(cheapestHref)}
        className={primaryCtaClass}
        onClick={() => logProductCtaClick(goodsNo, "last", "cheapest")}
      >
        今すぐ最安・在庫を確認
      </a>
      <p className="mt-2 text-center text-[11px] leading-snug text-zinc-500">
        最安は日々変動しています
      </p>

      <div className="mt-3 flex justify-center">
        <a
          href={marketplaceAmazon}
          target="_blank"
          rel={relForExternalUrl(marketplaceAmazon)}
          className={`${subCtaClass} max-w-md w-full sm:w-auto px-6`}
          onClick={() => logProductCtaClick(goodsNo, "last", "compare")}
        >
          他サイトで比較する
        </a>
      </div>
    </div>
  );
}
