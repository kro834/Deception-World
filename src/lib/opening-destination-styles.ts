/** Warm the full launcher CSS during the existing idle World preparation.
 * It is not applied to the title; route-owned full styles remain authoritative. */
export function preloadOpeningDestinationStyles(href: string) {
  if (typeof document === "undefined" || document.hidden) return;
  if (document.head.querySelector(`link[href="${href}"]`)) return;
  const hint = Object.assign(document.createElement("link"), {
    rel: "preload",
    as: "style",
    href,
  });
  hint.setAttribute("fetchpriority", "low");
  document.head.append(hint);
}
