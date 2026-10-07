export const ULTRA_FRAME_GUTTER = 12;

const ARTWORKS = [
  ['.gallery-feature-open[data-ultra-artwork-ready="true"]', "img"],
  ['.dream-poster-current[data-ultra-artwork-ready="true"]', ":scope > img"],
  ['.poster-stage .poster-frame[data-ultra-artwork-ready="true"]', ".poster-image-current"],
];

const artworkSource = (image) =>
  `${image.getAttribute("src") || ""}|${image.getAttribute("srcset") || ""}|${image.currentSrc || ""}`;

/** Observe artwork identity, not animation frames. A new image/source receives
 * a new React key because a disposed renderer deliberately loses its context. */
export function watchUltraArtworkTarget(notify, doc = document) {
  let previous = null;
  let revision = 0;
  let stopped = false;
  const refresh = () => {
    if (stopped) return;
    let next = null;
    for (const [hostSelector, imageSelector] of ARTWORKS) {
      const host = doc.querySelector(hostSelector);
      const image = host?.querySelector(imageSelector);
      if (!host || !image || !image.isConnected) continue;
      // A physical studio owns this image while enabled, avoiding a second GPU
      // context painting the previous narrow rim behind its room renderer.
      if (host.closest('[data-exhibition-active="true"]')) continue;
      const source = artworkSource(image);
      if (previous?.host === host && previous.image === image && previous.source === source) return;
      next = { host, image, source, revision: ++revision };
      break;
    }
    if (!next && !previous) return;
    previous = next;
    notify(next);
  };
  const observer = new MutationObserver(refresh);
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "data-ultra-artwork-ready", "data-exhibition-active"],
  });
  // currentSrc may change without a src/srcset mutation at a responsive breakpoint.
  doc.addEventListener("load", refresh, true);
  doc.addEventListener("error", refresh, true);
  refresh();
  return () => {
    stopped = true;
    observer.disconnect();
    doc.removeEventListener("load", refresh, true);
    doc.removeEventListener("error", refresh, true);
  };
}

/** Layout-space coordinates, deliberately independent of ancestor transforms.
 * The portal shares the artwork's host, so perspective/scroll remain native. */
export function measureUltraArtwork(target) {
  const { host, image } = target;
  if (!host.isConnected || !image.isConnected || !host.contains(image)) return null;
  if (artworkSource(image) !== target.source) return null;
  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
  const width = image.offsetWidth;
  const height = image.offsetHeight;
  if (!(width > 0 && height > 0)) return null;
  let left = image.offsetLeft;
  let top = image.offsetTop;
  let parent = image.offsetParent;
  while (parent && parent !== host) {
    left += parent.offsetLeft + parent.clientLeft;
    top += parent.offsetTop + parent.clientTop;
    parent = parent.offsetParent;
  }
  // A hidden target, or a host that no longer establishes the containing block.
  if (parent !== host) return null;
  return {
    left: left - ULTRA_FRAME_GUTTER,
    top: top - ULTRA_FRAME_GUTTER,
    width: width + ULTRA_FRAME_GUTTER * 2,
    height: height + ULTRA_FRAME_GUTTER * 2,
  };
}

/** Resize/intersection and coalesced scroll updates have no permanent RAF loop.
 * Missing, loading, shuffling and off-screen images cannot activate the GPU. */
export function watchUltraArtworkGeometry(target, notify, doc = document, win = window) {
  let stopped = false;
  let pending = 0;
  let intersecting = typeof IntersectionObserver === "undefined";
  const update = () => {
    if (stopped) return;
    const geometry = measureUltraArtwork(target);
    const rect = target.image.getBoundingClientRect();
    const inViewport =
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < win.innerHeight &&
      rect.left < win.innerWidth;
    const busy = !!target.image.closest('[aria-busy="true"], .is-shuffling');
    notify({ geometry, visible: !!geometry && intersecting && inViewport && !busy, rect });
  };
  const schedule = () => {
    if (!stopped && !pending)
      pending = win.requestAnimationFrame(() => {
        pending = 0;
        update();
      });
  };
  const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
  resize?.observe(target.host);
  resize?.observe(target.image);
  const intersection =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          intersecting = entries.some(
            (entry) => entry.target === target.image && entry.isIntersecting,
          );
          update();
        })
      : null;
  intersection?.observe(target.image);
  const mutations = new MutationObserver(update);
  mutations.observe(target.host, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-busy", "class", "src", "srcset"],
  });
  // World shuffle state lives above the frame; observe that stable ancestor only.
  const worldStage = target.host.closest(".poster-stage");
  if (worldStage) mutations.observe(worldStage, { attributes: true, attributeFilter: ["class"] });
  target.image.addEventListener("load", update);
  target.image.addEventListener("error", update);
  target.host.addEventListener("animationend", update, true);
  target.host.addEventListener("transitionend", update, true);
  win.addEventListener("resize", schedule, { passive: true });
  doc.addEventListener("scroll", schedule, { capture: true, passive: true });
  win.visualViewport?.addEventListener("resize", schedule, { passive: true });
  win.visualViewport?.addEventListener("scroll", schedule, { passive: true });
  update();
  return () => {
    stopped = true;
    if (pending) win.cancelAnimationFrame(pending);
    resize?.disconnect();
    intersection?.disconnect();
    mutations.disconnect();
    target.image.removeEventListener("load", update);
    target.image.removeEventListener("error", update);
    target.host.removeEventListener("animationend", update, true);
    target.host.removeEventListener("transitionend", update, true);
    win.removeEventListener("resize", schedule);
    doc.removeEventListener("scroll", schedule, true);
    win.visualViewport?.removeEventListener("resize", schedule);
    win.visualViewport?.removeEventListener("scroll", schedule);
  };
}
