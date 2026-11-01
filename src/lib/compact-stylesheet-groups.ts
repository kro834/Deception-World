/** Replace contiguous stylesheet groups with their ordered build-time bundle.
 * Non-stylesheet hints and external fonts retain their original positions. */
export function compactStylesheetGroups<T extends { rel?: string; href?: string }>(
  links: T[],
  groups: readonly { href: string; members: readonly string[] }[],
): T[] {
  const emitted = new Set<string>();
  return links.flatMap((link) => {
    const group = link.rel === "stylesheet"
      ? groups.find((candidate) => candidate.members.includes(link.href ?? ""))
      : undefined;
    if (!group) return [link];
    if (emitted.has(group.href)) return [];
    emitted.add(group.href);
    return [{ ...link, href: group.href }];
  });
}
