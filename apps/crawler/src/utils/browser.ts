/**
 * Playwrightフェイルオーバー（403エラー時のみ使用）
 */
import { Logger } from './logger';
import { appendFailureLog, saveDebugHTML, saveJSON } from '../storage/jsonStore';
import { FailureLog } from '@kbeauty-ai/core';
import * as path from 'path';
import * as fs from 'fs/promises';

const logger = new Logger('BROWSER');

// ブラウザとコンテキストのキャッシュ
let cachedBrowser: any = null;
let cachedContext: any = null;
let isInitialized = false;

/** mpc2-prod-*.a.run.app ブロック時のログを1回だけ出す用 */
let hasLoggedBlockedTracker = false;

/** OYW_DEBUG=1 用: ブロックしたリクエストURL（最大30件） */
export const blockedRequestUrls: string[] = [];
export function clearBlockedRequestUrls(): void {
  blockedRequestUrls.length = 0;
}

/**
 * ブラウザとコンテキストを初期化（再利用可能）
 * oliveyoungIngredients の context.request 経由 API 呼び出しに使用
 */
export async function getBrowserContext() {
  const wantHar = process.env.RECORD_HAR === '1';
  if (wantHar && cachedContext) {
    await cachedContext.close().catch(() => {});
    cachedContext = null;
    isInitialized = false;
    logger.info('HAR requested: cleared cached context so new context will record HAR');
  }

  if (cachedBrowser && cachedContext && isInitialized) {
    return { browser: cachedBrowser, context: cachedContext };
  }

  try {
    const { chromium } = await import('playwright');
    const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    
    if (!cachedBrowser) {
      cachedBrowser = await chromium.launch({ headless });
      logger.info(`Playwright browser launched (headless: ${headless})`);
    }
    
    if (!cachedContext) {
      const contextOptions: any = {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'ko-KR',
      };
      if (process.env.RECORD_HAR === '1') {
        await fs.mkdir('out/debug_network', { recursive: true });
        contextOptions.recordHar = { path: 'out/debug_network/oliveyoung.har', content: 'embed' };
        logger.info('HAR recording enabled → out/debug_network/oliveyoung.har');
      }
      cachedContext = await cachedBrowser.newContext(contextOptions);

      // OYW_DISABLE_BLOCK=1 のときは route/abort を無効化。*.a.run.app は常に許可（ランキングAPI対策）
      await cachedContext.route('**/*', async (route: any) => {
        if (process.env.OYW_DISABLE_BLOCK === '1') {
          await route.continue();
          return;
        }
        const url = route.request().url();
        let hostname = '';
        try {
          hostname = new URL(url).hostname;
        } catch {
          await route.continue();
          return;
        }
        // *.a.run.app をブロック対象から除外（完全に許可）
        if (hostname.endsWith('.a.run.app')) {
          await route.continue();
          return;
        }
        // mpc2-prod-*.a.run.app は上で *.a.run.app として許可済み。他にブロックするホストがあればここに追加
        await route.continue();
      });

      logger.info('Playwright context created');
    }
    // PoC中は document, script, xhr, fetch, stylesheet は route で abort しない（上記は mpc2-prod-*.a.run.app のみ遮断）

    // 最初の1回のみ、トップページでチャレンジ通過を促す
    if (!isInitialized) {
      const warmupPage = await cachedContext.newPage();
      try {
        logger.info('Warming up browser with top page to pass Cloudflare challenge...');
        await warmupPage.goto('https://www.oliveyoung.co.kr/', { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        // チャレンジ通過のための待機（3-5秒）
        await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
        await warmupPage.close();
        isInitialized = true;
        logger.info('Browser warmup completed');
      } catch (error: any) {
        await warmupPage.close();
        logger.warn('Warmup failed, but continuing:', error.message);
        isInitialized = true; // 失敗しても続行
      }
    }
    
    return { browser: cachedBrowser, context: cachedContext };
  } catch (error: any) {
    if (error.message?.includes('Cannot find module')) {
      logger.warn('Playwright is not installed. Install with: pnpm add -D playwright && pnpm exec playwright install chromium');
      throw new Error('Playwright not available');
    }
    throw error;
  }
}

/**
 * ブラウザを閉じる（終了時）
 * context を先に close して HAR を flush してから browser を閉じる。
 */
export async function closeBrowser() {
  if (cachedContext) {
    await cachedContext.close().catch(() => {});
    cachedContext = null;
    isInitialized = false;
  }
  if (cachedBrowser) {
    await cachedBrowser.close();
    cachedBrowser = null;
    logger.info('Playwright browser closed');
  }
}

/**
 * URLからgoodsNoを抽出
 */
function extractGoodsNoFromUrl(url: string): string | null {
  const match = url.match(/(?:goodsNumber|goodsNo)=([A-Z0-9]{12,})/i);
  return match ? match[1] : null;
}

/** 404 ページとみなす HTML の条件 */
function is404Page(html: string): boolean {
  return (
    html.includes('error-icon-404') ||
    html.includes('페이지를 찾을 수 없습니다') ||
    (html.includes('404') && html.includes('찾을 수 없'))
  );
}

/**
 * 候補URLのうち、200で404ページでない最初のURLを返す（軽量チェック）
 */
export async function findWorkingGoodsUrl(candidates: string[]): Promise<string | null> {
  const { context } = await getBrowserContext();
  const page = await context.newPage();
  try {
    for (const candidate of candidates) {
      try {
        const resp = await page.goto(candidate, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        const status = resp != null && resp.status() != null ? resp.status() : 0;
        const html = await page.content();
        if (status >= 200 && status < 300 && !is404Page(html)) {
          logger.info(`findWorkingGoodsUrl: selected candidate status=${status} url=${candidate}`);
          return candidate;
        }
        logger.debug(`findWorkingGoodsUrl: skip status=${status} url=${candidate}`);
      } catch (e: any) {
        logger.debug(`findWorkingGoodsUrl: goto failed ${candidate}`, e?.message);
      }
    }
    return null;
  } finally {
    await page.close();
  }
}

/**
 * JSONオブジェクトからgoodsNoを再帰的に探索
 */
function extractGoodsNoFromJson(obj: any, path: string = ''): string | null {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (typeof obj === 'string') {
    const match = obj.match(/^([A-Z0-9]{12,})$/);
    if (match && (path.includes('goodsNumber') || path.includes('goodsNo'))) {
      return match[1];
    }
  }
  
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const result = extractGoodsNoFromJson(obj[i], `${path}[${i}]`);
        if (result) return result;
      }
    } else {
      // goodsNumber/goodsNoキーを直接チェック
      if (obj.goodsNumber && typeof obj.goodsNumber === 'string') {
        const match = obj.goodsNumber.match(/^([A-Z0-9]{12,})$/);
        if (match) return match[1];
      }
      if (obj.goodsNo && typeof obj.goodsNo === 'string') {
        const match = obj.goodsNo.match(/^([A-Z0-9]{12,})$/);
        if (match) return match[1];
      }
      
      // 再帰的に探索
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const result = extractGoodsNoFromJson(obj[key], path ? `${path}.${key}` : key);
          if (result) return result;
        }
      }
    }
  }
  
  return null;
}

