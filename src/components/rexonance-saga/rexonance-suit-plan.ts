import {
  REXONANCE_SUIT_ACCENTS,
  REXONANCE_SUIT_DRIVER,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_GOLD,
  REXONANCE_SUIT_GOLD_AT,
  REXONANCE_SUIT_REVEAL_MS,
} from "@/lib/rexonance-calls";
import {
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
  type RexonanceSuitPiece,
} from "@/lib/rexonance-suit";
import { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } from "@/lib/rexonance-suit-gold";
import { createSplitLightsJob, splitLights } from "@/lib/rexonance-unlit.js";
import { rexonanceSuitSource } from "@/lib/rexonance-suit-warmup";

/* rx17: the nanite engine's plan and working atlas (rexonance-suit-nanites
   draws them): each plate's micro-tiles and when they land, its gold cells
   in the order the gold runs and when each locks, the accents' surges, and
   the working copy of the atlas the plates arrive from (the art with its
   gold unformed). Built once, in idle slices ahead of the call
   (prepareRexonanceSuit, which the warm-up runs once the layers decode), or
   whatever is left when the call starts. */

// Touch screens (owner, 2026-10-11: the call felt heavy on an iPad) draw the
// nanites in 2 x 2 blocks of the art's micro-tiles: a quarter of the draws a
// frame, the same art and the same order.
const TOUCH =
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(pointer: coarse), (any-pointer: coarse)").matches;
const BLOCK = TOUCH ? 2 : 1;
export const T = REXONANCE_SUIT_TILE * BLOCK;
export const G = REXONANCE_SUIT_GOLD_CELL;
export const FIG = REXONANCE_SUIT_SIZE;
export const GOLD = REXONANCE_SUIT_GOLD;
/** How long a tile streams before it locks (ms). */
export const FLIGHT = 170;
const GROW = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
// The plates' own motes are ice, pink and white; gold belongs to the gold
// nanites (rx17).
const TONES = ["#8cefff", "#8cefff", "#ff8fd8", "#c4f4ff", "#8cefff", "#ff8fd8", "#eefcff"];

export type Tile = {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  /** Its size, clipped to the plate's box (a tile never reads its
   * neighbour's art in the atlas). */
  tw: number;
  th: number;
  land: number;
  ox: number;
  oy: number;
  tone: string;
};
export type Plate = {
  piece: RexonanceSuitPiece;
  fit: number;
  spawn: number;
  tiles: Tile[];
  /** Its gold cells: [first, end) of the flat arrays, by lock time. */
  first: number;
  end: number;
  /** Its gold forms from `from` to `to`; nothing is left to draw after `last`. */
  from: number;
  to: number;
  last: number;
};
/** A DEUS！ accent's surge through its group's gold (cells by reach). */
export type Surge = { from: number; to: number; cells: Int32Array; reach: Float32Array };

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const bitsOf = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const has = (bits: Uint8Array, bit: number) => (bits[bit >> 3] & (1 << (bit & 7))) !== 0;

// The gold cells, flat: the cell's place in the figure, in the atlas, its
// size (clipped to its plate's box), when it locks, its place along its
// plate's flow (0..1) and where its mote flies in from (figure px).
export const GOLD_TOTAL = Object.entries(REXONANCE_SUIT_GOLD_CELLS).reduce((sum, [id, base64]) => {
  // The driver's trim is already finished. Reserve only cells that goldOf
  // initializes, otherwise its skipped mask leaves phantom cells at the end.
  if (REXONANCE_SUIT_DRIVER.includes(id)) return sum;
  let count = 0;
  for (const byte of bitsOf(base64))
    for (let bit = 0; bit < 8; bit += 1) count += (byte >> bit) & 1;
  return sum + count;
}, 0);
export type Cells = {
  fx: Float32Array;
  fy: Float32Array;
  ax: Float32Array;
  ay: Float32Array;
  cw: Float32Array;
  ch: Float32Array;
  lock: Float32Array;
  order: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
};
let CELLS: Cells | undefined;
export const cells = () =>
  (CELLS ??= {
    fx: new Float32Array(GOLD_TOTAL),
    fy: new Float32Array(GOLD_TOTAL),
    ax: new Float32Array(GOLD_TOTAL),
    ay: new Float32Array(GOLD_TOTAL),
    cw: new Float32Array(GOLD_TOTAL),
    ch: new Float32Array(GOLD_TOTAL),
    lock: new Float32Array(GOLD_TOTAL),
    order: new Float32Array(GOLD_TOTAL),
    ox: new Float32Array(GOLD_TOTAL),
    oy: new Float32Array(GOLD_TOTAL),
  });

