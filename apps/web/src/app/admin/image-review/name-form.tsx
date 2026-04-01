"use client";

import { useState } from "react";

export function ManualNameForm({
  goodsNo,
  initialName,
}: {
  goodsNo: string;
  initialName: string;
}) {
  const [value, setValue] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/product-name/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goodsNo, manualNameJa: value }),
      });
      if (!res.ok) {
        setError("保存に失敗しました");
      } else {
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
      setError("保存中にエラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <label className="text-[11px] text-zinc-500">商品名（手動）</label>
      <input
        type="text"
        className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "保存中..." : "商品名を保存"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

