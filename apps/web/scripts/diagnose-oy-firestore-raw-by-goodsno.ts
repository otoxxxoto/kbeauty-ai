/**
 * goodsNo 指定で Firestore 生ドキュメントと急上昇カード直前の item を突き合わせる。
 * dotenv を firestore 初期化より先に実行するため、db は main 内で dynamic import。
 *
 *   pnpm exec tsx scripts/diagnose-oy-firestore-raw-by-goodsno.ts [goodsNo]
 */
import { resolve } from "path";
import { config } from "dotenv";

/** oliveyoung-products.ts と同一 */
const PRODUCTS_PUBLIC_COLLECTION = "oliveyoung_products_public";

function classify(args: {
  rawProductUrlPresent: boolean;
  rawProductUrlString: string;
  apiLike: boolean;
  href: string | null;
  itemProductUrl: string;
}): string {
  const { rawProductUrlPresent, rawProductUrlString, apiLike, href, itemProductUrl } = args;

  if (rawProductUrlPresent && rawProductUrlString.length > 0) {
    if (apiLike)
      return "C: Firestore 生の productUrl は非空だが isOliveYoungApiLikeUrl が true で getRelatedStyleOyHref が null（例: *.do 拡張子パターン）";
    if (!href && !apiLike)
      return "D: 生 productUrl は非空・APIライクではないのに getRelatedStyleOyHref が null（要コード確認）";
    if (href && !itemProductUrl.trim())
      return "B: 生 productUrl は遷移可能だが item.productUrl（merge 後）が空 — 二重 merge / 取得経路を疑う";
  }

  if (!rawProductUrlPresent || rawProductUrlString.length === 0) {
    if (itemProductUrl.trim())
      return "D: 生 productUrl は空だが item.productUrl は非空 — コンソールのフィールド／コレクション／doc id の取り違えを疑う";
    return "A: 生ドキュメントに productUrl が無い、またはスクリプトが別プロジェクトを見ている可能性（env / コンソールのプロジェクトと documentPath を照合）";
  }

  return "D: その他";
}

async function main() {
  config({ path: resolve(process.cwd(), ".env.local") });
  config({ path: resolve(process.cwd(), ".env") });

  const { firebaseApp, db } = await import("../src/lib/firestore");
  const { getRisingProductsWithProducts } = await import("../src/lib/oliveyoung-rankings");
  const {
    getRelatedStyleOyHref,
    isOliveYoungApiLikeUrl,
  } = await import("../src/lib/oliveyoung-official-url");

  const goodsNo = (process.argv[2] || "A000000222837").trim();

  const envProjectHint =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCP_PROJECT_ID?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    null;

  const resolvedAppProjectId = firebaseApp.options.projectId;

  const docRef = db.collection(PRODUCTS_PUBLIC_COLLECTION).doc(goodsNo);
  const snap = await docRef.get();

  const data = snap.exists ? (snap.data() ?? {}) : {};
  const rawPu = data.productUrl;
  const rawPk = data.pickedUrl;
  const rawOy = data.oliveYoungUrl;

  const rawProductUrlString =
    rawPu === undefined || rawPu === null ? "" : String(rawPu).trim();
  const rawPickedString =
    rawPk === undefined || rawPk === null ? "" : String(rawPk).trim();
  const rawOliveString =
    rawOy === undefined || rawOy === null ? "" : String(rawOy).trim();

  const hrefOnRaw = getRelatedStyleOyHref(
    rawPu === undefined || rawPu === null ? undefined : String(rawPu)
  );
  const apiLikeOnRaw = isOliveYoungApiLikeUrl(
    rawPu === undefined || rawPu === null ? "" : String(rawPu)
  );

  const rising = await getRisingProductsWithProducts(20);
  const item = rising?.items.find((i) => i.goodsNo === goodsNo) ?? null;

  const classification = classify({
    rawProductUrlPresent: rawPu !== undefined && rawPu !== null && String(rawPu).trim() !== "",
    rawProductUrlString,
    apiLike: apiLikeOnRaw,
    href: hrefOnRaw,
    itemProductUrl: item?.productUrl ?? "",
  });

  const out = {
    firebase: {
      env_FIREBASE_PROJECT_ID_or_equivalent: envProjectHint,
      resolvedAppProjectId: resolvedAppProjectId ?? null,
      note:
        "コンソールのプロジェクトと env の FIREBASE_PROJECT_ID（または GCP_PROJECT_ID）が一致するか確認。resolvedAppProjectId は initializeApp に渡した projectId。",
    },
    firestoreRead: {
      collectionId: PRODUCTS_PUBLIC_COLLECTION,
      documentPath: `${PRODUCTS_PUBLIC_COLLECTION}/${goodsNo}`,
      diagnoseOyOneHidden_samePath:
        "diagnose-oy-one-hidden.ts の getOliveYoungProductByGoodsNo は同一コレクション・同一 doc。返却の productUrl は merge 済みで Firestore の raw.productUrl ではない。",
    },
    doc: {
      exists: snap.exists,
      id: snap.id,
    },
    raw: {
      productUrl: rawPu ?? null,
      productUrl_typeof: rawPu === undefined ? "undefined" : typeof rawPu,
      pickedUrl: rawPk ?? null,
      pickedUrl_typeof: rawPk === undefined ? "undefined" : typeof rawPk,
      oliveYoungUrl: rawOy ?? null,
      oliveYoungUrl_typeof: rawOy === undefined ? "undefined" : typeof rawOy,
    },
    rawTrimmedStrings: {
      productUrl: rawProductUrlString,
      pickedUrl: rawPickedString,
      oliveYoungUrl: rawOliveString,
    },
    onRawProductUrl: {
      getRelatedStyleOyHref_result: hrefOnRaw,
      isOliveYoungApiLikeUrl_result: apiLikeOnRaw,
    },
    risingCardItem_beforeRender: item
      ? {
          goodsNo: item.goodsNo,
          item_productUrl: item.productUrl ?? "",
          item_pickedUrl: item.pickedUrl ?? null,
          item_oliveYoungUrl: item.oliveYoungUrl ?? null,
          note:
            "oliveyoung-rankings は getOliveYoungProductByGoodsNo の戻りを再度 mergeOliveYoungListingProductUrl している。item.productUrl は二段目の merge 結果。",
        }
      : {
          message:
            "急上昇枠の直近取得（最大20件）にこの goodsNo が含まれませんでした。トップに出ていなくても doc 生値は有効です。",
          item_productUrl: null,
          item_pickedUrl: null,
          item_oliveYoungUrl: null,
        },
    previousContradictionExplanation: {
      summary:
        "Firestore コンソールの productUrl（生）と、前回ログの productUrl（空）は別物だった。前者は raw フィールド、後者は getOliveYoungProductByGoodsNo().productUrl（merge + getRelatedStyleOyHref 通過後の一覧用 URL）。",
    },
    classification,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
