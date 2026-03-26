/**
 * OliveYoung 成分（전성분）抽出
 * 商品ページを開き、発生した *.oliveyoung.co.kr の JSON レスポンスを全て収集し、
 * その文字列から成分らしいテキストを探索して抽出する。
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { saveHTML, saveReport } from '../storage/jsonStore';
import { getBrowserContext } from '../utils/browser';
import { Logger } from '../utils/logger';
import { normalizeIngredientsText, extractIngredientsBlocks } from '../utils/extractIngredients';
import { pickProductOnlyImage } from '../utils/imagePersonFilter';
import { uploadJsonString } from '../storage/gcsUpload';
import { updateIngredientsIndex } from '../storage/ingredientsIndex';

const logger = new Logger('OLIVEYOUNG_INGREDIENTS');

function shouldUpload(): boolean {
  return process.env.GCS_UPLOAD === '1' && !!process.env.GCS_BUCKET;
}

function gcsDestination(goodsNo: string): string {
  const prefix = (process.env.GCS_PREFIX || 'oliveyoung/ingredients').replace(/\/+$/, '');
  return `${prefix}/${goodsNo}.json`;
}

function getPrefix(): string {
  return (process.env.GCS_PREFIX || 'oliveyoung/ingredients').replace(/\/+$/, '');
}

async function uploadPayloadToGcsIfEnabled(
  goodsNo: string,
  payload: {
    collectedAt?: string;
    ok?: boolean;
    ingredients?: string;
    ingredientsText?: string;
  }
): Promise<void> {
  if (!shouldUpload()) {
    logger.info('[GCS] skipped (set GCS_UPLOAD=1 and GCS_BUCKET=...)');
    return;
  }
  const bucket = process.env.GCS_BUCKET!;
  const prefix = getPrefix();
  const destination = gcsDestination(goodsNo);
  const jsonString = JSON.stringify(payload, null, 2);
  try {
    const { gsUri, publicUrl } = await uploadJsonString({
      bucket,
      destination,
      jsonString,
      cacheControl: 'public, max-age=300',
    });
    logger.info(`[GCS] uploaded ${gsUri}`);
    logger.info(`[GCS] publicUrl ${publicUrl}`);

    const collectedAt = payload.collectedAt != null ? payload.collectedAt : new Date().toISOString();
    const hasIngredients = payload.ok === true || !!(payload.ingredients != null ? payload.ingredients : payload.ingredientsText);
    await updateIngredientsIndex({
      bucket,
      prefix,
      item: {
        goodsNo,
        publicPath: `/oliveyoung/${goodsNo}`,
        collectedAt,
        hasIngredients,
      },
    });
    logger.info(`[GCS] index updated for ${goodsNo}`);
  } catch (e: any) {
    logger.error('[GCS] upload failed', e && (e as Error).message != null ? (e as Error).message : e);
  }
}

export interface CollectedJson {
  url: string;
  text: string;
}

function goodsDetailUrl(goodsNo: string): string {
  return `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`;
}

function isOliveyoungHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'www.oliveyoung.co.kr' || host.endsWith('.oliveyoung.co.kr');
  } catch {
    return false;
  }
}

function safeFilenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const pathPart = u.pathname.replace(/^\//, '').replace(/\//g, '_');
    const safe = pathPart.replace(/[^a-zA-Z0-9_-]/g, '_') || 'root';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    return `${ts}__${safe}.json`;
  } catch {
    return `response_${Date.now()}.json`;
  }
}

/**
 * 商品ページを開き、page.on('response') で oliveyoung.co.kr の JSON をメモリに収集。
 * 同時に out/debug_network/<goodsNo>/ にも保存する。
 * opts.rank はログ用（DEBUG_DETAIL_HIT / DEBUG_DETAIL_FULL）。
 */
export async function collectOliveyoungJsonViaPlaywright(
  goodsNo: string,
  opts?: { rank?: number }
): Promise<CollectedJson[]> {
  const collectedJsonTexts: CollectedJson[] = [];
  const debugDir = path.join(process.cwd(), 'out', 'debug_network', goodsNo);
  await fs.mkdir(debugDir, { recursive: true });

  const { context } = await getBrowserContext();
  const page = await context.newPage();

  page.on('response', async (res: any) => {
    try {
      const url = res.url();
      if (!isOliveyoungHost(url)) return;
      const ct = (res.headers()['content-type'] || '').toLowerCase();
      if (!ct.includes('application/json')) return;
      if (res.status() !== 200) return;

      const text = await res.text();
      collectedJsonTexts.push({ url, text });
      const fname = safeFilenameFromUrl(url);
      await fs.writeFile(path.join(debugDir, fname), text, 'utf-8').catch(() => {});
    } catch {
      // 取りこぼし無視
    }
  });

  const execId =
    process.env.CLOUD_RUN_EXECUTION || process.env.CLOUD_RUN_JOB || 'local';

  try {
    const detail = goodsDetailUrl(goodsNo);
    logger.info('goto', detail);

    await page.goto(detail, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 1) URLへ移動後：ネットワークが落ち着くまで待つ
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => null);

    const rankLabel = opts?.rank != null ? opts.rank : '-';
    console.log(`[DEBUG_DETAIL_HIT] goodsNo=${goodsNo} rank=${rankLabel} url=${page.url()}`);

    const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

    // 2) name は title から確定で取る（DOM依存しない）
    const title = clean(await page.title().catch(() => ''));
    let name = title.split('|')[0]?.trim() ?? '';
    name = name.replace(/^\[[^\]]+\]\s*/g, '').slice(0, 200);

    // 3) 商品詳細っぽい本文が出るまで待つ（候補セレクタを複数トライ）
    const detailSelectors = [
      '#Contents',
      '.prd_detail_box',
      '.prd_detail',
      '.goods_detail',
      '[data-goodsno]',
    ];
    let detailFound = false;
    for (const sel of detailSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 4000 });
        detailFound = true;
        console.log(`[DEBUG_DETAIL_READY] goodsNo=${goodsNo} hit=${sel}`);
        break;
      } catch {
        // 次のセレクタを試す
      }
    }
    if (!detailFound) {
      console.log(`[DEBUG_DETAIL_READY] goodsNo=${goodsNo} hit=none titleOnly=1`);
    }

    // 4) brand候補：本文領域内の短いテキストを拾う（a/span/div）
    const NOISE_BRAND_RE = /로그인|장바구니|주문배송|고객센터|Global|공유하기|쿠폰|배송지|스킨케어|클렌징|선케어/;
    const candidates = (await page.locator('a, span, div').allTextContents().catch(() => []))
      .map(clean)
      .filter((t: string) => t.length >= 2 && t.length <= 30)
      .filter((t: string) => !NOISE_BRAND_RE.test(t))
      .slice(0, 80);

    console.log(
      '[DEBUG_NAME_BRAND_CAND_V3]',
      `exec=${execId}`,
      JSON.stringify({ goodsNo, rank: rankLabel, name, top: candidates.slice(0, 20) })
    );

    console.log(
      '[DEBUG_AFTER_CAND_V3]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankLabel}`,
      `name=${JSON.stringify(name || '')}`,
      `title=${JSON.stringify(title || '')}`,
      `brand=${JSON.stringify('')}`
    );

    await page.waitForTimeout(1500);

    // 상품정보 제공고시 click → 800ms
    try {
      await page.getByText('상품정보 제공고시', { exact: false }).first().click({ timeout: 2500 });
      await page.waitForTimeout(800);
    } catch {}

    // 성분 click → 1500〜2500ms
    try {
      await page.getByText('성분', { exact: false }).first().click({ timeout: 2500 });
      const waitMs = 1500 + Math.floor(Math.random() * 1001);
      await page.waitForTimeout(waitMs);
    } catch {}

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const detectedTitle = (title && title.trim()) ? title.trim() : '';
    const detectedName = (name && name.trim()) ? name.trim() : detectedTitle || '';
    const detectedBrand = '';
    const detectedNameCandidate = detectedName || detectedTitle || '';

    console.log(
      '[DEBUG_BEFORE_RETURN_V3]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankLabel}`,
      `name=${JSON.stringify(detectedName || '')}`,
      `title=${JSON.stringify(detectedTitle || '')}`,
      `nameCandidate=${JSON.stringify(detectedNameCandidate || '')}`,
      `brand=${JSON.stringify(detectedBrand || '')}`
    );

    return collectedJsonTexts;
  } catch (err) {
    const execId =
      process.env.CLOUD_RUN_EXECUTION || process.env.CLOUD_RUN_JOB || 'local';
    const rankForLog = opts?.rank != null ? opts.rank : '-';
    console.log(
      '[DEBUG_DETAIL_CATCH_V3]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankForLog}`,
      `message=${err instanceof Error ? err.message : String(err)}`
    );
    throw err;
  } finally {
    await page.close().catch(() => {});
  }
}

