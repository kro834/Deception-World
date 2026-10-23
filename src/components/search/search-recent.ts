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
type SearchIntent = { kind: "add" | "remove"; query: string } | { kind: "clear" };
// Replay unsaved actions over the latest disk list when storage recovers, so
// this tab's session changes cannot overwrite another tab's newer searches.
let pending: SearchIntent[] = [];
const listeners = new Set<() => void>();

function readDisk(): string[] | null {
  try {
    return parseRecentSearches(window.localStorage.getItem(RECENT_SEARCH_KEY));
  } catch {
    return null;
  }
}

function applyIntent(list: readonly string[], intent: SearchIntent): string[] {
  if (intent.kind === "clear") return [];
  if (intent.kind === "add") return pushRecentSearch(list, intent.query);
  return list.filter((item) => fold(item) !== fold(intent.query));
}

function replay(list: readonly string[], intents: readonly SearchIntent[]): string[] {
  return intents.reduce<string[]>((current, intent) => applyIntent(current, intent), [...list]);
}

function read() {
  const disk = readDisk();
  if (disk !== null) snapshot = replay(disk, pending);
  // Keep the last usable session snapshot when this browser blocks reads.
  listeners.forEach((listener) => listener());
}

function write(intent: SearchIntent): boolean {
  const disk = readDisk();
  const intents = [...pending, intent];
  const next = disk === null ? applyIntent(snapshot, intent) : replay(disk, intents);
  let persisted = false;
  // Without a current disk read, even an allowed write could erase changes
  // made by another tab. Keep the intent until a safe merge becomes possible.
  if (disk !== null) {
    try {
      if (next.length) window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(RECENT_SEARCH_KEY);
      persisted = true;
    } catch {
      // Storage may be full or blocked; keep these actions for the next retry.
    }
  }
  pending = persisted ? [] : intents;
  snapshot = next;
  listeners.forEach((listener) => listener());
  return persisted;
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
  if (!query.trim()) return;
  return write({ kind: "add", query });
}

export function forgetSearch(query: string) {
  if (typeof window === "undefined") return false;
  return write({ kind: "remove", query });
}

export function clearRecentSearches(): boolean {
  if (typeof window === "undefined") return false;
  return write({ kind: "clear" });
}

/** For export: the stored list as it is now. */
export function readRecentSearches(): string[] {
  const disk = readDisk();
  return disk === null ? [...snapshot] : replay(disk, pending);
}
