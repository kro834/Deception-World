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
