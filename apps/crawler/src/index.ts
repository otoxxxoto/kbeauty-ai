/**
 * Crawler メインエントリ
 */
import { Logger } from './utils/logger';

const logger = new Logger('MAIN');

/**
 * JOB_TYPE → pnpm script（spawn する補完ジョブ）
 * - fill-products-enrich / fill-brand-ja は main() 内で in-process 扱い（下の分岐）。ここには含めない。
 */
const FILL_JOB_SCRIPTS: Record<string, string> = {
  'fill-review-summary-ja': 'oliveyoung:fill-review-summary-ja',
  'fill-ingredient-summary-ja': 'oliveyoung:fill-ingredient-summary-ja',
  'fill-brand-summary-ja': 'oliveyoung:fill-brand-summary-ja',
  'fill-price-comparison-oliveyoung': 'oliveyoung:fill-price-comparison-oliveyoung',
  'fill-product-name-ja': 'oliveyoung:fill-product-name-ja',
  'fill-product-brand-ja': 'oliveyoung:fill-product-brand-ja',
};

/**
 * argv から goodsNo リストを正規化して取得
 * --goods=A,B,C / --goods "A B C" (pnpm が渡す形) / --goods A B C のいずれも対応
 * A + 12桁数字の形式だけ残す（安全）
 */
function parseGoodsNosFromArgv(argv: string[]): string[] {
  const raw: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a.startsWith('--goods=')) {
      raw.push(a.slice('--goods='.length));
      continue;
    }

    if (a === '--goods') {
      for (let j = i + 1; j < argv.length; j++) {
        const b = argv[j];
        if (b.startsWith('--')) break;
        raw.push(b);
      }
      break;
    }
  }

  const joined = raw.join(' ');
  return joined
    .split(/[,\s]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => /^A\d{12}$/.test(s));
}

function showUsage(): void {
  console.error(`
Usage:
  pnpm run oliveyoung:ingredients -- --goods=A000000184228,A000000xxxxx
  pnpm run oliveyoung:ingredients -- --goods "A000000184228 A000000xxxxx"
  pnpm run oliveyoung:ingredients -- --goods A000000184228 A000000xxxxx
  または
  OLIVEYOUNG_GOODS_LIST="A000000184228,A000000xxxxx" pnpm run oliveyoung:ingredients

goodsNo を1つ以上指定してください（形式: A + 12桁数字）。
`);
}

async function runForOneGoodsNo(
  goodsNo: string,
  getOliveyoungIngredients: (goodsNo: string) => Promise<{ ok: boolean; path: string; reason?: string }>
): Promise<void> {
  const result = await getOliveyoungIngredients(goodsNo);
  if (result.ok) {
    logger.info(`[ingredients] OK goodsNo=${goodsNo} path=${result.path}`);
  } else {
    logger.info(`[ingredients] NG goodsNo=${goodsNo} reason=${result.reason != null && result.reason !== '' ? result.reason : 'unknown'} path=${result.path}`);
  }
}

async function runOliveyoungIngredients(): Promise<void> {
  const argv = process.argv.slice(2);
  let goodsNos = parseGoodsNosFromArgv(argv);

  if (goodsNos.length === 0 && process.env.OLIVEYOUNG_GOODS_LIST?.trim()) {
    goodsNos = process.env.OLIVEYOUNG_GOODS_LIST
      .split(/[,\s]+/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => /^A\d{12}$/.test(s));
  }

  if (goodsNos.length === 0) {
    logger.error('No goodsNos parsed. argv=', argv);
    showUsage();
    process.exit(1);
  }

  const { getOliveyoungIngredients } = await import('./sources/oliveyoungIngredients');
  const { closeBrowser } = await import('./utils/browser');
  try {
    for (const goodsNo of goodsNos) {
      try {
        await runForOneGoodsNo(goodsNo, getOliveyoungIngredients);
      } catch (e: any) {
        logger.error(`[ingredients] ERROR goodsNo=${goodsNo}`, e && typeof (e as Error).message === 'string' ? (e as Error).message : e);
      }
    }
  } finally {
    await closeBrowser();
  }
}

