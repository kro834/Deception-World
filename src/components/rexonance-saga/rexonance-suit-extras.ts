import {
  REXONANCE_SUIT_ACCENTS,
  REXONANCE_SUIT_DRIVER,
  REXONANCE_SUIT_SPARKS,
  REXONANCE_SUIT_SWARM,
  REXONANCE_SUIT_SWARM_LIFE,
} from "@/lib/rexonance-calls";
import {
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_GOLD_ATLAS,
  REXONANCE_SUIT_MARKS,
} from "@/lib/rexonance-suit";
import { REXONANCE_NANITES } from "@/lib/rexonance-nanites";
import {
  naniteGuideRow,
  naniteMetalRow,
  naniteMoltenRow,
  type NanitePixelJob,
} from "@/lib/rexonance-unlit.js";
import {
  releaseRexonanceNaniteSources,
  rexonanceNaniteSource,
} from "@/lib/rexonance-nanites-warmup";
import { registerSuitExtras } from "./rexonance-suit-extras-hook";
import { createRexonanceCallRetention } from "@/lib/rexonance-call-retention";
import {
  rexonanceSuitSource,
  isRexonancePreparationSuspended,
  registerRexonancePreparationRelease,
} from "@/lib/rexonance-suit-warmup";
import { reactorCoilAngle, reactorCoilScale } from "@/lib/rexonance-reactor.js";
import {
  NANITE_FIRE_PHASES,
  naniteMaterialLanding,
  sampleFlameBirth,
} from "@/lib/rexonance-ignition.js";
import { REXONANCE_SUIT_REVEAL_MS } from "@/lib/rexonance-calls";
import {
  FIG,
  FLIGHT,
  FLIGHT_SPREAD,
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

   - The continuous body fire releases material from the same sampled skin
     surface used by the flame field. Its airborne fragments open into
     connected helical currents, then contract into anatomy-following
     streams; neighbouring machines align, fuse into thicker cells and
     laminate each plate locally. The helmet's material hugs the face
     instead of circling above it; unused material feeds the reactor at seal.
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
   the plan's tiles, fits and gold locks are unchanged; only the earliest
   tile-growth window is compressed until after the flame clears. Preparation runs in
   its own idle slices after the plan (prepareRexonanceNanites); the call
   decides once, at its start, whether to draw it. The draw passes write
   typed arrays only and allocate nothing; no timers, randomness, filters or
   composite operations. Touch screens draw the swarm as two-tone rects with
   a few hero sprites, and only metal and hologram layers are prepared. */

const SW = REXONANCE_SUIT_SWARM;
const LIFE = REXONANCE_SUIT_SWARM_LIFE;
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
const ART_W = REXONANCE_SUIT_ATLAS.width / 2;
const ART_H = REXONANCE_SUIT_ATLAS.height;
const RINGS = 8;
// Material starts in the explosion at 468ms. Early boot growth
// starts at 528ms, while all authored final fitting clocks stay pinned.
const FIRE_BIRTH = NANITE_FIRE_PHASES.materialStart * 2400;
const FIRE_BIRTH_SPAN = 220;
const FIRE_SPRAY = 160;
// Airborne burning material precedes the machine, then cools into it at
// the very same coordinate. No machine, guide or raw plate precedes 468ms.
const FIREBRAND_START = NANITE_FIRE_PHASES.burstStart * 2400;
// Owner (2026-10-21): a longer, smoother handoff — the chip fades in over
// COOL and its carrier lingers to CARRIER (was 45 / 80).
const FIREBRAND_COOL = 72;
const FIREBRAND_CARRIER = 136;
// The docking's inertia (owner, 2026-10-21): a chip darts in and overshoots
// the insertion gap by this share of its stand before settling back on it.
const DOCK_BACK = 1.2;
const FIREBRANDS = TOUCH ? 8 : 24;
/** Cocoon chips (each drains into a plate) and free chips (they gather round
 * the reactor, then implode); more than the brief's 384 + 96 by design (see
 * REXONANCE_SUIT_SWARM). */

const COCOON = TOUCH ? 128 : 512;
const FREE = TOUCH ? 32 : 160;
const CHIPS = COCOON + FREE;
const FIREBRAND_STRIDE = Math.ceil(CHIPS / FIREBRANDS);
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
/** …and once the governor has tripped (round 3, review 40). */
const GOVERNED_BUDGET = 900;
const GOVERNED_JIGS = 6;

const JIGS = TOUCH ? 4 : 12;
/** The seat's swing takes this share of [F − seat, F]; it rings out past
 * the seat over the rest and is still at F (owner, 2026-10-16). */
const SLAM = 0.72;
// Armour is aligned on its hinge before the rail carriage seats it. These
// phases fit inside the existing call: the final compression still ends at F.
const RAIL_LEAD = 150;
const RAIL_ALIGN = 86;
const RAIL_INSERT = 22;
const RECEIVER_KEYS = 6;
const RECEIVER_COOL = 64;
const RECEIVER_PLATES = TOUCH ? 2 : 7;
/** Clamps (round 3): none on a gold box whose short side is under CLAMP_MIN
 * figure px, the lower pair under CLAMP_PAIR; on a box over CLAMP_HUGE times
 * the median area they bite the part's own outline. */
const CLAMP_MIN = 44;
const CLAMP_PAIR = 96;
const CLAMP_HUGE = 2.5;
/** Legibility (round 3, review 38): the back and mid chips dim to BUSY_DIM
 * over the gold box of a plate being staged or printed (a BUSY_W x BUSY_H
 * grid over the figure); at most LATCHES latches show at once (the next to
 * seat); the scaffold lattice at LATTICE_A; a lock spurs its lattice link
 * for LINK_MS. */
const BUSY_W = 32;
const BUSY_H = 58;
const BUSY_DIM = 0.28;
const LATCHES = 8;
const LATTICE_A = 0.54;
const LINK_MS = 40;
/** The defocused front band (review 50): only the nearest chips (z past
 * BOKEH_Z), at BOKEH_A, never over a plate being built. */
const BOKEH_Z = 0.95;
const BOKEH_A = 0.22;
/** The helmet's tiles land from here (ms): the crown's glow steps back. */
const HELM_LAND = 1700;

/** The free chips gather round the reactor over GATHER (ms), on orbits of
 * GATHER_R (+26, +52) figure px, squashed GATHER_SQUASH, turning GATHER_SPIN
 * a second; the implosion (SW.implode) then spirals them in. */
const GATHER = Float32Array.of(1790, 1960);
const GATHER_R = 92;
const GATHER_SQUASH = 0.42;
const GATHER_SPIN = 1.4;
/** …and white-hot on its near side from GATHER_HEAT ms into the gathering. */
const GATHER_HEAT = 80;

/** A clamp holding after its bite rests at this alpha until it releases. */

const CLAMP_HOLD = 0.5;

/** A top-down group's guideways: each plate's share of its group's build. */
const FIT_WINDOW = 0.3;

/** After the bite, the clamp's LED dims over this long (ms). */
const LED_MS = 60;

const HEROES = 24;
/** Lock flashes a frame (desktop). */
const LOCK_FLASHES = 32;
/** A chip's size relative to the swarm's base, from its hash: most
 * 0.78–1.12, the top 4.5% hero parts 1.45–1.75 (the scroll engine's
 * naniteSizeScale, inlined: the call's runtime loads no second engine). */
const sizeScale = (h0: number) => {
  const h = (h0 * 11.73) % 1;
  return h > 0.955 ? 1.45 + (0.3 * (h - 0.955)) / 0.045 : 0.78 + 0.34 * h * h;
};
/** Chips drawn per hex frame: mip and cell columns, tone rows. */
const MIP_X = Int16Array.from(KIT_CELLS.mip.x);
const MIP_Y = Int16Array.from(KIT_CELLS.mip.y);
const UNFOLD_X = Int16Array.from(KIT_CELLS.unfold.x);
const BOKEH_X = Int16Array.from(KIT_CELLS.bokeh.x);
const BOKEH_Y = Int16Array.from(KIT_CELLS.bokeh.y);
// By tone (ice, pink, white, gold): white streaks ice, gold its own row (review 32).
const COMET_ROW = Int8Array.from([
  KIT_COMETS.rows.ice,
  KIT_COMETS.rows.pink,
  KIT_COMETS.rows.ice,
  KIT_COMETS.rows.gold,
]);
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
// The weld head (owner, 2026-10-16: 滑らかに): a thin white-hot thread along
// the channel over an ice halo, tapering over its last cells behind the
// front, reaching smoothly into the next cell, with a soft glow at each
// growing tip; the laser's projection ahead of it feathers out.
const HEAD_CELLS = 2.6; // its length behind the front, in channel cells
const HEAD_CORE = 0.42; // widths, in gold cells
const HEAD_HALO = 1.3;
const HEAD_CORE_A = Float32Array.of(0.95, 0.6, 0.28);
const HEAD_HALO_A = Float32Array.of(0.3, 0.17, 0.07);
const HEAD_TIPS = 3; // glowing tips per plate (two soft sprites each)
const PROJECT_A = Float32Array.of(0.62, 0.3, 0.1);
const PROJECT_CELLS = 3;

const PULSE_CORE = 0.36;
// The molten band by age (REXONANCE_SUIT_SWARM.moltenAges): its newest
// cells white-hot, the next molten under a fading white heat, then molten
// fading into the painted gold below (each step: molten, then hot, alpha).
// Round 3: the band held opaque longer (the pinned grains lie under it).
const MOLTEN_A = Float32Array.of(0, 1, 0.92, 0.62);
const HOT_A = Float32Array.of(1, 0.5, 0, 0);
// The print head is quicker than the build's: a longer thread.
const PRINT_CELLS = 4;
// The molten band's head (round 3): its newest channel cells glow white-hot
// for HEAD_GLOW_MS (at most HEAD_GLOWS a plate); a droplet is an oriented
// drop until DROP_BEAD ms, then a bead (the last third of its life).
const HEAD_GLOW_MS = 10;
const HEAD_GLOWS = 10;
const DROP_BEAD = 8;
const EMBER_A = 0.38;

/** The weld head throws an ember every EMBER_EVERY ms; each flies EMBER_LIFE
 * ms (at most EMBERS in the air per guideway). */
const EMBER_EVERY = 14;
const EMBER_LIFE = 120;
const EMBERS = 9;
/** G5: the conduit's walls stand this deep (figure px) in parallax; a sheen
 * crosses it every SHEEN_MS. */
const WALL_DEPTH = 3;
const SHEEN_MS = 320;
// The swarm's phases, primed before any call (SuitExtras.prime): birth,
// the rings and rivers, the crown, its drain, the implosion.
const PRIME_T = Float32Array.of(605, 650, 900, 1300, 1650, 1820, 2050, 2140);
/** Tones: ice 0, pink 1, white 2, gold 3 (the sheet's rows). */
const ICE = 0;
const PINK = 1;
const WHITE = 2;
const GOLD_TONE = 3;
// Touch's two-tone rect chips: [tone, shade] per tone.
const RECT_TONES = ["#8cefff", "#ff8fd8", "#eefcff", "#ffd27a"] as const;
const RECT_SHADES = ["#1d4f63", "#5a2350", "#3a4a5a", "#6a4a12"] as const;
/** Their batches: four tones by three alpha levels. */
const RECT_ALPHA = Float32Array.of(0.3, 0.6, 0.9);
const RECT_BUCKETS = 12;

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
  flags: Uint8Array; // 1 accent, 2 shock ring, 4 crest, 8 formed in place, 16 reactor coil
  order: Int16Array; // plates by fit
  jigSlot: Uint8Array; // fixed reservation for its whole formation; 255 = fixed
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
  hinge: Float32Array;
  // Six sockets sampled on the real outside contour, x/y and outward normal.
  receiver: Float32Array;
  receiverN: Uint8Array;
  receiverSlot: Uint8Array; // reserved for the whole approach and cooling interval
  lam0: Float32Array;
  reach: Float32Array;
  shockW: Float32Array;
  latchW: Float32Array;
  clampW: Float32Array;
  // The clamps (round 3): where each corner's clamp bites (figure px; the
  // gold box's corner, or on a huge ornament box the outline's point nearest
  // it, so it bites the part), and which corners have one (bit k: corner k).
  clampX: Float32Array;
  clampY: Float32Array;
  clampMask: Uint8Array;
  box: Float32Array; // gold box x, y, w, h
  hasBox: Uint8Array;
  // The guideway's build (owner, 2026-10-16: from the toe tips up): each
  // plate's window, and each gold cell's build time and place along its
  // build (0..1); plate p's cells by build time in [first, end) of buildIdx.
  buildA: Float32Array;
  buildB: Float32Array;

  buildAt: Float32Array;
  buildFrac: Float32Array;
  buildIdx: Int32Array;
  buildSorted: Float32Array;
  // The channel (the weld head and the pulses run along it, 滑らかに): each
  // plate's gold cells thinned to a one-cell skeleton along its trims
  // (Zhang–Suen on the cell grid), each channel cell's predecessor along the
  // build (-1: where a trim starts), and plate p's channel cells by build in
  // [chanFirst[p], chanFirst[p + 1]) of chanIdx (their buildFrac in chanFrac).
  chan: Uint8Array;
  chanPrev: Int32Array;
  chanIdx: Int32Array;
  chanFrac: Float32Array;
  chanFirst: Int32Array;
  // Each channel cell's point (figure px): its centre eased toward its
  // neighbours along the channel, so the thread runs smooth, not stepped.
  chanX: Float32Array;
  chanY: Float32Array;
  cellFrac: Float32Array; // one cell's step of a plate's buildFrac
  // Tiles (global index; plate p owns [tileFirst[p], tileFirst[p + 1])).
  tileFirst: Int32Array;
  landSorted: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  land: Float32Array;
  flightStart: Float64Array;
  flightMs: Float64Array;
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
  tflags: Uint8Array; // 1 comet, 2 spark, 4 recoil, 8 pathfinder
  parent: Int32Array;
  // Local docking axes follow the last welded neighbour. Chips approach
  // along these keys, rather than all diving along the plate's normal.
  dockX: Float32Array;
  dockY: Float32Array;
  // Strings (2026-10-16, 更にブラッシュアップ): each tile's pathfinder (the
  // string's first to land) and its place in the string.
  tLead: Int32Array;
  tRank: Int16Array;
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
  brandStart: Float32Array;
  sprayMs: Float32Array;
  drainMs: Float32Array;
  emitX: Float32Array;
  emitY: Float32Array;
  emitNX: Float32Array;
  emitNY: Float32Array;
  brandSin: Float64Array;
  brandTravel: Float64Array;
  brandLift: Float64Array;
  brandEndX: Float64Array;
  brandEndY: Float64Array;
  birthRadius: Float64Array;
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
  // Squads: each chip's leader (itself for a leader) and its place behind
  // it; the squad's lane hops (period ms, phase, direction); its hover.
  squad: Int16Array;
  rank: Int8Array;
  hopT: Float32Array;
  hop0: Float32Array;
  hopDir: Int8Array;
  hoverT: Float32Array;
  // Rings.
  ringCy: Float32Array;
  ringRx: Float32Array;
  ringRy: Float32Array;
  ringCos: Float32Array;
  ringSin: Float32Array;
  ringOmega: Float32Array;
  ringTilt: Float32Array;
  ringLag: Float32Array; // the heartbeat's delay from the core (ms)
  occupancy: Uint8Array;
};
type Sheets = {
  metal: HTMLCanvasElement;
  silhouette: HTMLCanvasElement | null;
  holo: HTMLCanvasElement;
  walls: HTMLCanvasElement | null;
  rails: HTMLCanvasElement | null;
  molten: HTMLCanvasElement | null;
  hot: HTMLCanvasElement | null;
  lattice: HTMLCanvasElement | null;
  clamps: HTMLCanvasElement | null;
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
  const fireSample = new Float64Array(4);
  const L: Layout = {
    kind: new Int8Array(P),
    segment: new Int8Array(P),
    flags: new Uint8Array(P),
    order: Int16Array.from(all.map((_, p) => p).sort((a, b) => all[a].fit - all[b].fit || a - b)),
    jigSlot: new Uint8Array(P).fill(255),
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
    hinge: f32(P),
    receiver: f32(P * RECEIVER_KEYS * 4),
    receiverN: new Uint8Array(P),
    receiverSlot: new Uint8Array(P).fill(255),
    lam0: f32(P),
    reach: f32(P),
    shockW: f32(P),
    latchW: f32(P),
    clampW: f32(P),
    clampX: f32(P * 4),
    clampY: f32(P * 4),
    clampMask: new Uint8Array(P),
    box: f32(P * 4),
    hasBox: new Uint8Array(P),
    buildA: new Float32Array(P).fill(Infinity),
    buildB: new Float32Array(P).fill(Infinity),
    buildAt: f32(gold.lock.length),
    buildFrac: f32(gold.lock.length),
    buildIdx: new Int32Array(gold.lock.length),
    buildSorted: f32(gold.lock.length),
    chan: new Uint8Array(gold.lock.length),
    chanPrev: new Int32Array(gold.lock.length).fill(-1),
    chanIdx: new Int32Array(gold.lock.length),
    chanFrac: f32(gold.lock.length),
    chanFirst: new Int32Array(P + 1),
    chanX: f32(gold.lock.length),
    chanY: f32(gold.lock.length),
    cellFrac: f32(P),
    tileFirst: new Int32Array(P + 1),
    landSorted: f32(N),
    cx: f32(N),
    cy: f32(N),
    land: f32(N),
    flightStart: new Float64Array(N),
    flightMs: new Float64Array(N),
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
    dockX: f32(N),
    dockY: f32(N),
    tLead: new Int32Array(N),
    tRank: new Int16Array(N),
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
    brandStart: f32(CHIPS),
    sprayMs: f32(CHIPS),
    drainMs: f32(CHIPS),
    emitX: f32(CHIPS),
    emitY: f32(CHIPS),
    emitNX: f32(CHIPS),
    emitNY: f32(CHIPS),
    brandSin: new Float64Array(CHIPS),
    brandTravel: new Float64Array(CHIPS),
    brandLift: new Float64Array(CHIPS),
    brandEndX: new Float64Array(CHIPS),
    brandEndY: new Float64Array(CHIPS),
    birthRadius: new Float64Array(CHIPS),
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
    squad: new Int16Array(CHIPS),
    rank: new Int8Array(CHIPS),
    hopT: f32(CHIPS),
    hop0: f32(CHIPS),
    hopDir: new Int8Array(CHIPS),
    hoverT: f32(CHIPS),
    ringCy: f32(RINGS),
    ringRx: f32(RINGS),
    ringRy: f32(RINGS),
    ringCos: f32(RINGS),
    ringSin: f32(RINGS),
    ringOmega: f32(RINGS),
    ringTilt: f32(RINGS),
    ringLag: f32(RINGS),
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
  // The gold boxes' median area: a box far larger than it is an ornament's.
  const areas = Object.values(boxes)
    .map((box) => box[2] * box[3])
    .sort((a, b) => a - b);
  const medianArea = areas.length ? areas[areas.length >> 1] : 1;
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
    const coil = piece.id === "core-swirl";
    L.flags[p] =
      (accents.has(piece.id) ? 1 : 0) |
      (sparks.has(piece.id) ? 2 : 0) |
      (crest ? 4 : 0) |
      (coil ? 16 : 0);
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
    // The feeder starts on the burning body, not at a floating orbital gate.
    // Ornament receivers stay at their own root: only their material supply
    // originates on the body, preserving the original art's separate layers.
    let nearestFire = Infinity;
    for (let k = 0; k < 32; k += 1) {
      sampleFlameBirth((k + hash(p, 811)) / 32, fireSample);
      const fx = fireSample[0] * W;
      const fy = fireSample[1] * H;
      const distance = (fx - sx) ** 2 + (fy - sy) ** 2;
      if (distance >= nearestFire) continue;
      nearestFire = distance;
      L.gateX[p] = fx + fireSample[2] * 16;
      L.gateY[p] = fy + fireSample[3] * 16;
    }
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
    // Owner (2026-10-16): 「前がけの生成完了時にズレるのを修正して。」 — the
    // hanging front plates (tasset-*) and any armour plate much taller than
    // wide form in place on the body, like the helmet: no lift, no tilt, so
    // nothing has to snap into place when they complete.
    const inPlace =
      helm ||
      piece.id === "core-disc" ||
      piece.id.startsWith("tasset-") ||
      (kind === 0 && piece.h >= 1.8 * piece.w);
    if (inPlace) L.flags[p] |= 8;
    const lift = inPlace ? 0 : (TOUCH ? 3 : 5) + (TOUCH ? 6 : 9) * Math.sqrt(area / maxArea);
    L.lift[p] = lift * (kind === 1 || kind === 2 ? 1.4 : 1);
    L.tilt[p] = inPlace || TOUCH ? 0 : (12 * Math.PI) / 180;
    const hx = Math.sign(sx - W / 2) * Math.min(1, Math.abs(sx - W / 2) / (0.25 * W));
    L.offX[p] = L.lift[p] * (0.55 * hx - 0.3);
    L.offY[p] = L.lift[p] * -0.55;
    if (kind === 0 && !inPlace) {
      // Plates approach along the anatomy: breast leaves close towards the
      // sternum, shoulder shells pivot inward, limb shells slide up their
      // limb. This is a carriage carrying the assembled metal, not a swarm
      // translation. Tassets and tall fitted plates retain their fixed seats.
      const side = sx < W / 2 ? -1 : 1;
      const shoulder = piece.group === "shoulders";
      const chest = piece.group === "chest";
      const distance = (TOUCH ? 12 : 21) + (TOUCH ? 7 : 13) * Math.sqrt(area / maxArea);
      L.lift[p] = distance;
      L.offX[p] = side * distance * (shoulder ? 1 : chest ? 0.9 : 0.48);
      L.offY[p] = distance * (shoulder ? -0.48 : chest ? -0.12 : 0.65);
      L.tilt[p] = TOUCH ? 0 : ((shoulder ? 24 : 18) * Math.PI) / 180;
      L.hinge[p] = (side * (shoulder ? 14 : chest ? 9 : 6) * Math.PI) / 180;
    }
    if (coil) {
      L.lift[p] = L.offX[p] = L.offY[p] = L.tilt[p] = L.hinge[p] = 0;
    }
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
      // Round 3 (owner 「更にブラッシュアップ」): clamps drawn large enough that
      // their bevel, bolt and LED read (the L's arms ≥ 11 figure px), none on
      // a box too small to hold them, only the lower pair on a small one.
      const least = Math.min(box[2], box[3]);
      L.clampW[p] = Math.min(40, Math.max(28, 0.45 * least)) * (L.flags[p] & 1 ? 1.15 : 1);

      L.clampMask[p] = least < CLAMP_MIN ? 0 : least < CLAMP_PAIR ? 0b1100 : 0b1111;
      const loop = allLoops[p][0];
      const huge = box[2] * box[3] > CLAMP_HUGE * medianArea && loop && loop.length >= 6;
      for (let corner = 0; corner < 4; corner += 1) {
        const cx = box[0] + (corner & 1) * box[2];
        const cy = box[1] + (corner >> 1) * box[3];
        let bx = cx;
        let by = cy;
        if (huge) {
          let best = Infinity;
          for (let k = 0; k < loop.length; k += 2) {
            const d = (loop[k] - cx) ** 2 + (loop[k + 1] - cy) ** 2;
            if (d < best) {
              best = d;
              bx = loop[k];
              by = loop[k + 1];
            }
          }
        }
        L.clampX[p * 4 + corner] = bx;
        L.clampY[p * 4 + corner] = by;
      }
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
      L.land[i] = naniteMaterialLanding(tile.land, plate.fit);
      // Land is final here. Cache from its stored Float32 value, retaining
      // the drawing expression's double precision and exact association.
      // Each tile's own flight (owner, 2026-10-21: never one fixed 170 ms):
      // FLIGHT_SPREAD of FLIGHT, within its plate's spawn, never before the
      // first metal can emerge.
      const flight =
        FLIGHT * (FLIGHT_SPREAD[0] + (FLIGHT_SPREAD[1] - FLIGHT_SPREAD[0]) * hash(i * 13 + 7, 733));
      L.flightStart[i] = Math.max(FIRE_BIRTH, L.land[i] - flight);
      L.flightMs[i] = L.land[i] - L.flightStart[i];
      if (L.land[i] <= plate.fit - SW.seat) landedBy += 1;
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
      L.size[i] = 8.6 * (0.9 + 0.25 * h2);
      L.tone[i] = cx < W / 2 ? ICE : PINK;
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
    for (let i = first; i < first + n; i += 1) {
      const parent = L.parent[i];
      const dx = parent < 0 ? L.nX[p] : L.cx[i] - L.cx[parent];
      const dy = parent < 0 ? L.nY[p] : L.cy[i] - L.cy[parent];
      const length = Math.hypot(dx, dy) || 1;
      L.dockX[i] = dx / length;
      L.dockY[i] = dy / length;
    }
    const lands = L.land.slice(first, first + n).sort();
    L.landSorted.set(lands, first);
    // Strings: the tiles by landing, dealt round-robin into strings whose
    // members land about LIFE.string.gap ms apart; each follows its
    // pathfinder's river and orbit (its bow, its angle, its radius).
    const byLand = Array.from({ length: n }, (_, k) => first + k).sort(
      (a, b) => L.land[a] - L.land[b] || a - b,
    );
    const span = n > 1 ? L.land[byLand[n - 1]] - L.land[byLand[0]] : 0;
    const strings = Math.max(
      1,
      Math.min(16, Math.round((LIFE.string.gap * n) / Math.max(1, span)), n),
    );
    for (let k = 0; k < n; k += 1) {
      const i = byLand[k];
      const lead = byLand[k % strings];
      const rank = Math.floor(k / strings);
      L.tLead[i] = lead;
      L.tRank[i] = rank;
      if (rank === 0) {
        L.tone[i] = WHITE;
        L.tflags[i] |= 1 | 8;
        continue;
      }
      L.bow[i] = L.bow[lead];
      L.psi0[i] = L.psi0[lead] + 0.08 * rank;
      L.r0[i] = L.r0[lead] * (1 - 0.03 * Math.min(rank, 10));
      L.jx[i] = L.jx[lead];
      L.jy[i] = L.jy[lead];
    }
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
    if (coil) L.clampMask[p] = 0;
    if (kind === 0 && !coil) {
      // Socket frames follow the dominant real contour, including the tall
      // plates that must form in place. Sampling happens only in preparation.
      let outside = -1;
      for (let l = L.loopFirst[p]; l < loopAt; l += 1)
        if (outside < 0 || L.loopLen[l] > L.loopLen[outside]) outside = l;
      if (outside >= 0 && L.loopLen[outside] > 32) {
        const start = L.loopStart[outside];
        const count = L.loopN[outside];
        let at = 0;
        for (let key = 0; key < RECEIVER_KEYS; key += 1) {
          const target = (L.loopLen[outside] * (key + 0.5)) / RECEIVER_KEYS;
          while (at < count - 1 && L.cum[start + at + 1] < target) at += 1;
          const a = start + at;
          const b = a + 1;
          const dx = L.px[b] - L.px[a];
          const dy = L.py[b] - L.py[a];
          const length = Math.max(0.001, L.cum[b] - L.cum[a]);
          const u = (target - L.cum[a]) / length;
          const x = L.px[a] + dx * u;
          const y = L.py[a] + dy * u;
          const sign = dy * (x - bcx) - dx * (y - bcy) < 0 ? -1 : 1;
          const o = (p * RECEIVER_KEYS + key) * 4;
          L.receiver[o] = x;
          L.receiver[o + 1] = y;
          L.receiver[o + 2] = (dy * sign) / length;
          L.receiver[o + 3] = (-dx * sign) / length;
        }
        L.receiverN[p] = RECEIVER_KEYS;
      }
    }
    yield;
  }
  L.tileFirst[P] = tileAt;
  L.loopFirst[P] = loopAt;
  // Reserve a carriage for the entire interval, rather than promoting a
  // previously flat panel when another plate fits and frees a frame slot.
  // With larger articulated travel that promotion would visibly pop.
  const jigOrder = Array.from(L.order).sort(
    (a, b) =>
      Number(Boolean(L.flags[b] & 16)) - Number(Boolean(L.flags[a] & 16)) ||
      all[a].fit - all[b].fit ||
      a - b,
  );
  for (const p of jigOrder) {
    if (L.kind[p] < 0 || L.flags[p] & 8) continue;
    for (let slot = 0; slot < JIGS; slot += 1) {
      let free = true;
      for (let q = 0; q < P; q += 1) {
        if (L.jigSlot[q] !== slot) continue;
        if (all[p].spawn < all[q].fit && all[q].spawn < all[p].fit) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      L.jigSlot[p] = slot;
      break;
    }
  }
  // A receiver is either present throughout approach, fastening and cooling,
  // or absent throughout. Reusing a framewise cap could first reveal it only
  // after its plate had fitted, particularly with the two-frame touch budget.
  // Give the scarce touch frames to moving arm/shoulder carriages first,
  // so a complete physical mechanism survives before static surface clamps.
  const receiverPriority = (p: number) =>
    L.jigSlot[p] >= JIGS
      ? 2
      : all[p].piece.group === "arms" || all[p].piece.group === "shoulders"
        ? 0
        : 1;
  const receiverOrder = Array.from(L.order).sort(
    (a, b) => receiverPriority(a) - receiverPriority(b) || all[a].fit - all[b].fit || a - b,
  );
  for (const p of receiverOrder) {
    if (!L.receiverN[p]) continue;
    for (let slot = 0; slot < RECEIVER_PLATES; slot += 1) {
      let free = true;
      for (let q = 0; q < P; q += 1) {
        if (L.receiverSlot[q] !== slot) continue;
        if (
          all[p].fit - RAIL_LEAD < all[q].fit + RECEIVER_COOL &&
          all[q].fit - RAIL_LEAD < all[p].fit + RECEIVER_COOL
        ) {
          free = false;
          break;
        }
      }
      if (!free) continue;
      L.receiverSlot[p] = slot;
      break;
    }
  }
  yield* layOutBuild(L, all, gold);
  // The old first guide was complete at 595ms, before material may exist.
  // Preserve its channel ordering but build it after the explosion, ahead
  // of the retimed first armour cell. Paint/gold lock clocks stay pinned.
  for (let p = 0; p < P; p += 1) {
    const start = L.buildA[p];
    const end = L.buildB[p];
    if (
      !Number.isFinite(start) ||
      start >= FIRE_BIRTH ||
      end <= start ||
      L.tileFirst[p + 1] <= L.tileFirst[p]
    )
      continue;
    const firstLand = L.landSorted[L.tileFirst[p]];
    const to = Math.max(FIRE_BIRTH + 40, Math.min(end, firstLand - 10));
    const scale = (to - FIRE_BIRTH) / (end - start);
    for (let i = all[p].first; i < all[p].end; i += 1) {
      L.buildAt[i] = FIRE_BIRTH + (L.buildAt[i] - start) * scale;
      L.buildSorted[i] = FIRE_BIRTH + (L.buildSorted[i] - start) * scale;
    }
    L.buildA[p] = FIRE_BIRTH;
    L.buildB[p] = to;
  }
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
    L.ringLag[r] = (LIFE.heartbeat.lag * Math.abs(cy - CORE_Y)) / H;
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
    // The first feet coalesce after the explosion and still seat at 710ms.
    // Later body regions share one birth interval, never six pump waves.
    // (Owner, 2026-10-21: every nanite is a fragment of the burst, cooled;
    // nothing burns on through the assembly, so nothing is born later.)
    const born = FIRE_BIRTH + (plate >= 0 && all[plate].fit < 850 ? 24 : FIRE_BIRTH_SPAN) * h1;
    L.birth[c] = plate < 0 ? born : Math.min(born, all[plate].fit - 80);
    L.brandStart[c] = FIREBRAND_START + 100 * h2;
    L.sprayMs[c] =
      plate < 0
        ? FIRE_SPRAY
        : Math.min(FIRE_SPRAY, Math.max(32, (all[plate].fit - L.birth[c]) * 0.45));
    L.drainMs[c] =
      plate < 0
        ? 120
        : Math.min(120, Math.max(28, all[plate].fit - L.birth[c] - L.sprayMs[c] - 12));
    let nearestFire = Infinity;
    for (let k = 0; k < (plate < 0 ? 1 : 12); k += 1) {
      sampleFlameBirth(plate < 0 ? h2 : (k + h2) / 12, fireSample);
      const fx = fireSample[0] * W;
      const fy = fireSample[1] * H;
      const distance = plate < 0 ? 0 : (fx - L.seatX[plate]) ** 2 + (fy - L.seatY[plate]) ** 2;
      if (distance >= nearestFire) continue;
      nearestFire = distance;
      L.emitX[c] = fx;
      L.emitY[c] = fy;
      L.emitNX[c] = fireSample[2];
      L.emitNY[c] = fireSample[3];
    }
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
          : Math.max(L.birth[c] + L.sprayMs[c], spawn - SW.drain + 100 * h3);
    } else L.drainAt[c] = Infinity;
    L.ring[c] = ring;
    L.lane[c] = Math.floor(h3 * 3) - 1;
    L.theta0[c] = TAU * hash(c, 2333);
    L.phi[c] = TAU * hash(c, 2441);
    L.chipF0[c] = FRAMES * hash(c, 2557);
    L.chipSpin[c] = 1.2 + 1.4 * hash(c, 2663);
    // A scale hierarchy (2026-10-21): parts at several sizes, a few heroes.
    L.chipSize[c] = (TOUCH ? 6 : 8) * sizeScale(hash(c, 2777));
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
  // Squads: each ring's chips in index order, LIFE.squad.size at a time; a
  // follower takes its leader's lane and wobble and trails it on the ring.
  const Q = LIFE.squad;
  const ringSeen = new Int32Array(RINGS);
  const ringLead = new Int32Array(RINGS);
  for (let c = 0; c < CHIPS; c += 1) {
    const r = L.ring[c];
    const rank = ringSeen[r] % Q.size;
    ringSeen[r] += 1;
    if (!rank) ringLead[r] = c;
    const lead = ringLead[r];
    L.squad[c] = lead;
    L.rank[c] = rank;
    L.hoverT[c] = 620 + 420 * hash(c, 3163);
    if (!rank) {
      // The leader is white; its followers carry the squad's colour.
      L.chipTone[c] = WHITE;
      L.hopT[c] = Q.hop[0] + (Q.hop[1] - Q.hop[0]) * hash(c, 3251);
      L.hop0[c] = hash(c, 3343);
      L.hopDir[c] = L.lane[c] > 0 ? -1 : L.lane[c] < 0 ? 1 : hash(c, 3433) < 0.5 ? -1 : 1;
      continue;
    }
    const dir = L.ringOmega[r] < 0 ? -1 : 1;
    L.theta0[c] = L.theta0[lead] - dir * rank * Q.gap;
    L.lane[c] = L.lane[lead];
    L.phi[c] = L.phi[lead] + 0.4 * rank;
    if (L.chipTone[c] === WHITE) L.chipTone[c] = hash(c, 3539) < 0.5 ? ICE : PINK;
  }
  // Squad followers have their final stored phase only now. Each endpoint
  // is the original firebrand pose at u=1, including sin(PI)'s tiny curl;
  // Float64 preserves the exact values formerly recalculated per sample.
  for (let c = 0; c < CHIPS; c += 1) {
    const sinPhi = Math.sin(L.phi[c]);
    const travel = 80 + 50 * (0.5 + 0.5 * sinPhi);
    const lift = 18 + 17 * (0.5 + 0.5 * Math.cos(L.phi[c]));
    const curl = 5 * Math.sin(Math.PI) * sinPhi;
    L.brandSin[c] = sinPhi;
    L.brandTravel[c] = travel;
    L.brandLift[c] = lift;
    L.brandEndX[c] = L.emitX[c] + L.emitNX[c] * travel - L.emitNY[c] * curl;
    L.brandEndY[c] = L.emitY[c] + L.emitNY[c] * travel + L.emitNX[c] * curl - lift;
    L.birthRadius[c] = 38 + 18 * (0.5 + 0.5 * sinPhi);
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
      // A group that fits from the top down (the arms: upper arm first, the
      // fists last) builds its guideways in that same order (round 3: the
      // guideway and the fit read in one direction), each still grown up its
      // own trims from its lowest cell (owner: never laid over from above).
      const firstPlate = list.reduce((a, b) => (all[b].fit < all[a].fit ? b : a));
      const lastPlate = list.reduce((a, b) => (all[b].fit > all[a].fit ? b : a));
      const lowest = (p: number) => L.box[p * 4 + 1] + L.box[p * 4 + 3];
      if (lowest(firstPlate) < lowest(lastPlate) - 8 && lastFit > firstFit) {
        for (const p of list) {
          const frac = (all[p].fit - firstFit) / (lastFit - firstFit);
          L.buildA[p] = gA + frac * (gB - gA) * (1 - FIT_WINDOW);
          L.buildB[p] = L.buildA[p] + FIT_WINDOW * (gB - gA);
        }
      } else {
        const at = (y: number) => gA + ((bottom - y) / Math.max(1, bottom - top)) * (gB - gA);
        // Every plate of the group whole before its own first tile lands.
        while (gB > gA + 120 && list.some((p) => at(L.box[p * 4 + 1]) > all[p].fit - B.done))
          gB -= 5;
        for (const p of list) {
          L.buildA[p] = at(L.box[p * 4 + 1] + L.box[p * 4 + 3]);
          L.buildB[p] = at(L.box[p * 4 + 1]);
        }
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
  let chanAt = 0;
  for (let p = 0; p < all.length; p += 1) {
    if (p) yield;
    const plate = all[p];
    const first = plate.first;
    const n = plate.end - first;
    L.chanFirst[p] = chanAt;
    L.chanFirst[p + 1] = chanAt;
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
    const trim = new Int32Array(n);
    const queue = new Int32Array(n);
    let seen = 0;
    let trims = 0;
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
      trim[entry] = trims;
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
            trim[j] = trims;
            queue[end++] = j;
            seen += 1;
          }
      }
      trims += 1;
    }
    let most = 0;
    for (let k = 0; k < n; k += 1) most = Math.max(most, dist[k]);
    const a = L.buildA[p];
    const span = L.buildB[p] - a;
    const order = Array.from({ length: n }, (_, k) => k).sort((x, y) => dist[x] - dist[y] || x - y);
    order.forEach((k, rank) => {
      const frac = most > 0 ? dist[k] / most : 0;
      const i = first + k;
      L.buildFrac[i] = frac;
      L.buildAt[i] = a + frac * span;
      L.buildIdx[first + rank] = i;
      L.buildSorted[first + rank] = a + frac * span;
    });
    L.cellFrac[p] = most > 0 ? 1 / most : 1;
    // The channel: the plate's cells thinned to a one-cell skeleton (every
    // trim keeps one cell at least), each linked back along the build.
    const skeleton = thinCells(col, row, cols, rows);
    const kept = new Uint8Array(trims);
    for (let k = 0; k < n; k += 1) if (skeleton[k]) kept[trim[k]] = 1;
    // A trim the thinning erased (a 2×2 speck): its entry cell (the first
    // of it by build).
    for (const k of order)
      if (!kept[trim[k]]) {
        skeleton[k] = 1;
        kept[trim[k]] = 1;
      }
    for (const k of order) {
      if (!skeleton[k]) continue;
      const i = first + k;
      L.chan[i] = 1;
      let prev = -1;
      let prevDist = -1;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const c = col[k] + dx;
          const r = row[k] + dy;
          if ((!dx && !dy) || c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const j = grid[r * cols + c];
          // (Built before it by more than the float32 sums' rounding: two
          // paths of 1s and 1.41s to one length can differ by an ulp.)
          if (j < 0 || !skeleton[j] || dist[j] >= dist[k] - 1e-3 || dist[j] <= prevDist) continue;
          prev = j;
          prevDist = dist[j];
        }
      L.chanPrev[i] = prev >= 0 ? first + prev : -1;
      L.chanIdx[chanAt] = i;
      L.chanFrac[chanAt] = L.buildFrac[i];
      chanAt += 1;
    }
    L.chanFirst[p + 1] = chanAt;
    // The thread's points: each channel cell's centre (twice) with its
    // neighbours along the channel (its predecessor and its successors).
    const sumX = new Float32Array(n);
    const sumY = new Float32Array(n);
    const count = new Float32Array(n);
    const cx = (k: number) => gold.fx[first + k] + gold.cw[first + k] / 2;
    const cy = (k: number) => gold.fy[first + k] + gold.ch[first + k] / 2;
    for (let k = 0; k < n; k += 1) {
      if (!skeleton[k]) continue;
      sumX[k] += 2 * cx(k);
      sumY[k] += 2 * cy(k);
      count[k] += 2;
      const j = L.chanPrev[first + k] - first;
      if (j < 0) continue;
      sumX[k] += cx(j);
      sumY[k] += cy(j);
      count[k] += 1;
      sumX[j] += cx(k);
      sumY[j] += cy(k);
      count[j] += 1;
    }
    for (let k = 0; k < n; k += 1) {
      if (!skeleton[k]) continue;
      L.chanX[first + k] = sumX[k] / count[k];
      L.chanY[first + k] = sumY[k] / count[k];
    }
  }
}

