export const CINEMA_EXIT_MS = 650;

/** Preserve the browser's modified-click, target and download behavior. */
export function shouldAnimateCinemaClick(event) {
  const anchor = event.currentTarget;
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (anchor.target && anchor.target.toLowerCase() !== "_self") ||
    anchor.hasAttribute("download")
  );
}

/** A finite exit, independent of route loading and animationend delivery.
 * @param {{ onActive: (active: boolean) => void, navigate: () => void }} callbacks
 * @param {Window} environment
 */
export function createCinemaExit({ onActive, navigate }, environment = window) {
  const doc = environment.document;
  const media = environment.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let active = false;
  let generation = 0;
  let timer = 0;
  let observer = null;

  const motionAllowed = () =>
    !media.matches &&
    !doc.hidden &&
    doc.documentElement.dataset.worldEffects !== "economy" &&
    !doc.querySelector('[data-motion-enabled="false"]');

  const clear = () => {
    environment.clearTimeout(timer);
    timer = 0;
    observer?.disconnect();
    observer = null;
    media.removeEventListener("change", onPreference);
    doc.removeEventListener("visibilitychange", onPreference);
  };
  const cancel = () => {
    active = false;
    generation += 1;
    clear();
    if (!disposed) onActive(false);
  };
  const finish = () => {
    if (disposed || !active) return;
    cancel();
    navigate();
  };
  const onPreference = () => {
    if (active && !motionAllowed()) finish();
  };
  // pagehide cancels a pending redirect when another navigation wins. A
  // pageshow reset also clears any React cover frozen in the back/forward cache.
  environment.addEventListener("pagehide", cancel);
  environment.addEventListener("pageshow", cancel);

  return {
    begin() {
      if (disposed) return false;
      if (active) return true;
      if (!motionAllowed()) return false;
      active = true;
      const attempt = ++generation;
      timer = environment.setTimeout(() => {
        if (attempt === generation) finish();
      }, CINEMA_EXIT_MS);
      media.addEventListener("change", onPreference);
      doc.addEventListener("visibilitychange", onPreference);
      observer = new environment.MutationObserver(onPreference);
      observer.observe(doc.documentElement, {
        attributes: true,
        subtree: true,
        attributeFilter: ["data-world-effects", "data-motion-enabled"],
      });
      onActive(true);
      return true;
    },
    dispose() {
      disposed = true;
      active = false;
      generation += 1;
      clear();
      environment.removeEventListener("pagehide", cancel);
      environment.removeEventListener("pageshow", cancel);
    },
  };
}
