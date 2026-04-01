/**
 * Olive Young 公開データのうち、
 * - 表示名が「商品名準備中」になっている商品
 * - 公式 URL 候補が API っぽい URL になっている商品
 * を NDJSON で列挙する簡易レポート。
 *
 * stdout: 1 行 = JSON
 * { goodsNo, displayName, nameJa, name, oliveYoungUrl, productUrl, pickedUrl, isNamePending, isApiLikeUrl }
 */

import { resolve } from "path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import {
  getAllOliveYoungProductsMinimal,
  type OliveYoungProductMinimal,
} from "@/lib/oliveyoung-products";
import {
  getDisplayProductNameText,
  PRODUCT_TITLE_PENDING_JA,
} from "@/lib/oliveyoung-display";
import {
  isOliveYoungApiLikeUrl,
  resolveNormalizedOliveYoungUrl,
} from "@/lib/oliveyoung-official-url";

function collectIssues(p: OliveYoungProductMinimal) {
  const displayName = getDisplayProductNameText(p);
  const isNamePending = displayName === PRODUCT_TITLE_PENDING_JA;

  const productUrl = p.productUrl?.trim() || "";
  const pickedUrl = (p as any).pickedUrl?.trim?.() || "";
  const oliveYoungUrl = resolveNormalizedOliveYoungUrl(
    (p as any).oliveYoungUrlExplicit,
    productUrl,
    pickedUrl
  );

  const candidates = [oliveYoungUrl, productUrl, pickedUrl].filter(
    (u): u is string => !!u && typeof u === "string"
  );
  const apiLikeCandidate = candidates.find((u) => isOliveYoungApiLikeUrl(u));
  const isApiLike = Boolean(apiLikeCandidate);

  if (!isNamePending && !isApiLike) return null;

  return {
    goodsNo: p.goodsNo,
    displayName,
    nameJa: p.nameJa ?? null,
    name: p.name ?? null,
    oliveYoungUrl: oliveYoungUrl ?? null,
    productUrl: productUrl || null,
    pickedUrl: pickedUrl || null,
    isNamePending,
    isApiLikeUrl: isApiLike,
    apiLikeSampleUrl: apiLikeCandidate ?? null,
  };
}

async function main() {
  const products = await getAllOliveYoungProductsMinimal();
  let pendingCount = 0;
  let apiLikeCount = 0;

  for (const p of products) {
    const issue = collectIssues(p);
    if (!issue) continue;
    if (issue.isNamePending) pendingCount += 1;
    if (issue.isApiLikeUrl) apiLikeCount += 1;
    process.stdout.write(`${JSON.stringify(issue)}\n`);
  }

  console.error(
    `[oy-name-url-issues] total=${products.length} name_pending=${pendingCount} api_like_url=${apiLikeCount}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

