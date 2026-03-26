/**
 * oliveyoung/ingredients の index.json を更新する
 * 各 goodsNo の JSON アップロード後に、index をダウンロード → 追記/更新 → 再アップロード
 */
import { uploadJsonString, downloadFileContent } from "./gcsUpload";

export interface IngredientsIndexItem {
  goodsNo: string;
  publicPath: string;
  collectedAt: string;
  hasIngredients: boolean;
}

export interface IngredientsIndex {
  updatedAt: string;
  items: IngredientsIndexItem[];
}

const INDEX_FILENAME = "index.json";

function emptyIndex(): IngredientsIndex {
  return { updatedAt: new Date().toISOString(), items: [] };
}

function parseIndex(raw: string | null): IngredientsIndex {
  if (!raw || !raw.trim()) return emptyIndex();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as IngredientsIndex).items)) {
      const idx = parsed as IngredientsIndex;
      return {
        updatedAt: typeof idx.updatedAt === "string" ? idx.updatedAt : new Date().toISOString(),
        items: Array.isArray(idx.items) ? idx.items : [],
      };
    }
  } catch {
    // ignore
  }
  return emptyIndex();
}

/**
 * index.json を取得して 1 件分更新し、再アップロードする
 */
export async function updateIngredientsIndex(params: {
  bucket: string;
  prefix: string;
  item: IngredientsIndexItem;
}): Promise<void> {
  const { bucket, prefix, item } = params;
  const destination = prefix ? `${prefix}/${INDEX_FILENAME}` : INDEX_FILENAME;

  const raw = await downloadFileContent({ bucket, destination });
  const index = parseIndex(raw);

  const rest = index.items.filter((i) => i.goodsNo !== item.goodsNo);
  index.items = [...rest, item].sort((a, b) => a.goodsNo.localeCompare(b.goodsNo));
  index.updatedAt = new Date().toISOString();

  await uploadJsonString({
    bucket,
    destination,
    jsonString: JSON.stringify(index, null, 2),
    cacheControl: "public, max-age=60",
  });
}
