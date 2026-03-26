import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProductByGoodsNo } from "@/lib/oliveyoung/getProductByGoodsNo";

/** 表示用テキストを整形 */
function formatDisplayText(raw: string): string {
  let s = String(raw)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ");
  s = s.replace(/^[\s",:]*"content"\s*:\s*"\s*/i, "").trim();
  return s;
}

/** 角括弧ブロック [xxx] で分割してブロック列を返す。角括弧が無い場合は1ブロック */
function parseIngredientBlocks(text: string): { heading?: string; body: string }[] {
  const bracketRegex = /(\[\s*[^\]]+\s*\])/g;
  const parts = text.split(bracketRegex);
  const blocks: { heading?: string; body: string }[] = [];
  if (parts[0]?.trim()) {
    blocks.push({ body: parts[0].trim() });
  }
  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i]?.trim();
    const body = (parts[i + 1] ?? "").trim();
    if (heading) {
      blocks.push({ heading, body });
    }
  }
  return blocks.length ? blocks : [{ body: text.trim() }];
}

/** API が返す GCS 由来の payload（data の中身） */
type IngredientsBlock = { title: string; items: string[] };

type GcsPayload = {
  ingredients?: string;
  ingredientsText?: string;
  ingredientsBlocks?: IngredientsBlock[];
  pickedUrl?: string;
  source?: string;
  collectedAt?: string;
  reason?: string;
};

/** API のレスポンス形式: { ok, goodsNo, data?, error? } */
type ApiResponse =
  | { ok: true; goodsNo: string; data: GcsPayload }
  | { ok: false; goodsNo: string; error: string };

async function fetchIngredients(goodsNo: string, baseUrl: string): Promise<ApiResponse> {
  const url = new URL(`/api/oliveyoung/ingredients/${goodsNo}`, baseUrl);

  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = (await res.json()) as ApiResponse;
    if (!res.ok) {
      const err = "error" in body ? body.error : res.statusText;
      return { ok: false, goodsNo, error: err };
    }
    return body;
  } catch (e) {
    return {
      ok: false,
      goodsNo,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ goodsNo: string }>;
}) {
  const { goodsNo } = await params;
  const reserved = new Set([
    "category",
    "categories",
    "products",
    "ranking",
    "rankings",
    "brands",
    "tags",
    "ingredients",
  ]);
  if (reserved.has((goodsNo || "").trim().toLowerCase())) {
    notFound();
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? (host ? `${proto}://${host}` : "http://localhost:3000");

  const [result, product] = await Promise.all([
    fetchIngredients(goodsNo, baseUrl),
    getProductByGoodsNo(goodsNo),
  ]);

  const payload = result.ok ? result.data : null;
  const raw = (payload?.ingredients ?? payload?.ingredientsText ?? "") as string;
  const displayText = formatDisplayText(raw);
  const sourceUrl = payload?.pickedUrl;

  const tags = product?.tags ?? [];
  const hasTags = tags.length > 0;

  return (
    <main className="p-6 space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold">OliveYoung 成分</h1>
      <div className="text-sm text-zinc-600">goodsNo: {goodsNo}</div>

      {hasTags && (
        <div className="border border-zinc-200 rounded p-4">
          <h2 className="text-sm font-bold mb-2">この商品のタグ・同タグの商品一覧</h2>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/oliveyoung/tags/${tag}`}
                className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 rounded text-sm text-blue-600"
              >
                {tag} →
              </Link>
            ))}
          </div>
        </div>
      )}

      {!result.ok && (
        <div className="p-4 bg-red-50 text-red-800 rounded">
          {result.error === "not_found" ? "404 Not Found" : result.error}
        </div>
      )}

      {result.ok && payload && (
        <>
          {sourceUrl && (
            <p className="text-sm">
              <span className="font-medium">出典: </span>
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                {sourceUrl}
              </a>
            </p>
          )}

          {payload.ingredientsBlocks && payload.ingredientsBlocks.length > 0 ? (
            <div className="space-y-4">
              {payload.ingredientsBlocks.map((block, i) => (
                <section
                  key={i}
                  className="border border-zinc-200 rounded p-4"
                >
                  <h2 className="text-sm font-bold mb-2">{block.title}</h2>
                  <ul className="text-sm font-mono m-0 pl-5 space-y-0.5 list-disc">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : displayText ? (
            <div className="space-y-4">
              {parseIngredientBlocks(displayText).map((block, i) => (
                <section
                  key={i}
                  className="border border-zinc-200 rounded p-4"
                >
                  {block.heading && (
                    <h2 className="text-sm font-bold mb-2">{block.heading}</h2>
                  )}
                  {(block.body || block.heading) && (
                    <pre className="text-sm overflow-auto whitespace-pre-wrap font-mono m-0">
                      {block.body}
                    </pre>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500">
              {payload.reason ?? "成分データなし"}
            </p>
          )}
        </>
      )}
    </main>
  );
}
