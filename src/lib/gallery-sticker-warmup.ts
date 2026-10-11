/* The gallery curtain's stickers must be on the cloth from its first frame.
   When the reader opens the side menu (the way into the gallery), fetch and
   decode all nine at low priority and keep the decoded images referenced, so
   the curtain's <img> elements paint from memory instead of waiting on the
   network or a decode. About 290 KB, so no page pays for them until the menu
   opens (owner's choice, 2026-10-11); skipped under Save-Data and on 2G, where
   the menu link's own warm-up (GuardedLink assets) still runs on intent. */

const held: HTMLImageElement[] = [];
let started = false;

/** Fetch and decode every sticker once; later calls are no-ops. */
export function warmGalleryStickers(sources: readonly string[]) {
  if (started || typeof Image === "undefined") return;
  started = true;
  for (const source of sources) {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = source;
    held.push(image);
    image.decode().catch(() => undefined);
  }
}

/** When the side menu first opens (html[data-side-menu-open]), warm the
 * stickers, low priority, in an idle slot. Returns a cleanup. */
export function scheduleGalleryStickerWarmup(sources: readonly string[]) {
  if (typeof window === "undefined") return () => undefined;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) {
    return () => undefined;
  }
  const root = document.documentElement;
  let idle = 0;
  let timer = 0;
  const run = () => {
    if (window.requestIdleCallback) {
      idle = window.requestIdleCallback(() => warmGalleryStickers(sources), { timeout: 600 });
    } else {
      timer = window.setTimeout(() => warmGalleryStickers(sources), 120);
    }
  };
  const observer = new MutationObserver(() => {
    if (root.hasAttribute("data-side-menu-open")) {
      observer.disconnect();
      run();
    }
  });
  if (root.hasAttribute("data-side-menu-open")) run();
  else observer.observe(root, { attributes: true, attributeFilter: ["data-side-menu-open"] });
  return () => {
    observer.disconnect();
    if (idle) window.cancelIdleCallback(idle);
    window.clearTimeout(timer);
  };
}
