/**
 * OliveYoung PoC（診断用）
 * 本命は description API 直接取得: pnpm run oliveyoung:ingredients -- --goods=<goodsNo>
 * Playwright で商品ページを取得し、goods/api レスポンスは utils/browser の
 * page.on('response') により out/debug_network に保存される。
 */
import { Logger } from '../utils/logger';
import { fetchHTMLWithPlaywright, closeBrowser, findWorkingGoodsUrl } from '../utils/browser';
import { saveHTML, saveReport } from '../storage/jsonStore';
import { extractOliveyoungIngredients, saveIngredientsReport } from './oliveyoungIngredients';

const logger = new Logger('OLIVEYOUNG');

/** テスト用商品URL（goodsNo は適宜変更可能） */
const DEFAULT_POC_URL =
  process.env.OLIVEYOUNG_POC_URL ||
  'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail?goodsNo=100000000001';

/**
 * OliveYoung PoC を実行する。
 * - 1商品ページを Playwright で取得
 * - API レスポンスは browser 内で out/debug_network に保存される
 * - HTML は out/raw、結果サマリは out/reports に保存
 */
/** goodsNo から URL 候補を生成（この順で試す） */
function buildGoodsUrlCandidates(goodsNo: string): string[] {
  const base = 'https://www.oliveyoung.co.kr';
  return [
    `${base}/store/goods/getGoodsDetail?goodsNo=${goodsNo}`,
    `${base}/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`,
    `${base}/store/goods/view?goodsNo=${goodsNo}`,
    `${base}/store/goods/view.do?goodsNo=${goodsNo}`,
    `${base}/goods/view?goodsNo=${goodsNo}`,
    `${base}/goods/view.do?goodsNo=${goodsNo}`,
  ];
}

