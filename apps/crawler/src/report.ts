/**
 * PoCレポート生成
 * 成功率を算出してJSONで出力
 */
import { ProductParsed, PocReport, IngredientTagResult, normalizeToken, tokenizeIngredients, loadIngredientDict } from '@kbeauty-ai/core';
import { saveReport } from './storage/jsonStore';
import { extractIngredients } from '@kbeauty-ai/core';
import { Logger } from './utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = new Logger('REPORT');

export interface ReportInput {
  fetchedProducts: Array<{ raw: any; parsed: ProductParsed }>;
  ingredientTags: Map<string, IngredientTagResult>; // url -> IngredientTagResult
  l1Matches?: Array<any>; // L1MatchCandidate[]
}

/**
 * 失敗理由を集計
 */
function aggregateFailReasons(products: ProductParsed[]): Array<{ reason: string; count: number }> {
  const reasonCounts: Record<string, number> = {};

  for (const product of products) {
    for (const reason of product.fail_reasons) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }

  return Object.entries(reasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * PoCレポートを生成
 */
export async function generatePocReport(input: ReportInput): Promise<PocReport> {
  const { fetchedProducts, ingredientTags, l1Matches } = input;

  // === デバッグログ: 最初の1商品の詳細確認 ===
  if (fetchedProducts.length > 0) {
    const sample = fetchedProducts[0];
    const sampleTagResult = sample.parsed.ingredients_text ? ingredientTags.get(sample.parsed.url) : null;
    
    logger.info('=== DEBUG: Sample Product Analysis ===');
    logger.info(`Sample URL: ${sample.parsed.url}`);
    const sampleTagResultForIds = sample.parsed.ingredients_text ? ingredientTags.get(sample.parsed.url) : null;
    logger.info(`Sample top100_matched_ids (first 10): ${JSON.stringify((sampleTagResultForIds?.found_ids || []).slice(0, 10))}`);
    
    if (sampleTagResult && sampleTagResult.found_ids.length > 0) {
      const sampleIds = sampleTagResult.found_ids.slice(0, 10);
      const idAnalysis = sampleIds.map(id => {
        const idStr = String(id);
        const upper = idStr.toUpperCase();
        return {
          idStr,
          upper,
          isCommon: upper.startsWith('COMMON_'),
          isFunc: upper.startsWith('FUNC_'),
        };
      });
      logger.info(`Sample ID Analysis (first 10): ${JSON.stringify(idAnalysis, null, 2)}`);
      
      // matched_ids全体のカウント
      const allIds = sampleTagResult.found_ids;
      const commonCount = allIds.filter(id => String(id).toUpperCase().startsWith('COMMON_')).length;
      const funcCount = allIds.filter(id => String(id).toUpperCase().startsWith('FUNC_')).length;
      logger.info(`Sample matched_ids stats: total=${allIds.length}, commonCount=${commonCount}, funcCount=${funcCount}`);
      logger.info(`Sample matched_ids (all): ${JSON.stringify(allIds)}`);
      
      // 実際の成分テキストの一部も確認
      if (sample.parsed.ingredients_text) {
        const ingredientsPreview = sample.parsed.ingredients_text.substring(0, 500);
        logger.info(`Sample ingredients_text (first 500 chars): ${ingredientsPreview}`);
        
        // COMMON_系のエイリアスが含まれているか確認
        const commonAliases = ['water', 'aqua', '정제수', 'glycerin', 'glycerol', '글리세린', 'butylene glycol', '부틸렌글라이콜'];
        const foundCommonAliases = commonAliases.filter(alias => 
          ingredientsPreview.toLowerCase().includes(alias.toLowerCase())
        );
        logger.info(`Sample ingredients_text contains COMMON aliases: ${JSON.stringify(foundCommonAliases)}`);
      }
    } else {
      logger.info('Sample has no matched_ids');
    }
  }
  
  // === デバッグログ: 辞書側の確認 ===
  try {
    const { loadIngredientDict } = await import('@kbeauty-ai/core');
    const dict = loadIngredientDict();
    const commonCount = dict.filter(e => e.id.toUpperCase().startsWith('COMMON_')).length;
    const funcCount = dict.filter(e => e.id.toUpperCase().startsWith('FUNC_')).length;
    const noPrefixCount = dict.filter(e => !e.id.toUpperCase().startsWith('COMMON_') && !e.id.toUpperCase().startsWith('FUNC_')).length;
    logger.info('=== DEBUG: Dictionary Analysis ===');
    logger.info(`Dictionary stats: total=${dict.length}, COMMON_=${commonCount}, FUNC_=${funcCount}, noPrefix=${noPrefixCount}`);
    logger.info(`Sample COMMON_ IDs (first 5): ${JSON.stringify(dict.filter(e => e.id.toUpperCase().startsWith('COMMON_')).slice(0, 5).map(e => e.id))}`);
    logger.info(`Sample FUNC_ IDs (first 5): ${JSON.stringify(dict.filter(e => e.id.toUpperCase().startsWith('FUNC_')).slice(0, 5).map(e => e.id))}`);
  } catch (error: any) {
    logger.warn(`Failed to load dictionary for debug: ${error.message}`);
  }

  // 統計計算
  const totalFetchAttempts = fetchedProducts.length;
  // HTTP成功またはPlaywright成功のいずれかでカウント
  const successfulFetches = fetchedProducts.filter(p => p.raw !== null).length;
  const totalParsed = fetchedProducts.filter(p => p.parsed.parse_ok || p.parsed.title !== null).length;
  const ingredientsFound = fetchedProducts.filter(p => p.parsed.ingredients_text !== null && p.parsed.ingredients_text.length > 0).length;
  
  // Top100タグ付け成功数
  let top100Tagged = 0;
  let commonTagged = 0;
  let functionalTagged = 0;
  
  // 補助指標の集計
  let commonHintsFoundCount = 0;
  let totalDelimiterCount = 0;
  let ingredientsWithTextCount = 0;
  let totalDomDelimiterCount = 0;
  let domDelimiterCount = 0;
  let totalIngredientsTextDelimiterCount = 0;
  let ingredientsTextDelimiterCount = 0;
  
  // parse_sourceの集計
  let parseSourceDom = 0;
  let parseSourceNetwork = 0;
  let parseSourceNone = 0;
  
  for (const product of fetchedProducts) {
    // parse_sourceの集計
    if (product.parsed.parse_source === 'dom') {
      parseSourceDom++;
    } else if (product.parsed.parse_source === 'network') {
      parseSourceNetwork++;
    } else {
      parseSourceNone++;
    }
    
    // dom_delimiter_countを集計（ingredients_textがあるかどうかに関係なく）
    if (product.parsed.dom_delimiter_count !== undefined) {
      totalDomDelimiterCount += product.parsed.dom_delimiter_count;
      domDelimiterCount++;
    }
    
    if (product.parsed.ingredients_text) {
      ingredientsWithTextCount++;
      
      // delimiter数（カンマ）を集計（ingredients_text側）
      const delimiterCount = (product.parsed.ingredients_text.match(/,/g) || []).length;
      totalDelimiterCount += delimiterCount;
      totalIngredientsTextDelimiterCount += delimiterCount;
      ingredientsTextDelimiterCount++;
      
      // normalized_has_common_hintsがtrueの数をカウント
      if (product.parsed.normalized_has_common_hints === true) {
        commonHintsFoundCount++;
      }
      
      const tagResult = ingredientTags.get(product.parsed.url);
      if (tagResult && tagResult.found_ids.length > 0) {
        top100Tagged++;
        
        // COMMON_ prefixを持つIDが1つでも当たったか（大文字小文字を統一）
        const hasCommon = tagResult.found_ids.some(id => id.toUpperCase().startsWith('COMMON_'));
        if (hasCommon) {
          commonTagged++;
        }
        
        // FUNC_ prefixを持つIDが1つでも当たったか（大文字小文字を統一）
        const hasFunctional = tagResult.found_ids.some(id => id.toUpperCase().startsWith('FUNC_'));
        if (hasFunctional) {
          functionalTagged++;
        }
      }
    }
  }
  
  // 補助指標の計算
  const normalizedHasCommonHintsTrueRate = ingredientsFound > 0 ? commonHintsFoundCount / ingredientsFound : 0;
  const avgDelimiterCount = ingredientsWithTextCount > 0 ? totalDelimiterCount / ingredientsWithTextCount : 0;
  const avgDomDelimiterCount = domDelimiterCount > 0 ? totalDomDelimiterCount / domDelimiterCount : 0;
  const avgIngredientsTextDelimiterCount = ingredientsTextDelimiterCount > 0 ? totalIngredientsTextDelimiterCount / ingredientsTextDelimiterCount : 0;

  // 成功率計算
  const staticFetchSuccessRate = totalFetchAttempts > 0 ? successfulFetches / totalFetchAttempts : 0;
  const ingredientParseSuccessRate = successfulFetches > 0 ? ingredientsFound / successfulFetches : 0;
  const top100TagSuccessRate = ingredientsFound > 0 ? top100Tagged / ingredientsFound : 0;
  const commonTagSuccessRate = ingredientsFound > 0 ? commonTagged / ingredientsFound : 0;
  const functionalTagSuccessRate = ingredientsFound > 0 ? functionalTagged / ingredientsFound : 0;

  // L1名寄せ率（qoo10/rakutenがある場合のみ）
  let l1MatchRate: number | null = null;
  let l1Matched = 0;
  if (l1Matches && l1Matches.length > 0) {
    // L1スコア>=0.85の確定件数
    l1Matched = l1Matches.filter((m: any) => m.score >= 0.85).length;
    const oliveyoungCount = fetchedProducts.filter(p => p.parsed.source === 'oliveyoung').length;
    l1MatchRate = oliveyoungCount > 0 ? l1Matched / oliveyoungCount : 0;
  }

  // 失敗理由TOP10
  const allParsedProducts = fetchedProducts.map(p => p.parsed);
  const failReasonsTop = aggregateFailReasons(allParsedProducts);

  const report: PocReport = {
    generated_at: new Date().toISOString(),
    static_fetch_success_rate: staticFetchSuccessRate,
    ingredient_parse_success_rate: ingredientParseSuccessRate,
    top100_tag_success_rate: top100TagSuccessRate,
    common_tag_success_rate: commonTagSuccessRate,
    functional_tag_success_rate: functionalTagSuccessRate,
    l1_match_rate: l1MatchRate,
    stats: {
      total_fetch_attempts: totalFetchAttempts,
      successful_fetches: successfulFetches,
      total_parsed: totalParsed,
      ingredients_found: ingredientsFound,
      top100_tagged: top100Tagged,
      common_tagged: commonTagged,
      functional_tagged: functionalTagged,
      l1_matched: l1Matched,
      // 補助指標
      normalized_has_common_hints_true_rate: normalizedHasCommonHintsTrueRate,
      avg_delimiter_count: avgDelimiterCount,
      avg_dom_delimiter_count: avgDomDelimiterCount,
      avg_ingredients_text_delimiter_count: avgIngredientsTextDelimiterCount,
      common_hints_found_count: commonHintsFoundCount,
      parse_source_dom_count: parseSourceDom,
      parse_source_network_count: parseSourceNetwork,
      parse_source_none_count: parseSourceNone,
    },
    fail_reasons_top: failReasonsTop,
  };

  // ファイル名生成（YYYYMMDD_HHMM形式）
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, '').replace(/T/, '_').substring(0, 13);
  const filename = `poc_report_${dateStr}.json`;

  const filepath = await saveReport(report, filename);
  logger.info(`Report saved: ${filepath}`);
  logger.info(`Static fetch success rate: ${(staticFetchSuccessRate * 100).toFixed(2)}%`);
  logger.info(`Ingredient parse success rate: ${(ingredientParseSuccessRate * 100).toFixed(2)}%`);
  logger.info(`Top100 tag success rate: ${(top100TagSuccessRate * 100).toFixed(2)}%`);
  logger.info(`Common tag success rate: ${(commonTagSuccessRate * 100).toFixed(2)}%`);
  logger.info(`Functional tag success rate: ${(functionalTagSuccessRate * 100).toFixed(2)}%`);
  logger.info(`Normalized has common hints true rate: ${(normalizedHasCommonHintsTrueRate * 100).toFixed(2)}%`);
  logger.info(`Average delimiter count: ${avgDelimiterCount.toFixed(2)}`);
  logger.info(`Average DOM delimiter count: ${avgDomDelimiterCount.toFixed(2)}`);
  logger.info(`Average ingredients_text delimiter count: ${avgIngredientsTextDelimiterCount.toFixed(2)}`);
  logger.info(`Common hints found count: ${commonHintsFoundCount}`);
  logger.info(`Parse source distribution: dom=${parseSourceDom}, network=${parseSourceNetwork}, none=${parseSourceNone}`);
  if (l1MatchRate !== null) {
    logger.info(`L1 match rate: ${(l1MatchRate * 100).toFixed(2)}%`);
  }

  // 未知トークン頻出ランキングを生成
  await generateUnknownTokensRanking(fetchedProducts, ingredientTags);
  
  // 未知トークンのスコアリングとCSV出力
  await filterAndScoreUnknownTokens(fetchedProducts, ingredientTags);

  return report;
}

/**
 * 未知トークン頻出ランキングを集計
 */
export async function generateUnknownTokensRanking(
  fetchedProducts: Array<{ raw: any; parsed: ProductParsed }>,
  ingredientTags: Map<string, IngredientTagResult>
): Promise<void> {
  const tokenCounts: Record<string, { count: number; examples: string[] }> = {};
  const dict = loadIngredientDict();
  
  // 既にマッチしたaliasのセットを作成
  const matchedAliasesSet = new Set<string>();
  for (const entry of dict) {
    for (const alias of entry.aliases) {
      matchedAliasesSet.add(normalizeToken(alias));
    }
  }
  
  // 各ProductParsedのtokensから未知トークンを集計
  for (const { parsed } of fetchedProducts) {
    if (!parsed.ingredients_text) continue;
    
    const tokens = tokenizeIngredients(parsed.ingredients_text);
    const tagResult = ingredientTags.get(parsed.url);
    const matchedAliases = tagResult?.matched_aliases || {};
    
    for (const token of tokens) {
      const normalized = normalizeToken(token);
      
      // 既に辞書でマッチしたaliasを除外
      let isMatched = false;
      for (const alias in matchedAliases) {
        if (normalizeToken(alias) === normalized) {
          isMatched = true;
          break;
        }
      }
      if (isMatched) continue;
      
      // 数字だけ/URLっぽい/記号だけ/短すぎ(<=3)を除外
      if (normalized.length <= 3) continue;
      if (/^\d+$/.test(normalized)) continue; // 数字だけ
      if (/^https?:\/\//i.test(token)) continue; // URLっぽい
      if (/^[^\w가-힣]+$/.test(normalized)) continue; // 記号だけ（英数字・韓国語以外）
      
      // HTML/JavaScriptのノイズを除外
      const noiseKeywords = ['static', 'chunks', 'cf static', 'lavender', 'next', 'null', 'blinkmacsystemfont', 'apple sd gothic neo', 'noto sans', 'roboto', 'montserrat', 'sans serif', 'css', 'html', 'script', 'function', 'var ', 'const ', 'let ', 'return', 'if ', 'else', 'for ', 'while', 'document', 'window', 'element', 'class', 'id', 'href', 'src', 'data', 'json', 'xml', 'http', 'https', 'www', 'com', 'kr', 'co', 'jpg', 'png', 'gif', 'svg', 'woff', 'ttf', 'otf'];
      if (noiseKeywords.some(keyword => normalized.includes(keyword))) continue;
      
      // トークンをカウント
      if (!tokenCounts[normalized]) {
        tokenCounts[normalized] = { count: 0, examples: [] };
      }
      tokenCounts[normalized].count++;
      
      // 例を保存（最大5件まで）
      if (tokenCounts[normalized].examples.length < 5 && !tokenCounts[normalized].examples.includes(token)) {
        tokenCounts[normalized].examples.push(token);
      }
    }
  }
  
  // 上位100件を取得
  const top100 = Object.entries(tokenCounts)
    .map(([token, data]) => ({ token, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 100);
  
  // ファイルに保存
  const reportDir = path.join(process.cwd(), 'out', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const filepath = path.join(reportDir, 'unknown_tokens_top100.json');
  await fs.writeFile(filepath, JSON.stringify(top100, null, 2), 'utf-8');
  
  logger.info(`Unknown tokens ranking saved: ${filepath}`);
  logger.info(`Top 10 unknown tokens: ${top100.slice(0, 10).map(t => `${t.token} (${t.count})`).join(', ')}`);
}

/**
 * 未知トークンの成分っぽさスコアを計算
 */
function scoreTokenForIngredient(token: string): number {
  let score = 0;
  const normalized = normalizeToken(token);
  const lower = normalized.toLowerCase();
  
  // +2: 英字/ハングル比率が高い（70%以上）
  const alphanumericHangulCount = (normalized.match(/[a-zA-Z0-9가-힣]/g) || []).length;
  const ratio = normalized.length > 0 ? alphanumericHangulCount / normalized.length : 0;
  if (ratio >= 0.7) {
    score += 2;
  }
  
  // +2: 語尾パターン (acid|extract|ol|ate|ide|one|ene 等)
  const suffixPattern = /(acid|extract|ol|ate|ide|one|ene|ine|ium|ose|ide|yl|al|ic|in|on)$/i;
  if (suffixPattern.test(normalized)) {
    score += 2;
  }
  
  // +2: 韓国語成分パターン (수|산|추출물|글라이콜|히알루로네이트 等)
  const koreanPattern = /(수|산|추출물|글라이콜|히알루로네이트|아마이드|아세테이트|포스페이트|설페이트|클로라이드|나트륨|칼륨|마그네슘|아연|티타늄|산화|이산화|트리|테트라|헥사|옥타|데실|팔미토일|아세틸|메틸|에틸|프로필|부틸|펜틸|헥실|옥틸|데실|라우릴|스테아릴|올레일|리놀레일|리놀렌일|아라키돈|에이코사|도코사|테트라코사|트리코사|헥사코사|옥타코사|데카코사|운데카코사|도데카코사|트리데카코사|테트라데카코사|펜타데카코사|헥사데카코사|헵타데카코사|옥타데카코사|노나데카코사|에이코사노익|도코사노익|테트라코사노익|트리코사노익|헥사코사노익|옥타코사노익|데카코사노익|운데카코사노익|도데카코사노익|트리데카코사노익|테트라데카코사노익|펜타데카코사노익|헥사데카코사노익|헵타데카코사노익|옥타데카코사노익|노나데카코사노익)/;
  if (koreanPattern.test(normalized)) {
    score += 2;
  }
  
  // -3: 文章っぽい(スペース多すぎ/長すぎ)
  const spaceCount = (normalized.match(/\s/g) || []).length;
  if (spaceCount > 3 || normalized.length > 50) {
    score -= 3;
  }
  
  // -5: 明確なノイズ(既存除外リスト)
  const noiseKeywords = ['link', 'meta', 'stylesheet', 'crossorigin', 'undefined', 'rel', 'href', 'src', 'css', 'html', 'script', 'function', 'var', 'const', 'let', 'return', 'if', 'else', 'for', 'while', 'document', 'window', 'element', 'class', 'id', 'data', 'json', 'xml', 'http', 'https', 'www', 'com', 'kr', 'co', 'jpg', 'png', 'gif', 'svg', 'woff', 'ttf', 'otf', 'static', 'chunks', 'lavender', 'next', 'null', 'blinkmacsystemfont', 'roboto', 'montserrat', 'sans serif', 'font', 'weight', 'size', 'line', 'height', 'color', 'background', 'border', 'padding', 'margin', 'display', 'flex', 'box', 'webkit', 'ms', 'align', 'items', 'justify', 'content', 'position', 'relative', 'absolute', 'z index', 'cursor', 'pointer', 'button', 'type', 'aria', 'pressed', 'role', 'tablist', 'tab', 'panel', 'section', 'div', 'span', 'ul', 'li', 'ol', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'svg', 'path', 'viewbox', 'fill', 'none', 'stroke', 'width', 'height', 'xmlns', 'name', 'shape', 'vector', 'effect', 'non scaling', 'scaling', 'stroke', 'width', 'height', 'viewbox', 'fill', 'none', 'xmlns', 'name', 'shape', 'line', 'path', 'd', 'm', 'l', 'z', 'h', 'v', 'c', 's', 'q', 't', 'a', 'r', 'x', 'y', 'w', 'h', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'xlink', 'href', 'transform', 'translate', 'rotate', 'scale', 'skew', 'matrix', 'clip', 'path', 'mask', 'filter', 'fe', 'gaussian', 'blur', 'offset', 'merge', 'node', 'result', 'in', 'in2', 'operator', 'k1', 'k2', 'k3', 'k4', 'values', 'table', 'values', 'type', 'table', 'values', 'type', 'discrete', 'values', 'type', 'linear', 'values', 'type', 'gamma', 'values', 'type', 'identity', 'values', 'type', 'discrete', 'values', 'type', 'linear', 'values', 'type', 'gamma', 'values', 'type', 'identity', 'values', 'type', 'discrete', 'values', 'type', 'linear', 'values', 'type', 'gamma', 'values', 'type', 'identity'];
  if (noiseKeywords.some(keyword => lower.includes(keyword))) {
    score -= 5;
  }
  
  return score;
}

/**
 * バケットを提案（COMMON/FUNC/UNKNOWN）
 */
function suggestBucket(token: string): 'COMMON' | 'FUNC' | 'UNKNOWN' {
  const normalized = normalizeToken(token).toLowerCase();
  
  // FUNC寄りのパターン
  const funcPatterns = ['extract', 'acid', 'retinol', 'niacinamide', 'peptide', 'ceramide', 'hyaluronic', 'vitamin', 'collagen', 'centella', 'snail', 'propolis', 'ginseng', 'green tea', 'adenosine', 'argireline', 'egcg', 'fermented', 'licorice', 'madecassoside', 'natto', 'bifida', 'lactobacillus', 'saccharomyces', 'nucleotides', 'copper', 'palmitoyl', 'matrixyl', 'bee venom', 'royal jelly', 'honey', 'aloe', 'witch hazel', 'rose hip', 'arbutin', 'kojic', 'azelaic', 'salicylic', 'lactic', 'glycolic', 'mandelic', 'ferulic', 'ellagic', 'tranexamic', 'nicotinamide', 'zinc', 'titanium', 'sunscreen', 'phenoxyethanol', 'ethylhexyl', 'disodium', 'edta', 'carbomer', 'dimethicone', 'cyclopentasiloxane', 'caprylic', 'capric', 'triglyceride', 'sodium', 'lauryl', 'laureth', 'sulfate', 'cocamidopropyl', 'betaine', 'chloride', 'citrate', 'triethanolamine', 'hydroxide', 'potassium', 'benzyl', 'alcohol', 'paraben', 'diazolidinyl', 'urea', 'imidazolidinyl', 'methylisothiazolinone', 'methylchloroisothiazolinone', 'benzoate', 'sorbate', 'sorbic', 'benzoic', 'tetrasodium', 'trisodium', 'acetate', 'lactate', 'gluconate', 'ascorbyl', 'phosphate', 'magnesium', 'tetrahexyldecyl', 'glucoside', 'retinyl', 'palmitate', 'tocopheryl', 'nicotinate'];
  
  if (funcPatterns.some(pattern => normalized.includes(pattern))) {
    return 'FUNC';
  }
  
  // COMMON寄りのパターン（基本的な成分）
  const commonPatterns = ['water', 'aqua', '정제수', 'glycerin', 'glycerol', '글리세린', 'butylene', 'glycol', '부틸렌', 'propanediol', '프로판다이올', 'hexanediol', '헥산다이올', 'caprylyl', '카프릴릴', 'panthenol', '판테놀', 'allantoin', '알란토인', 'beta', 'glucan', '글루칸', 'trehalose', '트레할로스', 'sodium pca', '소듐피씨에이', 'arginine', '아르기닌', 'glycine', '글라이신', 'serine', '세린', 'alanine', '알라닌', 'glutamic', '글루타믹', 'lysine', '라이신', 'threonine', '트레오닌', 'proline', '프롤린', 'ceramide np', '세라마이드엔피', 'cholesterol', '콜레스테롤', 'fatty acid', '지방산', 'phytosphingosine', '피토스핑고신', 'galactomyces', '갈락토미세스', 'saccharomyces', '사카로미세스', 'bamboo', '대나무', 'birch', '자작나무', 'sea water', '해수', 'glycyrrhiza', '감초', 'scutellaria', '황금', 'camellia', '동백', 'rosa', '다마스크', 'calendula', '금잔화'];
  
  if (commonPatterns.some(pattern => normalized.includes(pattern))) {
    return 'COMMON';
  }
  
  return 'UNKNOWN';
}

/**
 * 未知トークンをフィルタリングしてスコアリングし、辞書候補CSVを出力
 */
export async function filterAndScoreUnknownTokens(
  fetchedProducts: Array<{ raw: any; parsed: ProductParsed }>,
  ingredientTags: Map<string, IngredientTagResult>
): Promise<void> {
  // まず未知トークンランキングを生成
  const tokenCounts: Record<string, { count: number; examples: string[] }> = {};
  const dict = loadIngredientDict();
  
  // 既にマッチしたaliasのセットを作成
  const matchedAliasesSet = new Set<string>();
  for (const entry of dict) {
    for (const alias of entry.aliases) {
      matchedAliasesSet.add(normalizeToken(alias));
    }
  }
  
  // 各ProductParsedのtokensから未知トークンを集計
  for (const { parsed } of fetchedProducts) {
    if (!parsed.ingredients_text) continue;
    
    const tokens = tokenizeIngredients(parsed.ingredients_text);
    const tagResult = ingredientTags.get(parsed.url);
    const matchedAliases = tagResult?.matched_aliases || {};
    
    for (const token of tokens) {
      const normalized = normalizeToken(token);
      
      // 既に辞書でマッチしたaliasを除外
      let isMatched = false;
      for (const alias in matchedAliases) {
        if (normalizeToken(alias) === normalized) {
          isMatched = true;
          break;
        }
      }
      if (isMatched) continue;
      
      // 数字だけ/URLっぽい/記号だけ/短すぎ(<=3)を除外
      if (normalized.length <= 3) continue;
      if (/^\d+$/.test(normalized)) continue;
      if (/^https?:\/\//i.test(token)) continue;
      if (/^[^\w가-힣]+$/.test(normalized)) continue;
      
      // HTML/JavaScriptのノイズを除外（より厳密に）
      const lower = normalized.toLowerCase();
      const noiseKeywords = ['static', 'chunks', 'cf static', 'lavender', 'next', 'null', 'blinkmacsystemfont', 'apple sd gothic neo', 'noto sans', 'roboto', 'montserrat', 'sans serif', 'css', 'html', 'script', 'function', 'var ', 'const ', 'let ', 'return', 'if ', 'else', 'for ', 'while', 'document', 'window', 'element', 'class', 'id', 'href', 'src', 'data', 'json', 'xml', 'http', 'https', 'www', 'com', 'kr', 'co', 'jpg', 'png', 'gif', 'svg', 'woff', 'ttf', 'otf', 'link', 'meta', 'stylesheet', 'crossorigin', 'undefined', 'rel', 'font', 'weight', 'size', 'line', 'height', 'color', 'background', 'border', 'padding', 'margin', 'display', 'flex', 'box', 'webkit', 'ms', 'align', 'items', 'justify', 'content', 'position', 'relative', 'absolute', 'z index', 'cursor', 'pointer', 'button', 'type', 'aria', 'pressed', 'role', 'tablist', 'tab', 'panel', 'section', 'div', 'span', 'ul', 'li', 'ol', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'svg', 'path', 'viewbox', 'fill', 'none', 'stroke', 'width', 'height', 'xmlns', 'name', 'shape', 'vector', 'effect', 'non scaling', 'scaling', 'stroke', 'width', 'height', 'viewbox', 'fill', 'none', 'xmlns', 'name', 'shape', 'line', 'path', 'd', 'm', 'l', 'z', 'h', 'v', 'c', 's', 'q', 't', 'a', 'r', 'x', 'y', 'w', 'h', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'xlink', 'href', 'transform', 'translate', 'rotate', 'scale', 'skew', 'matrix', 'clip', 'path', 'mask', 'filter', 'fe', 'gaussian', 'blur', 'offset', 'merge', 'node', 'result', 'in', 'in2', 'operator', 'k1', 'k2', 'k3', 'k4', 'values', 'table', 'values', 'type', 'table', 'values', 'type', 'discrete', 'values', 'type', 'linear', 'values', 'type', 'gamma', 'values', 'type', 'identity', 'values', 'type', 'discrete', 'values', 'type', 'linear', 'values', 'type', 'gamma', 'values', 'type', 'identity', '원', '구매', '수량', '개', '총', '만원', '이상', '무료', '특가', '이벤트', '쿠폰', '증정', '선착순', '드림', '픽', '올영', '캐릭터즈', '파우치', '빗거울'];
      if (noiseKeywords.some(keyword => lower.includes(keyword))) continue;
      
      // 価格/数量/イベント情報っぽいものを除外
      if (/원|구매|수량|개|총|만원|이상|무료|특가|이벤트|쿠폰|증정|선착순|드림|픽|올영/i.test(normalized)) continue;
      
      // 数字だけのトークンや、数字が多すぎるものを除外
      const digitCount = (normalized.match(/\d/g) || []).length;
      if (digitCount > normalized.length * 0.5) continue;
      
      // トークンをカウント
      if (!tokenCounts[normalized]) {
        tokenCounts[normalized] = { count: 0, examples: [] };
      }
      tokenCounts[normalized].count++;
      
      // 例を保存（最大5件まで）
      if (tokenCounts[normalized].examples.length < 5 && !tokenCounts[normalized].examples.includes(token)) {
        tokenCounts[normalized].examples.push(token);
      }
    }
  }
  
  // スコアリング
  const scoredTokens = Object.entries(tokenCounts)
    .map(([token, data]) => ({
      token,
      count: data.count,
      examples: data.examples,
      score: scoreTokenForIngredient(token),
      suggested_bucket: suggestBucket(token),
    }))
    .filter(t => t.score > 0) // スコアが0より大きいもののみ
    .sort((a, b) => {
      // スコア降順、同点ならcount降順
      if (b.score !== a.score) return b.score - a.score;
      return b.count - a.count;
    })
    .slice(0, 50); // 上位50件
  
  // CSV出力
  const reportDir = path.join(process.cwd(), 'out', 'reports');
  await fs.mkdir(reportDir, { recursive: true });
  const csvPath = path.join(reportDir, 'dict_candidates.csv');
  
  // CSVヘッダー
  const csvLines = ['token,count,examples,suggested_bucket,decision'];
  
  // CSVデータ
  for (const item of scoredTokens) {
    const examplesStr = item.examples.map(e => e.replace(/"/g, '""')).join('; ');
    const csvLine = `"${item.token.replace(/"/g, '""')}",${item.count},"${examplesStr}","${item.suggested_bucket}","pending"`;
    csvLines.push(csvLine);
  }
  
  await fs.writeFile(csvPath, csvLines.join('\n'), 'utf-8');
  
  logger.info(`Dictionary candidates CSV saved: ${csvPath}`);
  logger.info(`Top 10 scored tokens: ${scoredTokens.slice(0, 10).map(t => `${t.token} (score: ${t.score}, count: ${t.count})`).join(', ')}`);
}

