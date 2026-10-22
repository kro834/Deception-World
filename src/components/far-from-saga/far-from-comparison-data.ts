// FAR FROM SAGA — `#performance` comparison and `#p16` data (2026-10-22).
//
// Three columns of published catalogue values: FAR FROM (the owner's
// 2026-10-22 record, FAR_FROM_SAGA.specs), REXONANCE (read out of the owner's
// profile text, REXONANCE_PROFILE_TEXT, so it can never drift from it) and
// EXTREME (its site's standard values; see the note by EXTREME_SPECS).
//
// Nothing here is a new value. The numeric metrics are parsed back out of
// those strings, and the only figures this module adds are ratios computed
// from two published numbers in the same unit. The owner's own comparison
// sentences are quoted verbatim in COMPARISON_CITATIONS.
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import { REXONANCE_PROFILE_TEXT } from "@/lib/rexonance-profile";

export type ComparisonColumnKey = "farFrom" | "rexonance" | "extreme";
export type ComparisonBaselineKey = Exclude<ComparisonColumnKey, "farFrom">;

export type ComparisonColumn = {
  key: ComparisonColumnKey;
  label: string;
  name: string;
  code: string;
  accent: string;
};

export type ComparisonRow = {
  label: string;
  values: Record<ComparisonColumnKey, string>;
};

export const COMPARISON_COLUMNS: readonly ComparisonColumn[] = [
  {
    key: "farFrom",
    label: "ファーフロム",
    name: "ファーフロムサーガ",
    code: "FAR FROM / MIDDLE",
    accent: "#7fe6ff",
  },
  {
    key: "rexonance",
    label: "レクソナンス",
    name: "レクソナンスサーガ",
    code: "REXONANCE / STANDARD",
    accent: "#ff9b6a",
  },
  {
    key: "extreme",
    label: "エクスプリーム",
    name: "エクスプリームサーガ",
    code: "EXTREME / MIDDLE",
    accent: "#ffcf72",
  },
];

export const COMPARISON_BASELINES: readonly ComparisonBaselineKey[] = ["rexonance", "extreme"];

export function comparisonColumn(key: ComparisonColumnKey): ComparisonColumn {
  return COMPARISON_COLUMNS.find((column) => column.key === key) ?? COMPARISON_COLUMNS[0];
}

/** A value missing from a published record. */
export const UNPUBLISHED = "—";

/** One `■label：value` line of the owner's Rexonance profile, with any
 * following 『…』 line(s) folded in (the profile breaks its 演算 lines). */
function rexonanceSpec(label: string): string {
  const match = REXONANCE_PROFILE_TEXT.match(
    new RegExp(`^■${label}[\\u3000 ]*：(.+)$((?:\\n[\\u3000 ]+『[^』]+』)*)`, "m"),
  );
  if (!match) return UNPUBLISHED;
  const extra = match[2]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("");
  return `${match[1].trim()}${extra}`;
}

function farFromSpec(label: string): string {
  return FAR_FROM_SAGA.specs.find((row) => row.dt === label)?.dd ?? UNPUBLISHED;
}

// Extreme's standard (ミドル) values as its own site publishes them
// (src/components/extreme-saga/extreme-saga.tsx, COMPARISONS[*].extremeSpecs,
// and the saga dossier's EXTREME stats in src/components/world/rider-page.tsx).
// Those live inside display strings there ("パンチ 205.6t〜 / キック 308.9t〜"),
// so they are restated here in catalogue form;
// scripts/far-from-saga-special-site.test.mjs fails if the two drift.
export const EXTREME_SPECS: Readonly<Record<string, string>> = {
  身長: "249.9cm",
  体重: "255.3kg",
  パンチ力: "205.6t〜",
  キック力: "308.9t〜",
  ジャンプ力: "1033.5m",
  走力: "0.002s／100m",
  主演算: "20000YOPS／∞Core『KHAOS Ultra』",
  副演算: "5000TOPS／300Core『KOSMOS Ultra』",
  "認識・制御": "『P14（Extreme tuning）』",
};

const ROW_LABELS = [
  "身長",
  "体重",
  "パンチ力",
  "キック力",
  "ジャンプ力",
  "走力",
  "飛行速度",
  "主演算",
  "副演算",
  "認識・制御",
  "統合OS",
  "EMP",
  "浮遊ユニット",
] as const;

type RowLabel = (typeof ROW_LABELS)[number];

/** The Rexonance profile names the same rows a little differently. */
const REXONANCE_LABELS: Partial<Record<RowLabel, string>> = {
  主演算: "演算",
  副演算: "演算2",
  統合OS: "戦闘OS",
};

