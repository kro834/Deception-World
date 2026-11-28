export const CAST_ROSTER_SEARCH = { from: "cast-roster" } as const;

/** Only this named, local entry point can override a dossier's default return. */
export function validateDossierOriginSearch(search: Record<string, unknown>): {
  from?: "cast-roster";
} {
  return search.from === "cast-roster" ? CAST_ROSTER_SEARCH : {};
}

export function isCastRosterOrigin(search: Record<string, unknown>): boolean {
  return search.from === "cast-roster";
}

export const DOSSIER_ARCHIVE_SOURCE_SELECTOR = ".dossier-form-archive a[href]";

export function rememberDossierArchiveReturn() {
  const linkHasFocus = document.activeElement?.matches(DOSSIER_ARCHIVE_SOURCE_SELECTOR) ?? false;
  // Keep the router's entry key and scroll position. The marker belongs
  // only to this entry, including when another rider is open in another tab.
  History.prototype.replaceState.call(
    window.history,
    { ...window.history.state, dossierArchiveReturn: linkHasFocus },
    "",
  );
}