/** 詳細ページで meta 優先の raw 取得（og:title, title, brand: meta / JSON-LD / DOM）。evaluate は文字列で実行し __name 未定義を防ぐ。 */
function collectDetailMeta(page: { evaluate: (expr: string) => Promise<unknown> }) {
  const script = `
(function() {
  var getContent = function(el) { return el ? (el.getAttribute('content') || '').trim() : ''; };
  var ogTitle = getContent(document.querySelector('meta[property="og:title"]'));
  var titleTag = document.title ? document.title.trim() : '';
  var brandMeta = getContent(document.querySelector('meta[property="product:brand"]'));
  if (!brandMeta) brandMeta = getContent(document.querySelector('meta[name="brand"]'));
  if (!brandMeta) brandMeta = getContent(document.querySelector('meta[itemprop="brand"]'));
  var brandJsonLd = '';
  try {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      var s = scripts[i];
      if (!s.textContent) continue;
      var data = JSON.parse(s.textContent);
      var fromBrand = function(b) { return (b && typeof b.name === 'string') ? b.name.trim() : ''; };
      if (data.brand) brandJsonLd = fromBrand(data.brand);
      if (brandJsonLd) break;
      var graph = data['@graph'];
      if (Array.isArray(graph)) {
        for (var j = 0; j < graph.length; j++) {
          var g = graph[j];
          if (g && g.brand) brandJsonLd = fromBrand(g.brand);
          if (!brandJsonLd && g && g.mainEntity && g.mainEntity.brand) brandJsonLd = fromBrand(g.mainEntity.brand);
          if (brandJsonLd) break;
        }
      }
      if (brandJsonLd) break;
    }
  } catch (e) {}
  var brandA = document.querySelector("a[href*='brand'], a[href*='Brand']");
  var brandB = document.querySelector(".brand, .prd_brand, [class*='brand'], [id*='brand']");
  var brandDom = (brandA && brandA.textContent ? brandA.textContent.trim() : '') || (brandB && brandB.textContent ? brandB.textContent.trim() : '');
  return { ogTitle: ogTitle, titleTag: titleTag, brandMeta: brandMeta, brandJsonLd: brandJsonLd, brandDom: brandDom };
})()
`;
  return page.evaluate(script) as Promise<{ ogTitle: string; titleTag: string; brandMeta: string; brandJsonLd: string; brandDom: string }>;
}

/** 詳細ページから画像候補を取得（og:image + 商品系 img）。人物画像は pickProductOnlyImage で除外。 */
async function extractDetailImages(page: {
  evaluate: (expr: string) => Promise<unknown>;
}): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  const script = `
(function() {
  var candidates = [];
  var ogEl = document.querySelector('meta[property="og:image"]');
  var ogImage = (ogEl && ogEl.getAttribute('content')) ? ogEl.getAttribute('content').trim() : '';
  if (ogImage) candidates.push({ url: ogImage, alt: '' });
  var imgs = document.querySelectorAll('.prd_img img, .product_img img, [class*="prd"] img, [class*="product"] img, #Contents img, img[src]');
  for (var i = 0; i < imgs.length; i++) {
    var src = imgs[i].src;
    var alt = (imgs[i].getAttribute && imgs[i].getAttribute('alt')) || '';
    if (src && src.trim()) candidates.push({ url: src.trim(), alt: alt || '' });
  }
  return candidates;
})()
`;
  const candidates = (await page.evaluate(script)) as { url: string; alt?: string }[];
  const picked = pickProductOnlyImage(Array.isArray(candidates) ? candidates : []);
  const main = picked || "";
  return { imageUrl: main, thumbnailUrl: main };
}

