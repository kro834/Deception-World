/** The document canvas, native chrome hint and fixed edge share one colour.
 * Resolve from the route on the server too; device detection must not delay paint. */
export const VIEWPORT_CHROME_COLORS = {
  gallery: "#171614",
  world: "#03060c",
  dream: "#130c17",
};

// 2026-11-26: /exhibition has the gallery's bar, so it takes the gallery's edge
// colour and iPad launcher too.
export function getViewportChrome(pathname) {
  switch (pathname.replace(/\/$/, "")) {
    case "/gallery":
    case "/gallery-tours":
    case "/exhibition":
      return "gallery";
    case "/world":
      return "world";
    case "/dream-chapter":
      return "dream";
    default:
      return undefined;
  }
}

export function getViewportChromeColor(pathname) {
  const chrome = getViewportChrome(pathname);
  return chrome ? VIEWPORT_CHROME_COLORS[chrome] : "#000000";
}
