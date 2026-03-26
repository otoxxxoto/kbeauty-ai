/**
 * 商品詳細の再取得＋oliveyoung_products_public への upsert
 * refetchOliveYoungProductJob / refetchOliveYoungMissingImagesJob から共通利用
 */
import { fetchDetailNameBrand } from '../sources/oliveyoungIngredients';
import { upsertPublicProduct } from './productFirestore';

function getRunDateJst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

export interface RefetchProductDetailResult {
  ok: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

/**
 * 1件の商品について詳細取得し、oliveyoung_products_public に保存する
 */
export async function runRefetchProductDetail(
  goodsNo: string
): Promise<RefetchProductDetailResult> {
  try {
    const r = await fetchDetailNameBrand(goodsNo, { rank: 0 });

    const name =
      (r.name && r.name.trim()) ? r.name.trim()
        : (r.nameCandidate && r.nameCandidate.trim()) ? r.nameCandidate.trim()
          : (r.title && r.title.trim()) ? r.title.trim()
            : '';
    const brand = (r.brand && r.brand.trim()) ? r.brand.trim() : '';

    const runDate = getRunDateJst();

    await upsertPublicProduct({
      goodsNo,
      name: name || undefined,
      brand: brand || undefined,
      lastSeenRank: r.rank ?? 0,
      runDate,
      imageUrl: r.imageUrl,
      thumbnailUrl: r.thumbnailUrl,
    });

    return {
      ok: true,
      imageUrl: (r.imageUrl && r.imageUrl.trim()) ? r.imageUrl.trim() : undefined,
      thumbnailUrl: (r.thumbnailUrl && r.thumbnailUrl.trim()) ? r.thumbnailUrl.trim() : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