/** 詳細ページDOMから name/brand を取得（title, h1/h2, brand系セレクタ）。evaluate は文字列で実行し __name 未定義を防ぐ。 */
function extractDetailFromDom(page: { evaluate: (expr: string) => Promise<unknown> }) {
  const script = `
(function() {
  var clean = function(s) { return (s || '').replace(/\\s+/g, ' ').trim(); };
  var title = clean(document.title);
  var h1 = document.querySelector('h1');
  var h2 = document.querySelector('h2');
  var nameVal = clean((h1 && h1.textContent) ? h1.textContent : '') || clean((h2 && h2.textContent) ? h2.textContent : '');
  var brandA = document.querySelector("a[href*='brand'], a[href*='Brand']");
  var brandB = document.querySelector("[class*='brand'], [id*='brand']");
  var brand = clean((brandA && brandA.textContent) ? brandA.textContent : '') || clean((brandB && brandB.textContent) ? brandB.textContent : '');
  return { title: title, name: nameVal, brand: brand };
})()
`;
  return page.evaluate(script) as Promise<{ title: string; name: string; brand: string }>;
}

/** __NEXT_DATA__ から name/brand を取得（Next/SSR 用フォールバック）。evaluate は文字列で実行し __name 未定義を防ぐ。 */
function extractFromNextData(page: { evaluate: (expr: string) => Promise<unknown> }) {
  const script = `
(function() {
  var el = document.querySelector('#__NEXT_DATA__');
  if (!el || !el.textContent) return null;
  try {
    var data = JSON.parse(el.textContent);
    var nameVal = (data && data.props && data.props.pageProps && data.props.pageProps.product && data.props.pageProps.product.goodsNm) || (data && data.props && data.props.pageProps && data.props.pageProps.goodsNm) || (data && data.product && data.product.goodsNm);
    var brandVal = (data && data.props && data.props.pageProps && data.props.pageProps.product && data.props.pageProps.product.brandNm) || (data && data.props && data.props.pageProps && data.props.pageProps.brandNm) || (data && data.product && data.product.brandNm);
    if (nameVal || brandVal) return { name: nameVal != null ? String(nameVal).trim() : '', brand: brandVal != null ? String(brandVal).trim() : '' };
    return null;
  } catch (e) {
    return null;
  }
})()
`;
  return page.evaluate(script) as Promise<{ name: string; brand: string } | null>;
}

/**
 * title/name からブランドを推定する（フォールバック用）。[...] を全て除去して先頭トークンを返す。
 */
export function inferBrandFromTitleOrName(raw: string): string {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/\[[^\]]+\]/g, '').trim();
  const first = s.split(/\s+/)[0]?.trim() ?? '';
  return first;
}

/** 韓国コスメで「ブランド」とみなさない一般語（기획/세트/본품 等） */
const BRAND_STOP = new Set([
  '기획',
  '세트',
  '본품',
  '리필',
  '더블',
  '단품',
  '증정',
  '특가',
  '한정',
  '대용량',
  '1+1',
  '2+1',
  '쿠션',
  '크림',
  '앰플',
  '토너',
  '패드',
  '마스크',
  '클렌징',
  '립',
  '아이',
  '선크림',
]);

/**
 * 商品名の先頭トークンからブランドを抽出（韓国コスメ向け）。
 * @deprecated 下の pickBrandFromName に置き換え。削除予定。
 */
function _deprecatedPickBrandFromName(input: string): string {
  let s = (input || '').trim();
  // 先頭の [ ... ] タグを繰り返し除去
  while (s.startsWith('[')) {
    const end = s.indexOf(']');
    if (end === -1) break;
    s = s.slice(end + 1).trim();
  }
  const normalizedInput = s;
  if (!normalizedInput) return 'Unknown';

  // 1. 사이트 suffix 제거
  let s2 = normalizedInput.split('|')[0].trim();

  // 2. 맨 앞の [ ... ] 태그 반복 제거（| 以降に残った分）
  while (s2.startsWith('[')) {
    const end = s2.indexOf(']');
    if (end === -1) break;
    s2 = s2.slice(end + 1).trim();
  }
  s = s2;

  // 3. 공백 정리
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return 'Unknown';

  // 4. 첫 토큰 추출
  const first = s.split(' ')[0].trim();
  if (!first) return 'Unknown';

  // 5. 일반 단어 blacklist
  const blacklist = new Set([
    '기획', '단품', '본품', '리필', '증정', '한정', '특가',
    '대용량', '더블', '트리플', '세트', '에디션',
    '쿠션', '크림', '앰플', '에센스', '토너', '패드', '마스크',
    '폼', '젤', '오일', '밤', '로션', '스틱', '워터', '밀크',
    '올리브영', '오늘드림', '공식', '정품',
  ]);

  if (blacklist.has(first)) return 'Unknown';

  return first;
}

/** ブランド候補の正規化（先頭タグ除去・ゆれ吸収・コラボ区切り・blacklist）。空なら "" を返す。 */
export function normalizeBrandCandidate(raw: string): string {
  let s = (raw || '').trim();
  if (!s) return '';

  // 1. 先頭の [ ... ] タグを除去
  while (s.startsWith('[')) {
    const end = s.indexOf(']');
    if (end === -1) break;
    s = s.slice(end + 1).trim();
  }

  // 2. 全角/特殊記号のゆれ吸収
  s = s
    .replace(/[×✕✖]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. コラボ区切りの前を優先（例: 빌리프x바나나킥 -> 빌리프）
  s = s.split(/\s*x\s*/i)[0].trim();

  // 4. "콜라보", "콜라보레이션" 以降は切る
  s = s.split(/콜라보레이션|콜라보/i)[0].trim();

  // 5. 商品属性ワードが先頭に来るパターンを防ぐ
  const blacklistNorm = new Set([
    '대용량', '한정', '기획', '단독', '증정', '본품', '리필', '더블', '트리플',
    '세트', '에디션', '특가', '정품', '공식', '올리브영', '오늘드림',
    '쿠션', '크림', '앰플', '에센스', '세럼', '토너', '패드', '마스크', '클렌징',
    '폼', '젤', '오일', '밤', '로션', '스틱', '워터', '밀크',
  ]);

  if (blacklistNorm.has(s)) return '';

  return s;
}

/** K-beauty 既知ブランド辞書（前方一致・先頭トークン照合用） */
const KNOWN_BRANDS = [
  '메디힐', '닥터지', '빌리프', '라로슈포제', '토리든', '라네즈', '이니스프리', '에스트라',
  'VT', '브링그린', '바이오더마', '스킨푸드', '넘버즈인', '어노브', '에스네이처', '마녀공장',
  '달바', '센텔리안24', 'AHC', '구달', '한율', '비플레인', '메디큐브', '듀이트리', '셀퓨전씨',
  '아이소이', '아비브', '롬앤', '클리오', '웨이크메이크', '퓌', '정샘물', '헤라', '에뛰드',
  '코스알엑스', '비욘드', '일리윤', '유세린', '피지오겔', '세타필', '뉴트로지나',
];

/**
 * 商品名からブランドを抽出（プロ仕様: 正規化 → 既知ブランド優先 → 先頭トークン）。
 */
export function pickBrandFromName(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return 'Unknown';

  // 1. 前処理
  let s = normalizeBrandCandidate(raw);
  if (!s) return 'Unknown';

  // 2. 既知ブランド優先（前方一致）
  for (const brand of KNOWN_BRANDS) {
    if (s === brand) return brand;
    if (s.startsWith(brand + ' ')) return brand;
    if (s.startsWith(brand)) return brand;
  }

  // 3. 공백 첫 토큰
  const first = s.split(' ')[0].trim();
  if (!first) return 'Unknown';

  // 4. 先頭トークンでもう一度辞書確認
  for (const brand of KNOWN_BRANDS) {
    if (first === brand) return brand;
  }

  // 5. 英字・韓国語混在でも、先頭トークンを仮採用
  return first || 'Unknown';
}

/**
 * 商品名からブランドを推定する（先頭トークン。[ ] 内除去、blacklist なら "Unknown"）。
 */
export function extractBrandFromName(name: string): string {
  if (!name || !name.trim()) return 'Unknown';
  let clean = name.trim();
  clean = clean.replace(/\[[^\]]+\]/g, '').trim();
  const first = clean.split(/\s+/)[0] ?? '';
  if (!first) return 'Unknown';
  const blacklist = ['올리브영', '오늘드림', '기획', '단품'];
  if (blacklist.includes(first)) return 'Unknown';
  return first;
}