// A plate's micro-tiles: their landing times (from the seam outward across
// the plate's growth) and where they stream in from.
function tilesOf(piece: RexonanceSuitPiece, index: number, fit: number) {
  const [gx, gy] = GROW[piece.dir];
  const cols = Math.ceil(piece.w / T);
  const rows = Math.ceil(piece.h / T);
  const bits = bitsOf(piece.tiles);
  // The micro-tiles' own grid (the bitmask's), and whether a block holds art.
  const mcols = Math.ceil(piece.w / REXONANCE_SUIT_TILE);
  const mrows = Math.ceil(piece.h / REXONANCE_SUIT_TILE);
  const painted = (row: number, col: number) => {
    for (let dy = 0; dy < BLOCK; dy += 1)
      for (let dx = 0; dx < BLOCK; dx += 1) {
        const r = row * BLOCK + dy;
        const c = col * BLOCK + dx;
        if (r < mrows && c < mcols && has(bits, r * mcols + c)) return true;
      }
    return false;
  };
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!painted(row, col)) continue;
      const cx = (col + 0.5) * T;
      const cy = (row + 0.5) * T;
      const along =
        piece.dir === "up"
          ? 1 - cy / piece.h
          : piece.dir === "down"
            ? cy / piece.h
            : piece.dir === "left"
              ? 1 - cx / piece.w
              : cx / piece.w;
      const k = hash(index * 131 + col, row * 17 + index);
      const k2 = hash(row + index * 7, col * 29 + 3);
      const progress = Math.min(1, Math.max(0, along + (k - 0.5) * 0.28));
      // Behind the seam, a little to the side: streaming along the body.
      const reach = FIG.height * (0.016 + 0.02 * k2);
      const side = FIG.height * (k - 0.5) * 0.024;
      tiles.push({
        sx: piece.ax + col * T,
        sy: piece.ay + row * T,
        dx: piece.x + col * T,
        dy: piece.y + row * T,
        tw: Math.min(T, piece.w - col * T),
        th: Math.min(T, piece.h - row * T),
        land: fit - REXONANCE_SUIT_REVEAL_MS + progress * REXONANCE_SUIT_REVEAL_MS,
        ox: -gx * reach + gy * side,
        oy: -gy * reach + gx * side,
        tone: TONES[Math.floor(k2 * TONES.length)],
      });
    }
  }
  return tiles;
}

