"use client";

import * as React from "react";

type Props = {
  text: string;
  /** 折りたたみ時の最大行数（Tailwind line-clamp） */
  collapsedLines?: 3 | 4 | 5;
  className?: string;
};

/**
 * 長文は最初だけ表示し「続きを読む」で展開。スクロールボックスは使わない。
 */
export function CollapsibleText({
  text,
  collapsedLines = 5,
  className = "",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const t = text.trim();
  const lineCount = t.split(/\n/).length;
  const longByChars = t.length > 220;
  const longByLines = lineCount > collapsedLines;
  const needsToggle = longByChars || longByLines;

  if (!t) return null;

  if (!needsToggle) {
    return <div className={`whitespace-pre-line break-words ${className}`}>{t}</div>;
  }

  const clampClass =
    collapsedLines === 3
      ? "line-clamp-3"
      : collapsedLines === 4
        ? "line-clamp-4"
        : "line-clamp-5";

  return (
    <div>
      <div
        className={`whitespace-pre-line break-words ${className} ${open ? "" : clampClass}`}
      >
        {t}
      </div>
      <button
        type="button"
        className="mt-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "閉じる" : "続きを読む"}
      </button>
    </div>
  );
}