/** title 先頭トークンからブランド推定する際の無効語（サイト名等）→ "Unknown" にする */
const BRAND_HEURISTIC_INVALID = new Set([
  '올리브영',
  '오늘드림',
  'Global',
  '로그인',
  '장바구니',
  '주문배송',
  '고객센터',
  '공유하기',
  '쿠폰',
  '배송지',
  '스킨케어',
  '클렌징',
  '선케어',
]);

/**
 * title のみからブランド候補を抽出（fallback用）。先頭 [...] 除去 → | 올리브영 以降除去 → 先頭1語。
 * 無効語なら "Unknown"、それ以外はそのトークン（空の場合は ""）。
 */
export function extractBrandFromTitleOnly(title: string): string {
  const clean = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();
  let t = clean(title).replace(/\|\s*올리브영\s*$/i, '').replace(/\s*\|\s*$/, '').trim();
  t = t.replace(/^\[[^\]]+\]\s*/g, '').trim();
  const first = t.split(/\s+/)[0] ?? '';
  if (first.length < 2 || first.length > 30) return '';
  if (/^\d+$/.test(first)) return '';
  if (BRAND_HEURISTIC_INVALID.has(first)) return 'Unknown';
  return first;
}

/**
 * title / h1s / h2s / aTexts から brand を抽出（aTexts はブランド抽出に使わない・debug用のみ想定）
 * 出力: { brand, reason }（reason: from_title | empty）。先頭トークンが無効語なら brand="Unknown"。
 */
export function extractBrandFromDetail(detail: {
  title: string;
  h1s: string[];
  h2s: string[];
  aTexts: string[];
}): { brand: string; reason: string } {
  const fromTitle = extractBrandFromTitleOnly(detail.title);
  if (fromTitle !== '') return { brand: fromTitle, reason: 'from_title' };
  return { brand: '', reason: 'empty' };
}

/** ブランドとして取ってはいけないナビ/UI文言 */
const NG_BRAND = new Set([
  '검색',
  '올영매장',
  '올영매장 찾기',
  '카테고리',
  '로그인',
  '장바구니',
  '주문배송',
  '고객센터',
  'Global',
]);

/**
 * 商品詳細ページを開き、商品DOMロード後に name/brand を商品ヘッダー周辺から取得。
 * 失敗しても例外は投げず { name: undefined, brand: undefined } を返す。
 */
