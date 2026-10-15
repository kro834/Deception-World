import type { LibraryKind } from "./library-data.ts";
import { validateInquirySearch, type InquiryGuideId } from "./inquiry-guides.ts";

export const LIBRARY_QUERY_LIMIT = 160;
export const LIBRARY_QUERY_DELAY = 280;
const KNOWN_KINDS = ["page", "person", "chapter"] as const;
export type LibraryBrowseScope = "all" | "saved";
export type LibraryBrowseSelection = {
  q: string;
  kind: LibraryKind | "all";
  scope: LibraryBrowseScope;
};
export type LibraryBrowseSearch = {
  q?: string;
  kind?: LibraryKind;
  scope?: "saved";
  guide?: InquiryGuideId;
};

/** Compact, shareable URL state. Personal bookmark IDs never enter the URL. */
export function validateLibraryBrowseSearch(search: Record<string, unknown>): LibraryBrowseSearch {
  const query = search.q;
  const q =
    query === null || ["string", "number", "boolean"].includes(typeof query)
      ? String(query).slice(0, LIBRARY_QUERY_LIMIT).trim()
      : "";
  const kind =
    typeof search.kind === "string" && KNOWN_KINDS.includes(search.kind as LibraryKind)
      ? (search.kind as LibraryKind)
      : undefined;
  return {
    ...validateInquirySearch(search),
    ...(q ? { q } : {}),
    ...(kind ? { kind } : {}),
    ...(search.scope === "saved" ? { scope: "saved" as const } : {}),
  };
}

export function libraryBrowseKey(selection: LibraryBrowseSelection): string {
  const canonical = validateLibraryBrowseSearch(selection);
  return JSON.stringify([canonical.q ?? "", canonical.kind ?? "all", canonical.scope ?? "all"]);
}
