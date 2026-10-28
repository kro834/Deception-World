/* The gallery curtain's stickers must be on the cloth from its first frame.
   When the reader opens the side menu (the way into the gallery), fetch and
   decode all nine at low priority and keep the decoded images referenced, so
   the curtain's <img> elements paint from memory instead of waiting on the
   network or a decode. About 290 KB, so no page pays for them until the menu
   opens (owner's choice, 2026-10-11); skipped under Save-Data and on 2G, where
   the menu link's own warm-up (GuardedLink assets) still runs on intent. */

const held: HTMLImageElement[] = [];
const ready = new Set<string>();
const pending = new Set<string>();

/** Keep successful decodes; retry only failed sources on a later menu opening. */
export function warmGalleryStickers(sources: readonly string[]) {
  if (typeof Image === "undefined") return;
  for (const source of sources) {
    if (ready.has(source) || pending.has(source)) continue;
    pending.add(source);
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = source;
    void image
      .decode()
      .then(() => {
        ready.add(source);
        held.push(image);
      })
      .catch(() => undefined)
      .finally(() => pending.delete(source));
  }
}

/** When the side menu first opens (html[data-side-menu-open]), warm the
 * stickers, low priority, in an idle slot. Returns a cleanup. */
export function scheduleGalleryStickerWarmup(sources: readonly string[]) {
  if (typeof window === "undefined") return () => undefined;
  const root = document.documentElement;
  let disposed = false;
  let idle = 0;
  let timer = 0;
  const warm = () => {
    idle = timer = 0;
    if (disposed || !root.hasAttribute("data-side-menu-open")) return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (
      navigator.onLine === false ||
      connection?.saveData ||
      ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")
    )
      return;
    warmGalleryStickers(sources);
  };
  const run = () => {
    if (disposed || idle || timer || !root.hasAttribute("data-side-menu-open")) return;
    if (window.requestIdleCallback) {
      idle = window.requestIdleCallback(warm, { timeout: 600 });
    } else {
      timer = window.setTimeout(warm, 120);
    }
  };
  const observer = new MutationObserver(() => {
    if (root.hasAttribute("data-side-menu-open")) {
      run();
    }
  });
  if (root.hasAttribute("data-side-menu-open")) run();
  observer.observe(root, { attributes: true, attributeFilter: ["data-side-menu-open"] });
  window.addEventListener("online", run);
  return () => {
    disposed = true;
    window.removeEventListener("online", run);
    observer.disconnect();
    if (idle) window.cancelIdleCallback(idle);
    window.clearTimeout(timer);
  };
}
