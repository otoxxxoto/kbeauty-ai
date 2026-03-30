/**
 * `report-image-policy-stats -- --snapshot-json` の 2 ファイルを比較する。
 *
 *   pnpm compare-image-policy-snapshots before.json after.json
 */
import { readFileSync } from "fs";

type Snapshot = {
  runDate?: string;
  label?: string;
  top50?: Record<string, number>;
  top100?: Record<string, number>;
};

const KEYS = [
  "safe_person_free",
  "unsafe_person_possible",
  "mall_image",
  "fallback_no_image",
] as const;

function load(path: string): Snapshot {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Snapshot;
}

function main() {
  const aPath = process.argv[2];
  const bPath = process.argv[3];
  if (!aPath || !bPath) {
    console.error(
      "使い方: pnpm exec tsx scripts/compare-image-policy-snapshots.ts <before.json> <after.json>"
    );
    process.exit(1);
  }
  const A = load(aPath);
  const B = load(bPath);
  const labelA = A.label ?? aPath;
  const labelB = B.label ?? bPath;

  for (const scope of ["top50", "top100"] as const) {
    const x = A[scope];
    const y = B[scope];
    if (!x || !y) continue;
    console.log(`\n=== ${scope} ===`);
    console.log(
      `${"metric".padEnd(26)} ${labelA.slice(0, 24).padStart(24)} ${labelB.slice(0, 24).padStart(24)}  delta`
    );
    for (const k of KEYS) {
      const da = x[k] ?? 0;
      const db = y[k] ?? 0;
      const d = db - da;
      const ds = d >= 0 ? `+${d}` : String(d);
      console.log(
        `${k.padEnd(26)} ${String(da).padStart(24)} ${String(db).padStart(24)}  ${ds}`
      );
    }
  }
}

main();