export async function runOliveYoungPoc(): Promise<void> {
  process.env.RECORD_HAR = process.env.RECORD_HAR != null && process.env.RECORD_HAR !== '' ? process.env.RECORD_HAR : '1';
  const inputUrl = DEFAULT_POC_URL;
  logger.info('OliveYoung PoC start', inputUrl);

  const goodsNoMatch = inputUrl.match(/goodsNo=([A-Z0-9]+)/i);
  const goodsNo = goodsNoMatch?.[1];
  const candidates = goodsNo
    ? buildGoodsUrlCandidates(goodsNo)
    : [inputUrl];

  const selectedUrl = await findWorkingGoodsUrl(candidates);
  if (!selectedUrl) {
    throw new Error('No working goods URL found for candidates: ' + candidates.join(', '));
  }
  logger.info('selectedUrl=' + selectedUrl);

  let savedNetworkFiles: { url: string; contentType: string; bytes: number }[] = [];
  try {
    const result = await fetchHTMLWithPlaywright(selectedUrl, {
      afterGoto: async (page) => {
        logger.info(`afterGoto url=${page.url()}`);

        const html = await page.content();
        logger.info('html_has_전성분=' + html.includes('전성분'));
        logger.info('html_has_성분=' + html.includes('성분'));
        logger.info('html_has_상품정보=' + html.includes('상품정보'));
        logger.info('html_has_제공고시=' + html.includes('제공고시'));

        const frameUrls = page.frames().map((f: any) => f.url());
        logger.info('frames=' + JSON.stringify(frameUrls));

        const u = page.url();
        if (!u.includes('getGoodsDetail') && !u.includes('goods/view')) return;

        for (const label of ['상품정보 제공고시', '전성분', '성분']) {
          let clicked = false;
          for (const frame of page.frames()) {
            if (clicked) break;
            for (const fn of [
              () => frame.getByRole('button', { name: label }).first().click({ timeout: 5000 }),
              () => frame.locator(`button:has-text("${label}")`).first().click({ timeout: 5000 }),
              () => frame.getByText(label, { exact: false }).first().click({ timeout: 5000 }),
            ]) {
              try {
                await fn();
                logger.info(`clicked: ${label}`);
                await page.waitForTimeout(label === '성분' ? 1200 : 1500);
                clicked = true;
                break;
              } catch {
                // 次のセレクタ／frame を試す
              }
            }
          }
          if (!clicked) {
            logger.info(`not found: ${label}`);
          }
        }

        await page.waitForTimeout(1200);
        await page.waitForTimeout(3000);
      },
    });
    const { html, finalUrl, savedNetworkFiles: savedFiles, diagnostic } = result;
    savedNetworkFiles = savedFiles;

    const goodsNoMatch = selectedUrl.match(/goodsNo=([A-Z0-9]+)/i) || finalUrl.match(/goodsNo=([A-Z0-9]+)/i);
    const goodsNo = goodsNoMatch && goodsNoMatch[1] != null ? goodsNoMatch[1] : 'unknown';

    await saveHTML(html, `oliveyoung_${goodsNo}.html`, 'out/raw');
    logger.info('Saved HTML to out/raw');

    // 1商品ごとのデバッグ: 保存したネットワークファイル一覧
    const savedNetworkFilesCount = savedNetworkFiles.length;
    logger.info(`savedNetworkFilesCount: ${savedNetworkFilesCount}`);
    const top10 = savedNetworkFiles.slice(0, 10);
    for (let i = 0; i < top10.length; i++) {
      const f = top10[i];
      logger.info(`  [${i + 1}] url=${f.url} content-type=${f.contentType} bytes=${f.bytes}`);
    }

    // PoC 実行後の診断サマリ（0件切り分け用）
    logger.info(`[DIAG] allResponses=${diagnostic.allResponses}`);
    logger.info(`[DIAG] oliveyoungResponses=${diagnostic.totalResponses}`);
    logger.info(`[DIAG] totalJsonResponses=${diagnostic.totalJsonResponses}`);
    logger.info(`[DIAG] totalApiCandidates=${diagnostic.totalApiCandidates}`);
    const hostTop10 = Object.entries(diagnostic.hostCounts || {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
    logger.info('[DIAG] hostCounts top10=' + JSON.stringify(hostTop10));
    logger.info('[DIAG] resourceTypeCounts=' + JSON.stringify(diagnostic.resourceTypeCounts || {}));

    await saveReport(
      {
        source: 'oliveyoung',
        url: selectedUrl,
        inputUrl,
        finalUrl,
        goodsNo,
        htmlLength: html.length,
        savedNetworkFilesCount,
        savedNetworkFilesTop10: top10.map((f) => ({ url: f.url, contentType: f.contentType, bytes: f.bytes })),
        diagnostic: {
          allResponses: diagnostic.allResponses,
          oliveyoungResponses: diagnostic.totalResponses,
          totalJsonResponses: diagnostic.totalJsonResponses,
          totalApiCandidates: diagnostic.totalApiCandidates,
          hostCounts: diagnostic.hostCounts,
          contentTypeCounts: diagnostic.contentTypeCounts,
          resourceTypeCounts: diagnostic.resourceTypeCounts,
        },
        savedAt: new Date().toISOString(),
      },
      'oliveyoung_poc_result.json',
      'out/reports'
    );
    logger.info('Saved PoC result to out/reports/oliveyoung_poc_result.json');

    // 成分抽出（失敗してもPoCは成功扱いで続行）
    try {
      const ingredientsResult = await extractOliveyoungIngredients(goodsNo);
      const { txtPath, jsonPath } = await saveIngredientsReport(goodsNo, ingredientsResult);
      if (ingredientsResult.ok) {
        logger.info(
          `[ingredients] 抽出OK source=${ingredientsResult.source} pickedFile=${ingredientsResult.pickedFile != null ? ingredientsResult.pickedFile : '-'} txt=${txtPath} meta=${jsonPath}`
        );
      } else {
        logger.info(
          `[ingredients] 抽出NG source=${ingredientsResult.source} txt=${txtPath} meta=${jsonPath}`
        );
      }
    } catch (e: any) {
      logger.warn('[ingredients] 抽出でエラー（PoCは継続）: ' + (e && (e as Error).message != null ? (e as Error).message : e));
    }
  } finally {
    await closeBrowser();
  }

  logger.info(`savedNetworkFilesCount: ${savedNetworkFiles.length}`);
  logger.info('OliveYoung PoC done. Check out/debug_network/<goodsNo>/ for API response dumps.');
}
