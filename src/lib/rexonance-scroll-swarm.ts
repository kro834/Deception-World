import { decodeNaniteSeam, naniteHash } from "./rexonance-assembly-nanites.js";
import { REXONANCE_SCROLL_FLAME, scrollFlameAt } from "./rexonance-field/field-clock.js";
import {
  fireFragmentPose,
  NANITE_FIRE_FRAGMENTS,
  NANITE_FIRE_PHASES,
} from "./rexonance-ignition.js";
import { REXONANCE_NANITE_SEAMS } from "./rexonance-nanites.ts";
import { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_SIZE } from "./rexonance-suit.ts";
import type { SkinField } from "./rexonance-suit-skin";
import type { SurgePiece } from "./rexonance-suit-surge";

const { width, height } = REXONANCE_SUIT_SIZE;
const [axis, coreY] = REXONANCE_SUIT_MARKS.core;
const [eyeX, eyeY] = REXONANCE_SUIT_MARKS.visor;
const tau = Math.PI * 2;
const families = { desktop: 192, tablet: 96, phone: 60, low: 24 };
const perFamily = 12;
const colours = ["#66c7ed", "#ce8bd4", "#e1f8ff"];
const ease = (x: number) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

type Family = {
  head: boolean;
  birth: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  side: number;
  radius: number;
  drift: number;
  targetX: number;
  targetY: number;
  classic: number;
  skin: number;
};

type Context = Pick<
  CanvasRenderingContext2D,
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "fill"
  | "fillStyle"
  | "globalAlpha"
  | "globalCompositeOperation"
>;

/** A cooled fire fragment splits into a flock. Each grain docks at a distinct
 * point on a short stretch of the actual plate seam or at its keyed seat. */
export class RexonanceScrollSwarm {
  readonly count: number;
  private groups: Family[] = [];
  // Each grain's landing offset, two orbital offsets, phase lag and size.
  private grains: Float32Array;
  // Once per frame: projected centre and facet width. Signed width selects
  // the far/near canvas. The six colour/depth batches reuse these buffers.
  private screen: Float32Array;

  constructor(
    tier: string,
    pieces: readonly Pick<SurgePiece, "id" | "seat">[],
    windows: Float32Array,
  ) {
    const groups = pieces.length ? (families[tier as keyof typeof families] ?? families.low) : 0;
    this.count = groups * perFamily;
    this.grains = new Float32Array(this.count * 6);
    this.screen = new Float32Array(this.count * 3);
    const contours = pieces.map((piece) => decodeNaniteSeam(REXONANCE_NANITE_SEAMS[piece.id])[0]);
    const helmet = pieces
      .map((piece, i) => (piece.id.startsWith("helmet-") ? i : -1))
      .filter((i) => i >= 0);
    const pose = new Float64Array(6);
    for (let g = 0; g < groups; g++) {
      // Include the helmet in the late beats even in the smallest prefix.
      const p =
        g % 7 === 0 && helmet.length
          ? helmet[(g / 7) % helmet.length]
          : Math.floor(naniteHash(g, 71) * pieces.length);
      const piece = pieces[p];
      const loop = contours[p];
      const points = loop ? loop.length / 2 : 0;
      const seam = points && g % 5 !== 0;
      const index = Math.floor(naniteHash(g, 7) * points);
      const tx = seam ? loop[index * 2] : piece.seat[0];
      const ty = seam ? loop[index * 2 + 1] : piece.seat[1];
      const seed = (((g * 79) % NANITE_FIRE_FRAGMENTS) + 0.5) / NANITE_FIRE_FRAGMENTS;
      // The first cold position and velocity of the very same visible ember.
      let low: number = NANITE_FIRE_PHASES.materialStart;
      let high: number = NANITE_FIRE_PHASES.flameEnd;
      for (let n = 0; n < 10; n++) {
        const phase = (low + high) / 2;
        fireFragmentPose(seed, phase, pose);
        if (pose[4] > 0) low = phase;
        else high = phase;
      }
      fireFragmentPose(seed, high, pose);
      const classic =
        windows[p * 2] + (windows[p * 2 + 1] - windows[p * 2]) * (0.25 + 0.72 * naniteHash(g, 9));
      this.groups.push({
        head: piece.id.startsWith("helmet-"),
        birth: scrollFlameAt(high),
        x: width * pose[0],
        y: height * pose[1],
        vx: (width * pose[2]) / REXONANCE_SCROLL_FLAME.span,
        vy: (height * pose[3]) / REXONANCE_SCROLL_FLAME.span,
        phase: tau * naniteHash(g, 13),
        side: tx < axis ? -1 : 1,
        radius: 230 + 207 * naniteHash(g, 14),
        drift: 0.6 + naniteHash(g, 15),
        targetX: tx,
        targetY: ty,
        classic,
        skin: classic,
      });
      for (let k = 0; k < perFamily; k++) {
        const i = g * perFamily + k;
        const a = i * 6;
        // Fan along adjacent outline segments. The packet on a seat clicks
        // into a much smaller socket instead.
        const along = (k / (perFamily - 1) - 0.5) * Math.min(points / 3, 3);
        const knot = Math.floor(along);
        const b = seam ? ((index + knot + points) % points) * 2 : 0;
        const c = seam ? (b + 2) % loop.length : 0;
        const f = along - knot;
        this.grains[a] = seam
          ? loop[b] + (loop[c] - loop[b]) * f - tx
          : (naniteHash(i, 17) - 0.5) * 6;
        this.grains[a + 1] = seam
          ? loop[b + 1] + (loop[c + 1] - loop[b + 1]) * f - ty
          : (naniteHash(i, 18) - 0.5) * 6;
        this.grains[a + 2] = (naniteHash(i, 19) - 0.5) * 65;
        this.grains[a + 3] = (naniteHash(i, 20) - 0.5) * 34;
        this.grains[a + 4] = naniteHash(i, 21);
        this.grains[a + 5] = 1.9 + naniteHash(i, 23) ** 2 * 4.1;
      }
    }
  }

