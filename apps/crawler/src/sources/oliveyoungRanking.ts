/**
 * OliveYoung ランキング取得
 * 一次ルート: Playwright page.goto(getBestList.do) → "Just a moment" 通過待ち → HTML 抽出
 * 失敗時は空配列を返す（クラッシュ禁止）
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import type { BrowserContext } from 'playwright';
import { getBrowserContext, clearBlockedRequestUrls } from '../utils/browser';
import { Logger } from '../utils/logger';

const DEBUG_DIR = path.join(process.cwd(), '.debug');
const API_RESPONSE_DEBUG_PATH = path.join(DEBUG_DIR, 'oy-ranking', 'api-response.txt');
const MAX_API_RESPONSE_DEBUG_BYTES = 200 * 1024;

const logger = new Logger('OLIVEYOUNG_RANKING');

const GET_BEST_LIST_URL = 'https://www.oliveyoung.co.kr/store/main/getBestList.do';
const DEFAULT_RANKING_URL = 'https://www.oliveyoung.co.kr/store/display/bestSeller.do';
const MAIN_PAGE_URL = 'https://www.oliveyoung.co.kr/store/main/main.do';

/** 404/ブロック検知用キーワード */
const BLOCK_KEYWORDS = ['페이지를 찾을 수 없어요', '접근이 제한', '로봇', 'Cloudflare', 'Just a moment'];

const GOODS_NO_PATTERN = /^A\d{12,}$/i;

export interface RankingItem {
  goodsNo: string;
  rank: number;
  pickedUrl?: string;
  name?: string;
  brand?: string;
  /** ログ用のみ。Firestoreには保存しない */
  debugText?: string;
}

export interface CollectRankingParams {
  limit?: number;
}

function isOliveyoungHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'www.oliveyoung.co.kr' || host.endsWith('.oliveyoung.co.kr');
  } catch {
    return false;
  }
}

/** JSON から goodsNo / goodsNumber / goodsno 等を深く走査して抽出。rank は配列順（1..N） */
function extractFromBestListJson(obj: unknown): RankingItem[] {
  const acc: string[] = [];
  const keyNames = ['goodsNo', 'goodsNumber', 'goodsno', 'prdtNo', 'goods_no', 'prdt_no'];

  function walk(o: unknown): void {
    if (!o) return;
    if (typeof o === 'string' && GOODS_NO_PATTERN.test(o)) {
      acc.push(o);
      return;
    }
    if (Array.isArray(o)) {
      for (const x of o) walk(x);
      return;
    }
    if (typeof o === 'object') {
      const rec = o as Record<string, unknown>;
      for (const k of keyNames) {
        const v = rec[k];
        if (v && typeof v === 'string' && GOODS_NO_PATTERN.test(v)) acc.push(v);
      }
      for (const v of Object.values(rec)) walk(v);
    }
  }
  walk(obj);
  const seen = new Set<string>();
  const items: RankingItem[] = [];
  for (const no of acc) {
    if (!seen.has(no)) {
      seen.add(no);
      items.push({ goodsNo: no, rank: items.length + 1 });
    }
  }
  return items;
}

function collectGoodsNoFromObj(obj: unknown, acc: string[]): void {
  if (!obj) return;
  if (typeof obj === 'string' && GOODS_NO_PATTERN.test(obj)) {
    acc.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectGoodsNoFromObj(x, acc);
    return;
  }
  if (typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    const no = o.goodsNo != null ? o.goodsNo : o.prdtNo != null ? o.prdtNo : o.goods_no != null ? o.goods_no : o.prdt_no != null ? o.prdt_no : o.goodsNumber != null ? o.goodsNumber : o.goodsno;
    if (no && typeof no === 'string' && GOODS_NO_PATTERN.test(no)) acc.push(no);
    for (const v of Object.values(o)) collectGoodsNoFromObj(v, acc);
  }
}