// rx17: a plate's gold cells, in the order the gold runs: from the seat
// along each connected trim (a breadth-first walk over the cells, so it
// follows the channel round corners); a trim the walk cannot reach starts
// from its cell nearest the seat, a little later the farther it lies. Each
// mote flies in from the cell it flowed from.
function goldOf(piece: RexonanceSuitPiece, index: number, at: number, out: Cells) {
  const base64 = REXONANCE_SUIT_GOLD_CELLS[piece.id];
  if (!base64) return at;
  const [from, to] = REXONANCE_SUIT_GOLD_AT[piece.id];
  const bits = bitsOf(base64);
  const cols = Math.ceil(piece.w / G);
  const rows = Math.ceil(piece.h / G);
  const grid = new Int32Array(cols * rows).fill(-1);
  const col: number[] = [];
  const row: number[] = [];
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      if (!has(bits, r * cols + c)) continue;
      grid[r * cols + c] = col.length;
      col.push(c);
      row.push(r);
    }
  const n = col.length;
  const seatX = (piece.seat[0] - piece.x) / G - 0.5;
  const seatY = (piece.seat[1] - piece.y) / G - 0.5;
  const reach = new Float32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let seen = 0;
  while (seen < n) {
    // The trim's entry: the unreached cell nearest the seat.
    let entry = -1;
    let best = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (reach[i] >= 0) continue;
      const d = Math.hypot(col[i] - seatX, row[i] - seatY);
      if (d < best) {
        best = d;
        entry = i;
      }
    }
    let head = 0;
    let tail = 0;
    reach[entry] = best * 0.45;
    queue[tail++] = entry;
    seen += 1;
    while (head < tail) {
      const i = queue[head++];
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const c = col[i] + dx;
          const r = row[i] + dy;
          if ((!dx && !dy) || c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const j = grid[r * cols + c];
          if (j < 0 || reach[j] >= 0) continue;
          reach[j] = reach[i] + (dx && dy ? 1.41 : 1);
          parent[j] = i;
          queue[tail++] = j;
          seen += 1;
        }
    }
  }
  let most = 0;
  for (let i = 0; i < n; i += 1) most = Math.max(most, reach[i]);
  const order = Array.from({ length: n }, (_, i) => i);
  const flow = Float32Array.from(reach, (value, i) =>
    Math.min(1, Math.max(0, (most ? value / most : 0) * 0.95 + hash(index * 977 + i, 41) * 0.05)),
  );
  order.sort((a, b) => flow[a] - flow[b]);
  for (const i of order) {
    // Upstream: the cell it flowed from (or, for an entry, the seat).
    const p = parent[i];
    let ux = p >= 0 ? col[p] - col[i] : seatX - col[i];
    let uy = p >= 0 ? row[p] - row[i] : seatY - row[i];
    const length = Math.hypot(ux, uy) || 1;
    ux /= length;
    uy /= length;
    const k = hash(index * 31 + i, 7) - 0.5;
    out.fx[at] = piece.x + col[i] * G;
    out.fy[at] = piece.y + row[i] * G;
    out.ax[at] = piece.ax + col[i] * G;
    out.ay[at] = piece.ay + row[i] * G;
    out.cw[at] = Math.min(G, piece.w - col[i] * G);
    out.ch[at] = Math.min(G, piece.h - row[i] * G);
    out.lock[at] = from + flow[i] * (to - from);
    out.order[at] = flow[i];
    out.ox[at] = (ux * 2.6 - uy * k * 1.4) * G;
    out.oy[at] = (uy * 2.6 + ux * k * 1.4) * G;
    at += 1;
  }
  return at;
}

// The plan, built once — in idle slices ahead of the call
// (prepareRexonanceSuit), or whatever is left when the call starts.
let PLATES: Plate[] | undefined;
let SURGES: Surge[] | undefined;
let END = 0;
const building: Plate[] = [];
let goldAt = 0;
function step() {
  const index = building.length;
  const piece = REXONANCE_SUIT_PIECES[index];
  const fit = REXONANCE_SUIT_FIT[piece.id];
  const tiles = tilesOf(piece, index, fit);
  const first = goldAt;
  // The driver is on the body finished: no gold forms there (owner).
  if (!REXONANCE_SUIT_DRIVER.includes(piece.id)) goldAt = goldOf(piece, index, goldAt, cells());
  const [from, to] = REXONANCE_SUIT_GOLD_AT[piece.id] ?? [fit, fit];
  const spawn = Math.min(...tiles.map((tile) => tile.land)) - FLIGHT;
  building.push({
    piece,
    fit,
    spawn,
    tiles,
    first,
    end: goldAt,
    from,
    to,
    last: goldAt > first ? to + Math.max(GOLD.cool, GOLD.glint) : fit,
  });
  if (building.length < REXONANCE_SUIT_PIECES.length) return false;
  // Each accent's surge, by distance from its seat through its group's gold.
  const all = cells();
  SURGES = REXONANCE_SUIT_ACCENTS.map((id) => {
    const accent = building.find((plate) => plate.piece.id === id)!;
    const [sx, sy] = accent.piece.seat;
    const group = building.filter((plate) => plate.piece.group === accent.piece.group);
    const list: number[] = [];
    for (const plate of group) for (let i = plate.first; i < plate.end; i += 1) list.push(i);
    const distance = list.map((i) => Math.hypot(all.fx[i] + G / 2 - sx, all.fy[i] + G / 2 - sy));
    const most = Math.max(1, ...distance);
    const sorted = list.map((_, k) => k).sort((a, b) => distance[a] - distance[b]);
    return {
      from: accent.from,
      to: accent.from + GOLD.surge,
      cells: Int32Array.from(sorted, (k) => list[k]),
      reach: Float32Array.from(sorted, (k) => distance[k] / most),
    };
  });
  END = Math.max(
    ...building.map((plate) => plate.last),
    ...SURGES.map((surge) => surge.to),
    REXONANCE_SUIT_FIT["helmet-crest"] + 40,
  );
  PLATES = building;
  return true;
}
export function plates() {
  while (!PLATES) step();
  return PLATES;
}
/** The accents' surges, and when the last of the gold's light is done. */
export const planSurges = () => SURGES ?? [];
export const planEnd = () => END;