  /** Sample the same signed body/head front as the skin. Resolve once after
   * the skin decodes. The classic renderer keeps its own plate windows. */
  bindSkin(field: SkinField, reach: (value: number, head: boolean) => number) {
    const s = field.samples;
    const scale = width / field.w;
    for (const group of this.groups) {
      const first = group.head ? field.bodySamples : 0;
      const last = group.head ? field.bodySamples + field.headSamples : field.bodySamples;
      let best = Infinity;
      const x = group.targetX / scale,
        y = group.targetY / scale;
      for (let i = first * 6; i < last * 6; i += 6) {
        const distance = (s[i] - x) ** 2 + (s[i + 1] - y) ** 2;
        if (distance >= best) continue;
        best = distance;
        group.skin = s[i + 2];
      }
      if (best < Infinity) group.skin = reach(group.skin, group.head);
    }
  }

  draw(back: Context, front: Context, q: number, skin: boolean, scale: number, share: number) {
    if (q <= scrollFlameAt(NANITE_FIRE_PHASES.materialStart) || q >= 0.86) return 0;
    const groups = Math.floor(this.groups.length * Math.max(0, Math.min(1, share)));
    const screen = this.screen;
    const grains = this.grains;
    const minWidth = 1.2 / Math.max(0.05, scale);
    let live = 0;
    for (let g = 0; g < groups; g++) {
      const group = this.groups[g];
      const land = skin ? group.skin : group.classic;
      const age = q - group.birth;
      const first = g * perFamily;
      if (age <= 0 || q >= land + 0.005) {
        for (let i = first; i < first + perFamily; i++) screen[i * 3 + 2] = 0;
        continue;
      }
      const open = ease(age / 0.042);
      const capture = Math.min(0.195, (land - group.birth) * 0.72);
      const dock = ease(1 - (land - q) / capture);
      const angle = group.phase + age * (16 + 8 * group.drift);
      const cos = Math.cos(angle),
        sin = Math.sin(angle);
      // Eject, bank around the body in depth, then peel off the flank. The
      // whole school turns before its grains fan out along the seam.
      const coast = Math.min(age, 0.04) * (1 - open);
      const radius = group.radius + 76 * cos;
      const orbitX = axis + group.side * radius;
      const orbitY = group.y * 0.38 + group.targetY * 0.62 + sin * 122;
      const startX = group.x + group.vx * coast;
      const startY = group.y + group.vy * coast;
      const x = startX + (orbitX - startX) * open;
      const y = startY + (orbitY - startY) * open;
      // The incoming stream bends parallel to the contour at an outside
      // gate. Its two branches close on neighbouring samples of the edge.
      const gateX = group.targetX + group.side * (78 + 50 * group.drift);
      const gateY = group.targetY + 96 * cos;
      for (let i = first; i < first + perFamily; i++) {
        const a = i * 6,
          b = i * 3;
        const lag = grains[a + 4];
        const snap = ease((q - land + 0.006 * lag) / 0.005);
        const presence = ease(age / 0.007) * (1 - snap);
        const approach = dock * (1 - 0.65 * lag * (1 - dock));
        const free = 1 - approach;
        const spread = free * (0.12 + 1.18 * open);
        const dx = grains[a + 2],
          dy = grains[a + 3];
        const bend = 2 * free * approach;
        const fork = (i % 2 ? 1 : -1) * bend * (21 + 18 * lag);
        const px =
          free * free * x +
          bend * gateX +
          approach * approach * (group.targetX + grains[a]) +
          (dx * cos - dy * sin) * spread +
          fork * sin;
        const py =
          free * free * y +
          bend * gateY +
          approach * approach * (group.targetY + grains[a + 1]) +
          (dy * cos + dx * sin) * spread +
          fork * cos;
        // Protect the unlit visor and the stationary reactor disc throughout
        // flight. Grains on their outskirts can still trace the real seam.
        const behind =
          (sin < -0.24 && approach < 0.75) ||
          (px - axis) ** 2 + (py - coreY) ** 2 < 38 ** 2 ||
          ((px - eyeX) / 39) ** 2 + ((py - eyeY) / 20) ** 2 < 1;
        const width = Math.max(minWidth, grains[a + 5] * (behind ? 0.7 : 1)) * presence;
        screen[b] = px;
        screen[b + 1] = py;
        screen[b + 2] = width < 0.25 ? 0 : behind ? -width : width;
        if (screen[b + 2]) live++;
      }
    }
    if (!live) return 0;
    for (let side = 0; side < 2; side++) {
      const context = side ? front : back;
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = side ? 0.92 : 0.56;
      for (let tone = 0; tone < colours.length; tone++) {
        context.beginPath();
        for (let i = tone; i < groups * perFamily; i += colours.length) {
          const b = i * 3;
          const r = screen[b + 2] * (side ? 1 : -1);
          if (r <= 0) continue;
          const x = screen[b],
            y = screen[b + 1];
          context.moveTo(x - r, y);
          context.lineTo(x - r * 0.45, y - r * 0.65);
          context.lineTo(x + r, y - r * 0.2);
          context.lineTo(x + r * 0.5, y + r * 0.63);
          context.closePath();
        }
        context.fillStyle = colours[tone];
        context.fill();
      }
      context.globalAlpha = 1;
    }
    return live;
  }
}
