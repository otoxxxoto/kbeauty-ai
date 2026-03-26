/**
 * ネットワークから取得した成分ヒントを整形して辞書マッチしやすい形式に変換
 */
import * as cheerio from 'cheerio';

export interface NormalizeResult {
  normalizedText: string | null;
  source: 'network_json' | 'network_html' | 'network_text' | 'descriptionContents_section' | 'fallback' | 'none';
  normalizedHasCommonHints?: boolean; // water/glycerin/정제수/글리세린等を含むか
  candidateMeta?: {
    score: number;
    noiseHitCount: number;
    separatorCount: number;
    hasCommonHint: boolean;
  };
  sectionAnchor?: string; // 見つかったアンカー（"전성분"等）
  sectionLength?: number; // 抽出したセクションの長さ
  sectionSnippet?: string; // 抽出したセクションの先頭200文字
}

/**
 * 成分列として採用できるかを厳格に検証
 * @param text 検証するテキスト
 * @returns 採用可能ならtrue、不可ならfalse
 */
export function validateIngredientsText(text: string): { isValid: boolean; rejectReasons?: string[] } {
  const rejectReasons: string[] = [];
  
  if (!text || text.length < 200) {
    rejectReasons.push('length < 200');
    return { isValid: false, rejectReasons };
  }
  
  // delimiter_count（,・;|/改行をカンマ換算）
  const delimiterCount = (text.match(/[,;·•|\n]/g) || []).length;
  if (delimiterCount < 10) {
    rejectReasons.push('delimiterCount < 10');
    return { isValid: false, rejectReasons };
  }
  if (delimiterCount > 250) {
    rejectReasons.push('delimiterCount > 250');
    return { isValid: false, rejectReasons };
  }
  
  // noiseHitCount（css/html/js/url/data:image 等）
  const noiseHitCount = detectNoisePatterns(text);
  if (noiseHitCount > 1) {
    rejectReasons.push(`noiseHitCount > 1 (${noiseHitCount})`);
    return { isValid: false, rejectReasons };
  }
  
  // 拒否条件（どれか1つでfail）
  const lower = text.toLowerCase();
  
  // 1. productInfoHitCount >= 3
  const productInfoKeywords = [
    '원', '구매', '수량', '개', '총', '무료', '특가', '이벤트', '쿠폰', '증정', '선착순',
    '오늘드림', '배송', '장바구니', '바로구매', '리뷰', '평점', '교환', '반품', '환불', '매장', '픽업',
  ];
  const productInfoHitCount = productInfoKeywords.filter(keyword => lower.includes(keyword)).length;
  if (productInfoHitCount >= 3) {
    rejectReasons.push(`productInfoHitCount >= 3 (${productInfoHitCount})`);
    return { isValid: false, rejectReasons };
  }
  
  // 2. digitRatio > 0.15（数字の割合が15%超）
  const digitCount = (text.match(/\d/g) || []).length;
  const digitRatio = digitCount / text.length;
  if (digitRatio > 0.15) {
    rejectReasons.push(`digitRatio > 0.15 (${digitRatio.toFixed(3)})`);
    return { isValid: false, rejectReasons };
  }
  
  // 3. hangulParticleRatio > 0.12（助詞が多い）
  const hangulParticles = ['은', '는', '이', '가', '을', '를', '에', '에서', '으로', '와', '과', '도', '만'];
  const particleCount = hangulParticles.reduce((count, particle) => {
    const matches = text.match(new RegExp(particle, 'g'));
    return count + (matches ? matches.length : 0);
  }, 0);
  const hangulParticleRatio = particleCount / text.length;
  if (hangulParticleRatio > 0.12) {
    rejectReasons.push(`hangulParticleRatio > 0.12 (${hangulParticleRatio.toFixed(3)})`);
    return { isValid: false, rejectReasons };
  }
  
  // 4. hasPricePattern === true
  const pricePattern = /\d{1,3}(,\d{3})*원|%\s*[가-힣]|원\s*\d{1,3}(,\d{3})*/;
  if (pricePattern.test(text)) {
    rejectReasons.push('hasPricePattern');
    return { isValid: false, rejectReasons };
  }
  
  // 5. hasShippingOrEventPattern === true
  const shippingOrEventPattern = /오늘드림|무료배송|쿠폰|증정|이벤트|선착순|배송|픽업|교환|반품|환불/i;
  if (shippingOrEventPattern.test(text)) {
    rejectReasons.push('hasShippingOrEventPattern');
    return { isValid: false, rejectReasons };
  }
  
  // hasCommonHints（water/정제수/glycerin/글리세린/부틸렌글라이콜等）
  const commonIngredientHints = [
    'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
    '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
    'panthenol', 'allantoin', 'beta glucan', '판테놀', '알란토인', '베타글루칸',
  ];
  const hasCommonHints = commonIngredientHints.some(hint => lower.includes(hint.toLowerCase()));
  
  // inciSuffixCount（acid/extract/ate/ol/ide 等の語尾が5回以上）
  const inciSuffixPattern = /\b\w+(?:acid|extract|ate|ol|ide|one|ene|ine|ium|ose|yl|al|ic|in|on)\b/gi;
  const inciSuffixMatches = text.match(inciSuffixPattern);
  const inciSuffixCount = inciSuffixMatches ? inciSuffixMatches.length : 0;
  
  // hasCommonHints OR inciSuffixCount>=5
  if (!hasCommonHints && inciSuffixCount < 5) {
    rejectReasons.push(`!hasCommonHints && inciSuffixCount < 5 (${inciSuffixCount})`);
    return { isValid: false, rejectReasons };
  }
  
  return { isValid: true }; // すべての条件を満たした
}