/** JOB_TYPE に応じて補完ジョブのみ実行（ランキング本体は起動しない）。子プロセスで実行して完全分離。 */
async function runFillJobByType(jobType: string): Promise<never> {
  const script = FILL_JOB_SCRIPTS[jobType];
  if (!script) {
    logger.error('Unknown JOB_TYPE', jobType);
    process.exit(1);
  }
  const { spawnSync } = await import('child_process');
  const r = spawnSync('pnpm', ['run', script], {
    stdio: 'inherit',
    env: process.env,
    cwd: process.cwd(),
  });
  process.exit(r.status !== undefined && r.status !== null ? r.status : 1);
}

async function main(): Promise<void> {
  logger.info('Starting...');

  const jobType = (process.env.JOB_TYPE ?? '').replace(/^\uFEFF/, '').trim();

  if (jobType === 'fill-products-enrich') {
    logger.info('JOB_TYPE=', jobType, '→ fillProductsEnrichJob.runFillProductsEnrich (in-process)');
    const { runFillProductsEnrich } = await import('./jobs/fillProductsEnrichJob');
    const { ok } = await runFillProductsEnrich();
    process.exit(ok ? 0 : 1);
  }

  if (jobType === 'fill-brand-ja') {
    logger.info('JOB_TYPE=', jobType, '→ fillBrandJaJob (in-process)');
    try {
      const { resolveBrandJaRunDate, runFillBrandJa, parseLimitFromArgvOrEnv } = await import(
        './jobs/fillBrandJaJob'
      );
      const { runDate, source } = await resolveBrandJaRunDate();
      const limit = parseLimitFromArgvOrEnv();
      await runFillBrandJa(runDate, limit, { runDateSource: source });
    } catch (e) {
      logger.error('fill-brand-ja failed', e);
      process.exit(1);
    }
    process.exit(0);
  }

  if (jobType === 'nameja-nightly-targets') {
    logger.info('JOB_TYPE=', jobType, '→ runNameJaNightlyTargetsJob (in-process)');
    try {
      const { runNameJaNightlyTargetsJob } = require('./jobs/runNameJaNightlyTargetsJob') as {
        runNameJaNightlyTargetsJob: () => Promise<void>;
      };
      await runNameJaNightlyTargetsJob();
    } catch (e) {
      logger.error('nameja-nightly-targets failed', e);
      process.exit(1);
    }
    process.exit(0);
  }

  if (jobType === 'nameja-translate') {
    logger.info('JOB_TYPE=', jobType, '→ runNameJaTranslationJob (in-process)');
    try {
      const { runNameJaTranslationJob } = require('./jobs/runNameJaTranslationJob') as {
        runNameJaTranslationJob: () => Promise<void>;
      };
      await runNameJaTranslationJob();
    } catch (e) {
      logger.error('nameja-translate failed', e);
      process.exit(1);
    }
    process.exit(0);
  }

  if (jobType !== '' && Object.prototype.hasOwnProperty.call(FILL_JOB_SCRIPTS, jobType)) {
    logger.info('JOB_TYPE=', jobType, '→ running fill job only (no ranking)');
    await runFillJobByType(jobType);
  }
  if (jobType && jobType !== 'rankings') {
    logger.error('Unknown JOB_TYPE', jobType);
    process.exit(1);
  }

  const wantIngredients = process.argv.includes('--ingredients') || process.env.OLIVEYOUNG_INGREDIENTS === '1';
  if (wantIngredients) {
    await runOliveyoungIngredients();
    return;
  }

  const wantRankings =
    process.argv.includes('--rankings') ||
    process.argv.includes('--ranking') ||
    process.env.OLIVEYOUNG_RANKINGS === '1' ||
    process.env.OLIVEYOUNG_RANKING === '1' ||
    jobType === '' ||
    jobType === 'rankings';
  if (wantRankings) {
    const { runOliveyoungRankingsJob } = await import('./jobs/oliveyoungRankingsJob');
    const { closeBrowser } = await import('./utils/browser');
    try {
      await runOliveyoungRankingsJob();
    } finally {
      await closeBrowser();
    }
    return;
  }

  const runOliveYoung = process.argv.includes('--poc=oliveyoung') || process.env.RUN_OLIVEYOUNG_POC === '1';
  if (runOliveYoung) {
    const { runOliveYoungPoc } = await import('./sources/oliveyoung');
    await runOliveYoungPoc();
  }
}

main()
  .then(() => {
    logger.info('Done.');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('Fatal error', err);
    process.exit(1);
  });
