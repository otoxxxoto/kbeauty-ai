/**
 * Amazon / 楽天 / Qoo10 の検索結果HTMLから商品画像URLを取得（ベストエフォート）。
 * サイト構造変更で壊れうる。失敗時は空配列。
 * 段階検索（A→B→C→D）で候補が取れた時点で採用。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fetch } from "undici";
import * as cheerio from "cheerio";
import {
  allowedMatchLevelsLabelForProductType,
  buildMarketplaceSearchLabel,
  buildMarketplaceSearchQueries,
  pickBestMarketplaceImageWithLevel,
  rankMarketplaceCandidatesByScore,
  type ImageMatchCandidate,
  type MarketplaceImageMatchLevel,
  type MarketplacePickResult,
  type ProductForImageMatch,
} from "../utils/marketplaceImageMatch";

export type { MarketplaceImageMatchLevel } from "../utils/marketplaceImageMatch";
import { chromium } from "playwright";
import { fetchAmazonImagesWithPlaywright } from "../lib/marketplace/playwrightSearch";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";

export type MarketplaceFetchResult = {
  html: string | null;
  statusCode: number;
  finalUrl: string;
  error?: string;
  /** Playwright 取得時は HTML を保持しない */
  fetchKind?: "http" | "playwright";
};

async function fetchHtmlWithMeta(url: string): Promise<MarketplaceFetchResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept-Language": "ja,en;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const finalUrl = res.url || url;
    const html = res.ok ? await res.text() : null;
    return {
      html,
      statusCode: res.status,
      finalUrl,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      html: null,
      statusCode: 0,
      finalUrl: url,
      error: msg,
    };
  }
}

/** ボット・ブロックページ検出（名前はログ用） */
const BOT_BLOCK_PATTERNS: { id: string; re: RegExp }[] = [
  { id: "captcha", re: /captcha/i },
  { id: "robot", re: /robot/i },
  { id: "access_denied", re: /access\s*denied/i },
  { id: "blocked", re: /blocked/i },
  { id: "sorry_need_verify", re: /sorry,\s*we\s*just\s*need/i },
  { id: "enter_characters", re: /enter\s*the\s*characters/i },
  { id: "unusual_traffic", re: /unusual\s*traffic/i },
  { id: "502_bad_gateway", re: /502\s*bad\s*gateway/i },
  { id: "503_unavailable", re: /503\s*service\s*unavailable/i },
  { id: "too_many_requests", re: /too\s*many\s*requests/i },
  { id: "rate_limit", re: /rate\s*limit/i },
  { id: "robots_txt", re: /robots\.txt/i },
  { id: "automated_requests", re: /automated\s*requests/i },
  { id: "ja_bot_block", re: /認証|ボット|アクセス制限/i },
];

function collectBotBlockMatches(html: string): string[] {
  const lower = html.toLowerCase();
  const out: string[] = [];
  for (const { id, re } of BOT_BLOCK_PATTERNS) {
    if (re.test(html) || re.test(lower)) out.push(id);
  }
  return out;
}

/** タグをざっくり除いた本文スニペット（ログ用） */
function htmlToPlainSnippetForLog(html: string, maxLen: number): string {
  const s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, maxLen);
}

const SEARCH_RESULT_HINTS = [
  /search.?result/i,
  /s-search-result/i,
  /searchresultitem/i,
  /商品検索|検索結果/i,
  /search.?result/i,
  /item_card|prd_item|item-title/i,
];

function diagnoseHtml(html: string | null): {
  hasSearchHint: boolean;
  hasBotBlock: boolean;
  titleTag: string;
} {
  if (!html) {
    return { hasSearchHint: false, hasBotBlock: false, titleTag: "(no html)" };
  }
  const lower = html.toLowerCase();
  const hasBotBlock = BOT_BLOCK_PATTERNS.some(
    ({ re }) => re.test(html) || re.test(lower)
  );
  const hasSearchHint = SEARCH_RESULT_HINTS.some((re) => re.test(html) || re.test(lower));
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const titleTag = titleMatch ? titleMatch[1].trim().slice(0, 120) : "(no title)";
  return { hasSearchHint, hasBotBlock, titleTag };
}

