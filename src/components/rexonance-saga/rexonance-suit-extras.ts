import {
  REXONANCE_SUIT_ACCENTS,
  REXONANCE_SUIT_DRIVER,
  REXONANCE_SUIT_SPARKS,
  REXONANCE_SUIT_SWARM,
} from "@/lib/rexonance-calls";
import {
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
  REXONANCE_SUIT_MARKS,
} from "@/lib/rexonance-suit";
import { REXONANCE_NANITES } from "@/lib/rexonance-nanites";
import {
  createNaniteGuideJob,
  createNaniteMetalJob,
  type NanitePixelJob,
} from "@/lib/rexonance-unlit.js";
import { rexonanceNaniteSource } from "@/lib/rexonance-nanites-warmup";
import { rexonanceSuitSource } from "@/lib/rexonance-suit-warmup";
import {
  FIG,
  FLIGHT,
  G,
  T,
  cells,
  plateLights,
  plates,
  prepareRexonanceSuit,
  work,
  type Cells,
  type Plate,
} from "./rexonance-suit-plan";

/* Owner (2026-10-16): 「続けて、blenderなどを用いてナノマシン一つ一つの挙動や
   装甲形成や金のガイドウェイなどを大きく改善して。」「超大幅な改善で。」

   The call's nanite engine (rexonance-suit-nanites) keeps its pinned clock,
   plan, gold and light; this module adds what the owner asked for on top of
   it, drawn from the Blender-rendered nanite kit (rexonance-nanites):

   - Every nanite is a tumbling hex chip (cells.webp), born from the P14 core
     in six pump waves that spiral out on three arms into an orbital cocoon
     of eight tilted rings with real depth (back chips dimmed behind the
     body, front chips larger and defocused). Each plate drains its share of
     the cocoon into a river through its gate; its micro-tiles fan out of the
     gate, circle to aim, dive, unfold into their square and recoil as they
     lock, crystallising the plate as a lit lattice, cell by cell, with
     scroll-speed comets and sparks. The helmet's chips gather in a crown
     first; at the seal the free chips implode into the reactor.
   - Each plate is built in raw nanite metal (gunmetal hex relief with the
     art's own values) on a lifted, tilted stage over its own contact shadow,
     past a hardpoint latch and a scaffold lattice; it swings down onto its
     seat, rings, a seam of light runs round its real outline, a shock ring
     lies in its plane, spall flies, and paint develops from the seat outward
     under a lacquer front — the settled plate is still the artwork exactly.
   - Each plate's trims get a Blender-rendered gold guideway (rails,
     hard-light glass, a glowing channel, walls that turn in parallax) that is
     built on the body before the plate arrives — never laid over it from
     above (owner, 2026-10-16: 「金のガイドウェイは上から被さる形ではなく、足先
     から滑らかに作られていく。」): it grows along its channel from each trim's
     lowest cell to its upper end behind a laser-weld head with sparks, the
     laser projecting the path just ahead in ice, and the front climbs the
     figure from the toe tips in the fitting order, ahead of the plates. Four
     3D clamps slide in along the surface to its corners and bite as the
     plate slams onto it; the conduit prints onto the plate bottom to top,
     and the pinned gold pours through it as a white-hot band with oriented
     droplets, the conduit receding behind the cooling front so only the
     painted gold remains.

   Everything is a closed-form function of the call clock t and index hashes;
   the plan's tiles, fits and gold locks are unchanged. Preparation runs in
   its own idle slices after the plan (prepareRexonanceNanites); the call
   decides once, at its start, whether to draw it. The draw passes write
   typed arrays only and allocate nothing; no timers, randomness, filters or
   composite operations. Touch screens draw the swarm as two-tone rects with
   a few hero sprites, and only metal and hologram layers are prepared. */

const SW = REXONANCE_SUIT_SWARM;
const KIT_CELLS = REXONANCE_NANITES.cells;
const KIT_COMETS = REXONANCE_NANITES.comets;
const KIT_FX = REXONANCE_NANITES.fx;
const KIT_GUIDE = REXONANCE_NANITES.guide;
const TOUCH =
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia("(pointer: coarse), (any-pointer: coarse)").matches;
const W = FIG.width;
const H = FIG.height;
const TAU = Math.PI * 2;
const [CORE_X, CORE_Y] = REXONANCE_SUIT_MARKS.core;
const [VISOR_X, VISOR_Y] = REXONANCE_SUIT_MARKS.visor;
const ART_W = REXONANCE_SUIT_ATLAS.width / 2;
const ART_H = REXONANCE_SUIT_ATLAS.height;
const RINGS = 8;
/** Cocoon chips (each drains into a plate) and free chips (the implosion). */
const COCOON = TOUCH ? 128 : 512;
const FREE = TOUCH ? 32 : 160;
const CHIPS = COCOON + FREE;
/** The undersuit's occupancy, for the back chips (64 x 116 cells). */
const OCC_W = 64;
const OCC_H = 116;
/** The tumble's frames; the mip below this device size. */
const FRAMES = KIT_CELLS.frames;
const MIP_BELOW = 12;
/** A chip's hex fills about 70% of its cell (room to tumble): sprites are
 * drawn this much larger than the chip's nominal size. */
const SPRITE = 1.45;
/** Draw budgets (desktop): drawImage a frame, comets, plates under a jig. */
const BUDGET = 2450; // the pinned engine's own draws stay within 2,600
const COMET_BUDGET = 300;
const JIGS = TOUCH ? 4 : 12;
const HEROES = 24;
/** Chips drawn per hex frame: mip and cell columns, tone rows. */
const MIP_X = Int16Array.from(KIT_CELLS.mip.x);
const MIP_Y = Int16Array.from(KIT_CELLS.mip.y);
const UNFOLD_X = Int16Array.from(KIT_CELLS.unfold.x);
const BOKEH_X = Int16Array.from(KIT_CELLS.bokeh.x);
const BOKEH_Y = Int16Array.from(KIT_CELLS.bokeh.y);
const COMET_ROW = Int8Array.from([KIT_COMETS.rows.ice, KIT_COMETS.rows.pink, KIT_COMETS.rows.ice]);
const ANCHOR = Float32Array.from([
  ...KIT_FX.clamp.anchor.tl,
  ...KIT_FX.clamp.anchor.tr,
  ...KIT_FX.clamp.anchor.bl,
  ...KIT_FX.clamp.anchor.br,
]);
const CORNER_ROW = Int8Array.from([
  KIT_FX.clamp.corners.tl,
  KIT_FX.clamp.corners.tr,
  KIT_FX.clamp.corners.bl,
  KIT_FX.clamp.corners.br,
]);
/** G2's pulses: bands along each trim's flow, marching out from the seat
 * (a band every 1/5 of the trim, each crossing it in about 170 ms). */
const PULSE_BANDS = 5;
const PULSE_SPEED = 0.006;
const PULSE_WIDTH = 0.12;
/** …and on a guideway being built, climbing it (a band every 1/4 of it). */
const BUILD_PULSE_BANDS = 4;
const BUILD_PULSE_SPEED = 0.012;
/** The weld head throws an ember every EMBER_EVERY ms; each flies EMBER_LIFE
 * ms (at most EMBERS in the air per guideway). */
const EMBER_EVERY = 14;
const EMBER_LIFE = 120;
const EMBERS = 9;
/** G5: the conduit's walls stand this deep (figure px) in parallax; a sheen
 * crosses it every SHEEN_MS. */
const WALL_DEPTH = 3;
const SHEEN_MS = 320;
/** N10: the helmet's crown ring, seen from a little above. */
const CROWN_SQUASH = 0.3;
/** Tones: ice 0, pink 1, white 2, gold 3 (the sheet's rows). */
const ICE = 0;
const PINK = 1;
const WHITE = 2;
const GOLD_TONE = 3;
// Touch's two-tone rect chips: [tone, shade] per tone.
const RECT_TONES = ["#8cefff", "#ff8fd8", "#eefcff", "#ffd27a"] as const;
const RECT_SHADES = ["#1d4f63", "#5a2350", "#3a4a5a", "#6a4a12"] as const;

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const unit = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => {
  const x = unit(v);
  return x * x * (3 - 2 * x);
};
const easeOut = (v: number) => {
  const x = 1 - unit(v);
  return 1 - x * x * x;
};
const wrap = (f: number) => {
  const k = Math.floor(f) % FRAMES;
  return k < 0 ? k + FRAMES : k;
};

/* ------------------------------------------------------------------ */
/* The layout: everything the draw passes read, built once in idle time. */

type Layout = {
  // Plates (index = the plan's plate index).
  kind: Int8Array; // -1 driver, 0 armour, 1 tail, 2 ribbon, 3 helm
  segment: Int8Array; // a tail segment's index, root (0) to blade (4)
  flags: Uint8Array; // 1 accent, 2 shock ring, 4 crest
  order: Int16Array; // plates by fit
  seatX: Float32Array;
  seatY: Float32Array;
  nX: Float32Array;
  nY: Float32Array;
  gateX: Float32Array;
  gateY: Float32Array;
  gX: Float32Array;
  gY: Float32Array;
  offX: Float32Array;
  offY: Float32Array;
  lift: Float32Array;
  tilt: Float32Array;
  lam0: Float32Array;
  reach: Float32Array;
  shockW: Float32Array;
  latchW: Float32Array;
  clampW: Float32Array;
  box: Float32Array; // gold box x, y, w, h
  hasBox: Uint8Array;
  // The guideway's build (owner, 2026-10-16: from the toe tips up): each
  // plate's window, and each gold cell's build time and place along its
  // build (0..1); plate p's cells by build time in [first, end) of buildIdx.
  buildA: Float32Array;
  buildB: Float32Array;
  headMs: Float32Array; // how long a cell glows in the weld head

  buildAt: Float32Array;
  buildFrac: Float32Array;
  buildIdx: Int32Array;
  buildSorted: Float32Array;
  // Tiles (global index; plate p owns [tileFirst[p], tileFirst[p + 1])).
  tileFirst: Int32Array;
  landSorted: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  land: Float32Array;
  tp: Float32Array;
  f0: Float32Array;
  spin: Float32Array;
  r0: Float32Array;
  psi0: Float32Array;
  jx: Float32Array;
  jy: Float32Array;
  bow: Float32Array;
  size: Float32Array;
  cov: Float32Array;
  tone: Uint8Array;
  tflags: Uint8Array; // 1 comet, 2 spark, 4 recoil
  parent: Int32Array;
  // Seams: plate p owns loops [loopFirst[p], loopFirst[p + 1]); a loop owns
  // points [loopStart, loopStart + loopN] (the last repeats the first).
  loopFirst: Int32Array;
  loopStart: Int32Array;
  loopN: Int32Array;
  loopLen: Float32Array;
  px: Float32Array;
  py: Float32Array;
  cum: Float32Array;
  // Chips.
  ring: Int8Array;
  lane: Int8Array;
  theta0: Float32Array;
  phi: Float32Array;
  birth: Float32Array;
  arm: Float32Array;
  armDir: Int8Array;
  chipPlate: Int16Array;
  drainAt: Float32Array;
  chipF0: Float32Array;
  chipSpin: Float32Array;
  chipSize: Float32Array;
  chipTone: Uint8Array;
  crownR: Float32Array;
  crownA: Float32Array;
  // Rings.
  ringCy: Float32Array;
  ringRx: Float32Array;
  ringRy: Float32Array;
  ringCos: Float32Array;
  ringSin: Float32Array;
  ringOmega: Float32Array;
  ringTilt: Float32Array;
  occupancy: Uint8Array;
};
type Sheets = {
  metal: HTMLCanvasElement;
  silhouette: HTMLCanvasElement | null;
  holo: HTMLCanvasElement;
  walls: HTMLCanvasElement | null;
  rails: HTMLCanvasElement | null;
  molten: HTMLCanvasElement | null;
  lattice: HTMLCanvasElement | null;
};

let LAYOUT: Layout | null = null;
let SHEETS: Sheets | null = null;

const KIND: Record<string, number> = { tail: 1, ribbon: 2, helm: 3 };

// Seams: base64 Int16 LE [loops, n0, x, y, …], quarter figure px.
function seamLoops(base64: string | undefined) {
  if (!base64) return [] as Float32Array[];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const words = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
  const loops: Float32Array[] = [];
  let at = 1;
  for (let l = 0; l < words[0] && at < words.length; l += 1) {
    const n = words[at];
    at += 1;
    const points = new Float32Array(n * 2);
    for (let k = 0; k < n * 2; k += 1) points[k] = words[at + k] / 4;
    at += n * 2;
    loops.push(points);
  }
  return loops;
}

