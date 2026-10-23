import {
  FAR_FROM_ENTRY_MARKS,
  FAR_FROM_ENTRY_SIZE,
  FAR_FROM_ENTRY_UNDER,
} from "@/lib/far-from-entry-suit";
import { REXONANCE_SUIT_MARKS, REXONANCE_SUIT_SIZE } from "@/lib/rexonance-suit";
import { FAR_FROM_ENTRY_SWARM, FAR_FROM_SUIT_LIGHT } from "@/lib/far-from-entry-calls";
import { FAR_FROM_ENTRY_KITS, FAR_FROM_ENTRY_KIT_B_SHARE } from "@/lib/far-from-entry-kits";
import {
  drawBodyFlame,
  drawNaniteFlame,
  drawNaniteFirebrand,
  prepareBodyFlame,
} from "@/lib/rexonance-flame.js";
import { FIRE_TONES } from "@/lib/rexonance-fire/fire-tuning.js";
import {
  NANITE_FIRE_PHASES,
  fireFragmentPose,
  naniteFlameEnvelope,
} from "@/lib/rexonance-ignition.js";
import { FAR_FROM_ENTRY_MATERIAL, farFromFlamePhase } from "@/lib/far-from-entry-ignition.js";
import {
  CHIP_ALPHA,
  CHIP_DEPTH,
  CHIP_FRAME,
  CHIP_SIZE,
  CHIP_SLOTS,
  CHIP_STATE,
  CHIP_X,
  CHIP_Y,
  farFromChipPose,
  planFarFromSwarm,
} from "@/lib/far-from-entry-swarm.js";
import { farFromEntryPlan, T } from "./far-from-entry-plan";
import { FAR_FROM_WIREFRAME_ENTRY } from "@/lib/far-from-wireframe-entry";
import { WIRE_UNIT, decodeWireMesh, triangulateWireMesh } from "@/lib/far-from-wireframe-mesh";

/* FAR FROM SAGA's entry engine (owner, 2026-10-22): the canvases inside the
   figure's box that carry everything the DOM cannot — modelled on
   rexonance-suit-nanites.tsx, the call's nanite engine, and parameterised
   by this suit's own data. On the entry clock (the call meter's CSS
   animation, read by the sequence):

   - the shared body fire (src/lib/rexonance-flame.js) burns on the
     Rexonance undersuit, registered inside this figure (FAR_FROM_ENTRY_UNDER),
     in its gold end tone (FIRE_TONES.gold): it kindles at the soles under
     SUPERIOR！, engulfs the undersuit, turns gold and bursts (爆散)
     under RIDER！FAR FROM！;
   - the fragments cool into chips of both nanite kits (far-from-entry-swarm:
     kit A, Rexonance's hex kit, and kit B, each chip by its kit index through
     one sprite path), gather into an orbital cocoon round the body (the back
     of each ring hidden behind the body) and drain into the plates as their
     tiles fly; the free chips gather round the reactor and implode into it
     as the last call strikes;
   - each plate is constructed as a wireframe (owner, 2026-10-23: 「また、
     ファーフロムはワイヤーフレーム風の生成方式を採るように。」), as the scroll
     suit-up's (far-from-wireframe-layer.ts): its real outline traced from its
     seam, its mesh (far-from-wireframe-entry.ts, made from this cut by
     scripts/build-far-from-wireframe.mjs) drawn out as its micro-tiles come
     due, and the micro-tiles (9 px squares of the artwork, in dark glass:
     the crystals' light held back) streaming in along it from the seam side
     as nanites and locking (owner, 2026-10-24: 「ナノマシンによる生成をワイヤー
     フレームと組み合わせて」), the wire fading as the plate fits — plate after plate in the cascade's order (far-from-entry-calls) —
     and a seated plate is painted whole onto the settled canvas;
   - on FAR FROM DEUS！ the reactor ignites and the crystals' light
     (lights.webp) runs out through the whole body from it, with a bloom
     that settles; at the end the finished figure is painted whole, so the
     finished frame is the artwork exactly.

   Every frame is a closed-form function of the clock (a scrubbed clock
   resets the settled canvas and replays); the draw passes write typed
   buffers only and allocate nothing; there are no timers, no randomness,
   no filters and no composite operations; the draw budget (drawImage
   calls a frame) is held by tier, the touch tier drawing 2 x 2 blocks of
   tiles and a quarter of the chips. Without WebGL the fire's CPU kernel
   draws the same frames. */

