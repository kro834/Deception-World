// Opening the quick search from anywhere, and warming its chunk. The overlay
// module (and the search index it imports) loads only through loadQuickSearch.
export const QUICK_SEARCH_OPEN_EVENT = "dw:quick-search";
export const loadQuickSearch = () => import("./quick-search-dialog");

/** Opens the quick search from anywhere (the side menu's entry). */
export function openQuickSearch() {
  window.dispatchEvent(new CustomEvent(QUICK_SEARCH_OPEN_EVENT));
}

/** Warms the overlay chunk when an entry to it is pointed at or focused. */
export function prefetchQuickSearch() {
  const { connection } = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (
    document.hidden ||
    connection?.saveData ||
    /^(slow-)?2g$/.test(connection?.effectiveType ?? "")
  )
    return;
  void loadQuickSearch().catch(() => undefined);
}
