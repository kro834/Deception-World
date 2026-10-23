// FAR FROM SAGA — #performance data (owner's comparison text, 2026-10-22).
//
// One source: the owner's two tables in 【仮面ライダーサーガ・究極形態性能比較及び
// 技術進化】, read cell by cell from the verbatim text (far-from-report-data.ts):
//   - 【基本性能比較】: ヴィンクルム / エクスプリーム / レクソナンス / ファーフロム ×
//     パンチ力, キック力, ジャンプ力, 100m走力, 主演算, 副演算, 加速機構, 戦闘OS;
//   - 【同条件ベンチマーク・暫定評価】: the same four forms × eight provisional
//     indices, レクソナンス・ハイ = 100 (熱負荷 alone reads lower = better).
// Each table keeps its ※ note verbatim. Nothing here is a new value: the
// numbers are parsed back out of the owner's cells, and the only figures this
// module adds are ratios of two cells in the same row.
//
// Relative imports only (the test loads this file with the transpiler).
import { REPORT_TABLES, type ReportTable } from "./far-from-report-data";

export type FormKey = "vinculum" | "extreme" | "rexonance" | "farFrom";
export type BaselineKey = Exclude<FormKey, "farFrom">;

export type Form = {
  key: FormKey;
  /** The owner's column heading. */
  label: string;
  name: string;
  code: string;
  /** Chart mark colour (validated as a four-hue set on the page's surface). */
  accent: string;
};

/** In the owner's column order. */
export const FORM_KEYS: readonly FormKey[] = ["vinculum", "extreme", "rexonance", "farFrom"];

const FORM_META: Record<FormKey, Omit<Form, "key" | "label">> = {
  vinculum: { name: "ヴィンクルムサーガ", code: "VINCULUM", accent: "#8f6cff" },
  extreme: { name: "エクスプリームサーガ", code: "EXTREME", accent: "#bd8500" },
  rexonance: { name: "レクソナンスサーガ", code: "REXONANCE", accent: "#e85485" },
  farFrom: { name: "ファーフロムサーガ", code: "FAR FROM", accent: "#2a9fe0" },
};

function checkedColumns(table: ReportTable): readonly string[] {
  const expected = ["ヴィンクルム", "エクスプリーム", "レクソナンス", "ファーフロム"];
  if (table.columns.join("|") !== expected.join("|"))
    throw new Error(`Unexpected columns in 「${table.title}」: ${table.columns.join(" / ")}`);
  return table.columns;
}

const COLUMNS = checkedColumns(REPORT_TABLES.basic);
checkedColumns(REPORT_TABLES.benchmark);

export const FORMS: readonly Form[] = FORM_KEYS.map((key, index) => ({
  key,
  label: COLUMNS[index],
  ...FORM_META[key],
}));

export const BASELINES: readonly BaselineKey[] = ["vinculum", "extreme", "rexonance"];

export function form(key: FormKey): Form {
  return FORMS.find((item) => item.key === key) ?? FORMS[FORMS.length - 1];
}

/** A table row's four cells by form. */
const byForm = <T>(values: readonly T[]): Record<FormKey, T> =>
  Object.fromEntries(FORM_KEYS.map((key, index) => [key, values[index]])) as Record<FormKey, T>;

/* ---------------------------------------------------------------------------
   【基本性能比較】
   --------------------------------------------------------------------------- */

export const BASIC_TABLE = REPORT_TABLES.basic;
export const BENCHMARK_TABLE = REPORT_TABLES.benchmark;

export type CellValue = {
  /** The owner's cell, as written. */
  text: string;
  /** The cell without its 「（est.）」, for a view that prints 推定値 beside it. */
  figure: string;
  value: number;
  unit: string;
  /** The cell carries 「〜」, a lower bound (エクスプリームの打撃力 205.6t〜,
   * レクソナンス / ファーフロムの主演算 50000〜YOPS / 60000〜YOPS). Ratios use
   * the number as written. */
  floor: boolean;
  /** The cell ends in 「（est.）」 (ヴィンクルムの推定値). */
  estimate: boolean;
};

/** "205.6t〜" → 205.6, "t", floor; "60000〜YOPS" → 60000, "YOPS", floor;
 * "98.8t（est.）" → 98.8, "t", estimate. Throws on a cell that is not a figure. */
export function parseCell(text: string): CellValue {
  const match = text.match(/^([\d.]+)(〜)?(t|m|秒|YOPS|TOPS)(〜)?(（est\.）)?$/);
  if (!match) throw new Error(`Not a figure: ${text}`);
  return {
    text,
    figure: match[5] ? text.slice(0, -match[5].length) : text,
    value: Number(match[1]),
    unit: match[3],
    floor: Boolean(match[2] || match[4]),
    estimate: Boolean(match[5]),
  };
}

