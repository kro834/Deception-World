/** META UNITAS SAGA — #stages' switch into ウルトラ by white fire (owner,
 * 2026-11-20; meta-unitas-white-fire.ts). FAR FROM's form ignition
 * (far-from-form-ignition.ts) in Meta Unitas' terms: the ミドル portrait
 * gives way to its full-body cutout, which is engulfed from the reactor out
 * and burns; ウルトラ's cutout is revealed from the flame; the overlay then
 * fades onto the panel's own ウルトラ picture, decoded underneath. */

import { usesTouchBudget } from "./rendering-profile.js";
import { META_UNITAS_RX_FIGURE, META_UNITAS_RX_FORMS, META_UNITAS_RX_MARKS, META_UNITAS_RX_SIZE } from "./meta-unitas-rx-suit.ts";
import { bakeWhiteFireFuel, createWhiteFire, type WhiteFireFuel } from "./meta-unitas-white-fire.ts";
import { releasePendingImage } from "./release-pending-images.js";

export const META_UNITAS_IGNITION_MS = 1850;
/** How long the overlay may wait for its pictures before the burn, and for
 * the panel's ウルトラ after it: neither ever holds the panel longer. */
export const META_UNITAS_IGNITION_WAIT_MS = 2350;

const CORE = [
  META_UNITAS_RX_MARKS.core[0] / META_UNITAS_RX_SIZE.width,
  META_UNITAS_RX_MARKS.core[1] / META_UNITAS_RX_SIZE.height,
] as const;

const fade = (from: number, to: number, u: number) => {
  const t = Math.max(0, Math.min(1, (u - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Plays the burn on `canvas`; `portrait` (ミドル's picture) fades into
 * it, and the overlay (the canvas' parent) fades out onto `destination`
 * once that is decoded. `onFinish` once it is over. */
export function mountMetaUnitasFormIgnition(
  canvas: HTMLCanvasElement,
  portrait: HTMLImageElement,
  destination: HTMLImageElement | null,
  onFinish: () => void,
) {
  const scene = canvas.parentElement!;
  let disposed = false;
  let ended = false;
  let decoded = false;
  let frame = 0;
  let deadline = 0;
  const context = canvas.getContext("2d");
  // (Owner, 2026-11-23: touch screens in high quality draw the desktop fire.)
  const coarse = usesTouchBudget(window.matchMedia("(pointer: coarse)").matches);
  const fire = context ? createWhiteFire(canvas.ownerDocument, coarse) : null;
  const from = new Image();
  const to = new Image();
  from.src = META_UNITAS_RX_FIGURE;
  to.src = META_UNITAS_RX_FORMS.ultra;
  let fuel: WhiteFireFuel | null = null;

  // The panel's ウルトラ is ready once it is loaded and decoded (a rejected
  // decode is not: the overlay holds until the deadline instead).
  const ready = () =>
    !destination || (decoded && destination.complete && destination.naturalWidth > 0);
  const checkDestination = () => {
    if (!destination || !destination.complete || !destination.naturalWidth) return;
    void destination.decode().then(() => {
      decoded = true;
    }, () => {});
  };
  destination?.addEventListener("load", checkDestination);
  checkDestination();
  const release = () => {
    destination?.removeEventListener("load", checkDestination);
    window.cancelAnimationFrame(frame);
    window.clearTimeout(deadline);
    fire?.release();
    releasePendingImage(from);
    releasePendingImage(to);
  };
  const finish = () => {
    if (disposed || ended) return;
    ended = true;
    release();
    onFinish();
  };
  // A stalled decode never holds the panel: ウルトラ is shown regardless.
  deadline = window.setTimeout(finish, META_UNITAS_IGNITION_MS + META_UNITAS_IGNITION_WAIT_MS);

  let startedAt = 0;
  let width = 0;
  let height = 0;
  const tick = (now: number) => {
    if (disposed || ended || !context || !fire || !fuel) return;
    if (!startedAt) startedAt = now;
    const u = Math.min(1, (now - startedAt) / META_UNITAS_IGNITION_MS);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return finish();
    if (w !== width || h !== height) {
      width = w;
      height = h;
      const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.6, 1000 / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    }
    // The cutout in the panel's 3 : 4 frame, standing as the portrait does.
    const figureH = Math.min(h * 0.94, (w * 1.5) / 1.06);
    const figureW = (figureH * 2) / 3;
    context.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    context.clearRect(0, 0, w, h);
    context.translate((w - figureW) / 2, h * 0.52 - figureH / 2);
    fire.draw(context, from, to, fuel, u, figureW, figureH);
    portrait.style.opacity = String(1 - fade(0, 0.1, u));
    if (u >= 0.86 && ready()) scene.style.opacity = String(1 - fade(0.86, 1, u));
    if (u >= 1) {
      if (ready()) return finish();
      // Hold ウルトラ's cutout until the panel's picture can take over.
      scene.style.opacity = "1";
    }
    frame = window.requestAnimationFrame(tick);
  };

  if (context && fire) {
    Promise.all([from.decode(), to.decode()]).then(() => {
      if (disposed || ended) return;
      fuel = bakeWhiteFireFuel(canvas.ownerDocument, from, CORE);
      if (!fuel) return finish();
      // The burn plays whole once it starts (as FAR FROM's does): the
      // deadline armed at mount would cut a burn whose pictures were slow to
      // arrive mid-fire. It is re-armed to bound only the burn and the hold
      // for the panel's ウルトラ after it.
      window.clearTimeout(deadline);
      deadline = window.setTimeout(finish, META_UNITAS_IGNITION_MS + META_UNITAS_IGNITION_WAIT_MS);
      frame = window.requestAnimationFrame(tick);
    }, finish);
  } else finish();

  return () => {
    disposed = true;
    release();
  };
}
