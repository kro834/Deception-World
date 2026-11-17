export type GuardedSearch = Record<string, string | number>;

/** The real anchor and the retry screen share the same destination. */
export function guardedHref(to: string, hash?: string, search?: GuardedSearch) {
  const fragment = hash ? `#${hash}` : "";
  if (!search) return `${to}${fragment}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) params.set(key, String(value));
  const query = params.toString();
  return `${to}${query ? `?${query}` : ""}${fragment}`;
}
