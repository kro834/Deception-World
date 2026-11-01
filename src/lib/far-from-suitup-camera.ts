/** FAR FROM SAGA — the scroll suit-up's camera (round 2, owner 2026-11-01:
 * 「装着アニメーションを大きく改善して」).
 *
 * The scroll builds the suit group by group (ASSEMBLY_BEATS); the camera
 * follows it: a push through the torrent, in on the legs, the arms, up to
 * the chest and the shoulders, the waist, wide for the ornaments (the bits
 * come from well outside the figure), in on the helmet, then out to the
 * whole figure for the seal with a short punch that settles; a small jolt
 * as each group locks. A closed-form function of the progress (forward or
 * back, at rest or moving, as every frame of the scene).
 *
 * The scene calls it from its accents (far-from-assembly-accents.ts) each
 * frame with its own context: it moves the scene's canvases (the scene's
 * and the field's, which share one box) by CSS translate and scale — the
 * compositor's work, no repaint — and writes only when the pose changes.
 * The HUD, the call and the frame never move. Touch screens move less.
 * Only on the page's runway (.rzn-suitup): the transformation lab has its
 * own framing.
 */

import { ASSEMBLY_BEATS } from "./rexonance-resonance.js";

const B = ASSEMBLY_BEATS;
const quarter = (B.deus[1] - B.deus[0]) / 4;

/** The camera's keys: progress, zoom (1 + this), and the point of the
 * figure it holds (share of the figure's height from its top). */
export const FAR_FROM_CAMERA_KEYS = Object.freeze([
  [0, 0, 0.5],
  [B.motes[0], 0.01, 0.5],
  [B.deus[0], 0.05, 0.62],
  [B.deus[0] + quarter * 0.55, 0.11, 0.8],
  [B.deus[0] + quarter * 1.5, 0.09, 0.55],
  [B.deus[0] + quarter * 2.5, 0.11, 0.3],
  [B.deus[0] + quarter * 3.5, 0.08, 0.55],
  [B.rexonance[0] + 0.03, -0.02, 0.45],
  [B.rexonance[1] - 0.02, -0.02, 0.45],
  [B.clamp - 0.012, 0.12, 0.12],
  [B.seal[1], 0, 0.5],
  [B.seal[1] + 0.012, 0.025, 0.5],
  [B.complete, 0, 0.5],
  [1, 0, 0.5],
] as const);

/** The groups' locks (progress) the camera jolts on, and the jolt. */
export const FAR_FROM_CAMERA_JOLTS = Object.freeze([
  B.deus[0] + quarter,
  B.deus[0] + quarter * 2,
  B.deus[0] + quarter * 3,
  B.deus[1],
  B.rexonance[1],
  B.clamp - 0.012,
  B.seal[1],
]);
const JOLT = { amount: 0.004, decay: 0.0045, span: 0.02 } as const;

const smooth = (u: number) => u * u * (3 - 2 * u);

/** The camera at `progress`: its zoom (1 + z), the figure's point it holds
 * (share of its height), and the jolt (share of the frame's height). */
export function farFromCameraAt(progress: number, out: Float64Array) {
  const keys = FAR_FROM_CAMERA_KEYS;
  let z = 0;
  let fy = 0.5;
  for (let i = 1; i < keys.length; i += 1) {
    const [q1, z1, y1] = keys[i];
    if (progress > q1 && i < keys.length - 1) continue;
    const [q0, z0, y0] = keys[i - 1];
    const u = smooth(Math.min(1, Math.max(0, (progress - q0) / Math.max(1e-6, q1 - q0))));
    z = z0 + (z1 - z0) * u;
    fy = y0 + (y1 - y0) * u;
    break;
  }
  let jolt = 0;
  for (let i = 0; i < FAR_FROM_CAMERA_JOLTS.length; i += 1) {
    const d = progress - FAR_FROM_CAMERA_JOLTS[i];
    if (d < 0 || d > JOLT.span) continue;
    jolt += JOLT.amount * Math.exp(-d / JOLT.decay) * Math.sin((d / JOLT.decay) * Math.PI * 0.9);
  }
  out[0] = z;
  out[1] = fy;
  out[2] = jolt;
}

type CameraRig = {
  readonly frame: Element;
  /** The figure's place in the canvas: its height and its bottom margin
   * (shares, the stylesheet's --rzn-fig-h / --rzn-fig-b). */
  readonly figH: number;
  readonly figB: number;
  readonly gain: number;
  last: string;
};
const rigs = new WeakMap<object, CameraRig | null>();
const pose = new Float64Array(3);

const rigOf = (canvas: HTMLCanvasElement): CameraRig | null => {
  const known = rigs.get(canvas);
  if (known !== undefined) return known;
  const frame = canvas.parentElement;
  const view = canvas.ownerDocument?.defaultView;
  // Only the page's runway: the transformation lab frames the scene with its
  // own zoom (head, reactor, legs), so its canvas stands still.
  if (!frame || !view || !canvas.closest(".rzn-suitup")) {
    rigs.set(canvas, null);
    return null;
  }
  const style = view.getComputedStyle(canvas);
  const figH = Number.parseFloat(style.getPropertyValue("--rzn-fig-h")) || 0.84;
  const figB = Number.parseFloat(style.getPropertyValue("--rzn-fig-b")) || 0.05;
  const coarse = view.matchMedia?.("(pointer: coarse)").matches ?? false;
  const rig: CameraRig = {
    frame,
    figH,
    figB,
    gain: coarse ? 0.6 : 1,
    last: "",
  };
  rigs.set(canvas, rig);
  return rig;
};

/** Moves the scene's canvases to the camera's pose at `progress`. */
export function farFromCamera(context: CanvasRenderingContext2D, progress: number) {
  const canvas = context.canvas as HTMLCanvasElement | undefined;
  if (!canvas || typeof canvas !== "object" || !("style" in canvas) || !canvas.style) return;
  const rig = rigOf(canvas);
  if (!rig) return;
  farFromCameraAt(progress, pose);
  const z = pose[0] * rig.gain;
  // The held point, as a share of the canvas's height from its top; the
  // shift that keeps it in place, eased toward the middle, never showing
  // past the canvas's edge.
  const py = 1 - rig.figB - rig.figH * (1 - pose[1]);
  const limit = Math.max(0, z / 2);
  const shift = Math.max(-limit, Math.min(limit, (0.5 - py) * (z + 0.03 * rig.gain)));
  const y = (shift + pose[2] * rig.gain) * 100;
  const next =
    Math.abs(z) < 1e-4 && Math.abs(y) < 1e-3
      ? ""
      : `translate3d(0, ${y.toFixed(2)}%, 0) scale(${(1 + z).toFixed(4)})`;
  if (next === rig.last) return;
  rig.last = next;
  // The field's canvases arrive later than the scene's: found as it moves.
  canvas.style.transform = next;
  for (const field of rig.frame.querySelectorAll<HTMLElement>(":scope > canvas.rzn-field"))
    field.style.transform = next;
}
