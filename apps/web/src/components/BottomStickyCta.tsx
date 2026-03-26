"use client";

type Props = {
  hasPrice: boolean;
  targetId?: string;
};

/**
 * 下部固定CTA。外側は pointer-events-none で透明領域のクリックを奪わない。
 * 内側のみ pointer-events-auto。max-width で中央に寄せ、影を強めに。
 */
export function BottomStickyCta({
  hasPrice,
  targetId = "section-price-compare",
}: Props) {
  if (!hasPrice) return null;

  const handleClick = () => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-3 pt-2 pointer-events-none"
      aria-label="固定ショートカット"
    >
      <div className="pointer-events-auto w-full max-w-md rounded-xl border border-zinc-200/90 bg-white/95 shadow-xl shadow-zinc-900/25 backdrop-blur-md overflow-hidden">
        <button
          type="button"
          onClick={handleClick}
          className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-3.5 text-sm sm:text-base font-bold text-white hover:bg-emerald-700 transition-colors"
        >
          最安・在庫をチェック
        </button>
      </div>
    </div>
  );
}