/**
 * ノイズパターンを検出してヒット数を返す
 */
function detectNoisePatterns(text: string): number {
  const noisePatterns = [
    /\.css-[a-z0-9]+/gi, // CSS class名
    /path\{/gi, // SVG path
    /vector-effect|stroke|fill|svg|stylesheet/gi, // SVG/CSS関連
    /<\w+[^>]*>/g, // HTML tag
    /function\(|const |var |=>|return |if \(/gi, // JavaScript
    /url\(|data:image/gi, // URL/画像データ
    /\{[^}]*\{/g, // ネストしたCSSルール
    /display:\s*(flex|block|inline|grid)/gi, // CSS display
    /font-family|font-size|font-weight/gi, // CSS font
    /margin|padding|border|background/gi, // CSS layout
  ];
  
  let hitCount = 0;
  for (const pattern of noisePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      hitCount += matches.length;
    }
  }
  
  return hitCount;
}

/**
 * 候補文字列のスコアを計算（強化版：ノイズ判定追加）
 */
function scoreCandidate(candidate: string): number {
  let score = 0;
  const lower = candidate.toLowerCase();
  
  // ノイズ判定（強い減点）
  const noiseHitCount = detectNoisePatterns(candidate);
  if (noiseHitCount >= 5) {
    // ノイズが一定数以上なら大幅減点（候補から除外される可能性が高い）
    score -= 50;
  } else if (noiseHitCount >= 2) {
    score -= 20;
  } else if (noiseHitCount >= 1) {
    score -= 5;
  }
  
  // +5: 전성분/성분/Ingredients を含む
  if (lower.includes('전성분') || lower.includes('성분') || lower.includes('ingredients')) {
    score += 5;
  }
  
  // +1: length>=500（弱化：元は+3）
  if (candidate.length >= 500) {
    score += 1;
  }
  
  // +5: 区切り記号が多い（強化：元は+2、閾値も上げる）
  const separatorCount = (candidate.match(/[,;·•|\n]/g) || []).length;
  if (separatorCount >= 20) {
    score += 5;
  } else if (separatorCount >= 10) {
    score += 3;
  } else if (separatorCount >= 5) {
    score += 1;
  }
  
  // +5: COMMON系成分語を含む（強化：元は+2）
  const commonIngredientHints = [
    'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
    '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
    'panthenol', 'allantoin', 'beta glucan', '판테놀', '알란토인', '베타글루칸',
    'sodium chloride', 'sodium citrate', '소듐클로라이드', '소듐시트레이트',
  ];
  let hasCommonHint = false;
  for (const hint of commonIngredientHints) {
    if (lower.includes(hint.toLowerCase())) {
      score += 5;
      hasCommonHint = true;
      break; // 1つ見つかればOK
    }
  }
  
  // +2: その他の常連成分語を含む
  if (!hasCommonHint) {
    const otherIngredients = [
      'niacinamide', 'panthenol', 'hyaluronic', 'ceramide', 'peptide',
      '나이아신', '판테놀', '히알루론', '세라마이드', '펩타이드',
      'acid', 'extract', 'alcohol', 'oil', 'ester', 'sulfate'
    ];
    for (const ingredient of otherIngredients) {
      if (lower.includes(ingredient.toLowerCase())) {
        score += 2;
        break;
      }
    }
  }
  
  // -5: ほぼ数字やURLばかり
  const digitUrlRatio = (candidate.match(/[\d\s\/:\.]+/g) || []).join('').length / candidate.length;
  if (digitUrlRatio > 0.7) {
    score -= 5;
  }
  
  return score;
}

/**
 * 商品情報のキーかどうかを判定（除外対象）
 */
function isProductInfoKey(key: string): boolean {
  const productKeyPattern = /goods|product|price|sale|discount|thumbnail|image|path|url|flag|category|brand|name|title|standard|code|registered|modified|index|rank|egCode|pagination|status|message|isSuccess|recType|recommended/i;
  return productKeyPattern.test(key);
}

/**
 * JSONから成分情報を深く再帰的に探索（強化版：商品情報を除外）
 */
export function deepSearchIngredients(obj: any, depth: number = 0, maxDepth: number = 8): Array<{ text: string; score: number }> {
  if (depth > maxDepth) return []; // 深さ制限
  
  const candidates: Array<{ text: string; score: number }> = [];
  
  if (typeof obj === 'string') {
    // base64画像データを除外
    if (obj.includes('data:image') || obj.includes('base64') || obj.match(/^[A-Za-z0-9+/=]{100,}$/)) {
      return []; // base64データは除外
    }
    
    // 価格情報を除外（数字とカンマ/ドットのみの文字列）
    if (/^[\d,.\s원\$₩]+$/.test(obj) && obj.length < 100) {
      return []; // 価格情報は除外
    }
    
    // 商品名っぽいパターンを除外（[1+1]や価格情報を含む）
    if (/\[.*?\]|원|\$\d|₩\d|salePrice|finalPrice|goodsName/i.test(obj) && obj.length < 200) {
      return []; // 商品名は除外
    }
    
    // 文字列が成分らしい場合（長さが50以上、区切り記号を含む）
    if (obj.length > 50 && (obj.includes(',') || obj.includes(';') || obj.includes('전성분') || obj.includes('성분') || obj.includes('ingredient'))) {
      const score = scoreCandidate(obj);
      if (score > 0) {
        candidates.push({ text: obj, score });
      }
    }
  } else if (Array.isArray(obj)) {
    // 配列の各要素を探索
    for (const item of obj) {
      const found = deepSearchIngredients(item, depth + 1, maxDepth);
      candidates.push(...found);
    }
    
    // 配列全体が文字列の配列の場合、結合して候補にする（ただし商品情報の配列は除外）
    if (obj.length > 0 && obj.every((item: any) => typeof item === 'string')) {
      const joined = obj.join(', ');
      // 商品名っぽいパターンを除外（[1+1]や価格情報を含む）
      if (joined.length > 50 && !/\[.*?\]|원|\$\d|₩\d|salePrice|finalPrice/i.test(joined)) {
        const score = scoreCandidate(joined);
        if (score > 0) {
          candidates.push({ text: joined, score });
        }
      }
    }
  } else if (obj && typeof obj === 'object') {
    // 商品情報のオブジェクトを除外（goodsNumber, salePrice等を含む）
    const keys = Object.keys(obj);
    const hasProductInfo = keys.some(k => isProductInfoKey(k));
    
    // 商品情報のオブジェクトは除外（ただし成分関連キーがある場合は探索）
    if (hasProductInfo) {
      const ingredientKeyPattern = /ingre|ingredient|inci|component|material|raw|full|all/i;
      const koreanKeyPattern = /전성분|성분|원재료/;
      const hasIngredientKey = keys.some(k => ingredientKeyPattern.test(k) || koreanKeyPattern.test(k));
      
      if (!hasIngredientKey) {
        return []; // 成分関連キーがない商品情報オブジェクトは除外
      }
    }
    
    // キー名のパターンマッチング（成分関連キーを優先）- 強化版
    const ingredientKeyPattern = /ingre|ingredient|inci|component|material|raw|full|all|allingredients|fullingredients|ingredientsinfo|ingredientinfo|ingrlist|incilist/i;
    const koreanKeyPattern = /전성분|성분표|성분정보|원재료/;
    
    for (const key in obj) {
      const keyLower = key.toLowerCase();
      const isIngredientKey = ingredientKeyPattern.test(key) || koreanKeyPattern.test(key);
      const isProductKey = isProductInfoKey(key);
      
      // 商品情報キーは除外（成分関連キーでない限り）
      if (isProductKey && !isIngredientKey) {
        continue; // 商品情報キーはスキップ
      }
      
      // 成分関連キーの場合は優先的に探索
      if (isIngredientKey) {
        if (typeof obj[key] === 'string') {
          let text = obj[key];
          
          // HTMLの場合はタグを剥がす
          if (text.includes('<') && text.includes('>')) {
            text = text.replace(/<[^>]+>/g, ' ').trim();
          }
          
          if (text.length > 50) {
            // 採用条件を緩める：hasCommonHints OR inciSuffixCount>=3 OR (delimiter>=30 and length>=400)
            const lower = text.toLowerCase();
            const commonIngredientHints = [
              'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
              '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
            ];
            const hasCommonHints = commonIngredientHints.some(hint => lower.includes(hint.toLowerCase()));
            
            const inciSuffixPattern = /\b\w+(?:acid|extract|ate|ol|ide|one|ene|ine|ium|ose|yl|al|ic|in|on)\b/gi;
            const inciSuffixMatches = text.match(inciSuffixPattern);
            const inciSuffixCount = inciSuffixMatches ? inciSuffixMatches.length : 0;
            
            const delimiterCount = (text.match(/[,;·•|\n]/g) || []).length;
            
            const shouldInclude = hasCommonHints || inciSuffixCount >= 3 || (delimiterCount >= 30 && text.length >= 400);
            
            if (shouldInclude) {
              const score = scoreCandidate(text) + 5; // キー名マッチでボーナス（強化）
              candidates.push({ text, score });
            }
          } else {
            // 再帰探索
            const found = deepSearchIngredients(obj[key], depth + 1, maxDepth);
            candidates.push(...found);
          }
        } else {
          // 再帰探索
          const found = deepSearchIngredients(obj[key], depth + 1, maxDepth);
          candidates.push(...found);
        }
      } else {
        // 通常のキーも再帰探索（ただし優先度は低い）
        const found = deepSearchIngredients(obj[key], depth + 1, maxDepth);
        candidates.push(...found);
      }
    }
  }
  
  return candidates;
}

/**
 * JSONから成分情報を再帰的に探索（後方互換性のため残す）
 */
function findIngredientsInJson(obj: any, depth: number = 0): string | null {
  const candidates = deepSearchIngredients(obj, depth, 5);
  if (candidates.length === 0) return null;
  
  // スコアが高い順にソートして最良を返す
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].text;
}

/**
 * テキストから成分セクション（전성분/성분/Ingredients/INCI区間）を抽出
 * @param raw JSON文字列、HTML、またはプレーンテキスト
 * @returns 抽出した成分セクション（正規化済み）、見つからなければnull
 */
export function extractIngredientsSectionFromText(raw: string): { text: string; anchor: string } | null {
  try {
    // 1. まず raw から「見えるテキスト」を作る
    let visibleText = raw;
    
    // JSON文字列の場合はパースを試みる
    if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        // object.data.descriptionContents を探す
        if (parsed?.data?.descriptionContents) {
          visibleText = parsed.data.descriptionContents;
        } else {
          // フラットなJSONの場合は文字列化
          visibleText = JSON.stringify(parsed);
        }
      } catch (e) {
        // JSONパース失敗は無視（そのままrawを使用）
      }
    }
    
    // HTMLタグ除去（<script>..</script>, <style>..</style> も削除）
    visibleText = visibleText
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '); // その他のHTMLタグも除去
    
    // エンティティ変換（&nbsp; 等をスペースに）
    visibleText = visibleText
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, ' '); // その他のエンティティもスペースに
    
    // 連続スペースを1つに
    visibleText = visibleText.replace(/\s+/g, ' ').trim();
    
    // 2. 開始アンカーを探す（最初にヒットしたものを採用）
    const anchors = ['전성분', '성분', 'Ingredients', 'INCI'];
    let startIndex = -1;
    let foundAnchor = '';
    
    for (const anchor of anchors) {
      const index = visibleText.indexOf(anchor);
      if (index !== -1) {
        startIndex = index;
        foundAnchor = anchor;
        break;
      }
    }
    
    if (startIndex === -1) {
      // 開始アンカーが見つからない場合、fallbackロジックを試す
      // カンマ区切りが多く、INCI語尾が多いテキストを成分セクションとして採用
      const delimiterCount = (visibleText.match(/[,;·•|\n]/g) || []).length;
      
      // INCI語尾パターン（英語）
      const inciSuffixPattern = /\b\w+(?:acid|extract|ate|ol|ide|one|ene|ine|ium|ose|yl|al|ic|in|on)\b/gi;
      const inciSuffixMatches = visibleText.match(inciSuffixPattern);
      const inciSuffixCount = inciSuffixMatches ? inciSuffixMatches.length : 0;
      
      // 韓国語の成分語尾パターン
      const koreanIngredientSuffixes = /(수|산|추출물|글라이콜|히알루로네이트|아마이드|아세테이트|포스페이트|설페이트|클로라이드|나트륨|칼륨|마그네슘|아연|티타늄|산화|이산화|트리|테트라|헥사|옥타|데실|팔미토일|아세틸|메틸|에틸|프로필|부틸|펜틸|헥실|옥틸|데실|라우릴|스테아릴|올레일|리놀레일|리놀렌일|아라키돈|에이코사|도코사|테트라코사|트리코사|헥사코사|옥타코사|데카코사|운데카코사|도데카코사|트리데카코사|테트라데카코사|펜타데카코사|헥사데카코사|헵타데카코사|옥타데카코사|노나데카코사|에이코사노익|도코사노익|테트라코사노익|트리코사노익|헥사코사노익|옥타코사노익|데카코사노익|운데카코사노익|도데카코사노익|트리데카코사노익|테트라데카코사노익|펜타데카코사노익|헥사데카코사노익|헵타데카코사노익|옥타코사노익|노나데카코사노익)/gi;
      const koreanSuffixMatches = visibleText.match(koreanIngredientSuffixes);
      const koreanSuffixCount = koreanSuffixMatches ? koreanSuffixMatches.length : 0;
      
      const totalInciSuffixCount = inciSuffixCount + koreanSuffixCount;
      
      // fallback条件を厳格化（validateIngredientsTextの拒否条件を流用）
      // 1. カンマ区切りが多く（>=10）
      // 2. INCI語尾が多い（>=5）
      // 3. テキストが十分長い（>=200）
      // 4. ノイズが少ない（<=1）
      // 5. 商品情報が少ない（productInfoHitCount < 3）
      // 6. 数字の割合が低い（digitRatio <= 0.15）
      // 7. 助詞の割合が低い（hangulParticleRatio <= 0.12）
      // 8. 価格パターンがない
      // 9. 配送/イベントパターンがない
      if (delimiterCount >= 10 && totalInciSuffixCount >= 5 && visibleText.length >= 200) {
        // ノイズが少ないかチェック
        const noiseHitCount = detectNoisePatterns(visibleText);
        if (noiseHitCount <= 1) {
          // 商品情報チェック
          const productInfoKeywords = [
            '원', '구매', '수량', '개', '총', '무료', '특가', '이벤트', '쿠폰', '증정', '선착순',
            '오늘드림', '배송', '장바구니', '바로구매', '리뷰', '평점', '교환', '반품', '환불', '매장', '픽업',
          ];
          const productInfoHitCount = productInfoKeywords.filter(keyword => visibleText.toLowerCase().includes(keyword)).length;
          
          // 数字の割合
          const digitCount = (visibleText.match(/\d/g) || []).length;
          const digitRatio = digitCount / visibleText.length;
          
          // 助詞の割合
          const hangulParticles = ['은', '는', '이', '가', '을', '를', '에', '에서', '으로', '와', '과', '도', '만'];
          const particleCount = hangulParticles.reduce((count, particle) => {
            const matches = visibleText.match(new RegExp(particle, 'g'));
            return count + (matches ? matches.length : 0);
          }, 0);
          const hangulParticleRatio = particleCount / visibleText.length;
          
          // 価格パターン
          const pricePattern = /\d{1,3}(,\d{3})*원|%\s*[가-힣]|원\s*\d{1,3}(,\d{3})*/;
          const hasPricePattern = pricePattern.test(visibleText);
          
          // 配送/イベントパターン
          const shippingOrEventPattern = /오늘드림|무료배송|쿠폰|증정|이벤트|선착순|배송|픽업|교환|반품|환불/i;
          const hasShippingOrEventPattern = shippingOrEventPattern.test(visibleText);
          
          // 厳格な条件チェック
          if (productInfoHitCount < 3 && 
              digitRatio <= 0.15 && 
              hangulParticleRatio <= 0.12 && 
              !hasPricePattern && 
              !hasShippingOrEventPattern) {
            // normalizeを適用
            const normalized = normalizeText(visibleText);
            
            if (normalized.length >= 200) {
              return {
                text: normalized,
                anchor: 'heuristic',
              };
            }
          }
        }
      }
      
      return null; // fallback条件を満たさない
    }
    
    // 3. 開始点から本文を抽出
    // 開始アンカーの直後から開始（アンカー自体は含めない）
    const contentStart = startIndex + foundAnchor.length;
    let contentText = visibleText.substring(contentStart).trim();
    
    // 4. 終了点を探す（次の見出しっぽい単語で切る）
    // 目次/おすすめ/価格/イベント/配送などのセクションを強制除外
    const endMarkers = [
      '사용방법', '사용법', '주의사항', '보관', '용량', '제조', '원산지',
      '상품명', '판매가', '배송', '리뷰', '구매', '이벤트', '쿠폰', '특가',
      '오늘드림', '무료배송', '증정', '선착순', '장바구니', '바로구매', '교환', '반품', '환불', '매장', '픽업',
      '목차', '차례', '추천', '인기상품', '관련상품', '함께보기', '세트상품',
      'How to use', 'Usage', 'Caution', 'Storage', 'Capacity', 'Manufacturer', 'Origin',
      'Product name', 'Price', 'Shipping', 'Review', 'Purchase', 'Event', 'Coupon', 'Sale',
      'Table of Contents', 'Recommended', 'Popular', 'Related Products', 'Set Products',
    ];
    
    let endIndex = contentText.length;
    for (const marker of endMarkers) {
      const index = contentText.indexOf(marker);
      if (index !== -1 && index < endIndex) {
        endIndex = index;
      }
    }
    
    // 価格パターンや配送パターンが含まれている場合は除外
    const pricePattern = /\d{1,3}(,\d{3})*원|%\s*[가-힣]|원\s*\d{1,3}(,\d{3})*/;
    const shippingPattern = /오늘드림|무료배송|배송|픽업|교환|반품|환불/i;
    if (pricePattern.test(contentText) || shippingPattern.test(contentText)) {
      const priceIndex = contentText.search(pricePattern);
      const shippingIndex = contentText.search(shippingPattern);
      const minIndex = Math.min(
        priceIndex !== -1 ? priceIndex : contentText.length,
        shippingIndex !== -1 ? shippingIndex : contentText.length
      );
      if (minIndex < endIndex) {
        endIndex = minIndex;
      }
    }
    
    // 終了点が見つかった場合はその位置まで、見つからなければ末尾まで
    const extractedText = contentText.substring(0, endIndex).trim();
    
    if (extractedText.length < 50) {
      return null; // 抽出テキストが短すぎる
    }
    
    // 5. normalize（既存の区切り統一・クレンジング）を適用
    const normalized = normalizeText(extractedText);
    
    if (normalized.length < 50) {
      return null; // 正規化後も短すぎる
    }
    
    return {
      text: normalized,
      anchor: foundAnchor,
    };
  } catch (e) {
    // エラー時はnullを返す
    return null;
  }
}