/** JSON body から goodsNo を10件以上含むか判定し、含めば抽出 */
function extractFromJsonText(text: string): RankingItem[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const re = /"goodsNo"\s*:\s*"([^"]+)"/g;
    const arr: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) arr.push(m[1]);
    if (arr.length >= 10) {
      const seen = new Set<string>();
      return arr.filter((n) => GOODS_NO_PATTERN.test(n) && !seen.has(n) && seen.add(n)).map((goodsNo, i) => ({ goodsNo, rank: i + 1 }));
    }
    return null;
  }

  const acc: string[] = [];
  collectGoodsNoFromObj(parsed, acc);
  if (acc.length < 10) return null;

  const seen = new Set<string>();
  const items: RankingItem[] = [];
  for (const no of acc) {
    if (GOODS_NO_PATTERN.test(no) && !seen.has(no)) {
      seen.add(no);
      items.push({ goodsNo: no, rank: items.length + 1 });
    }
  }
  return items.length >= 10 ? items : null;
}

/** HTML から goodsNo を正規表現で抽出 */
function extractFromHtml(html: string): RankingItem[] {
  const patterns = [
    /goodsNo=([A-Z0-9]+)/gi,
    /"goodsNo"\s*:\s*"([^"]+)"/g,
    /getGoodsDetail\.do\?goodsNo=([A-Z0-9]+)/gi,
  ];
  const seen = new Set<string>();
  const items: RankingItem[] = [];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const rx = new RegExp(re.source, re.flags);
    while ((m = rx.exec(html)) !== null) {
      const no = m[1]?.trim();
      if (no && GOODS_NO_PATTERN.test(no) && !seen.has(no)) {
        seen.add(no);
        items.push({ goodsNo: no, rank: items.length + 1 });
      }
    }
  }
  return items;
}

/** href 文字列から goodsNo を抽出（goodsNo= / goodsDetail.do?goodsNo= / getGoodsDetail.do?goodsNo= 等）。 */
function extractGoodsNoFromHref(href: string): string[] {
  const out: string[] = [];
  const patterns = [
    /goodsNo=(A\d+)/gi,
    /goodsDetail\.do\?goodsNo=(A\d+)/gi,
    /getGoodsDetail\.do\?goodsNo=(A\d+)/gi,
    /"(A\d{12})"/g,
    /'(A\d{12})'/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    const rx = new RegExp(re.source, re.flags);
    while ((m = rx.exec(href)) !== null) {
      const no = m[1]?.trim();
      if (no && GOODS_NO_PATTERN.test(no)) out.push(no);
    }
  }
  return out;
}

