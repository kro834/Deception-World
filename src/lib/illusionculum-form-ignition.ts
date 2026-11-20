/** ILLUSIONCULUM SAGA — #forms: a switch into ウルトラ by red fire (owner,
 * 2026-11-20). FAR FROM's form ignition (far-from-form-ignition.ts) in this
 * page's terms: the old picture gives way to the old form's full figure,
 * which is engulfed and burns (illusionculum-fire.ts); at the fire's peak
 * the ウルトラ figure comes through the flame, and the owner's ウルトラ key
 * visual — the real picture in the panel — takes the frame as the fire dies.
 * The last frame is that picture itself: the overlay is gone.
 *
 * A lazy chunk: the panel imports it only when a switch into ウルトラ starts
 * where motion is allowed. */

import {
  buildIllusionculumFireBody,
  drawIllusionculumFire,
  illusionculumFireBody,
  illusionculumFireFades,
} from "./illusionculum-fire.ts";
import { illusionculumCutout, type IllusionculumFormKey } from "./illusionculum-saga-artwork.ts";
import { releasePendingImage } from "./release-pending-images.js";

export const ILLUSIONCULUM_FORM_IGNITION_MS = 2000;
/** The runway engine's backing-store budget (rexonance-resonance.js). */
const RUNWAY_PIXEL_BUDGET = 2_600_000;

