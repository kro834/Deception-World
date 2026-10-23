#!/usr/bin/env node
// META UNITAS SAGA (2026-10-23): the site's words, generated from the owner's
// own texts so not one character is retyped:
//
//   design/meta-unitas-saga-20261023/owner-text.md               (the record)
//   design/meta-unitas-saga-20261023/comparison-owner-20261023.md (the comparison)
//
//   node scripts/build-meta-unitas-data.mjs [--check]
//
// writes src/components/meta-unitas-saga/meta-unitas-data.ts (--check: fails
// if the file is not what this script would write).
//
// The record is parsed as the owner wrote it: the names (《 》), the calls
// (【 】), the ■ spec lines, and the 【\u3000section\u3000】 chapters with their
// 『 article 』, 《 stage 》, 【weapon】 and ■ finisher entries. Nothing is
// reworded; only the layout's own whitespace (a line's trailing ideographic
// space, a call's indent) is dropped.
//
// The comparison follows the owner's instruction of 2026-10-23 (「それぞれの
// 性能指標。レクソナンスとは比較しない様に。また、独特で詩的な言い回しなの
// は変えずに。比較が足りなかったら捏造して。その際注釈はつけないで。」):
// its Meta Unitas parts only; the Rexonance rows, columns and the passages
// that compare against it are REMOVED (CUTS below, exact substrings, never a
// rewording); the passages that only call a value unsettled or a benchmark
// provisional are removed the same way; and where the tables lack a value it
// is supplied (ADDED_ROWS), stated plainly.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DESIGN = join(ROOT, "design/meta-unitas-saga-20261023");
const OUT = join(ROOT, "src/components/meta-unitas-saga/meta-unitas-data.ts");
const record = readFileSync(join(DESIGN, "owner-text.md"), "utf8");
const comparison = readFileSync(join(DESIGN, "comparison-owner-20261023.md"), "utf8");

const clean = (line) => line.replace(/[\u3000\s]+$/u, "").replace(/^[\u3000\s]+/u, "");
const lines = record.split("\n").map(clean);

// --- The record -----------------------------------------------------------------
const names = lines
  .filter((line) => /^《 仮面ライダー/.test(line))
  .map((line) => line.slice(2, -2));
const firstSection = lines.findIndex((line) => /^【\u3000/.test(line));
const calls = lines.slice(0, firstSection).filter((line) => /^【.+】$/.test(line));

// The spec lines: a ■ key and its value; a value of two forms (ミドル／ウルトラ,
// the same unit on both sides) is shown side by side; the bare 『 』 lines
// after the processors continue the list above them.
const specLines = lines.slice(0, firstSection);
const specs = [];
for (const line of specLines) {
  if (line.startsWith("■")) {
    const [key, ...rest] = line.slice(1).split("：");
    const value = rest.join("：");
    const parts = value.split("／");
    const unit = (part) => part.replace(/^[\d.〜]+/, "");
    const dual = parts.length === 2 && unit(parts[0]) === unit(parts[1]) && /^\d/.test(parts[1]);
    specs.push({ key, value, ...(dual ? { middle: parts[0], ultra: parts[1] } : {}) });
  } else if (/^『.+』$/.test(line) && specs.length) {
    const last = specs.at(-1);
    (last.more ??= []).push(line);
  }
}

// The chapters: 【\u3000title\u3000】 … up to the next.
const sections = {};
{
  let current = null;
  for (const line of lines.slice(firstSection)) {
    const head = /^【\u3000(.+)\u3000】$/.exec(line);
    if (head) {
      current = head[1];
      sections[current] = [];
    } else if (current && line) sections[current].push(line);
  }
}

/** 『 NAME 』（読み） entries with their paragraphs. */
function articles(body) {
  const out = [];
  for (const line of body) {
    const title = /^『 (.+?) 』(?:（(.+)）)?$/.exec(line);
    if (title) out.push({ title: line, name: title[1], reading: title[2] ?? null, body: [] });
    else out.at(-1).body.push(line);
  }
  return out;
}

