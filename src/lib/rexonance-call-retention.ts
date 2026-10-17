/** Keep one prepared kit for visible World ↔ Rexonance return visits, not
 * for the entire session. No downloads, preparations or animation frames. */
export function createRexonanceCallRetention(
  release: () => void,
  drawing: () => boolean,
  environment = window,
) {
  let timer = 0;
  let watching = false;
  let leaving = false;
  const document = environment.document;
  const cancel = () => {
    if (timer) environment.clearTimeout(timer);
    timer = 0;
    watching = false;
    document.removeEventListener("visibilitychange", check);
    environment.removeEventListener("pagehide", pagehide);
  };
  function pagehide() {
    leaving = true;
    check();
  }
  function check() {
    if (timer) environment.clearTimeout(timer);
    timer = 0;
    if (!watching) return;
    const retain =
      !leaving &&
      !document.hidden &&
      /^\/(world|rexonance-saga)\/?$/.test(environment.location.pathname) &&
      document.documentElement.dataset.worldEffects !== "economy" &&
      !environment.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Never zero a canvas or close an ImageBitmap still owned by a call.
    if (!drawing() && !retain) {
      cancel();
      release();
      return;
    }
    timer = environment.setTimeout(check, 1000);
  }
  return {
    acquire: cancel,
    retain() {
      cancel();
      watching = true;
      leaving = false;
      document.addEventListener("visibilitychange", check);
      environment.addEventListener("pagehide", pagehide);
      check();
    },
  };
}