/** How a row reads: more is better, a time (less is faster), or a load (less is better). */
export type Reading = "higher" | "time" | "load";

export type BasicMetric = {
  key: string;
  label: string;
  reading: Reading;
  values: Record<FormKey, CellValue>;
};

const BASIC_KEYS: Record<string, string> = {
  パンチ力: "punch",
  キック力: "kick",
  ジャンプ力: "jump",
  "100m走力": "run",
  主演算: "main",
  副演算: "sub",
};

export const BASIC_METRICS: readonly BasicMetric[] = BASIC_TABLE.rows
  .filter((row) => row.label in BASIC_KEYS)
  .map((row) => ({
    key: BASIC_KEYS[row.label],
    label: row.label,
    reading: row.label === "100m走力" ? "time" : "higher",
    values: byForm(row.values.map(parseCell)),
  }));

/** Rows that are names, not figures (加速機構, 戦闘OS). */
export const BASIC_TEXT_ROWS: readonly { label: string; values: Record<FormKey, string> }[] =
  BASIC_TABLE.rows
    .filter((row) => !(row.label in BASIC_KEYS))
    .map((row) => ({ label: row.label, values: byForm(row.values) }));

/* ---------------------------------------------------------------------------
   【同条件ベンチマーク・暫定評価】 — レクソナンス・ハイ = 100
   --------------------------------------------------------------------------- */

export type BenchmarkRow = {
  label: string;
  reading: Exclude<Reading, "time">;
  values: Record<FormKey, number>;
};

/** The one index the owner's ※ note reads lower = better. */
export const HEAT_LOAD_LABEL = "同一処理量当たりの熱負荷";
if (!BENCHMARK_TABLE.note.startsWith("※熱負荷のみ数値が低いほど優秀。"))
  throw new Error("The benchmark note no longer names heat load as lower = better");

export const BENCHMARK_ROWS: readonly BenchmarkRow[] = BENCHMARK_TABLE.rows.map((row) => ({
  label: row.label,
  reading: row.label === HEAT_LOAD_LABEL ? "load" : "higher",
  values: byForm(
    row.values.map((value) => {
      if (!/^\d+$/.test(value)) throw new Error(`Not an index: ${value}`);
      return Number(value);
    }),
  ),
}));

/** The index the table is scaled to (レクソナンス・ハイ). */
export const BENCHMARK_BASE = 100;
/** The chart's full scale: the largest index, rounded up to a hundred. */
export const BENCHMARK_SCALE =
  Math.ceil(
    Math.max(...BENCHMARK_ROWS.flatMap((row) => FORM_KEYS.map((key) => row.values[key]))) / 100,
  ) * 100;

/* ---------------------------------------------------------------------------
   Ratios: FAR FROM's cell against a baseline's, in the same row.
   --------------------------------------------------------------------------- */

export type Ratio = {
  /** higher: FAR FROM ÷ baseline. time: the speed ratio, baseline ÷ FAR FROM.
   * load: FAR FROM ÷ baseline (below 1 is a reduction). */
  multiplier: number;
  /** (multiplier − 1) × 100: + is a gain, − a reduction. */
  change: number;
  /** time only: how much shorter FAR FROM's time is, in %. */
  timeCut: number | null;
};

export function ratio(farFrom: number, baseline: number, reading: Reading): Ratio {
  const multiplier = reading === "time" ? baseline / farFrom : farFrom / baseline;
  return {
    multiplier,
    change: (multiplier - 1) * 100,
    timeCut: reading === "time" ? (1 - farFrom / baseline) * 100 : null,
  };
}

/** Rounds half up at two decimals; the epsilon absorbs binary noise (54.375 → 54.38). */
export const round2 = (value: number): number =>
  (Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;

/** Two decimals, or a whole number when it is one; `approx` when rounding changed it. */
export function figure(value: number): { text: string; approx: boolean } {
  const rounded = round2(Math.abs(value));
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return { text, approx: Math.abs(Math.abs(value) - rounded) > 1e-9 };
}

const approx = (part: { approx: boolean }) => (part.approx ? "約" : "");

/** +310.43% / 約−54.38% / ±0% */
export function formatChange(change: number): string {
  if (round2(change) === 0) return "±0%";
  const part = figure(change);
  return `${approx(part)}${change > 0 ? "+" : "−"}${part.text}%`;
}

/** 4.10倍 → 約4.10倍 when rounded; 6倍 when whole. */
export function formatMultiplier(multiplier: number): string {
  const part = figure(multiplier);
  return `${approx(part)}${part.text}倍`;
}

/** 14.29% (no sign; the label says 短縮 / 削減). */
export function formatPercent(value: number): string {
  const part = figure(value);
  return `${approx(part)}${part.text}%`;
}
