/**
 * 画像補完ジョブ専用: 商品ページを HTTP 取得し og:image / img のみ抽出。
 * 人物画像は NG ワードで除外し、商品単体画像を優先。
 * ランキング・Playwright・name/brand は一切使わない。
 */
import { request } from "undici";
import * as cheerio from "cheerio";
import { pickProductOnlyImage } from "../utils/imagePersonFilter";

const DETAIL_URL_TEMPLATE = "https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=";

function isAbsoluteUrl(s: string): boolean {
  return /^https?:\/\//i.test(s?.trim() || "");
}

function resolveUrl(base: string, href: string): string {
  if (!href?.trim()) return "";
  const h = href.trim();
  if (isAbsoluteUrl(h)) return h;
  try {
    return new URL(h, base).href;
  } catch {
    return h;
  }
}

/**
 * 商品詳細ページの HTML を取得し、imageUrl / thumbnailUrl のみ抽出。
 * productUrl があればそれを使用、なければ goodsNo から URL を組み立てる。
 */
export async function fetchProductImagesOnly(
  goodsNo: string,
  productUrl?: string | null
): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  const url =
    productUrl?.trim() && isAbsoluteUrl(productUrl.trim())
      ? productUrl.trim()
      : `${DETAIL_URL_TEMPLATE}${encodeURIComponent(goodsNo)}`;

  const res = await request(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    bodyTimeout: 15000,
    headersTimeout: 10000,
  });

  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode}`);
  }

  const html = await res.body.text();
  const $ = cheerio.load(html);

  const candidates: { url: string; alt?: string }[] = [];
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage?.trim()) {
    candidates.push({ url: resolveUrl(url, ogImage.trim()) });
  }
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    const alt = $(el).attr("alt");
    if (src?.trim()) {
      candidates.push({ url: resolveUrl(url, src.trim()), alt });
    }
  });

  const picked = pickProductOnlyImage(candidates);
  const imageUrl = picked || "";
  const thumbnailUrl = imageUrl;

  return { imageUrl, thumbnailUrl };
}
