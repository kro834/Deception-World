/* RESONANCE FIELD: the camera and the impact grammar. The camera is a
   closed-form function of the field's state: a slow push while the field is
   charged, a punch on every lock that settles exponentially, a follow toward
   the group being printed, and a return to exact identity before the seal
   (so the finished figure lands pixel-exact and the pinned light-up plays
   on a still frame). The impact grammar is the one-frame luminance pop and
   the radial burst a lock gets; both are functions of the clock, drawn only
   on moving frames. Units: zoom is a factor, pans are figure heights. */

import { FIELD_STATE } from "./field-score.js";

export const FIELD_CAMERA = Object.freeze({
  // Owner (2026-10-21, on production): 「全身が上下するのも治して」 — the whole
  // figure bobbed with the camera's push, punches and follow. The body must
  // stand still: every motion below is zero, and the rig stays identity
  // throughout (the constants are kept so a subtle zoom can return, but no
  // pan may ever move the body vertically).
  /** The push while the field is charged, by take (restrained, standard, bold). */
  push: Object.freeze([0, 0, 0]),
  /** A lock's punch at full strength; the burst's (爆散) punch, over this
   * share of the wake. */
  punch: 0,
  burst: 0,
  burstSpan: 0.5,
  /** The punch's attack (share of the impulse span) and its decay rate. */
  attack: 0.1,
  decay: 5.5,
  /** The follow toward the group, as a share of its offset from the pivot. */
  follow: 0,
  /** The lateral drift at full charge (figure heights). */
  drift: 0,
  /** The pivot the zoom is about, in figure heights down from the crown
   * (just above the soles, so the boots stay in the frame). */
  pivotY: 0.86,
  /** Never past these. */
  maxZoom: 1.1,
  maxPan: 0.04,
});

/** The camera buffer: zoom, pan x, pan y (figure heights), pivot y. */
export const fieldCameraBuffer = () => Float32Array.of(1, 0, 0, FIELD_CAMERA.pivotY);

/** A lock's punch by its age (0..1 over the impulse span): a sharp attack,
 * an exponential settle. Zero at and past the span. */
export function fieldPunch(age) {
  if (!(age > 0) || age >= 1) return 0;
  const { attack, decay } = FIELD_CAMERA;
  const rise = age < attack ? age / attack : 1;
  const fall = Math.exp(-decay * Math.max(0, age - attack));
  const tail = 1 - age;
  return rise * fall * tail;
}

/**
 * The camera at this state, written into `out` (fieldCameraBuffer). The
 * figure's height is the unit: `height` converts the attractor's figure px.
 * Identity exactly while the field is uncharged, and from the collapse's
 * end on (the charge is zero and the impulses have aged out before it).
 */
export function fieldCamera(state, take, height, out) {
  const F = FIELD_STATE;
  const C = FIELD_CAMERA;
  const charge = state[F.CHARGE];
  const detonate = state[F.DETONATE];
  const wake = state[F.WAKE];
  // The detonation plays on a still camera: the light-up is the owner's.
  const live = detonate > 0 ? 0 : charge;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  // The burst: a punch as the fragments fly, settling as the field forms.
  if (wake > 0 && wake < 1 && detonate <= 0) zoom += C.burst * fieldPunch(wake / C.burstSpan);
  if (live > 0) {
    const gain = C.push[Math.min(2, Math.max(0, take.camera | 0))];
    zoom += gain * live;
    panX += take.drift * C.drift * live;
    // Follow the group: the content shifts so the group nears the pivot.
    const offset = state[F.AY] / height - C.pivotY;
    panY -= offset * C.follow * state[F.TIGHT] * live;
    const count = state[F.IMPULSES];
    for (let k = 0; k < count; k += 1) {
      const o = F.IMPULSE + k * F.IMPULSE_STRIDE;
      zoom += C.punch * state[o + 3] * fieldPunch(state[o + 2]) * live;
    }
  }
  out[0] = Math.min(C.maxZoom, zoom);
  out[1] = Math.max(-C.maxPan, Math.min(C.maxPan, panX));
  out[2] = Math.max(-C.maxPan, Math.min(C.maxPan, panY));
  out[3] = C.pivotY;
  return out;
}