function shouldSaveDebugHtml(
  candidateCount: number,
  debugFlag: boolean,
  reason?: string
): boolean {
  if (debugFlag) return true;
  if (candidateCount === 0) return true;
  return false;
}

function saveDebugHtml(
  market: string,
  goodsNo: string,
  queryLabel: string,
  html: string,
  debugDir: string
): void {
  try {
    const safeLabel = queryLabel.replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff_-]/g, "_").slice(0, 40);
    const filename = `${market}_${goodsNo}_${safeLabel}.html`;
    const filepath = path.join(debugDir, filename);
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(filepath, html, "utf-8");
    console.log("[MARKET_DEBUG_HTML_SAVED]", filepath);
  } catch (e) {
    console.warn("[MARKET_DEBUG_HTML_SAVE_FAIL]", e instanceof Error ? e.message : e);
  }
}

function absUrl(base: string, href: string): string {
  if (!href?.trim()) return "";
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) return h;
  try {
    return new URL(h, base).href;
  } catch {
    return h;
  }
}

export type SelectorDiag = { selector: string; elementCount: number };

/** Amazon.co.jp 検索結果 - 複数セレクタで試す */
export function parseAmazonJpSearchHtml(
  html: string,
  options?: { diag?: (d: SelectorDiag) => void }
): ImageMatchCandidate[] {
  const $ = cheerio.load(html);
  const selectors = [
    '[data-component-type="s-search-result"]',
    "div[data-asin]:not([data-asin=''])",
    ".s-result-item[data-asin]",
    "div[data-uuid]",
    ".s-main-slot .s-result-item",
  ];
  let rootEls: cheerio.Cheerio<cheerio.Element> = $("");
  for (const sel of selectors) {
    const els = $(sel);
    options?.diag?.({ selector: sel, elementCount: els.length });
    if (els.length > 0) {
      rootEls = els;
      break;
    }
  }
  const out: ImageMatchCandidate[] = [];
  rootEls.each((_, el) => {
    const root = $(el);
    const title =
      root.find("h2 a span").first().text().trim() ||
      root.find("h2").first().text().trim() ||
      "";
    const imgEl = root.find("img.s-image").first();
    const img =
      imgEl.attr("src") ||
      imgEl.attr("data-src") ||
      imgEl.attr("data-srcset")?.split(",")[0]?.trim().split(" ")[0] ||
      root.find("img").first().attr("src");
    if (title && img && /^https?:/i.test(img)) {
      out.push({ title, imageUrl: img.trim() });
    }
  });
  return out;
}

