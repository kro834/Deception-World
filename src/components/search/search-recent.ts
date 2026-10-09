import { useSyncExternalStore } from "react";

/** Recent site-search queries, newest first, kept in this browser only. */
export const RECENT_SEARCH_KEY = "dw-search-recent-v1";
export const RECENT_SEARCH_LIMIT = 8;
const MAX_QUERY_LENGTH = 120;

const fold = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function parseRecentSearches(raw: string | null): string[] {
  if (!raw || raw.length > 4000) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of data) {
      if (typeof item !== "string") continue;
      const query = item.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
      if (!query || seen.has(fold(query))) continue;
      seen.add(fold(query));
      list.push(query);
      if (list.length === RECENT_SEARCH_LIMIT) break;
    }
    return list;
  } catch {
    return [];
  }
}

export function pushRecentSearch(list: readonly string[], query: string): string[] {
  const clean = query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  if (!clean) return [...list];
  return [clean, ...list.filter((item) => fold(item) !== fold(clean))].slice(
    0,
    RECENT_SEARCH_LIMIT,
  );
}

const EMPTY: readonly string[] = [];
let snapshot: readonly string[] = EMPTY;
const listeners = new Set<() => void>();

function read() {
  try {
    snapshot = parseRecentSearches(window.localStorage.getItem(RECENT_SEARCH_KEY));
  } catch {
    snapshot = EMPTY;
  }
  listeners.forEach((listener) => listener());
}

function write(next: readonly string[]) {
  try {
    if (next.length) window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(RECENT_SEARCH_KEY);
  } catch {
    // Storage may be full or blocked; the list still updates for this page.
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function onStorage(event: StorageEvent) {
  if (event.key === RECENT_SEARCH_KEY || event.key === null) read();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    read();
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

export function useRecentSearches(): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}

export function rememberSearch(query: string) {
  if (typeof window === "undefined") return;
  if (!listeners.size) read();
  write(pushRecentSearch(snapshot, query));
}

export function forgetSearch(query: string) {
  write(snapshot.filter((item) => fold(item) !== fold(query)));
}

export function clearRecentSearches() {
  write([]);
}

/** For export: the stored list as it is now. */
export function readRecentSearches(): string[] {
  try {
    return parseRecentSearches(window.localStorage.getItem(RECENT_SEARCH_KEY));
  } catch {
    return [];
  }
}