// Zhang–Suen thinning of a plate's gold cells on their grid: 1 for the cells
// of the one-cell skeleton along its trims.
function thinCells(col: Int32Array, row: Int32Array, cols: number, rows: number) {
  const w = cols + 2;
  const h = rows + 2;
  const image = new Uint8Array(w * h);
  for (let k = 0; k < col.length; k += 1) image[(row[k] + 1) * w + col[k] + 1] = 1;
  const doomed = new Int32Array(col.length);
  for (let changed = true; changed;) {
    changed = false;
    for (let pass = 0; pass < 2; pass += 1) {
      let count = 0;
      for (let y = 1; y < h - 1; y += 1)
        for (let x = 1; x < w - 1; x += 1) {
          const o = y * w + x;
          if (!image[o]) continue;
          const p2 = image[o - w];
          const p3 = image[o - w + 1];
          const p4 = image[o + 1];
          const p5 = image[o + w + 1];
          const p6 = image[o + w];
          const p7 = image[o + w - 1];
          const p8 = image[o - 1];
          const p9 = image[o - w - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const turns =
            (p2 < p3 ? 1 : 0) +
            (p3 < p4 ? 1 : 0) +
            (p4 < p5 ? 1 : 0) +
            (p5 < p6 ? 1 : 0) +
            (p6 < p7 ? 1 : 0) +
            (p7 < p8 ? 1 : 0) +
            (p8 < p9 ? 1 : 0) +
            (p9 < p2 ? 1 : 0);
          if (turns !== 1) continue;
          if (pass === 0 ? p2 * p4 * p6 || p4 * p6 * p8 : p2 * p4 * p8 || p2 * p6 * p8) continue;
          doomed[count++] = o;
        }
      for (let k = 0; k < count; k += 1) image[doomed[k]] = 0;
      if (count) changed = true;
    }
  }
  const skeleton = new Uint8Array(col.length);
  for (let k = 0; k < col.length; k += 1) skeleton[k] = image[(row[k] + 1) * w + col[k] + 1];
  return skeleton;
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

// The call's derived layers (round 3, reviews 8/27/9), with the formulas
// of the kit's pixel jobs (rexonance-unlit.js: naniteMetalRow,
// naniteGuideRow, naniteMoltenRow — they live there alone) and their
// contract (row-sliced, byte-identical whatever the slices, no composite
// operations, null if the pixels cannot be read), but phased so that no
// preparation slice holds a whole layer: each source is drawn into a
// scratch canvas in a step of its own and read back a strip of rows a step,
// the outputs' buffers are made in a step, the rows run to the deadline,
// and each output is uploaded in a step of its own. The kit's jobs read
// their whole layer (two for the molten) in their first step, 6-7.9 ms.
const READ_STRIP = 248;
type PhasedShade = (y: number, inputs: Uint8ClampedArray[], outputs: Uint8ClampedArray[]) => void;
function createPhasedJob(
  reads: CanvasImageSource[],
  w: number,
  h: number,
  names: readonly string[],
  shade: PhasedShade,
  // The reads' own size (an output smaller than its source is read scaled).
  srcW = w,
  srcH = h,
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
    if (!read) throw new Error("unavailable layer context");
    let inputs: Uint8ClampedArray[] | null = reads.map(() => new Uint8ClampedArray(w * h * 4));
    let images: ImageData[] | null = null;
    let source = 0; // the read being copied
    let strip = -1; // -1: draw it first; then its strips
    let row = 0;
    let uploaded = 0;
    let cancelled = false;
    const result: Record<string, HTMLCanvasElement> = {};
    let done = false;
    return {
      step(until: number, deadline?: Pick<IdleDeadline, "timeRemaining">) {
        if (cancelled || done) return true;
        try {
          if (source < reads.length) {
            // One draw, or one strip's read-back, a step.
            if (strip < 0) {
              read.clearRect(0, 0, w, h);
              read.drawImage(reads[source], 0, 0, srcW, srcH, 0, 0, w, h);
              strip = 0;
              return false;
            }
            const top = strip * READ_STRIP;
            const rows = Math.min(READ_STRIP, h - top);
            inputs![source].set(read.getImageData(0, top, w, rows).data, top * w * 4);
            strip += 1;
            if (top + rows >= h) {
              source += 1;
              strip = -1;
              if (source >= reads.length) scratch.width = scratch.height = 0;
            }
            return false;
          }
          if (!images) {
            images = names.map(() => read.createImageData(w, h));
            return false;
          }
          if (row < h) {
            const outputs = images.map((image) => image.data);
            do {
              shade(row, inputs!, outputs);
              row += 1;
            } while (
              row < h &&
              performance.now() < until &&
              (!deadline || deadline.timeRemaining() >= 2)
            );
            if (row >= h) inputs = null;
            return false;
          }
          // One upload a step.
          const canvas = make();
          const write = canvas.getContext("2d");
          if (!write) throw new Error("unavailable layer output");
          write.putImageData(images[uploaded], 0, 0);
          result[names[uploaded]] = canvas;
          uploaded += 1;
          if (uploaded < names.length) return false;
          images = null;
          owned.length = 0;
          done = true;
          return true;
        } catch {
          cancelled = true;
          inputs = null;
          images = null;
          release();
          return true;
        }
      },
      commit() {
        return cancelled || !done ? null : result;
      },
      cancel() {
        if (cancelled || done) return;
        cancelled = true;
        inputs = null;
        images = null;
        release();
      },
    };
  } catch {
    release();
    return null;
  }
}

// The raw nanite metal, from the art.
const createMetalJob = (source: CanvasImageSource) =>
  createPhasedJob([source], ART_W, ART_H, ["metal"], (y, [a], [m]) =>
    naniteMetalRow(y, ART_W, ART_H, a, m, null),
  );
// Its silhouette (fine pointers: contact shadows and the staged plate's
// shade), at half the atlas's resolution (round 3, reviews 28/43/55: a soft
// shadow loses nothing, and it is a quarter of the canvas): rgb (6, 10, 18),
// the art's alpha.
const SHADOW_W = ART_W / 2;
const SHADOW_H = ART_H / 2;
const createShadowJob = (source: CanvasImageSource) =>
  createPhasedJob(
    [source],
    SHADOW_W,
    SHADOW_H,
    ["silhouette"],
    (y, [a], [s]) => {
      for (let x = 0, i = y * SHADOW_W * 4; x < SHADOW_W; x += 1, i += 4) {
        if (!a[i + 3]) continue;
        s[i] = 6;
        s[i + 1] = 10;
        s[i + 2] = 18;
        s[i + 3] = a[i + 3];
      }
    },
    ART_W,
    ART_H,
  );

// The guideway's hologram; on fine pointers its walls (G5) and its rails and
// channel alone (the guide's opaque pixels, alpha ≥ 150), so its hard-light
// glass can be drawn faint over the raw channel while the rails stay solid:
// one read of the guide for all three (the rails used to read it again).
const createGuideJob = (guide: CanvasImageSource, walls: boolean) =>
  createPhasedJob(
    [guide],
    KIT_GUIDE.width,
    KIT_GUIDE.height,
    walls ? ["holo", "walls", "rails"] : ["holo"],
    (y, [a], [o, wl, rails]) => {
      naniteGuideRow(y, KIT_GUIDE.width, a, o, wl ?? null);
      if (!rails) return;
      for (let x = 0, i = y * KIT_GUIDE.width * 4; x < KIT_GUIDE.width; x += 1, i += 4) {
        const alpha = a[i + 3];
        if (alpha < 150) continue;
        rails[i] = a[i];
        rails[i + 1] = a[i + 1];
        rails[i + 2] = a[i + 2];
        rails[i + 3] = alpha;
      }
    },
  );

// The molten gold (G6), the art's gold through the gold mask, and the
// band's white-hot head: the same ramp shifted HOT_SHIFT toward white (the
// band's newest cells are drawn from it, the older from the molten, fading
// into the painted gold).
const HOT_SHIFT = 0.3;
const createMoltenJob = (source: CanvasImageSource, mask: CanvasImageSource | null) =>
  createPhasedJob(
    mask ? [source, mask] : [source],
    ART_W,
    ART_H,
    ["molten", "hot"],
    (y, [a, gold], [molten, hot]) => {
      naniteMoltenRow(y, ART_W, a, gold ?? null, molten, 0);
      naniteMoltenRow(y, ART_W, a, gold ?? null, hot, HOT_SHIFT);
    },
  );

// The clamps in gold (round 3, owner 「更にブラッシュアップ」): the kit's clamp
// frames, regraded once in idle time from their dull khaki to polished
// gold-chrome about a quarter brighter, their bolt's LED kept ice-white. A
// canvas of the clamp region alone (its frames at the same offsets); null if
// its pixels cannot be read (the call then draws the kit's own).
const CLAMP_RAMP = Float32Array.of(
  0,
  52,
  30,
  8,
  0.35,
  150,
  96,
  30,
  0.65,
  232,
  176,
  82,
  0.85,
  255,
  226,
  150,
  1,
  255,
  248,
  226,
);
function goldClamps(fx: CanvasImageSource) {
  const w = KIT_FX.clamp.cell * KIT_FX.clamp.frames;
  const h = KIT_FX.clamp.cell * 4;
  const canvas = Object.assign(globalThis.document.createElement("canvas"), {
    width: w,
    height: h,
  });
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("unavailable clamp context");
    context.drawImage(fx, KIT_FX.clamp.x, KIT_FX.clamp.y, w, h, 0, 0, w, h);
    const image = context.getImageData(0, 0, w, h);
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, g, b);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      if (lum > 0.78 && max - Math.min(r, g, b) < 0.2 * max) {
        // The LED: ice-white.
        d[i] = 232;
        d[i + 1] = 250;
        d[i + 2] = 255;
        continue;
      }
      const v = unit(lum * 1.3 + 0.06);
      let k = 4;
      while (k < 16 && v > CLAMP_RAMP[k]) k += 4;
      const u = (v - CLAMP_RAMP[k - 4]) / (CLAMP_RAMP[k] - CLAMP_RAMP[k - 4]);
      for (let c = 1; c < 4; c += 1)
        d[i + c - 1] = Math.round(
          CLAMP_RAMP[k - 4 + c] + (CLAMP_RAMP[k + c] - CLAMP_RAMP[k - 4 + c]) * u,
        );
    }
    context.putImageData(image, 0, 0);
    return canvas;
  } catch {
    canvas.width = canvas.height = 0;
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Preparation: in its own idle slices, after the plan and its lights. */

let READY = false;
let preparation: Promise<boolean> | null = null;
let cancelPreparation: (() => void) | null = null;
let preparationEpoch = 0;
let promotePreparation: (() => void) | null = null;
let resumePreparation: (() => void) | null = null;

// Review (2026-10-16, cold tap): /rexonance-saga is where the call lands and
// ZENITH draws its first frames, and the suit's own warm-up waits for intent
// there; so does this preparation. A slice that finds itself on the saga page
// parks (no slice is queued) and the next route's warm resumes it.
const onSaga = () => Boolean(globalThis.location?.pathname.startsWith("/rexonance-saga"));

type Stage =
  | "suit"
  | "layout"
  | "cover"
  | "metal"
  | "shadow"
  | "guide"
  | "molten"
  | "lattice"
  | "clamps"
  | "done";

/** Builds the call's extras (its layout, and the metal, hologram, walls,
 * molten and lattice layers) in ≤ 6 ms idle slices, once the plan and its
 * lights are prepared and the nanite kit is decoded. Never while a call
 * draws. Resolves true once ready (false if a layer is unavailable). */
export function prepareRexonanceNanites(priority: "low" | "high" = "low") {
  if (isRexonancePreparationSuspended?.()) return Promise.resolve(false);
  if (READY) return Promise.resolve(true);
  if (preparation) {
    resumePreparation?.();
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
    let parked = false;
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
    cancelPreparation = () => settle(false);
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
      // A live call owns the frame: never read back or upload during it. A
      // call that started without the extras drops an urgent preparation
      // back to idle slices (it already plays the classic engine).
      if (work.drawing > 0) {
        urgent = false;
        schedule();
        return;
      }
      if (onSaga()) {
        urgent = false;
        parked = true;
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
          // Prepared once already (its sheets given back after a call): the
          // layout stands; only the sheets are made again.
          if (LAYOUT && !steps) {
            layout = LAYOUT;
            stage = "metal";
            cursor = 0;
            return schedule();
          }
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
            () => createMetalJob(source),
            (result) => {
              if (!result.metal) return false;
              made.metal = result.metal;
              return true;
            },
            TOUCH ? "guide" : "shadow",
          );
        if (stage === "shadow")
          return runJob(
            until,
            deadline,
            () => createShadowJob(source),
            (result) => {
              made.silhouette = result.silhouette ?? null;
              return Boolean(result.silhouette);
            },
            "guide",
          );
        if (stage === "guide")
          return runJob(
            until,
            deadline,
            () => createGuideJob(guide, !TOUCH),
            (result) => {
              if (!result.holo) return false;
              made.holo = result.holo;
              made.walls = result.walls ?? null;
              made.rails = result.rails ?? null;
              return TOUCH || Boolean(result.rails);
            },
            TOUCH ? "done" : "molten",
          );
        if (stage === "molten") {
          const mask = rexonanceSuitSource(REXONANCE_SUIT_GOLD_ATLAS.src);
          return runJob(
            until,
            deadline,
            () => createMoltenJob(source, mask),

            (result) => {
              if (!result.molten) return false;
              made.molten = result.molten;
              made.hot = result.hot ?? null;
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
            stage = "clamps";
          }
          return schedule();
        }
        if (stage === "clamps") {
          // The clamps in gold (a small read-back); without it, the kit's own.
          const fx = rexonanceNaniteSource(KIT_FX.src);
          made.clamps = fx ? goldClamps(fx) : null;
          stage = "done";
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
            hot: made.hot ?? null,
            lattice: made.lattice ?? null,
            clamps: made.clamps ?? null,
          };
          READY = true;
          settle(true);
          primeNanites();
        }
      } catch {
        settle(false);
      }
    };
    resumePreparation = () => {
      if (settled || !parked || onSaga()) return;
      parked = false;
      schedule();
    };
    promotePreparation = () => {
      if (settled || urgent || onSaga()) return;
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
      resumePreparation = null;
      cancelPreparation = null;
    }
  });
  return pending;
}

