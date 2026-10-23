// FAR FROM SAGA — #p16 data (owner's comparison text, 2026-10-22, and the
// owner's OFFICIAL P14 / P16 setting, 2026-10-23).
//
// The chapter prints two owner sources. The two 【P16・第16世代演算加速機構】
// chapters of the comparison text, quoted whole (sentence() throws if a
// fragment stops matching), with the figures they state: against P14 Extreme
// Tuning (+50%, −35%, −40%, −27%) and Vinculum's P2 (約3倍, 暫定). And the
// 公式設定 (far-from-p16-official.ts): P14 Standard (エクスプリーム) → P14
// Extreme Tuning (レクソナンス) → P16 (ファーフロム), its 暫定ベンチマーク with
// P14 Standard = 100, the three descriptions, 主演算性能との関係 and 総合評価.
// The test checks each figure against the sentence it comes from and the tables.
//
// Relative imports only (the test loads this file with the transpiler).
import { reportChapter, sentence, paragraphsOf } from "./far-from-report-data";

const PART1 = reportChapter("report-rexonance", "P16・第16世代演算加速機構");
const PART2 = reportChapter("report-saga", "P16・第16世代演算加速機構");

/** Both chapters' paragraphs, in the owner's order (part 1, then part 2). */
export const P16_CHAPTERS = [PART1, PART2] as const;

export const P16_INTRO = {
  /** 『P16』は、レクソナンスサーガの『P14』を基礎として…高度化している。 */
  basis: sentence(PART1, "を基礎として開発された第16世代演算加速機構"),
  /** 『P16』は、…『P14』から二世代分の改良を施した…統合している。 */
  generations: sentence(PART2, "二世代分の改良"),
};

/** The functions the first sentence lists, in its order. */
export const P16_FUNCTIONS: readonly string[] = (() => {
  const list = P16_INTRO.basis.match(/であり、(.+)を高度化している。$/)?.[1];
  if (!list) throw new Error("P16's function list moved");
  return list.split("、");
})();

/** The comparison text's four items: P16 with Rexonance's P14 Extreme Tuning
 * = 100 (the same figures as the 公式設定's P14 Extreme Tuning比). */
export type P16Metric = {
  key: "throughput" | "wait" | "phase" | "heat";
  label: string;
  /** The owner's figure, in %: + is a gain, − a reduction. */
  change: number;
  /** The verb the owner uses for it. */
  verb: "向上" | "短縮" | "減少" | "削減";
  /** Lower reads better (time, error, load). */
  lowerIsBetter: boolean;
  /** The sentences that state it (part 1, part 2). */
  sources: readonly string[];
};

const P14_BENCHMARK_1 = sentence(PART1, "P14比150%");
const P14_BENCHMARK_1B = sentence(PART1, "位相同期誤差は40%減少");
const P14_HEAT_1 = sentence(PART1, "P14比で27%削減");
const P14_BENCHMARK_2 = sentence(PART2, "P14 Extreme Tuning比で対象処理の実効スループットが50%向上");

export const P16_METRICS: readonly P16Metric[] = [
  {
    key: "throughput",
    label: "対象処理の実効スループット",
    change: 50,
    verb: "向上",
    lowerIsBetter: false,
    sources: [P14_BENCHMARK_1, P14_BENCHMARK_2],
  },
  {
    key: "wait",
    label: "優先処理の待機時間",
    change: -35,
    verb: "短縮",
    lowerIsBetter: true,
    sources: [P14_BENCHMARK_1B, P14_BENCHMARK_2],
  },
  {
    key: "phase",
    label: "位相同期誤差",
    change: -40,
    verb: "減少",
    lowerIsBetter: true,
    sources: [P14_BENCHMARK_1B, P14_BENCHMARK_2],
  },
  {
    key: "heat",
    label: "同一処理量当たりの熱負荷",
    change: -27,
    verb: "削減",
    lowerIsBetter: true,
    sources: [P14_HEAT_1, P14_BENCHMARK_2],
  },
];

/** The owner's caveats on those four figures, verbatim. */
export const P16_CAVEATS: readonly string[] = [
  sentence(PART2, "これらは独立した評価項目であり"),
  sentence(PART1, "主演算性能の20%向上と単純に加算するものではない"),
];

/** Against Vinculum's P2: the one stated figure, provisional. */
export const P16_VS_P2 = {
  label: "同一条件の加速処理能力",
  value: "約3倍",
  multiplier: 3,
  source: sentence(PART2, "暫定的に約3倍"),
};

/** Part 2's sentence naming Extreme's 『P14 Standard』 (the base of the 公式設定). */
export const P16_VS_STANDARD_SOURCE = sentence(PART2, "『P14 Standard』");

/** The chapter's remaining sentences, grouped by what they describe. */
export const P16_TOPICS: readonly {
  key: string;
  title: string;
  code: string;
  body: readonly string[];
}[] = [
  {
    key: "priority",
    title: "処理の優先制御",
    code: "PRIORITY",
    body: [paragraphsOf(PART1)[1], paragraphsOf(PART2)[2]],
  },
  {
    key: "sync",
    title: "神経同期と攻撃制御",
    code: "SYNC",
    body: [paragraphsOf(PART1)[3]],
  },
  {
    key: "bit",
    title: "FARFROM BITとの分散処理",
    code: "DISTRIBUTED",
    body: [paragraphsOf(PART1)[4]],
  },
  {
    key: "heat",
    title: "熱管理",
    code: "THERMAL",
    body: [paragraphsOf(PART1)[5]],
  },
];

/** The heat note and the ULTRA 60-second note (part 1's last paragraph). */
export const P16_HEAT_NOTE: string = paragraphsOf(PART1)[6];

/** P2 → P14 Standard → P14 Extreme Tuning → P16, the forms that carry them
 * (公式設定), with part 2's lineage paragraph. */
export const P16_LINEAGE = {
  text: paragraphsOf(PART2)[1],
  steps: [
    { key: "p2", unit: "P2", form: "ヴィンクルム" },
    { key: "standard", unit: "P14 Standard", form: "エクスプリーム" },
    { key: "tuning", unit: "P14 Extreme Tuning", form: "レクソナンス" },
    { key: "p16", unit: "P16", form: "ファーフロム" },
  ],
} as const;
