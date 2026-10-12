import type { DreamChronicleEvent } from "@/components/dream-chapter/dream-chapter-extra-data";

type DreamRecordFilters = {
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

  return records.filter((record) => {
    if (caseFilter && String(record.case) !== caseFilter) return false;
    if (placeFilter && record.place !== placeFilter) return false;
    if (personFilter && !record.cast.includes(personFilter)) return false;
    return true;
  });
}

export function dreamRecordPassageText(record: DreamChronicleEvent) {
  if (typeof record.text === "string") return record.text;
  return (record.segments ?? []).map((segment) => segment.text).join(" ");
}

export function dreamRecordExcerpt(record: DreamChronicleEvent, limit = 132) {
  const text = dreamRecordPassageText(record).replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  return `${characters
    .slice(0, Math.max(1, limit - 1))
    .join("")
    .trimEnd()}…`;
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
