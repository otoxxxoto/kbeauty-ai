/**
 * HAR ファイルを読み、response.content.text に対してキーワード検索する。
 * ヒットしたら URL と前後スニペットを har_hits.txt へ。0件なら全URLを har_urls.txt へ。
 *
 * Usage: pnpm tsx scripts/har_scan.ts [harPath] [regexPattern]
 * Example: pnpm tsx scripts/har_scan.ts out/debug_network/oliveyoung.har "전성분|성분|ingredient|INCI"
 */
import * as fs from 'fs/promises';
import * as path from 'path';

const DEFAULT_HAR_PATH = 'out/debug_network/oliveyoung.har';
const DEFAULT_PATTERN =
  '전성분|성분|ingredient|ingredients|INCI|inci|전성분명|성분명';
const SNIPPET_RADIUS = 80;
const REPORTS_DIR = 'out/reports';
const HITS_FILE = path.join(REPORTS_DIR, 'har_hits.txt');
const URLS_FILE = path.join(REPORTS_DIR, 'har_urls.txt');

interface HarEntry {
  request?: { url?: string };
  response?: {
    content?: {
      text?: string;
      encoding?: string;
    };
  };
}

interface HarLog {
  log?: {
    entries?: HarEntry[];
  };
}

function extractSnippets(text: string, pattern: RegExp): string[] {
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const start = Math.max(0, m.index - SNIPPET_RADIUS);
    const end = Math.min(text.length, m.index + m[0].length + SNIPPET_RADIUS);
    let snippet = text.slice(start, end);
    snippet = snippet.replace(/\r?\n/g, ' ');
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    snippets.push(snippet);
  }
  return snippets;
}

async function main(): Promise<void> {
  const harPath = process.argv[2] || DEFAULT_HAR_PATH;
  const patternArg = process.argv[3] || DEFAULT_PATTERN;
  const pattern = new RegExp(patternArg, 'gi');

  const allUrls: string[] = [];
  const hits: Array<{ url: string; snippets: string[] }> = [];

  let harJson: HarLog;
  try {
    const raw = await fs.readFile(harPath, 'utf-8');
    harJson = JSON.parse(raw) as HarLog;
  } catch (e) {
    console.error('Failed to read or parse HAR:', (e as Error).message);
    process.exit(1);
  }

  const entries = harJson?.log?.entries ?? [];
  for (const entry of entries) {
    try {
      const url = entry.request?.url ?? '';
      if (!url) continue;

      allUrls.push(url);

      const content = entry.response?.content;
      if (!content) continue;
      if (content.encoding === 'base64' || content.text == null || content.text === '') {
        continue; // text無し → URL一覧には既に追加済み
      }

      const text = content.text;
      const snippetList = extractSnippets(text, pattern);
      if (snippetList.length > 0) {
        hits.push({ url, snippets: snippetList });
      }
    } catch {
      // 1エントリ失敗しても続行
    }
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true });

  if (hits.length > 0) {
    const lines: string[] = [];
    for (const h of hits) {
      lines.push('URL: ' + h.url);
      for (const s of h.snippets) {
        lines.push('  ' + s);
      }
      lines.push('');
    }
    await fs.writeFile(HITS_FILE, lines.join('\n'), 'utf-8');
    console.log(`Wrote ${hits.length} hit(s) to ${HITS_FILE}`);
  } else {
    const lines = allUrls.filter((u, i, a) => a.indexOf(u) === i);
    await fs.writeFile(URLS_FILE, lines.join('\n'), 'utf-8');
    console.log(`No hits. Wrote ${lines.length} URL(s) to ${URLS_FILE}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
