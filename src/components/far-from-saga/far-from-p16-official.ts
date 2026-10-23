// FAR FROM SAGA — the owner's OFFICIAL P14 / P16 setting (公式設定, 2026-10-23),
// read out of the verbatim text (far-from-p16-official-text.ts).
//
// Canon: 『P14 Standard』 is エクスプリームサーガ's acceleration mechanism,
// 『P14 Extreme Tuning』 is レクソナンスサーガ's (specialised for 第五の犬),
// 『P16』 is ファーフロムサーガ's; the lineage is P14 Standard → P14 Extreme
// Tuning → P16. Everything here is a line of the owner's text, quoted whole
// (line() throws if a prefix stops matching). What belongs to the owner's
// message rather than the site is left out: the opening lines, the note's
// 「数値は今回提案する新しい設定値です。」 (ADAPTED) and the closing 「これなら…」
// line. The figures are the owner's table, P14 Standard = 100;
// the test checks every derived figure the owner states against it.
//
// Relative imports only (the test loads this file with the transpiler).
import { P16_OFFICIAL_TEXT } from "./far-from-p16-official-text";

const LINES = P16_OFFICIAL_TEXT.split("\n").filter((item) => item.trim());

/** The one line that starts with `prefix` (verbatim). */
function line(prefix: string): string {
  const found = LINES.filter((item) => item.startsWith(prefix));
  if (found.length !== 1) throw new Error(`Expected one line starting 「${prefix}」`);
  return found[0];
}

/** The lines after `from` up to (not including) the first line in `until`. */
function linesBetween(from: string, until: readonly string[]): string[] {
  const start = LINES.indexOf(line(from));
  const rest = LINES.slice(start + 1);
  const end = rest.findIndex((item) => until.some((stop) => item.startsWith(stop)));
  return end < 0 ? rest : rest.slice(0, end);
}

const cells = (row: string) => row.split("\t");

export type AccelUnitKey = "standard" | "tuning" | "p16";

export type AccelUnit = {
  key: AccelUnitKey;
  /** The mechanism's name as the owner writes it. */
  name: string;
  /** The form that carries it (katakana). */
  form: string;
  saga: string;
};

/** In the owner's order: P14 Standard → P14 Extreme Tuning → P16. */
export const ACCEL_UNITS: readonly AccelUnit[] = [
  { key: "standard", name: "P14 Standard", form: "エクスプリーム", saga: "エクスプリームサーガ" },
  { key: "tuning", name: "P14 Extreme Tuning", form: "レクソナンス", saga: "レクソナンスサーガ" },
  { key: "p16", name: "P16", form: "ファーフロム", saga: "ファーフロムサーガ" },
];

export const accelUnit = (key: AccelUnitKey): AccelUnit =>
  ACCEL_UNITS.find((unit) => unit.key === key) ?? ACCEL_UNITS[0];

/* ---------------------------------------------------------------------------
   The benchmark: 「P14 Standardを100とした暫定ベンチマーク」
   --------------------------------------------------------------------------- */

export type OfficialMetricKey = "accel" | "delay" | "phase" | "emp" | "heat";

export type OfficialMetric = {
  key: OfficialMetricKey;
  /** The owner's row label. */
  label: string;
  values: Record<AccelUnitKey, number>;
  /** 応答遅延・同期誤差・消費EMP・熱負荷 read lower = better (the owner's note). */
  lowerIsBetter: boolean;
  /** The verb the owner uses for P16's change (the 「次の性能改善」 list). */
  verb: "向上" | "短縮" | "削減";
};

export const P16_BENCHMARK_TITLE = line("P14 Standardを100とした暫定ベンチマーク");

const HEADER = cells(line("評価項目\t"));
if (HEADER.slice(1).join("|") !== ACCEL_UNITS.map((unit) => unit.name).join("|"))
  throw new Error(`Unexpected benchmark columns: ${HEADER.join(" / ")}`);

const METRIC_KEYS: Record<string, OfficialMetricKey> = {
  実効演算加速性能: "accel",
  優先処理の応答遅延: "delay",
  位相同期誤差: "phase",
  同一処理量の消費EMP: "emp",
  同一処理量の熱負荷: "heat",
};

/** 「* 実効演算加速性能：50%向上」: P16 against P14 Extreme Tuning, as listed. */
const STATED_VS_TUNING = linesBetween("この数値を採用した場合", ["P14 Standardとの比較では"]).map(
  (item) => {
    const match = item.match(/^\* (.+)：(\d+(?:\.\d+)?)%(向上|短縮|削減)$/);
    if (!match) throw new Error(`Unexpected improvement line 「${item}」`);
    return { label: match[1], figure: Number(match[2]), verb: match[3] as OfficialMetric["verb"] };
  },
);

export const P16_OFFICIAL_METRICS: readonly OfficialMetric[] = Object.entries(METRIC_KEYS).map(
  ([label, key], index) => {
    const row = cells(line(`${label}\t`));
    const [standard, tuning, p16] = row.slice(1).map(Number);
    const stated = STATED_VS_TUNING[index];
    if (!stated || stated.label !== label) throw new Error(`The improvement list moved at ${label}`);
    return {
      key,
      label,
      values: { standard, tuning, p16 },
      lowerIsBetter: key !== "accel",
      verb: stated.verb,
    };
  },
);

