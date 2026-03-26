import { describe, expect, it } from "vitest";
import { inferCategoryJaFromKoreanRawName, pickBrandDisplayLine } from "./nameJaCategoryFromRaw";

describe("inferCategoryJaFromKoreanRawName", () => {
  it("maps user examples", () => {
    expect(inferCategoryJaFromKoreanRawName("수분 크림")).toBe("クリーム");
    expect(inferCategoryJaFromKoreanRawName("비타 세럼")).toBe("セラム");
    expect(inferCategoryJaFromKoreanRawName("시트 마스크")).toBe("シートマスク");
    expect(inferCategoryJaFromKoreanRawName("쿠션 파데")).toBe("クッションファンデ");
    expect(inferCategoryJaFromKoreanRawName("쥬시 틴트")).toBe("ティント");
    expect(inferCategoryJaFromKoreanRawName("글로우 립")).toBe("リップ");
  });

  it("prefers 립틴트 over 립", () => {
    expect(inferCategoryJaFromKoreanRawName("워터 립틴트")).toBe("リップティント");
  });
});

describe("pickBrandDisplayLine", () => {
  it("prefers brandJa", () => {
    expect(pickBrandDisplayLine("ロムアンド", "romand")).toBe("ロムアンド");
  });

  it("falls back to brand", () => {
    expect(pickBrandDisplayLine(undefined, "TORRIDEN")).toBe("TORRIDEN");
  });
});
