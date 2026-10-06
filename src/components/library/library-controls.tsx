import { useEffect } from "react";
import { findLibraryLocation } from "@/lib/library-data";
import { recordLibraryVisit, toggleBookmark, useLibraryStore } from "./library-store";

export function LibraryVisitTracker({ pathname, hash = "" }: { pathname: string; hash?: string }) {
  useLibraryStore();
  const id = findLibraryLocation(pathname, hash)?.id;
  useEffect(() => {
    if (id) recordLibraryVisit(id);
  }, [id]);
  return null;
}
export function LibraryCurrentButton({ pathname, hash = "" }: { pathname: string; hash?: string }) {
  const entry = findLibraryLocation(pathname, hash);
  const { saved, ready, error } = useLibraryStore();
  if (!entry) return null;
  const active = saved.bookmarks.includes(entry.id);
  return (
    <span className="library-current-control">
      <button
        type="button"
        disabled={!ready}
        aria-pressed={active}
        aria-label={`${entry.title}のしおり${active ? "を解除" : "を保存"}`}
        onClick={() => toggleBookmark(entry.id)}
      >
        {active ? "しおりを解除" : "資料を保存"}
      </button>
      {error ? <span role="status">{error}</span> : null}
    </span>
  );
}
