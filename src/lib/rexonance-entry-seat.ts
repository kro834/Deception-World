/* REXONANCE ENTRY SEAT (owner, 2026-11-19: 「レクソナンスのナノマシンの装着
   アニメーションをさらに強化します」). Under the skin the armour was whole
   before the call's first DEUS！: the front ran out from the reactor on its
   own ease and nothing was left to seat on the beats the camera visits.

   The entry now splits the spread from the seat. The liquid front still
   runs out from the reactor (the skin's own field, untouched), but a plate
   stays raw nanite metal until its own fit on the call sheet
   (REXONANCE_SUIT_FIT: the legs up to the first DEUS！, the waist, the arms,
   the chest, then the shoulders, the tail and the ribbons); there its cells
   click solid from its seam across it, the way the plate grows
   (RexonanceSuitPiece.dir). The reactor (the trigger), the driver (worn
   from the first frame) and the helmet (the head's own front and its visor
   sweep) are never held.

   This module is numbers only: the map is built from the plates' own
   micro-tile masks, no picture is read. The skin's shader compares it with
   the call's canonical clock (the skin's own SEAT block, which
   the scroll scene's program does not compile). */
import {
  REXONANCE_SUIT_DRIVER,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_REVEAL_MS,
} from "./rexonance-calls.ts";
import {
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
  type RexonanceSuitPiece,
} from "./rexonance-suit.ts";

/** A map texel, in figure px (a third of a micro-tile). */
export const ENTRY_SEAT_CELL = 3;
/** The map's clock: a byte of 255 is this many canonical ms. */
export const ENTRY_SEAT_SCALE_MS = 2040;
/** A held plate's material: liquid metal with the tessellation showing
 * through, just short of its first cell's click (the shader's bands). */
export const ENTRY_SEAT_GATE = 2.2;
/** One band of the material in ms, once a texel's gate has opened: its
 * cells click over about 80 ms and its panel lines cool by 150 ms. */
export const ENTRY_SEAT_UNIT_MS = 30;
/** A plate's last texel opens this long before its fit, so most of its
 * cells have clicked on the fit itself (the clank, the camera's lock). */
export const ENTRY_SEAT_LEAD_MS = 50;
/** The back-to-front order the call stacks its plates in. */
const STACK = ["ribbon", "tail", "legs", "waist", "arms", "chest", "shoulders", "helm"] as const;
/** Never held: the reactor is the front's trigger. */
const REACTOR: readonly string[] = ["core-swirl", "core-disc"];

export type EntrySeatMap = { data: Uint8Array; width: number; height: number };

const tileBits = (tiles: string) => {
  const text = globalThis.atob(tiles);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
};

/** Whether a plate is held for its fit. */
export const entrySeatHeld = (piece: Pick<RexonanceSuitPiece, "id" | "group">) =>
  piece.group !== "helm" && !REXONANCE_SUIT_DRIVER.includes(piece.id) && !REACTOR.includes(piece.id);

/** When the texel `along` a plate's growth (0 its seam, 1 its far edge)
 * opens, in canonical ms. */
export const entrySeatOpens = (fit: number, along: number) =>
  fit - ENTRY_SEAT_LEAD_MS - REXONANCE_SUIT_REVEAL_MS * (1 - Math.min(1, Math.max(0, along)));

/** The map: for each texel the canonical ms its gate opens at, as a byte
 * (0: never held). Later plates in the stack lie over earlier ones. */
export function buildEntrySeatMap(
  pieces: readonly RexonanceSuitPiece[] = REXONANCE_SUIT_PIECES,
): EntrySeatMap {
  const width = Math.ceil(REXONANCE_SUIT_SIZE.width / ENTRY_SEAT_CELL);
  const height = Math.ceil(REXONANCE_SUIT_SIZE.height / ENTRY_SEAT_CELL);
  const data = new Uint8Array(width * height);
  const tile = REXONANCE_SUIT_TILE;
  for (const group of STACK) {
    const plates = pieces.filter((piece) => piece.group === group).reverse();
    for (const piece of plates) {
      const held = entrySeatHeld(piece);
      const fit = REXONANCE_SUIT_FIT[piece.id] ?? 0;
      const bits = tileBits(piece.tiles);
      const columns = Math.ceil(piece.w / tile);
      const x0 = Math.max(0, Math.floor(piece.x / ENTRY_SEAT_CELL));
      const y0 = Math.max(0, Math.floor(piece.y / ENTRY_SEAT_CELL));
      const x1 = Math.min(width, Math.ceil((piece.x + piece.w) / ENTRY_SEAT_CELL));
      const y1 = Math.min(height, Math.ceil((piece.y + piece.h) / ENTRY_SEAT_CELL));
      for (let y = y0; y < y1; y += 1) {
        const fy = (y + 0.5) * ENTRY_SEAT_CELL - piece.y;
        if (fy < 0 || fy >= piece.h) continue;
        for (let x = x0; x < x1; x += 1) {
          const fx = (x + 0.5) * ENTRY_SEAT_CELL - piece.x;
          if (fx < 0 || fx >= piece.w) continue;
          const index = Math.floor(fy / tile) * columns + Math.floor(fx / tile);
          if (!((bits[index >> 3] >> (index & 7)) & 1)) continue;
          if (!held) {
            data[y * width + x] = 0;
            continue;
          }
          const along =
            piece.dir === "up"
              ? 1 - fy / piece.h
              : piece.dir === "down"
                ? fy / piece.h
                : piece.dir === "left"
                  ? 1 - fx / piece.w
                  : fx / piece.w;
          const opens = entrySeatOpens(fit, along);
          data[y * width + x] = Math.min(255, Math.max(1, Math.round((opens / ENTRY_SEAT_SCALE_MS) * 255)));
        }
      }
    }
  }
  return { data, width, height };
}

