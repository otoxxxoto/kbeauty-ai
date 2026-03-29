/**
 * CTA 文言の集約（ABテストや微修正をしやすくする）
 * - 過度な抽象化はせず「文言を1箇所で差し替えられる」粒度に留める
 */

/**
 * AB テスト候補（実際の切替機能は未実装）
 * - まずは「候補をここに集約」しておき、文言だけ最小差分で差し替えられる状態にする
 * - 将来は `NEXT_PUBLIC_CTA_COPY_VARIANT` 等で選択するだけで切替可能
 */
export const CTA_COPY_VARIANTS = {
  primary: {
    /** パターンA（現行ベース） */
    A: {
      title: "今すぐショップをチェック",
      subtitle: "主要ECで価格や在庫を確認できます",
      amazon: "Amazonで最安をチェック",
      rakuten: "楽天で価格を見る",
      qoo10: "Qoo10で在庫を確認",
      /** ファーストビュー主CTA直下の OY 補助導線（一覧カードの「Olive Youngで見る」と役割分担） */
      oliveYoungSupplement: "公式ページ（Olive Young）で確認",
    },
    /** パターンB（価格訴求） */
    B: {
      title: "最安候補を確認",
      subtitle: "主要ショップの価格や在庫をチェックできます",
      amazon: "Amazonで最安をチェック",
      rakuten: "楽天で価格を見る",
      qoo10: "Qoo10で在庫を確認",
      oliveYoungSupplement: "公式ページ（Olive Young）で確認",
    },
    /** パターンC（購買行動促進） */
    C: {
      title: "購入先をチェック",
      subtitle: "気になる商品を主要ECで確認できます",
      amazon: "Amazonで最安をチェック",
      rakuten: "楽天で価格を見る",
      qoo10: "Qoo10で在庫を確認",
      oliveYoungSupplement: "公式ページ（Olive Young）で確認",
    },
  },
  compare: {
    /** パターンA（比較文脈・現行） */
    A: {
      title: "購入先を比較する",
      subtitle: "ショップごとの条件を見比べられます",
      row: {
        amazon: { label: "Amazonで見る", hint: "価格・配送を確認" },
        rakuten: { label: "楽天で見る", hint: "価格・ポイントを確認" },
        qoo10: { label: "Qoo10で見る", hint: "セール状況を確認" },
      },
      cta: "見る →",
      fallbackHint: "掲載状況を確認",
    },
    /** パターンB（比較を強める） */
    B: {
      title: "購入先の違いを見比べる",
      subtitle: "価格や条件はショップごとに異なる場合があります",
      row: {
        amazon: { label: "Amazonで見る", hint: "価格・配送を確認" },
        rakuten: { label: "楽天で見る", hint: "価格・ポイントを確認" },
        qoo10: { label: "Qoo10で見る", hint: "セール状況を確認" },
      },
      cta: "比較する →",
      fallbackHint: "掲載状況を確認",
    },
  },
  bottom: {
    /** パターンA（読了後の再確認・現行） */
    A: {
      title: "この商品の購入先を見る",
      subtitle: "読み終わってから、もう一度チェックできます",
      amazon: "Amazonで見る",
      rakuten: "楽天で見る",
      qoo10: "Qoo10で見る",
    },
    /** パターンB（控えめ） */
    B: {
      title: "購入先をもう一度確認する",
      subtitle: "気になる方は、主要ショップで確認できます",
      amazon: "Amazonで見る",
      rakuten: "楽天で見る",
      qoo10: "Qoo10で見る",
    },
  },
  card: {
    /** パターンA（詳細導線優先・現行） */
    A: {
      detail: "詳細を見る",
    },
    /** パターンB（少しだけ強める） */
    B: {
      detail: "詳細で確認",
    },
  },
} as const;

/**
 * 現在採用している文言（ここだけ差し替えれば UI 構造を変えずにコピー変更できる）
 *
 * 変更方法（最小差分）:
 * - primary: `CTA_COPY_VARIANTS.primary.A|B|C` を差し替え
 * - compare/bottom/card: 同様に A/B を差し替え
 */
/** 商品詳細ページ「関連商品」カードのみ（回遊優先・主CTAより控えめ） */
export const RELATED_PRODUCT_CARD_AMAZON_LABEL = "Amazonで見る" as const;

/** ランキング／カテゴリ等の一覧カードで Amazon を主ボタンにするとき（関連商品以外） */
export const AFFILIATE_CARD_AMAZON_PRIMARY_LABEL = "今すぐ最安を確認（Amazon）" as const;

export const CTA_COPY = {
  primary: CTA_COPY_VARIANTS.primary.A,
  /** 比較文脈を primary（今すぐ確認）と差別化 */
  compare: CTA_COPY_VARIANTS.compare.B,
  bottom: CTA_COPY_VARIANTS.bottom.A,
  card: CTA_COPY_VARIANTS.card.A,
} as const;

