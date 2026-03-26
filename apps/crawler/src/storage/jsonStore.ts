/**
 * JSON保存ユーティリティ
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { FailureLog } from '@kbeauty-ai/core';

/**
 * ディレクトリが存在しない場合は作成
 */
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * HTMLを保存
 */
export async function saveHTML(html: string, filename: string, baseDir: string = 'out/raw'): Promise<string> {
  await ensureDir(baseDir);
  const filepath = path.join(baseDir, filename);
  await fs.writeFile(filepath, html, 'utf-8');
  return filepath;
}

/**
 * JSONを保存
 */
export async function saveJSON(data: any, filename: string, baseDir?: string): Promise<string> {
  // baseDirが指定されていない場合は、filenameにパスが含まれていると判断
  let filepath: string;
  if (baseDir) {
    await ensureDir(baseDir);
    filepath = path.join(baseDir, filename);
  } else {
    // filenameにパスが含まれている場合
    const dir = path.dirname(filename);
    await ensureDir(dir);
    filepath = filename;
  }
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return filepath;
}

/**
 * FailureLogをJSONLに追記
 */
export async function appendFailureLog(log: FailureLog, baseDir: string = 'out/reports'): Promise<void> {
  await ensureDir(baseDir);
  const filepath = path.join(baseDir, 'failure_logs.jsonl');
  const line = JSON.stringify(log) + '\n';
  await fs.appendFile(filepath, line, 'utf-8');
}

/**
 * レポートJSONを保存
 */
export async function saveReport(data: any, filename: string, baseDir: string = 'out/reports'): Promise<string> {
  await ensureDir(baseDir);
  const filepath = path.join(baseDir, filename);
  await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
  return filepath;
}

export async function saveDebugHTML(html: string, filename: string, baseDir: string = 'out/debug_extract'): Promise<string> {
  await ensureDir(baseDir);
  const filepath = path.join(baseDir, filename);
  await fs.writeFile(filepath, html, 'utf-8');
  return filepath;
}

