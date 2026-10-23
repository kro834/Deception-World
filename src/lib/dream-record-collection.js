export const DREAM_RECORD_COLLECTION_KEY = "deception-world:dream-record-collection:v1";

/** Only canonical numeric record ids are retained; story text never enters storage. */
export function validateDreamRecordCollection(value, canonicalIds) {
  if (value?.version !== 1 || !Array.isArray(value.ids)) return [];
  const known = new Set(canonicalIds);
  return [...new Set(value.ids.filter((id) => Number.isSafeInteger(id) && known.has(id)))];
}

/** Keep the next card in reach when a saved card disappears, then try the previous one. */
export function dreamRecordCollectionFocus(ids, removed) {
  const index = ids.indexOf(removed);
  return index < 0 ? null : (ids[index + 1] ?? ids[index - 1] ?? null);
}

/** Storage denial leaves a usable, explicitly temporary collection for this visit. */
export function createDreamRecordCollection(canonicalIds, environment = globalThis) {
  const known = new Set(canonicalIds);
  let storage = null;
  let ids = [];
  let available = true;
  const readLatest = () => {
    if (!available) return;
    try {
      storage ??= environment.localStorage;
      if (!storage) throw new Error("Storage unavailable");
      const raw = storage.getItem(DREAM_RECORD_COLLECTION_KEY);
      try {
        ids = validateDreamRecordCollection(JSON.parse(raw), canonicalIds);
      } catch {
        // A damaged entry can be replaced on the next deliberate save.
        ids = [];
      }
    } catch {
      storage = null;
      available = false;
    }
  };
  readLatest();
  const snapshot = () => ({ ids: [...ids], available });
  const persist = () => {
    try {
      if (storage)
        storage.setItem(DREAM_RECORD_COLLECTION_KEY, JSON.stringify({ version: 1, ids }));
    } catch {
      storage = null;
      available = false;
    }
    return snapshot();
  };
  return {
    snapshot,
    refresh() {
      readLatest();
      return snapshot();
    },
    setSaved(id, saved) {
      if (!known.has(id)) return snapshot();
      // Other tabs may have changed the collection since this screen rendered.
      // Apply the visible button's add/remove intent, never toggle the latest value.
      readLatest();
      if (saved && !ids.includes(id)) ids = [...ids, id];
      else if (!saved) ids = ids.filter((entry) => entry !== id);
      return persist();
    },
  };
}

/** Cross-tab updates do not write back, and the listener belongs to the mounted explorer. */
export function watchDreamRecordCollection(collection, onChange, environment = window) {
  const onStorage = (event) => {
    if (event.key !== DREAM_RECORD_COLLECTION_KEY && event.key !== null) return;
    const previous = JSON.stringify(collection.snapshot());
    const next = collection.refresh();
    const key = JSON.stringify(next);
    if (key === previous) return;
    onChange(next);
  };
  environment.addEventListener("storage", onStorage);
  return () => environment.removeEventListener("storage", onStorage);
}