// Built in units (one plate, one trim build, the swarm…), yielding between
// them so the preparation keeps each idle slice short.
function* layoutSteps(all: Plate[], gold: Cells): Generator<undefined, Layout, undefined> {
  const P = all.length;
  const N = all.reduce((sum, plate) => sum + plate.tiles.length, 0);
  const f32 = (n: number) => new Float32Array(n);
  const L: Layout = {
    kind: new Int8Array(P),
    segment: new Int8Array(P),
    flags: new Uint8Array(P),
    order: Int16Array.from(all.map((_, p) => p).sort((a, b) => all[a].fit - all[b].fit || a - b)),
    seatX: f32(P),
    seatY: f32(P),
    nX: f32(P),
    nY: f32(P),
    gateX: f32(P),
    gateY: f32(P),
    gX: f32(P),
    gY: f32(P),
    offX: f32(P),
    offY: f32(P),
    lift: f32(P),
    tilt: f32(P),
    lam0: f32(P),
    reach: f32(P),
    shockW: f32(P),
    latchW: f32(P),
    clampW: f32(P),
    box: f32(P * 4),
    hasBox: new Uint8Array(P),
    buildA: new Float32Array(P).fill(Infinity),
    buildB: new Float32Array(P).fill(Infinity),
    headMs: new Float32Array(P),
    buildAt: f32(gold.lock.length),
    buildFrac: f32(gold.lock.length),
    buildIdx: new Int32Array(gold.lock.length),
    buildSorted: f32(gold.lock.length),
    tileFirst: new Int32Array(P + 1),
    landSorted: f32(N),
    cx: f32(N),
    cy: f32(N),
    land: f32(N),
    tp: f32(N),
    f0: f32(N),
    spin: f32(N),
    r0: f32(N),
    psi0: f32(N),
    jx: f32(N),
    jy: f32(N),
    bow: f32(N),
    size: f32(N),
    cov: new Float32Array(N).fill(1),
    tone: new Uint8Array(N),
    tflags: new Uint8Array(N),
    parent: new Int32Array(N).fill(-1),
    loopFirst: new Int32Array(P + 1),
    loopStart: new Int32Array(0),
    loopN: new Int32Array(0),
    loopLen: f32(0),
    px: f32(0),
    py: f32(0),
    cum: f32(0),
    ring: new Int8Array(CHIPS),
    lane: new Int8Array(CHIPS),
    theta0: f32(CHIPS),
    phi: f32(CHIPS),
    birth: f32(CHIPS),
    arm: f32(CHIPS),
    armDir: new Int8Array(CHIPS),
    chipPlate: new Int16Array(CHIPS).fill(-1),
    drainAt: f32(CHIPS),
    chipF0: f32(CHIPS),
    chipSpin: f32(CHIPS),
    chipSize: f32(CHIPS),
    chipTone: new Uint8Array(CHIPS),
    crownR: f32(CHIPS),
    crownA: f32(CHIPS),
    ringCy: f32(RINGS),
    ringRx: f32(RINGS),
    ringRy: f32(RINGS),
    ringCos: f32(RINGS),
    ringSin: f32(RINGS),
    ringOmega: f32(RINGS),
    ringTilt: f32(RINGS),
    occupancy: new Uint8Array(OCC_W * OCC_H),
  };
  let maxArea = 1;
  for (const plate of all) maxArea = Math.max(maxArea, plate.piece.w * plate.piece.h);
  const accents = new Set(REXONANCE_SUIT_ACCENTS);
  const sparks = new Set(REXONANCE_SUIT_SPARKS);
  const boxes = REXONANCE_NANITES.goldBoxes as Readonly<
    Record<string, readonly [number, number, number, number]>
  >;
  // Seams first (their sizes), then plates and tiles.
  const allLoops = all.map((plate) => seamLoops(REXONANCE_NANITES.seams[plate.piece.id]));
  const loopCount = allLoops.reduce((sum, loops) => sum + loops.length, 0);
  const pointCount = allLoops.reduce(
    (sum, loops) => sum + loops.reduce((n, points) => n + points.length / 2 + 1, 0),
    0,
  );
  L.loopStart = new Int32Array(loopCount);
  L.loopN = new Int32Array(loopCount);
  L.loopLen = f32(loopCount);
  L.px = f32(pointCount);
  L.py = f32(pointCount);
  L.cum = f32(pointCount);
  let loopAt = 0;
  let pointAt = 0;
  let tileAt = 0;
  yield;
  for (let p = 0; p < P; p += 1) {
    const plate = all[p];
    const piece = plate.piece;
    const driver = REXONANCE_SUIT_DRIVER.includes(piece.id);
    const kind = driver ? -1 : (KIND[piece.group] ?? 0);
    L.kind[p] = kind;
    L.segment[p] = kind === 1 ? Number(/^tail-(\d)/.exec(piece.id)?.[1] ?? 0) : 0;
    const crest = piece.id === "helmet-crest";
    L.flags[p] = (accents.has(piece.id) ? 1 : 0) | (sparks.has(piece.id) ? 2 : 0) | (crest ? 4 : 0);
    const [sx, sy] = piece.seat;
    L.seatX[p] = sx;
    L.seatY[p] = sy;
    // n̂: out from the core (vertical halved), the gate along it.
    let nx = sx - CORE_X;
    let ny = 0.5 * (sy - CORE_Y);
    const nl = Math.hypot(nx, ny);
    if (nl < 1e-3) {
      nx = 0;
      ny = -1;
    } else {
      nx /= nl;
      ny /= nl;
    }
    L.nX[p] = nx;
    L.nY[p] = ny;
    const side = (hash(p * 13 + 5, 77) - 0.5) * 0.024 * H;
    L.gateX[p] = sx + nx * 0.06 * H - ny * side;
    L.gateY[p] = sy + ny * 0.06 * H + nx * side;
    // The staging: g toward the box centre, the lift and the tilt.
    const bcx = piece.x + piece.w / 2;
    const bcy = piece.y + piece.h / 2;
    let gx = bcx - sx;
    let gy = bcy - sy;
    const gl = Math.hypot(gx, gy);
    if (gl < 4) {
      gx = -nx;
      gy = -ny;
    } else {
      gx /= gl;
      gy /= gl;
    }
    L.gX[p] = gx;
    L.gY[p] = gy;
    const area = piece.w * piece.h;
    const helm = kind === 3;
    const lift = helm ? 0 : (TOUCH ? 3 : 5) + (TOUCH ? 6 : 9) * Math.sqrt(area / maxArea);
    L.lift[p] = lift * (kind === 1 || kind === 2 ? 1.4 : 1);
    L.tilt[p] = helm || TOUCH ? 0 : (12 * Math.PI) / 180;
    const hx = Math.sign(sx - W / 2) * Math.min(1, Math.abs(sx - W / 2) / (0.25 * W));
    L.offX[p] = L.lift[p] * (0.55 * hx - 0.3);
    L.offY[p] = L.lift[p] * -0.55;
    let reach = 1;
    for (const [cx, cy] of [
      [piece.x, piece.y],
      [piece.x + piece.w, piece.y],
      [piece.x, piece.y + piece.h],
      [piece.x + piece.w, piece.y + piece.h],
    ])
      reach = Math.max(reach, Math.hypot(cx - sx, cy - sy));
    L.reach[p] = reach;
    let ring = 1.6 * Math.max(piece.w, piece.h) * (0.6 + 0.9 * Math.sqrt(area / maxArea));
    ring = Math.min(220, Math.max(40, ring));
    if (L.flags[p] & 1) ring = Math.min(220, ring * 1.3);
    if (crest) ring = Math.min(220, ring * 1.4);
    L.shockW[p] = ring;
    L.latchW[p] = L.flags[p] & 1 ? 32 : 26;
    const box = boxes[piece.id];
    if (box && !driver) {
      L.hasBox[p] = 1;
      L.box.set(box, p * 4);
      L.clampW[p] =
        Math.min(30, Math.max(18, 0.6 * Math.min(box[2], box[3]))) * (L.flags[p] & 1 ? 1.2 : 1);
    }
    // Tiles: centres, flight seeds, paint order (from the seat outward).
    const first = tileAt;
    L.tileFirst[p] = first;
    const n = plate.tiles.length;
    const cols = Math.ceil(piece.w / T);
    const rows = Math.ceil(piece.h / T);
    const grid = new Int32Array(cols * rows).fill(-1);
    let landedBy = 0;
    for (let k = 0; k < n; k += 1) {
      const tile = plate.tiles[k];
      const i = first + k;
      const cx = tile.dx + tile.tw / 2;
      const cy = tile.dy + tile.th / 2;
      L.cx[i] = cx;
      L.cy[i] = cy;
      L.land[i] = tile.land;
      if (tile.land <= plate.fit - SW.seat) landedBy += 1;
      const along = Math.min(1, Math.hypot(cx - sx, cy - sy) / reach);
      L.tp[i] = plate.fit + SW.paint[0] + (helm ? SW.paint[2] : SW.paint[1]) * along;
      const h1 = hash(i * 7 + 3, 911);
      const h2 = hash(i * 11 + 5, 313);
      const h3 = hash(i * 17 + 1, 547);
      L.f0[i] = h1 * FRAMES;
      L.spin[i] = 1.2 + 1.4 * h2;
      L.r0[i] = (TOUCH ? 6 : 8) + 10 * h3;
      L.psi0[i] = TAU * hash(i, 1201);
      L.jx[i] = hash(i, 1301) * 2 - 1;
      L.jy[i] = hash(i, 1409) * 2 - 1;
      L.bow[i] = hash(i, 1511) - 0.5;
      L.size[i] = 7 * (0.9 + 0.25 * h2);
      L.tone[i] = i % 9 === 0 ? WHITE : cx < W / 2 ? ICE : PINK;
      L.tflags[i] = (i % 3 === 0 ? 1 : 0) | (h3 < 1 / 6 ? 2 : 0) | (h1 < 0.55 ? 4 : 0);
      const col = Math.round((tile.dx - piece.x) / T);
      const row = Math.round((tile.dy - piece.y) / T);
      if (col >= 0 && row >= 0 && col < cols && row < rows) grid[row * cols + col] = i;
    }
    L.lam0[p] = n ? 1 - 0.35 * (landedBy / n) : 1;
    // Each tile's parent: its 8-neighbour that landed most recently before it.
    for (let row = 0; row < rows; row += 1)
      for (let col = 0; col < cols; col += 1) {
        const i = grid[row * cols + col];
        if (i < 0) continue;
        let best = -1;
        let bestLand = -Infinity;
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const c = col + dx;
            const r = row + dy;
            if ((!dx && !dy) || c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const j = grid[r * cols + c];
            if (j < 0 || L.land[j] > L.land[i] || L.land[j] <= bestLand) continue;
            if (L.land[j] === L.land[i] && j > i) continue;
            best = j;
            bestLand = L.land[j];
          }
        L.parent[i] = best;
      }
    const lands = L.land.slice(first, first + n).sort();
    L.landSorted.set(lands, first);
    tileAt += n;
    // Seams.
    L.loopFirst[p] = loopAt;
    for (const points of allLoops[p]) {
      const count = points.length / 2;
      L.loopStart[loopAt] = pointAt;
      L.loopN[loopAt] = count;
      let length = 0;
      for (let k = 0; k <= count; k += 1) {
        const x = points[(k % count) * 2];
        const y = points[(k % count) * 2 + 1];
        if (k) length += Math.hypot(x - L.px[pointAt + k - 1], y - L.py[pointAt + k - 1]);
        L.px[pointAt + k] = x;
        L.py[pointAt + k] = y;
        L.cum[pointAt + k] = length;
      }
      L.loopLen[loopAt] = length;
      pointAt += count + 1;
      loopAt += 1;
    }
    yield;
  }
  L.tileFirst[P] = tileAt;
  L.loopFirst[P] = loopAt;
  yield* layOutBuild(L, all, gold);
  // Rings: eight tilted lanes up the figure, the inner ones turning faster.
  for (let r = 0; r < RINGS; r += 1) {
    const cy = H * (0.13 + 0.112 * r);
    const rx = W * (0.36 + 0.08 * Math.sin((Math.PI * cy) / H));
    L.ringCy[r] = cy;
    L.ringRx[r] = rx;
    L.ringRy[r] = 0.22 * rx;
    const tilt = (r % 2 ? -1 : 1) * 0.07;
    L.ringTilt[r] = tilt;
    L.ringCos[r] = Math.cos(tilt);
    L.ringSin[r] = Math.sin(tilt);
    L.ringOmega[r] = ((r % 2 ? -1 : 1) * TAU * SW.spin * ((0.45 * W) / rx) ** 1.5) / 1000;
  }
  // The cocoon: chips shared out by tile count, each on the ring nearest its
  // plate's seat (the helmet's on ring 0), so it drains bottom-up.
  const live = all.map((_, p) => p).filter((p) => L.kind[p] >= 0);
  // The helmet's share is tripled: its chips gather in the crown (N10).
  const weight = (p: number) => all[p].tiles.length * (L.kind[p] === 3 ? 5 : 1);
  const tileTotal = live.reduce((sum, p) => sum + weight(p), 0);
  const shares = live.map((p) => (weight(p) / tileTotal) * COCOON);
  const counts = shares.map(Math.floor);
  let left = COCOON - counts.reduce((a, b) => a + b, 0);
  const byRemainder = shares
    .map((share, k) => [share - counts[k], k] as const)
    .sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0; k += 1, left -= 1) counts[byRemainder[k % byRemainder.length][1]] += 1;
  const owners: number[] = [];
  live.forEach((p, k) => {
    for (let c = 0; c < counts[k]; c += 1) owners.push(p);
  });
  // Free chips are spread through the waves.
  const roster: number[] = [];
  const stride = CHIPS / FREE;
  let owner = 0;
  let free = 0;
  for (let c = 0; c < CHIPS; c += 1) {
    if (free < FREE && c >= free * stride) {
      roster.push(-1);
      free += 1;
    } else roster.push(owners[owner++] ?? -1);
  }
  // Earlier plates in earlier waves.
  const sorted = roster
    .map((plate, c) => [plate, c] as const)
    .sort(
      (a, b) =>
        (a[0] < 0 ? 0 : all[a[0]].fit) - (b[0] < 0 ? 0 : all[b[0]].fit) ||
        hash(a[1], 3) - hash(b[1], 3),
    );
  const freeWaves = new Int32Array(SW.waves.length);
  for (let c = 0; c < CHIPS; c += 1) {
    const [plate] = sorted[c];
    let wave = Math.min(SW.waves.length - 1, Math.floor((c * SW.waves.length) / CHIPS));
    if (plate < 0) {
      // Free chips: evenly across the waves.
      let least = 0;
      for (let k = 1; k < freeWaves.length; k += 1) if (freeWaves[k] < freeWaves[least]) least = k;
      wave = least;
      freeWaves[least] += 1;
    }
    const h1 = hash(c, 2003);
    const h2 = hash(c, 2111);
    const h3 = hash(c, 2221);
    L.chipPlate[c] = plate;
    L.birth[c] = SW.waves[wave] + 70 * h1;
    const k = c % 3;
    L.armDir[c] = wave % 2 ? -1 : 1;
    L.arm[c] = (TAU * k) / 3 + wave * 0.9;
    let ring = Math.floor(h2 * RINGS);
    if (plate >= 0) {
      ring =
        L.kind[plate] === 3
          ? 0
          : Math.max(0, Math.min(RINGS - 1, Math.round((L.seatY[plate] / H - 0.13) / 0.112)));
      const spawn = all[plate].spawn;
      L.drainAt[c] =
        L.kind[plate] === 3
          ? SW.crown[1] + (all[plate].fit - SW.crown[1]) * h3
          : Math.max(L.birth[c] + SW.wave, spawn - SW.drain + 100 * h3);
    } else L.drainAt[c] = Infinity;
    L.ring[c] = ring;
    L.lane[c] = Math.floor(h3 * 3) - 1;
    L.theta0[c] = TAU * hash(c, 2333);
    L.phi[c] = TAU * hash(c, 2441);
    L.chipF0[c] = FRAMES * hash(c, 2557);
    L.chipSpin[c] = 1.2 + 1.4 * hash(c, 2663);
    L.chipSize[c] = (TOUCH ? 6 : 8) * (0.85 + 0.3 * hash(c, 2777));
    L.chipTone[c] =
      c % 9 === 0
        ? WHITE
        : plate >= 0
          ? L.seatX[plate] < W / 2
            ? ICE
            : PINK
          : hash(c, 2887) < 0.5
            ? ICE
            : PINK;
    L.crownR[c] = 104 + 36 * hash(c, 2999);
    L.crownA[c] = TAU * hash(c, 3061);
  }
  yield;
  // Occupancy: the body plates' tiles (not the ribbons or the tail), softened.
  const raw = new Uint8Array(OCC_W * OCC_H);
  for (let p = 0; p < P; p += 1) {
    if (L.kind[p] === 1 || L.kind[p] === 2) continue;
    for (const tile of all[p].tiles) {
      const c0 = Math.floor((tile.dx / W) * OCC_W);
      const c1 = Math.floor(((tile.dx + tile.tw - 0.01) / W) * OCC_W);
      const r0 = Math.floor((tile.dy / H) * OCC_H);
      const r1 = Math.floor(((tile.dy + tile.th - 0.01) / H) * OCC_H);
      for (let r = r0; r <= r1; r += 1)
        for (let c = c0; c <= c1; c += 1)
          if (r >= 0 && c >= 0 && r < OCC_H && c < OCC_W) raw[r * OCC_W + c] = 255;
    }
  }
  for (let r = 0; r < OCC_H; r += 1)
    for (let c = 0; c < OCC_W; c += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const rr = r + dy;
          const cc = c + dx;
          if (rr < 0 || cc < 0 || rr >= OCC_H || cc >= OCC_W) continue;
          sum += raw[rr * OCC_W + cc];
          count += 1;
        }
      L.occupancy[r * OCC_W + c] = Math.round(sum / count);
    }
  return L;
}

/* The guideway's build (owner, 2026-10-16): 「金のガイドウェイは上から被さる形
   ではなく、足先から滑らかに作られていく。」 Each group's front climbs its gold
   from its lowest trim to its highest (the legs from the toe tips), so a
   plate's window opens when the front reaches the bottom of its gold and
   closes when it reaches the top — clamped so a guideway is never built
   more than `lead` before its plate (ornaments `ornament`) and is whole
   `done` before its first tile lands. The tail is built root to blade, a
   segment after the other; a ribbon in its own window. Inside a plate the
   guideway grows along its channel: from each trim's lowest cell (the
   tail's from its seat) over the cells' 8-neighbourhood, a trim that starts
   higher starting later, so the build head runs the trims smoothly upward. */
