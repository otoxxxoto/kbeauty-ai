/**
 * Amazon Product Advertising API 5.0（SearchItems）で候補を取得する AmazonImageProvider。
 * 署名は aws4（SigV4）。スクレイピングは行わない。
 *
 * 環境変数:
 * - PAAPI_ACCESS_KEY / PAAPI_SECRET_KEY / PAAPI_PARTNER_TAG（必須）
 * - PAAPI_HOST（既定: webservices.amazon.co.jp）
 * - PAAPI_REGION（既定: us-west-2。PA-API 署名で一般的に使われるリージョン）
 * - PAAPI_SEARCH_INDEX（既定: All）
 * - AMAZON_IMAGE_MATCH_MIN_SCORE（既定: 55、0–100）
 */

import aws4 from "aws4";
import type { Request } from "aws4";
import type {
  AmazonImageMatchResult,
  AmazonImageProvider,
  AmazonProductMatchQuery,
} from "@/lib/amazon-image-provider";
import {
  extractVolumeHintFromProductName,
  scoreAmazonTitleMatch,
} from "@/lib/amazon-match-score";

const PAAPI_PATH = "/paapi5/searchitems";
const PAAPI_TARGET =
  "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";

export type PaApi5AmazonImageProviderConfig = {
  accessKey: string;
  secretKey: string;
  partnerTag: string;
  host?: string;
  region?: string;
  /** SearchItems の SearchIndex */
  searchIndex?: string;
  /** これ未満のスコアは matchProduct は null */
  minAdoptScore?: number;
  /** Keywords 最大長（PA-API 制限に合わせる） */
  maxKeywordsLength?: number;
};

type PaapiItem = {
  ASIN?: string;
  DetailPageURL?: string;
  Images?: {
    Primary?: {
      Large?: { URL?: string };
      Medium?: { URL?: string };
      Small?: { URL?: string };
    };
  };
  ItemInfo?: { Title?: { DisplayValue?: string } };
};

type PaapiSearchResponse = {
  SearchResult?: { Items?: PaapiItem[] };
  Errors?: Array<{ Code?: string; Message?: string }>;
};

function pickImageUrl(item: PaapiItem): string {
  const p = item.Images?.Primary;
  const u =
    p?.Large?.URL ?? p?.Medium?.URL ?? p?.Small?.URL ?? "";
  return (u ?? "").trim();
}