/** The camera applied to a scene's view: the figure drawn at `scale`
 * (device px per figure px) from (`x`, `y`); returns the zoomed scale and
 * origin in `out` [scale, x, y]. The zoom is about the pivot on the body's
 * axis; the pans shift the content. */
export function fieldCameraView(camera, width, height, scale, x, y, out) {
  const zoom = camera[0];
  const px = width / 2;
  const py = camera[3] * height;
  out[0] = scale * zoom;
  out[1] = x + px * scale * (1 - zoom) + camera[1] * height * scale;
  out[2] = y + py * scale * (1 - zoom) + camera[2] * height * scale;
  return out;
}

export const FIELD_IMPACT = Object.freeze({
  /** The luminance pop's alpha at a full flash, and its three discs' radii
   * (figure heights) about the lock. */
  pop: 0.16,
  discs: Object.freeze([0.12, 0.26, 0.46]),
  /** Radial burst: lines, their reach (figure heights), the burst's span
   * as a share of the impulse span. */
  rays: 22,
  reach: 0.3,
  burst: 0.3,
});

/**
 * Draws the impact grammar for the freshest impulse on a 2D context whose
 * transform maps figure px: a luminance pop about the lock (three soft
 * discs, never a box: a canvas's edge must not show) and a radial burst of
 * rays from it. `hash(i, salt)` seeds the rays. `additive` draws with
 * "lighter" (the scroll scene); the entry keeps source-over (its engine
 * uses no composite operation), and without "lighter" the discs would be
 * grey plates, so `pop` is off there by default: its lock flash is the
 * field's own and the camera's. Nothing allocates; nothing draws without a
 * live impulse. Only moving frames call this: a resting scrub shows no flash.
 */
export function drawFieldImpact(
  context,
  state,
  width,
  height,
  hash,
  rays = true,
  additive = true,
  pop = additive,
) {
  const F = FIELD_STATE;
  if (!(state[F.IMPULSES] > 0) || (!rays && !pop)) return false;
  const o = F.IMPULSE;
  const age = state[o + 2];
  const strength = state[o + 3];
  const flash = state[F.FLASH];
  const I = FIELD_IMPACT;
  const x = state[o];
  const y = state[o + 1];
  let drew = false;
  context.save();
  if (additive) context.globalCompositeOperation = "lighter";
  if (pop && flash > 0) {
    context.fillStyle = "#dff7ff";
    for (let k = 0; k < I.discs.length; k += 1) {
      context.globalAlpha = (I.pop * flash * strength) / (k + 1);
      context.beginPath();
      context.arc(x, y, I.discs[k] * height, 0, Math.PI * 2);
      context.fill();
    }
    drew = true;
  }
  if (rays && age < I.burst) {
    const u = age / I.burst;
    const reach = I.reach * height * (0.35 + 0.65 * (1 - (1 - u) * (1 - u) * (1 - u)));
    context.globalAlpha = 0.55 * (1 - u) * strength;
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(1, height * 0.0016 * (1 - u * 0.6));
    context.beginPath();
    for (let i = 0; i < I.rays; i += 1) {
      const a = (i / I.rays) * Math.PI * 2 + hash(i, 97) * 0.22;
      const inner = reach * (0.25 + 0.35 * hash(i, 31)) * u;
      const outer = reach * (0.6 + 0.4 * hash(i, 53));
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      context.moveTo(x + cos * inner, y + sin * inner);
      context.lineTo(x + cos * outer, y + sin * outer);
    }
    context.stroke();
    drew = true;
  }
  context.restore();
  return drew;
}
