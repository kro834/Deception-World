// FAR FROM SAGA — #p16 data (owner's comparison text, 2026-10-22).
//
// Everything the chapter prints about P16 is a sentence of the owner's two
// 【P16・第16世代演算加速機構】 chapters, quoted whole (sentence() throws if a
// fragment stops matching), and its figures are the ones those sentences
// state: the provisional benchmark against P14 (+50%, −35%, −40%, −27%), and
// against Vinculum's P2 (約3倍, 暫定). Extreme carries P14 too (owner, 2026-10-23:
// 『P14（Extreme tuning）』); its figures against P16 are a 設定案 the owner
// asked for (P16_VS_EXTREME), not the owner's text.
// The test checks each figure against the sentence it comes from and against
// the 暫定評価 table.
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

/** P14 = 100 → P16, the four provisional items. */
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
const P14_BENCHMARK_2 = sentence(PART2, "P14比で対象処理の実効スループットが50%向上");

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

/** Extreme's accelerator, as the Extreme special site names it. */
export const EXTREME_P14_NAME = "P14（Extreme tuning）";

export type ExtremeP14Metric = {
  key: P16Metric["key"];
  label: string;
  /** Extreme's P14 (Extreme tuning), Rexonance's P14 = 100. */
  extreme: number;
  /** P16, Rexonance's P14 = 100 (100 + the owner's P16_METRICS figure). */
  p16: number;
  lowerIsBetter: boolean;
  verb: P16Metric["verb"];
};

/* Against Extreme's P14 (Extreme tuning): a 暫定ベンチマーク／設定案.
   Owner (2026-10-23): 「P14との性能差は想像して生成してみて」. The figures are
   invented, on the owner's P14 scale (Rexonance's P14 = 100), and tied to the
   owner's 暫定評価 table: throughput follows 選択処理の実効加速性能 (Extreme
   80, FAR FROM 150) and heat follows 同一処理量当たりの熱負荷 (Extreme 130,
   FAR FROM 73); the wait and the phase error are new. P16's column is the
   owner's P14 benchmark (+50% / −35% / −40% / −27%). The test checks every
   derived percentage. */
export const P16_VS_EXTREME = {
  name: EXTREME_P14_NAME,
  /** The owner's 『P14（Extreme tuning）』 sentence (part 2). */
  source: sentence(PART2, "『P14（Extreme tuning）』"),
  metrics: [
    {
      key: "throughput",
      label: "対象処理の実効スループット",
      extreme: 80,
      p16: 150,
      lowerIsBetter: false,
      verb: "向上",
    },
    {
      key: "wait",
      label: "優先処理の待機時間",
      extreme: 125,
      p16: 65,
      lowerIsBetter: true,
      verb: "短縮",
    },
    {
      key: "phase",
      label: "位相同期誤差",
      extreme: 120,
      p16: 60,
      lowerIsBetter: true,
      verb: "減少",
    },
    {
      key: "heat",
      label: "同一処理量当たりの熱負荷",
      extreme: 130,
      p16: 73,
      lowerIsBetter: true,
      verb: "削減",
    },
  ] as readonly ExtremeP14Metric[],
  /** Extreme only: the short-burst peak, Rexonance's P14 = 100. */
  burst: { label: "瞬間最大加速（短時間）", extreme: 115 },
  /** The 設定案's explanation (written for the owner to review, not the owner's text). */
  text: [
    "エクスプリームの『P14（Extreme tuning）』は、レクソナンスのP14と同じ第14世代の機構を、勝利経路の生成と結果固定へ最適化した仕様である。",
    "短時間の瞬間最大加速はレクソナンスのP14比115%に達するが、加速対象を絞り込まずに高負荷運転を続け、結果固定の照合を優先するため、実効スループットは80%、優先処理の待機時間は125%、位相同期誤差は120%、同一処理量当たりの熱負荷は130%となる。",
    "P16は各処理の依存関係と実行期限から加速対象を選別し、必要な処理だけを優先的に完了させるため、P14（Extreme tuning）比で実効スループットが87.5%向上、待機時間が48%短縮、位相同期誤差が50%減少し、熱負荷は約43.85%削減される。",
  ] as readonly string[],
  note: "この比較は、同条件ベンチマーク・暫定評価の指数に合わせて作成した設定案であり、確定スペックではない。",
};

const round2 = (value: number) =>
  (Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;
/** 「約」 when rounding to two decimals changed the value. */
const approx = (exact: number) => (Math.abs(exact - round2(exact)) > 1e-9 ? "約" : "");

/** P16 with Extreme's P14 at 100%, in % (two decimals: 187.5, 52, 50, 56.15). */
export function p16AgainstExtreme(metric: ExtremeP14Metric): number {
  return round2((metric.p16 / metric.extreme) * 100);
}

/** P16's change against Extreme's P14, in % (+87.5, −48, −50, −43.85). */
export function p16ChangeAgainstExtreme(metric: ExtremeP14Metric): number {
  return round2((metric.p16 / metric.extreme) * 100 - 100);
}

/** 「187.5%」 / 「約56.15%」: P16 with Extreme's P14 at 100%. */
export function p16AgainstExtremeText(metric: ExtremeP14Metric): string {
  return `${approx((metric.p16 / metric.extreme) * 100)}${p16AgainstExtreme(metric)}%`;
}

/** 「+87.5% 向上」 / 「48% 短縮」 / 「約43.85% 削減」. */
export function p16ChangeAgainstExtremeText(metric: ExtremeP14Metric): string {
  const change = p16ChangeAgainstExtreme(metric);
  const mark = approx((metric.p16 / metric.extreme) * 100 - 100);
  return metric.lowerIsBetter
    ? `${mark}${Math.abs(change)}% ${metric.verb}`
    : `${mark}+${change}% ${metric.verb}`;
}

/** The chapter's remaining sentences, grouped by what they describe. */
export const P16_TOPICS: readonly {
  key: string;
  title: string;
  body: readonly string[];
}[] = [
  {
    key: "priority",
    title: "処理の優先制御",
    body: [paragraphsOf(PART1)[1], paragraphsOf(PART2)[2]],
  },
  {
    key: "sync",
    title: "神経同期と攻撃制御",
    body: [paragraphsOf(PART1)[3]],
  },
  {
    key: "bit",
    title: "FARFROM BITとの分散処理",
    body: [paragraphsOf(PART1)[4]],
  },
  {
    key: "heat",
    title: "熱管理",
    body: [paragraphsOf(PART1)[5]],
  },
];

/** The heat note and the ULTRA 60-second note (part 1's last paragraph). */
export const P16_HEAT_NOTE: string = paragraphsOf(PART1)[6];

/** P2 → P14 → P16, as part 2 tells it; Extreme carries P14 too (Extreme tuning). */
export const P16_LINEAGE = {
  text: paragraphsOf(PART2)[1],
  steps: [
    { unit: "P2", form: "ヴィンクルム" },
    { unit: "P14", form: "エクスプリーム／レクソナンス" },
    { unit: "P16", form: "ファーフロム" },
  ],
} as const;