function buildKeywords(q: AmazonProductMatchQuery, maxLen: number): string {
  const brand = (q.brand ?? "").trim();
  const name = (q.name ?? "").trim();
  const vol = (q.volumeText ?? "").trim();
  const parts = [brand, name, vol].filter(Boolean);
  let s = parts.join(" ").replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

export class PaApi5AmazonImageProvider implements AmazonImageProvider {
  private readonly cfg: Required<
    Pick<
      PaApi5AmazonImageProviderConfig,
      "accessKey" | "secretKey" | "partnerTag" | "host" | "region" | "searchIndex" | "minAdoptScore" | "maxKeywordsLength"
    >
  >;

  constructor(config: PaApi5AmazonImageProviderConfig) {
    this.cfg = {
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      partnerTag: config.partnerTag,
      host: config.host ?? "webservices.amazon.co.jp",
      region: config.region ?? "us-west-2",
      searchIndex: config.searchIndex ?? "All",
      minAdoptScore: config.minAdoptScore ?? 55,
      maxKeywordsLength: config.maxKeywordsLength ?? 400,
    };
  }

  async matchProduct(
    input: AmazonProductMatchQuery
  ): Promise<AmazonImageMatchResult | null> {
    const name = (input.name ?? "").trim();
    if (!name) return null;

    const volumeText =
      input.volumeText?.trim() ||
      extractVolumeHintFromProductName(name) ||
      undefined;

    const keywords = buildKeywords(
      { ...input, name, volumeText },
      this.cfg.maxKeywordsLength
    );
    if (!keywords) return null;

    const bodyObj = {
      Keywords: keywords,
      SearchIndex: this.cfg.searchIndex,
      PartnerTag: this.cfg.partnerTag,
      PartnerType: "Associates",
      Marketplace: "www.amazon.co.jp",
      ItemCount: 10,
      Resources: [
        "Images.Primary.Large",
        "Images.Primary.Medium",
        "Images.Primary.Small",
        "ItemInfo.Title",
      ],
    };

    const body = JSON.stringify(bodyObj);

    const opts: Request = {
      host: this.cfg.host,
      path: PAAPI_PATH,
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Content-Encoding": "amz-1.0",
        "X-Amz-Target": PAAPI_TARGET,
      },
      service: "ProductAdvertisingAPI",
      region: this.cfg.region,
    };

    aws4.sign(opts, {
      accessKeyId: this.cfg.accessKey,
      secretAccessKey: this.cfg.secretKey,
    });

    const url = `https://${this.cfg.host}${PAAPI_PATH}`;
    const res = await fetch(url, {
      method: "POST",
      headers: opts.headers as Record<string, string>,
      body,
    });

    const text = await res.text();
    let json: PaapiSearchResponse;
    try {
      json = JSON.parse(text) as PaapiSearchResponse;
    } catch {
      throw new Error(`PA-API 応答が JSON ではありません (HTTP ${res.status})`);
    }

    if (!res.ok) {
      const msg = json.Errors?.map((e) => e.Message).join("; ") || text.slice(0, 200);
      throw new Error(`PA-API HTTP ${res.status}: ${msg}`);
    }

    const items = json.SearchResult?.Items ?? [];
    if (items.length === 0) return null;

    const queryForScore = {
      name,
      brand: input.brand,
      volumeText,
    };

    let best: AmazonImageMatchResult | null = null;
    let bestScore = -1;

    for (const item of items) {
      const asin = (item.ASIN ?? "").trim();
      const title =
        item.ItemInfo?.Title?.DisplayValue?.trim() ?? "";
      const imageUrl = pickImageUrl(item);
      if (!asin || !title || !imageUrl) continue;

      const amazonMatchScore = scoreAmazonTitleMatch(queryForScore, title);
      if (amazonMatchScore > bestScore) {
        bestScore = amazonMatchScore;
        const amazonUrl =
          (item.DetailPageURL ?? "").trim() ||
          `https://www.amazon.co.jp/dp/${asin}`;
        best = {
          amazonAsin: asin,
          amazonUrl,
          amazonImageUrl: imageUrl,
          amazonTitle: title,
          amazonMatchScore,
        };
      }
    }

    if (!best || best.amazonMatchScore < this.cfg.minAdoptScore) {
      return null;
    }

    return best;
  }
}

/** 環境変数が揃っていれば PA-API プロバイダ、否则 null */
export function createPaApi5AmazonImageProviderFromEnv(): PaApi5AmazonImageProvider | null {
  const accessKey = process.env.PAAPI_ACCESS_KEY?.trim();
  const secretKey = process.env.PAAPI_SECRET_KEY?.trim();
  const partnerTag = process.env.PAAPI_PARTNER_TAG?.trim();
  if (!accessKey || !secretKey || !partnerTag) return null;

  const minRaw = process.env.AMAZON_IMAGE_MATCH_MIN_SCORE;
  const minAdoptScore =
    minRaw != null && minRaw !== ""
      ? Number(minRaw)
      : 55;

  return new PaApi5AmazonImageProvider({
    accessKey,
    secretKey,
    partnerTag,
    host: process.env.PAAPI_HOST?.trim(),
    region: process.env.PAAPI_REGION?.trim(),
    searchIndex: process.env.PAAPI_SEARCH_INDEX?.trim(),
    minAdoptScore: Number.isFinite(minAdoptScore) ? minAdoptScore : 55,
  });
}
