import { describe, expect, it } from "vitest";
import {
  composeFallbackNameJaBrandCategory,
  explainUnsafeNameJa,
  fallbackNameJaFromRawName,
  isUnsafeNameJa,
} from "./nameJaQuality";

describe("isUnsafeNameJa", () => {
  it("flags goodsNo embedded in title", () => {
    expect(isUnsafeNameJa("メノキンA000000234422", { brand: "メノキン" })).toBe(true);
  });

  it("allows normal Japanese product names", () => {
    expect(
      isUnsafeNameJa("メディヒール N.M.F アクアアンプルマスク EX", { brand: "MEDIHEAL" })
    ).toBe(false);
  });

  it("flags Unknown substring", () => {
    expect(isUnsafeNameJa("foo Unknown bar", { brand: "X" })).toBe(true);
  });

  it("flags forbidden 商品 / 製品 / 美容ケア / 化粧品", () => {
    expect(isUnsafeNameJa("美容ケアセット", { brand: "X" })).toBe(true);
    expect(isUnsafeNameJa("韓国化粧品", { brand: "X" })).toBe(true);
    expect(isUnsafeNameJa("foo製品", { brand: "X" })).toBe(true);
  });

  it("flags standalone generic category only", () => {
    expect(isUnsafeNameJa("セラム", { brand: "X" })).toBe(true);
    expect(isUnsafeNameJa("  クリーム  ", { brand: "X" })).toBe(true);
    expect(isUnsafeNameJa("マスク", { brand: "X" })).toBe(true);
  });

  it("allows brand + category phrase", () => {
    expect(isUnsafeNameJa("トリデン セラム", { brand: "TORRIDEN" })).toBe(false);
  });

  it("allows brand-only titles when long enough (no brand_only rule)", () => {
    expect(isUnsafeNameJa("COSRX", { brand: "COSRX" })).toBe(false);
  });

  it("flags empty after trim", () => {
    expect(isUnsafeNameJa("   ")).toBe(true);
  });

  it("flags pending placeholder", () => {
    expect(isUnsafeNameJa("商品名準備中")).toBe(true);
  });

  it("flags too short", () => {
    expect(isUnsafeNameJa("リップ", { brand: "ブランド" })).toBe(true);
  });
});

describe("explainUnsafeNameJa", () => {
  it("returns reasons for NG cases", () => {
    expect(explainUnsafeNameJa("")).toBe("empty");
    expect(explainUnsafeNameJa("商品名準備中")).toBe("pending_placeholder");
    expect(explainUnsafeNameJa("xA0000000000")).toBe("contains_goods_no");
    expect(explainUnsafeNameJa("ab")).toBe("too_short");
    expect(explainUnsafeNameJa("x unknown y")).toBe("unknown_token");
    expect(explainUnsafeNameJa("foo製品")).toBe("forbidden_word");
    expect(explainUnsafeNameJa("セラム")).toBe("weak_generic_only");
  });

  it("returns null for safe strings", () => {
    expect(explainUnsafeNameJa("セラム 50ml")).toBe(null);
  });
});

describe("composeFallbackNameJaBrandCategory", () => {
  it("combines brand and inferred category", () => {
    expect(
      composeFallbackNameJaBrandCategory("romand", "ロムアンド", "쥬시 래스팅 틴트")
    ).toBe("ロムアンド ティント");
  });

  it("returns empty when category unknown (no brand-only)", () => {
    expect(composeFallbackNameJaBrandCategory("XBrand", undefined, "zzz unknown korean zzz")).toBe("");
  });

  it("returns empty when brand missing", () => {
    expect(composeFallbackNameJaBrandCategory("", undefined, "크림")).toBe("");
  });
});

describe("fallbackNameJaFromRawName", () => {
  it("strips goodsNo-like tokens and symbols", () => {
    expect(fallbackNameJaFromRawName("A00000001234 テスト★化粧!!")).toBe("テスト 化粧");
  });
});