function rexonanceValue(label: RowLabel): string {
  if (label === "認識・制御") {
    // The profile lists these under 演算2's continuation lines.
    const value = rexonanceSpec("演算2");
    const parts = value.match(/『[^』]+』/g) ?? [];
    return parts.length > 1 ? parts.slice(1).join("") : UNPUBLISHED;
  }
  if (label === "副演算") {
    const value = rexonanceSpec("演算2");
    const first = value.match(/『[^』]+』/)?.[0];
    return first ? value.slice(0, value.indexOf(first)) + first : value;
  }
  return rexonanceSpec(REXONANCE_LABELS[label] ?? label);
}

export const COMPARISON_ROWS: readonly ComparisonRow[] = ROW_LABELS.map((label) => ({
  label,
  values: {
    farFrom: farFromSpec(label),
    rexonance: rexonanceValue(label),
    extreme: EXTREME_SPECS[label] ?? UNPUBLISHED,
  },
}));

function row(label: RowLabel): ComparisonRow {
  return COMPARISON_ROWS.find((item) => item.label === label) ?? COMPARISON_ROWS[0];
}

/* ---------------------------------------------------------------------------
   Numeric metrics: the rows whose three values share one unit.
   --------------------------------------------------------------------------- */

export type MetricValue = {
  /** The published string, as written. */
  text: string;
  /** The number in it, or null when the record gives none. */
  value: number | null;
  /** The record writes 「〜」 after the number (a floor, not a fixed value). */
  floor: boolean;
};

export type NumericMetric = {
  key: string;
  label: string;
  unit: string;
  /** 走力 is a time: the smaller value is the faster one. */
  lowerIsBetter: boolean;
  values: Record<ComparisonColumnKey, MetricValue>;
};

/** Reads the leading number of a catalogue string ("405.5t", "50000〜YOPS"). */
export function parseMetric(text: string, unit: string): MetricValue {
  // The floor mark sits before the unit ("50000〜YOPS") or after it ("205.6t〜").
  const match = text.match(new RegExp(`^([\\d.]+)(〜)?${unit}(〜)?`));
  if (!match) return { text, value: null, floor: false };
  return { text, value: Number(match[1]), floor: Boolean(match[2] || match[3]) };
}

const NUMERIC_SOURCES: readonly {
  key: string;
  label: RowLabel;
  unit: string;
  lowerIsBetter?: boolean;
}[] = [
  { key: "punch", label: "パンチ力", unit: "t" },
  { key: "kick", label: "キック力", unit: "t" },
  { key: "jump", label: "ジャンプ力", unit: "m" },
  { key: "run", label: "走力", unit: "s", lowerIsBetter: true },
  { key: "main", label: "主演算", unit: "YOPS" },
  { key: "sub", label: "副演算", unit: "TOPS" },
];

export const NUMERIC_METRICS: readonly NumericMetric[] = NUMERIC_SOURCES.map((source) => {
  const values = row(source.label).values;
  return {
    key: source.key,
    label: source.label,
    unit: source.unit,
    lowerIsBetter: Boolean(source.lowerIsBetter),
    values: {
      farFrom: parseMetric(values.farFrom, source.unit),
      rexonance: parseMetric(values.rexonance, source.unit),
      extreme: parseMetric(values.extreme, source.unit),
    },
  };
});

/** The comparable part of a value: "60000YOPS／∞Core『KHAOS DeuX』" → "60000YOPS". */
export function metricFigure(value: MetricValue): string {
  return value.text.split("／")[0];
}

export type MetricRatio = {
  /** FAR FROM's figure against the baseline's (baseline = 100). For 走力
   * this is the speed ratio: baseline time ÷ FAR FROM time. */
  percent: number;
  multiplier: number;
  /** Bar lengths, the larger of the two at 100. */
  farFromBar: number;
  baselineBar: number;
  /** 走力 only: how much shorter FAR FROM's 100m time is, in %. */
  timeCut: number | null;
};

export function metricRatio(
  metric: NumericMetric,
  baseline: ComparisonBaselineKey,
): MetricRatio | null {
  const a = metric.values.farFrom.value;
  const b = metric.values[baseline].value;
  if (a === null || b === null || a <= 0 || b <= 0) return null;
  const multiplier = metric.lowerIsBetter ? b / a : a / b;
  const longer = Math.max(multiplier, 1);
  return {
    percent: multiplier * 100,
    multiplier,
    farFromBar: (multiplier / longer) * 100,
    baselineBar: (1 / longer) * 100,
    timeCut: metric.lowerIsBetter ? (1 - a / b) * 100 : null,
  };
}

const percentFormat = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const multiplierFormat = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatPercent = (value: number) => `${percentFormat.format(value)}%`;
export const formatMultiplier = (value: number) => `${multiplierFormat.format(value)}倍`;