export async function fetchDetailNameBrand(
  goodsNo: string,
  options?: { rank?: number }
): Promise<{
  goodsNo: string;
  rank: number;
  name: string;
  title: string;
  nameCandidate: string;
  brand: string;
  pickedUrl: string;
  pickedBrandReason: string;
  brandSelectorHit: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
}> {
  const execId =
    process.env.CLOUD_RUN_EXECUTION || process.env.CLOUD_RUN_JOB || 'local';

  console.log(
    '[DEBUG_DETAIL_ENTER_V3]',
    `exec=${execId}`,
    `goodsNo=${goodsNo}`,
    `rank=${options?.rank != null ? options.rank : '-'}`
  );

  const rankVal = options?.rank ?? 0;
  let result: {
    goodsNo: string;
    rank: number;
    name: string;
    title: string;
    nameCandidate: string;
    brand: string;
    pickedUrl: string;
    pickedBrandReason: string;
    brandSelectorHit: boolean;
    imageUrl?: string;
    thumbnailUrl?: string;
  } = {
    goodsNo,
    rank: rankVal,
    name: '',
    title: '',
    nameCandidate: '',
    brand: '',
    pickedUrl: '',
    pickedBrandReason: '',
    brandSelectorHit: false,
  };

  const { context } = await getBrowserContext();
  const page = await context.newPage();
  let fallbackTitle = '';

  try {
    const url = goodsDetailUrl(goodsNo);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    console.log('[STEP_1_AFTER_GOTO]', `exec=${execId}`, `goodsNo=${goodsNo}`, `rank=${rankVal}`);

    const rankLabel = options?.rank != null ? options.rank : '-';
    console.log(`[DEBUG_DETAIL_HIT] goodsNo=${goodsNo} rank=${rankLabel} url=${page.url()}`);

    // 1) 商品DOMのロード完了を待つ（どれか1つでOK）。失敗しても throw せず title/html から抽出を継続する
    try {
      await Promise.race([
        page.waitForSelector('body', { timeout: 15000 }),
        page.waitForSelector('meta[property="og:title"]', { timeout: 15000 }),
        page.waitForSelector('title', { timeout: 15000 }),
        page.waitForSelector('a[href*="brandNo="]', { timeout: 15000 }),
        page.waitForSelector('p.prd_name', { timeout: 15000 }),
        page.waitForSelector('#Contents', { timeout: 15000 }),
      ]);
    } catch (e) {
      console.log(
        '[DEBUG_SELECTOR_TIMEOUT_V6]',
        `exec=${execId}`,
        `goodsNo=${goodsNo}`,
        `rank=${rankVal}`,
        `message=${e instanceof Error ? e.message : String(e)}`
      );
    }

    const html = await page.content().catch(() => '');
    const pageTitle = await page.title().catch(() => '');
    console.log(
      '[STEP_2_AFTER_HTML_V6]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankVal}`,
      `title=${JSON.stringify(pageTitle || '')}`,
      `htmlLen=${html.length}`
    );
    if (html.length === 0 || html.length < 100) {
      console.log('[DEBUG_SKIP_EMPTY_HTML]', `exec=${execId}`, `goodsNo=${goodsNo}`, `rank=${rankVal}`, `contentLen=${html.length}`);
    }

    // title ベースの単一 evaluate（selector が壊れても document.title / og:title から取得）
    const detailEvalScript = `
(function() {
  var metaTitle = (document.querySelector('meta[property="og:title"]') && document.querySelector('meta[property="og:title"]').getAttribute('content')) || '';
  var docTitle = document.title || '';
  var rawTitle = (metaTitle && metaTitle.trim()) ? metaTitle.trim() : docTitle.trim();
  var cleanedTitle = String(rawTitle).split('|')[0].trim();
  var brandLink = (document.querySelector('a[href*="brandNo="]') && document.querySelector('a[href*="brandNo="]').textContent) ? document.querySelector('a[href*="brandNo="]').textContent.trim() : '';
  return { title: cleanedTitle, name: cleanedTitle, nameCandidate: cleanedTitle, brand: brandLink || '' };
})()
`;
    let extracted: { title?: string; name?: string; nameCandidate?: string; brand?: string } = {};
    try {
      extracted = (await page.evaluate(detailEvalScript)) as typeof extracted;
    } catch (_) {
      // evaluate 失敗時は extracted を空のまま
    }
    console.log(
      '[DEBUG_EVAL_RESULT_V7]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankVal}`,
      `title=${JSON.stringify(extracted.title ?? '')}`,
      `name=${JSON.stringify(extracted.name ?? '')}`,
      `nameCandidate=${JSON.stringify(extracted.nameCandidate ?? '')}`,
      `brand=${JSON.stringify(extracted.brand ?? '')}`
    );

    const clean = (s?: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

    // 2) brand: 商品ヘッダー周辺の a[href*="brandNo="] から直取り → NG_BRAND なら "" 扱い
    const brandRaw = (await page.locator('a[href*="brandNo="]').first().innerText().catch(() => '')).trim();
    const cleanedBrandFromSelector = brandRaw && !NG_BRAND.has(brandRaw) ? brandRaw : '';
    const brandSelectorHit = !!cleanedBrandFromSelector;

    // 3) name: 商品ヘッダー周辺から直取り（p.prd_name → h1 → og:title → title）
    let pickedName =
      (await page.locator('p.prd_name').first().innerText().catch(() => '')).trim() ||
      (await page.locator('h1').first().innerText().catch(() => '')).trim() ||
      '';
    if (!pickedName) {
      const ogTitle = (await page.locator('meta[property="og:title"]').getAttribute('content').catch(() => null)) ?? '';
      const titleTag = await page.title().catch(() => '');
      pickedName = clean(ogTitle || titleTag || pageTitle).split('|')[0]?.trim() ?? '';
    }
    pickedName = clean(pickedName).replace(/^\[[^\]]+\]\s*/g, '').trim().slice(0, 200);
    const fullTitle =
      (await page.locator('meta[property="og:title"]').getAttribute('content').catch(() => null)) ??
      (await page.title().catch(() => '')) ??
      pageTitle ??
      '';
    // 名前抽出は最低でも title を使う（selector 失敗時も pageTitle / evaluate 結果から取得）
    const title =
      (fullTitle ? String(fullTitle).trim() : '') ||
      (pageTitle || '').split('|')[0]?.trim() ||
      (extracted.title ?? '').trim() ||
      '';
    if (!title || !title.trim()) {
      console.log('[DEBUG_SKIP_EMPTY_TITLE]', `exec=${execId}`, `goodsNo=${goodsNo}`, `rank=${rankVal}`);
    }
    console.log('[STEP_3_AFTER_TITLE]', `exec=${execId}`, `goodsNo=${goodsNo}`, `rank=${rankVal}`, `title=${JSON.stringify(title || '')}`);
    fallbackTitle = (title && title.trim()) ? title.trim() : '';

    // 4) brand が取れていなければ meta/JSON-LD/fallback
    let pickedBrand = cleanedBrandFromSelector;
    let brandReason: string;
    if (pickedBrand) {
      brandReason = 'candidates';
    } else {
      const meta = await collectDetailMeta(page);
      const rawTitleForFallback = (meta.ogTitle || meta.titleTag || '').trim();
      if (meta.brandJsonLd && meta.brandJsonLd.length >= 2) {
        pickedBrand = meta.brandJsonLd;
        brandReason = 'candidates';
      } else if (meta.brandMeta && meta.brandMeta.length >= 2) {
        pickedBrand = meta.brandMeta;
        brandReason = 'candidates';
      } else if (meta.brandDom && meta.brandDom.length >= 2 && !NG_BRAND.has(clean(meta.brandDom))) {
        pickedBrand = clean(meta.brandDom);
        brandReason = 'candidates';
      }
      if (!pickedBrand) {
        const fromNext = await extractFromNextData(page);
        const fromDom = await extractDetailFromDom(page);
        const nextBrand = fromNext?.brand?.trim() ?? '';
        const domBrand = fromDom?.brand?.trim() ?? '';
        if (nextBrand && !NG_BRAND.has(nextBrand)) pickedBrand = nextBrand;
        else if (domBrand && !NG_BRAND.has(domBrand)) pickedBrand = domBrand;
      }
      if (!pickedBrand && pickedName) {
        pickedBrand = extractBrandFromName(pickedName);
      }
      if (!pickedBrand) {
        pickedBrand = inferBrandFromTitleOrName(pickedName || rawTitleForFallback || '');
        brandReason = pickedBrand ? 'fallback:title_first_token' : 'empty';
      } else {
        brandReason = 'candidates';
      }
    }

    const pickedUrl = page.url() || url;

    let imageUrl = '';
    let thumbnailUrl = '';
    try {
      const images = await extractDetailImages(page);
      imageUrl = (images.imageUrl && images.imageUrl.trim()) ? images.imageUrl.trim() : '';
      thumbnailUrl = (images.thumbnailUrl && images.thumbnailUrl.trim()) ? images.thumbnailUrl.trim() : imageUrl;
    } catch (_) {
      // 画像取得失敗時は空のまま
    }

    console.log(
      `[DEBUG_DETAIL_PICKED] ${JSON.stringify({ goodsNo, pickedName: pickedName.slice(0, 80), pickedBrand: pickedBrand || '(skip)', brandSelectorHit }).slice(0, 400)}`
    );
    console.log('[DEBUG_BRAND_PICK]', { goodsNo, rank: rankLabel, name: pickedName, brand: pickedBrand || '(skip)' });

    const detectedTitle = (title && title.trim()) ? title.trim() : '';

    const name = (pickedName || fullTitle || '').trim();
    const detectedName = (name && name.trim()) ? name.trim() : detectedTitle || '';

    if (!detectedName || !detectedName.trim()) {
      console.log('[DEBUG_SKIP_EMPTY_NAME]', `exec=${execId}`, `goodsNo=${goodsNo}`, `rank=${rankVal}`);
    }
    console.log('[STEP_4_AFTER_NAME_CAND]', `exec=${execId}`, `goodsNo=${goodsNo}`, `rank=${rankVal}`, `name=${JSON.stringify(name || '')}`);

    const brand = pickedBrand !== '' ? pickedBrand : '';
    const detectedBrand = (brand && brand.trim()) ? brand.trim() : '';

    const detectedNameCandidate = detectedName || detectedTitle || '';

    console.log(
      '[STEP_5_BEFORE_ASSIGN_RESULT]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankVal}`,
      `brand=${JSON.stringify(brand || '')}`
    );
    console.log(
      '[DEBUG_BEFORE_ASSIGN_RESULT_V5]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankVal}`,
      `name=${JSON.stringify(detectedName || '')}`,
      `title=${JSON.stringify(detectedTitle || '')}`,
      `nameCandidate=${JSON.stringify(detectedNameCandidate || '')}`,
      `brand=${JSON.stringify(detectedBrand || '')}`
    );

    result = {
      goodsNo,
      rank: rankVal,
      name: detectedName,
      title: detectedTitle,
      nameCandidate: detectedNameCandidate,
      brand: detectedBrand,
      pickedUrl: pickedUrl || '',
      pickedBrandReason: brandReason || '',
      brandSelectorHit: !!brandSelectorHit,
      imageUrl: imageUrl || undefined,
      thumbnailUrl: thumbnailUrl || undefined,
    };

    console.log(
      '[DEBUG_BEFORE_RETURN_V4]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankVal}`,
      `name=${JSON.stringify(result.name)}`,
      `title=${JSON.stringify(result.title)}`,
      `nameCandidate=${JSON.stringify(result.nameCandidate)}`,
      `brand=${JSON.stringify(result.brand)}`
    );
  } catch (err) {
    console.log(
      '[DEBUG_DETAIL_CATCH_V5]',
      `exec=${execId}`,
      `goodsNo=${goodsNo}`,
      `rank=${rankVal}`,
      `message=${err instanceof Error ? err.message : String(err)}`
    );
    if (err != null && typeof (err as Error).message === 'string' && /timeout|Timeout|TimeoutError/i.test((err as Error).message)) {
      console.warn(`[DETAIL] skip by timeout`, { goodsNo, rank: options?.rank });
    }
    const fallback = (fallbackTitle && fallbackTitle.trim()) ? fallbackTitle.trim() : '';
    result = {
      goodsNo,
      rank: rankVal,
      name: fallback,
      title: fallback,
      nameCandidate: fallback,
      brand: '',
      pickedUrl: '',
      pickedBrandReason: '',
      brandSelectorHit: false,
      imageUrl: undefined,
      thumbnailUrl: undefined,
    };
  } finally {
    // cleanup only, NO return here
    await page.close().catch(() => {});
  }

  console.log(
    '[DEBUG_FINAL_RETURN_V4]',
    `exec=${execId}`,
    `goodsNo=${goodsNo}`,
    `rank=${rankVal}`,
    `name=${JSON.stringify(result.name)}`,
    `title=${JSON.stringify(result.title)}`,
    `nameCandidate=${JSON.stringify(result.nameCandidate)}`,
    `brand=${JSON.stringify(result.brand)}`
  );

  return result;
}