/** The owner's note, without its first sentence: 「数値は今回提案する新しい
 * 設定値です。」 belongs to the owner's message, not the site (ADAPTED). */
const NOTE_LINE = line("数値は今回提案する新しい設定値です。");
export const P16_BENCHMARK_NOTE = NOTE_LINE.replace("数値は今回提案する新しい設定値です。", "");

/** What the owner states P16 achieves, by base. */
export const P16_STATED = {
  /** P16 against P14 Extreme Tuning (the owner's list). */
  tuning: STATED_VS_TUNING.map(({ figure, verb }) => ({ figure, verb })),
  /** P16 against P14 Standard: 140% (2.4倍), then four reductions. */
  standard: (() => {
    const sentence = line("P14 Standardとの比較では");
    const figures = (sentence.match(/\d+(?:\.\d+)?(?=%)/g) ?? []).map(Number);
    const times = Number(sentence.match(/(\d+(?:\.\d+)?)倍/)?.[1]);
    return { sentence, figures, times };
  })(),
};

/** The owner's 「P14 Standardとの比較では…」 sentence, verbatim. */
export const P16_STANDARD_SENTENCE = P16_STATED.standard.sentence;

const round2 = (value: number) =>
  (Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;

/** P16 with `base` at 100%, in % (two decimals). */
export function p16Against(metric: OfficialMetric, base: AccelUnitKey): number {
  return round2((metric.values.p16 / metric.values[base]) * 100);
}

/** P16's change against `base`, in % (+50, −35, …; two decimals). */
export function p16ChangeAgainst(metric: OfficialMetric, base: AccelUnitKey): number {
  return round2((metric.values.p16 / metric.values[base] - 1) * 100);
}

/** 「+50%」 / 「−54.5%」: signed. */
export function signedPercent(change: number): string {
  return `${change > 0 ? "+" : "−"}${Math.abs(change)}%`;
}

/** P16 / P14 Standard for the throughput: 2.4 (倍). */
export function p16TimesStandard(metric: OfficialMetric): number {
  return round2(metric.values.p16 / metric.values.standard);
}

/* ---------------------------------------------------------------------------
   各世代の技術的な違い — the three descriptions, verbatim
   --------------------------------------------------------------------------- */

const DESCRIPTION_HEADINGS = [
  "『P14 Standard』— エクスプリームサーガ",
  "『P14 Extreme Tuning』— レクソナンスサーガ",
  "『P16』— ファーフロムサーガ",
] as const;

export const P16_GENERATIONS_TITLE = line("各世代の技術的な違い");

export const P16_DESCRIPTIONS: readonly {
  unit: AccelUnit;
  heading: string;
  paragraphs: readonly string[];
}[] = DESCRIPTION_HEADINGS.map((heading, index) => ({
  unit: ACCEL_UNITS[index],
  heading: line(heading),
  paragraphs: linesBetween(heading, [...DESCRIPTION_HEADINGS, "主演算性能との関係"]),
}));

/** The owner's short reading of each unit (the opening lines), quoted. */
export const ACCEL_TAGLINES: Record<AccelUnitKey, string> = (() => {
  const source = line("単純な処理速度だけでなく");
  const quoted = (source.match(/「[^」]+」/g) ?? []).map((item) => item.slice(1, -1));
  const standard = line("第14世代の標準演算加速機構").match(/^(第14世代の標準演算加速機構)/)?.[1];
  if (quoted.length !== 2 || !standard) throw new Error("The unit readings moved");
  return { standard, tuning: quoted[0], p16: quoted[1] };
})();

/* ---------------------------------------------------------------------------
   主演算性能との関係 — paragraphs, the table and its caution, verbatim
   --------------------------------------------------------------------------- */

export const P16_MAIN_TITLE = line("主演算性能との関係");

const MAIN_LINES = linesBetween("主演算性能との関係", ["総合評価"]);
const MAIN_TABLE_AT = MAIN_LINES.findIndex((item) => item.startsWith("搭載形態\t"));

export const P16_MAIN = {
  /** Before the table. */
  lead: MAIN_LINES.slice(0, MAIN_TABLE_AT),
  table: {
    columns: cells(MAIN_LINES[MAIN_TABLE_AT]),
    rows: MAIN_LINES.slice(MAIN_TABLE_AT + 1, MAIN_TABLE_AT + 4).map(cells),
  },
  /** After the table; the last is the caution about YOPS × the index. */
  after: MAIN_LINES.slice(MAIN_TABLE_AT + 4),
};
if (P16_MAIN.table.rows.some((row) => row.length !== 3))
  throw new Error("主演算性能との関係's table moved");

/* ---------------------------------------------------------------------------
   総合評価 — verbatim. The owner's closing line 「これならP14 Extreme Tuningを
   単なる旧式として扱うことなく、…という技術的な系譜になります。」 speaks about
   the proposal itself, so the site leaves it out.
   --------------------------------------------------------------------------- */

export const P16_SUMMARY_TITLE = line("総合評価");
export const P16_SUMMARY: readonly string[] = linesBetween("総合評価", ["これならP14 Extreme Tuning"]);
