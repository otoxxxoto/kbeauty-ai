const bucket = process.env.NEXT_PUBLIC_ING_BUCKET;
const prefix = process.env.NEXT_PUBLIC_ING_PREFIX;

export async function fetchIngredients(goodsNo: string) {
  if (!bucket || !prefix) {
    return { ok: false, reason: "missing_env" as const };
  }

  const url = `https://storage.googleapis.com/${bucket}/${prefix}/${goodsNo}.json`;
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    return { ok: false, status: res.status, url };
  }

  return await res.json();
}