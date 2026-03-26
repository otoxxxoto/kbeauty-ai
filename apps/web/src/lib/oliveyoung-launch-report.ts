/**
 * Olive Young 公開前レポート用集計（Firestore 取得後の純関数 + 型）
 */
import type { OliveYoungProductMinimal } from "@/lib/oliveyoung-products";
import {
  mergeTranslationPriorityForNightly,
  translationPriorityCandidateFromSurfaceAndRank,
} from "@/lib/oliveyoung-products";
import {
  getDisplayProductNameText,
  isUnsafeBrandJa,
  isUnsafeGeneratedSummary,
  isUnsafeNameJa,
  looksLikeOliveYoungGoodsNo,
  PRODUCT_TITLE_PENDING_JA,
  containsUnsafeGoodsNoText,
  type ProductNameDisplayInput,
} from "@/lib/oliveyoung-display";
import {
  hasOyStyleUrlsButNoSafeImageUrl,
  isOyPersonAnalyzedAllContainPersonAndPlaceholder,
  productDisplayImageIsPlaceholder,
  resolveProductDisplayImage,
} from "@/lib/product-display-image-resolve";

/** 表示が韓国語オリジナル名にフォールバックしている（日本語名が無い／不安全） */
export function isDisplayNameKoreanOriginal(
  p: ProductNameDisplayInput & { name: string }
): boolean {
  const ja = p.nameJa?.trim() ?? "";
  const raw = p.name?.trim() ?? "";
  if (!raw || looksLikeOliveYoungGoodsNo(raw) || raw === "（商品名なし）")
    return false;
  if (ja && !isUnsafeNameJa(ja, p)) return false;
  return /[\uAC00-\uD7A3]/.test(raw);
}

function marketplaceHostInDisplayUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("amazon.") ||
    u.includes("media-amazon") ||
    u.includes("ssl-images-amazon") ||
    u.includes("rakuten.") ||
    u.includes("qoo10") ||
    u.includes("qoo-img.com")
  );
}

export type OliveYoungLaunchReport = {
  generatedAt: string;
  totalProducts: number;
  counts: {
    displayNamePending: number;
    displayNameKoreanOriginal: number;
    rawNameJaContainsGoodsNo: number;
    rawNameContainsGoodsNo: number;
    rawSummaryJaUnsafe: number;
    rawReviewSummaryUnsafe: number;
    rawIngredientSummaryUnsafe: number;
    rawBrandJaUnsafe: number;
    /** resolveProductDisplayImage がプレースホルダー（画像なし扱い） */
    imageResolvedPlaceholder: number;
    /** 上と同値。レポート用の明示名 */
    placeholderCount: number;
    /**
     * OY 系 URL はあるが safeImageUrl が無い件数（マーケット画像で表示される商品も含む）
     */
    noSafeImageButHasOyImageCount: number;
    /**
     * プレースホルダーかつ、OY URL 全件が解析済みでいずれも人物あり（人物除去未実装時の「隠している」寄り）
     */
    personImageOnlyCount: number;
    /**
     * 論理不整合: 公式バッジ true なのに画像 URL がモール CDN。
     * 通常は 0（resolve の仕様上ありえない）。0 以外ならバグ調査。
     */
    officialBadgeButMarketplaceImageUrl: number;
    /**
     * 日本語名が未整備で補完バックログに乗る想定の件数（表示が「準備中」または韓国語オリジナル表示）。
     * 優先度: `mergeTranslationPriorityForNightly(既存, 候補)`。候補は **公開面**（TOP 注目・急上昇・カテゴリ先頭・ランキング上位50）なら high、そうでなければ lastRank のみで medium / low。
     */
    nameJaMissingHighCount: number;
    nameJaMissingMediumCount: number;
    nameJaMissingLowCount: number;
  };
  samples: {
    displayNamePending: string[];
    displayNameKoreanOriginal: string[];
    rawSummaryJaUnsafe: string[];
    rawReviewSummaryUnsafe: string[];
    rawIngredientSummaryUnsafe: string[];
    imagePlaceholder: string[];
    personImageOnly: string[];
    noSafeImageButHasOyImage: string[];
    officialBadgeInconsistent: string[];
  };
  backlogSummary: {
    high: number;
    medium: number;
    low: number;
  };
  checklistHints: {
    internalLinks404: string;
    ctaCopy: string;
    metadataPages: string[];
    relAudit: string;
    brokenImageClientNote: string;
    imagePolicyDoc: string;
    nameJaTranslationOpsDoc: string;
  };
};

const SAMPLE_CAP = 30;

/**
 * nameJa 翻訳キューに載せるべき「まだ日本語が不足」状態か。
 * nightly ジョブや管理ツールから再利用可。
 */