/** getGoodsDetail.do リンクから goodsNo を抽出（出現順・重複は最初の rank を採用） */
const GOODS_LINK_REGEX = /getGoodsDetail\.do\?[^"'<>]*goodsNo=([A-Z0-9]+)/g;

function extractGoodsNoFromBestListHtml(html: string, limit: number): RankingItem[] {
  const seen = new Set<string>();
  const items: RankingItem[] = [];
  let m: RegExpExecArray | null;
  const rx = new RegExp(GOODS_LINK_REGEX.source, GOODS_LINK_REGEX.flags);
  while ((m = rx.exec(html)) !== null && items.length < limit) {
    const no = m[1]?.trim();
    if (no && GOODS_NO_PATTERN.test(no) && !seen.has(no)) {
      seen.add(no);
      items.push({ goodsNo: no, rank: items.length + 1 });
    }
  }
  return items;
}

/**
 * getBestList.do を HTTP GET（HTML）で取得。
 * 成功: { ok: true, items, method }
 * 0件（no_goods_links）: { ok: false, reason: 'no_goods_links_in_html' } → 呼び出し元で [] を返す
 * ネットワークエラー等: null → フォールバック
 */
async function tryFetchBestListHtml(
  limit: number
): Promise<{ ok: true; items: RankingItem[]; method: string } | { ok: false; reason: string } | null> {
  try {
    const res = await fetch(GET_BEST_LIST_URL, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://www.oliveyoung.co.kr/',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    const html = await res.text();
    const finalUrl = (res as Response & { url?: string }).url != null ? (res as Response & { url?: string }).url : GET_BEST_LIST_URL;
    const match1 = html.match(/getGoodsDetail\.do\?[^"'<>]*goodsNo=/g);
    const goodsLinkCount = (match1 != null ? match1 : []).length;

    logger.info(
      `[RANKING] getBestList.do status=${res.status} finalUrl=${finalUrl} body.length=${html.length} goodsLinkCount=${goodsLinkCount}`
    );

    if (goodsLinkCount === 0) {
      logger.info(`[RANKING] reason=no_goods_links_in_html`);
      return { ok: false, reason: 'no_goods_links_in_html' };
    }

    const items = extractGoodsNoFromBestListHtml(html, limit);
    if (items.length === 0) return { ok: false, reason: 'no_goods_links_in_html' };

    const sample = items[0] && (items[0] as { goodsNo?: string }).goodsNo != null ? (items[0] as { goodsNo: string }).goodsNo : '';
    logger.info(`[RANKING] collected=${items.length} method=http:getBestListHtml goodsNo sample=${sample}`);
    return { ok: true, items, method: 'http:getBestListHtml' };
  } catch (e: unknown) {
    logger.warn(`[RANKING] getBestListHtml fetch error`, (e as Error).message != null ? (e as Error).message : e);
    return null;
  }
}

/** ブロック検知用: Access Denied / bot / captcha 等 */
const BLOCK_SIGNATURE_REGEX = /(Access Denied|Forbidden|bot|captcha|blocked|challenge)/i;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: 'https://www.oliveyoung.co.kr/',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
} as const;

/**
 * ホームへ1回アクセス→同じ context で getBestList.do を取得（Cookie/セッション共有）
 * goodsLinkCount===0 でも例外は投げない
 */
export async function tryFetchBestListHtmlViaContext(
  context: BrowserContext
): Promise<{ html: string; status: number } | null> {
  let page: Awaited<ReturnType<BrowserContext['newPage']>> | null = null;
  try {
    page = await context.newPage();
    await page.goto(MAIN_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    await page.close();
    page = null;

    const res = await context.request.get(GET_BEST_LIST_URL, { headers: { ...FETCH_HEADERS } });
    const html = await res.text();
    const status = res.status();

    const match1 = html.match(/getGoodsDetail\.do\?[^"'<>]*goodsNo=/g);
    const goodsLinkCount = (match1 != null ? match1 : []).length;
    const hasBlockSignature = BLOCK_SIGNATURE_REGEX.test(html);

    logger.info(
      `[RANKING] getBestListViaContext status=${status} body.length=${html.length} goodsLinkCount=${goodsLinkCount} hasBlockSignature=${hasBlockSignature}`
    );

    return { html, status };
  } catch (e: unknown) {
    logger.warn(`[RANKING] getBestListViaContext error`, (e as Error).message != null ? (e as Error).message : e);
    if (page) await page.close().catch(() => {});
    return null;
  }
}

/** getBestList.do を fetch（JSON想定）。成功時は RankingItem[]、失敗時は null */
async function tryFetchBestListApi(limit: number): Promise<{ items: RankingItem[]; method: string } | null> {
  try {
    const res = await fetch(GET_BEST_LIST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.oliveyoung.co.kr/',
      },
    });

    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();
    const bodyStart = raw.trim().slice(0, 2);
    const isJsonLike = contentType.toLowerCase().includes('json') || bodyStart === '{' || bodyStart === '[';

    await fs.mkdir(path.dirname(API_RESPONSE_DEBUG_PATH), { recursive: true });
    const toSave = raw.slice(0, MAX_API_RESPONSE_DEBUG_BYTES);
    await fs.writeFile(API_RESPONSE_DEBUG_PATH, toSave, 'utf-8').catch(() => {});

    if (res.status === 403 || res.status === 404) {
      logger.info(`[RANKING] api status=${res.status} contentType=${contentType} extracted=0 (fetch failed)`);
      if (raw.length > 0) logger.info(`[RANKING] api bodyHead=${JSON.stringify(raw.slice(0, 200))}`);
      return null;
    }

    if (!isJsonLike) {
      logger.info(`[RANKING] api status=${res.status} contentType=${contentType} extracted=0 (not json)`);
      if (raw.length > 0) logger.info(`[RANKING] api bodyHead=${JSON.stringify(raw.slice(0, 200))}`);
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.info(`[RANKING] api status=${res.status} contentType=${contentType} extracted=0 (parse error)`);
      logger.info(`[RANKING] api bodyHead=${JSON.stringify(raw.slice(0, 200))}`);
      return null;
    }

    const items = extractFromBestListJson(parsed).slice(0, limit);
    logger.info(`[RANKING] api status=${res.status} contentType=${contentType} extracted=${items.length}`);

    if (items.length === 0) {
      logger.info(`[RANKING] api bodyHead=${JSON.stringify(raw.slice(0, 200))}`);
      return null;
    }

    return { items, method: 'api:getBestList' };
  } catch (e: unknown) {
    logger.warn(`[RANKING] api fetch error`, (e as Error).message != null ? (e as Error).message : e);
    return null;
  }
}

/** 本文に404/ブロックキーワードが含まれるか検出 */
function detectBlockPage(title: string, bodyText: string): string[] {
  const found: string[] = [];
  const combined = `${title} ${bodyText}`;
  for (const kw of BLOCK_KEYWORDS) {
    if (combined.includes(kw)) found.push(kw);
  }
  return found;
}

/** href 配列から goodsNo を出現順でユニーク化し、limit まで [{ goodsNo, rank }] を返す */
function buildRankingFromHrefs(hrefs: string[], limit: number): RankingItem[] {
  const seen = new Set<string>();
  const items: RankingItem[] = [];
  for (const href of hrefs) {
    for (const goodsNo of extractGoodsNoFromHref(href)) {
      if (!seen.has(goodsNo)) {
        seen.add(goodsNo);
        items.push({ goodsNo, rank: items.length + 1 });
        if (items.length >= limit) return items;
      }
    }
  }
  return items;
}

/**
 * ランキングから goodsNo を収集（Playwright 一次ルート: page.goto(getBestList.do)）
 * 0件でもクラッシュしない
 */
export async function collectRankingGoodsNos(
  params?: CollectRankingParams
): Promise<RankingItem[]> {
  const limit = params && params.limit != null ? params.limit : 100;

  try {
    clearBlockedRequestUrls();
    const { context } = await getBrowserContext();
    const page = await context.newPage();

    let firstHit: RankingItem[] | null = null;
    const urlKeywords = /getBestList|best|ranking|Best/i;
    const storeMainPath = /oliveyoung\.co\.kr\/store\/main\//i;
    const allowedContentTypes = /text\/html|application\/json|text\/plain/i;

    page.on('response', async (res: { url: () => string; headers: () => Record<string, string>; text: () => Promise<string> }) => {
      if (firstHit && firstHit.length > 0) return;
      try {
        const url = res.url();
        const matchUrl = urlKeywords.test(url) || storeMainPath.test(url);
        if (!matchUrl) return;

        const ct = (res.headers()['content-type'] || '').toLowerCase();
        if (!allowedContentTypes.test(ct)) return;

        const body = await res.text();
        if (!body.includes('goodsNo=')) return;

        let extracted = extractGoodsNoFromBestListHtml(body, limit);
        if (extracted.length === 0) extracted = extractFromHtml(body).slice(0, limit);
        if (extracted.length > 0) firstHit = extracted;
      } catch {
        // 取りこぼし無視
      }
    });

    logger.info(`[RANKING] primary: page.goto ${GET_BEST_LIST_URL}`);
    await page.goto(GET_BEST_LIST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('[DEBUG_URL_AFTER_GOTO]', page.url());
    const htmlLen = (await page.content()).length;
    console.log('[DEBUG_HTML_LEN_AFTER_GOTO]', htmlLen);

    await page.waitForTimeout(1500);
    try {
      await page.waitForSelector("a[href*='goodsNo=']", { timeout: 10000 });
      console.log("[DEBUG_WAIT_GOODSNO_OK]");
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.warn("[DEBUG_WAIT_GOODSNO_FAIL]", { message: err?.message != null ? err.message : String(e) });
    }

    // document.title に "Just a moment" が含まれる間は待機
    const maxWaitMs = 30000;
    const pollMs = 1000;
    let elapsed = 0;
    while (elapsed < maxWaitMs) {
      const title = await page.title();
      if (!title.includes('Just a moment')) break;
      logger.info(`[RANKING] waiting for challenge: title="${title}"`);
      await page.waitForTimeout(pollMs);
      elapsed += pollMs;
    }

    const counts = await page.evaluate(() => ({
      li: document.querySelectorAll('li').length,
      a: document.querySelectorAll('a').length,
      img: document.querySelectorAll('img').length,
      prd: document.querySelectorAll('[class*="prd"]').length,
      goodsNoLike: document.querySelectorAll('a[href*="goodsNo="]').length,
      goodsNoLike2: document.querySelectorAll('a[href*="goodsNo"]').length,
      dataGoodsNo: document.querySelectorAll('[data-goods-no]').length,
    }));
    console.log('[DEBUG_COUNTS]', JSON.stringify(counts));

    const goodsLinkCount = await page.evaluate(
      () => document.querySelectorAll("a[href*='goodsNo=']").length
    );
    console.log('[DEBUG_GOODSNO_LINK_COUNT]', goodsLinkCount);

    // response から取得できていれば優先採用（firstHit は page.on 内で代入されるため型を明示）
    let items: RankingItem[] = [];
    const firstHitRef = firstHit as RankingItem[] | null;
    if (firstHitRef && firstHitRef.length > 0) {
      items = firstHitRef.slice(0, limit);
    }

    let content = '';
    if (items.length === 0) {
      content = await page.content();
      items = extractGoodsNoFromBestListHtml(content, limit);
      if (items.length === 0) items = extractFromHtml(content).slice(0, limit);
    }
    if (items.length === 0) {
      try {
        const linkItems = await page.evaluate(({ limit }: { limit: number }) => {
          const out: { rank: number; goodsNo: string; pickedUrl: string; brand: string; name: string; debugText: string }[] = [];
          const seen = new Set<string>();
          const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];

          const clean = (s: string) =>
            (s || '')
              .replace(/\s+/g, ' ')
              .replace(/[<>]/g, '')
              .trim();

          const isNoise = (s: string) => {
            const t = s.trim();
            if (!t) return true;
            if (/[0-9]/.test(t) && /원|₩|%|,/.test(t)) return true;
            if (t.length <= 1) return true;
            return false;
          };

          for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/goodsNo=([A-Za-z0-9]+)/);
            if (!m) continue;

            const goodsNo = m[1];
            if (!goodsNo || seen.has(goodsNo)) continue;
            seen.add(goodsNo);

            const pickedUrl = a.href || href;

            const root = (a.closest('li') || a.closest('div') || a) as HTMLElement;
            const text = clean(root.innerText || '');
            const lines = text.split('\n').map(clean).filter(Boolean);
            const candidates = lines.filter((l) => !isNoise(l));

            const stripRank = (s: string) => s.replace(/^\s*\d{1,3}\s*$/, '').trim();
            const cand2 = candidates
              .map(stripRank)
              .filter((s) => s && !/^(pick|올영픽|세일|오늘드림)$/i.test(s));

            let brand = '';
            let name = '';

            if (cand2.length >= 1) brand = cand2[0];
            if (cand2.length >= 2) name = cand2[1];

            if (!name) {
              const longest = cand2.slice(0, 6).sort((a, b) => b.length - a.length)[0] || '';
              if (longest && longest !== brand) name = longest;
            }

            out.push({
              rank: out.length + 1,
              goodsNo,
              pickedUrl,
              brand: brand || '',
              name: name || '',
              debugText: (text || '').slice(0, 400),
            });

            if (out.length >= limit) break;
          }

          return out;
        }, { limit });
        if (linkItems.length > 0) items = linkItems;
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string; stack?: string };
        console.warn('[RANKING] failed reason=page.evaluate', {
          name: err?.name,
          message: err?.message,
          stack: String(err?.stack || '').slice(0, 500),
        });
      }
      if (items.length === 0) {
        const countsAfter = await page.evaluate(() => ({
          a_goodsNo: document.querySelectorAll("a[href*='goodsNo=']").length,
          prd_info: document.querySelectorAll('.prd_info').length,
          a_total: document.querySelectorAll('a').length,
        }));
        console.warn('[DEBUG_COUNTS_AFTER_EVAL]', countsAfter);
        const diag = await page.evaluate(() => {
          const title = document.title;
          const bodyText = (document.body != null && document.body.innerText != null ? document.body.innerText : '').slice(0, 200);
          const aTotal = document.querySelectorAll('a').length;
          const goodsLink = document.querySelectorAll("a[href*='goodsNo=']").length;
          const imgs = document.querySelectorAll('img').length;
          return { title, bodyText, aTotal, goodsLink, imgs };
        });
        console.warn('[DEBUG_PAGE_DIAG]', diag);
      }
    }
    if (content === '') content = await page.content();
    const pageTitle = await page.title();
    const matchContent = content.match(/getGoodsDetail\.do\?[^"'<>]*goodsNo=/g);
    const goodsLinkCountFromHtml = (matchContent != null ? matchContent : []).length;

    // 100件未満なら data-goods-no でフォールバック
    if (items.length < limit) {
      try {
        const more = await page.evaluate(
          ({ limit: lim, already }: { limit: number; already: string[] }) => {
            const out: { goodsNo: string; pickedUrl?: string }[] = [];
            const seen = new Set<string>(already);
            const nodes = Array.from(document.querySelectorAll('[data-goods-no]')) as HTMLElement[];
            for (const el of nodes) {
              const goodsNo = (el.getAttribute('data-goods-no') || '').trim();
              if (!goodsNo || seen.has(goodsNo)) continue;
              seen.add(goodsNo);
              out.push({ goodsNo });
              if (already.length + out.length >= lim) break;
            }
            return out;
          },
          { limit, already: items.map((x) => x.goodsNo) }
        );
        for (const x of more) {
          items.push({
            rank: items.length + 1,
            goodsNo: x.goodsNo,
            pickedUrl: x.pickedUrl,
          });
          if (items.length >= limit) break;
        }
        if (more.length > 0) {
          console.log('[DEBUG_FALLBACK_ADDED]', { added: more.length, total: items.length });
        }
      } catch {
        // フォールバック失敗は無視
      }
    }

    const limited = items.slice(0, limit);
    const j = (v: unknown) => {
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    };
    if (limited.length > 0) {
      for (const it of limited.slice(0, 3)) {
        console.log(
          `[DEBUG_NAME_BRAND_ONE] ${j({
            rank: it.rank,
            goodsNo: it.goodsNo,
            brand: it.brand,
            name: it.name,
            pickedUrl: it.pickedUrl,
            debugText: (it.debugText || '').slice(0, 120),
          })}`
        );
      }
      const first = limited[0];
      console.log(
        `[DEBUG_FIRST_ITEM] ${j({
          goodsNo: first?.goodsNo,
          brand: first?.brand,
          name: first?.name,
          pickedUrl: first?.pickedUrl,
          debugText: (first?.debugText || '').slice(0, 200),
        })}`
      );
    }
    console.log(
      `[DEBUG_ITEMS_COLLECTED] ${j({
        collected: limited.length,
        first: limited.slice(0, 3),
        last: limited.slice(-3),
      })}`
    );

    const firstHitRef2 = firstHit as RankingItem[] | null;
    if (limited.length >= 50) {
      const sample = limited[0] && (limited[0] as { goodsNo?: string }).goodsNo != null ? (limited[0] as { goodsNo: string }).goodsNo : '';
      const method = firstHitRef2 && firstHitRef2.length > 0 ? 'playwright:response' : 'playwright:getBestList';
      logger.info(`[RANKING] status=success collected=${limited.length} method=${method} goodsNo sample=${sample}`);
    } else if (limited.length >= 1) {
      const sample = limited[0] && (limited[0] as { goodsNo?: string }).goodsNo != null ? (limited[0] as { goodsNo: string }).goodsNo : '';
      const method = firstHitRef2 && firstHitRef2.length > 0 ? 'playwright:response' : 'playwright:getBestList';
      logger.warn(`[RANKING] status=warn collected=${limited.length} (1..49) method=${method} goodsNo sample=${sample}`);
    } else {
      logger.info(`[RANKING] status=failed collected=0 url=${GET_BEST_LIST_URL} goodsLinkCount=${goodsLinkCountFromHtml} title=${pageTitle}`);
      console.log('[DEBUG_HTML_SNIPPET_0ITEMS]', content.slice(0, 2000));
      await fs.mkdir(DEBUG_DIR, { recursive: true });
      await page.screenshot({ path: path.join(DEBUG_DIR, 'oy-ranking.png'), fullPage: true }).catch(() => {});
      await fs.writeFile(path.join(DEBUG_DIR, 'oy-ranking.html'), content, 'utf-8').catch(() => {});
    }

    await page.close().catch(() => {});
    return limited;
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string; stack?: string };
    logger.warn('[RANKING] failed', {
      name: err?.name,
      message: err?.message,
      stack: String(err?.stack || '').slice(0, 500),
    });
    return [];
  }
}

/** @deprecated Use collectRankingGoodsNos */
export async function crawlOliveYoungRanking(): Promise<RankingItem[]> {
  return collectRankingGoodsNos({ limit: 100 });
}
