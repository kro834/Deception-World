/** FAR FROM SAGA — the nanite tide (owner, 2026-11-11: 「ナノマシン装着
 * アニメーションを強化して」).
 *
 * The suit-up's swarm arrived as loose clouds round each plate. This layer
 * makes the nanites cover the undersuit as one wave: for every tile of the
 * engine's plan (the cell of armour that lands at its `t1`), in the plan's
 * own landing order,
 *
 * - a nanite streams in ahead of it — from out round the body, turning in
 *   on a spiral, carried by the curl field the mist uses so the stream
 *   flows as one, and easing into its place (never a straight, even move);
 * - it docks a little before the tile lands, with a flash: the wave's lit
 *   leading edge is exactly the cells docking now;
 * - behind the front it is a dark cell of the coat, charging with ice light
 *   until its tile lands;
 * - as the tile lands — the art resolving under it — the cell locks with a
 *   last gold-white flash and is gone.
 *
 * So the coat creeps over each group in the calls' order, a bright edge
 * ahead of it and the armour resolving behind, and each plate locks panel
 * by panel as its own tiles land.
 *
 * Contracts (the engine's, as the wire's): a closed form of the progress
 * (forward, back, at rest); nothing allocated in a frame (typed arrays made
 * once, a few batched paths); no shadows, no filters. A calm frame keeps the
 * coat (the state) and drops the streams and flashes (the transients).
 */

import { farFromMistCurl } from "./far-from-nanite-mist.ts";

type Tile = {
  readonly cx?: number;
  readonly cy?: number;
  readonly sx: number;
  readonly sy: number;
  readonly tw?: number;
  readonly th?: number;
  readonly t1: number;
  readonly pieceId: string | null;
};

export type FarFromTideInput = {
  readonly tiles: readonly Tile[];
  /** The plan's tile, figure px. */
  readonly tile: number;
  readonly core: readonly [number, number];
  /** Touch screens: every other nanite streams (the coat is whole). */
  readonly coarse: boolean;
  /** The suit is whole here: nothing is drawn from it on. */
  readonly until: number;
};

/** The tide's times, shares of the runway's progress (a group's beat is
 * about .115), and its shape. */
export const FAR_FROM_TIDE = Object.freeze({
  /** A nanite docks this long before its tile lands. */
  lead: 0.021,
  /** Its flight before it docks. */
  flight: 0.036,
  /** The flash as it docks, and as its tile lands. */
  dock: 0.0055,
  lock: 0.0065,
  /** Where it comes from: this far out (figure px), turning this much. */
  reach: Object.freeze([46, 168] as const),
  swirl: 2.1,
  /** The curl field's carry at mid-flight (figure px). */
  curl: 20,
  /** Its streak, as a share of its flight. */
  tail: 0.085,
  /** Every `stride`-th tile's nanite streams, by pointer. */
  stride: Object.freeze({ fine: 2, coarse: 4 }),
  /** A tile is this many nanites a side, docking within `stagger`. */
  split: 2,
  stagger: 0.008,
  /** Line and head sizes, CSS px. */
  line: 1.05,
  head: 1.9,
});

export type FarFromTide = {
  draw(context: CanvasRenderingContext2D, q: number, calm: boolean, px: number): void;
  /** The tiles in the tide (for tests), and how many were drawn last. */
  readonly count: number;
  readonly drawn: { coat: number; dock: number; lock: number; stream: number };
};

