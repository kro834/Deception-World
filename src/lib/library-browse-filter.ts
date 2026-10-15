import { searchLibrary, type LibraryKind } from "./library-data.ts";
import type { LibraryBrowseSelection } from "./library-browse-state.ts";

/** Counts answer “what would this kind show?”, keeping the query and scope.
 * The catalogue belongs only to the library UI, never its route validator. */
export function filterLibraryBrowse(
  { q, kind, scope }: LibraryBrowseSelection,
  bookmarkIds: readonly string[] = [],
) {
  const saved = new Set(bookmarkIds);
  const matches = searchLibrary(q).filter((entry) => scope !== "saved" || saved.has(entry.id));
  const counts: Record<LibraryKind | "all", number> = {
    all: matches.length,
    page: 0,
    person: 0,
    chapter: 0,
  };
  for (const entry of matches) counts[entry.kind] += 1;
  return {
    counts,
    entries: kind === "all" ? matches : matches.filter((entry) => entry.kind === kind),
  };
}