/* ---------------- the cells a seating plate takes in ---------------- */

/* With the liquid spread early, the air would stand empty while the plates
   seat. Fine hexagonal cells (the skin's own, SkinCells' specks: no trail,
   no line, no streak) come in from round each plate and each lands on one
   of its micro-tiles exactly as that texel's gate opens: the cell arrives,
   the metal under it clicks solid. Closed-form in the call's clock and
   per-cell seeds; nothing is allocated a frame. */

/** Cells over the whole suit, by the surge's device tier. */
export const ENTRY_SEAT_CELLS = { desktop: 520, tablet: 300, phone: 200, low: 110 } as const;
/** A cell's flight (ms), where it starts from its landing (figure px), its
 * width (figure px), and how long it sinks into the plate once landed. */
export const ENTRY_SEAT_FLIGHT = { ms: [230, 420], reach: [90, 260], size: [4, 9], sink: 45 } as const;

const STRIDE = 8;
const hash = (n: number, salt: number) => {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const TONES = ["rgb(178 238 255)", "rgb(255 170 224)", "rgb(246 251 255)"] as const;
type CellContext = Pick<
  CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "fillStyle" | "globalAlpha"
>;

export class EntrySeatCells {
  readonly count: number;
  /** Per cell: landing x, y, landing ms, flight ms, start dx, dy, width,
   * and swirl (signed, its tone in the fraction's place). */
  readonly cells: Float32Array;
  /** The first and last ms anything of them is in the air. */
  readonly from: number;
  readonly to: number;

  constructor(tier: string, pieces: readonly RexonanceSuitPiece[] = REXONANCE_SUIT_PIECES) {
    const budget = ENTRY_SEAT_CELLS[tier as keyof typeof ENTRY_SEAT_CELLS] ?? ENTRY_SEAT_CELLS.low;
    const tile = REXONANCE_SUIT_TILE;
    const axis = REXONANCE_SUIT_SIZE.width / 2;
    const held = pieces.filter(entrySeatHeld);
    // Each plate's own tiles (their indices in its box).
    const tiles = held.map((piece) => {
      const bits = tileBits(piece.tiles);
      const out: number[] = [];
      const total = Math.ceil(piece.w / tile) * Math.ceil(piece.h / tile);
      for (let index = 0; index < total; index += 1)
        if ((bits[index >> 3] >> (index & 7)) & 1) out.push(index);
      return out;
    });
    const all = tiles.reduce((sum, list) => sum + list.length, 0) || 1;
    const rows: number[] = [];
    // A cell lands when the map says its texel opens: where another plate
    // lies over this one, on that plate's clock (or, never held, not at all).
    const map = buildEntrySeatMap(pieces);
    held.forEach((piece, p) => {
      const list = tiles[p];
      if (!list.length) return;
      const columns = Math.ceil(piece.w / tile);
      // By its share of the suit's tiles, and never fewer than two.
      const n = Math.max(2, Math.round((budget * list.length) / all));
      for (let k = 0; k < n; k += 1) {
        const seed = p * 131 + k;
        const index = list[Math.floor(hash(seed, 1) * list.length) % list.length];
        const fx = Math.min(piece.w - 0.5, ((index % columns) + 0.15 + 0.7 * hash(seed, 2)) * tile);
        const fy = Math.min(piece.h - 0.5, (Math.floor(index / columns) + 0.15 + 0.7 * hash(seed, 3)) * tile);
        const x = piece.x + fx;
        const y = piece.y + fy;
        const opens =
          map.data[
            Math.min(map.height - 1, Math.floor(y / ENTRY_SEAT_CELL)) * map.width +
              Math.min(map.width - 1, Math.floor(x / ENTRY_SEAT_CELL))
          ];
        if (!opens) continue;
        // From outside the figure on the plate's own side, a little above.
        const side = x === axis ? (hash(seed, 4) < 0.5 ? -1 : 1) : Math.sign(x - axis);
        const angle = (hash(seed, 5) - 0.5) * 2.2 - 0.25;
        const [r0, r1] = ENTRY_SEAT_FLIGHT.reach;
        const reach = r0 + (r1 - r0) * hash(seed, 6);
        const [m0, m1] = ENTRY_SEAT_FLIGHT.ms;
        const [s0, s1] = ENTRY_SEAT_FLIGHT.size;
        const tone = k % 7 === 0 ? 2 : hash(seed, 9) < 0.5 ? 0 : 1;
        rows.push(
          x,
          y,
          (opens / 255) * ENTRY_SEAT_SCALE_MS,
          m0 + (m1 - m0) * hash(seed, 7),
          side * Math.cos(angle) * reach,
          Math.sin(angle) * reach,
          s0 + (s1 - s0) * hash(seed, 8) * hash(seed, 10),
          (hash(seed, 11) < 0.5 ? -1 : 1) * (tone + 0.2 + 0.6 * hash(seed, 12)),
        );
      }
    });
    this.cells = Float32Array.from(rows);
    this.count = rows.length / STRIDE;
    let from = Infinity;
    let to = -Infinity;
    for (let i = 0; i < this.count; i += 1) {
      const o = i * STRIDE;
      from = Math.min(from, this.cells[o + 2] - this.cells[o + 3]);
      to = Math.max(to, this.cells[o + 2] + ENTRY_SEAT_FLIGHT.sink);
    }
    this.from = this.count ? from : 0;
    this.to = this.count ? to : 0;
  }

  /** Cell `i` at canonical `t` ms: out = [x, y, width, alpha]; false while
   * it is not in the air. It quickens on its last approach along a short
   * spiral and is flat on its tile at its landing, then sinks in. */
  poseAt(out: Float32Array, i: number, t: number) {
    const o = i * STRIDE;
    const c = this.cells;
    const land = c[o + 2];
    const flight = c[o + 3];
    const u = (t - (land - flight)) / flight;
    if (!(u > 0) || t >= land + ENTRY_SEAT_FLIGHT.sink) return false;
    const k = u < 1 ? u : 1;
    // Slow off the air, fast onto the plate.
    const e = k * k * (0.45 + 0.55 * k);
    const swirl = c[o + 7];
    const turn = Math.sign(swirl) * 0.9 * (1 - e) * (1 - e);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const dx = c[o + 4] * (1 - e);
    const dy = c[o + 5] * (1 - e);
    out[0] = c[o] + dx * cos - dy * sin;
    out[1] = c[o + 1] + dx * sin + dy * cos;
    const sunk = u < 1 ? 0 : (t - land) / ENTRY_SEAT_FLIGHT.sink;
    out[2] = c[o + 6] * (1.25 - 0.4 * e) * (1 - 0.7 * sunk);
    out[3] = Math.min(1, k * 5) * (0.55 + 0.45 * e) * (1 - sunk);
    return true;
  }

  /** Draws the cells in the air at `t` on a figure-space context: three
   * fills (one a tone), hexagons only. `share` sheds them with the
   * governor; `least` is the smallest width worth a hexagon (one CSS px
   * and a half, in figure px). Returns how many it drew. */
  draw(context: CellContext, t: number, share = 1, alpha = 1, least = 0) {
    if (t <= this.from || t >= this.to || alpha <= 0.004 || share <= 0) return 0;
    const pose = POSE;
    const c = this.cells;
    let drawn = 0;
    for (let tone = 0; tone < TONES.length; tone += 1) {
      let any = false;
      for (let i = 0; i < this.count; i += 1) {
        const o = i * STRIDE;
        const land = c[o + 2];
        if (t < land - c[o + 3] || t >= land + ENTRY_SEAT_FLIGHT.sink) continue;
        if (Math.floor(Math.abs(c[o + 7])) !== tone) continue;
        // (A shed cell is the same cell every frame.)
        if (hash(i, 13) > share) continue;
        if (!this.poseAt(pose, i, t)) continue;
        // One path a brightness step: full, or two thirds.
        if (!any) {
          context.beginPath();
          any = true;
        }
        const w = Math.max(least, pose[2]) * 0.5;
        const h = w * 1.1547;
        const x = pose[0];
        const y = pose[1];
        context.moveTo(x, y - h);
        context.lineTo(x + w, y - h / 2);
        context.lineTo(x + w, y + h / 2);
        context.lineTo(x, y + h);
        context.lineTo(x - w, y + h / 2);
        context.lineTo(x - w, y - h / 2);
        context.closePath();
        drawn += 1;
      }
      if (!any) continue;
      context.globalAlpha = 0.82 * alpha;
      context.fillStyle = TONES[tone];
      context.fill();
    }
    context.globalAlpha = 1;
    return drawn;
  }
}
const POSE = new Float32Array(4);