// The working atlas: the plates' art with their gold unformed (raw
// gunmetal channels); gold cells are drawn into it as they lock. Reset to
// raw before each call.
// `drawing`: calls drawing into it now (the idle preparation then leaves
// it alone); `dirty`: it holds a call's formed gold (reset before the next).
export const work = { canvas: null as HTMLCanvasElement | null, dirty: true, drawing: 0 };
let preparingLights = false;
/** Decoded layers alone do not mean the first frame's plan/atlas are warm.
 * A live call owns its formed atlas; a subsequent call must reset it first. */
export const isRexonanceSuitPlanReady = () =>
  Boolean(PLATES && work.canvas && (work.drawing > 0 || (!preparingLights && !work.dirty)));

// The plates' lights held back (owner, 2026-10-11): the atlas's art half with
// its ice-cyan and pink light in monochrome, and that light alone, to light
// the suit once it is whole. Made once, in idle time, from the decoded atlas.
let LIGHTS: {
  unlit: HTMLCanvasElement;
  lights: HTMLCanvasElement;
  figure: HTMLCanvasElement;
} | null = null;
export const plateLights = () => LIGHTS;
function layOutLights(split: { unlit: HTMLCanvasElement; lights: HTMLCanvasElement }) {
  const figure = Object.assign(globalThis.document.createElement("canvas"), {
    width: FIG.width,
    height: FIG.height,
  });
  const context = figure.getContext("2d");
  if (!context) throw new Error("unavailable figure light context");
  for (const piece of REXONANCE_SUIT_PIECES)
    context.drawImage(
      split.lights,
      piece.ax,
      piece.ay,
      piece.w,
      piece.h,
      piece.x,
      piece.y,
      piece.w,
      piece.h,
    );
  return { ...split, figure };
}
export function prepareLights(art: CanvasImageSource) {
  if (!LIGHTS && !work.drawing) {
    const { width, height } = REXONANCE_SUIT_GOLD_ATLAS;
    const split = splitLights(art, 0, 0, width, height);
    if (split) {
      LIGHTS = layOutLights(split);
      work.dirty = true;
    }
  }
  return LIGHTS;
}
export function forming(art: CanvasImageSource, gold: CanvasImageSource) {
  const { width, height } = REXONANCE_SUIT_GOLD_ATLAS;
  if (!work.canvas) {
    work.canvas = Object.assign(globalThis.document.createElement("canvas"), { width, height });
    work.dirty = true;
  }
  const context = work.canvas.getContext("2d");
  if (!context) return null;
  if (work.dirty) {
    context.clearRect(0, 0, width, height);
    context.drawImage(LIGHTS?.unlit ?? art, 0, 0, width, height, 0, 0, width, height);
    context.drawImage(gold, 0, 0);
    work.dirty = false;
  }
  return context;
}

let preparation: Promise<boolean> | null = null;
let promotePreparation: (() => void) | null = null;
/** rx17: builds the engine's plan and its working atlas in idle time, a
 * few plates a slice. When completed before the call, its first frame needs
 * no plan generation. Resolves true once both are ready (false if the
 * layers or drawing context are unavailable); later calls can retry. High
 * priority promotes a queued idle slice to rAF without duplicating its job.
 * Navigation deadlines/cancellation belong to the awaiting caller: this
 * shared plan may still be useful for the next intent. */
