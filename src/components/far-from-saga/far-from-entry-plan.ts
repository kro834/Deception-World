import {
  FAR_FROM_ENTRY_PIECES,
  FAR_FROM_ENTRY_SIZE,
  FAR_FROM_ENTRY_TILE,
  type FarFromEntryPiece,
} from "@/lib/far-from-entry-suit";
import {
  FAR_FROM_SUIT_FIT,
  FAR_FROM_SUIT_FLIGHT,
  FAR_FROM_SUIT_REVEAL_MS,
} from "@/lib/far-from-entry-calls";
import { FAR_FROM_ENTRY_MATERIAL, farFromMaterialLanding } from "@/lib/far-from-entry-ignition.js";

/* The entry engine's plan (far-from-entry-engine draws it): each plate's
   micro-tiles — where each sits in the atlas and in the figure, when it
   lands (from the seam outward across the plate, within the plate's landing
   window before its fit) and where it streams in from — as flat typed
   arrays, built once per tier. Modelled on rexonance-suit-plan.ts tilesOf;
   no gold cells (ミドル's gold arrives with its art) and no working atlas
   (the atlas is never drawn into). */

// Touch screens draw the nanites in 2 x 2 blocks of the art's micro-tiles:
// a quarter of the draws a frame, the same art and the same order.
const TOUCH =
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(pointer: coarse), (any-pointer: coarse)").matches;
const BLOCK = TOUCH ? 2 : 1;
export const T = FAR_FROM_ENTRY_TILE * BLOCK;
export const FIG = FAR_FROM_ENTRY_SIZE;
const GROW = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
// The chips' tones as the tiles' own light (ice, pink, white; gold for the
// trims' share): the kit rows, by hash.
const TONES = Uint8Array.of(0, 0, 3, 2, 0, 3, 1, 0, 2, 3);

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const bitsOf = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const has = (bits: Uint8Array, bit: number) => (bits[bit >> 3] & (1 << (bit & 7))) !== 0;

export type FarFromEntryPlan = {
  readonly pieces: readonly FarFromEntryPiece[];
  /** Per plate: its fit, when its first tile flies, the index of its first
   * tile (plateTiles has plates + 1 entries). */
  readonly fit: Float32Array;
  readonly spawn: Float32Array;
  readonly plateTiles: Int32Array;
  readonly total: number;
  /** Per tile: atlas x/y, figure x/y, size (clipped to the plate), tone row,
   * landing time, the offset it flies in from, its flight's start. */
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly dx: Float32Array;
  readonly dy: Float32Array;
  readonly tw: Float32Array;
  readonly th: Float32Array;
  readonly tone: Uint8Array;
  readonly land: Float32Array;
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  readonly start: Float32Array;
  /** The swarm's view of the tiles: where a tile's flight starts (figure px)
   * and when. */
  readonly flightX: Float32Array;
  readonly flightY: Float32Array;
};

let PLAN: FarFromEntryPlan | undefined;

