import { runDailyNameJaNightlyFlagging } from './nameJaOpsJob';

export async function runNameJaNightlyTargetsJob(): Promise<void> {
  await runDailyNameJaNightlyFlagging();
}

if (require.main === module) {
  runNameJaNightlyTargetsJob().catch((err) => {
    console.error('[DAILY_NAMEJA_NIGHTLY_FATAL]', err);
    process.exit(1);
  });
}
