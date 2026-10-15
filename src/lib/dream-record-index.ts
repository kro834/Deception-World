import type { DreamChronicleEvent } from "@/components/dream-chapter/dream-chapter-extra-data";

type DreamRecordFilters = {
  query?: string;
  case?: string;
  person?: string;
  place?: string;
};

type DreamRecordLinksSource = {
  cases?: readonly { no: string }[];
  places?: readonly { name: string }[];
  people?: readonly { name: string; href: string }[];
};

const normalizeFilter = (value: string | undefined) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim();

const normalizePersonLinkKey = (value: string) => value.replace(/\s+/gu, "");

/** Search spelling only; displayed passages always retain the source wording. */
export const normalizeDreamRecordSearch = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("ja")
    .replace(/[\u30a1-\u30f6]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    );

export function dreamRecordSearchTerms(query = "") {
  return [...new Set(normalizeDreamRecordSearch(query).trim().split(/\s+/u).filter(Boolean))];
}

/** Offsets refer to original Unicode characters, including half-width voiced kana. */
function dreamRecordMatchRanges(text: string, query: string) {
  const characters = Array.from(text);
  const groups: { text: string; start: number; end: number }[] = [];
  characters.forEach((character, index) => {
    const previous = groups.at(-1);
    if (previous && /[\p{M}\uFF9E\uFF9F]/u.test(character)) {
      previous.text += character;
      previous.end = index + 1;
    } else groups.push({ text: character, start: index, end: index + 1 });
  });
  const offsets: { start: number; end: number }[] = [];
  let normalized = "";
  for (const group of groups) {
    const spelling = normalizeDreamRecordSearch(group.text);
    normalized += spelling;
    for (let index = 0; index < spelling.length; index += 1) offsets.push(group);
  }
  const ranges: { start: number; end: number }[] = [];
  for (const term of dreamRecordSearchTerms(query)) {
    let index = normalized.indexOf(term);
    while (index >= 0) {
      ranges.push({ start: offsets[index].start, end: offsets[index + term.length - 1].end });
      index = normalized.indexOf(term, index + 1);
    }
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** Plain text runs let React highlight matches without inserting HTML. */
export function dreamRecordHighlight(text: string, query = "") {
  const characters = Array.from(text);
  const runs: { text: string; match: boolean }[] = [];
  let cursor = 0;
  for (const range of dreamRecordMatchRanges(text, query)) {
    if (range.end <= cursor) continue;
    if (range.start > cursor)
      runs.push({ text: characters.slice(cursor, range.start).join(""), match: false });
    const start = Math.max(cursor, range.start);
    const previous = runs.at(-1);
    const matchingText = characters.slice(start, range.end).join("");
    if (previous?.match) previous.text += matchingText;
    else runs.push({ text: matchingText, match: true });
    cursor = range.end;
  }
  if (cursor < characters.length)
    runs.push({ text: characters.slice(cursor).join(""), match: false });
  return runs;
}

export function buildDreamRecordOptions(records: readonly DreamChronicleEvent[]) {
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
  return {
    cases: unique(records.map((record) => String(record.case))).sort(
      (a, b) => Number(a) - Number(b),
    ),
    places: unique(records.map((record) => record.place)),
    people: unique(records.flatMap((record) => record.cast)),
  };
}

export function filterDreamRecords(
  records: readonly DreamChronicleEvent[],
  filters: DreamRecordFilters = {},
) {
  const caseFilter = normalizeFilter(filters.case);
  const personFilter = normalizeFilter(filters.person);
  const placeFilter = normalizeFilter(filters.place);
  const terms = dreamRecordSearchTerms(filters.query);

  return records.filter((record) => {
    if (caseFilter && String(record.case) !== caseFilter) return false;
    if (placeFilter && record.place !== placeFilter) return false;
    if (personFilter && !record.cast.includes(personFilter)) return false;
    if (terms.length) {
      const text = normalizeDreamRecordSearch(
        [
          record.title?.text ?? "",
          dreamRecordPassageText(record),
          ...record.cast,
          record.place,
        ].join(" "),
      );
      if (!terms.every((term) => text.includes(term))) return false;
    }
    return true;
  });
}

export function dreamRecordPassageText(record: DreamChronicleEvent) {
  if (typeof record.text === "string") return record.text;
  return (record.segments ?? []).map((segment) => segment.text).join(" ");
}

export function dreamRecordExcerpt(record: DreamChronicleEvent, limit = 132, query = "") {
  const text = dreamRecordPassageText(record).replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  const match = dreamRecordMatchRanges(text, query)[0];
  const width = Math.max(1, limit - 2);
  const start = match ? Math.min(Math.max(0, match.start - 24), characters.length - width) : 0;
  const end = Math.min(characters.length, start + (start ? width : Math.max(1, limit - 1)));
  return `${start ? "…" : ""}${characters.slice(start, end).join("").trim()}${end < characters.length ? "…" : ""}`;
}

/** Links only to destinations that exist in the supplied canonical records. */
export function resolveDreamRecordLinks(
  record: DreamChronicleEvent,
  { cases = [], places = [], people = [] }: DreamRecordLinksSource = {},
) {
  const episode = cases.find((item) => String(item.no) === String(record.case));
  const atlasIndex = places.findIndex((item) => item.name === record.place);
  const matchingPeople = record.cast.flatMap((name) => {
    const key = normalizePersonLinkKey(name);
    const matches = people.filter((person) => normalizePersonLinkKey(person.name) === key);
    return matches.length === 1 ? [{ name, href: matches[0].href }] : [];
  });

  return {
    chronicleHref: episode ? `#dream-chronicle-event-${record.no}` : null,
    synopsisHref: episode ? `#dream-case-${episode.no}` : null,
    placeHref: atlasIndex >= 0 ? `#dream-atlas-${atlasIndex + 1}` : null,
    people: matchingPeople,
  };
}