function* layOutBuild(L: Layout, all: Plate[], gold: Cells) {
  const B = SW.build;
  const groups = new Map<string, number[]>();
  all.forEach((plate, p) => {
    if (L.kind[p] < 0 || !L.hasBox[p] || plate.end <= plate.first) return;
    const list = groups.get(plate.piece.group) ?? [];
    list.push(p);
    groups.set(plate.piece.group, list);
  });
  for (const list of groups.values()) {
    const kind = L.kind[list[0]];
    const fits = list.map((p) => all[p].fit);
    const firstFit = Math.min(...fits);
    const lastFit = Math.max(...fits);
    if (kind === 2) {
      for (const p of list) {
        L.buildA[p] = all[p].fit - B.ornament;
        L.buildB[p] = all[p].fit - B.done;
      }
    } else if (kind === 1) {
      const byFit = [...list].sort((a, b) => all[a].fit - all[b].fit);
      const gA = firstFit - B.ornament;
      const gB = lastFit - B.done;
      byFit.forEach((p, k) => {
        L.buildA[p] = gA + ((gB - gA) * k) / byFit.length;
        L.buildB[p] = gA + ((gB - gA) * (k + 1.6)) / byFit.length;
      });
    } else {
      let bottom = -Infinity;
      let top = Infinity;
      for (const p of list) {
        bottom = Math.max(bottom, L.box[p * 4 + 1] + L.box[p * 4 + 3]);
        top = Math.min(top, L.box[p * 4 + 1]);
      }
      const gA = Math.max(SW.waves[0] + 20, firstFit - B.lead);
      let gB = lastFit - B.done;
      const at = (y: number) => gA + ((bottom - y) / Math.max(1, bottom - top)) * (gB - gA);
      // Every plate of the group whole before its own first tile lands.
      while (gB > gA + 120 && list.some((p) => at(L.box[p * 4 + 1]) > all[p].fit - B.done)) gB -= 5;
      for (const p of list) {
        L.buildA[p] = at(L.box[p * 4 + 1] + L.box[p * 4 + 3]);
        L.buildB[p] = at(L.box[p * 4 + 1]);
      }
    }
    for (const p of list) {
      const F = all[p].fit;
      const lead = kind === 1 || kind === 2 ? B.ornament : B.lead;
      // Never long before its plate; then at least `least` long, and whole
      // `done` before its plate.
      let a = Math.max(L.buildA[p], F - lead);
      let b = Math.min(Math.max(L.buildB[p], a + B.least), F - B.done);
      a = Math.min(a, b - 40);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        a = F - lead;
        b = F - B.done;
      }
      L.buildA[p] = a;
      L.buildB[p] = b;
    }
  }
  yield;
  // Inside each plate: along the channel from each trim's entry.
  for (let p = 0; p < all.length; p += 1) {
    if (p) yield;
    const plate = all[p];
    const first = plate.first;
    const n = plate.end - first;
    if (!Number.isFinite(L.buildA[p]) || n <= 0) {
      for (let k = first; k < plate.end; k += 1) {
        L.buildIdx[k] = k;
        L.buildSorted[k] = -Infinity;
        L.buildAt[k] = -Infinity;
        L.buildFrac[k] = 1;
      }
      continue;
    }
    const piece = plate.piece;
    const cols = Math.ceil(piece.w / G) + 1;
    const rows = Math.ceil(piece.h / G) + 1;
    const grid = new Int32Array(cols * rows).fill(-1);
    const col = new Int32Array(n);
    const row = new Int32Array(n);
    let bottomRow = 0;
    for (let k = 0; k < n; k += 1) {
      const c = Math.max(0, Math.min(cols - 1, Math.round((gold.fx[first + k] - piece.x) / G)));
      const r = Math.max(0, Math.min(rows - 1, Math.round((gold.fy[first + k] - piece.y) / G)));
      col[k] = c;
      row[k] = r;
      grid[r * cols + c] = k;
      bottomRow = Math.max(bottomRow, r);
    }
    const tail = L.kind[p] === 1;
    const seatC = (piece.seat[0] - piece.x) / G - 0.5;
    const seatR = (piece.seat[1] - piece.y) / G - 0.5;
    const centre = (piece.w / G - 1) / 2;
    const dist = new Float32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let seen = 0;
    while (seen < n) {
      // The next trim's entry: its lowest cell (nearest the middle), or the
      // tail's cell nearest its seat.
      let entry = -1;
      let best = Infinity;
      for (let k = 0; k < n; k += 1) {
        if (dist[k] >= 0) continue;
        const score = tail
          ? Math.hypot(col[k] - seatC, row[k] - seatR)
          : (bottomRow - row[k]) * 1000 + Math.abs(col[k] - centre);
        if (score < best) {
          best = score;
          entry = k;
        }
      }
      dist[entry] = tail ? best * 0.45 : bottomRow - row[entry];
      let head = 0;
      let end = 0;
      queue[end++] = entry;
      seen += 1;
      while (head < end) {
        const k = queue[head++];
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const c = col[k] + dx;
            const r = row[k] + dy;
            if ((!dx && !dy) || c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const j = grid[r * cols + c];
            if (j < 0 || dist[j] >= 0) continue;
            dist[j] = dist[k] + (dx && dy ? 1.41 : 1);
            queue[end++] = j;
            seen += 1;
          }
      }
    }
    let most = 0;
    for (let k = 0; k < n; k += 1) most = Math.max(most, dist[k]);
    const a = L.buildA[p];
    const span = L.buildB[p] - a;
    // The weld head: about two cells deep along the channel.
    L.headMs[p] = Math.min(16, Math.max(2, most > 0 ? (2.2 * span) / most : span));
    const order = Array.from({ length: n }, (_, k) => k).sort((x, y) => dist[x] - dist[y] || x - y);
    order.forEach((k, rank) => {
      const frac = most > 0 ? dist[k] / most : 0;
      const i = first + k;
      L.buildFrac[i] = frac;
      L.buildAt[i] = a + frac * span;
      L.buildIdx[first + rank] = i;
      L.buildSorted[first + rank] = a + frac * span;
    });
  }
}

// Coverage: each tile's mean alpha (so a chip never unfolds past the art's
// edge), from one read-back of the art at a third of its size (a tile is
// then three pixels across: a short slice, where a read-back per plate cost
// a frame's worth of idle time in all).
const COVER_STEP = 3;
function coverAll(L: Layout, all: Plate[], art: CanvasImageSource) {
  const w = Math.ceil(ART_W / COVER_STEP);
  const h = Math.ceil(ART_H / COVER_STEP);
  const canvas = Object.assign(globalThis.document.createElement("canvas"), {
    width: w,
    height: h,
  });
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "medium";
  context.drawImage(art, 0, 0, ART_W, ART_H, 0, 0, ART_W / COVER_STEP, ART_H / COVER_STEP);
  const data = context.getImageData(0, 0, w, h).data;
  for (let p = 0; p < all.length; p += 1) {
    if (L.kind[p] < 0) continue;
    const tiles = all[p].tiles;
    const first = L.tileFirst[p];
    for (let k = 0; k < tiles.length; k += 1) {
      const tile = tiles[k];
      // The read-back pixels whose centres fall inside the tile (one at least).
      let x0 = Math.ceil(tile.sx / COVER_STEP - 0.5);
      let x1 = Math.floor((tile.sx + tile.tw) / COVER_STEP - 0.5);
      let y0 = Math.ceil(tile.sy / COVER_STEP - 0.5);
      let y1 = Math.floor((tile.sy + tile.th) / COVER_STEP - 0.5);
      if (x1 < x0) x0 = x1 = Math.floor((tile.sx + tile.tw / 2) / COVER_STEP);
      if (y1 < y0) y0 = y1 = Math.floor((tile.sy + tile.th / 2) / COVER_STEP);
      let sum = 0;
      let count = 0;
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y += 1)
        for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x += 1) {
          sum += data[(y * w + x) * 4 + 3];
          count += 1;
        }
      L.cov[first + k] = count ? sum / (255 * count) : 1;
    }
  }
  canvas.width = canvas.height = 0;
  return true;
}

// The scaffold lattice, in atlas space (so a plate's draw never shows its
// neighbour's): each tile's centre a node, linked right and down.
function latticePlate(context: CanvasRenderingContext2D, L: Layout, plate: Plate, p: number) {
  const piece = plate.piece;
  const first = L.tileFirst[p];
  const n = plate.tiles.length;
  const ax = piece.ax - piece.x;
  const ay = piece.ay - piece.y;
  context.globalAlpha = 0.3;
  context.strokeStyle = "#8cefff";
  context.lineWidth = 0.6;
  context.beginPath();
  for (let k = 0; k < n; k += 1) {
    const i = first + k;
    for (let m = k + 1; m < n; m += 1) {
      const j = first + m;
      const dx = L.cx[j] - L.cx[i];
      const dy = L.cy[j] - L.cy[i];
      if (!(
        (Math.abs(dx - T) < 0.5 && Math.abs(dy) < 0.5) ||
        (Math.abs(dy - T) < 0.5 && Math.abs(dx) < 0.5)
      ))
        continue;
      context.moveTo(L.cx[i] + ax, L.cy[i] + ay);
      context.lineTo(L.cx[j] + ax, L.cy[j] + ay);
    }
  }
  context.stroke();
  context.globalAlpha = 0.85;
  context.fillStyle = "#c8f6ff";
  context.beginPath();
  for (let k = 0; k < n; k += 1)
    context.rect(L.cx[first + k] + ax - 0.55, L.cy[first + k] + ay - 0.55, 1.1, 1.1);
  context.fill();
  context.globalAlpha = 1;
}

// The conduit's rails and channel alone (the guide's opaque pixels), so its
// hard-light glass can be drawn faint over the raw channel while the rails
// stay solid. Same contract as the kit's pixel jobs (rexonance-unlit.js:
// row-sliced, byte-identical whatever the slices, no composite operations,
// null if the pixels cannot be read); kept here, the call's own layer.
function createRailsJob(guide: CanvasImageSource, w: number, h: number) {
  const owned: HTMLCanvasElement[] = [];
  const make = () => {
    const canvas = Object.assign(globalThis.document.createElement("canvas"), {
      width: w,
      height: h,
    });
    owned.push(canvas);
    return canvas;
  };
  try {
    const scratch = make();
    const context = scratch.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("unavailable rails context");
    context.drawImage(guide, 0, 0, w, h, 0, 0, w, h);
    let input: Uint8ClampedArray | null = context.getImageData(0, 0, w, h).data;
    let image: ImageData | null = context.createImageData(w, h);
    let row = 0;
    let result: { rails: HTMLCanvasElement } | null = null;
    let cancelled = false;
    const release = () => {
      input = null;
      image = null;
      for (const canvas of owned) canvas.width = canvas.height = 0;
    };
    return {
      step(until: number, deadline?: Pick<IdleDeadline, "timeRemaining">) {
        if (cancelled || result || row >= h || !input || !image) return true;
        const out = image.data;
        do {
          for (let x = 0, i = row * w * 4; x < w; x += 1, i += 4) {
            const a = input[i + 3];
            if (a < 150) continue;
            out[i] = input[i];
            out[i + 1] = input[i + 1];
            out[i + 2] = input[i + 2];
            out[i + 3] = a;
          }
          row += 1;
          if (row >= h) return true;
        } while (performance.now() < until && (!deadline || deadline.timeRemaining() >= 2));
        return false;
      },
      commit() {
        if (result) return result;
        if (cancelled || row < h || !image) return null;
        const canvas = make();
        const target = canvas.getContext("2d");
        if (!target) return null;
        target.putImageData(image, 0, 0);
        scratch.width = scratch.height = 0;
        input = null;
        image = null;
        owned.length = 0;
        result = { rails: canvas };
        return result;
      },
      cancel() {
        if (cancelled || result) return;
        cancelled = true;
        release();
      },
    };
  } catch {
    for (const canvas of owned) canvas.width = canvas.height = 0;
    return null;
  }
}