export type FarFromEntrySources = {
  readonly atlas: CanvasImageSource;
  readonly figure: CanvasImageSource;
  readonly lights: CanvasImageSource;
  readonly under: CanvasImageSource;
  /** Kit A's and kit B's sheets (the same layout contract). */
  readonly kits: readonly [CanvasImageSource, CanvasImageSource];
};
export type FarFromEntryEngineOptions = {
  /** The .rx-suit-nanites host inside the figure's box. */
  readonly box: HTMLElement;
  readonly coarse: boolean;
  readonly sources: FarFromEntrySources;
  /** The entry clock (ms), or null once the overlay's covering animation is gone. */
  readonly clock: () => number | null;
  readonly onFinish: () => void;
};
export type FarFromEntryEngine = {
  /** Starts drawing from entry time `now` (ms); false if it cannot (the
   * sequence then stands the finished figure). */
  start: (now: number) => boolean;
  stop: () => void;
};

/** The wire's times (ms of the entry clock): the outline is traced from the
 * plate's first moment over at most TRACE; an interior edge is drawn GROW
 * long, LEAD before the tiles under its later end lock; the wire fades over
 * FADE from FADE_AT before the plate fits. */
export const FAR_FROM_ENTRY_WIRE = Object.freeze({
  trace: 140,
  lead: 200,
  grow: 30,
  fadeAt: 50,
  fade: 90,
});
const WIRE_ICE = "#7fe6ff";
/** The driver's plates: worn from the start, never constructed. */
const DRIVER: ReadonlySet<string> = new Set(["belt"]);
const WIRE_WHITE = "#f4fbff";

/** The engine takes over only if it is ready before the first tile is due. */
export const FAR_FROM_ENTRY_START_BY = 420;
const FIG = FAR_FROM_ENTRY_SIZE;
const U = FAR_FROM_ENTRY_UNDER;
/** The fire's end tone: gold (owner: 「炎は最終的に金色になります」). */
const TONE = FIRE_TONES.gold;
/** The fire's frame: the undersuit's registered box, in figure px. */
const UNDER_SIZE = { width: U.w, height: U.h } as const;
const K_UNDER = U.w / REXONANCE_SUIT_SIZE.width;
/** The undersuit's reactor dial, in the fire's frame. */
const UNDER_CORE: readonly [number, number] = [
  REXONANCE_SUIT_MARKS.core[0] * K_UNDER,
  REXONANCE_SUIT_MARKS.core[1] * K_UNDER,
];
const [CORE_X, CORE_Y] = FAR_FROM_ENTRY_MARKS.core;
const S = FAR_FROM_ENTRY_SWARM;
/** A chip's hex fills about 70% of its cell: sprites are drawn this much
 * larger than the chip's nominal size. */
const SPRITE = 1.45;
/** The light's wave is drawn in this many arcs (each fades near an edge). */
const RING_ARCS = 48;
/** The body's occupancy grid, for the chips behind it. */
const OCC_W = 64;
const OCC_H = 116;
/** A flying tile's own light under it (the tiles' tone rows: ice, pink,
 * white, gold). */
const TONE_CSS = ["#79e8ff", "#ff8fd8", "#f4fbff", "#ffce78"] as const;
/** The kits' cells: the tumble cell, the mip cell, the mip's x/y per tone,
 * flat by kit (4 tones each). */
const KIT_CELL = Int16Array.from(FAR_FROM_ENTRY_KITS, (kit) => kit.cell);
const KIT_MIP = Int16Array.from(FAR_FROM_ENTRY_KITS, (kit) => kit.mip.cell);
const KIT_FRAMES = Int16Array.from(FAR_FROM_ENTRY_KITS, (kit) => kit.frames);
const KIT_MIP_X = Int16Array.from(FAR_FROM_ENTRY_KITS.flatMap((kit) => [...kit.mip.x]));
const KIT_MIP_Y = Int16Array.from(FAR_FROM_ENTRY_KITS.flatMap((kit) => [...kit.mip.y]));