/**
 * HTMLから成分テキストを抽出
 */
function extractFromHTML(html: string): string | null {
  try {
    const $ = cheerio.load(html);
    
    // 成分キーワードを含む要素を探す
    const ingredientSelectors = [
      '*:contains("전성분")',
      '*:contains("성분")',
      '*:contains("Ingredients")',
      '[class*="ingredient"]',
      '[id*="ingredient"]',
    ];
    
    for (const selector of ingredientSelectors) {
      const el = $(selector).first();
      if (el.length > 0) {
        // 親要素のテキストを取得
        const parentText = el.parent().text() || el.text();
        if (parentText && parentText.length > 50) {
          return parentText;
        }
      }
    }
    
    // テーブルやリストから探す
    let foundTableText: string | null = null;
    $('table, dl, ul, ol').each((_, el) => {
      const tableText = $(el).text();
      if (tableText.includes('전성분') || tableText.includes('성분') || tableText.includes('Ingredients')) {
        if (tableText.length > 50 && !foundTableText) {
          foundTableText = tableText;
          return false; // break
        }
      }
    });
    if (foundTableText) {
      return foundTableText;
    }
  } catch (e) {
    // HTMLパース失敗は無視
  }
  
  return null;
}

/**
 * CSS/HTMLノイズ語のリスト
 */
