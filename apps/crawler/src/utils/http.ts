/**
 * HTTP取得ユーティリティ（静的HTML取得）
 * undici使用
 */
import { request } from 'undici';

export interface FetchOptions {
  retries?: number;
  retryDelay?: number;
  timeout?: number;
  headers?: Record<string, string>;
  referer?: string;
}

export interface FetchErrorDetails {
  status?: number;
  response_headers?: Record<string, string>;
  body_snippet?: string;
  content_type?: string;
  is_cloudflare_challenge?: boolean;
  final_url?: string;
  error_message: string;
}

/**
 * Cookieファイルを読み込む
 */
async function loadCookie(cookiePath?: string): Promise<string | null> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  const defaultPath = path.join(process.cwd(), 'data', 'cookies', 'oliveyoung.cookie.txt');
  const filePath = cookiePath || process.env.OLIVEYOUNG_COOKIE_PATH || defaultPath;
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    // コメント行（#で始まる行）と空行を除外
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    const cookie = lines.join('; ').trim();
    return cookie || null;
  } catch {
    return null;
  }
}

/**
 * HTTP GET（リトライ付き）
 */
export async function fetchHTML(url: string, options: FetchOptions = {}): Promise<string> {
  const {
    retries = 2,
    retryDelay = 1000,
    timeout = 30000,
    headers = {},
    referer,
  } = options;

  // Cookie読み込み（空でない場合のみ設定）
  const cookie = await loadCookie();
  const cookieHeader = cookie && cookie.trim().length > 0 ? { Cookie: cookie.trim() } : {};

  // Refererヘッダーを安全に設定（URLが無効な場合はスキップ）
  let refererHeader: Record<string, string> = {};
  let secFetchSite = 'none';
  if (referer && referer.length > 0) {
    try {
      // URLとして有効か検証
      new URL(referer);
      refererHeader = { Referer: referer };
      secFetchSite = 'same-origin';
    } catch {
      // 無効なURLの場合はRefererを設定しない
      refererHeader = {};
    }
  }

  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ko-KR,ko;q=0.9,ja-JP,ja;q=0.8,en-US;q=0.7,en;q=0.6',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': secFetchSite,
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
    ...cookieHeader,
    ...headers,
    ...refererHeader,
  };

  let lastError: Error | null = null;
  let lastErrorDetails: FetchErrorDetails | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await request(url, {
        method: 'GET',
        headers: defaultHeaders,
        signal: controller.signal as any,
      });

      clearTimeout(timeoutId);

      const { statusCode, headers: responseHeaders } = response;
      const finalUrl = responseHeaders.location ? new URL(responseHeaders.location as string, url).href : url;

      // 429 (Too Many Requests) や 5xx はリトライ
      if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }
      }

      if (statusCode >= 200 && statusCode < 300) {
        const text = await response.body.text();
        return text;
      } else {
        // status>=400のときは必ずcontent-typeとbodyを取得
        const contentType = responseHeaders['content-type'] 
          ? (Array.isArray(responseHeaders['content-type']) 
              ? responseHeaders['content-type'][0] 
              : String(responseHeaders['content-type']))
          : 'unknown';
        
        // レスポンスボディをUTF-8文字列として取得
        let bodyText = '';
        try {
          bodyText = await response.body.text();
        } catch (e) {
          // テキスト取得に失敗した場合は空文字列
          bodyText = '';
        }
        
        // body_snippetは先頭500文字（UTF-8文字列として確実に）
        const bodySnippet = bodyText.substring(0, 500);
        
        // Cloudflareチャレンジ判定
        const isCloudflareChallenge = statusCode === 403 && (
          bodySnippet.includes('Just a moment') ||
          bodySnippet.includes('cf-') ||
          bodySnippet.includes('enable cookies')
        );
        
        // 403の場合は全文をデバッグ用に保存
        if (statusCode === 403 && bodyText) {
          try {
            const fs = await import('fs/promises');
            const path = await import('path');
            const reportDir = path.join(process.cwd(), 'out', 'reports');
            await fs.mkdir(reportDir, { recursive: true });
            const filepath = path.join(reportDir, 'last_403_body.html');
            // 大きすぎる場合は先頭50000文字に制限
            const contentToSave = bodyText.length > 50000 ? bodyText.substring(0, 50000) + '\n\n... (truncated)' : bodyText;
            await fs.writeFile(filepath, contentToSave, 'utf-8');
          } catch (e) {
            // 保存失敗は無視
          }
        }
        
        const errorDetails: FetchErrorDetails = {
          status: statusCode,
          response_headers: Object.fromEntries(
            Object.entries(responseHeaders).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])
          ),
          body_snippet: bodySnippet,
          content_type: contentType,
          is_cloudflare_challenge: isCloudflareChallenge || undefined,
          final_url: finalUrl,
          error_message: `HTTP ${statusCode}: ${url}`,
        };
        
        lastErrorDetails = errorDetails;
        throw new Error(`HTTP ${statusCode}: ${url}`);
      }
    } catch (error: any) {
      lastError = error;
      if (error.name === 'AbortError') {
        lastErrorDetails = {
          error_message: `Timeout: ${url}`,
        };
        throw new Error(`Timeout: ${url}`);
      }
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
        continue;
      }
    }
  }

  // エラー詳細を付与したエラーを投げる
  const finalError = lastError || new Error(`Failed to fetch: ${url}`);
  (finalError as any).details = lastErrorDetails;
  throw finalError;
}

/**
 * HTTPエラーから詳細情報を抽出
 */
export function extractErrorDetails(error: any): FetchErrorDetails | null {
  if (error?.details) {
    return error.details;
  }
  return {
    error_message: error.message || String(error),
  };
}