const hash = (i: number, salt: number) => {
  let h = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

const COAT = "rgb(7 16 28)";
const ICE = "rgb(127 230 255)";
const PALE = "rgb(206 246 255)";
const GOLD = "rgb(255 222 150)";

/** A nanite's place `a` (0–1) along its flight to (tx, ty): out on its
 * spiral at 0, docked at 1, eased out (quick at first, settling in), with
 * the curl field's carry strongest mid-flight. Writes [x, y] into `out`. */
export function farFromTidePath(
  tx: number,
  ty: number,
  angle: number,
  reach: number,
  spin: number,
  a: number,
  q: number,
  out: Float32Array | number[],
) {
  const left = a >= 1 ? 0 : a <= 0 ? 1 : (1 - a) * (1 - a) * (1 - a);
  const theta = angle + spin * left * Math.sqrt(left);
  const r = reach * left;
  const x = tx + Math.cos(theta) * r;
  const y = ty + Math.sin(theta) * r * 0.86;
  if (left > 0 && left < 1) {
    farFromMistCurl(x, y, q * 9, out);
    const carry = FAR_FROM_TIDE.curl * left * (1 - left) * 4 * 0.5;
    out[0] = x + out[0] * carry;
    out[1] = y + out[1] * carry;
  } else {
    out[0] = x;
    out[1] = y;
  }
}

export function prepareFarFromTide(input: FarFromTideInput): FarFromTide | null {
  const T = FAR_FROM_TIDE;
  const source = input.tiles.filter(
    (tile) => tile.pieceId != null && Number.isFinite(tile.t1) && tile.t1 > 0 && tile.t1 < input.until,
  );
  if (!source.length) return null;
  // Each tile is `split` × `split` nanites, docking a moment apart: the
  // coat's grain is finer than the armour's tiles.
  const S = T.split;
  const n = source.length * S * S;
  const landing = new Float32Array(n);
  for (let i = 0; i < n; i += 1)
    landing[i] = source[Math.floor(i / (S * S))].t1 - T.stagger * hash(i, 17);
  const sorted = Array.from(landing, (_, i) => i).sort((p, q) => landing[p] - landing[q]);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const half = new Float32Array(n);
  const t1 = new Float32Array(n);
  const angle = new Float32Array(n);
  const reach = new Float32Array(n);
  const spin = new Float32Array(n);
  const flags = new Uint8Array(n);
  const shine = new Float32Array(n);
  const stride = input.coarse ? T.stride.coarse : T.stride.fine;
  const [coreX, coreY] = input.core;
  for (let k = 0; k < n; k += 1) {
    const tile = source[Math.floor(sorted[k] / (S * S))];
    const part = sorted[k] % (S * S);
    const tw = tile.tw ?? input.tile;
    const th = tile.th ?? input.tile;
    const left = tile.cx != null ? tile.cx - tw / 2 : tile.sx;
    const top = tile.cy != null ? tile.cy - th / 2 : tile.sy;
    x[k] = left + ((part % S) + 0.5) * (tw / S);
    y[k] = top + (Math.floor(part / S) + 0.5) * (th / S);
    half[k] = Math.min(tw, th) / S / 2;
    t1[k] = landing[sorted[k]];
    // From out round the body, away from the reactor, spread wide.
    angle[k] = Math.atan2(y[k] - coreY, x[k] - coreX) + (hash(k, 3) - 0.5) * 2.4;
    reach[k] = T.reach[0] + (T.reach[1] - T.reach[0]) * hash(k, 5) ** 1.7;
    spin[k] = T.swirl * (0.45 + 0.75 * hash(k, 7)) * (hash(k, 9) < 0.5 ? -1 : 1);
    shine[k] = 0.35 + 0.95 * hash(k, 19) ** 1.5;
    // bit 0: streams; bit 1: gold.
    flags[k] = (k % stride === 0 ? 1 : 0) | (hash(k, 13) < 0.3 ? 2 : 0);
  }
  // The frame's batches: rects as [x, y, size], streaks as [x0, y0, x1, y1].
  const dockRects = new Float32Array(n * 3);
  const lockRects = new Float32Array(n * 3);
  const glowRects = new Float32Array(n * 3);
  const streaks = [new Float32Array(n * 4), new Float32Array(n * 4)];
  const streakCount = [0, 0];
  const at = new Float32Array(2);
  const drawn = { coat: 0, dock: 0, lock: 0, stream: 0 };
  // The first tile landing after `q` (binary search; t1 ascending).
  const firstAfter = (q: number) => {
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t1[mid] <= q) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const fillRects = (context: CanvasRenderingContext2D, rects: Float32Array, count: number) => {
    context.beginPath();
    for (let i = 0; i < count; i += 1) {
      const s = rects[i * 3 + 2];
      context.rect(rects[i * 3] - s / 2, rects[i * 3 + 1] - s / 2, s, s);
    }
    context.fill();
  };

  /* -- draw passes: allocation-free from here -- */

  const draw = (context: CanvasRenderingContext2D, q: number, calm: boolean, px: number) => {
    drawn.coat = drawn.dock = drawn.lock = drawn.stream = 0;
    if (q >= t1[n - 1] + T.lock || q <= t1[0] - T.lead - T.flight) return;
    const from = firstAfter(q - T.lock);
    let docks = 0;
    let locks = 0;
    let glows = 0;
    streakCount[0] = streakCount[1] = 0;
    // The coat first (one dark path), gathering the rest on the way.
    context.globalCompositeOperation = "source-over";
    context.beginPath();
    let coat = 0;
    for (let k = from; k < n; k += 1) {
      const landing = t1[k];
      if (landing - T.lead - T.flight >= q) break;
      const size = half[k] * 2;
      if (q >= landing) {
        // Its tile has landed: the lock's flash.
        if (calm) continue;
        const age = (q - landing) / T.lock;
        lockRects[locks * 3] = x[k];
        lockRects[locks * 3 + 1] = y[k];
        lockRects[locks * 3 + 2] = size * (1 - 0.7 * age);
        locks += 1;
        continue;
      }
      const docked = landing - T.lead;
      if (q >= docked) {
        // Docked: a cell of the coat, charging until its tile lands.
        context.rect(x[k] - half[k] + 0.3, y[k] - half[k] + 0.3, size - 0.6, size - 0.6);
        coat += 1;
        const charge = (q - docked) / T.lead;
        glowRects[glows * 3] = x[k];
        glowRects[glows * 3 + 1] = y[k];
        // (Unevenly: the coat glitters, it is not a printed grid.)
        glowRects[glows * 3 + 2] = size * (0.14 + shine[k] * 0.7 * charge * charge);
        glows += 1;
        if (!calm && q - docked < T.dock) {
          const age = (q - docked) / T.dock;
          dockRects[docks * 3] = x[k];
          dockRects[docks * 3 + 1] = y[k];
          dockRects[docks * 3 + 2] = size * (1.05 - 0.45 * age);
          docks += 1;
        }
        continue;
      }
      if (calm || !(flags[k] & 1)) continue;
      // In flight: its streak, head first.
      const a = 1 - (docked - q) / T.flight;
      const tone = flags[k] >> 1;
      const buffer = streaks[tone];
      const c = streakCount[tone] * 4;
      farFromTidePath(x[k], y[k], angle[k], reach[k], spin[k], a, q, at);
      buffer[c] = at[0];
      buffer[c + 1] = at[1];
      farFromTidePath(x[k], y[k], angle[k], reach[k], spin[k], Math.max(0, a - T.tail), q, at);
      buffer[c + 2] = at[0];
      buffer[c + 3] = at[1];
      streakCount[tone] += 1;
    }
    if (coat) {
      context.globalAlpha = 0.8;
      context.fillStyle = COAT;
      context.fill();
    }
    context.globalCompositeOperation = "lighter";
    if (glows) {
      context.globalAlpha = 0.42;
      context.fillStyle = ICE;
      fillRects(context, glowRects, glows);
    }
    if (docks) {
      context.globalAlpha = 0.7;
      context.fillStyle = PALE;
      fillRects(context, dockRects, docks);
    }
    if (locks) {
      context.globalAlpha = 0.5;
      context.fillStyle = GOLD;
      fillRects(context, lockRects, locks);
    }
    // The streams: one stroke a tone, then the heads.
    context.lineCap = "round";
    for (let tone = 0; tone < 2; tone += 1) {
      const count = streakCount[tone];
      if (!count) continue;
      const buffer = streaks[tone];
      context.beginPath();
      for (let i = 0; i < count; i += 1) {
        context.moveTo(buffer[i * 4 + 2], buffer[i * 4 + 3]);
        context.lineTo(buffer[i * 4], buffer[i * 4 + 1]);
      }
      context.strokeStyle = tone ? GOLD : ICE;
      context.globalAlpha = 0.5;
      context.lineWidth = T.line * px;
      context.stroke();
      const head = T.head * px;
      context.beginPath();
      for (let i = 0; i < count; i += 1)
        context.rect(buffer[i * 4] - head / 2, buffer[i * 4 + 1] - head / 2, head, head);
      context.fillStyle = tone ? GOLD : PALE;
      context.globalAlpha = 0.92;
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    drawn.coat = coat;
    drawn.dock = docks;
    drawn.lock = locks;
    drawn.stream = streakCount[0] + streakCount[1];
  };

  /* -- end of the draw passes -- */

  return { draw, count: n, drawn };
}