export function createFarFromEntryEngine({
  box,
  coarse,
  sources,
  clock,
  onFinish,
}: FarFromEntryEngineOptions): FarFromEntryEngine {
  let frame = 0;
  let finished = false;
  let cancelled = false;
  let stopDraw = () => {};
  const start = (now: number) => {
    if (cancelled || now > FAR_FROM_ENTRY_START_BY || !box.clientWidth) return false;
    const plan = farFromEntryPlan();
    prepareBodyFlame(sources.under, REXONANCE_SUIT_SIZE);
    // Touch screens draw at up to 1.25x (the tiles are 9 px of art; a 2x
    // backing store only doubled the fill work on a tablet).
    const scale = Math.min(coarse ? 1.25 : 2, globalThis.devicePixelRatio || 1);
    box.dataset.bleed = "";
    const make = () => {
      const canvas = globalThis.document.createElement("canvas");
      box.append(canvas);
      return canvas;
    };
    const settledCanvas = make();
    const flightCanvas = make();
    settledCanvas.width = Math.round(box.clientWidth * scale);
    settledCanvas.height = Math.round(box.clientHeight * scale);
    // The flight canvas's bleed (the stylesheet's) cut to whole CSS, backing
    // and device pixels, and the settled canvas on the same box, so a plate
    // handed from one canvas to the other never moves (the Rexonance
    // engine's round 4, kept as it is).
    const outer = flightCanvas.getBoundingClientRect();
    const inner = box.getBoundingClientRect();
    const dpr = globalThis.devicePixelRatio || 1;
    const exact = (value: number) => Math.abs(value - Math.round(value)) < 1e-3;
    const step = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => exact(n * scale) && exact(n * dpr)) ?? 1;
    const cut = (value: number) => Math.max(0, Math.floor(value / step + 1e-6) * step);
    const left = cut(inner.left - outer.left);
    const top = cut(inner.top - outer.top);
    const right = cut(outer.right - inner.right);
    const bottom = cut(outer.bottom - inner.bottom);
    const ox = Math.round(left * scale);
    const oy = Math.round(top * scale);
    const width = settledCanvas.width + ox + Math.round(right * scale);
    const height = settledCanvas.height + oy + Math.round(bottom * scale);
    const s = settledCanvas.width / FIG.width;
    settledCanvas.width = width;
    settledCanvas.height = height;
    flightCanvas.width = width;
    flightCanvas.height = height;
    if (left + top + right + bottom > 0)
      for (const canvas of [settledCanvas, flightCanvas])
        Object.assign(canvas.style, {
          left: `${-left}px`,
          top: `${-top}px`,
          width: `calc(100% + ${left + right}px)`,
          height: `calc(100% + ${top + bottom}px)`,
        });
    // The flight canvas's own edges, from the figure's origin in device px:
    // the light's wave fades within fence[4] of them, so it never meets a
    // straight cut. (The caption sits above the canvases in the DOM, so
    // nothing is kept clear under it.)
    const fence = new Float32Array(5);
    fence[0] = -ox;
    fence[1] = -oy;
    fence[2] = width - ox;
    fence[3] = height - oy;
    fence[4] = (coarse ? 8 : 20) * scale;
    const settled = settledCanvas.getContext("2d");
    const flight = flightCanvas.getContext("2d");
    if (!settled || !flight) {
      box.replaceChildren();
      return false;
    }
    // The body's occupancy (the finished figure and the undersuit), for the
    // chips behind it: made once, from a small canvas.
    const occ = new Uint8Array(OCC_W * OCC_H);
    const probe = globalThis.document.createElement("canvas");
    probe.width = OCC_W;
    probe.height = OCC_H;
    const probeContext = probe.getContext("2d", { willReadFrequently: true });
    if (probeContext) {
      const kx = OCC_W / FIG.width;
      const ky = OCC_H / FIG.height;
      probeContext.drawImage(sources.figure, 0, 0, OCC_W, OCC_H);
      probeContext.drawImage(sources.under, U.x * kx, U.y * ky, U.w * kx, U.h * ky);
      const data = probeContext.getImageData(0, 0, OCC_W, OCC_H).data;
      for (let i = 0; i < occ.length; i += 1) occ[i] = data[i * 4 + 3];
    }
    probe.width = probe.height = 0;
    // The swarm's plan over the tiles' flights.
    const chips = coarse ? S.chips.touch : S.chips.desktop;
    const swarm = planFarFromSwarm({
      count: chips,
      free: coarse ? S.free.touch : S.free.desktop,
      tiles: { x: plan.flightX, y: plan.flightY, start: plan.start },
      plateTiles: plan.plateTiles,
      under: U,
      figure: { width: FIG.width, height: FIG.height, core: FAR_FROM_ENTRY_MARKS.core },
      swarm: S,
      kitB: FAR_FROM_ENTRY_KIT_B_SHARE,
    });
    const firebrandStride = Math.ceil(chips / (coarse ? S.firebrands.touch : S.firebrands.desktop));
    const budget = coarse ? S.budget.touch : S.budget.desktop;
    const mipBelow = S.mipBelow;
    const sheets = sources.kits;
    const { atlas, figure, lights } = sources;
    const plates = plan.pieces.length;
    const reach = Math.hypot(
      Math.max(CORE_X, FIG.width - CORE_X),
      Math.max(CORE_Y, FIG.height - CORE_Y),
    );
    // The clock the whole thing ends on: every plate whole and the light settled.
    let end = FAR_FROM_SUIT_LIGHT.from + FAR_FROM_SUIT_LIGHT.bloom;
    for (let p = 0; p < plates; p += 1) if (plan.fit[p] + 40 > end) end = plan.fit[p] + 40;
    // Per-frame state in typed slots: a plate settled; the chip pose; the
    // fragment pose; the draw count; the light painted onto the settled canvas.
    const done = new Uint8Array(plates);
    const pose = new Float64Array(CHIP_SLOTS);
    const frag = new Float64Array(6);
    const counters = new Int32Array(2);
    let last = -1;
    let lit = false;
    settled.setTransform(1, 0, 0, 1, ox, oy);
    // Each plate's wire, made the first time the plate is drawn (one plate
    // at a time, so no frame triangulates the suit): its vertices, its
    // edges (from the earlier end) and when each is drawn.
    type EntryWire = {
      vx: Float32Array;
      vy: Float32Array;
      ea: Int32Array;
      eb: Int32Array;
      e0: Float32Array;
      e1: Float32Array;
      eo: Uint8Array;
    };
    const wires: (EntryWire | null | undefined)[] = Array.from({ length: plates }, () => undefined);
    const wireOf = (p: number): EntryWire | null => {
      const known = wires[p];
      if (known !== undefined) return known;
      const piece = plan.pieces[p];
      const mesh = decodeWireMesh(FAR_FROM_WIREFRAME_ENTRY[piece.id]);
      if (!mesh) return (wires[p] = null);
      const tri = triangulateWireMesh(mesh);
      const n = mesh.xs.length;
      const vx = new Float32Array(n);
      const vy = new Float32Array(n);
      for (let v = 0; v < n; v += 1) {
        vx[v] = mesh.xs[v] / WIRE_UNIT;
        vy[v] = mesh.ys[v] / WIRE_UNIT;
      }
      const W = FAR_FROM_ENTRY_WIRE;
      const first = plan.plateTiles[p];
      const past = plan.plateTiles[p + 1];
      const spawn = plan.spawn[p];
      // An interior vertex: a lead before its nearest tile locks.
      const vt = new Float32Array(n);
      for (let v = mesh.outline; v < n; v += 1) {
        let best = Infinity;
        let land = plan.fit[p];
        for (let i = first; i < past; i += 1) {
          const d =
            (plan.dx[i] + plan.tw[i] / 2 - vx[v]) ** 2 + (plan.dy[i] + plan.th[i] / 2 - vy[v]) ** 2;
          if (d < best) {
            best = d;
            land = plan.land[i];
          }
        }
        vt[v] = Math.max(spawn, land - W.lead);
      }
      // The outline: two pens from its point nearest the seam side's first
      // tile, round both ways.
      let sx = piece.seat[0];
      let sy = piece.seat[1];
      let early = Infinity;
      for (let i = first; i < past; i += 1)
        if (plan.land[i] < early) {
          early = plan.land[i];
          sx = plan.dx[i] + plan.tw[i] / 2;
          sy = plan.dy[i] + plan.th[i] / 2;
        }
      const trace = Math.max(40, Math.min(W.trace, (plan.fit[p] - spawn) * 0.5));
      for (let L = 0; L < mesh.loopStart.length; L += 1) {
        const start = mesh.loopStart[L];
        const count = mesh.loopCount[L];
        let nearest = 0;
        let best = Infinity;
        for (let k = 0; k < count; k += 1) {
          const d = (vx[start + k] - sx) ** 2 + (vy[start + k] - sy) ** 2;
          if (d < best) {
            best = d;
            nearest = k;
          }
        }
        const along = new Float32Array(count);
        for (let step = 1; step < count; step += 1) {
          const a = start + ((nearest + step - 1) % count);
          const b = start + ((nearest + step) % count);
          along[step] = along[step - 1] + Math.hypot(vx[b] - vx[a], vy[b] - vy[a]);
        }
        const close = start + ((nearest + count - 1) % count);
        const total =
          along[count - 1] + Math.hypot(vx[start + nearest] - vx[close], vy[start + nearest] - vy[close]);
        for (let step = 0; step < count; step += 1)
          vt[start + ((nearest + step) % count)] =
            spawn + (Math.min(along[step], total - along[step]) / Math.max(1, total / 2)) * trace;
      }
      const seen = new Map<number, number>();
      const us: number[] = [];
      const ws: number[] = [];
      for (let t = 0; t < tri.length; t += 3)
        for (let k = 0; k < 3; k += 1) {
          const a = tri[t + k];
          const b = tri[t + ((k + 1) % 3)];
          const key = a < b ? a * 65536 + b : b * 65536 + a;
          if (seen.has(key)) continue;
          seen.set(key, us.length);
          us.push(a);
          ws.push(b);
        }
      const loopEdge = new Set<number>();
      for (let L = 0; L < mesh.loopStart.length; L += 1)
        for (let k = 0; k < mesh.loopCount[L]; k += 1) {
          const a = mesh.loopStart[L] + k;
          const b = mesh.loopStart[L] + ((k + 1) % mesh.loopCount[L]);
          loopEdge.add(a < b ? a * 65536 + b : b * 65536 + a);
        }
      const ne = us.length;
      const wire: EntryWire = {
        vx,
        vy,
        ea: new Int32Array(ne),
        eb: new Int32Array(ne),
        e0: new Float32Array(ne),
        e1: new Float32Array(ne),
        eo: new Uint8Array(ne),
      };
      for (let e = 0; e < ne; e += 1) {
        const later = vt[ws[e]] < vt[us[e]];
        const a = later ? ws[e] : us[e];
        const b = later ? us[e] : ws[e];
        const onOutline = loopEdge.has(a < b ? a * 65536 + b : b * 65536 + a);
        wire.ea[e] = a;
        wire.eb[e] = b;
        wire.eo[e] = onOutline ? 1 : 0;
        wire.e0[e] = onOutline ? vt[a] : Math.max(vt[a], vt[b] - W.grow);
        wire.e1[e] = onOutline ? Math.max(vt[b], vt[a] + 4) : vt[b] + 1;
      }
      return (wires[p] = wire);
    };
    const settle = (p: number) => {
      const piece = plan.pieces[p];
      settled.globalAlpha = 1;
      settled.drawImage(
        atlas,
        piece.ax,
        piece.ay,
        piece.w,
        piece.h,
        piece.x * s,
        piece.y * s,
        piece.w * s,
        piece.h * s,
      );
      done[p] = 1;
    };
    const reset = () => {
      settled.setTransform(1, 0, 0, 1, 0, 0);
      settled.clearRect(0, 0, width, height);
      settled.setTransform(1, 0, 0, 1, ox, oy);
      done.fill(0);
      lit = false;
    };
    const occupied = (x: number, y: number) => {
      const gx = Math.floor((x / FIG.width) * OCC_W);
      const gy = Math.floor((y / FIG.height) * OCC_H);
      if (gx < 0 || gy < 0 || gx >= OCC_W || gy >= OCC_H) return false;
      return occ[gy * OCC_W + gx] > 40;
    };
    // One sprite path for both kits: the chip's kit picks the sheet and the
    // cell table; its size picks the tumble cell or the mip.
    const sprite = (kit: number, tone: number, tumble: number, x: number, y: number, d: number) => {
      const k = Math.round(d) || 1;
      const sheet = sheets[kit];
      if (k < mipBelow) {
        const cell = KIT_MIP[kit];
        flight.drawImage(
          sheet,
          KIT_MIP_X[kit * 4 + tone] + cell * tumble,
          KIT_MIP_Y[kit * 4 + tone],
          cell,
          cell,
          Math.round(x - k / 2),
          Math.round(y - k / 2),
          k,
          k,
        );
      } else {
        const cell = KIT_CELL[kit];
        flight.drawImage(
          sheet,
          cell * tumble,
          cell * tone,
          cell,
          cell,
          Math.round(x - k / 2),
          Math.round(y - k / 2),
          k,
          k,
        );
      }
      counters[0] += 1;
    };
    // The chips on one side of the body: behind it (hidden where it is) or
    // in front; each by its kit index through the one sprite path.
    const drawChips = (t: number, front: number) => {
      for (let c = 0; c < chips; c += 1) {
        if (counters[0] >= budget) return;
        farFromChipPose(swarm, c, t, pose);
        if (pose[CHIP_STATE] === 0 || pose[CHIP_ALPHA] <= 0.01) continue;
        const depth = pose[CHIP_DEPTH];
        if ((depth >= 0.5 ? 1 : 0) !== front) continue;
        if (!front && occupied(pose[CHIP_X], pose[CHIP_Y])) continue;
        const d = pose[CHIP_SIZE] * s * SPRITE * (0.8 + 0.4 * depth);
        flight.globalAlpha = pose[CHIP_ALPHA] * (front ? 1 : 0.6 + 0.3 * depth);
        const kit = swarm.kit[c];
        const tumble = pose[CHIP_FRAME] % KIT_FRAMES[kit];
        sprite(kit, swarm.tone[c], tumble, pose[CHIP_X] * s, pose[CHIP_Y] * s, d);
      }
    };
    // A plate still forming: the tiles that have locked through one clip,
    // then each tile in flight (its own art, streaming in from the seam side,
    // its light under it).
    const drawPlate = (p: number, t: number) => {
      const piece = plan.pieces[p];
      const first = plan.plateTiles[p];
      const past = plan.plateTiles[p + 1];
      let locked = 0;
      flight.save();
      flight.beginPath();
      for (let i = first; i < past; i += 1) {
        if (t < plan.land[i]) continue;
        const x0 = Math.round(plan.dx[i] * s);
        const y0 = Math.round(plan.dy[i] * s);
        flight.rect(
          x0,
          y0,
          Math.round((plan.dx[i] + plan.tw[i]) * s) - x0,
          Math.round((plan.dy[i] + plan.th[i]) * s) - y0,
        );
        locked += 1;
      }
      if (locked) {
        flight.clip();
        flight.globalAlpha = 1;
        flight.drawImage(
          atlas,
          piece.ax,
          piece.ay,
          piece.w,
          piece.h,
          piece.x * s,
          piece.y * s,
          piece.w * s,
          piece.h * s,
        );
        counters[0] += 1;
      }
      flight.restore();
      for (let i = first; i < past; i += 1) {
        const land = plan.land[i];
        const from = plan.start[i];
        const u = (t - from) / (land - from);
        if (u <= 0 || u >= 1) continue;
        if (counters[0] >= budget) return;
        const e = 1 - (1 - u) * (1 - u) * (1 - u);
        const x = (plan.dx[i] + plan.ox[i] * (1 - e)) * s;
        const y = (plan.dy[i] + plan.oy[i] * (1 - e)) * s;
        const tw = plan.tw[i];
        const th = plan.th[i];
        if (u < 0.62) {
          // A nanite mote, streaming in: its own tile of the art, small, with
          // its light under it, so even now the suit's edge is the artwork's.
          const size = T * s * (0.3 + 0.4 * (u / 0.62));
          const w = size * (tw / T);
          const h = size * (th / T);
          const px = x + (tw * s - w) / 2;
          const py = y + (th * s - h) / 2;
          flight.globalAlpha = Math.min(1, u * 5) * 0.55;
          flight.fillStyle = TONE_CSS[plan.tone[i]];
          flight.fillRect(
            Math.round(px) - 1,
            Math.round(py) - 1,
            Math.round(w) + 2,
            Math.round(h) + 2,
          );
          flight.globalAlpha = Math.min(1, u * 5) * 0.9;
          flight.drawImage(atlas, plan.sx[i], plan.sy[i], tw, th, px, py, w, h);
          counters[0] += 2;
        } else {
          // It turns into its piece of the plate and locks: whole and on the
          // pixel grid, fading up.
          const v = (u - 0.62) / 0.38;
          const x0 = Math.round(x);
          const y0 = Math.round(y);
          flight.globalAlpha = 0.55 + 0.45 * v;
          flight.drawImage(
            atlas,
            plan.sx[i],
            plan.sy[i],
            tw,
            th,
            x0,
            y0,
            Math.round(x + tw * s) - x0,
            Math.round(y + th * s) - y0,
          );
          counters[0] += 1;
        }
      }
      // The wire over it: the lines drawn by now (those being drawn bright),
      // fading as the plate fits.
      const wire = wireOf(p);
      if (!wire) return;
      const W = FAR_FROM_ENTRY_WIRE;
      const light = 1 - Math.min(1, Math.max(0, (t - (plan.fit[p] - W.fadeAt)) / W.fade));
      if (light <= 0) return;
      for (let pass = 0; pass < 2; pass += 1) {
        flight.beginPath();
        let any = false;
        for (let e = 0; e < wire.ea.length; e += 1) {
          const t0 = wire.e0[e];
          if (t < t0) continue;
          const drawing = t < wire.e1[e];
          if (drawing !== (pass === 1)) continue;
          const a = wire.ea[e];
          const b = wire.eb[e];
          const g = drawing ? (t - t0) / (wire.e1[e] - t0) : 1;
          const x0 = wire.vx[a];
          const y0 = wire.vy[a];
          flight.moveTo(x0 * s, y0 * s);
          flight.lineTo((x0 + (wire.vx[b] - x0) * g) * s, (y0 + (wire.vy[b] - y0) * g) * s);
          any = true;
        }
        if (!any) continue;
        flight.globalAlpha = (pass ? 0.95 : 0.6) * light;
        flight.strokeStyle = pass ? WIRE_WHITE : WIRE_ICE;
        flight.lineWidth = (pass ? 1.2 : 0.75) * s;
        flight.stroke();
        counters[0] += 1;
      }
      flight.globalAlpha = 1;
    };
    // The suit is whole: the reactor ignites and the crystals' light runs
    // out through the body; a bloom rides it and settles.
    const drawLight = (t: number) => {
      const u = Math.min(1, (t - FAR_FROM_SUIT_LIGHT.from) / FAR_FROM_SUIT_LIGHT.spread);
      if (u >= 1 && !lit) {
        lit = true;
        settled.globalAlpha = 1;
        settled.drawImage(lights, 0, 0, FIG.width * s, FIG.height * s);
      }
      const radius = reach * (1 - (1 - u) * (1 - u) * (1 - u)) * s;
      if (!lit) {
        flight.save();
        flight.beginPath();
        flight.arc(CORE_X * s, CORE_Y * s, Math.max(1, radius), 0, Math.PI * 2);
        flight.clip();
        flight.globalAlpha = 1;
        flight.drawImage(lights, 0, 0, FIG.width * s, FIG.height * s);
        counters[0] += 1;
        flight.restore();
      }
      const bloom = 1 - (t - FAR_FROM_SUIT_LIGHT.from) / FAR_FROM_SUIT_LIGHT.bloom;
      if (bloom > 0 && u < 1) {
        // The light's front: a wave from the reactor, in arcs that fade out as
        // they near the canvas's edges, so it never ends on a straight cut.
        flight.strokeStyle = "#ffe9b0";
        flight.lineWidth = 6 * s;
        const r = Math.max(1, radius);
        const margin = fence[4] + 3 * s;
        for (let k = 0; k < RING_ARCS; k += 1) {
          const a0 = (Math.PI * 2 * k) / RING_ARCS;
          const mid = a0 + Math.PI / RING_ARCS;
          const x = CORE_X * s + r * Math.cos(mid);
          const y = CORE_Y * s + r * Math.sin(mid);
          let edge = x - fence[0];
          if (fence[2] - x < edge) edge = fence[2] - x;
          if (y - fence[1] < edge) edge = y - fence[1];
          if (fence[3] - y < edge) edge = fence[3] - y;
          if (edge <= 0) continue;
          const f = edge < margin ? edge / margin : 1;
          flight.globalAlpha = 0.7 * bloom * f * f * (3 - 2 * f);
          flight.beginPath();
          flight.arc(CORE_X * s, CORE_Y * s, r, a0, a0 + (Math.PI * 2) / RING_ARCS + 0.004);
          flight.stroke();
        }
        flight.globalAlpha = 1;
      }
    };
    // The fire's frame: the undersuit's registered box, scaled.
    const fireTransform = () => flight.setTransform(s, 0, 0, s, ox + U.x * s, oy + U.y * s);
    // Burning fragments carry material out of the fire: a firebrand on
    // each chip-bearing fragment until its chip is born.
    const drawFirebrands = (t: number, phase: number, clock: number) => {
      if (phase < NANITE_FIRE_PHASES.burstStart) return;
      for (let c = 0; c < chips; c += firebrandStride) {
        if (t >= swarm.born[c]) continue;
        if (counters[0] >= budget) return;
        fireFragmentPose(swarm.seed[c], phase, frag);
        if (frag[4] <= 0) continue;
        drawNaniteFirebrand(
          flight,
          frag[0] * UNDER_SIZE.width,
          frag[1] * UNDER_SIZE.height,
          frag[4],
          clock,
          1,
          TONE,
        );
        counters[0] += 2;
      }
    };
    const draw = (t: number) => {
      if (t < last) reset();
      last = t;
      counters[0] = 0;
      flight.setTransform(1, 0, 0, 1, 0, 0);
      flight.clearRect(0, 0, width, height);
      flight.setTransform(1, 0, 0, 1, ox, oy);
      const phase = farFromFlamePhase(t);
      const flame = naniteFlameEnvelope(phase);
      const clock = t / 1000;
      if (flame > 0) {
        fireTransform();
        drawBodyFlame(flight, UNDER_SIZE, flame, clock, 1, "back", phase, TONE);
        drawNaniteFlame(flight, UNDER_CORE, flame, clock, 1, TONE);
        flight.setTransform(1, 0, 0, 1, ox, oy);
        counters[0] += 3;
      }
      if (t >= FAR_FROM_ENTRY_MATERIAL - 80) drawChips(t, 0);
      for (let p = 0; p < plates; p += 1) {
        // The driver is worn from the first frame (owner, 2026-10-24:
        // 「最初からドライバーを装着」): settled at once, never formed.
        if (!done[p] && DRIVER.has(plan.pieces[p].id)) settle(p);
        if (done[p] || t < plan.spawn[p]) continue;
        if (t >= plan.fit[p] + 40) settle(p);
        else drawPlate(p, t);
      }
      if (t >= FAR_FROM_SUIT_LIGHT.from) drawLight(t);
      if (t >= FAR_FROM_ENTRY_MATERIAL - 80) drawChips(t, 1);
      if (flame > 0) {
        fireTransform();
        drawBodyFlame(flight, UNDER_SIZE, flame, clock, 1, "front", phase, TONE);
        drawFirebrands(t, phase, clock);
        flight.setTransform(1, 0, 0, 1, ox, oy);
        counters[0] += 1;
      }
      flight.globalAlpha = 1;
      counters[1] = counters[0];
    };
    const finish = (why: string) => {
      if (finished) return;
      finished = true;
      box.dataset.engine = why;
      flight.setTransform(1, 0, 0, 1, 0, 0);
      flight.clearRect(0, 0, width, height);
      for (let p = 0; p < plates; p += 1) if (!done[p]) settle(p);
      // The finished figure, the artwork exactly, lit.
      settled.globalAlpha = 1;
      settled.drawImage(figure, 0, 0, FIG.width * s, FIG.height * s);
      lit = true;
      onFinish();
    };
    stopDraw = () => {
      finished = true;
      box.replaceChildren();
    };
    const tick = () => {
      frame = 0;
      if (cancelled) return;
      const t = clock();
      if (t === null || t >= end) {
        finish(t === null ? "finished:no-clock" : `finished:${Math.round(t)}`);
        return;
      }
      draw(t);
      frame = globalThis.requestAnimationFrame(tick);
    };
    box.dataset.engineStart = `${Math.round(now)}`;
    draw(now);
    frame = globalThis.requestAnimationFrame(tick);
    return true;
  };
  return {
    start,
    stop() {
      cancelled = true;
      stopDraw();
      if (frame) globalThis.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
