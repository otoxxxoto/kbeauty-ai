import { describe, expect, it } from "vitest";
import {
  evaluateNameJaSourceQuality,
  hasMeaningfulKoreanProductName,
  hasSafeRawProductName,
  hasTranslatableSourceForNameJa,
  looksLikeOnlyOliveYoungGoodsNoId,
} from "./nameJaSourceQuality";

describe("looksLikeOnlyOliveYoungGoodsNoId", () => {
  it("detects goodsNo-only title", () => {
    expect(looksLikeOnlyOliveYoungGoodsNoId("A00000001234")).toBe(true);
  });

  it("allows normal Korean name", () => {
    expect(looksLikeOnlyOliveYoungGoodsNoId("토리든 다이브인 세럼")).toBe(false);
  });
});

describe("hasTranslatableSourceForNameJa", () => {
  it("allows safe Korean raw name without brand", () => {
    expect(
      hasTranslatableSourceForNameJa({
        name: "토리든 다이브인 세럼 50ml",
        brand: "",
      })
    ).toBe(true);
  });

  it("blocks goodsNo-only name without brand and summaries", () => {
    expect(
      hasTranslatableSourceForNameJa({
        name: "A00000001234",
        brand: "TORRIDEN",
      })
    ).toBe(false);
  });

  it("allows brand + category from summary when raw is goodsNo-only", () => {
    expect(
      hasTranslatableSourceForNameJa({
        name: "A00000001234",
        brand: "TORRIDEN",
        summaryJa: "低刺激のセラムで保湿をサポートします。",
      })
    ).toBe(true);
  });

  it("blocks brand only when no category hint", () => {
    expect(
      hasTranslatableSourceForNameJa({
        name: "A00000001234",
        brand: "TORRIDEN",
      })
    ).toBe(false);
  });
});

describe("evaluateNameJaSourceQuality", () => {
  it("reports categoryFromSummaries", () => {
    const q = evaluateNameJaSourceQuality({
      name: "x",
      brand: "B",
      reviewSummaryJa: "人気のマスクです",
    });
    expect(q.categoryFromSummaries).toBe(true);
    expect(q.hasCategoryHint).toBe(true);
    expect(q.translatable).toBe(true);
  });
});

describe("hasMeaningfulKoreanProductName", () => {
  it("requires 3+ hangul", () => {
    expect(hasMeaningfulKoreanProductName("ab")).toBe(false);
    expect(hasMeaningfulKoreanProductName("토리든 세럼")).toBe(true);
  });
});

describe("hasSafeRawProductName", () => {
  it("false for goods id only", () => {
    expect(hasSafeRawProductName("A00000001234")).toBe(false);
  });
});