export function isNameJaTranslationBacklog(p: OliveYoungProductMinimal): boolean {
  if (p.needsNameJa === false) return false;
  const pending = getDisplayProductNameText(p) === PRODUCT_TITLE_PENDING_JA;
  const korean = isDisplayNameKoreanOriginal(p);
  return pending || korean;
}

export type ComputeOliveYoungLaunchReportOptions = {
  /** 公開面に載る goodsNo（`buildPublicSurfaceGoodsIndex` 等）。無い場合は lastRank のみで tier を推定 */
  publicSurfaceGoods?: ReadonlySet<string>;
};

/**
 * Firestore `getAllOliveYoungProductsMinimal` の結果から集計する
 */
export function computeOliveYoungLaunchReport(
  products: OliveYoungProductMinimal[],
  options?: ComputeOliveYoungLaunchReportOptions
): OliveYoungLaunchReport {
  let rawNameJaContainsGoodsNo = 0;
  let rawNameContainsGoodsNo = 0;
  let rawSummaryJaUnsafeCount = 0;
  let rawReviewSummaryUnsafeCount = 0;
  let rawIngredientSummaryUnsafeCount = 0;
  let rawBrandJaUnsafeCount = 0;
  let imageResolvedPlaceholder = 0;
  let noSafeImageButHasOyImageCount = 0;
  let personImageOnlyCount = 0;
  let officialBadgeButMarketplaceImageUrl = 0;

  const rawSummaryJaUnsafe: string[] = [];
  const rawReviewSummaryUnsafe: string[] = [];
  const rawIngredientSummaryUnsafe: string[] = [];
  const imagePlaceholder: string[] = [];
  const personImageOnlySamples: string[] = [];
  const noSafeImageButHasOySamples: string[] = [];
  const officialBadgeInconsistent: string[] = [];

  for (const p of products) {
    const ja = p.nameJa?.trim() ?? "";
    if (ja && containsUnsafeGoodsNoText(ja)) {
      rawNameJaContainsGoodsNo += 1;
    }
    const nm = p.name?.trim() ?? "";
    if (nm && containsUnsafeGoodsNoText(nm)) {
      rawNameContainsGoodsNo += 1;
    }

    if (p.summaryJa && isUnsafeGeneratedSummary(p.summaryJa)) {
      rawSummaryJaUnsafeCount += 1;
      if (rawSummaryJaUnsafe.length < SAMPLE_CAP) rawSummaryJaUnsafe.push(p.goodsNo);
    }
    if (p.reviewSummaryJa && isUnsafeGeneratedSummary(p.reviewSummaryJa)) {
      rawReviewSummaryUnsafeCount += 1;
      if (rawReviewSummaryUnsafe.length < SAMPLE_CAP)
        rawReviewSummaryUnsafe.push(p.goodsNo);
    }
    if (p.ingredientSummaryJa && isUnsafeGeneratedSummary(p.ingredientSummaryJa)) {
      rawIngredientSummaryUnsafeCount += 1;
      if (rawIngredientSummaryUnsafe.length < SAMPLE_CAP)
        rawIngredientSummaryUnsafe.push(p.goodsNo);
    }
    if (p.brandJa && isUnsafeBrandJa(p.brandJa)) {
      rawBrandJaUnsafeCount += 1;
    }

    const resolved = resolveProductDisplayImage(p);
    if (productDisplayImageIsPlaceholder(resolved.url)) {
      imageResolvedPlaceholder += 1;
      if (imagePlaceholder.length < SAMPLE_CAP) imagePlaceholder.push(p.goodsNo);
    }
    if (hasOyStyleUrlsButNoSafeImageUrl(p)) {
      noSafeImageButHasOyImageCount += 1;
      if (noSafeImageButHasOySamples.length < SAMPLE_CAP)
        noSafeImageButHasOySamples.push(p.goodsNo);
    }
    if (isOyPersonAnalyzedAllContainPersonAndPlaceholder(p)) {
      personImageOnlyCount += 1;
      if (personImageOnlySamples.length < SAMPLE_CAP)
        personImageOnlySamples.push(p.goodsNo);
    }
    if (
      resolved.showOfficialImageBadge &&
      resolved.url.trim() !== "" &&
      marketplaceHostInDisplayUrl(resolved.url)
    ) {
      officialBadgeButMarketplaceImageUrl += 1;
      if (officialBadgeInconsistent.length < SAMPLE_CAP)
        officialBadgeInconsistent.push(p.goodsNo);
    }
  }

  const displayNamePending = products.filter(
    (p) => getDisplayProductNameText(p) === PRODUCT_TITLE_PENDING_JA
  );
  const displayNameKorean = products.filter((p) => isDisplayNameKoreanOriginal(p));

  let nameJaMissingHighCount = 0;
  let nameJaMissingMediumCount = 0;
  let nameJaMissingLowCount = 0;
  const surface = options?.publicSurfaceGoods;
  for (const p of products) {
    if (!isNameJaTranslationBacklog(p)) continue;
    const onSurface = surface?.has(p.goodsNo) ?? false;
    const candidate = translationPriorityCandidateFromSurfaceAndRank(
      onSurface,
      p.lastRank
    );
    const tier = mergeTranslationPriorityForNightly(p.translationPriority, candidate);
    if (tier === "high") nameJaMissingHighCount += 1;
    else if (tier === "medium") nameJaMissingMediumCount += 1;
    else nameJaMissingLowCount += 1;
  }

  const counts = {
    displayNamePending: displayNamePending.length,
    displayNameKoreanOriginal: displayNameKorean.length,
    rawNameJaContainsGoodsNo,
    rawNameContainsGoodsNo,
    rawSummaryJaUnsafe: rawSummaryJaUnsafeCount,
    rawReviewSummaryUnsafe: rawReviewSummaryUnsafeCount,
    rawIngredientSummaryUnsafe: rawIngredientSummaryUnsafeCount,
    rawBrandJaUnsafe: rawBrandJaUnsafeCount,
    imageResolvedPlaceholder,
    placeholderCount: imageResolvedPlaceholder,
    noSafeImageButHasOyImageCount,
    personImageOnlyCount,
    officialBadgeButMarketplaceImageUrl,
    nameJaMissingHighCount,
    nameJaMissingMediumCount,
    nameJaMissingLowCount,
  };

  const high =
    counts.displayNamePending +
    counts.officialBadgeButMarketplaceImageUrl +
    counts.rawSummaryJaUnsafe;
  const medium =
    counts.displayNameKoreanOriginal +
    counts.rawNameJaContainsGoodsNo +
    counts.rawReviewSummaryUnsafe +
    counts.rawIngredientSummaryUnsafe +
    counts.rawBrandJaUnsafe;
  const low = counts.imageResolvedPlaceholder + counts.rawNameContainsGoodsNo;

  return {
    generatedAt: new Date().toISOString(),
    totalProducts: products.length,
    counts,
    samples: {
      displayNamePending: displayNamePending.slice(0, SAMPLE_CAP).map((p) => p.goodsNo),
      displayNameKoreanOriginal: displayNameKorean
        .slice(0, SAMPLE_CAP)
        .map((p) => p.goodsNo),
      rawSummaryJaUnsafe,
      rawReviewSummaryUnsafe,
      rawIngredientSummaryUnsafe,
      imagePlaceholder,
      personImageOnly: personImageOnlySamples,
      noSafeImageButHasOyImage: noSafeImageButHasOySamples,
      officialBadgeInconsistent,
    },
    backlogSummary: { high, medium, low },
    checklistHints: {
      internalLinks404:
        "`pnpm run build` で静的エラーを確認。本番ではクローラやリンクチェッカで /oliveyoung/** の 404 を巡回（商品 URL 全件 HEAD は負荷・レートに注意）。",
      ctaCopy:
        "CTA: 文言は `src/lib/ctaCopy.ts` に集約。詳細: ProductPrimaryCtaBlock / ProductCompareCtaBlock（本文の bottom CTA は廃止し固定フッターと役割分担）。カード: ProductCardCta（初回は詳細導線）。関連商品カードの外部は Amazon のみ（`ProductAffiliateCtas` `amazonOnly`）。外部リンク: ProductAffiliateCtas / LoggedShopLink。表記ゆれは grep で定期確認。",
      metadataPages: [
        "/oliveyoung",
        "/oliveyoung/rankings/[runDate]",
        "/oliveyoung/category/[slug]",
        "/oliveyoung/products/[goodsNo]",
        "/oliveyoung/brands/[runDate]/[brandKey]",
      ],
      relAudit:
        "アフィリエイト: `affiliate.ts` … Amazon/楽天/Qoo10 = `nofollow sponsored noopener` + `target=_blank`（ProductAffiliateCtas）。LoggedShopLink は `relForExternalUrl`。OY 直リンクは `noreferrer` のみの箇所あり → 方針次第で `noopener` 追加可。",
      brokenImageClientNote:
        "サーバー上の resolve は safeImageUrl 優先。実際の画像 404 はブラウザ onError でプレースホルダーになるため、本レポートの件数と目視がずれる場合は URL 有効性を別途確認。",
      imagePolicyDoc: "docs/IMAGE_POLICY.md（人物除去は未実装・公開前は人物入り非表示方針）",
      nameJaTranslationOpsDoc:
        "docs/NAME_JA_TRANSLATION_OPS.md（nameJa 優先度運用・表示基準・nightly 設計）",
    },
  };
}
