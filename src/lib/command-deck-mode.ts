/** The dashboard is the default; an opening replay is an explicit, shareable URL. */
export function validateCommandDeckSearch(search: Record<string, unknown>): {
  opening?: true;
  "opening-audit"?: true;
} {
  const enabled = (value: unknown) => value === true || value === 1 || value === "1";
  return {
    ...(enabled(search.opening) ? { opening: true as const } : {}),
    ...(search["opening-audit"] === "" || enabled(search["opening-audit"])
      ? { "opening-audit": true as const }
      : {}),
  };
}

export function showsOpening(search: ReturnType<typeof validateCommandDeckSearch>) {
  return search.opening === true || search["opening-audit"] === true;
}

// Owner (2026-10-27): opening the site starts with the opening. The document
// that lands on "/" (its server render and hydration) plays it; moving back to
// "/" inside the site shows the dashboard. Cleared once the title is left.
let documentEntryOpening = true;
let documentEntryChecked = false;
export function isDocumentEntryOpening() {
  if (!documentEntryChecked && typeof window !== "undefined") {
    documentEntryChecked = true;
    // A document that opened on another page reaches "/" as the dashboard.
    try {
      const entry = performance.getEntriesByType("navigation")[0];
      const opened = entry ? new URL(entry.name).pathname : window.location.pathname;
      if (opened !== "/") documentEntryOpening = false;
    } catch {
      /* keep the opening */
    }
  }
  return documentEntryOpening;
}
export function endDocumentEntryOpening() {
  documentEntryOpening = false;
}