/**
 * 収集した JSON 文字列から成分らしいテキストを探索（優先: 화장품법에 따라 → 전성분/성분 → 정제수）
 */
export function findIngredientsText(collectedJsonTexts: CollectedJson[]): { raw: string; pickedUrl?: string } | null {
  if (collectedJsonTexts.length === 0) return null;

  // 1. 화장품법에 따라 が含まれるものを最優先
  for (const { url, text } of collectedJsonTexts) {
    if (text.includes('화장품법에 따라')) return { raw: text, pickedUrl: url };
  }

  // 2. 전성분 / 성분 を含むもの
  for (const { url, text } of collectedJsonTexts) {
    if (text.includes('전성분') || text.includes('성분')) return { raw: text, pickedUrl: url };
  }

  // 3. 정제수 など
  for (const { url, text } of collectedJsonTexts) {
    if (text.includes('정제수')) return { raw: text, pickedUrl: url };
  }

  return null;
}

/**
 * raw から成分部分を切り出し（화장품법에 따라 以降 / 전성분 以降 / それ以外は no_ingredient_markers_found）
 */
export function extractIngredientLines(raw: string): {
  ok: boolean;
  ingredientsText?: string;
  reason?: string;
} {
  let idx = raw.indexOf('화장품법에 따라');
  if (idx === -1) {
    idx = raw.indexOf('전성분');
  }
  if (idx === -1) {
    return { ok: false, reason: 'no_ingredient_markers_found' };
  }

  let chunk = raw.slice(idx);
  const STOP_MARKERS = [
    '기능성 화장품',
    '사용할 때의 주의사항',
    '품질보증기준',
    '소비자상담 전화번호',
  ];
  let minStop = chunk.length;
  for (const m of STOP_MARKERS) {
    const pos = chunk.indexOf(m);
    if (pos !== -1 && pos < minStop) minStop = pos;
  }
  chunk = chunk.slice(0, minStop);

  chunk = chunk.replace(/\s+/g, ' ').trim();
  chunk = chunk.replace(/\s*(\[[^\]]+\])\s*/g, '\n$1\n');
  chunk = chunk.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

  if (!chunk) return { ok: false, reason: 'empty_after_extract' };
  return { ok: true, ingredientsText: chunk };
}