/* ---------------------------------------------------------------------------
   Rows the console shows as text: no shared number, or a value that is not a
   number (可変, 測定不能, 無制限, ∞Core).
   --------------------------------------------------------------------------- */

export type TextRow = { label: string; values: Record<ComparisonColumnKey, string> };

/** "60000YOPS／∞Core『KHAOS DeuX』" → "∞Core『KHAOS DeuX』". */
function afterFigure(text: string): string {
  const index = text.indexOf("／");
  return index >= 0 ? text.slice(index + 1) : text;
}

export const TEXT_ROWS: readonly TextRow[] = [
  row("身長"),
  row("体重"),
  row("飛行速度"),
  {
    label: "主演算の構成",
    values: {
      farFrom: afterFigure(row("主演算").values.farFrom),
      rexonance: afterFigure(row("主演算").values.rexonance),
      extreme: afterFigure(row("主演算").values.extreme),
    },
  },
  {
    label: "副演算の構成",
    values: {
      farFrom: afterFigure(row("副演算").values.farFrom),
      rexonance: afterFigure(row("副演算").values.rexonance),
      extreme: afterFigure(row("副演算").values.extreme),
    },
  },
  row("認識・制御"),
  row("統合OS"),
  row("EMP"),
  row("浮遊ユニット"),
];

/** The owner's own comparison sentences (final-stage-data.ts), cited as
 * written. No other relation between the columns is asserted. */
export const COMPARISON_CITATIONS: readonly { source: string; text: string }[] = [
  {
    source: "概要",
    text: "ミドルの時点で、すでにレクソナンス・ハイを上回る実効戦闘性能を安定して発揮する。",
  },
  {
    source: "形態段階／ミドル",
    text: "これにより、レクソナンス・ウルトラ以上の実効性能を、高い継続性で維持する。",
  },
  {
    source: "必殺技／デウスシフト・ファー・グランドフィナーレ",
    text: "レクソナンスパークアーキテクチャの『デウスシフト』と比較して3倍の効率性を誇る必殺技が誕生した。",
  },
];

/* ---------------------------------------------------------------------------
   #p16 — only what the records state. P16's own specification has not been
   published; every slot for it is 準備中.
   --------------------------------------------------------------------------- */

/** The 認識・制御 line of each record, split into its 『…』 units. */
export const P16_LINEUP: readonly {
  key: ComparisonColumnKey;
  units: readonly string[];
  /** Where the record lists the line. */
  field: string;
}[] = [
  {
    key: "extreme",
    units: EXTREME_SPECS["認識・制御"].match(/『[^』]+』/g) ?? [],
    field: "スペック",
  },
  {
    key: "rexonance",
    units: row("認識・制御").values.rexonance.match(/『[^』]+』/g) ?? [],
    field: "スペック「演算2」",
  },
  {
    key: "farFrom",
    units: row("認識・制御").values.farFrom.match(/『[^』]+』/g) ?? [],
    field: "スペック「認識・制御」",
  },
];

/** P14 as the Rexonance profile describes it (its first sentence). */
export const P14_RECORD: string =
  REXONANCE_PROFILE_TEXT.match(/^『 P14 』\n\n([^。\n]+。)/m)?.[1] ?? UNPUBLISHED;

/** What SA-GA OS 6.1 does with recognition and control, in the record's own
 * words. Each quote is a substring of FAR_FROM_SAGA.os / .bits (tested). */
export const P16_OS_FLOW: readonly {
  step: string;
  title: string;
  quote: string;
  source: string;
  terms?: readonly string[];
}[] = [
  {
    step: "01",
    title: "観測",
    quote: "離れた位置からの観測は、接続時刻と変化速度を照らし合わせて統合される。",
    source: "ファーフロムビット",
  },
  {
    step: "02",
    title: "反映",
    quote:
      "ビットの観測と接続先の状態を、悠真自身の間合い感覚、重心把握、予備動作の識別、反射判断に直接反映させる。",
    source: "SA-GA OS 6.1",
    terms: ["間合い感覚", "重心把握", "予備動作の識別", "反射判断"],
  },
  {
    step: "03",
    title: "伝達",
    quote:
      "観測のすべてを脳へ流し込むのではなく、いまの判断に必要な変化だけを整理して伝える。これにより、従来の認識負荷と神経同期の無駄を軽減している。",
    source: "SA-GA OS 6.1",
  },
  {
    step: "04",
    title: "配分",
    quote: "十分な解が出ている部分では再推論を控え、敵の変化を検出した箇所へ探索を集中させる。",
    source: "SA-GA OS 6.1／FARFROM SCALER",
  },
];

/** P16's own specification: not yet published by the owner. */
export const P16_PENDING_SLOTS: readonly string[] = [
  "機構の正式名称と位置付け",
  "担当する処理",
  "主要指標",
  "P14との違い",
  "ビジュアル",
];
