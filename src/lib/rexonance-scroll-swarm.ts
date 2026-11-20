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
const grainStride = 6;
const facetStride = 3;
const dockHold = 0.006;
const colours = ["#66c7ed", "#ce8bd4", "#e1f8ff"];
const ease = (x: number) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

type Family = {
  head: boolean;
  face: boolean;
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
  seamAngle: number;
  facetCos: number;
  facetSin: number;
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
  // Once per frame: projected centre, facet width. Signed width selects
  // the far/near canvas. The six colour/depth batches reuse these buffers.
  private screen: Float32Array;

  constructor(
    tier: string,
    pieces: readonly Pick<SurgePiece, "id" | "seat">[],
    windows: Float32Array,
  ) {
    const groups = pieces.length ? (families[tier as keyof typeof families] ?? families.low) : 0;
    this.count = groups * perFamily;
    this.grains = new Float32Array(this.count * grainStride);
    this.screen = new Float32Array(this.count * facetStride);
    const contours = pieces.map((piece) => decodeNaniteSeam(REXONANCE_NANITE_SEAMS[piece.id])[0]);
    const helmet = pieces
      .map((piece, i) => (piece.id.startsWith("helmet-") ? i : -1))
      .filter((i) => i >= 0);
    const jaw = pieces.findIndex((piece) => piece.id === "helmet-jaw");
    const visor = pieces.findIndex((piece) => piece.id === "helmet-visor");
    const pose = new Float64Array(6);
    for (let g = 0; g < groups; g++) {
      // Reserve the first four families for a pair at each of the cheeks
      // and the inner visor. Both sides survive the mobile budget governor.
      const face = jaw >= 0 && visor >= 0 && g < 4;
      const side = g % 2 === 0 ? -1 : 1;
      const p = face
        ? (g < 2 ? jaw : visor)
        : g % 7 === 0 && helmet.length
          ? helmet[(g / 7) % helmet.length]
          : Math.floor(naniteHash(g, 71) * pieces.length);
      const piece = pieces[p];
      const loop = contours[p];
      const points = loop ? loop.length / 2 : 0;
      const seam = points > 0 && (face || g % 5 !== 0);
      let index = Math.floor(naniteHash(g, 7) * points);
      if (face && seam) {
        const aimX = eyeX + side * (p === jaw ? 43 : 9);
        const aimY = eyeY + (p === jaw ? 38 : 15);
        let nearest = Infinity;
        for (let j = 0; j < points; j++) {
          const distance = (loop[j * 2] - aimX) ** 2 + (loop[j * 2 + 1] - aimY) ** 2;
          if (distance >= nearest) continue;
          nearest = distance;
          index = j;
        }
      }
      const tx = seam ? loop[index * 2] : piece.seat[0];
      const ty = seam ? loop[index * 2 + 1] : piece.seat[1];
      const next = (index + 1) % points;
      const angle = seam ? Math.atan2(loop[next * 2 + 1] - ty, loop[next * 2] - tx) : 0;
      // Align the long edge without turning the packet through a half circle.
      const seamAngle = angle > Math.PI / 2 ? angle - Math.PI : angle < -Math.PI / 2 ? angle + Math.PI : angle;
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
        face,
        birth: scrollFlameAt(high),
        x: width * pose[0],
        y: height * pose[1],
        vx: (width * pose[2]) / REXONANCE_SCROLL_FLAME.span,
        vy: (height * pose[3]) / REXONANCE_SCROLL_FLAME.span,
        phase: tau * naniteHash(g, 13),
        side: face ? side : tx < axis ? -1 : 1,
        radius: 230 + 207 * naniteHash(g, 14),
        drift: 0.6 + naniteHash(g, 15),
        targetX: tx,
        targetY: ty,
        seamAngle,
        facetCos: 1,
        facetSin: 0,
        classic,
        skin: classic,
      });
      for (let k = 0; k < perFamily; k++) {
        const i = g * perFamily + k;
        const a = i * grainStride;
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
    this.orderFaceSeats("classic");
  }

  private orderFaceSeats(clock: "classic" | "skin") {
    const [leftCheek, rightCheek, leftVisor, rightVisor] = this.groups;
    if (!rightVisor?.face) return;
    const close = Math.max(leftVisor[clock], rightVisor[clock]);
    const cheek = Math.min(leftCheek[clock], rightCheek[clock], close - 0.035);
    leftCheek[clock] = rightCheek[clock] = cheek;
    leftVisor[clock] = rightVisor[clock] = close;
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
    this.orderFaceSeats("skin");
  }

  draw(
    back: Context,
    front: Context,
    q: number,
    skin: boolean,
    scale: number,
    share: number,
    ratio = 1.5,
  ) {
    if (q <= scrollFlameAt(NANITE_FIRE_PHASES.materialStart) || q >= 0.86) return 0;
    const groups = Math.floor(this.groups.length * Math.max(0, Math.min(1, share)));
    const screen = this.screen;
    const grains = this.grains;
    // Nano pass (2026-11-21): a grain is a nanite cluster far below a
    // pixel, so it is drawn a backing pixel at most (`ratio`: the layer's
    // backing px per CSS px) and dimmer — a fine haze docking on the seam.
    const point = 1 / Math.max(0.05, scale * ratio);
    const minWidth = Math.min(1.2 / Math.max(0.05, scale), point);
    let live = 0;
    for (let g = 0; g < groups; g++) {
      const group = this.groups[g];
      const land = skin ? group.skin : group.classic;
      const age = q - group.birth;
      const first = g * perFamily;
      if (age <= 0 || land <= group.birth || q >= land + dockHold) {
        for (let i = first; i < first + perFamily; i++) screen[i * facetStride + 2] = 0;
        continue;
      }
      const open = ease(age / 0.042);
      const capture = Math.min(0.195, (land - group.birth) * 0.72);
      // Seat just ahead of the surface and let it take over at the same
      // mark. The hold follows scroll progress in both directions.
      const lead = Math.min(0.026, capture * 0.4);
      const dock = ease(1 - (land - lead - q) / (capture - lead));
      const facetAngle = group.seamAngle * dock;
      group.facetCos = Math.cos(facetAngle);
      group.facetSin = Math.sin(facetAngle);
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
      const gateX = group.face
        ? eyeX + group.side * 49
        : group.targetX + group.side * (78 + 50 * group.drift);
      const gateY = group.face ? eyeY + 39 : group.targetY + 96 * cos;
      for (let i = first; i < first + perFamily; i++) {
        const a = i * grainStride,
          b = i * facetStride;
        const lag = grains[a + 4];
        const fadeStart = land - 0.004 * lag;
        const fade = ease((q - fadeStart) / (land + dockHold - fadeStart));
        const presence = ease(age / 0.007) * (1 - fade);
        const approach = dock * (1 - 0.65 * lag * (1 - dock));
        const free = 1 - approach;
        const spread = free * (0.12 + 1.18 * open);
        const dx = grains[a + 2],
          dy = grains[a + 3];
        const bend = 2 * free * approach;
        const fork = (i % 2 ? 1 : -1) * bend * (group.face ? 8 : 21 + 18 * lag);
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
          ((px - eyeX) / 39) ** 2 + ((py - eyeY) / (group.face ? 9 : 20)) ** 2 < 1;
        const width =
          Math.min(point, Math.max(minWidth, grains[a + 5] * (behind ? 0.7 : 1))) * presence;
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
      context.globalAlpha = side ? 0.62 : 0.36;
      for (let tone = 0; tone < colours.length; tone++) {
        context.beginPath();
        for (let g = 0; g < groups; g++) {
          const { facetCos, facetSin } = this.groups[g];
          const first = g * perFamily;
          for (let i = first + tone; i < first + perFamily; i += colours.length) {
            const b = i * facetStride;
            const r = screen[b + 2] * (side ? 1 : -1);
            if (r <= 0) continue;
            const x = screen[b],
              y = screen[b + 1];
            const dx = r * facetCos;
            const dy = r * facetSin;
            context.moveTo(x - dx, y - dy);
            context.lineTo(x - dx * 0.45 + dy * 0.65, y - dy * 0.45 - dx * 0.65);
            context.lineTo(x + dx + dy * 0.2, y + dy - dx * 0.2);
            context.lineTo(x + dx * 0.5 - dy * 0.63, y + dy * 0.5 + dx * 0.63);
            context.closePath();
          }
        }
        context.fillStyle = colours[tone];
        context.fill();
      }
      context.globalAlpha = 1;
    }
    return live;
  }
}
