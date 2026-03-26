/**
 * 辞書候補CSVからdecision=keepのトークンを辞書に追加するスクリプト
 * 
 * 使用方法:
 *   pnpm -C apps/crawler tsx scripts/apply_dict_candidates.ts
 * 
 * CSVファイル: out/reports/dict_candidates.csv
 * 辞書ファイル: packages/core/data/ingredients_top100.json
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { IngredientDictEntry } from '@kbeauty-ai/core';

interface DictCandidate {
  token: string;
  count: number;
  examples: string[];
  suggested_bucket: 'COMMON' | 'FUNC' | 'UNKNOWN';
  decision: 'keep' | 'drop' | 'pending';
}

/**
 * CSVをパース
 */
async function parseCsv(csvPath: string): Promise<DictCandidate[]> {
  const content = await fs.readFile(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    return [];
  }
  
  const candidates: DictCandidate[] = [];
  
  // ヘッダーをスキップ
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    // CSVパース（簡易版：カンマ区切り、ダブルクォート対応）
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          // エスケープされたダブルクォート
          current += '"';
          j++;
        } else {
          // クォートの開始/終了
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current); // 最後のフィールド
    
    if (parts.length >= 5) {
      const token = parts[0].replace(/^"|"$/g, '');
      const count = parseInt(parts[1], 10) || 0;
      const examplesStr = parts[2].replace(/^"|"$/g, '');
      const examples = examplesStr ? examplesStr.split('; ').map(e => e.trim()) : [];
      const suggested_bucket = parts[3].replace(/^"|"$/g, '') as 'COMMON' | 'FUNC' | 'UNKNOWN';
      const decision = parts[4].replace(/^"|"$/g, '') as 'keep' | 'drop' | 'pending';
      
      candidates.push({
        token,
        count,
        examples,
        suggested_bucket,
        decision,
      });
    }
  }
  
  return candidates;
}

/**
 * 辞書にエントリを追加
 */
async function addToDictionary(
  candidates: DictCandidate[],
  dictPath: string
): Promise<void> {
  // 既存の辞書を読み込む
  const dictContent = await fs.readFile(dictPath, 'utf-8');
  const dict: IngredientDictEntry[] = JSON.parse(dictContent);
  
  // decision=keepのトークンを追加
  const keepCandidates = candidates.filter(c => c.decision === 'keep');
  
  if (keepCandidates.length === 0) {
    console.log('No candidates with decision=keep found.');
    return;
  }
  
  console.log(`Adding ${keepCandidates.length} entries to dictionary...`);
  
  // 自動採番用のカウンター
  let commonAutoCounter = 1;
  let funcAutoCounter = 1;
  
  // 既存のAUTO_エントリから最大番号を取得
  for (const entry of dict) {
    if (entry.id.startsWith('COMMON_AUTO_')) {
      const match = entry.id.match(/COMMON_AUTO_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= commonAutoCounter) {
          commonAutoCounter = num + 1;
        }
      }
    } else if (entry.id.startsWith('FUNC_AUTO_')) {
      const match = entry.id.match(/FUNC_AUTO_(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num >= funcAutoCounter) {
          funcAutoCounter = num + 1;
        }
      }
    }
  }
  
  for (const candidate of keepCandidates) {
    // 既存のエントリで同じaliasを持つものを探す（正規化して比較）
    const normalizedCandidateToken = candidate.token.toLowerCase().trim();
    let existingEntry: IngredientDictEntry | undefined = undefined;
    
    for (const entry of dict) {
      const hasMatchingAlias = entry.aliases.some(alias => 
        alias.toLowerCase().trim() === normalizedCandidateToken
      );
      if (hasMatchingAlias) {
        existingEntry = entry;
        break;
      }
    }
    
    if (existingEntry) {
      // 既存エントリにaliasを追加（重複チェック）
      const aliasExists = existingEntry.aliases.some(alias => 
        alias.toLowerCase().trim() === normalizedCandidateToken
      );
      if (!aliasExists) {
        existingEntry.aliases.push(candidate.token);
        console.log(`  Added alias "${candidate.token}" to existing entry ${existingEntry.id}`);
      } else {
        console.log(`  Skipping ${candidate.token} (alias already exists in ${existingEntry.id})`);
      }
      continue;
    }
    
    // 新しいエントリを作成
    let id: string;
    if (candidate.suggested_bucket === 'COMMON') {
      id = `COMMON_AUTO_${String(commonAutoCounter).padStart(4, '0')}`;
      commonAutoCounter++;
    } else if (candidate.suggested_bucket === 'FUNC') {
      id = `FUNC_AUTO_${String(funcAutoCounter).padStart(4, '0')}`;
      funcAutoCounter++;
    } else {
      // UNKNOWNの場合はFUNCとして扱う
      id = `FUNC_AUTO_${String(funcAutoCounter).padStart(4, '0')}`;
      funcAutoCounter++;
    }
    
    // エントリを作成
    const entry: IngredientDictEntry = {
      id,
      display_ja: candidate.token, // 暫定：トークンをそのまま使用
      aliases: [candidate.token, ...candidate.examples.filter(e => e !== candidate.token)], // トークンと例をエイリアスに
    };
    
    dict.push(entry);
    console.log(`  Added ${id}: ${candidate.token} (aliases: ${entry.aliases.length})`);
  }
  
  // 重複排除：同じIDを持つエントリを削除
  const uniqueDict: IngredientDictEntry[] = [];
  const seenIds = new Set<string>();
  for (const entry of dict) {
    if (!seenIds.has(entry.id)) {
      seenIds.add(entry.id);
      uniqueDict.push(entry);
    } else {
      console.log(`  Removed duplicate entry: ${entry.id}`);
    }
  }
  
  // 辞書をIDでソート（COMMON_ → FUNC_ → その他）
  uniqueDict.sort((a, b) => {
    if (a.id.startsWith('COMMON_') && !b.id.startsWith('COMMON_')) return -1;
    if (!a.id.startsWith('COMMON_') && b.id.startsWith('COMMON_')) return 1;
    if (a.id.startsWith('FUNC_') && !b.id.startsWith('FUNC_')) return -1;
    if (!a.id.startsWith('FUNC_') && b.id.startsWith('FUNC_')) return 1;
    return a.id.localeCompare(b.id);
  });
  
  // dictを更新
  dict.length = 0;
  dict.push(...uniqueDict);
  
  // 辞書を保存
  await fs.writeFile(dictPath, JSON.stringify(dict, null, 2), 'utf-8');
  console.log(`\nDictionary updated: ${dictPath}`);
  console.log(`Total entries: ${dict.length}`);
}

/**
 * メイン処理
 */
async function main() {
  const csvPath = path.join(process.cwd(), 'out', 'reports', 'dict_candidates.csv');
  const dictPath = path.join(process.cwd(), '..', '..', 'packages', 'core', 'data', 'ingredients_top100.json');
  
  try {
    // CSVを読み込む
    console.log(`Reading CSV: ${csvPath}`);
    const candidates = await parseCsv(csvPath);
    console.log(`Found ${candidates.length} candidates`);
    
    const keepCount = candidates.filter(c => c.decision === 'keep').length;
    console.log(`Candidates with decision=keep: ${keepCount}`);
    
    if (keepCount === 0) {
      console.log('No candidates to add. Please edit dict_candidates.csv and set decision=keep for tokens you want to add.');
      return;
    }
    
    // 辞書に追加
    await addToDictionary(candidates, dictPath);
    
    console.log('\nDone! Please rebuild the core package:');
    console.log('  pnpm -C packages/core build');
    
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

