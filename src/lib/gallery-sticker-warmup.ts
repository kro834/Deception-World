/* The gallery curtain's stickers must be on the cloth from its first frame.
   Once a page has loaded and gone idle, fetch and decode all nine at low
   priority and keep the decoded images referenced, so the curtain's <img>
   elements paint from memory instead of waiting on the network or a decode.
   About 290 KB; skipped under Save-Data and on 2G, where the menu link's own
   warm-up (GuardedLink assets) still runs on intent. */

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

/** After load, on idle: warm the stickers. Returns a cleanup. */
export function scheduleGalleryStickerWarmup(sources: readonly string[]) {
  if (typeof window === "undefined") return () => undefined;
  const connection = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (connection?.saveData || ["slow-2g", "2g"].includes(connection?.effectiveType ?? "")) {
    return () => undefined;
  }
  let idle = 0;
  let timer = 0;
  const run = () => {
    if (window.requestIdleCallback) {
      idle = window.requestIdleCallback(() => warmGalleryStickers(sources), { timeout: 4000 });
    } else {
      timer = window.setTimeout(() => warmGalleryStickers(sources), 1200);
    }
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
  return () => {
    window.removeEventListener("load", run);
    if (idle) window.cancelIdleCallback(idle);
    window.clearTimeout(timer);
  };
}