/**
 * JSONを再帰的に探索して、値に特定のキーワードが含まれるパスを収集
 */
function findIngredientPaths(obj: any, keywords: string[], path: string = '', foundPaths: string[] = []): string[] {
  if (obj === null || obj === undefined) {
    return foundPaths;
  }
  
  if (typeof obj === 'string') {
    const lowerValue = obj.toLowerCase();
    for (const keyword of keywords) {
      if (lowerValue.includes(keyword.toLowerCase())) {
        foundPaths.push(path);
        break;
      }
    }
  }
  
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        findIngredientPaths(obj[i], keywords, `${path}[${i}]`, foundPaths);
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const newPath = path ? `${path}.${key}` : key;
          findIngredientPaths(obj[key], keywords, newPath, foundPaths);
        }
      }
    }
  }
  
  return foundPaths;
}

/** レスポンス本文の最大保存サイズ（約800KB） */
const MAX_SAVE_BYTES = 800_000;

/**
 * URL の path を safeEndpoint に変換（/ と ? を _ に、ファイル名に使える文字のみ）
 */
function getSafeEndpointFromPath(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathPart = urlObj.pathname.replace(/^\//, '').replace(/\//g, '_');
    return pathPart.replace(/[^a-zA-Z0-9_-]/g, '_') || 'root';
  } catch {
    const match = url.match(/\/([^?]*)/);
    const pathPart = match ? match[1].replace(/\//g, '_') : 'unknown';
    return pathPart.replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
  }
}

/** ISO日時をファイル名用に安全化（: . を - に） */
function getSafeIsoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export interface SavedNetworkFile {
  url: string;
  contentType: string;
  bytes: number;
}

/** PoC 診断用カウント（0件切り分け・全ドメイン診断） */
export interface NetworkDiagnostic {
  allResponses: number;
  totalResponses: number; // oliveyoung.co.kr のみ
  totalJsonResponses: number;
  totalApiCandidates: number;
  hostCounts: Record<string, number>;
  contentTypeCounts: Record<string, number>;
  resourceTypeCounts: Record<string, number>;
  sampled: number; // script/document/xhr/fetch のサンプルログ用
}

export interface FetchHTMLWithPlaywrightOptions {
  /** goto 完了後・HTML取得前に実行する処理（例: クリックでAPI発火） */
  afterGoto?: (page: any) => Promise<void>;
}

const NET_DIAG_MAX = 30;

/**
 * ネットワーク診断ログ（script/xhr/fetch が発生しているか確定するため）
 * page.goto() より前に登録すること。
 */
function setupNetworkDiagnosticLogs(page: any): void {
  let reqCount = 0;
  let resCount = 0;

  page.on('request', (request: any) => {
    if (reqCount < NET_DIAG_MAX) {
      const type = request.resourceType != null && request.resourceType() != null ? request.resourceType() : 'other';
      logger.info(`[NET][REQ] type=${type} url=${request.url()}`);
      reqCount += 1;
    }
  });

  page.on('response', (response: any) => {
    if (resCount < NET_DIAG_MAX) {
      const status = response.status();
      const ct = (response.headers()['content-type'] || '').split(';')[0].trim();
      logger.info(`[NET][RES] ${status} ct=${ct} url=${response.url()}`);
      resCount += 1;
    }
  });

  page.on('requestfailed', (request: any) => {
    const failure = request.failure();
    const err = failure != null && failure.errorText != null ? failure.errorText : failure != null && failure.message != null ? failure.message : 'unknown';
    const type = request.resourceType != null && request.resourceType() != null ? request.resourceType() : 'other';
    logger.info(`[NET][FAIL] type=${type} url=${request.url()} err=${err}`);
  });
}

/** content-type を診断用の短いキーに正規化 */
function normalizeContentTypeKey(ct: string): string {
  if (!ct) return 'other';
  const lower = ct.toLowerCase();
  if (lower.includes('application/json')) return 'json';
  if (lower.includes('text/html')) return 'html';
  if (lower.includes('javascript')) return 'javascript';
  if (lower.includes('css')) return 'css';
  return 'other';
}

/**
 * network capture を登録（page.goto() より前に必ず呼ぶ）
 * 全ドメイン診断を先に行い、その後 oliveyoung.co.kr のみ保存（0件切り分け用）
 */
function setupNetworkCapture(
  page: any,
  savedNetworkFiles: SavedNetworkFile[],
  diagnostic: NetworkDiagnostic
): void {
  page.on('response', async (response: any) => {
    try {
      const responseUrl = response.url();

      // === 全レスポンス診断（host フィルタ前） ===
      diagnostic.allResponses += 1;
      const request = response.request();
      const rt = request.resourceType != null && request.resourceType() != null ? request.resourceType() : 'other';
      let host = '';
      try {
        host = new URL(responseUrl).hostname;
        diagnostic.hostCounts[host] = (diagnostic.hostCounts[host] != null ? diagnostic.hostCounts[host] : 0) + 1;
      } catch {
        host = 'parse-error';
        diagnostic.hostCounts[host] = (diagnostic.hostCounts[host] != null ? diagnostic.hostCounts[host] : 0) + 1;
      }
      diagnostic.resourceTypeCounts[rt] = (diagnostic.resourceTypeCounts[rt] != null ? diagnostic.resourceTypeCounts[rt] : 0) + 1;

      const headers = response.headers();
      const contentTypeRaw = headers['content-type'] || '';
      const ctKey = normalizeContentTypeKey(contentTypeRaw);
      diagnostic.contentTypeCounts[ctKey] = (diagnostic.contentTypeCounts[ctKey] != null ? diagnostic.contentTypeCounts[ctKey] : 0) + 1;

      if (diagnostic.sampled < NET_DIAG_MAX && ['script', 'document', 'xhr', 'fetch'].includes(rt)) {
        logger.info(`[NET][RES_SAMPLE] rt=${rt} status=${response.status()} ct=${ctKey} url=${responseUrl}`);
        diagnostic.sampled += 1;
      }

      // === oliveyoung のみカウント・保存 ===
      let parsed: URL;
      try {
        parsed = new URL(responseUrl);
      } catch {
        return;
      }
      const hostname = parsed.hostname.toLowerCase();
      const pathname = parsed.pathname;

      if (!hostname.endsWith('oliveyoung.co.kr')) return;

      diagnostic.totalResponses += 1;
      const contentType = contentTypeRaw;
      if (contentType.includes('application/json')) diagnostic.totalJsonResponses += 1;
      if (responseUrl.includes('api')) diagnostic.totalApiCandidates += 1;

      if (hostname.includes('braze.com')) return;

      // PoC 用: oliveyoung.co.kr の application/json のみ保存
      if (!contentType.includes('application/json')) return;

      const status = response.status();
      if (status !== 200) return;

      const method = response.request().method();

      const goodsMatchByNum = responseUrl.match(/goodsNumber=([A-Z0-9]+)/);
      const goodsMatch = goodsMatchByNum != null ? goodsMatchByNum : responseUrl.match(/goodsNo=([A-Z0-9]+)/);
      const goodsNo = goodsMatch != null && goodsMatch[1] != null ? goodsMatch[1] : 'unknown';

      const dir = path.join('out', 'debug_network', goodsNo);
      await fs.mkdir(dir, { recursive: true });

      const rawText = await response.text();
      const rawBytes = Buffer.byteLength(rawText, 'utf-8');
      let toWrite: string;
      if (rawBytes > MAX_SAVE_BYTES) {
        toWrite =
          Buffer.from(rawText, 'utf-8').slice(0, MAX_SAVE_BYTES).toString('utf-8') +
          `\n...[TRUNCATED] originalLength=${rawBytes}`;
      } else {
        toWrite = rawText;
      }

      const safeEndpoint = getSafeEndpointFromPath(responseUrl);
      const safeIso = getSafeIsoTimestamp();
      const baseName = `${safeIso}__${method}__${status}__${safeEndpoint}`;

      const isJson = contentType.includes('application/json');
      let ext: 'json' | 'txt';
      let content: string;

      if (isJson) {
        try {
          const obj = JSON.parse(rawText);
          let pretty = JSON.stringify(obj, null, 2);
          const prettyBytes = Buffer.byteLength(pretty, 'utf-8');
          if (prettyBytes > MAX_SAVE_BYTES) {
            pretty =
              Buffer.from(pretty, 'utf-8').slice(0, MAX_SAVE_BYTES).toString('utf-8') +
              `\n...[TRUNCATED] originalLength=${prettyBytes}`;
          }
          content = pretty;
          ext = 'json';
        } catch {
          content = toWrite;
          ext = 'txt';
        }
      } else if (contentType.includes('text/html')) {
        content = toWrite;
        ext = 'txt';
      } else {
        content = toWrite;
        ext = 'txt';
      }

      const finalBytes = Buffer.byteLength(content, 'utf-8');
      const filename = path.join(dir, `${baseName}.${ext}`);
      await fs.writeFile(filename, content, 'utf-8');

      savedNetworkFiles.push({
        url: responseUrl,
        contentType: contentType.split(';')[0].trim(),
        bytes: finalBytes,
      });
    } catch (e) {
      console.warn('debug_network save failed:', e);
    }
  });
}

/**
 * PlaywrightでHTMLを取得（403エラー時のフェイルオーバー）
 * network capture は goto 前に登録する。保存したネットワークファイル一覧を savedNetworkFiles で返す。
 */
export async function fetchHTMLWithPlaywright(
  url: string,
  options?: FetchHTMLWithPlaywrightOptions
): Promise<{
  html: string;
  finalUrl: string;
  savedNetworkFiles: SavedNetworkFile[];
  diagnostic: NetworkDiagnostic;
}> {
  const { context } = await getBrowserContext();
  const page = await context.newPage();
  const savedNetworkFiles: SavedNetworkFile[] = [];
  const diagnostic: NetworkDiagnostic = {
    allResponses: 0,
    totalResponses: 0,
    totalJsonResponses: 0,
    totalApiCandidates: 0,
    hostCounts: {},
    contentTypeCounts: {},
    resourceTypeCounts: {},
    sampled: 0,
  };

  // goto より前に必ず登録
  setupNetworkDiagnosticLogs(page);
  setupNetworkCapture(page, savedNetworkFiles, diagnostic);

  try {
    logger.info(`Fetching with Playwright: ${url}`);
    const resp = await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    const status = resp != null && resp.status() != null ? resp.status() : 0;
    if (status >= 400) {
      const failureLog: FailureLog = {
        failure_type: 'playwright_http_error',
        stage: 'fetch',
        url,
        input_snapshot: { url, method: 'playwright' },
        output_snapshot: { status, error: `HTTP status ${status}` },
        created_at: new Date().toISOString(),
      };
      await appendFailureLog(failureLog);
      await page.close();
      throw new Error(`HTTP status ${status}`);
    }
    await page.waitForTimeout(3000);

    if (options?.afterGoto) {
      await options.afterGoto(page);
    }

    const finalUrl = page.url();
    const html = await page.content();

    const scriptMatch = html.match(/<script/gi);
    logger.info('script_tag_count=' + (scriptMatch != null && scriptMatch.length != null ? scriptMatch.length : 0));
    logger.info(
      `[NET][DIAG] allResponses=${diagnostic.allResponses} oliveyoungResponses=${diagnostic.totalResponses} totalJsonResponses=${diagnostic.totalJsonResponses} totalApiCandidates=${diagnostic.totalApiCandidates} saved=${savedNetworkFiles.length}`
    );

    // "Just a moment"が含まれる場合は失敗として扱う
    if (html.includes('Just a moment')) {
      const failureLog: FailureLog = {
        failure_type: 'playwright_challenge_failed',
        stage: 'fetch',
        url,
        input_snapshot: { url, method: 'playwright' },
        output_snapshot: { 
          error: 'Cloudflare challenge not passed',
          body_snippet: html.substring(0, 500),
        },
        created_at: new Date().toISOString(),
      };
      await appendFailureLog(failureLog);
      await page.close();
      throw new Error('Cloudflare challenge not passed (Just a moment detected)');
    }
    
    await page.close();
    return { html, finalUrl, savedNetworkFiles, diagnostic };
  } catch (error: any) {
    await page.close();
    throw error;
  }
}

