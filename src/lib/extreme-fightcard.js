/* FIGHT CARD (rx15): the Extreme page's tale of the tape, driven for
   src/styles-extreme-fightcard.css.

   Every row of the console is a clash: its two bars slam in from their
   corners when the row itself is reached (so on a phone the lower rows do
   not play off screen), and again whenever the challenger changes (React
   re-keys .rxs-comparison-metrics; rows that arrive in view clash at once,
   the others when they are reached). Each row carries a one-shot key,
   data-exf-clash: "" while it waits (the sheet holds its bars back only
   then), "true" for the beat, then "done", so a rule that stands down
   under the side menu, a dialog or the loading cover never replays when
   the page comes back.

   It only listens (one IntersectionObserver on the rows, one
   MutationObserver on the comparison's children, no scroll or pointer
   listener) and follows reduced motion, economy rendering, Save-Data / 2g,
   the load gate, page visibility and the bfcache. When it stands down,
   waiting rows are released to stand drawn; everything is released
   symmetrically on unmount. */

// The latest beat it starts: the fourth row's burst ends at 270 + 400 + 520 ms.
export const CLASH_MS = 1300;
// A row is reached a little above the bottom of the screen.
const LINE = "0px 0px -12% 0px";

export function mountExtremeFightCard(page, environment = window) {
  if (!page) return () => {};
  const document = page.ownerDocument;
  const html = document.documentElement;
  const connection = environment.navigator?.connection;
  const reducedMotion = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const comparison = page.querySelector(".rxs-comparison");
  if (!comparison || !environment.MutationObserver || !environment.IntersectionObserver)
    return () => {};

  const timers = new Map();
  const waiting = new Set();
  let rows = null;
  let watcher = null;
  let disposed = false;

  const clash = (row) => {
    waiting.delete(row);
    row.setAttribute("data-exf-clash", "true");
    const id = environment.setTimeout(() => {
      timers.delete(id);
      if (row.getAttribute("data-exf-clash") === "true") row.setAttribute("data-exf-clash", "done");
    }, CLASH_MS);
    timers.set(id, row);
  };
  const arm = (articles) => {
    for (const row of articles) {
      if (row.hasAttribute("data-exf-clash")) continue;
      row.setAttribute("data-exf-clash", "");
      waiting.add(row);
      rows?.observe(row);
    }
  };
  const articlesIn = (node) => [...(node.querySelectorAll?.(":scope > article") ?? [])];
  const release = (articles) => {
    for (const row of articles) {
      rows?.unobserve(row);
      waiting.delete(row);
      for (const [id, target] of timers)
        if (target === row) {
          environment.clearTimeout(id);
          timers.delete(id);
        }
      const state = row.getAttribute("data-exf-clash");
      if (state === "") row.removeAttribute("data-exf-clash");
      else if (state === "true") row.setAttribute("data-exf-clash", "done");
    }
  };
  const onIntersect = (entries, observer) => {
    if (disposed || observer !== rows) return;
    for (const entry of entries) {
      if (!entry.isIntersecting || !waiting.has(entry.target)) continue;
      rows?.unobserve(entry.target);
      clash(entry.target);
    }
  };
  const onChange = (records) => {
    if (disposed || !watcher) return;
    // React replaces the entire tape when its opponent changes. Drop both
    // unreached rows and in-flight beats before arming the new tape.
    for (const record of records)
      for (const node of record.removedNodes ?? [])
        if (node.nodeType === 1 && node.matches?.(".rxs-comparison-metrics"))
          release(articlesIn(node));
    for (const record of records)
      for (const node of record.addedNodes)
        if (
          node.nodeType === 1 &&
          node.matches?.(".rxs-comparison-metrics") &&
          node === comparison.querySelector(":scope > .rxs-comparison-metrics")
        )
          arm(articlesIn(node));
  };
  const stop = () => {
    rows?.disconnect();
    rows = null;
    watcher?.disconnect();
    watcher = null;
    for (const [id, row] of timers) {
      environment.clearTimeout(id);
      if (row.getAttribute("data-exf-clash") === "true") row.setAttribute("data-exf-clash", "done");
    }
    timers.clear();
    // Rows still waiting stand drawn.
    for (const row of waiting)
      if (row.getAttribute("data-exf-clash") === "") row.removeAttribute("data-exf-clash");
    waiting.clear();
  };
  const sync = () => {
    if (disposed) return;
    const constrained =
      connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    const allowed =
      !reducedMotion.matches && !constrained && html.dataset.worldEffects !== "economy";
    if (!allowed || document.hidden || html.hasAttribute("data-loading")) {
      stop();
      return;
    }
    if (watcher) return;
    rows = new environment.IntersectionObserver(onIntersect, { rootMargin: LINE, threshold: 0 });
    watcher = new environment.MutationObserver(onChange);
    watcher.observe(comparison, { childList: true });
    const metrics = comparison.querySelector(":scope > .rxs-comparison-metrics");
    if (metrics) arm(articlesIn(metrics));
  };
  const onPageHide = () => {
    if (!disposed) stop();
  };

  const attributes = new environment.MutationObserver(sync);
  attributes.observe(html, {
    attributes: true,
    attributeFilter: ["data-world-effects", "data-loading"],
  });
  reducedMotion.addEventListener?.("change", sync);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", sync);
  sync();

  return () => {
    if (disposed) return;
    disposed = true;
    attributes.disconnect();
    reducedMotion.removeEventListener?.("change", sync);
    connection?.removeEventListener?.("change", sync);
    document.removeEventListener("visibilitychange", sync);
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", sync);
    stop();
  };
}
