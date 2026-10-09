const SEARCH_CATEGORIES = [
  "all",
  "people",
  "riders",
  "forms",
  "story",
  "world",
  "systems",
  "pages",
] as const;
const MIN_SHOWN = 24;
const MAX_SHOWN = 144;
const MAX_QUERY_LENGTH = 120;

export type SearchState = { q?: string; category?: string; shown?: number };

export function validateSearchState(search: Record<string, unknown>): SearchState {
  const query = search.q;
  const q =
    query === null || ["string", "number", "boolean"].includes(typeof query)
      ? String(query).slice(0, MAX_QUERY_LENGTH)
      : undefined;
  const category = SEARCH_CATEGORIES.includes(search.category as (typeof SEARCH_CATEGORIES)[number])
    ? String(search.category)
    : undefined;

  let shown: number | undefined;
  try {
    const parsedShown = Number(search.shown);
    if (Number.isFinite(parsedShown)) {
      shown = Math.min(MAX_SHOWN, Math.max(MIN_SHOWN, Math.floor(parsedShown)));
    }
  } catch {
    // A symbol or other non-coercible value is an invalid URL parameter.
  }

  return { q, category, shown };
}
