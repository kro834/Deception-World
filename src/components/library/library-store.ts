import { useSyncExternalStore } from "react";
import {
  addLibraryVisit,
  emptyLibrarySaved,
  LIBRARY_STORAGE_KEY,
  parseLibrarySaved,
  toggleLibraryBookmark,
  writeLibrarySaved,
  type LibrarySaved,
} from "@/lib/library-storage";

type Snapshot = { saved: LibrarySaved; ready: boolean; error: string };
const serverSnapshot: Snapshot = { saved: emptyLibrarySaved(), ready: false, error: "" };
let snapshot = serverSnapshot;
const listeners = new Set<() => void>();
function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}
function readStorage() {
  try {
    publish({
      saved: parseLibrarySaved(window.localStorage.getItem(LIBRARY_STORAGE_KEY)),
      ready: true,
      error: "",
    });
  } catch {
    publish({
      saved: emptyLibrarySaved(),
      ready: true,
      error: "保存データを読み込めませんでした。しおり・履歴は表示できません。",
    });
  }
}
function onStorage(event: StorageEvent) {
  if (event.key === LIBRARY_STORAGE_KEY || event.key === null) readStorage();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    readStorage();
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}
export function useLibraryStore() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot,
  );
}
function update(action: (saved: LibrarySaved) => LibrarySaved) {
  try {
    // Re-read before every write so another tab's last successful change is preserved.
    const saved = writeLibrarySaved(window.localStorage, action);
    publish({ saved, ready: true, error: "" });
  } catch (error) {
    publish({
      ...snapshot,
      ready: true,
      error:
        error instanceof Error && /しおりは/.test(error.message)
          ? error.message
          : "保存できませんでした。ブラウザーの保存設定・空き容量を確認してください。既存の保存データは変更していません。",
    });
  }
}
export function toggleBookmark(id: string) {
  update((saved) => toggleLibraryBookmark(saved, id));
}
export function recordLibraryVisit(id: string) {
  update((saved) => addLibraryVisit(saved, id, Date.now()));
}
export function clearLibraryRecent() {
  update((saved) => ({ ...saved, recent: [] }));
}
