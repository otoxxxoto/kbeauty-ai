import { describe, expect, it } from "vitest";
import {
  evaluateLowQualityNameJa,
  evaluateProductIdentifiability,
  enrichmentBucketForImageMissing,
} from "./oliveyoungProductIdentifiability";

describe("evaluateProductIdentifiability", () => {
  it("rejects ブランド + goodsNo 形式の仮タイトル", () => {
    const r = evaluateProductIdentifiability({
      goodsNo: "A000000234422",
      nameJa: "メノキン A000000234422",
      name: "",
      brand: "SomeBrand",
    });
    expect(r.identifiable).toBe(false);
    expect(r.reasons.some((x) => x.includes("goodsNo"))).toBe(true);
  });

  it("accepts 普通の日本語商品名", () => {
    const r = evaluateProductIdentifiability({
      goodsNo: "A000000234422",
      nameJa: "ティーツリーカーミングハイドロゲルマスク 10枚",
      brand: "メディヒール",
    });
    expect(r.identifiable).toBe(true);
  });

  it("B2 then enrichment bucket", () => {
    const r = evaluateProductIdentifiability({
      goodsNo: "A000000234422",
      nameJa: "メノキン A000000234422",
    });
    expect(enrichmentBucketForImageMissing(r.identifiable)).toBe("B2");
  });
});

describe("evaluateLowQualityNameJa", () => {
  it("flags goodsNo inside nameJa", () => {
    const issues = evaluateLowQualityNameJa({
      goodsNo: "A000000234422",
      nameJa: "メノキン A000000234422",
    });
    expect(issues.some((x) => x.includes("goodsNo"))).toBe(true);
  });
});