const NOISE_WORDS = new Set([
  'css', 'path', 'stroke', 'fill', 'vector', 'display', 'flex', 'block', 'inline', 'grid',
  'font', 'family', 'size', 'weight', 'margin', 'padding', 'border', 'background',
  'color', 'width', 'height', 'position', 'relative', 'absolute', 'z-index',
  'webkit', 'moz', 'ms', 'transform', 'transition', 'animation', 'keyframes',
  'stylesheet', 'link', 'meta', 'script', 'function', 'const', 'var', 'let', 'return',
  'url', 'data', 'image', 'svg', 'xmlns', 'viewbox', 'href', 'src', 'rel',
]);

/**
 * トークンがノイズかどうかを判定
 */
function isNoiseToken(token: string): boolean {
  const normalized = token.toLowerCase().trim();
  if (normalized.length <= 2) return true; // 短すぎるトークン
  if (NOISE_WORDS.has(normalized)) return true; // ノイズ語
  if (/^[0-9]+$/.test(normalized)) return true; // 数字のみ
  if (/^[^\w가-힣]+$/.test(normalized)) return true; // 記号のみ
  if (/^https?:\/\//i.test(token)) return true; // URL
  return false;
}

/**
 * テキストを整形（改行/タブ/連続スペースを整形し、区切りを "," に寄せる）
 * 強化版：CSS/HTMLノイズ除去と商品情報除去を追加
 */
function normalizeText(text: string): string {
  let cleaned = text
    // HTMLタグ除去
    .replace(/<[^>]+>/g, ' ')
    // CSS class名の連続出現を除去（.css-xxxx のパターン）
    .replace(/\.css-[a-z0-9]+\s*/gi, ' ')
    // CSSルールっぽい断片を除去（{...}を含む）
    .replace(/\{[^}]*\}/g, ' ')
    // path{...} のようなSVG/CSSパターンを除去
    .replace(/path\{[^}]*\}/gi, ' ')
    // 商品情報パターンを除去（価格、商品名等）
    .replace(/\[.*?\]/g, ' ') // [1+1], [NEW]等の商品タグ
    .replace(/\d+[,.]?\d*\s*원/g, ' ') // 価格（数字+원）
    .replace(/\$\d+[,.]?\d*/g, ' ') // 価格（$数字）
    .replace(/₩\d+[,.]?\d*/g, ' ') // 価格（₩数字）
    .replace(/\d+[,.]?\d*\s*%[^,]*/g, ' ') // 割引率（数字%）
    .replace(/salePrice|finalPrice|discountRate|goodsName|goodsNumber/gi, ' ') // 商品情報キー
    .replace(/\d+ml|\d+g|\d+개|\d+COLOR|\d+colors/gi, ' ') // 容量・個数情報
    .replace(/SPF\d+|PA\+\+/gi, ' ') // SPF/PA情報
    .replace(/Q&A|\d+Q&A/gi, ' ') // Q&A情報
    .replace(/1577-\d+|\d{3,4}-\d{4}/g, ' ') // 電話番号
    .replace(/\d{4}\.\d{2}\.\d{2}[~-]\d{4}\.\d{2}\.\d{2}/g, ' ') // 日付範囲
    // 改行・タブをスペースに
    .replace(/[\r\n\t]/g, ' ')
    // 区切り記号をすべて "," に統一
    .replace(/[;·•|/]/g, ',')
    .replace(/[,;]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s*\(\s*/g, ' (')
    .replace(/\s*\)\s*/g, ') ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // トークン化してノイズ語を除外
  const tokens = cleaned.split(',').map(t => t.trim()).filter(t => t.length > 0);
  const filteredTokens = tokens.filter(token => {
    // ノイズ語を除外
    if (isNoiseToken(token)) return false;
    // 価格っぽいトークン（数字のみ、または数字+記号のみ）を除外
    if (/^[\d,.\s원\$₩%]+$/.test(token) && token.length < 20) return false;
    // 商品名っぽいトークン（[ ]を含む、または短すぎる）を除外
    if (/\[.*?\]/.test(token) || (token.length < 3 && !/[가-힣]/.test(token))) return false;
    return true;
  });
  
  // カンマ区切りの成分トークン列に整形
  return filteredTokens.join(', ');
}

