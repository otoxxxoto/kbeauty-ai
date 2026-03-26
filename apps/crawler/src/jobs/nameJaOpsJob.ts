import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

type NameJaJobResult = {
  elapsedMs: number;
  updated: number;
  skipped: number;
  matched: number;
  scanned: number;
};

function resolveWebDirAbsolute(): string {
  // apps/crawler/src/jobs/nameJaOpsJob.ts -> apps/web
  return resolve(__dirname, '../../../web');
}

function runPnpmScriptInWeb(
  scriptName: string,
  _doneLogTag: string,
  extraArgs: string[] = []
): Promise<NameJaJobResult> {
  return new Promise(async (resolvePromise, rejectPromise) => {
    const webDir = resolveWebDirAbsolute();
    if (!existsSync(webDir)) {
      rejectPromise(new Error(`apps/web directory not found: ${webDir}`));
      return;
    }

    const started = Date.now();
    const cmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const args =
      extraArgs.length > 0
        ? ['run', scriptName, '--', ...extraArgs]
        : ['run', scriptName];

    const spawnOnce = (shell: boolean): Promise<void> => {
      return new Promise((resolveOnce, rejectOnce) => {
        const child = spawn(cmd, args, {
          cwd: webDir,
          env: process.env,
          windowsHide: true,
          stdio: 'inherit',
          shell,
        });

        child.on('error', (err) => {
          rejectOnce(err);
        });

        child.on('close', (code) => {
          if (code !== 0) {
            rejectOnce(
              new Error(
                `pnpm run ${scriptName} failed (code=${code}) command=${cmd} cwd=${webDir} args=${JSON.stringify(
                  args
                )}`
              )
            );
            return;
          }
          resolveOnce();
        });
      });
    };

    console.log(
      '[NAMEJA_OPS_SPAWN_DEBUG]',
      JSON.stringify({
        command: cmd,
        args,
        cwd: webDir,
        platform: process.platform,
        shell: false,
      })
    );

    try {
      await spawnOnce(false);
      resolvePromise({
        elapsedMs: Date.now() - started,
        // stdio=inherit のためここでは DONE 行を再パースしない（ログで確認）
        scanned: 0,
        matched: 0,
        updated: 0,
        skipped: 0,
      });
      return;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const code = e != null ? e.code : undefined;
      const shouldRetryWithShell = process.platform === 'win32' && code === 'EINVAL';

      if (!shouldRetryWithShell) {
        rejectPromise(
          new Error(
            `[NAMEJA_OPS_SPAWN_ERROR] command=${cmd} cwd=${webDir} args=${JSON.stringify(
              args
            )} error=${String(err)}`
          )
        );
        return;
      }

      console.warn(
        '[NAMEJA_OPS_SPAWN_RETRY_WIN32_SHELL]',
        JSON.stringify({
          command: cmd,
          args,
          cwd: webDir,
          platform: process.platform,
          shell: true,
        })
      );

      try {
        await spawnOnce(true);
        console.log('[NAMEJA_OPS_SPAWN_RETRY_SUCCESS]');
        resolvePromise({
          elapsedMs: Date.now() - started,
          scanned: 0,
          matched: 0,
          updated: 0,
          skipped: 0,
        });
        return;
      } catch (retryErr) {
        console.error(
          '[NAMEJA_OPS_SPAWN_RETRY_ERROR]',
          JSON.stringify({
            command: cmd,
            args,
            cwd: webDir,
            platform: process.platform,
            shell: true,
            error: String(retryErr),
          })
        );
        rejectPromise(
          new Error(
            `[NAMEJA_OPS_SPAWN_RETRY_ERROR] command=${cmd} cwd=${webDir} args=${JSON.stringify(
              args
            )} error=${String(retryErr)}`
          )
        );
      }
    }
  });
}

/**
 * 日次ランキング更新直後に公開面向け優先フラグを付与する。
 * 失敗時は呼び出し側ポリシー（fail-fast / warning）で扱う。
 */
export async function runDailyNameJaSurfaceFlagging(): Promise<NameJaJobResult> {
  console.log('[DAILY_NAMEJA_SURFACE_START]');
  const result = await runPnpmScriptInWeb(
    'flag-nameja-surface-targets',
    '[NAMEJA_SURFACE_FIX_DONE]'
  );
  console.log(
    '[DAILY_NAMEJA_SURFACE_DONE]',
    JSON.stringify({
      elapsedMs: result.elapsedMs,
      scanned: result.scanned,
      matched: result.matched,
      updated: result.updated,
      skipped: result.skipped,
    })
  );
  return result;
}

/**
 * 夜間に全件スキャンで nightly 翻訳対象を投入する。
 */
export async function runDailyNameJaNightlyFlagging(): Promise<NameJaJobResult> {
  console.log('[DAILY_NAMEJA_NIGHTLY_START]');
  const result = await runPnpmScriptInWeb(
    'flag-nameja-nightly-targets',
    '[NAMEJA_NIGHTLY_FLAG_DONE]'
  );
  console.log(
    '[DAILY_NAMEJA_NIGHTLY_DONE]',
    JSON.stringify({
      elapsedMs: result.elapsedMs,
      scanned: result.scanned,
      matched: result.matched,
      updated: result.updated,
      skipped: result.skipped,
    })
  );
  return result;
}
