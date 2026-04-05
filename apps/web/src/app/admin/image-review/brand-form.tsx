"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ManualBrandForm({
  goodsNo,
  displayBrand,
  initialManualBrand,
}: {
  goodsNo: string;
  displayBrand: string;
  initialManualBrand: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialManualBrand);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/brand-name/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goodsNo, manualBrandJa: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        updatedCount?: number;
        matchedBy?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(
          data.error === "manualBrandJa is required"
            ? "ブランド名を入力してください"
            : data.error === "source_has_no_brand_or_brandJa"
              ? "元商品に brand / brandJa がありません"
              : data.error === "product_not_found"
                ? "商品が見つかりません"
                : "保存に失敗しました"
        );
        return;
      }
      const n =
        typeof data.updatedCount === "number" ? data.updatedCount : 0;
      const by = data.matchedBy ?? "";
      const byLabel =
        by === "brand_or_brandJa"
          ? "brand または brandJa の一致"
          : by === "brand"
            ? "brand の一致"
            : by === "brandJa"
              ? "brandJa の一致"
              : by;
      window.alert(
        `ブランド名を ${n} 件の商品に反映しました。\n（${byLabel}）`
      );
      router.refresh();
    } catch (e) {
      console.error(e);
      setError("保存中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2">
      <p className="text-[11px] text-zinc-500">
        表示中のブランド:{" "}
        <span className="font-medium text-zinc-700">
          {displayBrand.trim() || "（未設定）"}
        </span>
      </p>
      <label className="text-[11px] text-zinc-500">ブランド名（手動・一括反映）</label>
      <input
        type="text"
        className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        placeholder="同一 brand / brandJa の全商品へ保存"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center rounded bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? "保存中..." : "ブランド名を保存"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
