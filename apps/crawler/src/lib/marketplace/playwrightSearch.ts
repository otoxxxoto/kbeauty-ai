/**
 * Amazon 検索結果を Playwright で取得（fetch では JS 描画・ボット対策で欠ける場合向け）
 */
import { chromium, type Browser, type Page } from "playwright";
import type { ImageMatchCandidate } from "../../utils/marketplaceImageMatch";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

export type PlaywrightAmazonSearchResult = {
  candidates: ImageMatchCandidate[];
  finalUrl: string;
};

/**
 * Amazon.co.jp 検索から商品画像候補を取得（最大 maxItems 件）
 */
export async function fetchAmazonImagesWithPlaywright(
  query: string,
  options?: { browser?: Browser; maxItems?: number; headless?: boolean }
): Promise<PlaywrightAmazonSearchResult> {
  const maxItems = Math.min(Math.max(1, options?.maxItems ?? 10), 30);
  const ownBrowser = !options?.browser;
  const browser =
    options?.browser ??
    (await chromium.launch({
      headless: options?.headless ?? process.env.PW_HEADED !== "1",
    }));

  let page: Page | undefined;
  try {
    page = await browser.newPage({
      userAgent: UA,
      locale: "ja-JP",
    });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "ja,en;q=0.9",
    });

    const url = `https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });

    await new Promise((r) => setTimeout(r, 2000));

    const items = await page.evaluate((limit) => {
      const imgs = Array.from(document.querySelectorAll("img.s-image")).slice(0, limit);
      const out: { title: string; imageUrl: string }[] = [];
      for (const img of imgs) {
        const el = img as HTMLImageElement;
        const src =
          el.src ||
          el.getAttribute("data-src") ||
          el.getAttribute("data-srcset")?.split(",")[0]?.trim().split(/\s+/)[0] ||
          "";
        if (!src || !/^https?:/i.test(src)) continue;
        const root =
          el.closest('[data-component-type="s-search-result"]') ||
          el.closest("div[data-asin]") ||
          el.closest(".s-result-item");
        const title =
          root?.querySelector("h2 a span")?.textContent?.trim() ||
          root?.querySelector("h2")?.textContent?.trim() ||
          "";
        out.push({ title: title || "(no title)", imageUrl: src.trim() });
      }
      return out;
    }, maxItems);

    const candidates = items.filter((c) => c.imageUrl && /^https?:/i.test(c.imageUrl));
    const finalUrl = page.url();
    return { candidates, finalUrl };
  } finally {
    await page?.close().catch(() => {});
    if (ownBrowser) {
      await browser.close().catch(() => {});
    }
  }
}
