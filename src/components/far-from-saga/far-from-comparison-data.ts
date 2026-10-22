// FAR FROM SAGA — `#performance` comparison scaffold (2026-10-22, 準備中).
//
// Three columns of published catalogue values: FAR FROM (the owner's
// 2026-10-22 record, FAR_FROM_SAGA.specs), REXONANCE (read out of the owner's
// profile text, REXONANCE_PROFILE_TEXT, so it can never drift from it) and
// EXTREME (its site's standard values; see the note by EXTREME_SPECS). The
// rows only place the numbers side by side. The two comparison claims this
// page cites are the owner's own sentences, quoted verbatim below; nothing is
// derived or multiplied here.
import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import { REXONANCE_PROFILE_TEXT } from "@/lib/rexonance-profile";

export type ComparisonColumnKey = "farFrom" | "rexonance" | "extreme";

export type ComparisonColumn = {
  key: ComparisonColumnKey;
  label: string;
  code: string;
  accent: string;
};

export type ComparisonRow = {
  label: string;
  values: Record<ComparisonColumnKey, string>;
};

export const COMPARISON_COLUMNS: readonly ComparisonColumn[] = [
  { key: "farFrom", label: "ファーフロム", code: "FAR FROM / MIDDLE", accent: "#7fe6ff" },
  { key: "rexonance", label: "レクソナンス", code: "REXONANCE / STANDARD", accent: "#ff9b6a" },
  { key: "extreme", label: "エクスプリーム", code: "EXTREME / MIDDLE", accent: "#ffcf72" },
];

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
// and the saga dossier's EXTREME stats). They are component-local there, so
// they are restated here rather than imported; keep the two in step.
const EXTREME_SPECS: Record<string, string> = {
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
] as const;

/** The Rexonance profile names the same rows a little differently. */
const REXONANCE_LABELS: Partial<Record<(typeof ROW_LABELS)[number], string>> = {
  主演算: "演算",
  副演算: "演算2",
  統合OS: "戦闘OS",
};

function rexonanceValue(label: (typeof ROW_LABELS)[number]): string {
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
