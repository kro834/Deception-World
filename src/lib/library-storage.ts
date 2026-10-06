import { LIBRARY_ENTRIES } from "./library-data.ts";

export const LIBRARY_STORAGE_KEY = "dw-library-v1";
export const BOOKMARK_LIMIT = 80;
export const RECENT_LIMIT = 16;
export type LibrarySaved = {
  version: 1;
  bookmarks: string[];
  recent: { id: string; at: number }[];
};
export const emptyLibrarySaved = (): LibrarySaved => ({ version: 1, bookmarks: [], recent: [] });
const knownIds = new Set(LIBRARY_ENTRIES.map((entry) => entry.id));
export function parseLibrarySaved(raw: string | null): LibrarySaved {
  if (raw === null) return emptyLibrarySaved();
  if (raw.length > 32000) throw new Error("資料室の保存データが大きすぎます。");
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== "object") throw new Error("資料室の保存データを読み込めません。");
  const record = data as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.bookmarks) || !Array.isArray(record.recent))
    throw new Error("資料室の保存形式に対応していません。");
  if (record.bookmarks.length > BOOKMARK_LIMIT || record.recent.length > RECENT_LIMIT)
    throw new Error("資料室の保存件数が上限を超えています。");
  if (!record.bookmarks.every((id) => typeof id === "string" && knownIds.has(id)))
    throw new Error("しおりに不明な資料が含まれています。");
  const recent: LibrarySaved["recent"] = [];
  for (const item of record.recent) {
    if (
      !item ||
      typeof item !== "object" ||
      !knownIds.has(item.id) ||
      typeof item.at !== "number" ||
      !Number.isSafeInteger(item.at) ||
      item.at < 0
    )
      throw new Error("閲覧履歴を読み込めません。");
    if (!recent.some((entry) => entry.id === item.id)) recent.push({ id: item.id, at: item.at });
  }
  return { version: 1, bookmarks: [...new Set(record.bookmarks as string[])], recent };
}
export function toggleLibraryBookmark(saved: LibrarySaved, id: string): LibrarySaved {
  if (!knownIds.has(id)) throw new Error("この資料は保存できません。");
  if (saved.bookmarks.includes(id))
    return { ...saved, bookmarks: saved.bookmarks.filter((value) => value !== id) };
  if (saved.bookmarks.length >= BOOKMARK_LIMIT)
    throw new Error(`しおりは${BOOKMARK_LIMIT}件までです。不要なしおりを解除してください。`);
  return { ...saved, bookmarks: [...saved.bookmarks, id] };
}
export function addLibraryVisit(saved: LibrarySaved, id: string, at: number): LibrarySaved {
  if (!knownIds.has(id)) return saved;
  return {
    ...saved,
    recent: [{ id, at }, ...saved.recent.filter((entry) => entry.id !== id)].slice(0, RECENT_LIMIT),
  };
}

export function writeLibrarySaved(
  storage: Pick<Storage, "getItem" | "setItem">,
  action: (saved: LibrarySaved) => LibrarySaved,
): LibrarySaved {
  const saved = action(parseLibrarySaved(storage.getItem(LIBRARY_STORAGE_KEY)));
  storage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(saved));
  return saved;
}