/** The plan, built once (a few ms). */
export function farFromEntryPlan(): FarFromEntryPlan {
  if (PLAN) return PLAN;
  const pieces = FAR_FROM_ENTRY_PIECES;
  const plates = pieces.length;
  const counts = new Int32Array(plates);
  const grids: { cols: number; rows: number; painted: Uint8Array }[] = [];
  let total = 0;
  for (let p = 0; p < plates; p += 1) {
    const piece = pieces[p];
    const cols = Math.ceil(piece.w / T);
    const rows = Math.ceil(piece.h / T);
    const bits = bitsOf(piece.tiles);
    const mcols = Math.ceil(piece.w / FAR_FROM_ENTRY_TILE);
    const mrows = Math.ceil(piece.h / FAR_FROM_ENTRY_TILE);
    const painted = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row += 1)
      for (let col = 0; col < cols; col += 1) {
        let on = false;
        for (let dy = 0; dy < BLOCK && !on; dy += 1)
          for (let dx = 0; dx < BLOCK; dx += 1) {
            const r = row * BLOCK + dy;
            const c = col * BLOCK + dx;
            if (r < mrows && c < mcols && has(bits, r * mcols + c)) {
              on = true;
              break;
            }
          }
        if (on) {
          painted[row * cols + col] = 1;
          counts[p] += 1;
        }
      }
    grids.push({ cols, rows, painted });
    total += counts[p];
  }
  const plan: FarFromEntryPlan = {
    pieces,
    fit: new Float32Array(plates),
    spawn: new Float32Array(plates),
    plateTiles: new Int32Array(plates + 1),
    total,
    sx: new Float32Array(total),
    sy: new Float32Array(total),
    dx: new Float32Array(total),
    dy: new Float32Array(total),
    tw: new Float32Array(total),
    th: new Float32Array(total),
    tone: new Uint8Array(total),
    land: new Float32Array(total),
    ox: new Float32Array(total),
    oy: new Float32Array(total),
    start: new Float32Array(total),
    flightX: new Float32Array(total),
    flightY: new Float32Array(total),
  };
  let at = 0;
  const cx = FIG.width / 2;
  const cy = FIG.height / 2;
  for (let p = 0; p < plates; p += 1) {
    const piece = pieces[p];
    const fit = FAR_FROM_SUIT_FIT[piece.id];
    if (!Number.isFinite(fit)) throw new Error(`no fit for ${piece.id}`);
    const bits = piece.group === "bits";
    const flight = FAR_FROM_SUIT_FLIGHT.ms * (bits ? FAR_FROM_SUIT_FLIGHT.bits : 1);
    const [gx, gy] = GROW[piece.dir];
    const { cols, rows, painted } = grids[p];
    plan.fit[p] = fit;
    plan.plateTiles[p] = at;
    let spawn = Infinity;
    for (let row = 0; row < rows; row += 1)
      for (let col = 0; col < cols; col += 1) {
        if (!painted[row * cols + col]) continue;
        const tcx = (col + 0.5) * T;
        const tcy = (row + 0.5) * T;
        const along =
          piece.dir === "up"
            ? 1 - tcy / piece.h
            : piece.dir === "down"
              ? tcy / piece.h
              : piece.dir === "left"
                ? 1 - tcx / piece.w
                : tcx / piece.w;
        const k = hash(p * 131 + col, row * 17 + p);
        const k2 = hash(row + p * 7, col * 29 + 3);
        const progress = Math.min(1, Math.max(0, along + (k - 0.5) * 0.28));
        // Behind the seam, a little to the side: streaming along the body.
        // The bits fly in from outside the frame, away from the body.
        const x = piece.x + col * T;
        const y = piece.y + row * T;
        let ox: number;
        let oy: number;
        if (bits) {
          const away = Math.hypot(x - cx, y - cy) || 1;
          ox = ((x - cx) / away) * FIG.width * (0.3 + 0.2 * k2);
          oy = ((y - cy) / away) * FIG.width * (0.3 + 0.2 * k2);
        } else {
          const reach = FIG.height * (0.016 + 0.02 * k2);
          const side = FIG.height * (k - 0.5) * 0.024;
          ox = -gx * reach + gy * side;
          oy = -gy * reach + gx * side;
        }
        const land = farFromMaterialLanding(
          fit - FAR_FROM_SUIT_REVEAL_MS + progress * FAR_FROM_SUIT_REVEAL_MS,
          fit,
        );
        const spread =
          FAR_FROM_SUIT_FLIGHT.spread[0] +
          (FAR_FROM_SUIT_FLIGHT.spread[1] - FAR_FROM_SUIT_FLIGHT.spread[0]) * k;
        const start = Math.max(FAR_FROM_ENTRY_MATERIAL, land - flight * spread);
        plan.sx[at] = piece.ax + col * T;
        plan.sy[at] = piece.ay + row * T;
        plan.dx[at] = x;
        plan.dy[at] = y;
        plan.tw[at] = Math.min(T, piece.w - col * T);
        plan.th[at] = Math.min(T, piece.h - row * T);
        plan.tone[at] = TONES[Math.floor(k2 * TONES.length)];
        plan.land[at] = land;
        plan.ox[at] = ox;
        plan.oy[at] = oy;
        plan.start[at] = start;
        plan.flightX[at] = x + ox + plan.tw[at] / 2;
        plan.flightY[at] = y + oy + plan.th[at] / 2;
        if (start < spawn) spawn = start;
        at += 1;
      }
    plan.spawn[p] = spawn;
  }
  plan.plateTiles[plates] = at;
  PLAN = plan;
  return plan;
}