// Once prepared: a throwaway instance on a 1×1 canvas primes the poses (see
// SuitExtras.prime), a step an idle slice, never while a call draws, and not
// at all once a call has begun (its own instance is warm by then).
let calls = 0;
let primed = false;
let cancelPriming: (() => void) | null = null;
function primeNanites() {
  if (primed || calls) return;
  primed = true;
  const epoch = preparationEpoch;
  const canvas = Object.assign(globalThis.document.createElement("canvas"), {
    width: 1,
    height: 1,
  });
  // The throwaway instance is made in an idle step of its own (round 3: not
  // in the slice that publishes the sheets, which stays short).
  let extras: SuitExtras | null = null;
  let k = 0;
  const stop = () => {
    canvas.width = canvas.height = 0;
    extras = null;
    if (cancelPriming === stop) cancelPriming = null;
  };
  cancelPriming = stop;
  const queue = () => {
    if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(step, { timeout: 2000 });
    else globalThis.requestAnimationFrame(() => step());
  };
  const step = () => {
    if (calls || epoch !== preparationEpoch || isRexonancePreparationSuspended?.()) {
      stop();
      return;
    }
    if (work.drawing > 0) return queue();
    if (!extras) {
      const context = canvas.getContext("2d");
      extras = context
        ? createSuitExtras(
            {
              flight: context,
              s: 1,
              ox: 0,
              oy: 0,
              all: plates(),
              gold: cells(),
              source: canvas,
              sheet: canvas,
              // A fence like a call's (round 3): edges the swarm meets and a
              // box kept clear, so the fades' branches are primed too.
              fence: Float32Array.of(-12, -10, W + 30, H, 14, 0.66 * W, -12, W + 24, 0),
            },
            true,
          )
        : null;
      if (!extras) {
        stop();
        return;
      }
      return queue();
    }
    if (extras.prime(k)) {
      stop();
      return;
    }
    k += 1;
    queue();
  };
  queue();
}

/** The prepared layout, read-only (tests and frame audits). */
export const rexonanceNaniteLayout = (): Readonly<Layout> | null => LAYOUT;

/** Give back about 49 MB of canvases when the retention policy expires.
 * The layout's typed arrays stay; a later route warm can prepare again in
 * idle slices. Never while a call draws. */
function disposeRexonanceNanites() {
  if (!READY || !SHEETS || work.drawing > 0) return;
  for (const canvas of Object.values(SHEETS)) if (canvas) canvas.width = canvas.height = 0;
  SHEETS = null;
  READY = false;
  // …and the kit's decoded sheets (about 8.7 MB more).
  releaseRexonanceNaniteSources();
}

let retention: ReturnType<typeof createRexonanceCallRetention> | null = null;
/** Reuse the prepared kit across visible World/Rexonance visits. Leaving
 * those routes, economy mode or hiding the page releases it within a second.
 * There is still only one kit, and a drawing call always owns its sheets. */
export function releaseRexonanceNanites() {
  if (!READY || !SHEETS) return;
  retention ??= createRexonanceCallRetention(disposeRexonanceNanites, () => work.drawing > 0);
  retention.retain();
}

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
  /** Round 3: device px from the figure's origin — the flight canvas's
   * edges (x0, y0, x1, y1), the fade margin, and a box nothing draws over
   * (the HUD label; empty when x1 ≤ x0). Without it, nothing is fenced. */
  fence?: Float32Array;
};
export type SuitExtras = {
  /** Back and mid chips, guideways being built, pulses, contact shadows. */
  before: (t: number) => void;
  /** A plate before its fit: staged metal, lattice, its flights. */
  forming: (p: number, t: number) => void;
  /** A seated plate: metal and paint (at rest on the body). */
  seat: (p: number, t: number) => void;
  unseat: () => void;
  /** A seated plate's conduit (printed, receding behind the pour). */
  conduit: (p: number, t: number) => void;
  /** Seams, rings, spall, links, beams, latches, clamps, molten, front chips. */
  after: (t: number) => void;
  /** Airborne burning material, after the shared fire's front layer. */
  firebrands: (t: number) => void;
  /** The frame's cost (ms): a one-way governor sheds the back band, comets
   * and lacquer after two slow frames. */
  cost: (ms: number) => void;
  /** drawImage calls in the last frame. */
  drawn: () => number;
  governed: () => boolean;
  /** Before any call (idle time, a throwaway instance): runs the poses
   * through step k of PRIME (no drawing), so V8 has feedback for every
   * branch when the call's own instance runs (the closures share it) instead
   * of deoptimising mid-call as each branch is first taken. Returns true once
   * every step has run. */
  prime: (k: number) => boolean;
};

// The pose scratch's slots (one Float64Array per call, made with its
// buffers): a double written to a `let` that a closure or the module holds is
// boxed into a fresh heap number on every write, so the passes write their
// poses here instead (no per-frame allocation, owner 2026-10-16).
const PX = 0; // figure px
const PY = 1;
const PZ = 2; // depth on the ring, −1 far … 1 near
const TX = 3; // the ring's unit tangent
const TY = 4;
const SPEED = 5; // along the ring, figure px per ms
const SIZE = 6; // a tile's flight: its size, frame, unfold frame and alpha
const FRAME = 7;
const UNFOLD = 8;
const ALPHA = 9;
const GLOW = 10; // the white-hot glows' ease-in
// Arguments, likewise (a double passed to a call that is not inlined is
// boxed too): a flight's fraction and its target (tilePose), a spiral's
// fraction (bornPose, implodePose), and a sprite's device centre, size,
// alpha and velocity (chip, unfold, comet).
const ARG_U = 11;
const ARG_CX = 12;
const ARG_CY = 13;
const SX = 14;
const SY = 15;
const SD = 16;
const SA = 17;
const SVX = 18;
const SVY = 19;
const ARG_T = 20; // a ring pose's time
const ROLL = 21; // a ring pose's roll (tumble frames): banked to the orbit
const ARG_LX = 22; // a tile's pathfinder's seated centre (figure px)
const ARG_LY = 23;
const FADE = 24; // the fence's fade at the sprite slots' centre (round 3)
const HALO = 25; // the crown's glow reined in while the helmet lands (round 3)
const POSE_SLOTS = 26;
/** No fence: nothing fades, nothing is kept clear. */
const OPEN = Float32Array.of(-1e9, -1e9, 1e9, 1e9, 1, 0, 0, 0, 0);
/** At most this many plates' seats ripple through the swarm at once. */
const RIPPLES = 8;
/** The core's heartbeat (LIFE.heartbeat) at t: 0 between beats, about 1 at
 * a beat's peak (a sharp rise, a slower fall); none before it starts or
 * from the seal on. */