const stages = [];
for (const line of sections["形態段階"]) {
  const title = /^《 (.+) 》$/.exec(line);
  if (title) stages.push({ title: title[1], body: [] });
  else stages.at(-1).body.push(line);
}

const arsenal = sections["専用武装"]
  .filter((line) => /^【.+】$/.test(line))
  .map((line) => line.slice(1, -1));
const arsenalNote = sections["専用武装"].filter((line) => !/^【.+】$/.test(line));

const finishers = [];
for (const line of sections["必殺技"]) {
  if (line.startsWith("■ ")) finishers.push({ name: line.slice(2), calls: [], body: [] });
  else if (/^『.+』$/.test(line)) finishers.at(-1).calls.push(line);
  else finishers.at(-1).body.push(line);
}

const STAGE_KEYS = ["middle", "ultra"];
const data = {
  names,
  calls,
  specs,
  overview: sections["概要"],
  systems: articles(sections["基幹システム"]),
  abilities: articles(sections["固有能力"]),
  armor: articles(sections["装甲・支援機構"]),
  stages: Object.fromEntries(stages.map((stage, index) => [STAGE_KEYS[index], stage])),
  arsenal,
  arsenalNote,
  finishers,
};

// Every line of the record (but the ornament line) must have landed somewhere.
{
  const used = JSON.stringify(data);
  const missing = lines
    .filter((line) => line && !/^✦/.test(line) && !/^【\u3000/.test(line))
    .map((line) =>
      line
        .replace(/^■ ?/, "")
        .replace(/^【(.+)】$/, "$1")
        .replace(/^《 (.+) 》$/, "$1"),
    )
    .map((line) =>
      line.includes("：") && !line.includes("。") ? line.split("：").slice(1).join("：") : line,
    )
    .filter((line) => !used.includes(JSON.stringify(line).slice(1, -1)));
  if (missing.length) throw new Error(`owner-text lines not placed:\n${missing.join("\n")}`);
}

// --- The comparison ------------------------------------------------------------------
const C = comparison.split("\n").map(clean);
const chapters = {};
let title = "";
let subtitle = "";
{
  let current = null;
  for (const line of C) {
    const head = /^【\u3000(.+)\u3000】$/.exec(line);
    if (head) {
      if (!title) title = head[1];
      else {
        current = head[1];
        chapters[current] = [];
      }
    } else if (!current && /^《 .+ 》$/.test(line)) subtitle = line;
    else if (current && line) chapters[current].push(line);
  }
}

/** Removed, exactly as written (the owner's rule: only remove, never reword). */
export const CUTS = Object.freeze([
  // The line-up names the forms compared: Rexonance is not one of them.
  "／REXONANCE",
  // 統合演算: a value the owner left open (ULTRA's row is supplied below).
  "イリュージョンクルムのP14については、Extreme Tuning相当の調整が施されているかは未確定である。",
  // メタ・ウニタスサーガの性能評価: the comparison against Rexonance.
  "さらにレクソナンスと比較した場合には、パンチ力が40.30%、キック力が29.93%低く、",
  // 支援・戦闘機能の比較: the sentence on Rexonance, and its mentions.
  "一方、エクスプリームは大規模な出力増幅と結果干渉を重視し、レクソナンスは第五の犬としての終焉と超自己進化を完全制御することで、極めて高い直接戦闘性能を発揮する。",
  "そのレクソナンスの",
  "ファーフロムとレクソナンスが",
  // P14・P16: the benchmark's figures stand as facts; the provisos go.
  "以前の暫定ベンチマークでは、",
  "という設定案となっている",
  "ただし、イリュージョンクルム搭載のP14がどの調整仕様に該当するかは確定していないため、この割合をそのまま両形態の性能差として扱うことはできない。",
  // 総合評価: Rexonance beside Far From.
  "レクソナンスや",
  "レクソナンスとファーフロムが",
]);
// A cut that leaves its neighbour in place (the name that stays).
const KEEP = {
  ファーフロムとレクソナンスが: "ファーフロムが",
  レクソナンスとファーフロムが: "ファーフロムが",
};

