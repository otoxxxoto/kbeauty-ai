/**
 * 成分テキストの正規化（Web公開向け：タグ除去・エンティティデコード・前置き除去）
 */

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/** JSON 由来のエスケープを解除（\" → ", \\n → 空白 など） */
function unescapeJsonInText(s: string): string {
  return s
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"');
}

function cleanupWhitespace(s: string): string {
  // normalize newlines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // collapse spaces/tabs per line, keep newlines
  const lines = s.split("\n").map((line) =>
    line
      .replace(/[ \t\f\v]+/g, " ") // spaces/tabs -> single space
      .trim()
  );

  // collapse multiple empty lines
  const out: string[] = [];
  for (const line of lines) {
    const isEmpty = line.length === 0;
    const prevEmpty = out.length > 0 && out[out.length - 1].length === 0;
    if (isEmpty && prevEmpty) continue;
    out.push(line);
  }

  return out.join("\n").trim();
}

/** 先頭の「화장품법에 따라…모든 성분」などの前置き文を除去 */
function removePreamble(s: string): string {
  let t = s.trim();
  // 先頭が 화장품법에 따라 で始まる行を除去
  const preamblePattern = /^화장품법에\s+따라\s+기재해야\s+하는\s+모든\s+성분\s*[:\s]*/;
  t = t.replace(preamblePattern, '');
  // 전성분 のみの行が先頭にあれば除去
  t = t.replace(/^전성분\s*[:\s]*/i, '');
  t = t.replace(/^성분\s*[:\s]*/i, '');
  // JSON 由来の先頭断片（","content":" など）を除去
  t = t.replace(/^"\s*,\s*"content"\s*:\s*"\s*/i, '');
  // 末尾の JSON 断片（"}}\s* など）を除去
  t = t.replace(/"\s*}\s*}?\s*'?\s*$/, '');
  return t.trim();
}

/**
 * raw を純テキストに正規化（タグ除去・エンティティデコード・空白整理・前置き除去）
 * [브랜드명] のような角括弧ブロックは残す
 */
export function normalizeIngredientsText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let s = raw;

  s = stripHtml(s);
  s = decodeEntities(s);
  s = unescapeJsonInText(s);
  s = cleanupWhitespace(s);
  s = removePreamble(s);

  // --- hard trim: 末尾の JSON 断片を「最初に見つかった位置で切り捨て」方式
  const jsonGarbagePatterns = [
    /\{\s*"title"\s*:\s*"/,           // {"title":"
    /"\s*}\s*,\s*\{\s*"title"\s*:\s*"/, // "},{ "title":"
    /\\"title\\"\s*:\s*\\?"/,         // \"title\":\" (エスケープ残存時)
  ];
  let cutAt = s.length;
  for (const re of jsonGarbagePatterns) {
    const idx = s.search(re);
    if (idx !== -1 && idx < cutAt) cutAt = idx;
  }
  s = s.slice(0, cutAt).trim();

  return s.trim();
}

export type IngredientsBlock = { title: string; items: string[] };

function splitToItems(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractIngredientsBlocks(raw: string): IngredientsBlock[] {
  const normalized = normalizeIngredientsText(raw);

  const blocks: IngredientsBlock[] = [];
  // 行頭の [..] のみを見出し（同じ行の [..] 以降は body の先頭）
  const re = /^\s*\[([^\]]+)\]\s*/gm;
  const headers: Array<{ title: string; index: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    headers.push({ title: m[1].trim(), index: m.index, end: re.lastIndex });
  }

  if (headers.length === 0) {
    return [{ title: "UNKNOWN", items: splitToItems(normalized) }];
  }

  const headText = normalized.slice(0, headers[0].index).trim();
  if (headText) blocks.push({ title: "UNKNOWN", items: splitToItems(headText) });

  for (let i = 0; i < headers.length; i++) {
    const cur = headers[i];
    const next = headers[i + 1];
    const body = normalized.slice(cur.end, next ? next.index : normalized.length).trim();
    blocks.push({ title: cur.title, items: splitToItems(body) });
  }

  return blocks.filter((b) => b.items.length > 0);
}
