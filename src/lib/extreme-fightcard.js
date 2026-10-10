/* FIGHT CARD (rx15): the Extreme page's tale of the tape, driven for
   src/styles-extreme-fightcard.css.

   The console's bars slam in when it is first reached (the IMPACT
   engine's hit on .rxs-comparison) and again whenever the challenger
   changes: React re-keys .rxs-comparison-metrics, and this engine keys
   the new rows with data-exf-clash, a one-shot key ("true" for the beat,
   then "done"), so a rule that stands down under the side menu, a dialog
   or the loading cover never replays when the page comes back.

   It only listens (one MutationObserver on the comparison's children,
   no scroll or pointer listener) and follows reduced motion, economy
   rendering, Save-Data / 2g, the load gate, page visibility and the
   bfcache; everything is released symmetrically on unmount. */

// The latest beat it starts: the fourth row's burst ends at 270 + 400 + 520 ms.
export const CLASH_MS = 1300;

export function mountExtremeFightCard(page, environment = window) {
  if (!page) return () => {};
  const document = page.ownerDocument;
  const html = document.documentElement;
  const connection = environment.navigator?.connection;
  const reducedMotion = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const comparison = page.querySelector(".rxs-comparison");
  if (!comparison || !environment.MutationObserver) return () => {};

  const timers = new Map();
  let watcher = null;
  let disposed = false;

  const retireAll = () => {
    for (const [id, element] of timers) {
      environment.clearTimeout(id);
      if (element.getAttribute("data-exf-clash") === "true")
        element.setAttribute("data-exf-clash", "done");
    }
    timers.clear();
  };
  const clash = (element) => {
    element.setAttribute("data-exf-clash", "true");
    const id = environment.setTimeout(() => {
      timers.delete(id);
      if (element.getAttribute("data-exf-clash") === "true")
        element.setAttribute("data-exf-clash", "done");
    }, CLASH_MS);
    timers.set(id, element);
  };
  const onChange = (records) => {
    // Rows that arrive before the console is reached wait for its hit.
    if ((comparison.getAttribute("data-exi-hit") ?? "true") === "") return;
    for (const record of records)
      for (const node of record.addedNodes)
        if (node.nodeType === 1 && node.matches?.(".rxs-comparison-metrics")) clash(node);
  };
  const stop = () => {
    watcher?.disconnect();
    watcher = null;
    retireAll();
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
    watcher = new environment.MutationObserver(onChange);
    watcher.observe(comparison, { childList: true });
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
