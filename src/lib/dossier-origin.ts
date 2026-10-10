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