/** 楽天市場検索 - 複数セレクタで試す */
export function parseRakutenSearchHtml(
  html: string,
  pageUrl: string,
  options?: { diag?: (d: SelectorDiag) => void }
): ImageMatchCandidate[] {
  const $ = cheerio.load(html);
  const containerSelectors = [
    "[data-card-type='item']",
    ".searchresultitem",
    "[class*='searchresultitem']",
    ".dui-card",
    ".searchresultitem",
    "li[class*='item']",
    "div[class*='item'][data-index]",
    "a[href*='/item/']",
  ];
  const out: ImageMatchCandidate[] = [];
  const seen = new Set<string>();

  for (const contSel of containerSelectors) {
    const blocks = $(contSel);
    options?.diag?.({ selector: contSel, elementCount: blocks.length });
    if (blocks.length === 0) continue;

    blocks.each((_, el) => {
      const root = $(el);
      const title =
        root.find("a.title-link, a[class*='title'], h3 a, .title a").first().text().trim() ||
        root.attr("title")?.trim() ||
        root.find("a").first().attr("title")?.trim() ||
        root.find("a").first().text().trim() ||
        "";
      const imgEl = root.find("img").first();
      const src =
        imgEl.attr("data-src") ||
        imgEl.attr("data-original") ||
        imgEl.attr("src") ||
        imgEl.attr("data-lazy-src") ||
        "";
      const imageUrl = absUrl(pageUrl, src);
      if (title.length >= 4 && imageUrl && /^https?:/i.test(imageUrl)) {
        const key = `${title.slice(0, 50)}|${imageUrl}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ title, imageUrl });
        }
      }
    });
    if (out.length > 0) return out;
  }
  return out;
}

/** Qoo10 検索 */
export function parseQoo10SearchHtml(
  html: string,
  pageUrl: string,
  options?: { diag?: (d: SelectorDiag) => void }
): ImageMatchCandidate[] {
  const $ = cheerio.load(html);
  const selectors = [
    ".item",
    "[class*='item_card']",
    ".prd_item",
    "[data-goodsno]",
    ".bd_list li",
    "li[class*='item']",
  ];
  const out: ImageMatchCandidate[] = [];
  for (const sel of selectors) {
    const blocks = $(sel);
    options?.diag?.({ selector: sel, elementCount: blocks.length });
    if (blocks.length === 0) continue;
    blocks.each((_, el) => {
      const root = $(el);
      const title =
        root.find("a[title]").first().attr("title")?.trim() ||
        root.find(".item_title, .prd_name, a").first().text().trim() ||
        "";
      const img =
        root.find("img").first().attr("data-src") ||
        root.find("img").first().attr("src") ||
        "";
      const imageUrl = absUrl(pageUrl, img);
      if (title && imageUrl && /^https?:/i.test(imageUrl)) {
        out.push({ title, imageUrl });
      }
    });
    if (out.length > 0) return out;
  }
  return out;
}

export type SkipReason =
  | "empty_query"
  | "no_html"
  | "bot_blocked"
  | "selector_zero"
  | "parse_error"
  | "genuine_no_result"
  | "search_result_but_no_match";

export type MarketplaceSearchImagesResult = {
  amazonImage?: string;
  rakutenImage?: string;
  qoo10Image?: string;
  /** 採用したモールごとの strong / weak */
  imageMatchLevels?: Partial<
    Record<"amazon" | "rakuten" | "qoo10", MarketplaceImageMatchLevel>
  >;
  skipReasons?: { amazon?: SkipReason; rakuten?: SkipReason; qoo10?: SkipReason };
};

function logMarketImagePolicy(args: {
  goodsNo: string;
  market: "amazon" | "rakuten" | "qoo10";
  product: ProductForImageMatch;
  adopted: boolean;
  picked?: MarketplacePickResult;
  candidatesForIntrinsic: ImageMatchCandidate[] | null;
}): void {
  const { goodsNo, market, product, adopted, picked, candidatesForIntrinsic } = args;
  const label = buildMarketplaceSearchLabel(product);
  const detectedType = label.marketplaceProductType;
  const allowedMatchLevel = allowedMatchLevelsLabelForProductType(detectedType);
  let actualMatchLevel: MarketplaceImageMatchLevel | null = null;
  if (adopted && picked) {
    actualMatchLevel = picked.matchLevel;
  } else if (candidatesForIntrinsic && candidatesForIntrinsic.length > 0) {
    const ranked = rankMarketplaceCandidatesByScore(product, candidatesForIntrinsic);
    actualMatchLevel = ranked[0]?.detail.matchLevel ?? null;
  }
  console.log("[MARKET_IMAGE_POLICY]", {
    goodsNo,
    market,
    detectedType,
    allowedMatchLevel,
    actualMatchLevel,
    adopted,
  });
}

function logMarketCandidateTop(
  goodsNo: string,
  market: "amazon" | "rakuten" | "qoo10",
  product: ProductForImageMatch,
  candidates: ImageMatchCandidate[],
  chosen?: { candidateIndex: number; url: string }
): void {
  if (candidates.length === 0) return;
  const full = rankMarketplaceCandidatesByScore(product, candidates);
  let rows = full.slice(0, 5);
  if (chosen) {
    const pickedRow = full.find((r) => r.candidateIndex === chosen.candidateIndex);
    if (pickedRow && !rows.some((r) => r.candidateIndex === chosen.candidateIndex)) {
      rows = [...rows.slice(0, 4), pickedRow];
    }
  }
  for (const row of rows) {
    const finalDecisionCandidate =
      !!chosen &&
      chosen.candidateIndex === row.candidateIndex &&
      chosen.url === row.candidate.imageUrl.trim();
    console.log("[MARKET_CANDIDATE_TOP]", {
      goodsNo,
      market,
      candidateIndex: row.candidateIndex,
      candidateTitle: row.candidate.title.slice(0, 220),
      candidateImageUrl: row.candidate.imageUrl.slice(0, 220),
      normalizedCandidateTitle: row.detail.normalizedCandidateTitle.slice(0, 200),
      score: row.detail.score,
      brandMatched: row.detail.brandMatched,
      keywordOverlapCount: row.detail.keywordOverlapCount,
      sizeMatched: row.detail.sizeMatched,
      modelLineMatched: row.detail.modelLineMatched,
      deviceRuleApplied: row.detail.deviceRuleApplied,
      whyRejected: row.detail.whyRejected,
      matchLevel: row.detail.matchLevel,
      finalDecisionCandidate,
    });
  }
}

function resolveSkipReason(
  fetchResult: MarketplaceFetchResult,
  candidateCount: number,
  logCtx?: { market: string; goodsNo: string }
): SkipReason {
  if (fetchResult.error) return "no_html";
  if (fetchResult.statusCode !== 200) return "no_html";
  if (fetchResult.fetchKind === "playwright") {
    if (candidateCount > 0) return "search_result_but_no_match";
    return "selector_zero";
  }
  if (!fetchResult.html || fetchResult.html.length === 0) return "no_html";

  // パーサで候補が取れている = 実検索ページとみなし、本文中の「robot」等の誤検知で bot_blocked にしない
  if (candidateCount > 0) {
    return "search_result_but_no_match";
  }

  const diag = diagnoseHtml(fetchResult.html);
  if (diag.hasBotBlock) {
    const html = fetchResult.html;
    const matchedPatterns = collectBotBlockMatches(html);
    const bodySnippet = htmlToPlainSnippetForLog(html, 600);
    console.log("[MARKET_BOT_DIAG]", {
      market: logCtx?.market,
      goodsNo: logCtx?.goodsNo,
      matchedPatterns,
      titleTag: diag.titleTag,
      bodySnippet,
    });
    return "bot_blocked";
  }
  const htmlLen = fetchResult.html.length;
  if (candidateCount === 0 && htmlLen > 5000) return "selector_zero";
  if (candidateCount === 0 && htmlLen <= 5000) return "genuine_no_result";
  return "genuine_no_result";
}

type ParseFn = (
  html: string,
  url?: string,
  opts?: { diag?: (d: SelectorDiag) => void }
) => ImageMatchCandidate[];

/** Amazon のみ Playwright で検索結果を取得し画像候補を得る */
async function fetchAmazonPlaywrightAndPick(
  queries: string[],
  product: ProductForImageMatch,
  opts: { goodsNo: string; debugHtml: boolean; debugDir: string }
): Promise<{
  url?: string;
  matchLevel?: MarketplaceImageMatchLevel;
  candidateIndex?: number;
  candidateCount: number;
  queryUsed?: string;
  reason?: SkipReason;
  fetchResult?: MarketplaceFetchResult;
}> {
  let lastCandidates = 0;
  let lastQuery = "";
  let lastFetchResult: MarketplaceFetchResult | undefined;
  let lastNonEmptyCandidates: ImageMatchCandidate[] | null = null;

  const browser = await chromium.launch({
    headless: process.env.PW_HEADED !== "1",
  });

  try {
    for (const q of queries) {
      let candidates: ImageMatchCandidate[] = [];
      let finalUrl = "";
      try {
        const pw = await fetchAmazonImagesWithPlaywright(q, { browser, maxItems: 12 });
        candidates = pw.candidates;
        finalUrl = pw.finalUrl;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastFetchResult = {
          html: null,
          statusCode: 0,
          finalUrl: "",
          error: msg,
          fetchKind: "playwright",
        };
        console.log("[MARKET_PLAYWRIGHT_RESULT]", {
          goodsNo: opts.goodsNo,
          market: "amazon",
          query: q,
          ok: false,
          error: msg.slice(0, 200),
          candidateCount: 0,
        });
        lastCandidates = 0;
        lastQuery = q;
        continue;
      }

      lastFetchResult = {
        html: null,
        statusCode: 200,
        finalUrl,
        fetchKind: "playwright",
      };

      console.log("[MARKET_PLAYWRIGHT_RESULT]", {
        goodsNo: opts.goodsNo,
        market: "amazon",
        query: q,
        ok: true,
        finalUrl: finalUrl.slice(0, 160),
        candidateCount: candidates.length,
        sampleTitles: candidates.slice(0, 3).map((c) => c.title.slice(0, 80)),
      });

      console.log("[MARKET_SELECTOR_DIAG]", {
        market: "amazon",
        goodsNo: opts.goodsNo,
        selectorTried: "playwright:img.s-image",
        elementCount: candidates.length,
      });

      console.log("[MARKET_HTML_DIAG]", {
        goodsNo: opts.goodsNo,
        market: "amazon",
        query: q,
        responseStatus: 200,
        finalUrl: finalUrl.slice(0, 120),
        htmlLength: 0,
        titleTag: "(playwright)",
        hasSearchHint: candidates.length > 0,
        hasBotBlock: false,
        candidateCount: candidates.length,
      });

      lastCandidates = candidates.length;
      lastQuery = q;
      if (candidates.length === 0) continue;

      lastNonEmptyCandidates = candidates;
      const picked = pickBestMarketplaceImageWithLevel(product, candidates);
      logMarketCandidateTop(
        opts.goodsNo,
        "amazon",
        product,
        candidates,
        picked
          ? { candidateIndex: picked.candidateIndex, url: picked.url }
          : undefined
      );
      if (picked) {
        logMarketImagePolicy({
          goodsNo: opts.goodsNo,
          market: "amazon",
          product,
          adopted: true,
          picked,
          candidatesForIntrinsic: candidates,
        });
        return {
          url: picked.url,
          matchLevel: picked.matchLevel,
          candidateIndex: picked.candidateIndex,
          candidateCount: candidates.length,
          queryUsed: q,
          fetchResult: lastFetchResult,
        };
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const reason = lastFetchResult
    ? resolveSkipReason(lastFetchResult, lastCandidates, {
        market: "amazon",
        goodsNo: opts.goodsNo,
      })
    : "no_html";

  logMarketImagePolicy({
    goodsNo: opts.goodsNo,
    market: "amazon",
    product,
    adopted: false,
    candidatesForIntrinsic: lastNonEmptyCandidates,
  });

  return {
    candidateCount: lastCandidates,
    queryUsed: lastQuery || undefined,
    reason,
    fetchResult: lastFetchResult,
  };
}

async function fetchAndPickOne(
  market: "amazon" | "rakuten" | "qoo10",
  queries: string[],
  product: ProductForImageMatch,
  buildUrl: (q: string) => string,
  parseFn: ParseFn,
  opts: { goodsNo: string; debugHtml: boolean; debugDir: string }
): Promise<{
  url?: string;
  matchLevel?: MarketplaceImageMatchLevel;
  candidateIndex?: number;
  candidateCount: number;
  queryUsed?: string;
  reason?: SkipReason;
  fetchResult?: MarketplaceFetchResult;
}> {
  let lastCandidates = 0;
  let lastQuery = "";
  let lastFetchResult: MarketplaceFetchResult | undefined;
  let lastNonEmptyCandidates: ImageMatchCandidate[] | null = null;

  for (const q of queries) {
    const enc = encodeURIComponent(q);
    const pageUrl = buildUrl(enc);
    const fetchResult = await fetchHtmlWithMeta(pageUrl);
    lastFetchResult = fetchResult;

    const selectorDiags: SelectorDiag[] = [];
    const diagCb = (d: SelectorDiag) => selectorDiags.push(d);

    const html = fetchResult.html;
    const candidates = html ? parseFn(html, pageUrl, { diag: diagCb }) : [];

    for (const d of selectorDiags) {
      console.log("[MARKET_SELECTOR_DIAG]", {
        market,
        goodsNo: opts.goodsNo,
        selectorTried: d.selector,
        elementCount: d.elementCount,
      });
    }

    const diag = diagnoseHtml(html);
    console.log("[MARKET_HTML_DIAG]", {
      goodsNo: opts.goodsNo,
      market,
      query: q,
      responseStatus: fetchResult.statusCode,
      finalUrl: fetchResult.finalUrl?.slice(0, 120),
      htmlLength: html?.length ?? 0,
      titleTag: diag.titleTag,
      hasSearchHint: diag.hasSearchHint,
      hasBotBlock: diag.hasBotBlock,
      candidateCount: candidates.length,
    });

    if (html && diag.hasBotBlock && candidates.length > 0) {
      console.log("[MARKET_BOT_DIAG]", {
        goodsNo: opts.goodsNo,
        market,
        note: "keywords_present_skipped_for_skip_reason_due_to_candidateCount_gt_0",
        matchedPatterns: collectBotBlockMatches(html),
        titleTag: diag.titleTag,
        bodySnippet: htmlToPlainSnippetForLog(html, 500),
      });
    }

    const shouldSave =
      shouldSaveDebugHtml(candidates.length, opts.debugHtml, undefined) && html;
    if (shouldSave && html) {
      const queryLabel = q.slice(0, 30).replace(/[^\w\u3040-\u30ff\u4e00-\u9fff]/g, "_");
      saveDebugHtml(market, opts.goodsNo, queryLabel || "q", html, opts.debugDir);
    }

    lastCandidates = candidates.length;
    lastQuery = q;
    if (candidates.length === 0) continue;

    lastNonEmptyCandidates = candidates;
    const picked = pickBestMarketplaceImageWithLevel(product, candidates);
    logMarketCandidateTop(
      opts.goodsNo,
      market,
      product,
      candidates,
      picked ? { candidateIndex: picked.candidateIndex, url: picked.url } : undefined
    );
    if (picked) {
      logMarketImagePolicy({
        goodsNo: opts.goodsNo,
        market,
        product,
        adopted: true,
        picked,
        candidatesForIntrinsic: candidates,
      });
      return {
        url: picked.url,
        matchLevel: picked.matchLevel,
        candidateIndex: picked.candidateIndex,
        candidateCount: candidates.length,
        queryUsed: q,
        fetchResult: lastFetchResult,
      };
    }
  }

  const reason = lastFetchResult
    ? resolveSkipReason(lastFetchResult, lastCandidates, {
        market,
        goodsNo: opts.goodsNo,
      })
    : "no_html";

  logMarketImagePolicy({
    goodsNo: opts.goodsNo,
    market,
    product,
    adopted: false,
    candidatesForIntrinsic: lastNonEmptyCandidates,
  });

  return {
    candidateCount: lastCandidates,
    queryUsed: lastQuery || undefined,
    reason,
    fetchResult: lastFetchResult,
  };
}

export async function fetchMarketplaceSearchImages(
  product: ProductForImageMatch,
  options?: {
    goodsNo?: string;
    debugHtml?: boolean;
  }
): Promise<MarketplaceSearchImagesResult> {
  const goodsNo = options?.goodsNo ?? "";
  const debugHtml = options?.debugHtml ?? process.env.DEBUG_MARKETPLACE_HTML === "1";
  const debugDir = path.join(process.cwd(), "debug", "marketplace-html");

  const label = buildMarketplaceSearchLabel(product);
  const queries = buildMarketplaceSearchQueries(label);

  console.log("[MARKET_PRODUCT_TYPE]", {
    goodsNo,
    detectedType: label.marketplaceProductType,
    searchQueries: queries,
  });

  console.log("[MARKET_IMAGE_SEARCH_QUERY]", {
    goodsNo,
    detectedType: label.marketplaceProductType,
    originalNameJa: label.originalNameJa || "(empty)",
    originalName: label.originalName || "(empty)",
    brandJa: product.brandJa || "(empty)",
    brand: product.brand || "(empty)",
    searchQueries: queries,
  });

  if (queries.length === 0) {
    console.log("[MARKET_IMAGE_SEARCH_RESULT]", {
      goodsNo,
      queryUsed: null,
      candidateCount: 0,
      reason: "empty_query",
    });
    return {
      skipReasons: {
        amazon: "empty_query",
        rakuten: "empty_query",
        qoo10: "empty_query",
      },
    };
  }

  const [amazonRes, rakutenRes, qoo10Res] = await Promise.all([
    fetchAmazonPlaywrightAndPick(queries, product, { goodsNo, debugHtml, debugDir }),
    fetchAndPickOne(
      "rakuten",
      queries,
      product,
      (enc) => `https://search.rakuten.co.jp/search/mall/${enc}/`,
      (h, url) => parseRakutenSearchHtml(h, url || "https://search.rakuten.co.jp/search/mall/"),
      { goodsNo, debugHtml, debugDir }
    ),
    fetchAndPickOne(
      "qoo10",
      queries,
      product,
      (enc) => `https://www.qoo10.jp/s/?keyword=${enc}`,
      (h, url) => parseQoo10SearchHtml(h, url || "https://www.qoo10.jp/s/"),
      { goodsNo, debugHtml, debugDir }
    ),
  ]);

  const skipReasons: MarketplaceSearchImagesResult["skipReasons"] = {};
  const imageMatchLevels: NonNullable<MarketplaceSearchImagesResult["imageMatchLevels"]> =
    {};
  for (const [market, res] of [
    ["amazon", amazonRes],
    ["rakuten", rakutenRes],
    ["qoo10", qoo10Res],
  ] as const) {
    const r = res as {
      url?: string;
      matchLevel?: MarketplaceImageMatchLevel;
      queryUsed?: string;
      candidateCount: number;
      reason?: SkipReason;
    };
    console.log("[MARKET_IMAGE_SEARCH_RESULT]", {
      goodsNo,
      market,
      queryUsed: r.queryUsed,
      candidateCount: r.candidateCount,
      matched: !!r.url,
      matchLevel: r.matchLevel,
      reason: r.reason,
    });
    if (!r.url && r.reason) {
      skipReasons[market] = r.reason;
    }
    if (r.url && r.matchLevel) {
      imageMatchLevels[market] = r.matchLevel;
    }
  }

  const result: MarketplaceSearchImagesResult = {};
  if (amazonRes.url) result.amazonImage = amazonRes.url;
  if (rakutenRes.url) result.rakutenImage = rakutenRes.url;
  if (qoo10Res.url) result.qoo10Image = qoo10Res.url;
  if (Object.keys(imageMatchLevels).length > 0) result.imageMatchLevels = imageMatchLevels;
  if (Object.keys(skipReasons).length > 0) result.skipReasons = skipReasons;
  return result;
}