// The molten gold (G6): the kit's formula (rexonance-unlit.js,
// createNaniteMoltenJob: t = clamp(0.25 + 0.85 L) through the ramp, alpha
// the art's times the gold mask's), with each read-back and the final
// upload in a step of its own (the kit's job reads both layers in its first
// step, past a 6 ms slice). Same job contract (row-sliced, byte-identical
// whatever the slices, no composite operations, null if the pixels cannot be
// read); kept here, the call's own.
const MOLTEN_RAMP = Float32Array.of(
  0,
  120,
  52,
  10,
  0.4,
  236,
  140,
  40,
  0.7,
  255,
  210,
  120,
  1,
  255,
  250,
  236,
);
function createMoltenJob(
  source: CanvasImageSource,
  mask: CanvasImageSource | null,
  w: number,
  h: number,
) {
  const owned: HTMLCanvasElement[] = [];
  const make = () => {
    const canvas = Object.assign(globalThis.document.createElement("canvas"), {
      width: w,
      height: h,
    });
    owned.push(canvas);
    return canvas;
  };
  const release = () => {
    for (const canvas of owned) canvas.width = canvas.height = 0;
  };
  try {
    const scratch = make();
    const read = scratch.getContext("2d", { willReadFrequently: true });
    if (!read) throw new Error("unavailable molten context");
    let art: Uint8ClampedArray | null = null;
    let gold: Uint8ClampedArray | null = null;
    let image: ImageData | null = null;
    let row = 0;
    let uploaded = false;
    let cancelled = false;
    let result: { molten: HTMLCanvasElement } | null = null;
    const pixels = (layer: CanvasImageSource) => {
      read.clearRect(0, 0, w, h);
      read.drawImage(layer, 0, 0, w, h, 0, 0, w, h);
      return read.getImageData(0, 0, w, h).data;
    };
    return {
      step(until: number, deadline?: Pick<IdleDeadline, "timeRemaining">) {
        if (cancelled || result || uploaded) return true;
        try {
          // One read-back, or the upload, per step.
          if (!art) {
            art = pixels(source);
            image = read.createImageData(w, h);
            return false;
          }
          if (mask && !gold) {
            gold = pixels(mask);
            return false;
          }
          const o = image!.data;
          if (row < h) {
            do {
              for (let x = 0, i = row * w * 4; x < w; x += 1, i += 4) {
                const alpha = art[i + 3];
                if (!alpha) continue;
                const lum = (0.2126 * art[i] + 0.7152 * art[i + 1] + 0.0722 * art[i + 2]) / 255;
                const t = unit(0.25 + 0.85 * lum);
                let k = 4;
                while (k < 12 && t > MOLTEN_RAMP[k]) k += 4;
                const u = (t - MOLTEN_RAMP[k - 4]) / (MOLTEN_RAMP[k] - MOLTEN_RAMP[k - 4]);
                for (let c = 1; c < 4; c += 1)
                  o[i + c - 1] = Math.round(
                    MOLTEN_RAMP[k - 4 + c] + (MOLTEN_RAMP[k + c] - MOLTEN_RAMP[k - 4 + c]) * u,
                  );
                o[i + 3] = gold ? Math.round((alpha * gold[i + 3]) / 255) : alpha;
              }
              row += 1;
            } while (
              row < h &&
              performance.now() < until &&
              (!deadline || deadline.timeRemaining() >= 2)
            );
            return false;
          }
          const out = make();
          const write = out.getContext("2d");
          if (!write) throw new Error("unavailable molten output");
          write.putImageData(image!, 0, 0);
          scratch.width = scratch.height = 0;
          art = gold = null;
          image = null;
          uploaded = true;
          result = { molten: out };
          return true;
        } catch {
          cancelled = true;
          release();
          return true;
        }
      },
      commit() {
        return cancelled ? null : result;
      },
      cancel() {
        if (cancelled || result) return;
        cancelled = true;
        art = gold = null;
        image = null;
        release();
      },
    };
  } catch {
    release();
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Preparation: in its own idle slices, after the plan and its lights. */

let READY = false;
let preparation: Promise<boolean> | null = null;
let promotePreparation: (() => void) | null = null;

type Stage =
  "suit" | "layout" | "cover" | "metal" | "guide" | "rails" | "molten" | "lattice" | "done";

/** Builds the call's extras (its layout, and the metal, hologram, walls,
 * molten and lattice layers) in ≤ 6 ms idle slices, once the plan and its
 * lights are prepared and the nanite kit is decoded. Never while a call
 * draws. Resolves true once ready (false if a layer is unavailable). */
export function prepareRexonanceNanites(priority: "low" | "high" = "low") {
  if (READY) return Promise.resolve(true);
  if (preparation) {
    if (priority === "high") promotePreparation?.();
    return preparation;
  }
  const pending = new Promise<boolean>((resolve) => {
    let urgent = priority === "high";
    let settled = false;
    let stage: Stage = "suit";
    let cursor = 0;
    let generation = 0;
    let queued: { kind: "idle" | "frame"; id: number } | null = null;
    let job: NanitePixelJob<Record<string, HTMLCanvasElement | undefined>> | null = null;
    let lattice: HTMLCanvasElement | null = null;
    const made: Partial<Sheets> = {};
    let steps: Generator<undefined, Layout, undefined> | null = null;
    let layout: Layout | null = null;
    const settle = (ready: boolean) => {
      if (settled) return;
      settled = true;
      generation += 1;
      if (queued?.kind === "idle") globalThis.cancelIdleCallback?.(queued.id);
      else if (queued?.kind === "frame") globalThis.cancelAnimationFrame(queued.id);
      queued = null;
      job?.cancel();
      job = null;
      if (!ready) {
        for (const canvas of Object.values(made)) if (canvas) canvas.width = canvas.height = 0;
        if (lattice) lattice.width = lattice.height = 0;
      }
      resolve(ready);
    };
    const schedule = () => {
      const ticket = generation;
      const resume = (deadline?: IdleDeadline) => {
        if (settled || ticket !== generation) return;
        queued = null;
        slice(deadline);
      };
      if (!urgent && globalThis.requestIdleCallback)
        queued = { kind: "idle", id: globalThis.requestIdleCallback(resume, { timeout: 1200 }) };
      else queued = { kind: "frame", id: globalThis.requestAnimationFrame(() => resume()) };
    };
    const art = () => plateLights()?.unlit ?? rexonanceSuitSource(REXONANCE_SUIT_ATLAS.src) ?? null;
    const runJob = (
      until: number,
      deadline: IdleDeadline | undefined,
      create: () => NanitePixelJob<Record<string, HTMLCanvasElement | undefined>> | null,
      publish: (result: Record<string, HTMLCanvasElement | undefined>) => boolean,
      next: Stage,
    ) => {
      if (!job) {
        job = create();
        if (!job) return settle(false);
        return schedule();
      }
      if (!job.step(until, deadline)) return schedule();
      const result = job.commit();
      job.cancel();
      job = null;
      if (!result || !publish(result)) return settle(false);
      stage = next;
      cursor = 0;
      schedule();
    };
    const slice = (deadline?: IdleDeadline) => {
      // A live call owns the frame: never read back or upload during it.
      if (work.drawing > 0) {
        schedule();
        return;
      }
      // Each slice stays under 6 ms: its jobs step to 5 ms, its own units
      // start only before 4 ms.
      const until = performance.now() + 5;
      const soft = until - 1;
      try {
        const all = plates();
        const source = art();
        const guide = rexonanceNaniteSource(KIT_GUIDE.src);
        if (!source || !guide) return settle(false);
        if (stage === "suit") {
          // The plan and its lights first (shared with the call's own).
          void prepareRexonanceSuit(urgent ? "high" : "low").then((ready) => {
            if (settled) return;
            if (!ready) return settle(false);
            stage = "layout";
            schedule();
          });
          return;
        }
        if (stage === "layout") {
          // A unit at a time (a plate, a trim build, the swarm…) while the
          // slice has room; each unit is well under a millisecond.
          steps ??= layoutSteps(all, cells());
          for (;;) {
            const next = steps.next();
            if (next.done) {
              layout = next.value;
              steps = null;
              stage = "cover";
              cursor = 0;
              break;
            }
            if (performance.now() > soft || (deadline && deadline.timeRemaining() < 2)) break;
          }
          return schedule();
        }
        if (stage === "cover") {
          if (!coverAll(layout!, all, source)) return settle(false);
          stage = "metal";
          cursor = 0;
          return schedule();
        }
        if (stage === "metal")
          return runJob(
            until,
            deadline,
            () =>
              createNaniteMetalJob(source, 0, 0, ART_W, ART_H, globalThis.document, {
                silhouette: !TOUCH,
              }) as NanitePixelJob<Record<string, HTMLCanvasElement | undefined>> | null,
            (result) => {
              if (!result.metal) return false;
              made.metal = result.metal;
              made.silhouette = result.silhouette ?? null;
              return true;
            },
            "guide",
          );
        if (stage === "guide")
          return runJob(
            until,
            deadline,
            () =>
              createNaniteGuideJob(guide, globalThis.document, {
                walls: !TOUCH,
              }) as NanitePixelJob<Record<string, HTMLCanvasElement | undefined>> | null,
            (result) => {
              if (!result.holo) return false;
              made.holo = result.holo;
              made.walls = result.walls ?? null;
              return true;
            },
            TOUCH ? "done" : "rails",
          );
        if (stage === "rails")
          return runJob(
            until,
            deadline,
            () =>
              createRailsJob(guide, KIT_GUIDE.width, KIT_GUIDE.height) as NanitePixelJob<
                Record<string, HTMLCanvasElement | undefined>
              > | null,
            (result) => {
              made.rails = result.rails ?? null;
              return Boolean(result.rails);
            },
            "molten",
          );
        if (stage === "molten") {
          const mask = rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
          return runJob(
            until,
            deadline,
            () =>
              createMoltenJob(source, mask, ART_W, ART_H) as NanitePixelJob<
                Record<string, HTMLCanvasElement | undefined>
              > | null,
            (result) => {
              if (!result.molten) return false;
              made.molten = result.molten;
              return true;
            },
            "lattice",
          );
        }
        if (stage === "lattice") {
          if (!lattice)
            lattice = Object.assign(globalThis.document.createElement("canvas"), {
              width: ART_W,
              height: ART_H,
            });
          const context = lattice.getContext("2d");
          if (!context) return settle(false);
          while (cursor < all.length) {
            if (layout!.kind[cursor] >= 0) latticePlate(context, layout!, all[cursor], cursor);
            cursor += 1;
            if (performance.now() > until || (deadline && deadline.timeRemaining() < 2)) break;
          }
          if (cursor >= all.length) {
            made.lattice = lattice;
            stage = "done";
          }
          return schedule();
        }
        if (stage === "done") {
          LAYOUT = layout;
          SHEETS = {
            metal: made.metal!,
            silhouette: made.silhouette ?? null,
            holo: made.holo!,
            walls: made.walls ?? null,
            rails: made.rails ?? null,
            molten: made.molten ?? null,
            lattice: made.lattice ?? null,
          };
          READY = true;
          settle(true);
        }
      } catch {
        settle(false);
      }
    };
    promotePreparation = () => {
      if (settled || urgent) return;
      urgent = true;
      generation += 1;
      if (queued?.kind === "idle") globalThis.cancelIdleCallback?.(queued.id);
      queued = null;
      schedule();
    };
    schedule();
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

/** The prepared layout, read-only (tests and frame audits). */
export const rexonanceNaniteLayout = (): Readonly<Layout> | null => LAYOUT;

/** Whether the call can draw its extras: prepared, and every kit sheet decoded. */
export const isRexonanceNaniteReady = () =>
  READY &&
  Boolean(
    LAYOUT &&
    SHEETS &&
    rexonanceNaniteSource(KIT_CELLS.src) &&
    rexonanceNaniteSource(KIT_COMETS.src) &&
    rexonanceNaniteSource(KIT_FX.src) &&
    rexonanceNaniteSource(KIT_GUIDE.src),
  );

/* ------------------------------------------------------------------ */
/* The draw passes. */

export type SuitExtrasEnv = {
  flight: CanvasRenderingContext2D;
  /** Device px per figure px, and the figure's origin on the canvas. */
  s: number;
  ox: number;
  oy: number;
  all: Plate[];
  gold: Cells;
  /** The working atlas (art, gold raw), and the mote sheet (lacquer). */
  source: CanvasImageSource;
  sheet: CanvasImageSource;
};
export type SuitExtras = {
  /** Back and mid chips, guideways being built, pulses, contact shadows. */
  before: (t: number) => void;
  /** A plate before its fit: staged metal, lattice, its flights. */
  forming: (p: number, t: number) => void;
  /** A seated plate: metal and paint (under its ring-out). */
  seat: (p: number, t: number) => void;
  unseat: () => void;
  /** A seated plate's conduit (printed, receding behind the pour). */
  conduit: (p: number, t: number) => void;
  /** Seams, rings, spall, links, beams, latches, clamps, molten, front chips. */
  after: (t: number) => void;
  /** The frame's cost (ms): a one-way governor sheds the back band, comets
   * and lacquer after two slow frames. */
  cost: (ms: number) => void;
  /** drawImage calls in the last frame. */
  drawn: () => number;
  governed: () => boolean;
};

// Pose scratch (the passes write these; nothing is allocated).
let PX = 0;
let PY = 0;
let PZ = 0;
let TX = 0;
let TY = 0;

export function createSuitExtras(env: SuitExtrasEnv): SuitExtras | null {
  const L = LAYOUT;
  const K = SHEETS;
  const cellsImage = rexonanceNaniteSource(KIT_CELLS.src);
  const cometImage = rexonanceNaniteSource(KIT_COMETS.src);
  const fxImage = rexonanceNaniteSource(KIT_FX.src);
  const guideImage = rexonanceNaniteSource(KIT_GUIDE.src);
  if (!READY || !L || !K || !cellsImage || !cometImage || !fxImage || !guideImage) return null;
  const { flight, s, ox, oy, all, gold, source, sheet } = env;
  const P = all.length;
  if (L.kind.length !== P) return null;
  const metal = K.metal;
  const silhouette = K.silhouette;
  const holo = K.holo;
  const walls = K.walls;
  const rails = K.rails;
  const molten = K.molten;
  const lattice = K.lattice;
  // Per frame.
  const jig = new Float32Array(P * 6);
  const lam = new Float32Array(P);
  const jigged = new Uint8Array(P);
  const chipX = new Float32Array(CHIPS);
  const chipY = new Float32Array(CHIPS);
  const chipD = new Float32Array(CHIPS);
  const chipA = new Float32Array(CHIPS);
  const chipF = new Uint8Array(CHIPS);
  const chipT = new Uint8Array(CHIPS);
  const chipBand = new Uint8Array(CHIPS); // 0 none, 1 back, 2 mid, 3 front, 4 bokeh
  const chipVX = new Float32Array(CHIPS);
  const chipVY = new Float32Array(CHIPS);
  const ringCount = new Float32Array(RINGS);
  const LINKS = 1200;
  const links = new Float32Array(LINKS * 5);
  let linkCount = 0;
  const SPARKS = 160;
  const sparks = new Float32Array(SPARKS * 4);
  let sparkCount = 0;
  const beams = new Float32Array(P * 4);
  const beamU = new Float32Array(P * 2);
  const GOLD_N = gold.lock.length;
  const pulsesPre = new Int32Array(Math.max(1, GOLD_N));
  let pulsePreCount = 0;
  const pulsesPost = new Int32Array(Math.max(1, GOLD_N));
  let pulsePostCount = 0;
  // The guideway's build heads (cells), and the latches' lasers to them.
  const heads = new Int32Array(Math.max(1, GOLD_N));
  let headCount = 0;
  const cores = new Int32Array(Math.max(1, GOLD_N));
  let coreCount = 0;
  const lasers = new Float32Array(P * 4);
  let laserCount = 0;
  const fades = new Int32Array(4096);
  const fadeA = new Float32Array(4096);
  let fadeCount = 0;
  const RECT_CAP = 2048;
  const rects = new Float32Array(8 * RECT_CAP * 3);
  const rectCount = new Int32Array(8);
  let draws = 0;
  let comets = 0;
  let heroes = 0;
  let governed = false;
  let slow = 0;
  let frames = 0;
  let jigs = 0;
  let transformed = false;
  let conduits = 0;

  const base = () => {
    flight.setTransform(1, 0, 0, 1, ox, oy);
    transformed = false;
  };
  const applyJig = (p: number) => {
    const o = p * 6;
    flight.setTransform(jig[o], jig[o + 1], jig[o + 2], jig[o + 3], jig[o + 4], jig[o + 5]);
    transformed = true;
  };
  // M = T(seat + off·λ)·SkewX(sway)·S(1 + 0.04λ)·F(θλ)·R(hinge)·T(−seat),
  // stored in device units. The tail's segments hinge in the plate's plane
  // about their seats; the ribbons sway after they seat.
  const setJig = (p: number, lambda: number, hinge = 0, sway = 0) => {
    const o = p * 6;
    lam[p] = lambda;
    const phiAngle = L.tilt[p] * lambda;
    const c = Math.cos(phiAngle);
    const sk = 0.08 * Math.sin(phiAngle);
    const gx = L.gX[p];
    const gy = L.gY[p];
    const qx = -gy;
    const qy = gx;
    const k = 1 + 0.04 * lambda;
    // B = k (c g gᵀ + q qᵀ + sk q gᵀ)
    const b00 = k * (c * gx * gx + qx * qx + sk * qx * gx);
    const b01 = k * (c * gx * gy + qx * qy + sk * qx * gy);
    const b10 = k * (c * gy * gx + qy * qx + sk * qy * gx);
    const b11 = k * (c * gy * gy + qy * qy + sk * qy * gy);
    // A = SkewX(sway)·B·R(hinge)
    const hc = Math.cos(hinge);
    const hs = Math.sin(hinge);
    const r00 = b00 * hc + b01 * hs;
    const r01 = -b00 * hs + b01 * hc;
    const r10 = b10 * hc + b11 * hs;
    const r11 = -b10 * hs + b11 * hc;
    const a00 = r00 + sway * r10;
    const a01 = r01 + sway * r11;
    const a10 = r10;
    const a11 = r11;
    const sx = L.seatX[p];
    const sy = L.seatY[p];
    const ex = sx + L.offX[p] * lambda - (a00 * sx + a01 * sy);
    const ey = sy + L.offY[p] * lambda - (a10 * sx + a11 * sy);
    jig[o] = a00;
    jig[o + 1] = a10;
    jig[o + 2] = a01;
    jig[o + 3] = a11;
    jig[o + 4] = ex * s + ox;
    jig[o + 5] = ey * s + oy;
  };
  const flat = (p: number) => {
    const o = p * 6;
    lam[p] = 0;
    jig[o] = 1;
    jig[o + 1] = 0;
    jig[o + 2] = 0;
    jig[o + 3] = 1;
    jig[o + 4] = ox;
    jig[o + 5] = oy;
  };
  // A3: a tail segment's in-plane hinge (root → blade swings wider), and its
  // ring-out past the seat.
  const hingeAt = (p: number, t: number, lambda: number) => {
    if (L.kind[p] !== 1) return 0;
    const F = all[p].fit;
    const k = L.segment[p];
    if (t >= F && t < F + SW.overshoot) {
      const tau = (t - F) / SW.overshoot;
      return ((3 * Math.PI) / 180) * Math.exp(-6 * tau) * Math.cos(12 * tau);
    }
    return lambda > 0 ? (-(10 + 4 * k) * Math.PI * lambda) / 180 : 0;
  };
  // A3: a ribbon sways once it has seated.
  const swayAt = (p: number, t: number) => {
    if (L.kind[p] !== 2) return 0;
    const tau = (t - all[p].fit) / SW.sway;
    if (tau < 0 || tau >= 1) return 0;
    return 0.12 * Math.exp(-4 * tau) * Math.sin(10 * tau);
  };
  // λ: lifted until the plate fills, swung down over the seat, then a ring-out.
  const lambdaAt = (p: number, t: number) => {
    const F = all[p].fit;
    if (L.kind[p] === 3) return 0;
    if (t >= F + SW.overshoot) return 0;
    if (t >= F) {
      const tau = (t - F) / SW.overshoot;
      return -0.1 * Math.sin(Math.PI * tau) * Math.exp(-2 * tau);
    }
    if (t >= F - SW.seat) {
      const u = (t - F + SW.seat) / SW.seat;
      return L.lam0[p] * (1 - u * u * u);
    }
    // Landed fraction: binary search in the plate's sorted landings.
    const first = L.tileFirst[p];
    const end = L.tileFirst[p + 1];
    let lo = first;
    let hi = end;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (L.landSorted[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return 1 - (0.35 * (lo - first)) / Math.max(1, end - first);
  };

  /* Sprites. */
  const rect = (bucket: number, x: number, y: number, d: number) => {
    const k = rectCount[bucket];
    if (k >= RECT_CAP) return;
    const o = (bucket * RECT_CAP + k) * 3;
    rects[o] = x;
    rects[o + 1] = y;
    rects[o + 2] = d;
    rectCount[bucket] = k + 1;
  };
  const flushRects = () => {
    for (let bucket = 0; bucket < 8; bucket += 1) {
      const count = rectCount[bucket];
      if (!count) continue;
      const tone = bucket >> 1;
      flight.globalAlpha = bucket & 1 ? 0.9 : 0.55;
      flight.fillStyle = RECT_SHADES[tone];
      flight.beginPath();
      for (let k = 0; k < count; k += 1) {
        const o = (bucket * RECT_CAP + k) * 3;
        const d = rects[o + 2];
        flight.rect(rects[o] - d / 2 + 1, rects[o + 1] - d / 2 + 1, d, d);
      }
      flight.fill();
      flight.fillStyle = RECT_TONES[tone];
      flight.beginPath();
      for (let k = 0; k < count; k += 1) {
        const o = (bucket * RECT_CAP + k) * 3;
        const d = rects[o + 2];
        flight.rect(rects[o] - d / 2, rects[o + 1] - d / 2, d, d);
      }
      flight.fill();
      rectCount[bucket] = 0;
    }
    flight.globalAlpha = 1;
  };
  // A hex chip: x, y device centre, d device size, its tumble frame.
  const chip = (
    x: number,
    y: number,
    d: number,
    frame: number,
    tone: number,
    alpha: number,
    hero = false,
  ) => {
    if (alpha <= 0.01 || d < 0.5) return;
    if (TOUCH) {
      // Touch: two-tone rects that pulse with the tumble; a few heroes.
      if (hero && heroes < HEROES) heroes += 1;
      else {
        const pulse = 0.55 + 0.45 * Math.abs(Math.cos((TAU * frame) / FRAMES));
        rect(
          Math.min(GOLD_TONE, tone) * 2 + (alpha > 0.6 ? 1 : 0),
          x,
          y,
          Math.max(1.5, d * pulse * 0.8),
        );
        return;
      }
    }
    if (draws >= BUDGET) return;
    draws += 1;
    flight.globalAlpha = alpha > 1 ? 1 : alpha;
    const t = tone > GOLD_TONE ? ICE : tone;
    const e = d * SPRITE;
    if (e <= MIP_BELOW)
      flight.drawImage(
        cellsImage,
        MIP_X[t] + 16 * frame,
        MIP_Y[t],
        16,
        16,
        x - e / 2,
        y - e / 2,
        e,
        e,
      );
    else flight.drawImage(cellsImage, 32 * frame, 32 * t, 32, 32, x - e / 2, y - e / 2, e, e);
  };
  const unfold = (x: number, y: number, d: number, k: number, tone: number, alpha: number) => {
    if (TOUCH && heroes >= HEROES) {
      rect(Math.min(WHITE, tone) * 2 + 1, x, y, d * 0.8);
      return;
    }
    if (TOUCH) heroes += 1;
    if (draws >= BUDGET) return;
    draws += 1;
    flight.globalAlpha = alpha;
    const t = tone >= 3 ? ICE : tone;
    flight.drawImage(
      cellsImage,
      UNFOLD_X[t] + 32 * k,
      KIT_CELLS.unfold.y,
      32,
      32,
      x - d / 2,
      y - d / 2,
      d,
      d,
    );
  };
  const comet = (x: number, y: number, vx: number, vy: number, tone: number, alpha: number) => {
    if (TOUCH || governed || comets >= COMET_BUDGET || draws >= BUDGET) return;
    const length = Math.hypot(vx, vy);
    if (length < 4) return;
    let a = Math.round(Math.atan2(vy, vx) / (Math.PI / 8)) % 16;
    if (a < 0) a += 16;
    const long = length >= 12 ? 1 : 0;
    const k = Math.min(2.5, Math.max(0.6, length / KIT_COMETS.tail[long]));
    const row = COMET_ROW[tone > GOLD_TONE ? 0 : tone === GOLD_TONE ? 2 : tone] + long;
    comets += 1;
    draws += 1;
    flight.globalAlpha = 0.5 * alpha;
    const d = 32 * k;
    flight.drawImage(cometImage, 32 * a, 32 * row, 32, 32, x - 16 * k, y - 16 * k, d, d);
  };

  /* The cocoon. */
  const ringPose = (c: number, t: number) => {
    const r = L.ring[c];
    const lane = L.lane[c];
    const k = 1 + 0.045 * lane;
    const R = L.ringRx[r] * k;
    const Ry = L.ringRy[r] * k;
    const omega = L.ringOmega[r];
    const th = L.theta0[c] + omega * t;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const lx = R * cos;
    const ly = Ry * sin + 3 * Math.sin(5 * th + L.phi[c]) + 4 * lane;
    const rc = L.ringCos[r];
    const rs = L.ringSin[r];
    PX = W / 2 + lx * rc - ly * rs;
    PY = L.ringCy[r] + lx * rs + ly * rc;
    PZ = sin;
    const dir = omega < 0 ? -1 : 1;
    const dx = -R * sin * dir;
    const dy = Ry * cos * dir;
    const tl = Math.hypot(dx, dy) || 1;
    TX = (dx * rc - dy * rs) / tl;
    TY = (dx * rs + dy * rc) / tl;
  };
  // A chip being born (that fraction of its wave): on its spiral arm out
  // of the core, blending into its ring pose (PX, PY on entry).
  const bornPose = (c: number, born: number) => {
    const a = L.arm[c] + L.armDir[c] * 2.4 * Math.PI * born;
    const rho = 150 * Math.max(0, born) ** 0.85;
    const sx = CORE_X + rho * Math.cos(a);
    const sy = CORE_Y + 0.72 * rho * Math.sin(a);
    const m = smooth((born - 0.4) / 0.6);
    PX = sx + (PX - sx) * m;
    PY = sy + (PY - sy) * m;
  };
  // A free chip imploding (fraction u of the window) from its ring pose
  // (PX, PY on entry) into the reactor.
  const implodePose = (u: number) => {
    const a = TAU * u;
    const k = 1 - u * u * u;
    const dx = PX - CORE_X;
    const dy = PY - CORE_Y;
    PX = CORE_X + (dx * Math.cos(a) - dy * Math.sin(a)) * k;
    PY = CORE_Y + (dx * Math.sin(a) + dy * Math.cos(a)) * k;
  };
  // Where chip c is at t (figure px: PX, PY, depth PZ); returns its alpha
  // and writes size/tone/frame via the out arrays (index c). -1: not shown.
  const crownCentreY = VISOR_Y - 92;
  const swarm = (t: number) => {
    ringCount.fill(0);
    for (let c = 0; c < CHIPS; c += 1) {
      chipBand[c] = 0;
      chipVX[c] = 0;
      chipVY[c] = 0;
      const birth = L.birth[c];
      if (t < birth) continue;
      const plate = L.chipPlate[c];
      const helm = plate >= 0 && L.kind[plate] === 3;
      let size = L.chipSize[c];
      let alpha = 1;
      let tone = L.chipTone[c];
      let spinBoost = 1;
      ringPose(c, t);
      let x = PX;
      let y = PY;
      let z = PZ;
      const born = (t - birth) / SW.wave;
      if (born < 1) {
        // N2: out of the core on one of three spiral arms, into its ring.
        bornPose(c, born);
        x = PX;
        y = PY;
        z = 0.5 + (z - 0.5) * smooth((born - 0.4) / 0.6);
        size *= 0.5 + 0.5 * born;
        if (born < 0.5) tone = WHITE;
        spinBoost = 2;
        if (!TOUCH && !governed && t - 24 >= birth) {
          // Its streak along the arm.
          ringPose(c, t - 24);
          bornPose(c, (t - 24 - birth) / SW.wave);
          chipVX[c] = (x - PX) * s;
          chipVY[c] = (y - PY) * s;
        }
      } else if (!TOUCH && c % 3 === 0 && !governed) {
        // Comets from the ring's own speed (24 ms back).
        const nx = PX;
        const ny = PY;
        ringPose(c, t - 24);
        chipVX[c] = (nx - PX) * s;
        chipVY[c] = (ny - PY) * s;
        PX = nx;
        PY = ny;
      }
      if (helm && t >= SW.crown[0]) {
        // N10: the helmet's chips gather in a crown above the head.
        const m = smooth((t - SW.crown[0]) / (SW.crown[1] - SW.crown[0]));
        const a = L.crownA[c] + (TAU * 1.2 * (t - SW.crown[0])) / 1000;
        const R = L.crownR[c];
        const cx = VISOR_X + R * Math.cos(a);
        const cy = crownCentreY + CROWN_SQUASH * R * Math.sin(a);
        x += (cx - x) * m;
        y += (cy - y) * m;
        z += (Math.sin(a) - z) * m;
        // A golden crown.
        if (m > 0.2) tone = c % 4 ? GOLD_TONE : WHITE;
        alpha *= 1.5;
        size *= 1 + 0.25 * m;
        chipVX[c] = 0;
        chipVY[c] = 0;
        if (t >= L.drainAt[c]) {
          // It leaves the crown, spiralling into its plate.
          const u = (t - L.drainAt[c]) / 120;
          if (u >= 1) continue;
          const e = easeOut(u);
          const a2 = a + 3 * Math.PI * u;
          const R2 = R * (1 - e);
          const hx = VISOR_X + (L.seatX[plate] - VISOR_X) * e;
          const hy = crownCentreY + (L.seatY[plate] - crownCentreY) * e;
          x = hx + R2 * Math.cos(a2);
          y = hy + CROWN_SQUASH * R2 * Math.sin(a2);
          z = 0.5;
          alpha *= 1 - u * u;
          spinBoost = 3;
        }
      } else if (plate >= 0 && t >= L.drainAt[c]) {
        // N4: drained along its plate's river to the gate, fading there.
        const u = (t - L.drainAt[c]) / 120;
        if (u >= 1) continue;
        ringPose(c, L.drainAt[c]);
        const p0x = PX;
        const p0y = PY;
        const p1x = p0x + TX * 0.12 * H;
        const p1y = p0y + TY * 0.12 * H;
        const gx = L.gateX[plate];
        const gy = L.gateY[plate];
        const p2x = gx + L.nX[plate] * 0.05 * H;
        const p2y = gy + L.nY[plate] * 0.05 * H;
        const v = smooth(u);
        const w = 1 - v;
        x = w * w * w * p0x + 3 * w * w * v * p1x + 3 * w * v * v * p2x + v * v * v * gx;
        y = w * w * w * p0y + 3 * w * w * v * p1y + 3 * w * v * v * p2y + v * v * v * gy;
        // Its velocity, for the comet.
        const dvx = 3 * (w * w * (p1x - p0x) + 2 * w * v * (p2x - p1x) + v * v * (gx - p2x));
        const dvy = 3 * (w * w * (p1y - p0y) + 2 * w * v * (p2y - p1y) + v * v * (gy - p2y));
        chipVX[c] = dvx * 6 * u * (1 - u) * (24 / 120) * s;
        chipVY[c] = dvy * 6 * u * (1 - u) * (24 / 120) * s;
        z = 0.2;
        alpha *= u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
        spinBoost = 3;
      } else if (plate < 0 && t >= SW.implode[0]) {
        // N12: the free chips spiral into the reactor at the seal, white-hot,
        // streaking along their spiral.
        const u = (t - SW.implode[0]) / (SW.implode[1] - SW.implode[0]);
        if (u >= 1) continue;
        implodePose(u);
        x = PX;
        y = PY;
        size *= 1.5 * (1 - 0.6 * u);
        alpha = 1.35 * (1 - u * u * u * u);
        tone = c % 3 ? WHITE : tone;
        z = 0.6;
        chipVX[c] = 0;
        chipVY[c] = 0;
        if (!TOUCH && !governed) {
          ringPose(c, t - 24);
          implodePose(Math.max(0, u - 24 / (SW.implode[1] - SW.implode[0])));
          chipVX[c] = (x - PX) * s;
          chipVY[c] = (y - PY) * s;
        }
      }
      if (born >= 1 && !(plate >= 0 && t >= L.drainAt[c]) && !(helm && t >= SW.crown[0]))
        ringCount[L.ring[c]] += 1;
      const depth = 1 + 0.45 * z;
      size *= depth;
      alpha *= 0.55 + 0.22 * (z + 1);
      const imploding = plate < 0 && t >= SW.implode[0];
      const crowned = helm && t >= SW.crown[0];
      // Band 5: white-hot, face-on, over a glow (the free chips feeding the
      // reactor at the seal, and the crown's gold).
      const band =
        imploding || (crowned && z > -0.15)
          ? 5
          : z < -0.15
            ? 1
            : z <= 0.35
              ? 2
              : z > 0.85 && !helm
                ? 4
                : 3;
      if (band === 1 && !crowned) {
        // Behind the body: dimmed where the undersuit stands.
        const cx = Math.floor((x / W) * OCC_W);
        const cy = Math.floor((y / H) * OCC_H);
        if (cx >= 0 && cy >= 0 && cx < OCC_W && cy < OCC_H)
          alpha *= 1 - (0.8 * L.occupancy[cy * OCC_W + cx]) / 255;
      }
      if (band === 3) alpha = Math.min(alpha, 0.7);
      chipBand[c] = band;
      chipX[c] = x * s;
      chipY[c] = y * s;
      chipD[c] = size * s;
      chipA[c] = alpha;
      chipT[c] = tone;
      // White-hot chips turn face-on (their lit core) with a small wobble.
      chipF[c] =
        band === 5
          ? wrap(1.5 * Math.sin((TAU * L.chipSpin[c] * t) / 1000 + L.phi[c]))
          : wrap(L.chipF0[c] + (FRAMES * L.chipSpin[c] * spinBoost * t) / 1000);
    }
  };
  // The cocoon's lanes: each ring's ellipse, its far half faint behind the
  // body and its near half over it, fading as the ring drains.
  const lanes = (front: boolean, t: number) => {
    flight.lineWidth = Math.max(0.7, 0.55 * s);
    if (t >= SW.crown[0] && t < SW.crown[1] + 220) {
      // The crown's own lane above the head.
      const fade = Math.min(
        smooth((t - SW.crown[0]) / 100),
        1 - smooth((t - SW.crown[1] - 120) / 100),
      );
      flight.globalAlpha = (front ? 0.55 : 0.2) * fade;
      flight.strokeStyle = "#ffe2a6";
      flight.beginPath();
      flight.ellipse(
        VISOR_X * s,
        crownCentreY * s,
        122 * s,
        122 * CROWN_SQUASH * s,
        0,
        front ? 0 : Math.PI,
        front ? Math.PI : TAU,
      );
      flight.stroke();
    }
    for (let r = 0; r < RINGS; r += 1) {
      const fill = Math.min(1, ringCount[r] / 20);
      if (fill <= 0.02) continue;
      flight.globalAlpha = (front ? 0.16 : 0.07) * fill;
      flight.strokeStyle = r % 2 ? "#ffb8e8" : "#a6f2ff";
      flight.beginPath();
      flight.ellipse(
        (W / 2) * s,
        L.ringCy[r] * s,
        L.ringRx[r] * s,
        L.ringRy[r] * s,
        L.ringTilt[r],
        front ? 0 : Math.PI,
        front ? Math.PI : TAU,
      );
      flight.stroke();
    }
  };
  // N2: each pump wave rings out of the core.
  const pumps = (t: number) => {
    if (TOUCH) return;
    for (let w = 0; w < SW.waves.length; w += 1) {
      const u = (t - SW.waves[w]) / 140;
      if (u < 0 || u >= 1) continue;
      const frame = Math.min(KIT_FX.shock.frames - 1, Math.floor(u * KIT_FX.shock.frames));
      const k = (90 * s) / KIT_FX.shock.w;
      flight.globalAlpha = 0.4 * (1 - u);
      draws += 1;
      flight.drawImage(
        fxImage,
        KIT_FX.shock.x + KIT_FX.shock.w * (frame % KIT_FX.shock.cols),
        KIT_FX.shock.y + KIT_FX.shock.h * Math.floor(frame / KIT_FX.shock.cols),
        KIT_FX.shock.w,
        KIT_FX.shock.h,
        CORE_X * s - KIT_FX.shock.centre[0] * k,
        CORE_Y * s - KIT_FX.shock.centre[1] * k,
        KIT_FX.shock.w * k,
        KIT_FX.shock.h * k,
      );
    }
  };
  const drawChips = (from: number, to: number) => {
    for (let c = 0; c < CHIPS; c += 1) {
      const band = chipBand[c];
      if (band < from || band > to) continue;
      if (band === 1 && governed) continue;
      const x = chipX[c];
      const y = chipY[c];
      if (chipVX[c] || chipVY[c]) comet(x, y, chipVX[c], chipVY[c], chipT[c], chipA[c]);
      if (band === 5 && !TOUCH && draws < BUDGET) {
        // Its glow: the warm or white bokeh, faint and wide.
        draws += 1;
        const g = chipD[c] * 2.4 * SPRITE;
        const glowTone = chipT[c] === GOLD_TONE ? GOLD_TONE : WHITE;
        flight.globalAlpha = Math.min(1, 0.4 * chipA[c]);
        flight.drawImage(
          cellsImage,
          BOKEH_X[glowTone],
          BOKEH_Y[glowTone],
          32,
          32,
          x - g / 2,
          y - g / 2,
          g,
          g,
        );
      }
      if (band === 4) {
        if (TOUCH) {
          chip(x, y, chipD[c] * 1.3, chipF[c], chipT[c], chipA[c] * 0.6);
          continue;
        }
        if (draws >= BUDGET) continue;
        draws += 1;
        const d = chipD[c] * 1.6 * SPRITE;
        const t = chipT[c] > GOLD_TONE ? ICE : chipT[c];
        flight.globalAlpha = 0.35;
        flight.drawImage(cellsImage, BOKEH_X[t], BOKEH_Y[t], 32, 32, x - d / 2, y - d / 2, d, d);
        continue;
      }
      chip(x, y, chipD[c], chipF[c], chipT[c], chipA[c]);
    }
  };

  /* Gold cells: ranges by lock and by flow (both sorted within a plate). */
  const firstLockAfter = (p: number, time: number) => {
    let lo = all[p].first;
    let hi = all[p].end;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (gold.lock[mid] <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const cellClip = (from: number, to: number) => {
    flight.beginPath();
    for (let i = from; i < to; i += 1)
      flight.rect(
        gold.fx[i] * s - 0.5,
        gold.fy[i] * s - 0.5,
        gold.cw[i] * s + 1,
        gold.ch[i] * s + 1,
      );
    flight.clip();
  };
  const plateDraw = (image: CanvasImageSource, p: number, dx: number, dy: number) => {
    const piece = all[p].piece;
    draws += 1;
    flight.drawImage(
      image,
      piece.ax,
      piece.ay,
      piece.w,
      piece.h,
      (piece.x + dx) * s,
      (piece.y + dy) * s,
      piece.w * s,
      piece.h * s,
    );
  };
  // The conduit's face: its walls twice in parallax (G5), the hard-light
  // glass faint over the raw channel, the gold rails solid.
  const conduitFace = (p: number, t: number) => {
    if (walls) {
      const phiAngle = Math.PI / 4 + 0.5 * Math.max(-1, Math.min(1, (t - all[p].fit) / 200));
      const dx = WALL_DEPTH * Math.cos(phiAngle);
      const dy = WALL_DEPTH * Math.sin(phiAngle);
      flight.globalAlpha = 0.85;
      plateDraw(walls, p, 0.5 * dx, 0.5 * dy);
      flight.globalAlpha = 0.6;
      plateDraw(walls, p, dx, dy);
    }
    flight.globalAlpha = rails ? 0.42 : TOUCH ? 0.8 : 1;
    plateDraw(guideImage, p, 0, 0);
    if (rails) {
      flight.globalAlpha = 1;
      plateDraw(rails, p, 0, 0);
    }
  };
  /* The guideway's build (owner, 2026-10-16: 足先から滑らかに作られていく): the
     plate's cells by build time; those built so far, and the ones the laser
     projects just ahead of its head. */
  const builtBy = (p: number, time: number) => {
    let lo = all[p].first;
    let hi = all[p].end;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (L.buildSorted[mid] <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const buildClip = (from: number, to: number) => {
    flight.beginPath();
    for (let k = from; k < to; k += 1) {
      const i = L.buildIdx[k];
      flight.rect(
        gold.fx[i] * s - 0.5,
        gold.fy[i] * s - 0.5,
        gold.cw[i] * s + 1,
        gold.ch[i] * s + 1,
      );
    }
    flight.clip();
  };
  // Cells of [from, to) printed (build ≤ front) or not, as one clip.
  const printClip = (from: number, to: number, front: number, printed: boolean) => {
    flight.beginPath();
    for (let i = from; i < to; i += 1) {
      if (L.buildFrac[i] <= front !== printed) continue;
      flight.rect(
        gold.fx[i] * s - 0.5,
        gold.fy[i] * s - 0.5,
        gold.cw[i] * s + 1,
        gold.ch[i] * s + 1,
      );
    }
    flight.clip();
  };
  // On the body, before its plate: the solid conduit behind the head, the
  // laser's ice projection ahead of it, the weld head and its sparks, the
  // latch's laser to it, and pulses climbing what is built.
  const buildGuideway = (p: number, t: number) => {
    const plate = all[p];
    const first = plate.first;
    const end = plate.end;
    const k = builtBy(p, t);
    const lead = builtBy(p, t + SW.build.ahead);
    if (k > first) {
      flight.save();
      if (k < end) buildClip(first, k);
      conduitFace(p, t);
      flight.restore();
    }
    if (lead > k) {
      flight.save();
      buildClip(k, lead);
      flight.globalAlpha = 0.5;
      plateDraw(holo, p, 0, 0);
      flight.restore();
    }
    const glow = L.headMs[p];
    if (k > first && t < L.buildB[p] + glow) {
      for (let j = builtBy(p, t - glow); j < k && headCount < heads.length; j += 1)
        heads[headCount++] = L.buildIdx[j];
      for (let j = builtBy(p, t - 0.45 * glow); j < k && coreCount < cores.length; j += 1)
        cores[coreCount++] = L.buildIdx[j];
      // The front: a spark star that twinkles as it runs, the latch's laser.
      const i = L.buildIdx[k - 1];
      const x = (gold.fx[i] + gold.cw[i] / 2) * s;
      const y = (gold.fy[i] + gold.ch[i] / 2) * s;
      if (sparkCount < SPARKS) {
        const so = sparkCount * 4;
        // Frames 4–5: the star over a white-hot glow (see the sparks pass).
        const flicker = (Math.floor(t / 17) + p) & 1;
        sparks[so] = x;
        sparks[so + 1] = y;
        sparks[so + 2] = 4 + flicker;
        sparks[so + 3] = (TOUCH ? 11 : 16) * s * (flicker ? 0.85 : 1.15);
        sparkCount += 1;
      }
      if (!TOUCH && laserCount < P) {
        const o = laserCount * 4;
        lasers[o] = L.seatX[p] * s;
        lasers[o + 1] = L.seatY[p] * s;
        lasers[o + 2] = x;
        lasers[o + 3] = y;
        laserCount += 1;
      }
    }
    // Embers off the weld head: one every EMBER_EVERY ms of the build, each
    // thrown from where the head was then and falling as it cools.
    if (k > first && !governed) {
      const since = t - L.buildA[p];
      const newest = Math.floor(since / EMBER_EVERY);
      for (let e = 0; e < EMBERS; e += 1) {
        const born = (newest - e) * EMBER_EVERY;
        const age = since - born;
        if (born < 0 || age >= EMBER_LIFE || L.buildA[p] + born > L.buildB[p]) continue;
        const j = builtBy(p, L.buildA[p] + born);
        if (j <= first) continue;
        const i = L.buildIdx[j - 1];
        const seed = (newest - e) * 7 + p * 131;
        const h1 = hash(seed, 6007);
        const h2 = hash(seed, 6113);
        const u = age / EMBER_LIFE;
        const x = gold.fx[i] + gold.cw[i] / 2 + (h1 - 0.5) * 34 * u;
        const y = gold.fy[i] + gold.ch[i] / 2 - (14 + 22 * h2) * u + 30 * u * u;
        chip(
          x * s,
          y * s,
          (3.6 + 2.2 * h2) * s,
          wrap(FRAMES * h1 + 40 * u),
          h1 < 0.35 ? GOLD_TONE : WHITE,
          1.1 * (1 - u * u),
        );
      }
    }
    // Pulses climbing the built conduit.
    if (governed) return;
    for (let j = first; j < k; j += 1) {
      const i = L.buildIdx[j];
      const v = BUILD_PULSE_BANDS * L.buildFrac[i] - BUILD_PULSE_SPEED * t;
      if (v - Math.floor(v) < PULSE_WIDTH && pulsePreCount < pulsesPre.length)
        pulsesPre[pulsePreCount++] = i;
    }
  };
  // The conduit on the plate (G4, G5, G7): printed onto it bottom to top
  // along its trims over [F − 30, F + 5] (its laser projection ahead of the
  // weld dots), then solid, clipped behind the receding cooling front. Drawn
  // under the current transform (the staged plate's jig while it seats).
  const drawConduit = (p: number, t: number, collect: boolean) => {
    const plate = all[p];
    if (plate.end <= plate.first || L.kind[p] < 0) return;
    const F = plate.fit;
    const front = (t - F + SW.print[0]) / (SW.print[0] + SW.print[1]);
    if (front <= 0) return;
    const unc = firstLockAfter(p, t - SW.recede);
    if (unc >= plate.end) return;
    const whole = front >= 1;
    flight.save();
    if (!whole) printClip(unc, plate.end, front, true);
    else if (unc > plate.first) cellClip(unc, plate.end);
    conduitFace(p, t);
    if (rails && whole && L.hasBox[p] && !governed) {
      // A hard-light sheen runs across the conduit: its own hologram (rails and
      // channel in ice-white) through a moving band.
      const b = p * 4;
      const bx = L.box[b];
      const by = L.box[b + 1];
      const bw = L.box[b + 2];
      const bh = L.box[b + 3];
      const span = bw + bh;
      const head = (((t - F + 40) / SHEEN_MS) % 1.4) - 0.2;
      const c = bx + span * head;
      const band = Math.max(6, 0.16 * span);
      flight.beginPath();
      flight.moveTo((c - band) * s, by * s);
      flight.lineTo((c + band) * s, by * s);
      flight.lineTo((c + band - bh) * s, (by + bh) * s);
      flight.lineTo((c - band - bh) * s, (by + bh) * s);
      flight.closePath();
      flight.clip();
      flight.globalAlpha = 0.6;
      plateDraw(holo, p, 0, 0);
    }
    flight.restore();
    if (!whole) {
      flight.save();
      printClip(unc, plate.end, front, false);
      flight.globalAlpha = 0.45;
      plateDraw(holo, p, 0, 0);
      flight.restore();
      // The print head's laser-weld dots: an ice halo, a white-hot core.
      for (let pass = 0; pass < 2; pass += 1) {
        const size = pass ? 0.95 : 1.7;
        flight.globalAlpha = pass ? 0.95 : 0.4;
        flight.fillStyle = pass ? "#f6feff" : "#8cefff";
        flight.beginPath();
        for (let i = unc; i < plate.end; i += 1) {
          const b = L.buildFrac[i];
          if (b > front || b <= front - 0.08) continue;
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
      }
    }
    flight.globalAlpha = 1;
    if (!collect) return;
    // Pulses on the conduit not yet poured, out from the seat (the pour's way).
    const pour = firstLockAfter(p, t);
    for (let i = Math.max(unc, pour); i < plate.end; i += 1) {
      const v = PULSE_BANDS * gold.order[i] - PULSE_SPEED * t;
      if (v - Math.floor(v) < PULSE_WIDTH && pulsePostCount < pulsesPost.length)
        pulsesPost[pulsePostCount++] = i;
    }
  };
  const cellRects = (list: Int32Array, count: number, size: number) => {
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

  /* The passes. */
  const before = (t: number) => {
    frames += 1;
    draws = 0;
    comets = 0;
    heroes = 0;
    linkCount = 0;
    sparkCount = 0;
    pulsePreCount = 0;
    pulsePostCount = 0;
    headCount = 0;
    coreCount = 0;
    laserCount = 0;
    jigs = 0;
    conduits = 0;
    beamU.fill(-1);
    jigged.fill(0);
    base();
    // 1. The cocoon's back and mid chips.
    swarm(t);
    lanes(false, t);
    drawChips(1, 2);
    pumps(t);
    // Plates by fit: their jigs (the nearest to contact first), guideways.
    for (let k = 0; k < P; k += 1) {
      const p = L.order[k];
      if (L.kind[p] < 0) continue;
      const plate = all[p];
      const F = plate.fit;
      if (t >= plate.spawn && t < F + SW.overshoot) {
        const lambda = lambdaAt(p, t);
        if (lambda !== 0 && jigs < JIGS && L.kind[p] !== 3) {
          setJig(p, lambda, TOUCH ? 0 : hingeAt(p, t, lambda));
          jigged[p] = 1;
          jigs += 1;
        } else flat(p);
      } else flat(p);
      // 2. The guideway, built on the body from the toe tips up (owner,
      // 2026-10-16) ahead of its plate, which then slams onto it.
      if (t < L.buildA[p] || t >= F || plate.end <= plate.first || !L.hasBox[p]) continue;
      if (TOUCH && conduits >= 4) continue;
      conduits += 1;
      buildGuideway(p, t);
    }
    if (pulsePreCount) {
      flight.globalAlpha = 0.75;
      flight.fillStyle = "#d8f8ff";
      cellRects(pulsesPre, pulsePreCount, 0.55);
    }
    if (headCount) {
      // The laser-weld heads: an ice halo two cells deep, a white-hot core
      // of dots at the very front.
      flight.globalAlpha = 0.32;
      flight.fillStyle = "#8cefff";
      cellRects(heads, headCount, 1.15);
      flight.globalAlpha = 0.95;
      flight.fillStyle = "#f6feff";
      cellRects(cores, coreCount, 0.6);
    }
    if (laserCount) {
      // The latch's laser to its head.
      flight.globalAlpha = 0.32;
      flight.strokeStyle = "#a6f2ff";
      flight.lineWidth = Math.max(0.8, 0.6 * s);
      flight.beginPath();
      for (let k = 0; k < laserCount; k += 1) {
        const o = k * 4;
        flight.moveTo(lasers[o], lasers[o + 1]);
        flight.lineTo(lasers[o + 2], lasers[o + 3]);
      }
      flight.stroke();
    }
    // 3. Contact shadows of the lifted plates (desktop).
    if (silhouette)
      for (let p = 0; p < P; p += 1) {
        if (!jigged[p] || lam[p] <= 0.02 || all[p].fit <= t) continue;
        const lift = L.lift[p] * 0.45 * lam[p];
        flight.setTransform(1, 0, 0, 1, ox + 0.35 * lift * s, oy + 0.6 * lift * s);
        flight.save();
        flight.beginPath();
        const first = L.tileFirst[p];
        const end = L.tileFirst[p + 1];
        let landed = 0;
        for (let i = first; i < end; i += 1) {
          if (L.land[i] > t) continue;
          const tile = all[p].tiles[i - first];
          flight.rect(tile.dx * s, tile.dy * s, tile.tw * s, tile.th * s);
          landed += 1;
        }
        if (landed) {
          flight.clip();
          flight.globalAlpha = 0.38;
          plateDraw(silhouette, p, 0, 0);
        }
        flight.restore();
      }
    base();
    flight.globalAlpha = 1;
  };

  // A tile's flight (N4, N5): lane from the gate, orbit to aim, dive and
  // unfold. Writes PX, PY (figure px) and returns the stage's frame data
  // through the scratch below.
  let poseSize = 0;
  let poseFrame = 0;
  let poseUnfold = -1;
  let poseAlpha = 1;
  const tilePose = (p: number, i: number, u: number, Cx: number, Cy: number, helm: boolean) => {
    const nx = L.nX[p];
    const ny = L.nY[p];
    const qx = -ny;
    const qy = nx;
    const hx = Cx + nx * 10;
    const hy = Cy + ny * 10;
    const r0 = L.r0[i];
    const psi0 = L.psi0[i];
    const spin = (FRAMES * L.spin[i] * FLIGHT) / 1000;
    let size = L.size[i];
    let frame = L.f0[i];
    poseUnfold = -1;
    poseAlpha = Math.min(1, u * 8);
    const aim = helm ? 0.7 : 0.8;
    if (helm && u < aim) {
      // N10: the helmet's tiles leave the crown spiralling inward.
      const v = u / aim;
      const e = easeOut(v);
      const a = psi0 + 3 * Math.PI * v;
      const R = (122 + 36 * L.bow[i]) * (1 - e);
      const cx = VISOR_X + (hx - VISOR_X) * e;
      const cy = crownCentreY + (hy - crownCentreY) * e;
      PX = cx + R * Math.cos(a);
      PY = cy + CROWN_SQUASH * R * Math.sin(a);
      frame += spin * 2 * u;
    } else if (u < 0.55) {
      const v = smooth(u / 0.55);
      const w = 1 - v;
      const p0x = L.gateX[p] + 6 * L.jx[i];
      const p0y = L.gateY[p] + 6 * L.jy[i];
      const ex = hx + r0 * (Math.cos(psi0) * qx + 0.45 * Math.sin(psi0) * nx);
      const ey = hy + r0 * (Math.cos(psi0) * qy + 0.45 * Math.sin(psi0) * ny);
      const bow = L.bow[i] * 0.05 * H;
      const p1x = p0x + (ex - p0x) * 0.35 + qx * bow;
      const p1y = p0y + (ey - p0y) * 0.35 + qy * bow;
      const p2x = ex + nx * 0.02 * H;
      const p2y = ey + ny * 0.02 * H;
      PX = w * w * w * p0x + 3 * w * w * v * p1x + 3 * w * v * v * p2x + v * v * v * ex;
      PY = w * w * w * p0y + 3 * w * w * v * p1y + 3 * w * v * v * p2y + v * v * v * ey;
      frame += spin * 3 * u;
    } else if (u < 0.8) {
      const w = (u - 0.55) / 0.25;
      const psi = psi0 + 1.5 * Math.PI * w;
      const r = r0 * (1 - w) ** 1.5;
      PX = hx + r * (Math.cos(psi) * qx + 0.45 * Math.sin(psi) * nx);
      PY = hy + r * (Math.cos(psi) * qy + 0.45 * Math.sin(psi) * ny);
      size *= 1 + 0.25 * Math.sin(psi);
      frame += spin * (3 * 0.55 + 1.5 * (u - 0.55));
    } else {
      const w = (u - aim) / (1 - aim);
      const w4 = w * w * w * w;
      PX = hx + (Cx - hx) * w4;
      PY = hy + (Cy - hy) * w4;
      // The frame eases to the face-on lock pose by the shortest way.
      const raw = frame + spin * (3 * 0.55 + 1.5 * 0.25 + (u - 0.8));
      let d = (raw % FRAMES) + (raw < 0 ? FRAMES : 0);
      if (d > FRAMES / 2) d -= FRAMES;
      frame = d * (1 - w) * (1 - w);
      if (w >= 0.3) {
        poseUnfold = Math.min(6, Math.floor((w - 0.3) * 10));
        const full = T * (32 / 28) * (0.6 + 0.4 * L.cov[i]);
        size += (full - size) * ((w - 0.3) / 0.7);
      }
    }
    if (u >= 0.86) poseAlpha *= 1 - (u - 0.86) / 0.14;
    poseSize = size;
    poseFrame = wrap(frame);
  };

  const forming = (p: number, t: number) => {
    const plate = all[p];
    if (L.kind[p] < 0) return;
    const helm = L.kind[p] === 3;
    const F = plate.fit;
    const first = L.tileFirst[p];
    const end = L.tileFirst[p + 1];
    const tiles = plate.tiles;
    const staged = jigged[p] === 1;
    // The staged plate: lattice, walls and the landed metal, under its jig.
    applyJig(p);
    if (lattice && staged && !governed && t >= F - SW.lattice[0] && t < F - SW.lattice[1]) {
      const span = (t - F + SW.lattice[0]) / (SW.lattice[0] - SW.lattice[1]);
      const fade = span > 0.8 ? (1 - span) / 0.2 : 1;
      flight.save();
      flight.beginPath();
      flight.arc(
        L.seatX[p] * s,
        L.seatY[p] * s,
        Math.max(1, L.reach[p] * easeOut(span * 1.6) * s),
        0,
        TAU,
      );
      flight.clip();
      flight.globalAlpha = 0.9 * fade;
      plateDraw(lattice, p, 0, 0);
      flight.restore();
    }
    flight.save();
    flight.beginPath();
    let landed = 0;
    for (let i = first; i < end; i += 1) {
      if (L.land[i] > t) continue;
      const tile = tiles[i - first];
      const x0 = Math.round(tile.dx * s);
      const y0 = Math.round(tile.dy * s);
      flight.rect(
        x0,
        y0,
        Math.round((tile.dx + tile.tw) * s) - x0,
        Math.round((tile.dy + tile.th) * s) - y0,
      );
      landed += 1;
    }
    if (landed) {
      flight.clip();
      if (silhouette && staged && lam[p] > 0.02) {
        flight.globalAlpha = 0.9;
        plateDraw(silhouette, p, 0.8, 1);
        plateDraw(silhouette, p, 1.6, 2);
      }
      flight.globalAlpha = 1;
      plateDraw(metal, p, 0, 0);
    }
    flight.restore();
    // As it swings down onto its seat, its conduit prints onto it.
    if (t >= F - SW.print[0] && (!TOUCH || conduits < 4)) {
      if (TOUCH) conduits += 1;
      drawConduit(p, t, false);
    }
    base();
    // The flights: chips, comets, unfold; metal tiles fade in over them.
    fadeCount = 0;
    const o = p * 6;
    const a00 = jig[o];
    const a10 = jig[o + 1];
    const a01 = jig[o + 2];
    const a11 = jig[o + 3];
    const ex = (jig[o + 4] - ox) / s;
    const ey = (jig[o + 5] - oy) / s;
    const bu = p * 2;
    for (let i = first; i < end; i += 1) {
      const since = t - L.land[i];
      const u = (since + FLIGHT) / FLIGHT;
      if (u <= 0) continue;
      const Cx = a00 * L.cx[i] + a01 * L.cy[i] + ex;
      const Cy = a10 * L.cx[i] + a11 * L.cy[i] + ey;
      if (u >= 1) {
        // N6: lock recoil, sparks and the lattice link.
        if (since >= SW.link) continue;
        if (
          !TOUCH &&
          !governed &&
          since < SW.recoil &&
          L.tflags[i] & 4 &&
          fadeCount < fades.length
        ) {
          fades[fadeCount] = i;
          fadeA[fadeCount] = -since / SW.recoil;
          fadeCount += 1;
        }
        if (L.tflags[i] & 2 && since < SW.spark && sparkCount < SPARKS) {
          const so = sparkCount * 4;
          sparks[so] = (Cx - L.nX[p] * T * 0.5) * s;
          sparks[so + 1] = (Cy - L.nY[p] * T * 0.5) * s;
          sparks[so + 2] = Math.min(3, Math.floor((4 * since) / SW.spark));
          sparks[so + 3] = 1.6 * T * s;
          sparkCount += 1;
        }
        const parent = L.parent[i];
        if (parent >= 0 && linkCount < LINKS && !TOUCH) {
          const lo = linkCount * 5;
          links[lo] = Cx * s;
          links[lo + 1] = Cy * s;
          links[lo + 2] = (a00 * L.cx[parent] + a01 * L.cy[parent] + ex) * s;
          links[lo + 3] = (a10 * L.cx[parent] + a11 * L.cy[parent] + ey) * s;
          links[lo + 4] = 1 - since / SW.link;
          linkCount += 1;
        }
        continue;
      }
      tilePose(p, i, u, Cx, Cy, helm);
      const x = PX * s;
      const y = PY * s;
      const tone = L.tone[i];
      if (L.tflags[i] & 1 && u < 0.55 && !TOUCH && !governed) {
        // N7: the comet from the chip's velocity (24 ms back).
        const savedSize = poseSize;
        const savedFrame = poseFrame;
        const savedAlpha = poseAlpha;
        const savedUnfold = poseUnfold;
        tilePose(p, i, u - 24 / FLIGHT, Cx, Cy, helm);
        const vx = x - PX * s;
        const vy = y - PY * s;
        poseSize = savedSize;
        poseFrame = savedFrame;
        poseAlpha = savedAlpha;
        poseUnfold = savedUnfold;
        comet(x, y, vx, vy, tone, poseAlpha);
      }
      if (poseUnfold >= 0 && tone < 3) unfold(x, y, poseSize * s, poseUnfold, tone, poseAlpha);
      else chip(x, y, poseSize * s, poseFrame, tone, poseAlpha, u >= 0.9);
      if (u >= 0.86 && fadeCount < fades.length) {
        fades[fadeCount] = i;
        fadeA[fadeCount] = (u - 0.86) / 0.14;
        fadeCount += 1;
      }
      // N9: the beam from the latch to the two tiles nearest lock.
      if (u >= 0.8 && !TOUCH) {
        if (u > beamU[bu]) {
          beamU[bu + 1] = beamU[bu];
          beams[bu * 2 + 2] = beams[bu * 2];
          beams[bu * 2 + 3] = beams[bu * 2 + 1];
          beamU[bu] = u;
          beams[bu * 2] = x;
          beams[bu * 2 + 1] = y;
        } else if (u > beamU[bu + 1]) {
          beamU[bu + 1] = u;
          beams[bu * 2 + 2] = x;
          beams[bu * 2 + 3] = y;
        }
      }
    }
    if (!fadeCount) return;
    // The metal tiles fading in, and the recoil's pop, on the staged plate.
    applyJig(p);
    for (let k = 0; k < fadeCount; k += 1) {
      if (draws >= BUDGET) break;
      const i = fades[k];
      const tile = tiles[i - first];
      const a = fadeA[k];
      draws += 1;
      if (a >= 0) {
        flight.globalAlpha = a;
        flight.drawImage(
          metal,
          tile.sx,
          tile.sy,
          tile.tw,
          tile.th,
          tile.dx * s,
          tile.dy * s,
          tile.tw * s,
          tile.th * s,
        );
      } else {
        const tau = -a;
        const k2 = 1 + 0.14 * Math.exp(-5 * tau) * Math.cos(9.4 * tau);
        const w = tile.tw * s * k2;
        const h = tile.th * s * k2;
        flight.globalAlpha = 1;
        flight.drawImage(
          metal,
          tile.sx,
          tile.sy,
          tile.tw,
          tile.th,
          (tile.dx + tile.tw / 2) * s - w / 2,
          (tile.dy + tile.th / 2) * s - h / 2,
          w,
          h,
        );
      }
    }
    base();
    flight.globalAlpha = 1;
  };

  const seat = (p: number, t: number) => {
    const plate = all[p];
    const F = plate.fit;
    if (
      L.kind[p] >= 0 &&
      L.kind[p] !== 3 &&
      (t < F + SW.overshoot || (L.kind[p] === 2 && t < F + SW.sway))
    ) {
      const lambda = lambdaAt(p, t);
      setJig(p, lambda, TOUCH ? 0 : hingeAt(p, t, lambda), TOUCH ? 0 : swayAt(p, t));
      applyJig(p);
    }
    const paintEnd = F + SW.paint[0] + (L.kind[p] === 3 ? SW.paint[2] : SW.paint[1]);
    flight.globalAlpha = 1;
    if (L.kind[p] < 0 || t >= paintEnd) {
      plateDraw(source, p, 0, 0);
      return;
    }
    const first = L.tileFirst[p];
    const end = L.tileFirst[p + 1];
    const tiles = plate.tiles;
    // A6: metal where the paint has not reached, the painted art behind it.
    for (let pass = 0; pass < 2; pass += 1) {
      flight.save();
      flight.beginPath();
      let any = false;
      for (let i = first; i < end; i += 1) {
        if (pass === 0 ? L.tp[i] <= t : L.tp[i] > t) continue;
        const tile = tiles[i - first];
        const x0 = Math.round(tile.dx * s);
        const y0 = Math.round(tile.dy * s);
        flight.rect(
          x0,
          y0,
          Math.round((tile.dx + tile.tw) * s) - x0,
          Math.round((tile.dy + tile.th) * s) - y0,
        );
        any = true;
      }
      if (any) {
        flight.clip();
        plateDraw(pass === 0 ? metal : source, p, 0, 0);
      }
      flight.restore();
    }
    // The lacquer front: the paint's newest tiles in nanite light.
    if (TOUCH || governed) return;
    flight.save();
    flight.beginPath();
    let any = false;
    for (let i = first; i < end; i += 1) {
      const age = t - L.tp[i];
      if (age < 0 || age >= SW.lacquer) continue;
      const tile = tiles[i - first];
      flight.rect(tile.dx * s, tile.dy * s, tile.tw * s, tile.th * s);
      any = true;
    }
    if (any) {
      flight.clip();
      flight.globalAlpha = 0.32;
      plateDraw(sheet, p, 0, 0);
    }
    flight.restore();
    flight.globalAlpha = 1;
  };
  const unseat = () => {
    if (transformed) base();
  };
  const conduit = (p: number, t: number) => {
    if (t < all[p].fit || L.kind[p] < 0) return;
    if (TOUCH && conduits >= 4) return;
    conduits += 1;
    // It rides its seated plate's ring-out and sway.
    const F = all[p].fit;
    const moving =
      L.kind[p] !== 3 && (t < F + SW.overshoot || (L.kind[p] === 2 && t < F + SW.sway));
    if (moving) {
      const lambda = lambdaAt(p, t);
      setJig(p, lambda, TOUCH ? 0 : hingeAt(p, t, lambda), TOUCH ? 0 : swayAt(p, t));
      applyJig(p);
    }
    drawConduit(p, t, true);
    if (moving) base();
  };

  // A loop's sub-path between arc lengths a < b (0 ≤ a, b ≤ its length).
  const subPath = (loop: number, a: number, b: number) => {
    const start = L.loopStart[loop];
    const n = L.loopN[loop];
    let lo = start;
    let hi = start + n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (L.cum[mid] <= a) lo = mid;
      else hi = mid - 1;
    }
    let k = lo;
    const span = L.cum[k + 1] - L.cum[k] || 1;
    const f = (a - L.cum[k]) / span;
    flight.moveTo(
      (L.px[k] + (L.px[k + 1] - L.px[k]) * f) * s,
      (L.py[k] + (L.py[k + 1] - L.py[k]) * f) * s,
    );
    k += 1;
    while (k < start + n && L.cum[k] < b) {
      flight.lineTo(L.px[k] * s, L.py[k] * s);
      k += 1;
    }
    const j = Math.min(k, start + n) - 1;
    const span2 = L.cum[j + 1] - L.cum[j] || 1;
    const f2 = Math.min(1, (b - L.cum[j]) / span2);
    flight.lineTo(
      (L.px[j] + (L.px[j + 1] - L.px[j]) * f2) * s,
      (L.py[j] + (L.py[j + 1] - L.py[j]) * f2) * s,
    );
  };
  const seamPass = (t: number, heads: boolean) => {
    flight.beginPath();
    let any = false;
    for (let p = 0; p < P; p += 1) {
      const F = all[p].fit;
      if (L.kind[p] < 0 || t < F || t >= F + SW.seam) continue;
      const tau = (t - F) / SW.seam;
      for (let l = L.loopFirst[p]; l < L.loopFirst[p + 1]; l += 1) {
        const len = L.loopLen[l];
        if (len <= 0) continue;
        const h = (tau * len) / 2;
        const trail = heads ? 0.03 * len : 0.15 * len;
        subPath(l, Math.max(0, h - trail), h);
        subPath(l, len - h, Math.min(len, len - h + trail));
        any = true;
      }
    }
    if (any) flight.stroke();
  };

  const after = (t: number) => {
    base();
    // 5. Seams (A4): two heads round the real outline, then an afterglow.
    flight.lineCap = "round";
    flight.lineJoin = "round";
    flight.strokeStyle = "#8cefff";
    flight.globalAlpha = 0.18;
    flight.lineWidth = Math.max(3, 4.5 * s * 0.8);
    seamPass(t, false);
    flight.globalAlpha = 0.6;
    flight.lineWidth = Math.max(1, 1.3 * s * 0.8);
    seamPass(t, false);
    flight.strokeStyle = "#f2fcff";
    flight.globalAlpha = 0.95;
    flight.lineWidth = Math.max(1.5, 2.6 * s * 0.8);
    seamPass(t, true);
    flight.strokeStyle = "#8cefff";
    flight.lineWidth = Math.max(1, s * 0.8);
    for (let p = 0; p < P; p += 1) {
      const F = all[p].fit;
      const tau = (t - F - SW.seam) / SW.seamGlow;
      if (L.kind[p] < 0 || tau < 0 || tau >= 1) continue;
      flight.globalAlpha = 0.35 * (1 - tau);
      flight.beginPath();
      for (let l = L.loopFirst[p]; l < L.loopFirst[p + 1]; l += 1)
        if (L.loopLen[l] > 0) subPath(l, 0, L.loopLen[l]);
      flight.stroke();
    }
    // Shock rings (A5) on the spark plates, in the plate's plane.
    let rings = 0;
    for (let k = 0; k < P && rings < (TOUCH ? 2 : 6); k += 1) {
      const p = L.order[k];
      const F = all[p].fit;
      if (!(L.flags[p] & 2) || L.kind[p] < 0 || t < F || t >= F + SW.shock) continue;
      if (TOUCH && heroes >= HEROES) break;
      const tau = (t - F) / SW.shock;
      const frame = Math.min(KIT_FX.shock.frames - 1, Math.floor(tau * KIT_FX.shock.frames));
      const k2 = (L.shockW[p] * s) / KIT_FX.shock.w;
      const angle = Math.atan2(L.nY[p], L.nX[p]) - Math.PI / 2;
      const cos = Math.cos(angle) * k2;
      const sin = Math.sin(angle) * k2;
      flight.setTransform(cos, sin, -sin, cos, L.seatX[p] * s + ox, L.seatY[p] * s + oy);
      flight.globalAlpha = 0.4;
      draws += 1;
      flight.drawImage(
        fxImage,
        KIT_FX.shock.x + KIT_FX.shock.w * (frame % KIT_FX.shock.cols),
        KIT_FX.shock.y + KIT_FX.shock.h * Math.floor(frame / KIT_FX.shock.cols),
        KIT_FX.shock.w,
        KIT_FX.shock.h,
        -KIT_FX.shock.centre[0],
        -KIT_FX.shock.centre[1],
        KIT_FX.shock.w,
        KIT_FX.shock.h,
      );
      rings += 1;
      if (TOUCH) heroes += 1;
    }
    base();
    // Spall: chips flung from the contact.
    for (let p = 0; p < P; p += 1) {
      const F = all[p].fit;
      if (L.kind[p] < 0 || t < F || t >= F + SW.spall) continue;
      const tau = (t - F) / SW.spall;
      const count = L.flags[p] & 4 ? 14 : L.flags[p] & 1 ? 10 : 6;
      const nx = L.nX[p];
      const ny = L.nY[p];
      for (let c = 0; c < count; c += 1) {
        const h = hash(p * 31 + c, 4099);
        const side = c % 2 ? 1 : -1;
        const speed = 40 + 30 * h;
        const vx = -ny * side * speed + nx * 20 * (0.5 + h);
        const vy = nx * side * speed + ny * 20 * (0.5 + h);
        const x = (L.seatX[p] + vx * tau) * s;
        const y = (L.seatY[p] + vy * tau + 60 * tau * tau) * s;
        const fade = (1 - tau) * (1 - tau);
        chip(x, y, (6 + 3 * h) * s * 0.7, wrap(FRAMES * h + 72 * tau), c % 3 ? WHITE : ICE, fade);
      }
    }
    // N6: sparks at the leading edges; the guideways' weld heads (frames
    // 4–5: a star over a white-hot glow, the white bokeh).
    for (let k = 0; k < sparkCount; k += 1) {
      if (draws >= BUDGET || (TOUCH && heroes >= HEROES)) break;
      const o = k * 4;
      const d = sparks[o + 3];
      let frame = sparks[o + 2];
      if (frame >= 4) {
        frame -= 4;
        if (!TOUCH) {
          const g = d * 1.25;
          flight.globalAlpha = 0.75;
          draws += 1;
          flight.drawImage(
            cellsImage,
            BOKEH_X[WHITE],
            BOKEH_Y[WHITE],
            32,
            32,
            sparks[o] - g / 2,
            sparks[o + 1] - g / 2,
            g,
            g,
          );
        }
      }
      flight.globalAlpha = 0.9;
      draws += 1;
      if (TOUCH) heroes += 1;
      flight.drawImage(
        cellsImage,
        KIT_CELLS.spark.x + 32 * frame,
        KIT_CELLS.spark.y,
        32,
        32,
        sparks[o] - d / 2,
        sparks[o + 1] - d / 2,
        d,
        d,
      );
    }
    // N6: the lattice links, by fading alpha bucket; N9: the beams.
    flight.strokeStyle = "#9ff1ff";
    flight.lineWidth = Math.max(0.8, 0.8 * s * 0.8);
    for (let bucket = 0; bucket < 3; bucket += 1) {
      flight.beginPath();
      let any = false;
      for (let k = 0; k < linkCount; k += 1) {
        const o = k * 5;
        const v = links[o + 4];
        if ((v > 0.66 ? 0 : v > 0.33 ? 1 : 2) !== bucket) continue;
        flight.moveTo(links[o], links[o + 1]);
        flight.lineTo(links[o + 2], links[o + 3]);
        any = true;
      }
      if (!any) continue;
      flight.globalAlpha = 0.6 * (bucket === 0 ? 0.85 : bucket === 1 ? 0.5 : 0.2);
      flight.stroke();
    }
    if (!TOUCH) {
      flight.beginPath();
      let any = false;
      for (let p = 0; p < P; p += 1) {
        for (let b = 0; b < 2; b += 1) {
          if (beamU[p * 2 + b] < 0.8) continue;
          flight.moveTo(L.seatX[p] * s, L.seatY[p] * s);
          flight.lineTo(beams[p * 4 + b * 2], beams[p * 4 + b * 2 + 1]);
          any = true;
        }
      }
      if (any) {
        flight.globalAlpha = 0.35;
        flight.lineWidth = Math.max(0.8, 0.8 * s * 0.8);
        flight.stroke();
      }
    }
    // G2: pulses on the conduits.
    if (pulsePostCount) {
      flight.globalAlpha = 0.7;
      flight.fillStyle = "#d8f8ff";
      cellRects(pulsesPost, pulsePostCount, 0.5);
    }
    // 6. Latches (A1) and clamps (G3).
    for (let p = 0; p < P; p += 1) {
      if (L.kind[p] < 0) continue;
      const plate = all[p];
      const F = plate.fit;
      const accent = (L.flags[p] & 1) !== 0;
      if (t >= F - SW.project && t < F + 120) {
        const a = t - F + SW.project;
        const grow = smooth(a / 40);
        let alpha = grow * (t > F + 40 ? 1 - (t - F - 40) / 80 : 1);
        const frame =
          t < F - SW.seat
            ? Math.floor(a / 40) % 6
            : t < F
              ? 6 + Math.min(5, Math.floor(((t - F + SW.seat) / SW.seat) * 6))
              : 11;
        const d = L.latchW[p] * (0.6 + 0.4 * grow) * s;
        const x = L.seatX[p] * s;
        const y = L.seatY[p] * s;
        if (TOUCH && !(accent && heroes < HEROES)) {
          flight.globalAlpha = alpha * 0.8;
          flight.strokeStyle = "#8cefff";
          flight.lineWidth = 1.2;
          flight.beginPath();
          flight.arc(x, y, d * 0.32, 0, TAU);
          flight.stroke();
        } else if (draws < BUDGET) {
          if (TOUCH) heroes += 1;
          alpha = Math.min(1, alpha);
          flight.globalAlpha = alpha;
          draws += 1;
          flight.drawImage(
            fxImage,
            KIT_FX.latch.x + KIT_FX.latch.cell * frame,
            KIT_FX.latch.y,
            KIT_FX.latch.cell,
            KIT_FX.latch.cell,
            x - d / 2,
            y - d / 2,
            d,
            d,
          );
        }
      }
      if (!L.hasBox[p] || plate.end <= plate.first) continue;
      const release = plate.to + SW.release[0];
      if (t < F - SW.clamp[0] || t >= plate.to + SW.release[1]) continue;
      // G3 (owner, 2026-10-16: nothing descends onto the body): each clamp
      // slides in along the surface from beyond its corner in its rest pose,
      // bites as the plate lands, holds, and slides back out as it releases.
      let frame = 11;
      let alpha = 1;
      let drift = 0;
      if (t < F - SW.clamp[1]) {
        const u = (t - F + SW.clamp[0]) / (SW.clamp[0] - SW.clamp[1]);
        frame = 7;
        drift = 1.1 * (1 - easeOut(u));
        alpha = smooth(u * 2.5);
      } else if (t < F - SW.clamp[2]) frame = 7;
      else if (t < F + SW.clamp[2])
        frame = 8 + Math.min(3, Math.floor(((t - F + SW.clamp[2]) / (2 * SW.clamp[2])) * 4));
      else if (t >= release) {
        const u = (t - release) / (SW.release[1] - SW.release[0]);
        frame = u < 0.3 ? 11 - Math.min(3, Math.floor((u / 0.3) * 4)) : 7;
        alpha = 1 - smooth(u);
        drift = 1.1 * u * u;
      }
      const b = p * 4;
      const bx = L.box[b];
      const by = L.box[b + 1];
      const bw = L.box[b + 2];
      const bh = L.box[b + 3];
      const cw = L.clampW[p];
      const d = cw * s;
      const scale = d / KIT_FX.clamp.cell;
      for (let corner = 0; corner < 4; corner += 1) {
        const right = corner & 1;
        const bottom = corner >> 1;
        const cx = (bx + right * bw + (right ? 1 : -1) * drift * cw) * s;
        const cy = (by + bottom * bh + (bottom ? 1 : -1) * drift * cw) * s;
        if (TOUCH) {
          flight.globalAlpha = alpha * 0.9;
          flight.strokeStyle = "#ffd27a";
          flight.lineWidth = 1.2;
          const arm = d * 0.33;
          const sx = right ? 1 : -1;
          const sy = bottom ? 1 : -1;
          flight.beginPath();
          flight.moveTo(cx - sx * arm, cy + sy * 1.5);
          flight.lineTo(cx + sx * 1.5, cy + sy * 1.5);
          flight.lineTo(cx + sx * 1.5, cy - sy * arm);
          flight.stroke();
          continue;
        }
        if (draws >= BUDGET) break;
        draws += 1;
        flight.globalAlpha = alpha;
        flight.drawImage(
          fxImage,
          KIT_FX.clamp.x + KIT_FX.clamp.cell * frame,
          KIT_FX.clamp.y + KIT_FX.clamp.cell * CORNER_ROW[corner],
          KIT_FX.clamp.cell,
          KIT_FX.clamp.cell,
          cx - ANCHOR[corner * 2] * scale,
          cy - ANCHOR[corner * 2 + 1] * scale,
          d,
          d,
        );
      }
    }
    // 7. G6: the molten band, droplets at its head; G7: chips off the
    // receding front.
    let drops = 0;
    let rising = 0;
    if (!TOUCH)
      for (let p = 0; p < P; p += 1) {
        const plate = all[p];
        if (L.kind[p] < 0 || plate.end <= plate.first) continue;
        if (t < plate.from || t >= plate.to + SW.recede + 120) continue;
        const bandFrom = firstLockAfter(p, t - SW.molten);
        const bandTo = firstLockAfter(p, t);
        if (molten && bandTo > bandFrom) {
          flight.save();
          cellClip(bandFrom, bandTo);
          flight.globalAlpha = 1;
          plateDraw(molten, p, 0, 0);
          flight.restore();
        }
        for (let i = firstLockAfter(p, t - SW.droplet); i < bandTo && drops < 160; i += 1) {
          if (draws >= BUDGET) break;
          if (i & 1) continue;
          const age = t - gold.lock[i];
          let dx = -gold.ox[i];
          let dy = -gold.oy[i];
          const dl = Math.hypot(dx, dy) || 1;
          dx /= dl;
          dy /= dl;
          const x = (gold.fx[i] + gold.cw[i] / 2 + dx * G * 0.4) * s;
          const y = (gold.fy[i] + gold.ch[i] / 2 + dy * G * 0.4) * s;
          drops += 1;
          draws += 1;
          if (age < 18) {
            const e = age < 6 ? 2 : age < 12 ? 1 : 0;
            let a = Math.round(Math.atan2(dy, dx) / (Math.PI / 8)) % 8;
            if (a < 0) a += 8;
            const d = 1.4 * G * 1.4 * s;
            flight.globalAlpha = 0.95;
            flight.drawImage(
              fxImage,
              KIT_FX.drop.x + KIT_FX.drop.cell * a,
              KIT_FX.drop.y + KIT_FX.drop.cell * e,
              KIT_FX.drop.cell,
              KIT_FX.drop.cell,
              x - d / 2,
              y - d / 2,
              d,
              d,
            );
          } else {
            const d = 1.4 * G * 1.25 * s;
            const frame = Math.floor((age - 18) / 2) % KIT_CELLS.bead.frames;
            flight.globalAlpha = 0.9 * (1 - (age - 18) / (SW.droplet - 18));
            flight.drawImage(
              cellsImage,
              KIT_CELLS.bead.x + 32 * frame,
              KIT_CELLS.bead.y,
              32,
              32,
              x - d / 2,
              y - d / 2,
              d,
              d,
            );
          }
        }
        // One in four cells at the receding front lifts off as a gold chip.
        const from = firstLockAfter(p, t - SW.recede - 120);
        const to = firstLockAfter(p, t - SW.recede);
        for (let i = from; i < to && rising < 120; i += 1) {
          if ((i * 2654435761) >>> 30 !== 0) continue;
          const u = (t - SW.recede - gold.lock[i]) / 120;
          const h = hash(i, 5003);
          const x = (gold.fx[i] + gold.cw[i] / 2) * s;
          const y = (gold.fy[i] + gold.ch[i] / 2 - (6 + 4 * h) * u) * s;
          rising += 1;
          chip(x, y, 3.6 * s, wrap(FRAMES * h + 30 * u), GOLD_TONE, 0.8 * (1 - u));
        }
      }
    // 8. The front chips, the crown and the free chips (their bands).
    lanes(true, t);
    drawChips(3, 5);
    if (TOUCH) flushRects();
    flight.globalAlpha = 1;
    flight.lineWidth = 1;
    base();
  };

  return {
    before,
    forming,
    seat,
    unseat,
    conduit,
    after,
    cost: (ms: number) => {
      // The first frames upload the layers; judge the steady state.
      if (TOUCH || frames < 8 || governed) return;
      slow = ms > 10 ? slow + 1 : 0;
      if (slow >= 2) governed = true;
    },
    drawn: () => draws,
    governed: () => governed,
  };
}
