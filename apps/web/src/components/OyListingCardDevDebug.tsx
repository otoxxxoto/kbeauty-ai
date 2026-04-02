import type { OyListingCardDebug } from "@/lib/oliveyoung-rankings";

/** development のみ親から渡す想定。OY 一覧カードの URL 経路確認用 */
export function OyListingCardDevDebug({ d }: { d: OyListingCardDebug }) {
  return (
    <div className="mt-1.5 rounded border border-amber-300/80 bg-amber-50 px-1.5 py-1 font-mono text-[10px] leading-tight text-amber-950">
      <div className="font-semibold text-amber-900">OY debug</div>
      <div>goodsNo: {d.goodsNo}</div>
      <div>
        productUrl: {d.dbProductUrl ? "yes" : "no"}
        {" · "}
        pickedUrl: {d.dbPickedUrl ? "yes" : "no"}
        {" · "}
        oliveYoungUrl: {d.dbOliveYoungUrl ? "yes" : "no"}
      </div>
      <div>oyHref: {d.oyHref ? "yes" : "no"}</div>
    </div>
  );
}