export interface GetOliveyoungIngredientsOptions {
  /** テスト用: 収集結果を差し替え */
  collect?: (goodsNo: string, opts?: { rank?: number }) => Promise<CollectedJson[]>;
  /** ログ用（DEBUG_DETAIL_HIT / DEBUG_DETAIL_FULL の rank 表示） */
  rank?: number;
}

export interface FetchAndBuildPayloadOptions {
  /** 今回の順位 → lastRank / lastRankAt / lastRunId を更新 */
  lastRank?: number;
  lastRunId?: string;
  dryRun?: boolean;
}

/**
 * 成分取得のメイン: 収集 → findIngredientsText → 切り出し → 3ファイル保存
 */
export async function getOliveyoungIngredients(
  goodsNo: string,
  options?: GetOliveyoungIngredientsOptions
): Promise<{
  ok: boolean;
  path: string;
  ingredientsText?: string;
  pickedUrl?: string;
  reason?: string;
}> {
  const collectedAt = new Date().toISOString();
  const baseDir = path.join(process.cwd(), 'out', 'reports');
  await fs.mkdir(baseDir, { recursive: true });

  const summaryPath = path.join(baseDir, `oliveyoung_ingredients_${goodsNo}.json`);
  const rawPath = path.join(baseDir, `ingredients_raw_${goodsNo}.txt`);
  const finalPath = path.join(baseDir, `ingredients_${goodsNo}.txt`);

  const collectFn = options && options.collect != null ? options.collect : collectOliveyoungJsonViaPlaywright;

  try {
    const collected = await collectFn(goodsNo, { rank: options?.rank });
    const found = findIngredientsText(collected);

    let rawToSave = '';
    let pickedUrl = '';

    if (found) {
      rawToSave = found.raw;
      pickedUrl = found.pickedUrl || '';
    }

    await fs.writeFile(rawPath, rawToSave || '(no json collected)', 'utf-8');

    if (!found) {
      const payload = {
        goodsNo,
        source: 'collected_json',
        ok: false,
        reason: 'no_ingredient_candidate_in_collected_json',
        collectedCount: collected.length,
        collectedAt,
        fetchedAt: collectedAt,
      };
      const jsonString = JSON.stringify(payload, null, 2);
      await fs.writeFile(summaryPath, jsonString, 'utf-8');
      await fs.writeFile(finalPath, '(抽出なし)', 'utf-8');
      await uploadPayloadToGcsIfEnabled(goodsNo, payload);
      return { ok: false, path: summaryPath, reason: payload.reason };
    }

    const extracted = extractIngredientLines(found.raw);

    const ingredientsText = extracted.ingredientsText != null ? extracted.ingredientsText : '';
    const ingredientsForFile = extracted.ok ? ingredientsText : '(no_ingredient_markers_found)\n\n' + found.raw;
    const ingredients = normalizeIngredientsText(ingredientsForFile);
    const ingredientsBlocks = extractIngredientsBlocks(ingredientsForFile);

    const payload = {
      goodsNo,
      source: 'collected_json',
      ok: extracted.ok,
      pickedUrl: pickedUrl || undefined,
      ...(ingredientsText && { ingredientsText }),
      ingredients,
      ingredientsBlocks,
      ...(extracted.reason && { reason: extracted.reason }),
      collectedCount: collected.length,
      collectedAt,
      fetchedAt: collectedAt,
    };
    const jsonString = JSON.stringify(payload, null, 2);
    await fs.writeFile(summaryPath, jsonString, 'utf-8');
    await uploadPayloadToGcsIfEnabled(goodsNo, payload);

    await fs.writeFile(finalPath, ingredients, 'utf-8');

    return {
      ok: extracted.ok,
      path: summaryPath,
      ingredientsText: extracted.ingredientsText,
      pickedUrl: pickedUrl || undefined,
      reason: extracted.reason,
    };
  } catch (e: any) {
    const payload = {
      goodsNo,
      source: 'collected_json',
      ok: false,
      reason: e && (e as Error).message != null ? (e as Error).message : 'fetch_failed',
      collectedAt,
      fetchedAt: collectedAt,
    };
    const jsonString = JSON.stringify(payload, null, 2);
    await fs.writeFile(summaryPath, jsonString, 'utf-8');
    await fs.writeFile(rawPath, '').catch(() => {});
    await fs.writeFile(finalPath, '(抽出なし)').catch(() => {});
    await uploadPayloadToGcsIfEnabled(goodsNo, payload);
    return { ok: false, path: summaryPath, reason: e?.message };
  }
}

/**
 * ランキング用: 成分取得 → meta → Qoo10名寄せ → Firestore upsert（GCSは監査用に従来どおり）
 * opts.lastRank / opts.lastRunId があれば lastRank / lastRankAt / lastRunId を更新
 * opts.dryRun なら Firestore 書き込みをスキップ
 */
export async function fetchAndBuildIngredientsPayload(
  goodsNo: string,
  opts?: FetchAndBuildPayloadOptions
): Promise<{ ok: boolean; reason?: string; name?: string; brand?: string }> {
  const { getOliveyoungProductMeta } = await import('./oliveyoungMeta.js');
  const { findQoo10Url } = await import('../services/qoo10.js');
  const { saveProductNormalized } = await import('../services/productFirestore.js');

  try {
    const [ingredientsResult, meta] = await Promise.all([
      getOliveyoungIngredients(goodsNo, { rank: opts?.lastRank }),
      getOliveyoungProductMeta(goodsNo).catch(() => ({ brand: 'Unknown', name: goodsNo, priceKRW: undefined, ingredientsRaw: '' })),
    ]);

    const ingredientsRaw =
      ingredientsResult.ok && ingredientsResult.ingredientsText
        ? ingredientsResult.ingredientsText
        : meta.ingredientsRaw || '';

    let qoo10Url: string | undefined;
    try {
      qoo10Url = await findQoo10Url(meta.brand, meta.name, goodsNo);
    } catch {
      qoo10Url = undefined;
    }

    const product = {
      goodsNo,
      brand: meta.brand,
      name: meta.name,
      ingredientsRaw,
      tags: [],
      ...(ingredientsResult.pickedUrl && { pickedUrl: ingredientsResult.pickedUrl }),
      ...(qoo10Url && { qoo10Url }),
      ...(meta.priceKRW != null && { priceKRW: meta.priceKRW }),
    };

    if (!opts?.dryRun) {
      const now = new Date();
      await saveProductNormalized(product, {
        lastRank: opts?.lastRank,
        lastRankAt: now,
        lastRunId: opts?.lastRunId,
      });
    }

    return { ok: true, name: meta.name, brand: meta.brand };
  } catch (e: any) {
    return { ok: false, reason: e && (e as Error).message != null ? (e as Error).message : String(e) };
  }
}

