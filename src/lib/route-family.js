/** Which family of pages a path belongs to. Resolved from the route on the
 * server too, so <html data-family> is right before paint and a family's
 * stylesheet can scope itself even after the visitor's earlier pages have
 * left their sheets in the document (route stylesheets persist on client
 * navigation). */
export const ROUTE_FAMILIES = [
  "opening",
  "world",
  "dossier",
  "dream",
  "special",
  "gallery",
  "library",
  "archive",
  "utility",
];

export function getRouteFamily(pathname) {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/") return "opening";
  if (path === "/world") return "world";
  if (/^\/(?:riders|managers|characters)\/[^/]+$/.test(path)) return "dossier";
  if (path === "/dream-chapter") return "dream";
  if (path === "/rexonance-saga" || path === "/extreme-saga" || path === "/final-stage") {
    return "special";
  }
  if (path === "/gallery" || path === "/gallery-tours" || path === "/exhibition") return "gallery";
  if (path === "/library" || path === "/search") return "library";
  if (path === "/form-archive") return "archive";
  return "utility";
}
