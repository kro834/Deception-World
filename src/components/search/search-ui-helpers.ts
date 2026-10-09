import type { SearchDocument, SearchResult } from "./search-engine";

/** Where a record lives, as a short label beside its kind. */
export function placeLabel(document: SearchDocument): string {
  const { to } = document;
  if (to.startsWith("/riders/")) return "ライダー資料";
  if (to.startsWith("/managers/")) return "六詠資料";
  if (to.startsWith("/characters/")) return "人物資料";
  if (to === "/world") return "WORLD";
  if (to === "/dream-chapter") return "夢の章";
  if (to === "/final-stage") return "FINAL STAGE";
  if (to === "/form-archive")
    return document.search?.archive === "realm" ? "アーカイブ / レルム" : "アーカイブ / サーガ";
  if (to === "/extreme-saga") return "EXTREME SAGA";
  if (to === "/rexonance-saga") return "REXONANCE SAGA";
  if (to === "/gallery") return "GALLERY";
  return "";
}

export function resultHref(result: Pick<SearchResult, "document" | "hash">): string {
  const { document } = result;
  const query = document.search ? `?${new URLSearchParams(document.search)}` : "";
  const hash = result.hash ?? document.hash;
  return `${document.to}${query}${hash ? `#${hash}` : ""}`;
}

/** ↑/↓ over a listbox's options. Down from the field enters at the first
 * option, up from the first returns to the field (-1), and the ends wrap. */
export function stepActive(current: number, count: number, step: 1 | -1): number {
  if (!count) return -1;
  if (current < 0) return step > 0 ? 0 : count - 1;
  if (step < 0 && current === 0) return -1;
  return (current + step + count) % count;
}
