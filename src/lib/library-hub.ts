import { LIBRARY_ENTRIES, type LibraryEntry } from "./library-data.ts";
import type { LibrarySaved } from "./library-storage.ts";

const byId = new Map(LIBRARY_ENTRIES.map((entry) => [entry.id, entry]));
const MINUTE = 60_000;
const DAY = 86_400_000;

/** "たった今" / "5分前" / "3時間前" / "昨日" / "4日前" / "9月28日", in local time. */
export function formatVisitTime(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "たった今";
  if (elapsed < 60 * MINUTE) return `${Math.floor(elapsed / MINUTE)}分前`;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (at >= today.getTime()) return `${Math.floor(elapsed / (60 * MINUTE))}時間前`;
  if (at >= today.getTime() - DAY) return "昨日";
  const days = Math.ceil((today.getTime() - at) / DAY);
  if (days < 7) return `${days}日前`;
  const date = new Date(at);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** A history row's time under its 今日 / 昨日 / それ以前 heading: "12分前",
 * "21:04", or "9月28日". */
export function formatVisitClock(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < 60 * MINUTE) return formatVisitTime(at, now);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const date = new Date(at);
  if (at >= today.getTime() - DAY)
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export type VisitGroup = { label: string; visits: { entry: LibraryEntry; at: number }[] };

/** Recent visits as 今日 / 昨日 / それ以前, newest first; unknown ids dropped. */
export function groupVisits(recent: LibrarySaved["recent"], now: number): VisitGroup[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const groups: VisitGroup[] = [
    { label: "今日", visits: [] },
    { label: "昨日", visits: [] },
    { label: "それ以前", visits: [] },
  ];
  for (const { id, at } of [...recent].sort((first, second) => second.at - first.at)) {
    const entry = byId.get(id);
    if (!entry) continue;
    groups[at >= start ? 0 : at >= start - DAY ? 1 : 2].visits.push({ entry, at });
  }
  return groups.filter((group) => group.visits.length);
}

/** The Dream chapter that follows a chapter entry, if any. */
export function nextChapter(entry: LibraryEntry): LibraryEntry | undefined {
  const match = /^dream-case-(\d+)$/.exec(entry.id);
  return match ? byId.get(`dream-case-${Number(match[1]) + 1}`) : undefined;
}

/** The last record opened, to pick up from. */
export function continueReading(
  saved: LibrarySaved,
): { entry: LibraryEntry; at: number; next?: LibraryEntry } | undefined {
  const latest = [...saved.recent].sort((first, second) => second.at - first.at)[0];
  const entry = latest && byId.get(latest.id);
  return entry ? { entry, at: latest.at, next: nextChapter(entry) } : undefined;
}

/** The portable copy offered by 書き出す: this browser's library data only. */
export function buildLibraryExport(saved: LibrarySaved, searches: readonly string[], now: number) {
  return {
    format: "deception-world-library",
    version: 1,
    exportedAt: new Date(now).toISOString(),
    bookmarks: saved.bookmarks.map((id) => ({
      id,
      title: byId.get(id)?.title ?? id,
      path: byId.get(id)?.path ?? "",
    })),
    recent: saved.recent.map(({ id, at }) => ({
      id,
      title: byId.get(id)?.title ?? id,
      openedAt: new Date(at).toISOString(),
    })),
    searches: [...searches],
  };
}
