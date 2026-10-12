/** Mirrors the global route cover onto Rexonance's own root before paint. */
export function syncRexonanceRouteCover(page, root = page?.ownerDocument?.documentElement) {
  if (!page || !root) return;
  page.toggleAttribute("data-route-covered", root.hasAttribute("data-loading"));
}
