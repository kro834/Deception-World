import type { DreamGlossaryEntry } from "../components/dream-chapter/dream-chapter-data";
import type { DreamArchivePassage } from "../components/dream-chapter/dream-chapter-extra-data";
import {
  dreamRecordHighlight,
  dreamRecordSearchTerms,
  normalizeDreamRecordSearch,
} from "./dream-record-index.ts";

// Ordinary readings support kana searches without adding story definitions.
// 夢主 has no supplied reading, so its spelling remains the canonical one.
const READINGS: Readonly<Record<string, string>> = {
  心の扉: "こころのとびら",
  超深層: "ちょうしんそう",
  破滅の魔の手: "はめつのまのて",
  仮面ライダー: "かめんらいだー",
  幻想郷: "げんそうきょう",
  博麗大結界: "はくれいだいけっかい",
};

export type DreamGlossarySearchEntry = {
  term: string;
  reading: string;
  href: string;
  number: number;
  passages: readonly string[];
  searchText: string;
};

/** The source order owns the existing fragment ids; never sort or number filtered results. */
export function buildDreamGlossarySearch(
  entries: readonly DreamGlossaryEntry[],
  supplements: Readonly<Partial<Record<string, DreamArchivePassage>>> = {},
): DreamGlossarySearchEntry[] {
  return entries.map((entry, index) => {
    const supplement = supplements[entry.term];
    const supplementText = supplement?.text
      ? [supplement.text]
      : (supplement?.segments ?? []).map((segment) => segment.text);
    const passages = [...entry.body, entry.said ?? "", ...supplementText].filter(Boolean);
    const reading = READINGS[entry.term] ?? "";
    return {
      term: entry.term,
      reading,
      href: `#dream-term-${index + 1}`,
      number: index + 1,
      passages,
      searchText: normalizeDreamRecordSearch(
        [
          entry.term,
          reading,
          ...passages,
          entry.by ?? "",
          supplement?.by ?? "",
          ...(supplement?.segments ?? []).map((segment) => segment.by ?? ""),
        ].join(" "),
      ),
    };
  });
}

export function filterDreamGlossarySearch(
  entries: readonly DreamGlossarySearchEntry[],
  query = "",
) {
  const terms = dreamRecordSearchTerms(query);
  return entries.filter((entry) => terms.every((term) => entry.searchText.includes(term)));
}

/** Show the source passage containing the match, preserving original spelling and Unicode. */
export function dreamGlossaryExcerpt(entry: DreamGlossarySearchEntry, query = "", limit = 112) {
  const terms = dreamRecordSearchTerms(query);
  const passage =
    entry.passages.find((text) => {
      const normalized = normalizeDreamRecordSearch(text);
      return terms.some((term) => normalized.includes(term));
    }) ??
    entry.passages[0] ??
    "";
  const text = passage.replace(/\s+/gu, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  const runs = dreamRecordHighlight(text, query);
  let matchStart = 0;
  for (const run of runs) {
    if (run.match) break;
    matchStart += Array.from(run.text).length;
  }
  if (!runs.some((run) => run.match)) matchStart = 0;
  const width = Math.max(1, limit - 2);
  const start = Math.min(Math.max(0, matchStart - 20), Math.max(0, characters.length - width));
  const end = Math.min(characters.length, start + width);
  return `${start ? "…" : ""}${characters.slice(start, end).join("")}${end < characters.length ? "…" : ""}`;
}

/** Focus accompanies native fragment navigation; it never owns scrolling or history. */
export function focusDreamGlossaryTerm(id: string, document: Document) {
  const target = document.getElementById(id);
  if (!target) return false;
  const previousTabIndex = target.getAttribute("tabindex");
  if (previousTabIndex === null) target.setAttribute("tabindex", "-1");
  const restore = () => {
    target.removeAttribute("data-dream-glossary-focused");
    if (previousTabIndex === null) target.removeAttribute("tabindex");
  };
  target.focus({ preventScroll: true });
  if (document.activeElement !== target) {
    restore();
    return false;
  }
  target.setAttribute("data-dream-glossary-focused", "true");
  target.addEventListener("blur", restore, { once: true });
  return true;
}
