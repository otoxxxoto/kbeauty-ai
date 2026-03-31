"use client";

import { useState } from "react";

export function UploadManualImageForm({ goodsNo }: { goodsNo: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("goodsNo", goodsNo);
      form.append("file", file);
      const res = await fetch("/api/admin/product-image/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setError("アップロードに失敗しました");
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
      setError("アップロード中にエラーが発生しました");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-blue-700 hover:underline">
        <span>{uploading ? "アップロード中..." : "画像をアップロード"}</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onChange}
          disabled={uploading}
        />
      </label>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