// ========== 以下: PoC/診断用（debug_network / HTML フォールバック） ==========

const KEYWORDS = [
  '화장품법에 따라 기재해야 하는 모든 성분',
  '전성분',
  '성분',
];

const STOP_MARKERS = [
  '기능성 화장품',
  '사용할 때의 주의사항',
  '품질보증기준',
  '소비자상담 전화번호',
  '배송 안내',
  '교환/반품',
];

/**
 * 文字列から成分セクションを抽出し整形する
 */
function extractAndFormatIngredients(raw: string): string | null {
  // 優先キーワード（行に含まれるものを探す）
  const mainKeyword = '화장품법에 따라 기재해야 하는 모든 성분';
  let idx = raw.indexOf(mainKeyword);
  if (idx === -1) {
    idx = raw.indexOf('전성분');
  }
  if (idx === -1) {
    idx = raw.indexOf('성분');
  }
  if (idx === -1) return null;

  // idx から末尾までをスライスし、stop marker で打ち切り
  let chunk = raw.slice(idx);
  let minStop = chunk.length;
  for (const marker of STOP_MARKERS) {
    const pos = chunk.indexOf(marker);
    if (pos !== -1 && pos < minStop) minStop = pos;
  }
  chunk = chunk.slice(0, minStop);

  // 整形: エスケープ解除、改行・連続スペース正規化
  chunk = chunk
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  // [01NW ...] ブロック単位で改行を入れる（オプション）
  chunk = chunk.replace(/\s*(\[[^\]]+\])\s*/g, '\n$1\n');
  chunk = chunk.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

  // 先頭にメインキーワードを含む行がない場合は追加
  if (!chunk.includes(mainKeyword) && !chunk.startsWith('전성분') && !chunk.startsWith('성분')) {
    chunk = mainKeyword + '\n' + chunk;
  }

  return chunk || null;
}

/**
 * JSONファイルから成分を抽出
 */
async function extractFromJsonFile(filePath: string): Promise<string | null> {
  const content = await fs.readFile(filePath, 'utf-8');
  let obj: any;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }
  const str = JSON.stringify(obj);
  if (!KEYWORDS.some((k) => str.includes(k))) return null;
  return extractAndFormatIngredients(str);
}

/**
 * HTMLから成分を抽出（화장품법에 따라 기재해야 하는 모든 성분 の直後から stop marker まで）
 */
async function extractFromHtml(htmlPath: string): Promise<string | null> {
  const html = await fs.readFile(htmlPath, 'utf-8');
  const mainKeyword = '화장품법에 따라 기재해야 하는 모든 성분';
  const idx = html.indexOf(mainKeyword);
  if (idx === -1) return null;

  let chunk = html.slice(idx);
  let minStop = chunk.length;
  for (const marker of STOP_MARKERS) {
    const pos = chunk.indexOf(marker);
    if (pos !== -1 && pos < minStop) minStop = pos;
  }
  chunk = chunk.slice(0, minStop);

  // HTMLタグ除去（簡易）
  chunk = chunk.replace(/<[^>]+>/g, ' ');
  chunk = chunk.replace(/\s+/g, ' ').trim();
  chunk = chunk.replace(/\s*(\[[^\]]+\])\s*/g, '\n$1\n');
  chunk = chunk.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');

  if (!chunk) return null;
  if (!chunk.includes(mainKeyword)) {
    chunk = mainKeyword + '\n' + chunk;
  }
  return chunk;
}

export interface ExtractResult {
  ok: boolean;
  text: string;
  source: 'json' | 'html' | 'none';
  pickedFile?: string;
}

/**
 * OliveYoung 成分を抽出する
 * A: out/debug_network/<goodsNo>/*.json を優先
 * B: out/raw/oliveyoung_<goodsNo>.html をフォールバック
 */
export async function extractOliveyoungIngredients(goodsNo: string): Promise<ExtractResult> {
  const baseDir = process.cwd();
  const debugDir = path.join(baseDir, 'out', 'debug_network', goodsNo);
  const rawPath = path.join(baseDir, 'out', 'raw', `oliveyoung_${goodsNo}.html`);

  // A. JSON から抽出
  try {
    const entries = await fs.readdir(debugDir, { withFileTypes: true });
    const jsonFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => path.join(debugDir, e.name));

    // /goods/api/v1/description を含むファイルを優先（ファイル名に description が含まれる）
    const sorted = jsonFiles.sort((a, b) => {
      const aName = path.basename(a);
      const bName = path.basename(b);
      const aDesc = aName.includes('description') ? 1 : 0;
      const bDesc = bName.includes('description') ? 1 : 0;
      return bDesc - aDesc;
    });

    for (const fp of sorted) {
      const text = await extractFromJsonFile(fp);
      if (text) {
        return {
          ok: true,
          text,
          source: 'json',
          pickedFile: path.basename(fp),
        };
      }
    }
  } catch {
    // ディレクトリが存在しない等は無視
  }

  // B. HTML から抽出
  try {
    await fs.access(rawPath);
    const text = await extractFromHtml(rawPath);
    if (text) {
      return {
        ok: true,
        text,
        source: 'html',
        pickedFile: path.basename(rawPath),
      };
    }
  } catch {
    // ファイルがない等
  }

  return {
    ok: false,
    text: '',
    source: 'none',
  };
}

/**
 * 抽出結果を out/reports に保存（txt と meta json）
 */
export async function saveIngredientsReport(
  goodsNo: string,
  result: ExtractResult
): Promise<{ txtPath: string; jsonPath: string }> {
  const baseDir = 'out/reports';
  const txtFilename = `ingredients_${goodsNo}.txt`;
  const jsonFilename = `ingredients_${goodsNo}.json`;

  const txtPath = await saveHTML(result.text || '(抽出なし)', txtFilename, baseDir);

  const meta = {
    goodsNo,
    source: result.source,
    pickedFile: result.pickedFile,
    ok: result.ok,
    extractedAt: new Date().toISOString(),
  };
  const jsonPath = await saveReport(meta, jsonFilename, baseDir);

  return { txtPath, jsonPath };
}