const ramp = (from: number, to: number, u: number) => {
  const t = Math.max(0, Math.min(1, (u - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Mounts the burn on `canvas` (inside the overlay that also holds the old
 * picture, `portrait`). `destination` is the panel's new picture. */
export function mountIllusionculumFormIgnition(
  canvas: HTMLCanvasElement,
  portrait: HTMLImageElement,
  destination: HTMLImageElement,
  previous: IllusionculumFormKey,
  stage: IllusionculumFormKey,
  onFinish: () => void,
) {
  const scene = canvas.parentElement!;
  let disposed = false;
  let ended = false;
  let handedOff = false;
  let decoded = "";
  let release: (() => void) | undefined;

  // A new picture that failed to load: the overlay (opaque, over the panel)
  // must not stay on the panel for good, so the hand-off stops waiting.
  let failed = false;
  const destinationReady = () =>
    failed ||
    Boolean(decoded && destination.complete && destination.naturalWidth && decoded === destination.currentSrc);
  const handOff = () => {
    if (disposed || handedOff || !ended || !destinationReady()) return;
    handedOff = true;
    onFinish();
  };
  const checkDestination = () => {
    if (!destination.complete || !destination.naturalWidth) return;
    const source = destination.currentSrc;
    const settle = () => {
      if (disposed || source !== destination.currentSrc) return;
      decoded = source;
      handOff();
    };
    // decode() can reject for a picture that is loaded all the same (a
    // browser quirk, not a missing file): it is drawable, so it holds the
    // frame; a source swapped meanwhile waits for its own load.
    void destination.decode().then(settle, () => {
      if (destination.complete && destination.naturalWidth) settle();
    });
  };
  const destinationFailed = () => {
    failed = true;
    handOff();
  };
  destination.addEventListener("load", checkDestination);
  destination.addEventListener("error", destinationFailed);
  // Already broken before the burn mounted: no error event will come.
  if (destination.complete && !destination.naturalWidth && destination.currentSrc) failed = true;
  checkDestination();

  const finish = () => {
    if (disposed || ended) return;
    ended = true;
    release?.();
    release = undefined;
    handOff();
  };

  const context = canvas.getContext("2d");
  if (!context) finish();
  else {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const size = coarse ? 480 : 960;
    const from = new Image();
    const to = new Image();
    from.src = illusionculumCutout(previous, size);
    to.src = illusionculumCutout(stage, size);
    let frame = 0;
    let startedAt = 0;
    let width = 0;
    let height = 0;
    const tick = (now: number) => {
      if (disposed || ended) return;
      if (!startedAt) startedAt = now;
      const u = Math.min(1, Math.max(0, (now - startedAt) / ILLUSIONCULUM_FORM_IGNITION_MS));
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) {
        finish();
        return;
      }
      if (w !== width || h !== height) {
        width = w;
        height = h;
        const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.6, 1000 / Math.max(w, h));
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
      }
      // The full figure, a little inside the panel's 2:3 frame.
      const figureH = Math.min(h * 0.9, w * 1.35);
      const figureW = (figureH * 2) / 3;
      context.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      context.clearRect(0, 0, w, h);
      context.translate((w - figureW) / 2, h * 0.53 - figureH / 2);
      const fades = illusionculumFireFades(u);
      context.globalAlpha = fades.from;
      if (fades.from > 0) context.drawImage(from, 0, 0, figureW, figureH);
      context.globalAlpha = fades.to;
      if (fades.to > 0) context.drawImage(to, 0, 0, figureW, figureH);
      context.globalAlpha = 1;
      drawIllusionculumFire(context, u, figureW, figureH, coarse, illusionculumFireBody(previous));
      // The old picture gives way slowly to its burning figure; the new
      // picture takes the frame while the fire is still dying (no dark gap
      // between the fire and the red key visual).
      portrait.style.opacity = String(1 - ramp(0, 0.16, u));
      scene.style.opacity = destinationReady() ? String(1 - ramp(0.55, 0.92, u)) : "1";
      if (u === 1) finish();
      else frame = window.requestAnimationFrame(tick);
    };
    const deadline = window.setTimeout(finish, 3200);
    release = () => {
      window.clearTimeout(deadline);
      window.cancelAnimationFrame(frame);
      releasePendingImage(from);
      releasePendingImage(to);
    };
    Promise.all([from.decode(), to.decode()]).then(() => {
      if (disposed || ended) return;
      window.clearTimeout(deadline);
      // The old form's field: built once (cached for later switches) before
      // the first frame, so the burn starts on a ready field.
      buildIllusionculumFireBody(previous, from, document);
      frame = window.requestAnimationFrame(tick);
    }, finish);
  }

  return () => {
    disposed = true;
    destination.removeEventListener("load", checkDestination);
    destination.removeEventListener("error", destinationFailed);
    release?.();
  };
}

/** The suit-up runway at rest on its finished figure (owner, 2026-11-20):
 * a form chosen there is past the scroll's chain, so the engine would show
 * the new sheet at once. A choice into ウルトラ burns instead, on `canvas`
 * (inset 0 over the engine's canvas, the same figure box the engine computes
 * from the frame's --rzn-fig-*), with the engine's canvas hidden for the
 * burn (`data-ics-burning` on the runway). Its last frame is the engine's
 * own: the new sheet in the same place, so the hand-back is seamless. */
export function mountIllusionculumRunwayIgnition(
  runway: HTMLElement,
  canvas: HTMLCanvasElement,
  fromSrc: string,
  toSrc: string,
  previous: IllusionculumFormKey,
  size: { readonly width: number; readonly height: number },
  onFinish: () => void,
) {
  let disposed = false;
  let ended = false;
  let frame = 0;
  const context = canvas.getContext("2d");
  const from = new Image();
  const to = new Image();
  from.src = fromSrc;
  to.src = toSrc;
  const finish = () => {
    if (ended) return;
    ended = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(deadline);
    delete runway.dataset.icsBurning;
    if (!disposed) onFinish();
  };
  const deadline = window.setTimeout(finish, 3200);
  if (!context) {
    finish();
    return () => {};
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  let startedAt = 0;
  let width = 0;
  let height = 0;
  let heightShare = 0.84;
  let widthShare = 0.9;
  let centreX = 0.5;
  let bottom = 0.05;
  const tick = (now: number) => {
    if (disposed || ended) return;
    if (!startedAt) startedAt = now;
    const u = Math.min(1, Math.max(0, (now - startedAt) / ILLUSIONCULUM_FORM_IGNITION_MS));
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) {
      finish();
      return;
    }
    if (w !== width || h !== height) {
      width = w;
      height = h;
      // The engine's own backing-store budget (rexonance-resonance.js
      // PIXEL_BUDGET): a full-frame canvas at 2x on a large screen is
      // 5-15 MP, cleared and composited every frame of the burn.
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        coarse ? 1.5 : 2,
        Math.sqrt(RUNWAY_PIXEL_BUDGET / (w * h)),
      );
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      // The engine's figure box (rexonance-resonance.js, its view): read on
      // a size change only, not a style read every frame.
      const style = window.getComputedStyle(canvas);
      heightShare = Number.parseFloat(style.getPropertyValue("--rzn-fig-h")) || 0.84;
      widthShare = Number.parseFloat(style.getPropertyValue("--rzn-fig-w")) || 0.9;
      centreX = Number.parseFloat(style.getPropertyValue("--rzn-fig-x")) || 0.5;
      bottom = Number.parseFloat(style.getPropertyValue("--rzn-fig-b")) || 0.05;
    }
    const bw = canvas.width;
    const bh = canvas.height;
    const figureH = Math.min(h * heightShare, (w * widthShare * size.height) / size.width);
    const figureW = (figureH * size.width) / size.height;
    context.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    context.clearRect(0, 0, w, h);
    context.translate(w * centreX - figureW / 2, h * (1 - bottom) - figureH);
    const fades = illusionculumFireFades(u);
    context.globalAlpha = fades.from;
    if (fades.from > 0) context.drawImage(from, 0, 0, figureW, figureH);
    context.globalAlpha = fades.to;
    if (fades.to > 0) context.drawImage(to, 0, 0, figureW, figureH);
    context.globalAlpha = 1;
    drawIllusionculumFire(context, u, figureW, figureH, coarse, illusionculumFireBody(previous));
    if (u === 1) finish();
    else frame = window.requestAnimationFrame(tick);
  };
  const start = () => {
    if (disposed || ended || runway.dataset.icsBurning) return;
    buildIllusionculumFireBody(previous, from, document);
    runway.dataset.icsBurning = "true";
    tick(performance.now());
  };
  // The engine already holds both sheets: in the usual case they are
  // complete now and the burn takes the frame before the engine's next
  // draw shows the new form.
  if (from.complete && from.naturalWidth && to.complete && to.naturalWidth) start();
  else Promise.all([from.decode(), to.decode()]).then(start, finish);
  return () => {
    disposed = true;
    finish();
    releasePendingImage(from);
    releasePendingImage(to);
  };
}
