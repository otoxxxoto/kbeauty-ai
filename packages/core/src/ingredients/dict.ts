/**
 * 成分辞書読み込み
 */
import { IngredientDictEntry } from '../types';
import dictData from '../../data/ingredients_top100.json';

export function loadIngredientDict(): IngredientDictEntry[] {
  return dictData as IngredientDictEntry[];
}

export function findIngredientById(id: string): IngredientDictEntry | undefined {
  const dict = loadIngredientDict();
  return dict.find(entry => entry.id === id);
}