export function createSuitExtras(env: SuitExtrasEnv, priming = false): SuitExtras | null {
  const L = LAYOUT;
  const K = SHEETS;
  const cellsImage = rexonanceNaniteSource(KIT_CELLS.src);
  const cometImage = rexonanceNaniteSource(KIT_COMETS.src);
  const fxImage = rexonanceNaniteSource(KIT_FX.src);
  const guideImage = rexonanceNaniteSource(KIT_GUIDE.src);
  if (!READY || !L || !K || !cellsImage || !cometImage || !fxImage || !guideImage) return null;
  const { flight, s, ox, oy, all, gold, source, sheet } = env;
  const fence = env.fence ?? OPEN;
  // The implosion's reach (round 3): the radius round the core that the
  // flight canvas holds (the figure's box without a fence), figure px.

  const inset = env.fence ? fence[4] / s : 0;
  const edgeL = (env.fence ? fence[0] / s : 0) + inset;
  const edgeT = (env.fence ? fence[1] / s : 0) + inset;
  const edgeR = (env.fence ? fence[2] / s : W) - inset;
  const edgeB = (env.fence ? fence[3] / s : H) - inset;
  const reach = Math.max(
    60,
    Math.min(CORE_X - edgeL, edgeR - CORE_X, CORE_Y - edgeT, edgeB - CORE_Y),
  );

  const P = all.length;
  if (L.kind.length !== P) return null;
  if (!priming) {
    calls += 1;
    retention?.acquire();
  }
  const metal = K.metal;
  const silhouette = K.silhouette;
  const holo = K.holo;
  const walls = K.walls;
  const rails = K.rails;
  const molten = K.molten;
  const hot = K.hot;
  const lattice = K.lattice;
  // The clamps' frames: the gold regrade when prepared, else the kit's own.
  const clampImage = K.clamps ?? fxImage;
  const clampX0 = K.clamps ? 0 : KIT_FX.clamp.x;
  const clampY0 = K.clamps ? 0 : KIT_FX.clamp.y;

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
  const chipG = new Float32Array(CHIPS); // its banking glint (0 none … 1)
  const ripples = new Float32Array(RIPPLES * 4);
  // Round 3 (legibility, review 38): each frame, the gold boxes of the plates
  // being staged or printed (the back and mid chips dim inside them), and
  // which plates show their latch (the next LATCHES to seat).
  const busy = new Uint8Array(BUSY_W * BUSY_H);
  const latched = new Uint8Array(P);
  // The frame's sprite budget and staged-plate cap (the governor lowers them).
  const limit = Int32Array.of(BUDGET, JIGS);
  const ringCount = new Float32Array(RINGS);
  const LINKS = 1200;
  const links = new Float32Array(LINKS * 5);
  let linkCount = 0;
  const SPARKS = 160;
  const sparks = new Float32Array(SPARKS * 4);
  let sparkCount = 0;
  // Sparse, articulated docking keys: x/y, local axis, jaw span, opening,
  // heat and visibility. These are line batches, not more sprite layers.
  const DOCKS = TOUCH ? 24 : 128;
  const docks = new Float32Array(DOCKS * 8);
  let dockCount = 0;
  // Three micro-machines weld into each readable carrier before its face
  // unfolds into armour. Batched geometry keeps the existing bitmap budget.
  const FUSIONS = TOUCH ? 32 : 128;
  const fusions = new Float32Array(FUSIONS * 6);
  let fusionCount = 0;
  const beams = new Float32Array(P * 4);
  const beamU = new Float32Array(P * 2);
  const GOLD_N = gold.lock.length;
  const pulsesPre = new Int32Array(Math.max(1, GOLD_N));
  let pulsePreCount = 0;
  const pulsesPost = new Int32Array(Math.max(1, GOLD_N));
  let pulsePostCount = 0;
  // The weld heads: curves along the channel (device px: start, control,
  // end) by alpha bucket, their glowing tips (x, y, alpha), and the latches'
  // lasers.
  const SEGS = 6144;
  const segs = new Float32Array(SEGS * 6);
  const segBucket = new Uint8Array(SEGS);
  let segCount = 0;
  const TIPS = 192;
  const tips = new Float32Array(TIPS * 3);
  let tipCount = 0;
  const lasers = new Float32Array(P * 4);
  let laserCount = 0;
  const fades = new Int32Array(4096);
  const fadeA = new Float32Array(4096);
  let fadeCount = 0;
  const RECT_CAP = 2048;
  const rects = new Float32Array(RECT_BUCKETS * RECT_CAP * 3);
  const rectCount = new Int32Array(RECT_BUCKETS);
  let draws = 0;
  let comets = 0;
  let heroes = 0;
  // The lock flashes drawn this frame (a typed slot, not a boxed let).
  const lockFlashes = new Int32Array(1);
  let governed = false;
  let slow = 0;
  let frames = 0;
  let transformed = false;
  let conduits = 0;
  const pose = new Float64Array(POSE_SLOTS);
  pose[GLOW] = 1;

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
    if (L.flags[p] & 16) {
      const u = 1 - lambda;
      const angle = reactorCoilAngle(u);
      const scale = reactorCoilScale(u);
      const cos = Math.cos(angle) * scale;
      const sin = Math.sin(angle) * scale;
      const negativeSin = sin ? -sin : 0;
      jig[o] = cos;
      jig[o + 1] = sin;
      jig[o + 2] = negativeSin;
      jig[o + 3] = cos;
      jig[o + 4] = (CORE_X - cos * CORE_X - negativeSin * CORE_Y) * s + ox;
      jig[o + 5] = (CORE_Y - sin * CORE_X - cos * CORE_Y) * s + oy;
      return;
    }
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
  // Every plate is at rest on its seat by its fit F (owner, 2026-10-16:
  // 「前がけの生成完了時にズレるのを修正して。」): it swings down over the
  // first SLAM of [F − seat, F], rings out past the seat over the rest and is
  // still at F, so its print, its gold, the molten band and the cooling cells
  // (all drawn at the seat once it has seated) never meet an offset plate.
  // A3: a tail segment's in-plane hinge (root → blade swings wider), and its
  // ring-out past the seat, ending at F.
  const hingeAt = (p: number, t: number, lambda: number) => {
    if (L.kind[p] === 0) {
      if (L.flags[p] & 8) return 0;
      return L.hinge[p] * (1 - smooth((t - all[p].fit + RAIL_LEAD) / (RAIL_LEAD - RAIL_ALIGN)));
    }
    if (L.kind[p] !== 1) return 0;
    const F = all[p].fit;
    const k = L.segment[p];
    const ring = F - SW.seat * (1 - SLAM);
    if (t >= F) return 0;
    if (t >= ring) {
      const v = (t - ring) / (F - ring);
      return ((3 * Math.PI) / 180) * Math.sin(Math.PI * v) * (1 - v);
    }
    return lambda > 0 ? (-(10 + 4 * k) * Math.PI * lambda) / 180 : 0;
  };
  // A3: a ribbon flutters as it swings down, and is still at its seat.
  const swayAt = (p: number, t: number) => {
    if (L.kind[p] !== 2) return 0;
    const r = (all[p].fit - t) / SW.sway;
    if (r <= 0 || r >= 1) return 0;
    return 0.1 * r * r * Math.sin(3 * Math.PI * (1 - r));
  };
  // λ: lifted until the plate fills, swung down over the seat, then a ring-out
  // that ends at F. Plates formed in place (the helmet, the tassets) stay at 0.
  const lambdaAt = (p: number, t: number) => {
    const F = all[p].fit;
    if (L.flags[p] & 16) return Math.max(0, Math.min(1, (F - t) / REXONANCE_SUIT_REVEAL_MS));
    if (L.kind[p] === 3 || L.flags[p] & 8) return 0;
    if (t >= F) return 0;
    if (L.kind[p] === 0) {
      const before = F - t;
      // Hinge alignment (64ms), sliding insertion (64ms), then the short
      // compression stroke. No spring or registration drift survives F.
      if (before >= RAIL_LEAD) return 1;
      if (before >= RAIL_ALIGN)
        return 1 - 0.28 * smooth((RAIL_LEAD - before) / (RAIL_LEAD - RAIL_ALIGN));
      if (before >= RAIL_INSERT)
        return 0.72 - 0.64 * smooth((RAIL_ALIGN - before) / (RAIL_ALIGN - RAIL_INSERT));
      return 0.08 * (1 - smooth((RAIL_INSERT - before) / RAIL_INSERT));
    }
    if (t >= F - SW.seat) {
      const u = (t - F + SW.seat) / SW.seat;
      if (u >= SLAM) {
        const v = (u - SLAM) / (1 - SLAM);
        return -0.12 * Math.sin(Math.PI * v) * (1 - v);
      }
      const w = u / SLAM;
      return L.lam0[p] * (1 - w * w * w);
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
  // Round 3: the fence's fade at the sprite slots' centre (pose[FADE]): 0 on
  // and past the flight canvas's edges and inside the label kept clear,
  // rising to 1 over the fence's margin, so no sprite meets a straight cut
  // and none sits on the HUD's glyphs.
  // (By the nearest of them; no variable that mixes integers and doubles,
  // which V8 would box.)
  const fenceFade = () => {
    const x = pose[SX];
    const y = pose[SY];
    const across = x - fence[0] < fence[2] - x ? x - fence[0] : fence[2] - x;
    const down = y - fence[1] < fence[3] - y ? y - fence[1] : fence[3] - y;
    const edge = across < down ? across : down;
    const gx = x < fence[5] ? fence[5] - x : x > fence[7] ? x - fence[7] : 0;
    const gy = y < fence[6] ? fence[6] - y : y > fence[8] ? y - fence[8] : 0;
    const clear =
      fence[7] <= fence[5] ? edge : gx > gy ? (gx < edge ? gx : edge) : gy < edge ? gy : edge;
    const u = clear <= 0 ? 0 : clear >= fence[4] ? 1 : clear / fence[4];
    pose[FADE] = u * u * (3 - 2 * u);
  };
  const rect = (bucket: number, x: number, y: number, d: number) => {
    const k = rectCount[bucket];
    if (k >= RECT_CAP) return;
    const o = (bucket * RECT_CAP + k) * 3;
    rects[o] = x;
    rects[o + 1] = y;
    rects[o + 2] = d;
    rectCount[bucket] = k + 1;
  };
  // Touch keeps the same tone/alpha batches and sprite budget. Large
  // carriers have a six-sided shell and a recessed socket: the former
  // two-rectangle approximation looked like a luminous cross when scaled.
  // Tiny chips remain one rect, where facets would be subpixel anyway.
  const hexRects = (x: number, y: number, d: number, socket = false) => {
    if (d < 5) {
      flight.rect(x - 0.4 * d, y - 0.4 * d, 0.8 * d, 0.8 * d);
      return;
    }
    flight.moveTo(x - d * 0.5, y);
    flight.lineTo(x - d * 0.25, y - d * 0.43);
    flight.lineTo(x + d * 0.25, y - d * 0.43);
    flight.lineTo(x + d * 0.5, y);
    flight.lineTo(x + d * 0.25, y + d * 0.43);
    flight.lineTo(x - d * 0.25, y + d * 0.43);
    flight.closePath();
    if (!socket) return;
    // Reverse winding leaves a dark mechanical recess through the shell.
    flight.moveTo(x - d * 0.28, y);
    flight.lineTo(x - d * 0.14, y + d * 0.24);
    flight.lineTo(x + d * 0.14, y + d * 0.24);
    flight.lineTo(x + d * 0.28, y);
    flight.lineTo(x + d * 0.14, y - d * 0.24);
    flight.lineTo(x - d * 0.14, y - d * 0.24);
    flight.closePath();
  };
  const flushRects = () => {
    for (let bucket = 0; bucket < RECT_BUCKETS; bucket += 1) {
      const count = rectCount[bucket];
      if (!count) continue;
      const tone = (bucket / 3) | 0;
      const level = bucket - tone * 3;
      flight.globalAlpha = RECT_ALPHA[level];
      flight.fillStyle = RECT_SHADES[tone];
      flight.beginPath();
      for (let k = 0; k < count; k += 1) {
        const o = (bucket * RECT_CAP + k) * 3;
        const d = rects[o + 2];
        const off = d > 4 ? 0.22 * d : 1;
        hexRects(rects[o] + off, rects[o + 1] + off, d);
      }
      flight.fill();
      flight.fillStyle = RECT_TONES[tone];
      flight.beginPath();
      for (let k = 0; k < count; k += 1) {
        const o = (bucket * RECT_CAP + k) * 3;
        hexRects(rects[o], rects[o + 1], rects[o + 2], true);
      }
      flight.fill();
      if (level > 0) {
        flight.fillStyle = "#f4fbff";
        flight.beginPath();
        for (let k = 0; k < count; k += 1) {
          const o = (bucket * RECT_CAP + k) * 3;
          const d = rects[o + 2];
          if (d < 5) continue;
          flight.rect(rects[o] - 0.1 * d, rects[o + 1] - 0.1 * d, 0.2 * d, 0.2 * d);
        }
        flight.fill();
      }
      rectCount[bucket] = 0;
    }
    flight.globalAlpha = 1;
  };
  // A square sprite centred on (x, y), d device px across, on whole device
  // pixels: each fractional drawImage argument is boxed into a fresh heap
  // number on every call (no per-frame allocation, owner 2026-10-16).
  const sprite = (
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    x: number,
    y: number,
    d: number,
  ) => {
    const k = Math.round(d) || 1;
    flight.drawImage(image, sx, sy, sw, sh, Math.round(x - k / 2), Math.round(y - k / 2), k, k);
  };
  // The busiest paths already hold their centre in the pose. Pass only
  // integer atlas indices and the existing rounded bitmap size, not three
  // newly boxed doubles. The sampled rectangle stays pixel-identical.
  const poseSprite = (
    image: CanvasImageSource,
    sx: number,
    sy: number,
    edge: number,
    k: number,
  ) => {
    flight.drawImage(
      image,
      sx,
      sy,
      edge,
      edge,
      Math.round(pose[SX] - k / 2),
      Math.round(pose[SY] - k / 2),
      k,
      k,
    );
  };
  // A hex chip at the pose's sprite slots (SX, SY device centre, SD device
  // size, SA alpha), in its tumble frame.
  const chip = (frame: number, tone: number, hero = false) => {
    const x = pose[SX];
    const y = pose[SY];
    const d = pose[SD];
    const alpha = pose[SA];
    if (alpha <= 0.01 || d < 0.5) return;
    if (TOUCH) {
      // Touch: two-tone rects that pulse with the tumble; a few heroes.
      if (hero && heroes < HEROES) heroes += 1;
      else {
        if (alpha < 0.12) return;
        const pulse = 0.55 + 0.45 * Math.abs(Math.cos((TAU * frame) / FRAMES));
        const side = d * pulse * 0.9;
        rect(
          (tone < GOLD_TONE ? tone : GOLD_TONE) * 3 + (alpha < 0.4 ? 0 : alpha < 0.75 ? 1 : 2),
          x,
          y,
          side > 2 ? side : 2,
        );
        return;
      }
    }
    if (draws >= limit[0]) return;
    draws += 1;
    flight.globalAlpha = alpha >= 1 ? 1 : alpha;
    const t = tone > GOLD_TONE ? ICE : tone;
    const e = d * SPRITE;
    const k = Math.round(e) || 1;
    if (e <= MIP_BELOW) poseSprite(cellsImage, MIP_X[t] + 16 * frame, MIP_Y[t], 16, k);
    else poseSprite(cellsImage, 32 * frame, 32 * t, 32, k);
  };
  // A chip unfolding into its tile (frame k), at the sprite slots.
  const unfold = (k: number, tone: number) => {
    const x = pose[SX];
    const y = pose[SY];
    const d = pose[SD];
    if (TOUCH && heroes >= HEROES) {
      rect((tone < WHITE ? tone : WHITE) * 3 + 2, x, y, d * 0.8);
      return;
    }
    if (TOUCH) heroes += 1;
    if (draws >= limit[0]) return;
    draws += 1;
    flight.globalAlpha = pose[SA];
    const t = tone >= 3 ? ICE : tone;
    poseSprite(cellsImage, UNFOLD_X[t] + 32 * k, KIT_CELLS.unfold.y, 32, Math.round(d) || 1);
  };
  // A comet from the sprite slots' centre along their velocity (SVX, SVY).
  const comet = (tone: number) => {
    if (TOUCH || governed || comets >= COMET_BUDGET || draws >= limit[0]) return;
    const vx = pose[SVX];
    const vy = pose[SVY];
    const length = (vx * vx + vy * vy) ** 0.5;
    if (length < 4) return;
    let a = Math.round(Math.atan2(vy, vx) / (Math.PI / 8)) % 16;
    if (a < 0) a += 16;
    const long = length >= 12 ? 1 : 0;
    const stretch = length / KIT_COMETS.tail[long];
    const k = stretch < 0.6 ? 0.6 : stretch > 2.5 ? 2.5 : stretch;
    const row = COMET_ROW[tone > GOLD_TONE ? 0 : tone] + long;
    comets += 1;
    draws += 1;
    flight.globalAlpha = 0.5 * pose[SA];
    const d = 32 * k;
    poseSprite(cometImage, 32 * a, 32 * row, 32, Math.round(d) || 1);
  };

  /* Body-born material flow. */
  // A shared three-dimensional current winds along the burning surface.
  // Phase follows body height and normal, so neighbouring machines travel
  // round the same helix rather than spinning independently in place.
  const surfacePose = (c: number) => {
    const t = pose[ARG_T];
    const lead = L.squad[c];
    const rank = L.rank[c];
    const nx = L.emitNX[c];
    const ny = L.emitNY[c];
    const th = t * 0.026 + (L.emitY[c] / H) * 9 + nx * 1.7 + rank * 0.24;
    const phase = t * 0.0027 + L.phi[lead];
    const sinTh = Math.sin(th);
    const cosTh = Math.cos(th);
    const radius = 20 + 6 * Math.sin(phase);
    const slip = radius * cosTh + rank * 2.8;
    const lift = 18 + 0.46 * radius * sinTh;
    pose[PX] = L.emitX[c] + nx * lift - ny * slip;
    pose[PY] = L.emitY[c] + ny * lift + nx * slip - 12;
    pose[PZ] = 0.78 * sinTh;
    const dr = 0.0162 * Math.cos(phase);
    const ds = dr * cosTh - radius * 0.026 * sinTh;
    const dl = 0.46 * (dr * sinTh + radius * 0.026 * cosTh);
    const dx = nx * dl - ny * ds;
    const dy = ny * dl + nx * ds;
    const tl = (dx * dx + dy * dy) ** 0.5 || 1;
    pose[TX] = dx / tl;
    pose[TY] = dy / tl;
    pose[SPEED] = tl;
    pose[ROLL] = L.chipF0[c] + (FRAMES * th) / TAU;
  };
  // The inherited firebrand opens into a two-turn material helix. Its
  // radius grows from zero at the same airborne point, then contracts
  // into the shared current with zero added position or velocity at joins.
  const bornPose = (c: number) => {
    const born = pose[ARG_U];
    const u = born < 0 ? 0 : born > 1 ? 1 : born;
    const flowX = pose[PX];
    const flowY = pose[PY];
    const flowZ = pose[PZ];
    const m = smooth(u);
    const envelope = Math.sin(Math.PI * u) ** 2;
    const radius = L.birthRadius[c] * envelope;
    const angle = TAU * 2.25 * u + (L.emitY[c] / H) * 9 + L.emitNX[c] * 1.7 + L.rank[c] * 0.24;
    const sinAngle = Math.sin(angle);
    const across = radius * Math.cos(angle);
    const outward = 0.55 * radius * sinAngle + 22 * envelope;
    const sx = L.brandEndX[c];
    const sy = L.brandEndY[c];
    pose[PX] = sx + (flowX - sx) * m + L.emitNX[c] * outward - L.emitNY[c] * across;
    pose[PY] = sy + (flowY - sy) * m + L.emitNY[c] * outward + L.emitNX[c] * across - 24 * envelope;
    pose[PZ] = 0.5 + (flowZ - 0.5) * m + 0.72 * sinAngle * envelope;
  };
  // A free chip imploding (fraction u of the window) from its ring pose
  // (PX, PY on entry) into the reactor.
  // Round 3 (review 31: the free chips earn their place): ahead of the seal
  // the free chips leave their rings and gather round the reactor in two
  // counter-turning orbits (pose PX, PY, PZ at the pose's ARG_T, blended in),
  // so the implosion starts from a visible vortex instead of a few strays.
  const gatherPose = (c: number) => {
    const t = pose[ARG_T];
    if (L.chipPlate[c] >= 0 || t < GATHER[0]) return;
    const m = smooth((t - GATHER[0]) / (GATHER[1] - GATHER[0]));
    const R = GATHER_R + 26 * (c % 3);
    const th = L.theta0[c] + ((c % 2 ? 1 : -1) * TAU * GATHER_SPIN * t) / 1000;
    pose[PX] += (CORE_X + R * Math.cos(th) - pose[PX]) * m;
    pose[PY] += (CORE_Y + GATHER_SQUASH * R * Math.sin(th) - pose[PY]) * m;
    pose[PZ] += (Math.sin(th) - pose[PZ]) * m;
  };
  // Round 3: the free chips start it from their orbits round the reactor
  // (gatherPose); one still farther out than the canvas holds round the
  // core is drawn in to that reach over the first third, so no spiral swings
  // past the flight canvas's edges.
  const implodePose = () => {
    const u = pose[ARG_U];
    const a = TAU * u;
    const dx = pose[PX] - CORE_X;
    const dy = pose[PY] - CORE_Y;
    const len = (dx * dx + dy * dy) ** 0.5 / reach;
    const pull = len > 1 ? 1 / (1 + (len - 1) * smooth(u / 0.3)) : 1;
    const k = (1 - u * u * u) * pull;
    pose[PX] = CORE_X + (dx * Math.cos(a) - dy * Math.sin(a)) * k;
    pose[PY] = CORE_Y + (dx * Math.sin(a) + dy * Math.cos(a)) * k;
  };

  // Where chip c is at t (figure px: pose PX, PY, depth PZ); returns its alpha
  // and writes size/tone/frame via the out arrays (index c). -1: not shown.
  const swarm = (t: number) => {
    ringCount.fill(0);
    // The plates seated in the last LIFE.ripple.ms: each sends a ripple out
    // through the swarm from its seat (accents and shock-ring plates harder).
    let rippleCount = 0;
    for (let k = 0; k < P && rippleCount < RIPPLES; k += 1) {
      const p = L.order[k];
      const age = t - all[p].fit;
      if (age < 0) break;
      if (L.kind[p] < 0 || age >= LIFE.ripple.ms) continue;
      const o = rippleCount * 4;
      ripples[o] = L.seatX[p];
      ripples[o + 1] = L.seatY[p];
      ripples[o + 2] = age;
      ripples[o + 3] = L.flags[p] & 1 ? 1.5 : L.flags[p] & 2 ? 1.2 : 1;
      rippleCount += 1;
    }
    for (let c = 0; c < CHIPS; c += 1) {
      chipBand[c] = 0;
      chipVX[c] = 0;
      chipVY[c] = 0;
      chipG[c] = 0;
      const birth = L.birth[c];
      if (t < birth) continue;
      const plate = L.chipPlate[c];
      const helm = plate >= 0 && L.kind[plate] === 3;
      let size = L.chipSize[c];
      let alpha = 1;
      let tone = L.chipTone[c];
      let spinBoost = 1;
      pose[ARG_T] = t;
      surfacePose(c);
      gatherPose(c);
      let x = pose[PX];
      let y = pose[PY];
      let z = pose[PZ];
      const gathering = plate < 0 && t >= GATHER[0];
      // A gathered chip stays crisp (never the defocused front band).
      if (gathering && z > 0.8) z = 0.8;

      const roll = pose[ROLL];
      const born = (t - birth) / L.sprayMs[c];
      if (born < 1) {
        // Material is visibly born in the fire before forming any armour.
        pose[ARG_U] = born;
        bornPose(c);
        x = pose[PX];
        y = pose[PY];
        z = pose[PZ];
        size *= 0.28 + 0.72 * smooth(born);
        alpha *= smooth((t - birth) / FIREBRAND_COOL);
        if (born < 0.62) tone = WHITE;
        spinBoost = 2;
        if (!TOUCH && !governed && t - 24 >= birth) {
          // Its streak along the arm.
          pose[ARG_T] = t - 24;
          surfacePose(c);
          pose[ARG_U] = (t - 24 - birth) / L.sprayMs[c];
          bornPose(c);
          chipVX[c] = (x - pose[PX]) * s;
          chipVY[c] = (y - pose[PY]) * s;
        }
      } else if (!TOUCH && c % 3 === 0 && !governed && !gathering) {
        // Comets from the ring's own speed (its travel over 24 ms, along its
        // tangent).
        const travel = 24 * pose[SPEED] * s;
        chipVX[c] = pose[TX] * travel;
        chipVY[c] = pose[TY] * travel;
      }
      if (helm && t >= SW.crown[0]) {
        // The head material gathers against the face's real receiver,
        // never in an isolated crown suspended above the head.
        const m = smooth((t - SW.crown[0]) / (SW.crown[1] - SW.crown[0]));
        const a = L.crownA[c] + (TAU * 0.5 * (t - SW.crown[0])) / 1000;
        const R = 10 + 12 * Math.sin(a * 0.5) ** 2;
        const cx = L.emitX[c] + L.emitNX[c] * R + 3 * Math.sin(a);
        const cy = L.emitY[c] + L.emitNY[c] * R - 4;
        x += (cx - x) * m;
        y += (cy - y) * m;
        z += (0.3 + 0.2 * Math.sin(a) - z) * m;
        // Round 3 (review 18): its near side never swells past nanite size.
        if (z > 0.6) z = 0.6;
        // A golden crown.
        if (m > 0.2) tone = c % 4 ? GOLD_TONE : WHITE;
        alpha *= 1.5;
        size *= 1 + 0.1 * m;
        chipVX[c] = 0;
        chipVY[c] = 0;
        if (t >= L.drainAt[c]) {
          // Local magnetic capture: a short skin-level curved approach.
          const u = (t - L.drainAt[c]) / 120;
          if (u >= 1) continue;
          const e = easeOut(u);
          x = cx + (L.seatX[plate] - cx) * e + 4 * Math.sin(Math.PI * u);
          y = cy + (L.seatY[plate] - cy) * e;
          z = 0.5;
          alpha *= 1 - u * u;
          spinBoost = 3;
        }
      } else if (plate >= 0 && t >= L.drainAt[c]) {
        // N4: drained along its plate's river to the gate, fading there.
        const u = (t - L.drainAt[c]) / L.drainMs[c];
        if (u >= 1) continue;
        pose[ARG_T] = L.drainAt[c];
        surfacePose(c);
        const p0x = pose[PX];
        const p0y = pose[PY];
        const p1x = p0x + pose[TX] * 0.12 * H;
        const p1y = p0y + pose[TY] * 0.12 * H;
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
        chipVX[c] = dvx * 6 * u * (1 - u) * (24 / L.drainMs[c]) * s;
        chipVY[c] = dvy * 6 * u * (1 - u) * (24 / L.drainMs[c]) * s;
        z = 0.2;
        alpha *= u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
        spinBoost = 3;
      } else if (plate < 0 && t >= SW.implode[0]) {
        // N12: the free chips spiral into the reactor at the seal, white-hot,
        // streaking along their spiral.
        const u = (t - SW.implode[0]) / (SW.implode[1] - SW.implode[0]);
        if (u >= 1) continue;
        pose[ARG_U] = u;
        implodePose();
        x = pose[PX];
        y = pose[PY];
        size *= 1.5 * (1 - 0.6 * u);
        alpha = 1.35 * (1 - u * u * u * u) * (0.55 + 0.45 * smooth(u / 0.35));
        tone = c % 3 ? WHITE : tone;
        z = 0.6;
        chipVX[c] = 0;
        chipVY[c] = 0;
        if (!TOUCH && !governed) {
          pose[ARG_T] = t - 24;
          surfacePose(c);
          gatherPose(c);
          pose[ARG_U] = Math.max(0, u - 24 / (SW.implode[1] - SW.implode[0]));
          implodePose();
          chipVX[c] = (x - pose[PX]) * s;
          chipVY[c] = (y - pose[PY]) * s;
        }
      }
      const onRing =
        born >= 1 &&
        !(plate >= 0 && t >= L.drainAt[c]) &&
        !(helm && t >= SW.crown[0]) &&
        !gathering;
      if (onRing) ringCount[L.ring[c]] += 1;
      // The seats' ripples: a chip in a front is pushed out from the seat,
      // flares and is flipped over by it, then falls back into its place.
      let kick = 0;
      for (let k = 0; k < rippleCount; k += 1) {
        const o = k * 4;
        const dx = x - ripples[o];
        const dy = y - ripples[o + 1];
        const dist = (dx * dx + dy * dy) ** 0.5 || 1;
        const age = ripples[o + 2];
        const a = (dist - LIFE.ripple.speed * age) / LIFE.ripple.width;
        if (a * a >= 9) continue;
        const fall = 1 - age / LIFE.ripple.ms;
        const g = Math.exp(-a * a) * fall * fall * ripples[o + 3];
        x += (dx / dist) * LIFE.ripple.push * g;
        y += (dy / dist) * LIFE.ripple.push * g;
        kick += g;
      }
      if (kick > 0) alpha *= 1 + 0.35 * (kick < 1 ? kick : 1);
      const depth = 1 + 0.45 * z;
      size *= depth;
      alpha *= 0.55 + 0.22 * (z + 1);
      const imploding = plate < 0 && t >= SW.implode[0];
      const crowned = helm && t >= SW.crown[0];
      // Round 3: a free chip gathered round the reactor heats up, white-hot
      // on the near side of its orbit.
      const heated = gathering && !imploding && z > -0.15 && t >= GATHER[0] + GATHER_HEAT;
      if (heated && c % 3) tone = WHITE;
      // Band 5: white-hot, face-on, over a glow (the free chips feeding the
      // reactor at the seal, and the crown's gold).
      const band =
        imploding || heated || (crowned && z > -0.15)
          ? 5
          : z < -0.15
            ? 1
            : z <= 0.35
              ? 2
              : z > BOKEH_Z && !helm
                ? 4
                : 3;
      if (band === 1 && !crowned) {
        // Behind the body: dimmed where the undersuit stands.
        const cx = Math.floor((x / W) * OCC_W);
        const cy = Math.floor((y / H) * OCC_H);
        if (cx >= 0 && cy >= 0 && cx < OCC_W && cy < OCC_H)
          alpha *= 1 - (0.8 * L.occupancy[cy * OCC_W + cx]) / 255;
      }
      if (band <= 4 && !crowned) {
        // Round 3: over a plate being staged or printed, the back and mid
        // chips step back, so the plate forming is the beat's subject; the
        // defocused front chips (review 50) leave it clear.
        const cx = Math.floor((x / W) * BUSY_W);
        const cy = Math.floor((y / H) * BUSY_H);
        if (cx >= 0 && cy >= 0 && cx < BUSY_W && cy < BUSY_H) {
          const occupied = busy[cy * BUSY_W + cx];
          // Articulated panels need their silhouette and key teeth readable
          // through the near band too, across the whole carriage travel.
          if (occupied === 2) alpha *= band === 4 ? 0 : 0.12;
          else if (occupied && band !== 3) alpha *= band === 4 ? 0 : BUSY_DIM;
        }
      }
      if (band === 3 && alpha > 0.7) alpha = 0.7;
      chipBand[c] = band;
      chipX[c] = x * s;
      chipY[c] = y * s;
      chipD[c] = size * s;
      pose[SX] = chipX[c];
      pose[SY] = chipY[c];
      fenceFade();
      chipA[c] = alpha * pose[FADE];
      chipT[c] = tone;
      // White-hot chips turn face-on (their lit core) with a small wobble.
      // (Wrapped here rather than by a call: no boxed argument.)
      // On its ring it is banked to the orbit (ROLL): one in three exactly,
      // so its lit face comes round and glints as it swings in; the others a
      // few frames either way, all wobbling; a ripple flips it over.
      const turn =
        band === 5
          ? 1.5 * Math.sin((TAU * L.chipSpin[c] * t) / 1000 + L.phi[c])
          : onRing
            ? roll +
              (c % 3 ? (L.chipF0[c] - FRAMES / 2) / 3 : 0) +
              1.6 * Math.sin((TAU * L.chipSpin[c] * t) / 1000 + L.phi[c]) +
              0.6 * FRAMES * (kick < 1 ? kick : 1)
            : L.chipF0[c] + (FRAMES * L.chipSpin[c] * spinBoost * t) / 1000;
      const frame = Math.floor(turn) % FRAMES;
      chipF[c] = frame < 0 ? frame + FRAMES : frame;
      if (onRing && band === 3 && c % 3 === 0 && !TOUCH && !governed) {
        // Its specular glint, while its face is within a frame of the viewer.
        let d = turn - FRAMES * Math.floor(turn / FRAMES);
        if (d > FRAMES / 2) d -= FRAMES;
        if (d < 0) d = -d;
        if (d < 1.2) chipG[c] = (1 - d / 1.2) * smooth((z - 0.35) / 0.3);
      }
    }
  };
  // A bounded set of filaments traces the machines' actual helical paths.
  // Sampling the closed-form pose keeps the curl visible even between
  // sparse carrier sprites, and gives reverse playback the identical wake.
  const lanes = (front: boolean, t: number) => {
    const fade = 1 - smooth((t - 600) / 350);
    if (fade <= 0 || TOUCH || governed) return;
    flight.lineWidth = Math.max(0.6, 0.5 * s);
    flight.globalAlpha = (front ? 0.22 : 0.09) * fade;
    flight.strokeStyle = "#a7ffd1";
    flight.beginPath();
    for (let c = 0; c < CHIPS; c += LIFE.squad.size) {
      const band = chipBand[c];
      if (!band || (front ? band < 3 : band >= 3)) continue;
      const age = t - L.birth[c];
      if (age < 12 || age > L.sprayMs[c]) continue;
      const trail = Math.min(age, L.sprayMs[c] * 0.5);
      for (let k = 0; k <= 8; k += 1) {
        pose[ARG_T] = t - trail * (1 - k / 8);
        surfacePose(c);
        pose[ARG_U] = (pose[ARG_T] - L.birth[c]) / L.sprayMs[c];
        bornPose(c);
        const x = Math.round(pose[PX] * s);
        const y = Math.round(pose[PY] * s);
        if (k === 0) flight.moveTo(x, y);
        else flight.lineTo(x, y);
      }
    }
    flight.stroke();
  };
  // Keep only the short metal handoff above the shared flame field.
  const firebrands = (t: number) => {
    if (t < FIREBRAND_START || t >= FIRE_BIRTH + FIRE_BIRTH_SPAN + FIREBRAND_CARRIER) return;
    base();
    for (let c = 0; c < CHIPS; c += FIREBRAND_STRIDE) {
      const age = t - L.birth[c];
      // The connected vortex owns all fire. Airborne endpoints still seed
      // the nanite spiral, but never carry detached candle-like sprites.
      if (age < 0 || age >= FIREBRAND_CARRIER) continue;
      if (age >= 0 && chipBand[c] > 0) {
        // The broad surrounding plume would otherwise hide the little
        // metal carrier at the handoff. Bring only its birth interval to
        // the front, following the exact same machine pose underneath.
        // Touch uses its batched faceted rects, never more hero textures.
        pose[SX] = chipX[c];
        pose[SY] = chipY[c];
        pose[SD] = chipD[c];
        fenceFade();
        pose[SA] =
          smooth(age / FIREBRAND_COOL) *
          (1 - smooth((age - FIREBRAND_COOL) / (FIREBRAND_CARRIER - FIREBRAND_COOL))) *
          pose[FADE];
        chip(chipF[c], chipT[c]);
      }
    }
    if (TOUCH) flushRects();
    flight.globalAlpha = 1;
  };
  const drawChips = (from: number, to: number) => {
    let glints = 0;
    for (let c = 0; c < CHIPS; c += 1) {
      const band = chipBand[c];
      if (band < from || band > to) continue;
      if (band === 1 && governed) continue;
      const x = chipX[c];
      const y = chipY[c];
      pose[SX] = x;
      pose[SY] = y;
      pose[SA] = chipA[c];
      if (chipVX[c] || chipVY[c]) {
        pose[SVX] = chipVX[c];
        pose[SVY] = chipVY[c];
        comet(chipT[c]);
      }
      if (band === 5 && !TOUCH && draws < limit[0]) {
        // Its glow: the warm or white bokeh, faint and wide. Round 3 (review
        // 18): a crown chip's glow shrinks to 1.2x the chip, at most 0.5,
        // while the helmet's tiles land, so the forming helmet stays legible.
        draws += 1;
        const crown = L.chipPlate[c] >= 0 && L.kind[L.chipPlate[c]] === 3 ? pose[HALO] : 0;
        const g = chipD[c] * (2.4 - 1.2 * crown) * SPRITE;
        const glowTone = chipT[c] === GOLD_TONE ? GOLD_TONE : WHITE;
        let glow = 0.4 * chipA[c] * pose[GLOW];
        if (crown > 0 && glow > 0.5) glow = 0.5;
        flight.globalAlpha = glow < 1 ? glow : 1;
        sprite(cellsImage, BOKEH_X[glowTone], BOKEH_Y[glowTone], 32, 32, x, y, g);
      }
      if (band === 4) {
        if (TOUCH) {
          pose[SD] = chipD[c] * 1.3;
          pose[SA] = chipA[c] * 0.6;
          chip(chipF[c], chipT[c]);
          continue;
        }
        if (draws >= limit[0] || chipA[c] <= 0.01) continue;
        draws += 1;
        const d = chipD[c] * 1.6 * SPRITE;
        const t = chipT[c] > GOLD_TONE ? ICE : chipT[c];
        flight.globalAlpha = BOKEH_A * (chipA[c] < 1 ? chipA[c] : 1);
        sprite(cellsImage, BOKEH_X[t], BOKEH_Y[t], 32, 32, x, y, d);
        continue;
      }
      pose[SD] = chipD[c];
      chip(chipF[c], chipT[c]);
      const glint = chipG[c];
      if (glint > 0.05 && glints < LIFE.glint.most && draws < limit[0]) {
        // The banking glint: the kit's star, brightest face-on.
        glints += 1;
        draws += 1;
        const k = glint > 0.66 ? 0 : glint > 0.33 ? 1 : 2;
        flight.globalAlpha = 0.85 * glint * (chipA[c] < 0.7 ? chipA[c] / 0.7 : 1);
        sprite(
          cellsImage,
          KIT_CELLS.spark.x + 32 * k,
          KIT_CELLS.spark.y,
          32,
          32,
          x,
          y,
          chipD[c] * 1.9,
        );
      }
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
  // A gold cell's clip rect, half a pixel proud of the cell on every side,
  // on whole device pixels (a fractional argument is boxed on every call).
  const cellRect = (i: number) => {
    const x0 = Math.round(gold.fx[i] * s - 0.5);
    const y0 = Math.round(gold.fy[i] * s - 0.5);
    flight.rect(
      x0,
      y0,
      Math.round((gold.fx[i] + gold.cw[i]) * s + 0.5) - x0,
      Math.round((gold.fy[i] + gold.ch[i]) * s + 0.5) - y0,
    );
  };
  // A tile's rect on whole device pixels (as the landed clips draw it).
  const tileRect = (tile: Plate["tiles"][number]) => {
    const x0 = Math.round(tile.dx * s);
    const y0 = Math.round(tile.dy * s);
    flight.rect(
      x0,
      y0,
      Math.round((tile.dx + tile.tw) * s) - x0,
      Math.round((tile.dy + tile.th) * s) - y0,
    );
  };
  const cellClip = (from: number, to: number) => {
    flight.beginPath();
    for (let i = from; i < to; i += 1) cellRect(i);
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
  // A plate from the half-resolution silhouette (round 3).
  const shadowDraw = (image: CanvasImageSource, p: number, dx: number, dy: number) => {
    const piece = all[p].piece;
    draws += 1;
    flight.drawImage(
      image,
      piece.ax / 2,
      piece.ay / 2,
      piece.w / 2,
      piece.h / 2,
      (piece.x + dx) * s,
      (piece.y + dy) * s,
      piece.w * s,
      piece.h * s,
    );
  };
  // The conduit's face: its walls twice in parallax (G5), the hard-light

  // glass faint over the raw channel, the gold rails solid.
  const conduitFace = (p: number, t: number) => {
    if (walls && !governed) {
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
    for (let k = from; k < to; k += 1) cellRect(L.buildIdx[k]);
    flight.clip();
  };
  // Cells of [from, to) printed (build ≤ front) or not, as one clip.
  const printClip = (from: number, to: number, front: number, printed: boolean) => {
    flight.beginPath();
    for (let i = from; i < to; i += 1) {
      if (L.buildFrac[i] <= front !== printed) continue;
      cellRect(i);
    }
    flight.clip();
  };
  // The weld head of plate p at a front (of its buildFrac): its channel's
  // segments behind the front over the band, by age, and the part of each
  // next segment the front has reached (so the head runs smoothly between
  // cells), whose ends glow (at most most of them). Returns the tips added.
  // A curve of the channel through cell j (the control) from midway between
  // its predecessor and j to (x, y): the channel's cell steps round into a
  // smooth line (滑らかに).
  const seg = (j: number, x: number, y: number, bucket: number) => {
    if (segCount >= SEGS) return;
    const o = segCount * 6;
    const cx = L.chanX[j] * s;
    const cy = L.chanY[j] * s;
    const a = L.chanPrev[j];
    segs[o] = a < 0 ? cx : (L.chanX[a] * s + cx) / 2;
    segs[o + 1] = a < 0 ? cy : (L.chanY[a] * s + cy) / 2;
    segs[o + 2] = cx;
    segs[o + 3] = cy;
    segs[o + 4] = x;
    segs[o + 5] = y;
    segBucket[segCount] = bucket;
    segCount += 1;
  };
  const tip = (x: number, y: number, alpha: number) => {
    if (tipCount >= TIPS) return;
    const o = tipCount * 3;
    tips[o] = x;
    tips[o + 1] = y;
    tips[o + 2] = alpha;
    tipCount += 1;
  };
  const trace = (p: number, front: number, band: number, most: number) => {
    const a0 = L.chanFirst[p];
    const a1 = L.chanFirst[p + 1];
    if (a1 <= a0 || front <= 0) return 0;
    const from = front - band;
    const reach = front + 1.5 * L.cellFrac[p];
    let lo = a0;
    let hi = a1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (L.chanFrac[mid] <= from) lo = mid + 1;
      else hi = mid;
    }
    let added = 0;
    let newest = -1;
    for (let k = lo; k < a1; k += 1) {
      const fr = L.chanFrac[k];
      if (fr > reach) break;
      const i = L.chanIdx[k];
      const j = L.chanPrev[i];
      const x1 = L.chanX[i] * s;
      const y1 = L.chanY[i] * s;
      if (fr <= front) {
        const age = (front - fr) / band;
        const bucket = age < 0.34 ? 0 : age < 0.67 ? 1 : 2;
        // A trim's first cell: a dot (its curve starts and ends on it).
        if (j < 0) seg(i, x1 + 0.01, y1, bucket);
        else {
          const x0 = L.chanX[j] * s;
          const y0 = L.chanY[j] * s;
          seg(j, (x0 + x1) / 2, (y0 + y1) / 2, bucket);
          // The newest reach on to the cell itself.
          if (bucket === 0) seg(i, x1 + 0.01, y1, 0);
        }
        newest = k;
        continue;
      }
      if (j < 0 || L.buildFrac[j] > front) continue;
      const fj = L.buildFrac[j];
      const gap = fr - fj;
      const w = gap > 1e-6 ? (front - fj) / gap : 1;
      const x0 = L.chanX[j] * s;
      const y0 = L.chanY[j] * s;
      const xt = x0 + (x1 - x0) * w;
      const yt = y0 + (y1 - y0) * w;
      seg(j, xt, yt, 0);
      if (added < most) {
        tip(xt, yt, 1);
        added += 1;
      }
    }
    if (!added && most && newest >= 0) {
      // The build's last cells: the glow rests on the newest, fading out.
      const i = L.chanIdx[newest];
      const fade = 1 - (front - L.chanFrac[newest]) / band;
      if (fade > 0.05) {
        tip(L.chanX[i] * s, L.chanY[i] * s, fade);
        added = 1;
      }
    }
    return added;
  };
  const flushHeads = () => {
    if (!segCount) return;
    flight.lineCap = "round";
    flight.lineJoin = "round";
    for (let pass = 0; pass < 2; pass += 1) {
      flight.strokeStyle = pass ? "#fff8dc" : "#e9ae43";
      flight.lineWidth = Math.max(pass ? 0.9 : 2, G * (pass ? HEAD_CORE : HEAD_HALO) * s);
      for (let bucket = 0; bucket < 3; bucket += 1) {
        flight.beginPath();
        let any = false;
        for (let k = 0; k < segCount; k += 1) {
          if (segBucket[k] !== bucket) continue;
          const o = k * 6;
          flight.moveTo(segs[o], segs[o + 1]);
          flight.quadraticCurveTo(segs[o + 2], segs[o + 3], segs[o + 4], segs[o + 5]);
          any = true;
        }
        if (!any) continue;
        flight.globalAlpha = pass ? HEAD_CORE_A[bucket] : HEAD_HALO_A[bucket];
        flight.stroke();
      }
    }
    segCount = 0;
  };
  // The tips' glows: an ice bokeh over a small white-hot one (desktop).
  const flushTips = () => {
    for (let k = 0; k < tipCount && !TOUCH && draws < limit[0] - 1; k += 1) {
      const o = k * 3;
      const x = tips[o];
      const y = tips[o + 1];
      const halo = G * 3.4 * s;
      const core = G * 1.5 * s;
      draws += 2;
      flight.globalAlpha = 0.65 * tips[o + 2];
      sprite(cellsImage, BOKEH_X[ICE], BOKEH_Y[ICE], 32, 32, x, y, halo);
      flight.globalAlpha = 0.9 * tips[o + 2];
      sprite(cellsImage, BOKEH_X[WHITE], BOKEH_Y[WHITE], 32, 32, x, y, core);
    }
    tipCount = 0;
  };
  // Light pulses along the channel: a short dash from each pulsing channel
  // cell back to its predecessor.
  const chanStroke = (list: Int32Array, count: number) => {
    flight.lineCap = "round";
    flight.lineJoin = "round";
    flight.lineWidth = Math.max(0.8, G * PULSE_CORE * s);
    flight.beginPath();
    for (let k = 0; k < count; k += 1) {
      const i = list[k];
      const j = L.chanPrev[i];
      const x = L.chanX[i] * s;
      const y = L.chanY[i] * s;
      if (j < 0) flight.moveTo(x - 0.01, y);
      else flight.moveTo(L.chanX[j] * s, L.chanY[j] * s);
      flight.lineTo(x, y);
    }
    flight.stroke();
  };
  // On the body, before its plate: the solid conduit behind the head, the
  // laser's ice projection ahead of it, the weld head and its sparks, the
  // latch's laser to it, and pulses climbing what is built.
  const buildGuideway = (p: number, t: number) => {
    const plate = all[p];
    const first = plate.first;
    const end = plate.end;
    const k = builtBy(p, t);
    if (k > first) {
      flight.save();
      if (k < end) buildClip(first, k);
      conduitFace(p, t);
      flight.restore();
    }
    // The laser's projection just ahead of the head, feathered: brightest
    // at the head, fading out over its lead. Round 3: a short band, at most
    // PROJECT_CELLS cells of the build ahead of the front (and never more
    // than SW.build.ahead ms), so it runs ahead of the weld point instead of
    // ghosting the whole trim.

    const span = L.buildB[p] - L.buildA[p];
    const reach = PROJECT_CELLS * L.cellFrac[p] * span;
    const ahead = reach < SW.build.ahead ? reach : SW.build.ahead;
    let from = k;
    for (let step = 0; step < 3; step += 1) {
      const to = builtBy(p, t + (ahead * (step + 1)) / 3);
      if (to > from) {
        flight.save();
        buildClip(from, to);
        flight.globalAlpha = PROJECT_A[step];
        plateDraw(holo, p, 0, 0);
        flight.restore();
      }
      from = to;
    }
    // The weld head: a thread along the channel, its tips glowing.
    const front = span > 0 ? (t - L.buildA[p]) / span : 1;
    const band = Math.max(0.03, HEAD_CELLS * L.cellFrac[p]);
    if (k > first && front < 1 + band) {
      const lead = tipCount;
      const added = trace(p, front, band, HEAD_TIPS);
      // The front: a spark star that twinkles as it runs, the latch's laser.
      if (front <= 1) {
        let x = 0;
        let y = 0;
        if (added) {
          x = tips[lead * 3];
          y = tips[lead * 3 + 1];
        } else {
          const i = L.buildIdx[k - 1];
          x = (gold.fx[i] + gold.cw[i] / 2) * s;
          y = (gold.fy[i] + gold.ch[i] / 2) * s;
        }
        if (sparkCount < SPARKS) {
          const so = sparkCount * 4;
          // Frames 4–5: the star over a white-hot glow (see the sparks pass).
          const flicker = (Math.floor(t / 17) + p) & 1;
          sparks[so] = x;
          sparks[so + 1] = y;
          sparks[so + 2] = 4 + flicker;
          sparks[so + 3] = (TOUCH ? 11 : 14) * s * (flicker ? 0.85 : 1.15);
          sparkCount += 1;
        }
        if (!TOUCH && laserCount < P && latched[p]) {
          const o = laserCount * 4;
          lasers[o] = L.seatX[p] * s;
          lasers[o + 1] = L.seatY[p] * s;
          lasers[o + 2] = x;
          lasers[o + 3] = y;
          laserCount += 1;
        }
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
        pose[SX] = x * s;
        pose[SY] = y * s;
        pose[SD] = (3.6 + 2.2 * h2) * s;
        fenceFade();
        pose[SA] = 1.1 * (1 - u * u) * pose[FADE];
        chip(wrap(FRAMES * h1 + 40 * u), h1 < 0.35 ? GOLD_TONE : WHITE);
      }
    }
    // Pulses climbing the built conduit's channel.
    if (governed) return;
    for (let j = first; j < k; j += 1) {
      const i = L.buildIdx[j];
      if (!L.chan[i]) continue;
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
      // The print head: the weld thread running up the channel, tapering
      // behind the front, its growing tips glowing.
      trace(p, front, Math.max(0.04, PRINT_CELLS * L.cellFrac[p]), TOUCH ? 0 : HEAD_TIPS);
      flushHeads();
      flushTips();
    }
    flight.globalAlpha = 1;
    if (!collect) return;
    // Pulses on the conduit not yet poured, out from the seat (the pour's way).
    const pour = firstLockAfter(p, t);
    for (let i = Math.max(unc, pour); i < plate.end; i += 1) {
      if (!L.chan[i]) continue;
      const v = PULSE_BANDS * gold.order[i] - PULSE_SPEED * t;
      if (v - Math.floor(v) < PULSE_WIDTH && pulsePostCount < pulsesPost.length)
        pulsesPost[pulsePostCount++] = i;
    }
  };
  /* The passes. */
  // The frame's busy boxes and latches (see busy, latched).
  const frameState = (t: number) => {
    busy.fill(0);
    latched.fill(0);
    let shown = 0;
    for (let k = 0; k < P; k += 1) {
      const p = L.order[k];
      if (L.kind[p] < 0) continue;
      const plate = all[p];
      const F = plate.fit;
      const appear = F - SW.project < L.buildA[p] ? F - SW.project : L.buildA[p];
      if (t >= appear && t < F + 120 && shown < LATCHES) {
        latched[p] = 1;
        shown += 1;
      }
      const mechanical = L.receiverN[p] > 0 && t >= F - RAIL_LEAD && t < F + RECEIVER_COOL;
      if (!mechanical && (!L.hasBox[p] || t < plate.spawn || t >= F + SW.print[1])) continue;
      const b = p * 4;
      const x = mechanical ? plate.piece.x - 28 : L.box[b];
      const y = mechanical ? plate.piece.y - 28 : L.box[b + 1];
      const width = mechanical ? plate.piece.w + 56 : L.box[b + 2];
      const height = mechanical ? plate.piece.h + 56 : L.box[b + 3];
      const c0 = Math.floor((x / W) * BUSY_W);
      const c1 = Math.floor(((x + width) / W) * BUSY_W);
      const r0 = Math.floor((y / H) * BUSY_H);
      const r1 = Math.floor(((y + height) / H) * BUSY_H);
      for (let r = r0 < 0 ? 0 : r0; r <= r1 && r < BUSY_H; r += 1)
        for (let c = c0 < 0 ? 0 : c0; c <= c1 && c < BUSY_W; c += 1)
          busy[r * BUSY_W + c] = mechanical ? 2 : Math.max(1, busy[r * BUSY_W + c]);
    }
  };
  const before = (t: number) => {
    frames += 1;
    draws = 0;
    lockFlashes[0] = 0;
    limit[0] = governed ? GOVERNED_BUDGET : BUDGET;
    limit[1] = governed ? GOVERNED_JIGS : JIGS;
    comets = 0;
    // Reserve the firebrands' worst-case two atlas frames from touch's
    // existing 24-image hero allowance. Machines use rect batches instead;
    // this handoff must not silently increase the low-tier GPU budget.
    heroes =
      TOUCH && t >= FIREBRAND_START && t < FIRE_BIRTH + FIRE_BIRTH_SPAN + FIREBRAND_COOL
        ? FIREBRANDS * 2
        : 0;
    linkCount = 0;
    sparkCount = 0;
    dockCount = 0;
    fusionCount = 0;
    pulsePreCount = 0;
    pulsePostCount = 0;
    segCount = 0;
    tipCount = 0;
    laserCount = 0;
    conduits = 0;
    beamU.fill(-1);
    jigged.fill(0);
    base();
    if (t < FIRE_BIRTH) {
      // This is the flame-only interval, including reverse scrubbing. No
      // old chip band or completed guide may leak out of a previous frame.
      chipBand.fill(0);
      return;
    }
    frameState(t);
    // 1. The cocoon's back and mid chips (touch: flushed now, so they lie
    // under the plates; round 3, reviews 29/41).
    swarm(t);
    lanes(false, t);
    drawChips(1, 2);
    if (TOUCH) flushRects();
    // Plates by fit: their jigs (the nearest to contact first), guideways.
    for (let k = 0; k < P; k += 1) {
      const p = L.order[k];
      if (L.kind[p] < 0) continue;
      const plate = all[p];
      const F = plate.fit;
      if (t >= plate.spawn && t < F) {
        const lambda = lambdaAt(p, t);
        if (lambda !== 0 && L.jigSlot[p] < limit[1] && L.kind[p] !== 3) {
          setJig(p, lambda, TOUCH ? 0 : hingeAt(p, t, lambda), TOUCH ? 0 : swayAt(p, t));
          jigged[p] = 1;
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
      flight.globalAlpha = 0.7;
      flight.strokeStyle = "#d8f8ff";
      chanStroke(pulsesPre, pulsePreCount);
    }
    // The laser-weld heads: threads along the channels, their tips glowing.
    flushHeads();
    flushTips();
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
          tileRect(tile);
          landed += 1;
        }
        if (landed) {
          flight.clip();
          flight.globalAlpha = 0.38;
          shadowDraw(silhouette, p, 0, 0);
        }
        flight.restore();
      }
    base();
    flight.globalAlpha = 1;
  };

  // A tile's flight (N4, N5): lane from the gate, orbit to aim, dive and
  // unfold. Writes the pose's PX, PY (figure px), SIZE, FRAME, UNFOLD (-1:
  // none) and ALPHA. Strings (LIFE.string): a plate's tiles fly in single
  // file behind their pathfinder (ARG_LX, ARG_LY: its seated centre),
  // spiral in on a shared lock-on point near it, hang there a beat with a
  // searching twitch while they turn face-on, then dart into their cells.
  const tilePose = (p: number, i: number, helm: boolean) => {
    const u = pose[ARG_U];
    const Cx = pose[ARG_CX];
    const Cy = pose[ARG_CY];
    const jo = p * 6;
    const dx = jig[jo] * L.dockX[i] + jig[jo + 2] * L.dockY[i];
    const dy = jig[jo + 1] * L.dockX[i] + jig[jo + 3] * L.dockY[i];
    const length = (dx * dx + dy * dy) ** 0.5 || 1;
    const nx = dx / length;
    const ny = dy / length;
    const qx = -ny;
    const qy = nx;
    const stand = helm ? 10 : 18 + 6 * L.bow[i];
    const hx = Cx + nx * stand;
    const hy = Cy + ny * stand;
    // The string's lock-on point: its pathfinder's aim, within reach of ours.
    let ax = 0;
    let ay = 0;
    if (!helm) {
      ax = pose[ARG_LX] - Cx;
      ay = pose[ARG_LY] - Cy;
      const al = (ax * ax + ay * ay) ** 0.5;
      if (al > LIFE.string.reach) {
        ax *= LIFE.string.reach / al;
        ay *= LIFE.string.reach / al;
      }
    }
    const kx = hx + ax * 0.35;
    const ky = hy + ay * 0.35;
    const r0 = L.r0[i];
    const psi0 = L.psi0[i];
    const spin = (FRAMES * L.spin[i] * L.flightMs[i]) / 1000;
    // A pathfinder is a size up (and white, with its comet: the layout).
    let size = L.tflags[i] & 8 ? 1.6 * L.size[i] : L.size[i];
    let frame = L.f0[i];
    let unfolded = -1;
    // (Conditionals, not Math.min: V8's mid tier boxes its result.)
    let alpha = u * 8 < 1 ? u * 8 : 1;
    if (helm && u < 0.7) {
      // Face-local condensation: every helmet cell approaches through the
      // skin stream, never a detached spiral above the unlit undersuit.
      const v = u / 0.7;
      const e = smooth(v);
      const sx = L.gateX[p] + 5 * L.jx[i];
      const sy = L.gateY[p] + 5 * L.jy[i];
      const curl = 8 * Math.sin(Math.PI * v) * Math.sin(psi0);
      pose[PX] = sx + (hx - sx) * e + qx * curl;
      pose[PY] = sy + (hy - sy) * e + qy * curl;
      frame += spin * 2 * u;
    } else if (!helm && u < 0.46) {
      const q = u < 0 ? 0 : u / 0.46;
      const v = q * q * (3 - 2 * q);
      const w = 1 - v;
      const p0x = L.gateX[p] + 6 * L.jx[i];
      const p0y = L.gateY[p] + 6 * L.jy[i];
      const ex = kx + r0 * (Math.cos(psi0) * qx + 0.45 * Math.sin(psi0) * nx);
      const ey = ky + r0 * (Math.cos(psi0) * qy + 0.45 * Math.sin(psi0) * ny);
      const bow = L.bow[i] * 0.05 * H;
      const p1x = p0x + (ex - p0x) * 0.35 + qx * bow;
      const p1y = p0y + (ey - p0y) * 0.35 + qy * bow;
      const p2x = ex + nx * 0.02 * H;
      const p2y = ey + ny * 0.02 * H;
      pose[PX] = w * w * w * p0x + 3 * w * w * v * p1x + 3 * w * v * v * p2x + v * v * v * ex;
      pose[PY] = w * w * w * p0y + 3 * w * w * v * p1y + 3 * w * v * v * p2y + v * v * v * ey;
      frame += spin * 3 * u;
    } else if (!helm && u < 0.68) {
      // Viscous coalescence brakes across the neighbour's joining axis.
      // The last independent grains fuse at the keyed standoff instead of
      // completing an ornamental orbit around an empty square.
      const w = (u - 0.46) / 0.22;
      const r = r0 * (1 - smooth(w));
      const cross = Math.cos(psi0) + 0.14 * Math.sin(TAU * w) * (1 - w);
      // Polarized capture flattens the incoming helix across the socket
      // before the machine turns face-on and begins its axial insertion.
      // The ends still meet the flight and alignment poses exactly.
      const flatten = 0.45 * (1 - 0.7 * smooth(w));
      pose[PX] = kx + r * (cross * qx + flatten * Math.sin(psi0) * nx);
      pose[PY] = ky + r * (cross * qy + flatten * Math.sin(psi0) * ny);
      size *= 1 + 0.14 * Math.sin(Math.PI * w);
      frame += spin * (3 * 0.46 + 0.6 * (u - 0.46));
    } else if (!helm && u < 0.8) {
      // Locked on: it hangs at the point, twitching as it searches, and
      // turns its lit face to the viewer (a flash) before it dives.
      const v = (u - 0.68) / 0.12;
      const twitch = 2.2 * Math.sin(3 * Math.PI * v) * (1 - v) * (1 - v);
      // An actuator corrects across the key; axial movement waits for
      // face alignment. The oscillation damps before the magnetic pull.
      pose[PX] = kx + qx * twitch;
      pose[PY] = ky + qy * twitch;
      size *= 1 + 0.18 * Math.sin(Math.PI * v);
      const raw = frame + spin * (3 * 0.46 + 1.5 * 0.22);
      let d = (raw % FRAMES) + (raw < 0 ? FRAMES : 0);
      if (d > FRAMES / 2) d -= FRAMES;
      const turn = 1 - smooth(v);
      frame = d * turn;
    } else {
      // Magnetic capture ends at a two-pixel gap. The last six percent is
      // a separate insertion: jaws close, a small compression rings down,
      // and the chip's face becomes the artwork on the existing clock.
      const aim = helm ? 0.7 : 0.8;
      const v = (u - aim) / (0.94 - aim);
      const w = v < 0 ? 0 : v > 1 ? 1 : v;
      // Inertial (owner, 2026-10-21): it darts in, overshoots the gap by a
      // share of its stand (never into the plate) and settles back onto it
      // exactly by 0.94; the insertion's compression then rings it down.
      const back = w - 1;
      const e = 1 + (DOCK_BACK + 1) * back * back * back + DOCK_BACK * back * back;
      const compression = u < 0.94 ? 0 : (u - 0.94) / 0.06;
      const gap = 2 * (1 - smooth(compression));
      const ring = compression > 0 ? 0.9 * Math.sin(TAU * compression) * (1 - compression) : 0;
      pose[PX] = kx + (Cx + nx * gap - kx) * e + qx * ring;
      pose[PY] = ky + (Cy + ny * gap - ky) * e + qy * ring;
      if (helm) {
        // The frame eases to the face-on lock pose by the shortest way.
        const raw = frame + spin * (2 * 0.7 + (u - 0.7));
        let d = (raw % FRAMES) + (raw < 0 ? FRAMES : 0);
        if (d > FRAMES / 2) d -= FRAMES;
        frame = d * (1 - w) * (1 - w);
      } else frame = 0;
    }
    // Independent grains first join into a dense carrier; only that fused
    // machine unfolds into the existing art cell. No ready-made plate fades
    // out of empty space and no early full-size square hides the bare face.
    size *= 0.3 + 0.7 * smooth((u - 0.28) / 0.4);
    if (u >= 0.82) {
      const open = smooth((u - 0.82) / 0.18);
      unfolded = Math.min(6, Math.floor(open * 7));
      const full = T * (32 / 28) * (0.6 + 0.4 * L.cov[i]);
      size += (full - size) * open;
    }
    // Eased out as its metal tile eases in: no linear pop at either end.
    if (u >= 0.86) alpha *= 1 - smooth((u - 0.86) / 0.14);
    pose[SIZE] = size;
    const turn = Math.floor(frame) % FRAMES;
    pose[FRAME] = turn < 0 ? turn + FRAMES : turn;
    pose[UNFOLD] = unfolded;
    pose[ALPHA] = alpha;
  };

  const forming = (p: number, t: number) => {
    if (t < FIRE_BIRTH) return;
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
    if (
      lattice &&
      (staged || L.flags[p] & 8) &&
      !governed &&
      t >= F - SW.lattice[0] &&
      t < F - SW.lattice[1]
    ) {
      const span = (t - F + SW.lattice[0]) / (SW.lattice[0] - SW.lattice[1]);
      // It fades in as it grows (no step in the frame's light), out as it is consumed.
      const fade = span < 0.3 ? span / 0.3 : span > 0.8 ? (1 - span) / 0.2 : 1;
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
      flight.globalAlpha = LATTICE_A * fade;
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
        shadowDraw(silhouette, p, 0.8, 1);
        shadowDraw(silhouette, p, 1.6, 2);
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
      const flightStart = L.flightStart[i];
      const flightMs = L.flightMs[i];
      const u = (t - flightStart) / flightMs;
      if (u <= 0) continue;
      const Cx = a00 * L.cx[i] + a01 * L.cy[i] + ex;
      const Cy = a10 * L.cx[i] + a11 * L.cy[i] + ey;
      // A few readable receiver keys per plate. They open across the
      // incoming chip's own axis, grip on contact, then run a weld back to
      // the already seated neighbour. The helmet keeps its original pixel
      // fill clear. Touch uses the same mechanism with a smaller batch.
      if (
        !helm &&
        !governed &&
        u >= 0.58 &&
        since < 44 &&
        (i % 11 === 0 || ((L.tflags[i] & 8) !== 0 && i % 3 === 0)) &&
        dockCount < DOCKS
      ) {
        const dx = a00 * L.dockX[i] + a01 * L.dockY[i];
        const dy = a10 * L.dockX[i] + a11 * L.dockY[i];
        const length = (dx * dx + dy * dy) ** 0.5 || 1;
        const d = dockCount * 8;
        docks[d] = Cx * s;
        docks[d + 1] = Cy * s;
        docks[d + 2] = dx / length;
        docks[d + 3] = dy / length;
        docks[d + 4] = (T * 0.55 + 2) * s;
        docks[d + 5] = 1 - smooth((u - 0.8) / 0.2);
        docks[d + 6] = since;
        docks[d + 7] = since < 0 ? smooth((u - 0.58) / 0.12) : 1 - smooth(since / 44);
        dockCount += 1;
      }
      if (u < 1) {
        // Its string's pathfinder, on the same jig.
        const lead = L.tLead[i];
        pose[ARG_LX] = a00 * L.cx[lead] + a01 * L.cy[lead] + ex;
        pose[ARG_LY] = a10 * L.cx[lead] + a11 * L.cy[lead] + ey;
      }
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
          const star = Math.floor((4 * since) / SW.spark);
          sparks[so + 2] = star < 3 ? star : 3;
          sparks[so + 3] = 1.6 * T * s;
          sparkCount += 1;
        }
        const parent = L.parent[i];
        // Round 3: about half the locks spur a link, for LINK_MS.
        if (
          parent >= 0 &&
          since < LINK_MS &&
          L.tflags[i] & 4 &&
          linkCount < LINKS &&
          !TOUCH &&
          !governed
        ) {
          const lo = linkCount * 5;
          links[lo] = Cx * s;
          links[lo + 1] = Cy * s;
          links[lo + 2] = (a00 * L.cx[parent] + a01 * L.cy[parent] + ex) * s;
          links[lo + 3] = (a10 * L.cx[parent] + a11 * L.cy[parent] + ey) * s;
          links[lo + 4] = 1 - since / LINK_MS;
          linkCount += 1;
        }
        continue;
      }
      // N7: the comet from the chip's velocity (where it was 24 ms back).
      const streak = (L.tflags[i] & 1) !== 0 && u < 0.55 && !TOUCH && !governed;
      let backX = 0;
      let backY = 0;
      pose[ARG_CX] = Cx;
      pose[ARG_CY] = Cy;
      if (streak) {
        pose[ARG_U] = u - 24 / flightMs;
        tilePose(p, i, helm);
        backX = pose[PX];
        backY = pose[PY];
      }
      pose[ARG_U] = u;
      tilePose(p, i, helm);
      const x = pose[PX] * s;
      const y = pose[PY] * s;
      const tone = L.tone[i];
      pose[SX] = x;
      pose[SY] = y;
      pose[SD] = pose[SIZE] * s;
      fenceFade();
      pose[SA] = pose[ALPHA] * pose[FADE];
      if (
        u >= 0.26 &&
        u < 0.74 &&
        fusionCount < FUSIONS &&
        (!TOUCH || (L.tflags[i] & 8) !== 0) &&
        !governed
      ) {
        const o = fusionCount * 6;
        const joined = smooth((u - 0.26) / 0.48);
        fusions[o] = x;
        fusions[o + 1] = y;
        fusions[o + 2] = (4 + 9 * (1 - joined)) * s;
        fusions[o + 3] = L.psi0[i] + joined * 1.2;
        fusions[o + 4] = pose[SA] * Math.sin(Math.PI * joined);
        fusions[o + 5] = (1.1 + 1.3 * joined) * s;
        fusionCount += 1;
      }
      if (streak) {
        pose[SVX] = x - backX * s;
        pose[SVY] = y - backY * s;
        comet(tone);
      }
      const unfolded = pose[UNFOLD];
      if (unfolded >= 0 && tone < 3) {
        unfold(unfolded | 0, tone);
        // The lock flash (2026-10-21): a short weld-bright star over the
        // tile as its metal materialises, gone by the lock — a part locking
        // in, not a chip fading out (desktop, a bounded few a frame).
        if (!TOUCH && !governed && lockFlashes[0] < LOCK_FLASHES && draws < limit[0]) {
          const g = unfolded / 6;
          const f = g < 0.3 ? g / 0.3 : 1 - (g - 0.3) / 0.7;
          if (f > 0.05) {
            draws += 1;
            lockFlashes[0] += 1;
            flight.globalAlpha = 0.6 * f;
            sprite(
              cellsImage,
              KIT_CELLS.spark.x + 32 * (f > 0.66 ? 0 : f > 0.33 ? 1 : 2),
              KIT_CELLS.spark.y,
              32,
              32,
              x,
              y,
              pose[SD] * 1.8,
            );
          }
        }
      } else chip(pose[FRAME] | 0, tone, u >= 0.9);
      if (u >= 0.86 && fadeCount < fades.length) {
        fades[fadeCount] = i;
        fadeA[fadeCount] = smooth((u - 0.86) / 0.14);
        fadeCount += 1;
      }
      // N9: the beam from the latch to the two tiles nearest lock.
      if (u >= 0.9 && !TOUCH && latched[p]) {
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
      if (draws >= limit[0]) break;
      const i = fades[k];
      const tile = tiles[i - first];
      const a = fadeA[k];
      draws += 1;
      if (a >= 0) {
        flight.globalAlpha = a;
        // Its cell of the landed clip, on whole device pixels (see the
        // sprite helper).
        const x0 = Math.round(tile.dx * s);
        const y0 = Math.round(tile.dy * s);
        flight.drawImage(
          metal,
          tile.sx,
          tile.sy,
          tile.tw,
          tile.th,
          x0,
          y0,
          Math.round((tile.dx + tile.tw) * s) - x0,
          Math.round((tile.dy + tile.th) * s) - y0,
        );
      } else {
        const tau = -a;
        const k2 = 1 + 0.14 * Math.exp(-5 * tau) * Math.cos(9.4 * tau);
        const w = Math.round(tile.tw * s * k2) || 1;
        const h = Math.round(tile.th * s * k2) || 1;
        flight.globalAlpha = 1;
        flight.drawImage(
          metal,
          tile.sx,
          tile.sy,
          tile.tw,
          tile.th,
          Math.round((tile.dx + tile.tw / 2) * s - w / 2),
          Math.round((tile.dy + tile.th / 2) * s - h / 2),
          w,
          h,
        );
      }
    }
    base();
    flight.globalAlpha = 1;
  };

  const seat = (p: number, t: number) => {
    if (t < FIRE_BIRTH && L.kind[p] >= 0) return;
    const plate = all[p];
    const F = plate.fit;
    // Seated: at rest on the body (every plate is still by F), so its gold
    // forms exactly where the finished suit has it.
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
    // Keep the last receivers cooling across the forming → seated handoff;
    // their positions now use the same resting coordinates as the plate.
    if (L.kind[p] !== 3 && !governed && t < F + 44) {
      for (let i = first; i < end && dockCount < DOCKS; i += 1) {
        const since = t - L.land[i];
        if (since >= 44 || (i % 11 !== 0 && !((L.tflags[i] & 8) !== 0 && i % 3 === 0))) continue;
        const o = dockCount * 8;
        docks[o] = L.cx[i] * s;
        docks[o + 1] = L.cy[i] * s;
        docks[o + 2] = L.dockX[i];
        docks[o + 3] = L.dockY[i];
        docks[o + 4] = (T * 0.55 + 2) * s;
        docks[o + 5] = 0;
        docks[o + 6] = since;
        docks[o + 7] = 1 - smooth(since / 44);
        dockCount += 1;
      }
    }
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
      tileRect(tile);
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
    if (t < FIRE_BIRTH || t < all[p].fit || L.kind[p] < 0) return;
    if (TOUCH && conduits >= 4) return;
    conduits += 1;
    // Its plate is at rest on the body (every plate is still by F).
    drawConduit(p, t, true);
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
    const reach = (b - L.cum[j]) / span2;
    const f2 = reach < 1 ? reach : 1;
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

  const seamsPass = (t: number) => {
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
  };
  const ringsPass = (t: number) => {
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
  };
  const spallPass = (t: number) => {
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
        pose[SX] = x;
        pose[SY] = y;
        pose[SD] = (6 + 3 * h) * s * 0.7;
        fenceFade();
        pose[SA] = fade * pose[FADE];
        chip(wrap(FRAMES * h + 72 * tau), c % 3 ? WHITE : ICE);
      }
    }
  };
  const sparksPass = () => {
    // N6: sparks at the leading edges; the guideways' weld heads (frames
    // 4–5: a star over a white-hot glow, the white bokeh).
    for (let k = 0; k < sparkCount; k += 1) {
      if (draws >= limit[0] || (TOUCH && heroes >= HEROES)) break;
      const o = k * 4;
      const d = sparks[o + 3];
      let frame = sparks[o + 2];
      pose[SX] = sparks[o];
      pose[SY] = sparks[o + 1];
      fenceFade();
      const fade = pose[FADE];
      if (fade <= 0.01) continue;
      if (frame >= 4) {
        frame -= 4;
        if (!TOUCH) {
          const g = d * 1.25;
          flight.globalAlpha = 0.75 * fade;
          draws += 1;
          sprite(cellsImage, BOKEH_X[WHITE], BOKEH_Y[WHITE], 32, 32, sparks[o], sparks[o + 1], g);
        }
      }
      flight.globalAlpha = 0.9 * fade;
      draws += 1;
      if (TOUCH) heroes += 1;
      sprite(
        cellsImage,
        KIT_CELLS.spark.x + 32 * frame,
        KIT_CELLS.spark.y,
        32,
        32,
        sparks[o],
        sparks[o + 1],
        d,
      );
    }
  };
  const linksPass = () => {
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
        flight.moveTo(Math.round(links[o]), Math.round(links[o + 1]));
        flight.lineTo(Math.round(links[o + 2]), Math.round(links[o + 3]));
        any = true;
      }
      if (!any) continue;
      flight.globalAlpha = 0.45 * (bucket === 0 ? 0.85 : bucket === 1 ? 0.5 : 0.2);
      flight.stroke();
    }
    if (!TOUCH) {
      flight.beginPath();
      let any = false;
      for (let p = 0; p < P; p += 1) {
        for (let b = 0; b < 2; b += 1) {
          if (beamU[p * 2 + b] < 0.9) continue;
          flight.moveTo(Math.round(L.seatX[p] * s), Math.round(L.seatY[p] * s));
          flight.lineTo(Math.round(beams[p * 4 + b * 2]), Math.round(beams[p * 4 + b * 2 + 1]));
          any = true;
        }
      }
      if (any) {
        flight.globalAlpha = 0.35;
        flight.lineWidth = Math.max(0.8, 0.8 * s * 0.8);
        flight.stroke();
      }
    }
  };
  // Articulated receiver jaws and a short, cooling weld. Drawn in fifteen
  // line batches regardless of chip count; the dark undercut gives each
  // physical key depth, while the open jaws expose the original art.
  const dockingPass = () => {
    if (!dockCount) return;
    flight.lineCap = "round";
    flight.lineJoin = "round";
    for (let stage = 0; stage < 5; stage += 1) {
      for (let pass = 0; pass < 3; pass += 1) {
        flight.beginPath();
        let any = false;
        for (let k = 0; k < dockCount; k += 1) {
          const o = k * 8;
          const since = docks[o + 6];
          if (
            (since < 0 ? 0 : since < 8 ? 1 : since < 20 ? 2 : since < 32 ? 3 : 4) !== stage ||
            docks[o + 7] < 0.04
          )
            continue;
          const x = docks[o];
          const y = docks[o + 1];
          const nx = docks[o + 2];
          const ny = docks[o + 3];
          const span = docks[o + 4];
          const opening = docks[o + 5];
          const gap = span * (0.44 + 0.62 * opening);
          const reach = span * (0.48 + 0.12 * opening);
          if (pass < 2) {
            for (let side = -1; side <= 1; side += 2) {
              const cx = x - ny * gap * side;
              const cy = y + nx * gap * side;
              flight.moveTo(Math.round(cx + nx * reach), Math.round(cy + ny * reach));
              flight.lineTo(Math.round(cx - nx * reach), Math.round(cy - ny * reach));
              flight.lineTo(
                Math.round(cx - nx * reach + ny * span * 0.3 * side),
                Math.round(cy - ny * reach - nx * span * 0.3 * side),
              );
            }
          } else if (since >= 0) {
            // The fusion seam travels toward the last attached neighbour,
            // changing white-hot to gold as it contracts and cools.
            const progress = since < 12 ? since / 12 : 1;
            const tail = smooth((since - 8) / 36);
            flight.moveTo(Math.round(x - nx * span * tail), Math.round(y - ny * span * tail));
            flight.lineTo(
              Math.round(x - nx * span * progress),
              Math.round(y - ny * span * progress),
            );
          } else continue;
          any = true;
        }
        if (!any) continue;
        flight.strokeStyle =
          pass === 0
            ? "#241707"
            : pass === 1
              ? stage < 2
                ? "#e9b356"
                : "#a77a45"
              : stage === 1
                ? "#f2ffed"
                : stage === 2
                  ? "#ffd179"
                  : "#9c6331";
        flight.lineWidth =
          pass === 0 ? Math.max(1.7, 2.1 * s) : Math.max(0.65, (pass === 1 ? 0.9 : 1.2) * s);
        flight.globalAlpha =
          (pass === 0 ? 0.65 : stage === 0 ? 0.48 : stage === 1 ? 0.92 : 0.64) *
          (stage < 3 ? 1 : stage === 3 ? 0.48 : 0.14);
        flight.stroke();
      }
    }
  };
  const latchesPass = (t: number) => {
    // 6. Latches (A1) and clamps (G3).
    for (let p = 0; p < P; p += 1) {
      if (L.kind[p] < 0) continue;
      const plate = all[p];
      const F = plate.fit;
      const accent = (L.flags[p] & 1) !== 0;
      // The latch is at its seat by the time its guideway starts building
      // (its laser runs to the weld head).
      const appear = Math.min(F - SW.project, L.buildA[p]);
      if (t >= appear && t < F + 120 && latched[p]) {
        const a = t - appear;
        const grow = smooth(a / 40);
        let alpha = grow * (t > F + 40 ? 1 - (t - F - 40) / 80 : 1);
        const frame =
          t < F - SW.seat
            ? Math.floor(a / 40) % 6
            : t < F
              ? 6 + Math.min(5, Math.floor(((t - F + SW.seat) / SW.seat) * 6))
              : 11;
        // It swells as its claws bite (round 3: the bite reads at 1x).
        const v = (t - F + SW.seat) / (SW.seat + 40);
        const bite = v > 0 && v < 1 ? Math.sin(Math.PI * v) : 0;
        const d = L.latchW[p] * (0.6 + 0.4 * grow) * (1 + 0.3 * bite) * s;
        const x = L.seatX[p] * s;

        const y = L.seatY[p] * s;
        pose[SX] = x;
        pose[SY] = y;
        fenceFade();
        alpha *= pose[FADE];
        if (TOUCH && !(accent && heroes < HEROES)) {
          flight.globalAlpha = alpha * 0.8;
          flight.strokeStyle = "#8cefff";
          flight.lineWidth = 1.2;
          flight.beginPath();
          flight.arc(x, y, d * 0.32, 0, TAU);
          flight.stroke();
        } else if (draws < limit[0]) {
          if (TOUCH) heroes += 1;
          if (alpha > 1) alpha = 1;
          flight.globalAlpha = alpha;
          draws += 1;
          sprite(
            fxImage,
            KIT_FX.latch.x + KIT_FX.latch.cell * frame,
            KIT_FX.latch.y,
            KIT_FX.latch.cell,
            KIT_FX.latch.cell,
            x,
            y,
            d,
          );
        }
      }
      if (!L.hasBox[p] || plate.end <= plate.first || !L.clampMask[p]) continue;
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
        alpha = CLAMP_HOLD * (1 - smooth(u));
        drift = 1.1 * u * u;
      } else {
        // Holding while the gold sets (round 3): the bite is the moment, so
        // a held clamp steps back (fewer bright brackets at once).
        alpha = 1 - (1 - CLAMP_HOLD) * smooth((t - F - SW.clamp[2]) / LED_MS);
      }
      const cw = L.clampW[p];
      const d = cw * s;
      const size = Math.round(d) || 1;
      const scale = size / KIT_FX.clamp.cell;
      // The bite lights its bolt's ice LED (round 3), which dims as it holds.
      const since = t - F + SW.clamp[2];
      const led =
        since < 0 ? 0 : since < 2 * SW.clamp[2] ? 1 : 1 - (since - 2 * SW.clamp[2]) / LED_MS;
      for (let corner = 0; corner < 4; corner += 1) {
        if (!((L.clampMask[p] >> corner) & 1)) continue;
        const right = corner & 1;
        const bottom = corner >> 1;
        const cx = (L.clampX[p * 4 + corner] + (right ? 1 : -1) * drift * cw) * s;
        const cy = (L.clampY[p * 4 + corner] + (bottom ? 1 : -1) * drift * cw) * s;
        pose[SX] = cx;
        pose[SY] = cy;
        fenceFade();
        const shown = alpha * pose[FADE];
        if (shown <= 0.01) continue;
        if (TOUCH) {
          flight.globalAlpha = shown * 0.9;
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
        if (draws >= limit[0]) break;
        draws += 1;
        flight.globalAlpha = shown;
        // On whole device pixels (see the sprite helper), the anchor kept on
        // the corner.
        flight.drawImage(
          clampImage,
          clampX0 + KIT_FX.clamp.cell * frame,
          clampY0 + KIT_FX.clamp.cell * CORNER_ROW[corner],
          KIT_FX.clamp.cell,
          KIT_FX.clamp.cell,
          Math.round(cx - ANCHOR[corner * 2] * scale),
          Math.round(cy - ANCHOR[corner * 2 + 1] * scale),
          size,
          size,
        );
        if (led > 0 && draws < limit[0]) {
          draws += 1;
          flight.globalAlpha = 0.65 * led * shown;

          sprite(cellsImage, BOKEH_X[ICE], BOKEH_Y[ICE], 32, 32, cx, cy, 0.42 * d);
        }
      }
    }
  };
  const pourPass = (t: number) => {
    // 7. G6: the molten band, droplets at its head; G7: chips off the
    // receding front.
    let drops = 0;
    let rising = 0;
    if (!TOUCH)
      for (let p = 0; p < P; p += 1) {
        const plate = all[p];
        if (L.kind[p] < 0 || plate.end <= plate.first) continue;
        if (t < plate.from || t >= plate.to + SW.recede + 120) continue;
        // By age (owner, 2026-10-16: 立体的・未来的): white-hot at the head,
        // molten behind it, its trailing edge fading into the painted gold.
        const bandTo = firstLockAfter(p, t);
        if (molten) {
          // Behind the band (round 3), the cells still cooling keep a dull
          // ember glow over the pinned grains, so the molten metal sets into
          // the painted gold instead of breaking into separate squares.
          const coolTo = firstLockAfter(p, t - SW.moltenAges[SW.moltenAges.length - 1]);
          const coolFrom = firstLockAfter(p, t - SW.recede);
          if (coolTo > coolFrom) {
            flight.save();
            cellClip(coolFrom, coolTo);
            flight.globalAlpha = EMBER_A;
            plateDraw(molten, p, 0, 0);
            flight.restore();
          }
          let to = bandTo;
          for (let step = 0; step < SW.moltenAges.length; step += 1) {
            const from = firstLockAfter(p, t - SW.moltenAges[step]);
            if (to > from) {
              flight.save();
              cellClip(from, to);
              const under = hot ? MOLTEN_A[step] : Math.max(MOLTEN_A[step], HOT_A[step]);
              if (under > 0) {
                flight.globalAlpha = under;
                plateDraw(molten, p, 0, 0);
              }
              if (hot && HOT_A[step] > 0) {
                flight.globalAlpha = HOT_A[step];
                plateDraw(hot, p, 0, 0);
              }
              flight.restore();
            }
            to = from;
          }
        }
        // The band's head (round 3): where a trim's channel locks, the newest
        // metal glows white-hot over a warm halo, fading as it cools.
        let heads = 0;
        for (
          let i = firstLockAfter(p, t - HEAD_GLOW_MS);
          i < bandTo && heads < HEAD_GLOWS;
          i += 1
        ) {
          if (!L.chan[i] || draws >= limit[0] - 1) continue;
          const fade = 1 - (t - gold.lock[i]) / HEAD_GLOW_MS;
          const x = (gold.fx[i] + gold.cw[i] / 2) * s;
          const y = (gold.fy[i] + gold.ch[i] / 2) * s;
          heads += 1;
          draws += 2;
          flight.globalAlpha = 0.6 * fade;
          sprite(cellsImage, BOKEH_X[GOLD_TONE], BOKEH_Y[GOLD_TONE], 32, 32, x, y, 4.4 * G * s);
          flight.globalAlpha = 0.95 * fade;
          sprite(cellsImage, BOKEH_X[WHITE], BOKEH_Y[WHITE], 32, 32, x, y, 2 * G * s);
        }
        for (let i = firstLockAfter(p, t - SW.droplet); i < bandTo && drops < 160; i += 1) {
          if (draws >= limit[0]) break;
          // One cell in three throws a droplet (round 3: fewer, larger beads).
          if (i % 3) continue;
          const age = t - gold.lock[i];
          let dx = -gold.ox[i];
          let dy = -gold.oy[i];
          const dl = (dx * dx + dy * dy) ** 0.5 || 1;
          dx /= dl;
          dy /= dl;
          // Just ahead of the band's head, leading it.
          const x = (gold.fx[i] + gold.cw[i] / 2 + dx * G * 0.9) * s;
          const y = (gold.fy[i] + gold.ch[i] / 2 + dy * G * 0.9) * s;
          drops += 1;
          draws += 1;
          if (age < DROP_BEAD) {
            // Thrown: a short oval drop along its flight, then a bead.
            const e = age < 4 ? 1 : 0;
            let a = Math.round(Math.atan2(dy, dx) / (Math.PI / 8)) % 8;
            if (a < 0) a += 8;
            const d = 2.2 * G * s;
            flight.globalAlpha = 0.95;
            sprite(
              fxImage,
              KIT_FX.drop.x + KIT_FX.drop.cell * a,
              KIT_FX.drop.y + KIT_FX.drop.cell * e,
              KIT_FX.drop.cell,
              KIT_FX.drop.cell,
              x,
              y,
              d,
            );
          } else {
            // Its last third: a wobbling bead, settling into the trim.
            const d = 2.2 * G * s;
            const frame = Math.floor((age - DROP_BEAD) / 2) % KIT_CELLS.bead.frames;
            flight.globalAlpha = 0.95 * (1 - (age - DROP_BEAD) / (SW.droplet - DROP_BEAD));
            sprite(cellsImage, KIT_CELLS.bead.x + 32 * frame, KIT_CELLS.bead.y, 32, 32, x, y, d);
          }
        }
        // One in four cells at the receding front lifts off as a gold chip
        // (not when governed).
        if (governed) continue;
        const from = firstLockAfter(p, t - SW.recede - 120);
        const to = firstLockAfter(p, t - SW.recede);
        for (let i = from; i < to && rising < 120; i += 1) {
          if ((i * 2654435761) >>> 30 !== 0) continue;
          const u = (t - SW.recede - gold.lock[i]) / 120;
          const h = hash(i, 5003);
          const x = (gold.fx[i] + gold.cw[i] / 2) * s;
          const y = (gold.fy[i] + gold.ch[i] / 2 - (6 + 4 * h) * u) * s;
          rising += 1;
          pose[SX] = x;
          pose[SY] = y;
          pose[SD] = 3.6 * s;
          fenceFade();
          pose[SA] = 0.8 * (1 - u) * pose[FADE];

          chip(wrap(FRAMES * h + 30 * u), GOLD_TONE);
        }
      }
  };
  // The fixed receiver and the moving plate are both visible during docking.
  // Dark machined channels have bright bevels; their opposed shutter tongues
  // close anchor → opposite → next pair, rather than flashing every corner
  // together. Each socket lies on the artwork's real contour. At F the metal
  // plate already has its final transform; only the socket cooling remains.
  const receiversPass = (t: number) => {
    if (governed) return;
    for (let k = 0; k < P; k += 1) {
      const p = L.order[k];
      const F = all[p].fit;
      if (
        !L.receiverN[p] ||
        L.receiverSlot[p] >= RECEIVER_PLATES ||
        t < F - RAIL_LEAD ||
        t >= F + RECEIVER_COOL
      )
        continue;
      // Receiver reservation owns this plate's entire visible interval.
      const reveal = smooth((t - F + RAIL_LEAD) / 34);
      const cool = 1 - smooth((t - F) / RECEIVER_COOL);
      const alpha = reveal * cool;
      const jo = p * 6;
      for (let pass = 0; pass < 4; pass += 1) {
        if (pass === 3 && t >= F) continue;
        flight.beginPath();
        for (let key = 0; key < L.receiverN[p]; key += TOUCH ? 2 : 1) {
          const o = (p * RECEIVER_KEYS + key) * 4;
          const x = L.receiver[o] * s;
          const y = L.receiver[o + 1] * s;
          const nx = L.receiver[o + 2];
          const ny = L.receiver[o + 3];
          const tx = -ny;
          const ty = nx;
          // Opposite keys are paired, but the second jaw closes 8ms later.
          const rank = (key % 3) * 2 + (key >= 3 ? 1 : 0);
          const catchAt = F - 76 + rank * 8;
          const bite = smooth((t - catchAt) / 24);
          const open = (1 - bite) * (TOUCH ? 5 : 8) * s;
          const width = (TOUCH ? 2.8 : 3.4) * s;
          const depth = (3.2 + 2.2 * bite) * s;
          const px = jig[jo] * x + jig[jo + 2] * y + jig[jo + 4] - ox;
          const py = jig[jo + 1] * x + jig[jo + 3] * y + jig[jo + 5] - oy;
          if (pass === 0) {
            // Twin rails join the body seat to its actual moving carriage.
            // The two hard shoulders remain readable under the metal tongue.
            for (let side = -1; side <= 1; side += 2) {
              const dx = tx * side * (width + 1.6 * s);
              const dy = ty * side * (width + 1.6 * s);
              flight.moveTo(Math.round(x + dx - nx * depth), Math.round(y + dy - ny * depth));
              flight.lineTo(
                Math.round(x + dx + nx * (open + depth)),
                Math.round(y + dy + ny * (open + depth)),
              );
              flight.lineTo(Math.round(px + dx + nx * depth), Math.round(py + dy + ny * depth));
            }
          } else if (pass === 1) {
            // Two opposing solid shutter fingers seat over the panel rim.
            // Staggered teeth interlock instead of drawing a luminous box.
            for (let side = -1; side <= 1; side += 2) {
              const along = side * (width + open);
              const bx = px + tx * along;
              const by = py + ty * along;
              const tooth = side * (width + 1.4 * s);
              // The two mating shoulder edges keep their exact contour
              // projection; only the decorative tongue/tooth is snapped.
              flight.moveTo(bx - nx * depth, by - ny * depth);
              flight.lineTo(bx + nx * depth, by + ny * depth);
              flight.lineTo(
                Math.round(bx + nx * depth - tx * tooth),
                Math.round(by + ny * depth - ty * tooth),
              );
              flight.lineTo(
                Math.round(bx - tx * tooth - nx * depth * 0.35),
                Math.round(by - ty * tooth - ny * depth * 0.35),
              );
              flight.closePath();
            }
          } else if (pass === 2) {
            // A thin bevel traces the keyed shoulder; light crosses
            // each fastener only as that pair bites, then cools to steel.
            const heat = Math.max(0, 1 - Math.abs(t - catchAt - 24) / 42);
            const length = (2 + 4 * heat) * s;
            flight.moveTo(
              Math.round(px - tx * (width + open) - nx * depth),
              Math.round(py - ty * (width + open) - ny * depth),
            );
            flight.lineTo(
              Math.round(px - tx * (width + open) + nx * depth),
              Math.round(py - ty * (width + open) + ny * depth),
            );
            flight.lineTo(
              Math.round(px - tx * open + nx * depth),
              Math.round(py - ty * open + ny * depth),
            );
            flight.moveTo(
              Math.round(px + tx * (width + open) - nx * depth),
              Math.round(py + ty * (width + open) - ny * depth),
            );
            flight.lineTo(
              Math.round(px + tx * (width + open) + nx * depth),
              Math.round(py + ty * (width + open) + ny * depth),
            );
            flight.lineTo(
              Math.round(px + tx * open + nx * depth),
              Math.round(py + ty * open + ny * depth),
            );
            flight.moveTo(
              Math.round(x - tx * length - nx * (depth + 1.8 * s)),
              Math.round(y - ty * length - ny * (depth + 1.8 * s)),
            );
            flight.lineTo(
              Math.round(x + tx * length - nx * (depth + 1.8 * s)),
              Math.round(y + ty * length - ny * (depth + 1.8 * s)),
            );
          } else {
            // A short induction front runs down each real rail toward its
            // fixed socket. Paired keys share the approach, then lock in
            // the same stagger as their shutters; no detached HUD frame.
            const head = smooth((t - F + RAIL_LEAD - rank * 3) / (RAIL_LEAD - 22));
            const tail = Math.max(0, head - 0.24);
            for (let side = -1; side <= 1; side += 2) {
              const dx = tx * side * (width + 1.6 * s);
              const dy = ty * side * (width + 1.6 * s);
              flight.moveTo(
                Math.round(px + (x - px) * tail + dx),
                Math.round(py + (y - py) * tail + dy),
              );
              flight.lineTo(
                Math.round(px + (x - px) * head + dx),
                Math.round(py + (y - py) * head + dy),
              );
            }
          }
        }
        flight.globalAlpha =
          alpha * (pass === 0 ? 0.6 : pass === 1 ? 0.88 : pass === 2 ? 0.8 : 0.54);
        if (pass === 1) {
          flight.fillStyle = "#293843";
          flight.fill();
        } else {
          flight.strokeStyle =
            pass === 0
              ? "#18242e"
              : pass === 3 || t < F + 12
                ? "#c3e4ef"
                : t < F + 34
                  ? "#e9b86d"
                  : "#8d6a44";
          flight.lineWidth = Math.max(0.7, (pass === 0 ? 2.5 : 0.8) * s);
          flight.stroke();
        }
      }
    }
    flight.globalAlpha = 1;
  };
  const fusionPass = () => {
    if (!fusionCount) return;
    flight.lineWidth = Math.max(0.6, 0.65 * s);
    for (let bucket = 0; bucket < 3; bucket += 1) {
      flight.globalAlpha = bucket === 0 ? 0.22 : bucket === 1 ? 0.45 : 0.72;
      flight.fillStyle = "#b7fbd8";
      flight.strokeStyle = "#e2fff2";
      flight.beginPath();
      for (let k = 0; k < fusionCount; k += 1) {
        const o = k * 6;
        const alpha = fusions[o + 4];
        if (alpha <= 0.04 || (alpha < 0.3 ? 0 : alpha < 0.6 ? 1 : 2) !== bucket) continue;
        const x = fusions[o];
        const y = fusions[o + 1];
        const radius = fusions[o + 2];
        const d = fusions[o + 5];
        for (let arm = 0; arm < 3; arm += 1) {
          const a = fusions[o + 3] + (TAU * arm) / 3;
          const nx = Math.cos(a);
          const ny = Math.sin(a);
          const px = x + radius * nx;
          const py = y + radius * ny;
          // Faceted fragments join along a radial weld, visibly becoming a
          // single thick cell rather than passing through one another.
          // Native Canvas calls box fractional arguments into heap numbers
          // in Chrome's mid-tier compiler. The other nanite sprites already
          // land on device pixels; these tiny weld facets do the same.
          flight.moveTo(Math.round(x + nx * d * 1.2), Math.round(y + ny * d * 1.2));
          flight.lineTo(Math.round(px - nx * d), Math.round(py - ny * d));
          flight.moveTo(Math.round(px + nx * d), Math.round(py + ny * d));
          flight.lineTo(Math.round(px - ny * d * 0.7), Math.round(py + nx * d * 0.7));
          flight.lineTo(Math.round(px - nx * d), Math.round(py - ny * d));
          flight.lineTo(Math.round(px + ny * d * 0.7), Math.round(py - nx * d * 0.7));
          flight.closePath();
        }
      }
      flight.fill();
      flight.stroke();
    }
    flight.globalAlpha = 1;
  };
  const after = (t: number) => {
    if (t < FIRE_BIRTH) return;
    base();
    receiversPass(t);
    seamsPass(t);
    ringsPass(t);
    spallPass(t);
    sparksPass();
    linksPass();
    fusionPass();
    dockingPass();
    // G2: pulses on the conduits.
    if (pulsePostCount) {
      flight.globalAlpha = 0.65;
      flight.strokeStyle = "#d8f8ff";
      chanStroke(pulsesPost, pulsePostCount);
    }
    latchesPass(t);
    pourPass(t);
    // 8. The front chips, the crown and the free chips (their bands); the
    // white-hot glows ease in (no step in the frame's light).
    pose[GLOW] =
      t >= SW.implode[0] ? smooth((t - SW.implode[0]) / 90) : smooth((t - SW.crown[0]) / 100);
    pose[HALO] = smooth((t - HELM_LAND) / 60);
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
    firebrands,
    cost: (ms: number) => {
      // The first frames upload the layers; judge the steady state. Round 3
      // (review 40): two slow frames within three trip it, not only two in
      // a row, and it sheds more (the sprite budget to GOVERNED_BUDGET, six
      // staged plates, the walls, links and rising chips besides the back
      // band, comets, lacquer, embers and sheen).
      if (TOUCH || frames < 8 || governed) return;
      slow = ms > 10 ? slow + 2 : slow > 0 ? slow - 1 : 0;
      if (slow >= 3) governed = true;
    },
    drawn: () => draws,
    governed: () => governed,
    prime: (k: number) => {
      if (k < PRIME_T.length) {
        // The frame's busy boxes and latches too (round 3), so the swarm's
        // dimmed branches have feedback before a call takes them.
        frameState(PRIME_T[k]);
        swarm(PRIME_T[k]);
        return false;
      }
      // Every stage of a tile's flight, for a plate and the helmet.
      for (let p = 0; p < P; p += 1) {
        const first = L.tileFirst[p];
        if (L.kind[p] < 0 || L.tileFirst[p + 1] <= first) continue;
        const helm = L.kind[p] === 3;
        pose[ARG_CX] = L.cx[first];
        pose[ARG_CY] = L.cy[first];
        pose[ARG_LX] = L.cx[L.tLead[first]];
        pose[ARG_LY] = L.cy[L.tLead[first]];
        for (let u = 0.05; u < 1; u += 0.1) {
          pose[ARG_U] = u;
          tilePose(p, first, helm);
        }
      }
      return true;
    },
  };
}

// The call's engine reaches the extras through this hook alone (round 3,
// review 33: the call's chunk never imports this one).
registerSuitExtras({
  ready: isRexonanceNaniteReady,
  create: (env) => createSuitExtras(env),
  release: releaseRexonanceNanites,
});

registerRexonancePreparationRelease?.(() => {
  preparationEpoch += 1;
  cancelPriming?.();
  cancelPriming = null;
  cancelPreparation?.();
  preparation = null;
  promotePreparation = resumePreparation = cancelPreparation = null;
  if (work.drawing > 0) return;
  retention?.acquire();
  disposeRexonanceNanites();
  // Partial decoding may exist without a published extras canvas.
  releaseRexonanceNaniteSources();
  primed = false;
});