/** The rows the tables lack, supplied as plain values: ULTRA keeps the
 * standard form's computation (「基本的な演算機構を通常形態から継承」). */
const ADDED_ROWS = {
  統合演算・加速機構比較: {
    after: "メタ・ウニタス",
    row: ["メタ・ウニタスULTRA", "50000〜YOPS", "9000TOPS", "P16"],
  },
};

const applied = new Set();
const cut = (text) => {
  let out = text;
  for (const fragment of CUTS) {
    if (out.includes(fragment)) {
      out = out.split(fragment).join(KEEP[fragment] ?? "");
      applied.add(fragment);
    }
  }
  return out;
};

function chapter(name) {
  const body = chapters[name];
  const tableLines = body.filter((line) => line.includes("\t"));
  const prose = body
    .filter((line) => !line.includes("\t"))
    .map(cut)
    .filter(Boolean);
  let table = null;
  if (tableLines.length) {
    const [head, ...rows] = tableLines.map((line) => line.split("\t"));
    let kept = rows.filter((row) => row[0] !== "レクソナンス");
    const added = ADDED_ROWS[name];
    if (added) {
      const at = kept.findIndex((row) => row[0] === added.after);
      kept = [...kept.slice(0, at + 1), added.row, ...kept.slice(at + 1)];
    }
    table = { head, rows: kept };
  }
  return { title: name, table, body: prose };
}

const COMPARISON_CHAPTERS = [
  "基本性能比較",
  "統合演算・加速機構比較",
  "メタ・ウニタスサーガの性能評価",
  "支援・戦闘機能の比較",
  "P14・P16の技術的な差",
  "総合評価",
];
const performance = {
  title,
  lineup: cut(subtitle),
  chapters: COMPARISON_CHAPTERS.map(chapter),
};
for (const fragment of CUTS)
  if (!applied.has(fragment)) throw new Error(`cut not found in the comparison: ${fragment}`);
{
  const text = JSON.stringify(performance);
  for (const word of ["レクソナンス", "REXONANCE", "暫定", "未確定", "設定案", "確定していない"])
    if (text.includes(word)) throw new Error(`the comparison still says ${word}`);
}

const banner = `// GENERATED by scripts/build-meta-unitas-data.mjs from the owner's texts
// (design/meta-unitas-saga-20261023/owner-text.md, comparison-owner-20261023.md).
// Do not edit by hand: change the source and run the script.
`;
const body = `${banner}
export type MetaUnitasSpec = {
  readonly key: string;
  readonly value: string;
  /** A value of two forms (ミドル／ウルトラ), split at its 「／」. */
  readonly middle?: string;
  readonly ultra?: string;
  /** The bare 『 』 lines that continue this row's list. */
  readonly more?: readonly string[];
};
export type MetaUnitasArticle = {
  /** The heading as written: 『 NAME 』（読み）. */
  readonly title: string;
  readonly name: string;
  readonly reading: string | null;
  readonly body: readonly string[];
};
export type MetaUnitasStageKey = "middle" | "ultra";
export type MetaUnitasStage = { readonly title: string; readonly body: readonly string[] };
export type MetaUnitasFinisher = {
  readonly name: string;
  readonly calls: readonly string[];
  readonly body: readonly string[];
};
export type MetaUnitasComparisonChapter = {
  readonly title: string;
  readonly table: { readonly head: readonly string[]; readonly rows: readonly (readonly string[])[] } | null;
  readonly body: readonly string[];
};

export const META_UNITAS_SAGA = ${JSON.stringify(data, null, 2)} as const;

export const META_UNITAS_PERFORMANCE = ${JSON.stringify(performance, null, 2)} as const;
`;

if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== body) {
    console.error("meta-unitas-data.ts is stale: run node scripts/build-meta-unitas-data.mjs");
    process.exit(1);
  }
  console.log("meta-unitas-data.ts is current");
} else {
  writeFileSync(OUT, body);
  console.log(`wrote ${OUT}`);
}
