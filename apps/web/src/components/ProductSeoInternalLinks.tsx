import Link from "next/link";
import { CATEGORY_LINKS, type CategorySlug } from "@/lib/category-config";
import type { OliveYoungProductDetail } from "@/lib/oliveyoung-products";

/** 悩み別 → カテゴリページ（SEO内部リンク） */
const CONCERN_LINKS: { label: string; slug: CategorySlug }[] = [
  { label: "頭皮ケアしたい方", slug: "scalp-care" },
  { label: "背中ニキビが気になる方", slug: "back-acne" },
  { label: "敏感肌・乾燥肌の方", slug: "ceramide" },
];

type Props = {
  product: Pick<
    OliveYoungProductDetail,
    "nameJa" | "name" | "summaryJa"
  >;
  latestRunDate: string | null;
};

/**
 * 商品詳細の SEO 用内部リンク（テキスト中心・装飾控えめ）
 */
export function ProductSeoInternalLinks({ product, latestRunDate }: Props) {
  const text = [product.nameJa ?? "", product.name ?? "", product.summaryJa ?? ""].join(" ");
  const cat: CategorySlug | null = /頭皮|スカルプ|皮脂|角質/u.test(text)
    ? "scalp-care"
    : /背中ニキビ|ニキビ|肌荒れ/u.test(text)
      ? "back-acne"
      : /セラミド|保湿|乾燥|敏感肌/u.test(text)
        ? "ceramide"
        : null;
  const catLabel = CATEGORY_LINKS.find((x) => x.slug === cat)?.label;

  return (
    <section
      className="mb-8 rounded-lg border border-zinc-200 bg-zinc-50/40 p-5"
      aria-labelledby="seo-same-category-heading"
    >
      <h2
        id="seo-same-category-heading"
        className="text-base font-semibold text-zinc-900 mb-2"
      >
        同じカテゴリの人気商品
      </h2>
      <ul className="list-none space-y-1.5 pl-0 m-0">
        {cat ? (
          <li>
            <Link
              href={`/oliveyoung/category/${cat}`}
              className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              {catLabel ?? "関連カテゴリ"}の人気一覧を見る
            </Link>
          </li>
        ) : (
          CATEGORY_LINKS.map(({ slug, label }) => (
            <li key={slug}>
              <Link
                href={`/oliveyoung/category/${slug}`}
                className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
              >
                {label}の人気一覧
              </Link>
            </li>
          ))
        )}
      </ul>

      <h2 className="text-base font-semibold text-zinc-900 mb-2 mt-6">
        こんな方におすすめ
      </h2>
      <ul className="list-none space-y-1.5 pl-0 m-0">
        {CONCERN_LINKS.map(({ label, slug }) => (
          <li key={slug}>
            <Link
              href={`/oliveyoung/category/${slug}`}
              className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="text-base font-semibold text-zinc-900 mb-2 mt-6">
        人気ランキングを見る
      </h2>
      <p className="m-0">
        {latestRunDate ? (
          <Link
            href={`/oliveyoung/rankings/${latestRunDate}`}
            className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            Olive Young 商品ランキング（{latestRunDate}）
          </Link>
        ) : (
          <Link
            href="/oliveyoung"
            className="text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            Olive Young トップからランキングを探す
          </Link>
        )}
      </p>
    </section>
  );
}