/**
 * 成分ヒントを整形
 */
export function normalizeFromHints(
  ingredientHints: string[] | undefined,
  fallbackText: string | null
): NormalizeResult {
  if (!ingredientHints || ingredientHints.length === 0) {
    if (fallbackText) {
      const normalized = normalizeText(fallbackText);
      
      // バリデーション：成分列として採用できるか
      const validation = validateIngredientsText(normalized);
      if (!validation.isValid) {
        return {
          normalizedText: null,
          source: 'none',
        };
      }
      
      const lower = normalized.toLowerCase();
      const commonIngredientHints = [
        'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
        '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
      ];
      const hasCommonHint = commonIngredientHints.some(hint => lower.includes(hint.toLowerCase()));
      
      return {
        normalizedText: normalized,
        source: 'fallback',
        normalizedHasCommonHints: hasCommonHint,
      };
    }
    return {
      normalizedText: null,
      source: 'none',
    };
  }

  // 各ヒントを処理
  for (const hint of ingredientHints) {
    if (!hint || hint.length < 50) continue;

    // 1. JSONとしてパースを試みる（強化版：deepSearchIngredients使用）
    try {
      const json = JSON.parse(hint);
      const candidates = deepSearchIngredients(json, 0, 8);
      
      if (candidates.length > 0) {
        // スコアが高い順にソートして最良を採用（バリデーションを通す候補を探す）
        candidates.sort((a, b) => b.score - a.score);
        
        for (const candidate of candidates) {
          if (candidate.score > 0 && candidate.text.length > 50) {
            const normalized = normalizeText(candidate.text);
            
            // バリデーション：成分列として採用できるか
            const validation = validateIngredientsText(normalized);
            if (!validation.isValid) {
              continue; // 次の候補を試す
            }
            
            const lower = normalized.toLowerCase();
            const commonIngredientHints = [
              'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
              '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
            ];
            const hasCommonHint = commonIngredientHints.some(hint => lower.includes(hint.toLowerCase()));
            
            const noiseHitCount = detectNoisePatterns(candidate.text);
            const separatorCount = (candidate.text.match(/[,;·•|\n]/g) || []).length;
            
            return {
              normalizedText: normalized,
              source: 'network_json',
              normalizedHasCommonHints: hasCommonHint,
              candidateMeta: {
                score: candidate.score,
                noiseHitCount,
                separatorCount,
                hasCommonHint,
              },
            };
          }
        }
      }
      
      // deepSearchIngredientsがヒットしない場合、object.data.descriptionContents を探す
      if (candidates.length === 0 && json?.data?.descriptionContents) {
        const sectionResult = extractIngredientsSectionFromText(json.data.descriptionContents);
        if (sectionResult && sectionResult.text) {
          // バリデーション：成分列として採用できるか
          const validation = validateIngredientsText(sectionResult.text);
          if (validation.isValid) {
            const lower = sectionResult.text.toLowerCase();
            const commonIngredientHints = [
              'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
              '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
            ];
            const hasCommonHint = commonIngredientHints.some(hint => lower.includes(hint.toLowerCase()));
            
            return {
              normalizedText: sectionResult.text,
              source: 'descriptionContents_section',
              normalizedHasCommonHints: hasCommonHint,
              sectionAnchor: sectionResult.anchor,
              sectionLength: sectionResult.text.length,
              sectionSnippet: sectionResult.text.substring(0, 200),
            };
          }
        }
      }
    } catch (e) {
      // JSONパース失敗は次へ
    }

    // 2. HTMLとして処理を試みる
    if (hint.includes('<!DOCTYPE') || hint.includes('<html') || hint.includes('<div') || hint.includes('<table')) {
      const extracted = extractFromHTML(hint);
      if (extracted && extracted.length > 50) {
        const normalized = normalizeText(extracted);
        
        // バリデーション：成分列として採用できるか
        const validation = validateIngredientsText(normalized);
        if (!validation.isValid) {
          continue; // 次のヒントを試す
        }
        
        const lower = normalized.toLowerCase();
        const commonIngredientHints = [
          'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
          '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
        ];
        const hasCommonHint = commonIngredientHints.some(hint => lower.includes(hint.toLowerCase()));
        const noiseHitCount = detectNoisePatterns(extracted);
        const separatorCount = (extracted.match(/[,;·•|\n]/g) || []).length;
        
        return {
          normalizedText: normalized,
          source: 'network_html',
          normalizedHasCommonHints: hasCommonHint,
          candidateMeta: {
            score: scoreCandidate(extracted),
            noiseHitCount,
            separatorCount,
            hasCommonHint,
          },
        };
      }
    }

    // 3. プレーンテキストとして処理
    if (hint.includes('전성분') || hint.includes('성분') || hint.includes('Ingredients') || hint.includes(',')) {
      // HTMLレスポンスの場合は成分部分だけを抽出
      if (hint.includes('<!DOCTYPE') || hint.includes('<html') || hint.includes('<div') || hint.includes('<table')) {
        const extracted = extractFromHTML(hint);
        if (extracted && extracted.length > 50) {
          const normalized = normalizeText(extracted);
          
          // バリデーション：成分列として採用できるか
          if (!validateIngredientsText(normalized)) {
            continue; // 次のヒントを試す
          }
          
          return {
            normalizedText: normalized,
            source: 'network_html',
          };
        }
      }
      
      // HTMLタグを除去してから整形
      let cleaned = hint.replace(/<[^>]+>/g, ' ').trim();
      
      // 成分らしいテキストかチェック（区切り記号が多い、化学語を含む）
      const hasSeparators = (cleaned.match(/[,;]/g) || []).length >= 3;
      const hasChemicalWords = /(acid|extract|glycerin|water|alcohol|oil|ester|sulfate|정제수|글리세린|추출물|나이아신|히알루론|세라마이드|펩타이드)/i.test(cleaned);
      
      if (cleaned.length > 50 && (hasSeparators || hasChemicalWords)) {
        const normalized = normalizeText(cleaned);
        
        // バリデーション：成分列として採用できるか
        const validation = validateIngredientsText(normalized);
        if (!validation.isValid) {
          continue; // 次のヒントを試す
        }
        
        const lower = normalized.toLowerCase();
        const commonIngredientHints = [
          'water', 'aqua', 'glycerin', 'glycerol', 'butylene glycol', 'propanediol', 'hexanediol',
          '정제수', '글리세린', '글리세롤', '부틸렌글라이콜', '프로판다이올', '헥산다이올',
        ];
        const hasCommonHint = commonIngredientHints.some(hint => lower.includes(hint.toLowerCase()));
        const noiseHitCount = detectNoisePatterns(cleaned);
        const separatorCount = (cleaned.match(/[,;·•|\n]/g) || []).length;
        
        return {
          normalizedText: normalized,
          source: 'network_text',
          normalizedHasCommonHints: hasCommonHint,
          candidateMeta: {
            score: scoreCandidate(cleaned),
            noiseHitCount,
            separatorCount,
            hasCommonHint,
          },
        };
      }
    }
  }

  // すべて失敗した場合はfallbackTextを使用
  if (fallbackText) {
    const normalized = normalizeText(fallbackText);
    
    // バリデーション：成分列として採用できるか
    if (!validateIngredientsText(normalized)) {
      return {
        normalizedText: null,
        source: 'none',
      };
    }
    
    return {
      normalizedText: normalized,
      source: 'fallback',
    };
  }

  return {
    normalizedText: null,
    source: 'none',
  };
}

