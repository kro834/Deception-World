import { DREAM_READER_STORAGE_KEY, validateDreamReaderState } from "./dream-reader-state.js";

/** Descriptive counts, never an inferred completion percentage or reading time. */
export function describeDreamCabinetChapter(chapter, records) {
  const events = records.filter((record) => record.case === chapter.no);
  return {
    paragraphs: chapter.paragraphs.length,
    characters: chapter.paragraphs.reduce(
      (sum, paragraph) => sum + Array.from(paragraph).length,
      0,
    ),
    events: events.length,
  };
}

/** The cabinet may read the reader's bookmark, but never capture or replace it. */
export function readDreamCabinetBookmark(cases, environment = window) {
  let saved;
  try {
    saved = environment.localStorage.getItem(DREAM_READER_STORAGE_KEY);
  } catch {
    return { bookmark: null, available: false };
  }
  try {
    return {
      bookmark: validateDreamReaderState(JSON.parse(saved), cases).bookmark,
      available: true,
    };
  } catch {
    return { bookmark: null, available: true };
  }
}

/** Read again on return to the cabinet, including same-tab automatic bookmarks.
 * No polling, storage writes, scrolling, or history changes belong to this view. */
export function watchDreamCabinetBookmark(root, cases, onChange, environment = window) {
  let disposed = false;
  let previous = "";
  const refresh = () => {
    if (disposed || environment.document?.hidden) return;
    const snapshot = readDreamCabinetBookmark(cases, environment);
    const key = JSON.stringify(snapshot);
    if (key === previous) return;
    previous = key;
    onChange(snapshot);
  };
  const onStorage = (event) => {
    if (event.key === DREAM_READER_STORAGE_KEY || event.key === null) refresh();
  };
  const observer =
    root && typeof environment.IntersectionObserver === "function"
      ? new environment.IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) refresh();
        })
      : null;
  observer?.observe(root);
  root?.addEventListener("focusin", refresh);
  environment.addEventListener("storage", onStorage);
  environment.addEventListener("focus", refresh);
  environment.addEventListener("pageshow", refresh);
  environment.addEventListener("dream-reader-state-change", refresh);
  environment.document?.addEventListener("visibilitychange", refresh);
  refresh();
  return () => {
    disposed = true;
    observer?.disconnect();
    root?.removeEventListener("focusin", refresh);
    environment.removeEventListener("storage", onStorage);
    environment.removeEventListener("focus", refresh);
    environment.removeEventListener("pageshow", refresh);
    environment.removeEventListener("dream-reader-state-change", refresh);
    environment.document?.removeEventListener("visibilitychange", refresh);
  };
}
