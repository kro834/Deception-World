// FAR FROM SAGA — the owner's comparison text, read into chapters (2026-10-22).
//
// FAR_FROM_REPORT_TEXT is the source of truth, kept verbatim. This module only
// splits it: two parts, each part's 【 】 chapters, each chapter's paragraphs,
// and the two tables of the second part (【基本性能比較】 and
// 【同条件ベンチマーク・暫定評価】), read cell by cell as the owner laid them out
// (a corner cell, four form names, then one label and four values per row,
// closed by its ※ note). Every non-empty line of the text lands in exactly one
// block; the test re-joins them and compares.
//
// Relative imports only: scripts/far-from-saga-special-site.test.mjs loads
// this file with the TypeScript transpiler.
import { FAR_FROM_REPORT_TEXT } from "./far-from-report-text";

export type ReportTableKey = "basic" | "benchmark";

export type ReportTable = {
  key: ReportTableKey;
  /** The chapter the table sits in, as the owner titled it. */
  title: string;
  /** The corner cell (項目 / 評価項目). */
  corner: string;
  /** The four form names, in the owner's order. */
  columns: readonly string[];
  rows: readonly { label: string; values: readonly string[] }[];
  /** The ※ line under the table, verbatim. */
  note: string;
};

export type ReportBlock = { kind: "p"; text: string } | { kind: "table"; table: ReportTableKey };

export type ReportChapter = {
  /** Anchor id: `${part id}-${two-digit index}`. */
  id: string;
  index: string;
  title: string;
  blocks: readonly ReportBlock[];
};

export type ReportPartId = "report-rexonance" | "report-saga";

export type ReportPart = {
  id: ReportPartId;
  /** The part's 【 】 title, without its brackets and padding. */
  title: string;
  /** The 《 》 line under the title, when there is one. */
  subtitle: string | null;
  /** Paragraphs between the title and the first chapter. */
  intro: readonly ReportBlock[];
  chapters: readonly ReportChapter[];
};

/** 【(full-width space)…(full-width space)】 → … */
const bracketTitle = (line: string): string | null =>
  line.match(/^【[\u3000 ]*(.+?)[\u3000 ]*】$/)?.[1] ?? null;

const PART_IDS: readonly ReportPartId[] = ["report-rexonance", "report-saga"];

/** The two part titles, the first line of each part. */
export const REPORT_PART_TITLES = [
  "対レクソナンスサーガ・性能比較及び効率改善",
  "仮面ライダーサーガ・究極形態性能比較及び技術進化",
] as const;

/** The corner cell that opens each table. */
const TABLE_CORNERS: Record<string, ReportTableKey> = { 項目: "basic", 評価項目: "benchmark" };

function parseReport(text: string) {
  const lines = text.split("\n");
  const parts: ReportPart[] = [];
  const tables: Partial<Record<ReportTableKey, ReportTable>> = {};
  let part: (ReportPart & { intro: ReportBlock[]; chapters: ReportChapter[] }) | null = null;
  let chapter: (ReportChapter & { blocks: ReportBlock[] }) | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const title = bracketTitle(line);
    if (title && (REPORT_PART_TITLES as readonly string[]).includes(title)) {
      part = {
        id: PART_IDS[parts.length],
        title,
        subtitle: null,
        intro: [],
        chapters: [],
      };
      parts.push(part);
      chapter = null;
      continue;
    }
    if (!part) throw new Error(`Text before the first part: ${line}`);
    if (!chapter && !part.intro.length && /^《.+》$/.test(line)) {
      part.subtitle = line;
      continue;
    }
    if (title) {
      chapter = {
        id: `${part.id}-${String(part.chapters.length + 1).padStart(2, "0")}`,
        index: String(part.chapters.length + 1).padStart(2, "0"),
        title,
        blocks: [],
      };
      part.chapters.push(chapter);
      continue;
    }
    const tableKey = TABLE_CORNERS[line];
    if (tableKey && chapter) {
      const columns = lines.slice(index + 1, index + 5);
      const rows: { label: string; values: string[] }[] = [];
      let cursor = index + 5;
      while (cursor < lines.length && !lines[cursor].startsWith("※")) {
        rows.push({ label: lines[cursor], values: lines.slice(cursor + 1, cursor + 5) });
        cursor += 5;
      }
      tables[tableKey] = {
        key: tableKey,
        title: chapter.title,
        corner: line,
        columns,
        rows,
        note: lines[cursor] ?? "",
      };
      chapter.blocks.push({ kind: "table", table: tableKey });
      index = cursor;
      continue;
    }
    (chapter ? chapter.blocks : part.intro).push({ kind: "p", text: line });
  }

  if (!tables.basic || !tables.benchmark) throw new Error("The report's two tables are missing");
  return { parts, tables: tables as Record<ReportTableKey, ReportTable> };
}

const REPORT = parseReport(FAR_FROM_REPORT_TEXT);

export const REPORT_PARTS: readonly ReportPart[] = REPORT.parts;
export const REPORT_TABLES: Readonly<Record<ReportTableKey, ReportTable>> = REPORT.tables;

/** The part's chapter with this title (the owner's wording). */
export function reportChapter(partId: ReportPartId, title: string): ReportChapter {
  const chapter = REPORT_PARTS.find((part) => part.id === partId)?.chapters.find(
    (item) => item.title === title,
  );
  if (!chapter) throw new Error(`No chapter 「${title}」 in ${partId}`);
  return chapter;
}

/** A chapter's paragraphs, in order. */
export const paragraphsOf = (chapter: ReportChapter): string[] =>
  chapter.blocks.flatMap((block) => (block.kind === "p" ? [block.text] : []));

/** Splits a paragraph into its sentences (each kept whole, 。 included). */
export const sentencesOf = (paragraph: string): string[] =>
  paragraph.match(/[^。]+。?/g)?.map((sentence) => sentence) ?? [paragraph];

/** The one sentence of a chapter that contains `fragment` (verbatim). */
export function sentence(chapter: ReportChapter, fragment: string): string {
  const found = paragraphsOf(chapter)
    .flatMap(sentencesOf)
    .find((item) => item.includes(fragment));
  if (!found) throw new Error(`No sentence with 「${fragment}」 in 「${chapter.title}」`);
  return found;
}
