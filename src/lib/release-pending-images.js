/** Leaving a page releases it (audit #31). An image whose request is still
 * in flight stays alive as a pending activity, and with it everything it
 * reaches: an <img> of a removed page holds that whole page, an Image()
 * loader the closures in its handlers. On a stalled connection that is every
 * visit's page. An empty src ends the request in every case (removing the
 * attribute does not: Chromium keeps the detached element waiting), and the
 * handlers go first so no closure runs for a page that has gone. A finished
 * picture, or anything that is not a real image element, is left as it is. */
export function releasePendingImage(image) {
  if (!image || image.complete !== false) return;
  image.onload = null;
  image.onerror = null;
  image.removeAttribute("srcset");
  image.src = "";
}

/** Every unfinished <img> in a removed tree (never a connected one: a
 * component's effect rehearsal must not cancel the live page's pictures). */
export function releasePendingImages(root) {
  if (!root || root.isConnected || typeof root.querySelectorAll !== "function") return;
  for (const image of root.querySelectorAll("img")) releasePendingImage(image);
}
