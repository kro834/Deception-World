import { usesTouchBudget } from "./rendering-profile.js";
import { drawFarFromFormCombustion } from "./far-from-form-combustion.ts";
import { warmFarFromFireMask } from "./far-from-flame-field.ts";
import { releasePendingImage } from "./release-pending-images.js";
import { warmFarFromFormPlumes } from "./far-from-form-plumes.ts";
import type { FarFromStageKey } from "./far-from-saga-artwork.ts";
import { FAR_FROM_SUIT_FIGURE, FAR_FROM_SUIT_FORMS } from "./far-from-suit.ts";
import { farFromUltraSrc } from "./far-from-ultra-art.ts";

export const FAR_FROM_FORM_IGNITION_MS = 1850;
const SUITS = { middle: FAR_FROM_SUIT_FIGURE, ...FAR_FROM_SUIT_FORMS, ultra: farFromUltraSrc("body", 768) };

export function farFromCompletedSuit(stage: FarFromStageKey) {
  return stage === "ultra" ? farFromUltraSrc("interface", 768) : SUITS[stage];
}

function fade(from: number, to: number, u: number) {
  const t = Math.max(0, Math.min(1, (u - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export type FarFromIgnitionOptions = {
  previous: FarFromStageKey;
  stage: FarFromStageKey;
  delayMs: number;
  onReveal: (stage: FarFromStageKey) => void;
};

/** The destination is the actual responsive portrait in the figure. Its
 * download is independent of both full-body cutouts used by the canvas. */
export function mountFarFromFormIgnition(
  canvas: HTMLCanvasElement, portrait: HTMLImageElement, destination: HTMLImageElement,
  { previous, stage, delayMs, onReveal }: FarFromIgnitionOptions, onFinish: () => void,
) {
  const scene = canvas.parentElement!;
  let disposed = false;
  let animationEnded = false;
  let handedOff = false;
  let revealed = false;
  let decodedSource = "";
  let releaseMotion: (() => void) | undefined;

  const reveal = () => {
    if (revealed) return;
    revealed = true;
    onReveal(stage);
  };
  const destinationReady = () => Boolean(decodedSource && destination.complete &&
    destination.naturalWidth && decodedSource === destination.currentSrc);
  const handOff = () => {
    if (disposed || handedOff || !animationEnded || !destinationReady()) return;
    handedOff = true;
    reveal();
    onFinish();
  };
  const checkDestination = () => {
    if (!destination.complete || !destination.naturalWidth) return;
    const source = destination.currentSrc;
    void destination.decode().then(() => {
      if (disposed || source !== destination.currentSrc) return;
      decodedSource = source;
      handOff();
    }, () => {});
  };
  destination.addEventListener("load", checkDestination);
  checkDestination();

  const finishMotion = () => {
    if (disposed || animationEnded) return;
    animationEnded = true;
    releaseMotion?.();
    releaseMotion = undefined;
    handOff();
  };
  const context = canvas.getContext("2d");
  if (context) {
    // (Owner, 2026-11-23: touch screens in high quality draw the desktop fire.)
    const coarse = usesTouchBudget(window.matchMedia("(pointer: coarse)").matches);
    const releasePlumes = warmFarFromFormPlumes();
    const prepare = () => warmFarFromFireMask(previous);
    const idle = typeof window.requestIdleCallback === "function";
    const warmHandle = idle ? window.requestIdleCallback(prepare) : window.setTimeout(prepare, 0);
    const from = new Image();
    const to = new Image();
    from.src = farFromCompletedSuit(previous);
    to.src = SUITS[stage];
    const earliest = performance.now() + delayMs;
    let frame = 0;
    let startedAt = 0;
    let width = 0;
    let height = 0;
    const tick = (now: number) => {
      if (disposed || animationEnded) return;
      if (!startedAt) startedAt = Math.max(now, earliest);
      const u = Math.min(1, Math.max(0, (now - startedAt) / FAR_FROM_FORM_IGNITION_MS));
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) {
        finishMotion();
        return;
      }
      if (w !== width || h !== height) {
        width = w;
        height = h;
        const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.35 : 1.6, 1000 / Math.max(w, h));
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
      }
      const figureH = Math.min(h * 0.83, w * 1.23);
      const figureW = figureH * 2 / 3;
      context.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      context.clearRect(0, 0, w, h);
      context.translate((w - figureW) / 2, h * 0.55 - figureH / 2);
      context.globalAlpha = 1 - fade(0.49, 0.65, u);
      context.drawImage(from, 0, 0, figureW, figureH);
      context.globalAlpha = fade(0.54, 0.78, u);
      context.drawImage(to, 0, 0, figureW, figureH);
      context.globalAlpha = 1;
      drawFarFromFormCombustion(context, stage, u, figureW, figureH, coarse, undefined, previous);
      portrait.style.opacity = String(1 - fade(0, 0.10, u));
      scene.style.opacity = u > 0.86 && destinationReady() ? String(1 - fade(0.86, 1, u)) : "1";
      if (u >= 0.60) reveal();
      if (u === 1) finishMotion();
      else frame = window.requestAnimationFrame(tick);
    };
    const deadline = window.setTimeout(finishMotion, delayMs + 3200);
    releaseMotion = () => {
      releasePlumes();
      if (idle) window.cancelIdleCallback(warmHandle);
      else window.clearTimeout(warmHandle);
      window.clearTimeout(deadline);
      window.cancelAnimationFrame(frame);
      releasePendingImage(from);
      releasePendingImage(to);
    };
    Promise.all([from.decode(), to.decode()]).then(() => {
      if (disposed || animationEnded) return;
      window.clearTimeout(deadline);
      frame = window.requestAnimationFrame(tick);
    }, finishMotion);
  } else finishMotion();

  return () => {
    disposed = true;
    destination.removeEventListener("load", checkDestination);
    releaseMotion?.();
  };
}