export function prepareRexonanceSuit(priority: "low" | "high" = "low") {
  // Intent, the page's idle warm-up and a call can overlap. They must share
  // one sliced build, not start several idle queues against the same plan.
  if (preparation) {
    if (priority === "high") promotePreparation?.();
    return preparation;
  }
  const pending = new Promise<boolean>((resolve) => {
    let urgent = priority === "high";
    let settled = false;
    let generation = 0;
    let queued: { kind: "idle" | "frame"; id: number } | null = null;
    let stage: "plan" | "light-setup" | "light-rows" | "light-commit" | "atlas" = "plan";
    let lightJob: ReturnType<typeof createSplitLightsJob> = null;
    let lightSource: CanvasImageSource | null = null;
    const cancelQueued = () => {
      generation += 1;
      if (queued?.kind === "idle") globalThis.cancelIdleCallback?.(queued.id);
      else if (queued?.kind === "frame") globalThis.cancelAnimationFrame(queued.id);
      queued = null;
    };
    const settle = (prepared: boolean) => {
      if (settled) return;
      settled = true;
      cancelQueued();
      lightJob?.cancel();
      lightJob = null;
      lightSource = null;
      preparingLights = false;
      resolve(prepared);
    };
    const finish = (until: number, deadline?: IdleDeadline) => {
      const art = rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src);
      const gold = rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
      if (!art || !gold) {
        settle(false);
        return;
      }
      // A foreground call can take over between any two slices. Leave its
      // formed atlas and light choice alone; unpublished buffers are ours.
      if (work.drawing) {
        settle(true);
        return;
      }
      if (LIGHTS && stage !== "plan" && stage !== "atlas") {
        lightJob?.cancel();
        lightJob = null;
        stage = "atlas";
        schedule();
        return;
      }
      if (lightJob && art !== lightSource) {
        // A decoder retry replaced the borrowed bitmap while we yielded.
        lightJob.cancel();
        lightJob = null;
        lightSource = null;
        stage = "light-setup";
        schedule();
        return;
      }
      if (!LIGHTS && stage === "plan") {
        preparingLights = true;
        stage = "light-setup";
        schedule();
        return;
      }
      if (stage === "light-setup") {
        const { width, height } = REXONANCE_SUIT_GOLD_ATLAS;
        lightJob = createSplitLightsJob(art, 0, 0, width, height);
        lightSource = art;
        stage = lightJob ? "light-rows" : "atlas";
        schedule();
        return;
      }
      if (stage === "light-rows") {
        if (lightJob!.step(until, deadline)) stage = "light-commit";
        schedule();
        return;
      }
      if (stage === "light-commit") {
        // Only complete layers are published. Commit and the working-atlas
        // draw are separate tasks, not added after a six-ms pixel slice.
        const split = lightJob!.commit();
        LIGHTS = split ? layOutLights(split) : null;
        lightJob!.cancel();
        lightJob = null;
        lightSource = null;
        work.dirty = true;
        stage = "atlas";
        schedule();
        return;
      }
      settle(Boolean(forming(art, gold)));
    };
    const schedule = () => {
      const ticket = generation;
      const resume = (deadline?: IdleDeadline) => {
        // Some older hosts cannot cancel idle callbacks. A stale callback
        // must not clear or duplicate the promoted frame's current queue.
        if (settled || ticket !== generation) return;
        queued = null;
        slice(deadline);
      };
      if (!urgent && globalThis.requestIdleCallback)
        queued = { kind: "idle", id: globalThis.requestIdleCallback(resume, { timeout: 600 }) };
      else
        queued = {
          kind: "frame",
          id: globalThis.requestAnimationFrame(() => resume()),
        };
    };
    const slice = (deadline?: IdleDeadline) => {
      try {
        const until = performance.now() + 6;
        while (!PLATES) {
          step();
          // An idle callback may offer almost 50 ms. Keep our own short
          // budget too, so preparation cannot spend that whole frame when a
          // navigation or first call arrives on a throttled phone.
          if (performance.now() > until || (deadline && deadline.timeRemaining() < 2)) break;
        }
        if (PLATES) finish(until, deadline);
        else schedule();
      } catch {
        // A lost/unavailable 2D context or a decode invalidated by a retry
        // must settle even from a later idle callback. The immutable plan is
        // retained; a new preparation can retry only its working atlas.
        work.dirty = true;
        settle(false);
      }
    };
    promotePreparation = () => {
      if (settled || urgent) return;
      urgent = true;
      cancelQueued();
      schedule();
    };
    slice();
  });
  preparation = pending;
  void pending.then(() => {
    if (preparation === pending) {
      preparation = null;
      promotePreparation = null;
    }
  });
  return pending;
}
