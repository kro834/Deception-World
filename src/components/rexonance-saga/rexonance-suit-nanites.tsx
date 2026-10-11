import { useEffect, useRef } from "react";
import {
  REXONANCE_SUIT_ACCENTS,
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
import { rexonanceSuitSource, warmRexonanceSuit } from "@/lib/rexonance-suit-warmup";

/* rx13 (owner, 2026-10-11): "subdivide extremely finely so it feels like
   nanomachines, and fit it on in turn". The armour assembles out of the
   plates' micro-tiles (REXONANCE_SUIT_TILE px squares of the artwork itself,
   ~5,700 in all): each tile streams in along the undersuit from its plate's
   seam side as a nanite mote, turns into its piece of the plate and locks
   in place, seam outward, plate after plate in the cascade's order
   (REXONANCE_SUIT_FIT).

   rx17 (owner, 2026-10-11): "the gold parts are formed by nanomachines
   right after each part is fitted". A plate now streams in and seats with
   its trims unformed — raw gunmetal channels (the gold atlas, drawn over
   the art once into a working copy of the atlas, `forming`) — and from its
   clank gold nanites (REXONANCE_SUIT_GOLD_CELL px cells, ~10,000 in all)
   run along the trims from the seat outward, like molten metal through a
   channel: each a white-hot mote that flies in from upstream, locks (its
   cell of the art is drawn into `forming`) and cools through bright gold
   to the painted gold; a glint then runs the finished trim, and each DEUS！
   accent sends a surge on through its whole group's gold. Once a plate's
   last gold cell has locked it is painted whole onto the settled canvas
   from the art itself, so the finished suit is the artwork exactly; only
   plates still assembling or forming are drawn each frame, and the gold's
   light is batched into a few paths per frame.

   The engine follows the overlay's own clock (the call meter's CSS
   animation), so it stays in step with the calls, with frame audits that
   seek the document's animations, and with a late start. It runs only in
   the full tier while the suit builds, and only if its layers are decoded
   (shared with the warm-up: ImageBitmaps where supported) before the first
   tile is due; otherwise the DOM plates play instead. Its plan and working
   atlas are prepared in idle time ahead of the call (prepareRexonanceSuit).
   It never runs after the overlay closes. */

const T = REXONANCE_SUIT_TILE;
const G = REXONANCE_SUIT_GOLD_CELL;
const FIG = REXONANCE_SUIT_SIZE;
const GOLD = REXONANCE_SUIT_GOLD;
/** How long a tile streams before it locks (ms). */
const FLIGHT = 170;
/** The engine takes over only if it is ready before the first tile is due. */
const START_BY = 420;
const GROW = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
// The plates' own motes are ice, pink and white; gold belongs to the gold
// nanites (rx17).
const TONES = ["#8cefff", "#8cefff", "#ff8fd8", "#c4f4ff", "#8cefff", "#ff8fd8", "#eefcff"];

type Tile = {
  sx: number;
  sy: number;
  dx: number;
  dy: number;
  land: number;
  ox: number;
  oy: number;
  tone: string;
};
type Plate = {
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
type Surge = { from: number; to: number; cells: Int32Array; reach: Float32Array };

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
const GOLD_TOTAL = Object.values(REXONANCE_SUIT_GOLD_CELLS).reduce((sum, base64) => {
  let count = 0;
  for (const byte of bitsOf(base64))
    for (let bit = 0; bit < 8; bit += 1) count += (byte >> bit) & 1;
  return sum + count;
}, 0);
type Cells = {
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
const cells = () =>
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
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!has(bits, row * cols + col)) continue;
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
  goldAt = goldOf(piece, index, goldAt, cells());
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
function plates() {
  while (!PLATES) step();
  return PLATES;
}

// The working atlas: the plates' art with their gold unformed (raw
// gunmetal channels); gold cells are drawn into it as they lock. Reset to
// raw before each call.
let FORMING: HTMLCanvasElement | null = null;
let formingDirty = true;
// While a call draws into it, the idle preparation leaves it alone.
let drawing = 0;
function forming(art: CanvasImageSource, gold: CanvasImageSource) {
  const { width, height } = REXONANCE_SUIT_GOLD_ATLAS;
  if (!FORMING) {
    FORMING = Object.assign(globalThis.document.createElement("canvas"), { width, height });
    formingDirty = true;
  }
  const context = FORMING.getContext("2d");
  if (!context) return null;
  if (formingDirty) {
    context.clearRect(0, 0, width, height);
    context.drawImage(art, 0, 0, width, height, 0, 0, width, height);
    context.drawImage(gold, 0, 0);
    formingDirty = false;
  }
  return context;
}

/** rx17: builds the engine's plan and its working atlas in idle time, a
 * few plates a slice, so the call's first frame costs nothing. Resolves
 * true once both are ready (false if the layers are not decoded). */
export function prepareRexonanceSuit() {
  return new Promise<boolean>((resolve) => {
    const finish = () => {
      const art = rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src);
      const gold = rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
      resolve(Boolean(art && gold && (drawing || forming(art, gold))));
    };
    const slice = (deadline?: IdleDeadline) => {
      const until = performance.now() + 6;
      while (!PLATES) {
        step();
        if (deadline ? deadline.timeRemaining() < 2 : performance.now() > until) break;
      }
      if (PLATES) finish();
      else if (globalThis.requestIdleCallback)
        globalThis.requestIdleCallback(slice, { timeout: 600 });
      else globalThis.requestAnimationFrame(() => slice());
    };
    slice();
  });
}

// The gold's light, batched per frame: a formed cell cools from white-hot
// through molten gold to the painted gold, as a square that shrinks into
// its cell (so the front glitters, cell by cell, instead of washing over
// the trim); the glints' head and trail. [colour, alpha, size of the cell].
const HEAT = [
  ["#fff3c4", 0.9, 0.94],
  ["#ffc642", 0.52, 0.78],
  ["#e08a1e", 0.26, 0.62],
] as const;
// The molten front's glow: the white-hot cells' union, grown, faint.
const BLOOM = ["#ffb02e", 0.14, 2.2] as const;
const GLINT = [
  ["#fffdf3", 0.62, 1],
  ["#ffe39a", 0.26, 1],
] as const;

export function SuitNanites({ onReady }: { onReady: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let stop = () => {};
    // rx17: the engine begins on the overlay's next frame, never inside the
    // task that mounts it (its style and layout reads would force the whole
    // overlay's style there).
    const begin = () => {
      frame = 0;
      const box = host.current;
      const build = box?.parentElement;
      const meter = box?.closest(".rx-call-sequence")?.querySelector(".rx-call-meter > i");
      if (cancelled || !box || !build || !meter || getComputedStyle(build).display === "none")
        return;
      const clock = () => {
        const animation = meter.getAnimations()[0];
        return animation ? Number(animation.currentTime) : null;
      };
      const start = () => {
        const now = clock();
        if (cancelled || now === null || now > START_BY || !box.clientWidth) return;
        const atlas = rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src);
        const raw = rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
        if (!atlas || !raw) return;
        const work = forming(atlas, raw);
        const scale = Math.min(2, globalThis.devicePixelRatio || 1);
        const width = Math.round(box.clientWidth * scale);
        const height = Math.round(box.clientHeight * scale);
        const make = () => {
          const canvas = Object.assign(globalThis.document.createElement("canvas"), {
            width,
            height,
          });
          box.append(canvas);
          return canvas.getContext("2d");
        };
        const settled = make();
        const flight = make();
        if (!work || !FORMING || !settled || !flight) {
          box.replaceChildren();
          return;
        }
        const source = FORMING;
        formingDirty = true;
        const s = width / FIG.width;
        const all = plates();
        const surges = SURGES!;
        const gold = cells();
        // Per plate: settled (its art painted whole), and its gold cells
        // locked into the working atlas so far.
        const done = new Uint8Array(all.length);
        const locked = Int32Array.from(all, (plate) => plate.first);
        // The batches (cell indices; the motes' own boxes).
        const heat = HEAT.map(() => new Int32Array(GOLD_TOTAL));
        const heats = new Int32Array(HEAT.length);
        const glint = GLINT.map(() => new Int32Array(GOLD_TOTAL));
        const glints = new Int32Array(GLINT.length);
        const motes = new Float32Array(GOLD_TOTAL * 3);
        let moteCount = 0;
        let last = -1;
        const settle = (index: number) => {
          const { piece } = all[index];
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
          done[index] = 1;
        };
        const reset = () => {
          settled.clearRect(0, 0, width, height);
          done.fill(0);
          for (let p = 0; p < all.length; p += 1) locked[p] = all[p].first;
          formingDirty = true;
          forming(atlas, raw);
          formingDirty = true;
        };
        const glow = (
          list: Int32Array,
          count: number,
          [colour, alpha, size]: readonly [string, number, number],
        ) => {
          if (!count) return;
          flight.globalAlpha = alpha;
          flight.fillStyle = colour;
          flight.beginPath();
          for (let k = 0; k < count; k += 1) {
            const i = list[k];
            const w = gold.cw[i] * size;
            const h = gold.ch[i] * size;
            flight.rect(
              (gold.fx[i] + (gold.cw[i] - w) / 2) * s,
              (gold.fy[i] + (gold.ch[i] - h) / 2) * s,
              w * s,
              h * s,
            );
          }
          flight.fill();
        };
        const draw = (t: number) => {
          if (t < last) reset();
          last = t;
          flight.clearRect(0, 0, width, height);
          heats.fill(0);
          glints.fill(0);
          moteCount = 0;
          for (let p = 0; p < all.length; p += 1) {
            const plate = all[p];
            if (t < plate.spawn || (done[p] && t >= plate.last)) continue;
            const { piece } = plate;
            if (t < plate.fit) {
              for (const tile of plate.tiles) {
                const u = (t - tile.land + FLIGHT) / FLIGHT;
                if (u <= 0) continue;
                if (u >= 1) {
                  flight.globalAlpha = 1;
                  flight.drawImage(
                    source,
                    tile.sx,
                    tile.sy,
                    T,
                    T,
                    tile.dx * s,
                    tile.dy * s,
                    T * s,
                    T * s,
                  );
                  continue;
                }
                const e = 1 - (1 - u) ** 3;
                const x = (tile.dx + tile.ox * (1 - e)) * s;
                const y = (tile.dy + tile.oy * (1 - e)) * s;
                if (u < 0.62) {
                  // A nanite mote, streaming in.
                  const size = T * s * (0.3 + 0.4 * (u / 0.62));
                  flight.globalAlpha = Math.min(1, u * 5) * 0.85;
                  flight.fillStyle = tile.tone;
                  flight.fillRect(x + (T * s - size) / 2, y + (T * s - size) / 2, size, size);
                } else {
                  // It turns into its piece of the plate (gold unformed) and locks.
                  const v = (u - 0.62) / 0.38;
                  const size = T * s * (0.72 + 0.28 * v);
                  flight.globalAlpha = 0.55 + 0.45 * v;
                  flight.drawImage(
                    source,
                    tile.sx,
                    tile.sy,
                    T,
                    T,
                    x + (T * s - size) / 2,
                    y + (T * s - size) / 2,
                    size,
                    size,
                  );
                }
              }
              continue;
            }
            // Seated. Its gold cells lock as they are due (into the working
            // atlas, unless the plate settles this frame anyway).
            if (!done[p]) {
              if (t >= plate.to) {
                locked[p] = plate.end;
                settle(p);
              } else {
                while (locked[p] < plate.end && gold.lock[locked[p]] <= t) {
                  const i = locked[p];
                  work.drawImage(
                    atlas,
                    gold.ax[i],
                    gold.ay[i],
                    gold.cw[i],
                    gold.ch[i],
                    gold.ax[i],
                    gold.ay[i],
                    gold.cw[i],
                    gold.ch[i],
                  );
                  locked[p] += 1;
                }
                flight.globalAlpha = 1;
                flight.drawImage(
                  source,
                  piece.ax,
                  piece.ay,
                  piece.w,
                  piece.h,
                  piece.x * s,
                  piece.y * s,
                  piece.w * s,
                  piece.h * s,
                );
              }
            }
            if (plate.end === plate.first) continue;
            // The gold's light: motes in flight, cells cooling, the glint.
            const sweep = (t - plate.to) / GOLD.glint;
            const head = sweep * 1.3 - 0.1;
            for (let i = plate.first; i < plate.end; i += 1) {
              const lock = gold.lock[i];
              if (lock > t + GOLD.approach) break;
              if (lock > t) {
                const u = 1 - (lock - t) / GOLD.approach;
                const e = 1 - (1 - u) * (1 - u);
                const size = G * (0.3 + 0.5 * e);
                motes[moteCount * 3] = gold.fx[i] + gold.ox[i] * (1 - e) + (G - size) / 2;
                motes[moteCount * 3 + 1] = gold.fy[i] + gold.oy[i] * (1 - e) + (G - size) / 2;
                motes[moteCount * 3 + 2] = size;
                moteCount += 1;
              } else if (t - lock < GOLD.cool) {
                const v = (t - lock) / GOLD.cool;
                const k = v < 0.22 ? 0 : v < 0.55 ? 1 : 2;
                heat[k][heats[k]++] = i;
              } else if (sweep > 0 && sweep < 1) {
                const behind = head - gold.order[i];
                if (behind >= 0 && behind < 0.12) {
                  const k = behind < 0.04 ? 0 : 1;
                  glint[k][glints[k]++] = i;
                }
              }
            }
          }
          // The accents' surges: a band of light out from the DEUS！ seat
          // through the group's formed gold.
          for (const surge of surges) {
            if (t < surge.from || t >= surge.to) continue;
            const head = ((t - surge.from) / (surge.to - surge.from)) * 1.2;
            for (let k = 0; k < surge.cells.length; k += 1) {
              const behind = head - surge.reach[k];
              if (behind < 0) break;
              if (behind >= 0.12) continue;
              const i = surge.cells[k];
              if (gold.lock[i] + GOLD.cool > t) continue;
              const bucket = behind < 0.04 ? 0 : 1;
              glint[bucket][glints[bucket]++] = i;
            }
          }
          glow(heat[0], heats[0], BLOOM);
          for (let k = HEAT.length - 1; k >= 0; k -= 1) glow(heat[k], heats[k], HEAT[k]);
          for (let k = GLINT.length - 1; k >= 0; k -= 1) glow(glint[k], glints[k], GLINT[k]);
          if (moteCount) {
            flight.globalAlpha = 0.95;
            flight.fillStyle = "#fff8de";
            flight.beginPath();
            for (let k = 0; k < moteCount; k += 1)
              flight.rect(
                motes[k * 3] * s,
                motes[k * 3 + 1] * s,
                motes[k * 3 + 2] * s,
                motes[k * 3 + 2] * s,
              );
            flight.fill();
          }
          flight.globalAlpha = 1;
        };
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          drawing -= 1;
          flight.clearRect(0, 0, width, height);
          for (let p = 0; p < all.length; p += 1) if (!done[p]) settle(p);
        };
        stop = () => {
          if (!finished) drawing -= 1;
          finished = true;
        };
        const tick = () => {
          frame = 0;
          if (cancelled) return;
          const t = clock();
          // The meter's covering clock ends at the hand-over: all plates seat
          // and the last gold has formed and cooled long before.
          if (t === null || t >= END) {
            finish();
            return;
          }
          draw(t);
          frame = globalThis.requestAnimationFrame(tick);
        };
        drawing += 1;
        ready.current();
        draw(now);
        frame = globalThis.requestAnimationFrame(tick);
      };
      if (
        rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src) &&
        rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src)
      )
        start();
      // A late start: the warm-up already in flight (at high priority now).
      else void warmRexonanceSuit("high").then((decoded) => decoded && start());
    };
    frame = globalThis.requestAnimationFrame(begin);
    return () => {
      cancelled = true;
      stop();
      if (frame) globalThis.cancelAnimationFrame(frame);
    };
  }, []);
  return <div ref={host} className="rx-suit-nanites" />;
}
