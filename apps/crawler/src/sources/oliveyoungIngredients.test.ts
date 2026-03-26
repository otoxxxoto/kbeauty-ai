/**
 * OliveYoung 成分取得の最小テスト
 * - findIngredientsText / extractIngredientLines: 収集 JSON から 정제수 を含むテキストを抽出
 * - getOliveyoungIngredients: goodsNo で 3ファイル（summary, raw, final）を生成
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../storage/gcsUpload', () => ({
  uploadJsonString: vi.fn().mockResolvedValue({ gsUri: 'gs://test/test.json', publicUrl: 'https://test' }),
  downloadFileContent: vi.fn().mockResolvedValue(null),
}));
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  getOliveyoungIngredients,
  findIngredientsText,
  extractIngredientLines,
  type CollectedJson,
} from './oliveyoungIngredients';

const GOODS_NO = 'A000000184228';
const OUT_DIR = path.join(process.cwd(), 'out', 'reports');

const SAMPLE_COLLECTED: CollectedJson[] = [
  {
    url: 'https://www.oliveyoung.co.kr/goods/api/v1/description?goodsNumber=A000000184228',
    text: '{"data":{"descriptionContents":"<table><tr><th>화장품법에 따라 기재해야 하는 모든 성분</th><td>[01NW 아이시] 정제수, 사이클로펜타실록세인</td></tr></table>"}}',
  },
];

describe('findIngredientsText', () => {
  it('화장품법에 따라 を含む text を最優先で返す', () => {
    const collected: CollectedJson[] = [
      { url: 'u1', text: 'other' },
      { url: 'u2', text: '전성분 정제수' },
      { url: 'u3', text: '화장품법에 따라 기재해야 하는 모든 성분 정제수' },
    ];
    const got = findIngredientsText(collected);
    expect(got).not.toBeNull();
    expect(got!.raw).toContain('화장품법에 따라');
    expect(got!.pickedUrl).toBe('u3');
  });

  it('정제수 のみの text も拾う', () => {
    const collected: CollectedJson[] = [{ url: 'u1', text: 'foo 정제수, bar' }];
    const got = findIngredientsText(collected);
    expect(got).not.toBeNull();
    expect(got!.raw).toContain('정제수');
  });
});

describe('extractIngredientLines', () => {
  it('화장품법에 따라 以降を切り出し、정제수 が含まれる', () => {
    const raw = 'prefix 화장품법에 따라 기재해야 하는 모든 성분 [01NW] 정제수, 글리세린 기능성 화장품';
    const result = extractIngredientLines(raw);
    expect(result.ok).toBe(true);
    expect(result.ingredientsText).toBeDefined();
    expect(result.ingredientsText).toContain('정제수');
  });

  it('マーカーが無い場合は no_ingredient_markers_found', () => {
    const result = extractIngredientLines('no marker here');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_ingredient_markers_found');
  });
});

describe('getOliveyoungIngredients', () => {
  it('oliveyoung_ingredients_<goodsNo>.json / ingredients_raw_<goodsNo>.txt / ingredients_<goodsNo>.txt を生成し、ingredientsText に 정제수 が含まれる', async () => {
    const result = await getOliveyoungIngredients(GOODS_NO, {
      collect: () => Promise.resolve(SAMPLE_COLLECTED),
    });

    expect(result.ok).toBe(true);
    expect(result.path).toBe(path.join(OUT_DIR, `oliveyoung_ingredients_${GOODS_NO}.json`));

    const summary = JSON.parse(await fs.readFile(result.path, 'utf-8'));
    expect(summary.goodsNo).toBe(GOODS_NO);
    expect(summary.source).toBe('collected_json');
    expect(summary.ok).toBe(true);
    expect(summary.ingredientsText).toBeDefined();
    expect(summary.ingredientsText).toContain('정제수');
    expect(summary.ingredients).toBeDefined();
    expect(summary.ingredients).toContain('정제수');
    expect(summary.ingredients).not.toMatch(/<[^>]+>/);
    expect(summary.collectedAt).toBeDefined();
    expect(summary.fetchedAt).toBeDefined();

    expect(summary.ingredientsBlocks).toBeDefined();
    expect(Array.isArray(summary.ingredientsBlocks)).toBe(true);
    expect(summary.ingredientsBlocks.length).toBeGreaterThan(0);
    const first = summary.ingredientsBlocks[0];
    expect(first.title).toBeDefined();
    expect(first.items).toBeDefined();
    expect(first.items.length).toBeGreaterThan(0);
    for (const b of summary.ingredientsBlocks) {
      expect(b.title).not.toMatch(/\{"title"/);
      for (const item of b.items) {
        expect(item).not.toMatch(/\{"title"/);
      }
    }

    const rawPath = path.join(OUT_DIR, `ingredients_raw_${GOODS_NO}.txt`);
    const rawContent = await fs.readFile(rawPath, 'utf-8');
    expect(rawContent).toContain('화장품법에 따라');

    const finalPath = path.join(OUT_DIR, `ingredients_${GOODS_NO}.txt`);
    const finalContent = await fs.readFile(finalPath, 'utf-8');
    expect(finalContent).toContain('정제수');
  });
});
