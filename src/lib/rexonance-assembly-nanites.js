/* =====================================================================
   ZENITH nanites (owner, 2026-10-16: 「続けて、blenderなどを用いてナノマシン
   一つ一つの挙動や装甲形成や金のガイドウェイなどを大きく改善して。」 then
   「超大幅な改善で。」): the living swarm that builds the suit on the scroll.

   Every nanite is a Blender-rendered hex chip (REXONANCE_NANITE_CELLS) in an
   orbital cocoon of eight tilted rings with real depth: born from the P14
   core in six pump waves, it rides its ring, leaves at its tile's flight
   down a river through its plate's gate, circles to aim, dives, unfolds
   into its tile and recoils as it locks. Each plate is built in front of
   the body in raw nanite metal on a lifted, tilted stage, over its own
   contact shadow, a hardpoint latch biting at its seat and a scaffold
   lattice growing from it; it slams home onto its gold hologram, a seam of
   light runs round its real outline, a shock ring lies in its plane, spall
   flies, and the paint develops from the seat outward. Each trim's frame is
   projected onto the body as an ice hologram before its plate arrives, is
   printed into a Blender-rendered gold conduit (rails, hard-light glass, a
   glowing channel, walls that turn as you scroll) clamped at its corners,
   and molten gold pours through it from the seat while the conduit recedes
   behind the cooling front: what remains is exactly the painted trim.

   Every pose is a closed-form function of the displayed progress q, seeded
   from index hashes (never the timing PRNG): the plan's m, t0, t1, beats,
   sort and HUD count are untouched. Per-chip state is typed arrays made
   once; the draw passes below write typed arrays and batched paths only.
   ===================================================================== */

import { naniteHexHeight, naniteHexLight } from "./rexonance-unlit.js";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) * (1 - u) * (1 - u);

/** The per-plate timings (progress): the latch and hologram `lead` the
 * plate's first flight; `seat` the swing home after its last tile lands
 * (contact = to + seat; the helmet to + .003); the rest run from contact. */
export const ASSEMBLY_NANITES = Object.freeze({
  lead: 0.04,
  sweep: 0.012,
  seat: 0.006,
  overshoot: 0.004,
  seam: 0.008,
  seamGlow: 0.006,
  shock: 0.008,
  paint: 0.01,
  lacquer: 0.0015,
  print: 0.004,
  recoil: 0.006,
  spark: 0.004,
  link: 0.004,
  release: 0.008,
  clampIn: 0.016,
  crown: Object.freeze([0.66, 0.68]),
  implode: Object.freeze([0.86, 0.9]),
});
/** The gold guideway's build (owner, 2026-10-16: built smoothly from the
 * toe tips, never laid over from above): `climb` the front's speed (figure
 * px per unit progress, up the body and along the trims), `ready` the least
 * time between a conduit's completion and its plate's contact, `early` the
 * most a beat's climb runs ahead of its first fitting, `holo` how
 * far the ice hologram runs ahead of the solid conduit, `head` the weld
 * head's length and `ember` the sparks' life behind it. */
export const ASSEMBLY_GUIDEWAY = Object.freeze({
  climb: 6000,
  ready: 0.012,
  early: 0.05,
  holo: 0.005,
  head: 0.0012,
  ember: 0.003,
});
/** Desktop: chip and effect sprites a frame (beyond it, chips decimate to
 * two-tone rects by index hash), comets a frame, and on touch the nanite
 * sprites a frame (inside the 64 art draws). */
export const ASSEMBLY_SPRITE_BUDGET = 2400;
export const ASSEMBLY_COMET_BUDGET = 400;
export const ASSEMBLY_TOUCH_HERO_BUDGET = 16;

const BIRTH = 0.012;
// The crown ring's height above the visor (figure px): over the head.
const CROWN_LIFT = 96;
const RING_COUNT = 8;
const FREE_CHIPS = 240;
const FREE_CHIPS_TOUCH = 96;
const STAGED_MAX = 16;
const STAGED_RICH = 12;
const STAGED_TOUCH = 6;
const TOUCH_CHIPS = 6;
const TOUCH_RINGS = 2;
const TOUCH_CONDUITS = 4;
const TOUCH_LATTICE = 4;
const TOUCH_SEAMS = 4;
const SHOCK_MAX = 8;
const LATCH_MAX = 24;
const DROP_MAX = 240;
// The sprites the effects may take beside the chips (latches, clamps, shock
// rings, spall, sparks, the recede front's chips), held back from the far
// band's share of the budget. A constant, so the share is a function of the
// progress alone: the same moment draws the same chips however it was
// reached (the review's determinism rule).
const FX_RESERVE = 400;
// The nanites' own life (owner, 2026-10-16: 「更にナノマシンの挙動をブラッシュアップ
// して。」), every term a function of q and per-chip seeds: the plates seating
// at once whose ripple runs through the cocoon, the ripple's life, the
// glints a frame, and the key light the banking chips catch (upper left).
const RIPPLE_MAX = 4;
const RIPPLE_T = 0.012;
const GLINT_MAX = 96;
const LIGHT_X = -0.6;
const LIGHT_Y = -0.8;

/** A stable hash of an index into [0, 1) (no PRNG state). */
export function naniteHash(index, salt) {
  let x = Math.imul((index + 1) ^ Math.imul(salt + 0x51ed27, 0x9e3779b1), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** The cocoon's eight tilted ring lanes (figure px; ω in radians per unit
 * progress): the inner rings turn faster, directions alternate. */
export function naniteRings(width, height) {
  const rings = {
    count: RING_COUNT,
    cy: new Float64Array(RING_COUNT),
    rx: new Float64Array(RING_COUNT),
    ry: new Float64Array(RING_COUNT),
    cos: new Float64Array(RING_COUNT),
    sin: new Float64Array(RING_COUNT),
    dir: new Float64Array(RING_COUNT),
    omega: new Float64Array(RING_COUNT),
  };
  for (let r = 0; r < RING_COUNT; r += 1) {
    const cy = height * (0.13 + 0.112 * r);
    const rx = width * (0.4 + 0.1 * Math.sin((Math.PI * cy) / height));
    const tilt = (r % 2 === 0 ? 1 : -1) * 0.07;
    const dir = r % 2 === 0 ? 1 : -1;
    rings.cy[r] = cy;
    rings.rx[r] = rx;
    rings.ry[r] = 0.22 * rx;
    rings.cos[r] = Math.cos(tilt);
    rings.sin[r] = Math.sin(tilt);
    rings.dir[r] = dir;
    rings.omega[r] = (dir * TAU * 0.6 * ((0.45 * width) / rx) ** 1.5) / 0.1;
  }
  return rings;
}

/** A plate's seam (REXONANCE_NANITE_SEAMS): base64 Int16 LE [loopCount, n0,
 * x, y, …], quarter figure px. Returns the loops as figure-px point lists. */
export function decodeNaniteSeam(base64) {
  if (typeof base64 !== "string" || !base64) return [];
  let bytes;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return [];
  }
  const value = (k) => ((bytes[2 * k] | (bytes[2 * k + 1] << 8)) << 16) >> 16;
  const words = bytes.length >> 1;
  const loops = [];
  let at = 1;
  const count = words ? value(0) : 0;
  for (let loop = 0; loop < count && at < words; loop += 1) {
    const points = value(at);
    at += 1;
    if (points <= 0 || at + points * 2 > words) break;
    const xy = new Float32Array(points * 2);
    for (let k = 0; k < points * 2; k += 1) xy[k] = value(at + k) / 4;
    at += points * 2;
    loops.push(xy);
  }
  return loops;
}

const groupKind = (group) =>
  group === "helm" ? 3 : group === "tail" ? 1 : group === "ribbon" ? 2 : 0;

/**
 * The nanite stage plan, built in idle slices after the tile plan and the
 * gold plan: per plate its stage (seat, normal, gate, tilt axis, lift,
 * windows, contact, seam loops, gold box and gold cells), per tile its
 * ring, lane, phases, birth, lattice parent, the tile sharing its cell and
 * its paint time, the paint order, and the free chips. Index hashes only.
 */
export function* assemblyNanitePlanSteps({
  plan,
  pieces,
  size,
  core,
  visor,
  gold = null,
  seams = null,
  goldBoxes = null,
  goldCell = 4,
  coarse = false,
}) {
  const N = ASSEMBLY_NANITES;
  const { width: W, height: H } = size;
  const tiles = plan.tiles;
  const n = tiles.length;
  let work = 0;
  // A checkpoint every few thousand simple steps: well inside an idle
  // slice, and few enough that a starved idle queue still finishes.
  const tick = () => ++work % 512 === 0;

  // The tiles' own fields, copied once into typed arrays.
  const T0 = new Float64Array(n);
  const T1 = new Float64Array(n);
  const M = new Float64Array(n);
  const CX = new Float32Array(n);
  const CY = new Float32Array(n);
  const SX = new Float32Array(n);
  const SY = new Float32Array(n);
  const TW = new Float32Array(n);
  const TH = new Float32Array(n);
  const SRC = new Uint8Array(n);
  const TONE = new Uint8Array(n);
  const COV = new Float32Array(n);
  const owner = new Int16Array(n).fill(-1);
  const byId = new Map();
  pieces.forEach((piece, index) => byId.set(piece.id, index));
  const counts = new Int32Array(pieces.length);
  const done = new Float64Array(pieces.length).fill(-1);
  const beatOf = new Int8Array(pieces.length).fill(-1);
  for (let i = 0; i < n; i += 1) {
    const item = tiles[i];
    T0[i] = item.t0;
    T1[i] = item.t1;
    M[i] = item.m;
    CX[i] = item.cx;
    CY[i] = item.cy;
    SX[i] = item.sx;
    SY[i] = item.sy;
    TW[i] = item.tw;
    TH[i] = item.th;
    SRC[i] = item.src ?? 1;
    TONE[i] = item.tone ?? 0;
    COV[i] = item.cov ?? 1;
    const index = item.pieceId != null ? byId.get(item.pieceId) : undefined;
    if (index !== undefined && !pieces[index].preset) {
      owner[i] = index;
      counts[index] += 1;
      if (item.t1 > done[index]) done[index] = item.t1;
      beatOf[index] = item.beat ?? 0;
    }
    if (tick()) yield;
  }
  // A painted cell no piece claims rides with the nearest plate of its beat.
  for (let i = 0; i < n; i += 1) {
    if (owner[i] >= 0) continue;
    let best = -1;
    let bestD = Infinity;
    for (let pass = 0; pass < 2 && best < 0; pass += 1)
      for (let index = 0; index < pieces.length; index += 1) {
        if (!counts[index]) continue;
        if (!pass && beatOf[index] !== (tiles[i].beat ?? -2)) continue;
        const d = (pieces[index].seat[0] - CX[i]) ** 2 + (pieces[index].seat[1] - CY[i]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = index;
        }
      }
    owner[i] = best;
    if (tick()) yield;
  }

  // The plates, in the order their first tile flies.
  const [coreX, coreY] = core;
  const [eyeX, eyeY] = visor ?? [W / 2, H * 0.14];
  const members = pieces.map(() => []);
  for (let i = 0; i < n; i += 1) if (owner[i] >= 0) members[owner[i]].push(i);
  const list = [];
  let maxArea = 1;
  for (let index = 0; index < pieces.length; index += 1) {
    const own = members[index];
    if (!own.length) continue;
    const piece = pieces[index];
    let from = Infinity;
    let to = -Infinity;
    let area = 0;
    let srcMask = 0;
    for (const i of own) {
      // Only the piece's own tiles set its window (a stray cell lands late).
      if (tiles[i].pieceId === piece.id) {
        if (T0[i] < from) from = T0[i];
        if (T1[i] > to) to = T1[i];
      }
      area += TW[i] * TH[i];
      srcMask |= 1 << SRC[i];
    }
    if (!Number.isFinite(from)) {
      for (const i of own) {
        if (T0[i] < from) from = T0[i];
        if (T1[i] > to) to = T1[i];
      }
    }
    maxArea = Math.max(maxArea, area);
    list.push({ index, piece, own, from, to, area, srcMask });
    if (tick()) yield;
  }
  list.sort((a, b) => a.from - b.from || a.index - b.index);
  const NP = list.length;
  const npOf = new Int16Array(pieces.length).fill(-1);
  list.forEach((entry, p) => (npOf[entry.index] = p));

  // Each beat's last armour plate is its DEUS！ accent; the crest the helmet's.
  const accentTo = new Float64Array(4).fill(-1);
  const accentOf = new Int16Array(4).fill(-1);
  list.forEach((entry, p) => {
    const beat = beatOf[entry.index];
    if (groupKind(entry.piece.group) === 0 && beat >= 0 && beat < 4 && entry.to > accentTo[beat]) {
      accentTo[beat] = entry.to;
      accentOf[beat] = p;
    }
  });
  let crest = -1;
  list.forEach((entry, p) => {
    if (groupKind(entry.piece.group) !== 3) return;
    if (/crest/.test(entry.piece.id)) crest = p;
    else if (crest < 0 || entry.piece.seat[1] < list[crest].piece.seat[1]) crest = p;
  });

  // Seam loops, packed: per loop its first point, its count and perimeter.
  const loopStart = [];
  const loopCount = [];
  const loopPerim = [];
  const seamXs = [];
  const seamYs = [];
  const seamCums = [];
  let seamPoints = 0;

  const npieces = [];
  for (let p = 0; p < NP; p += 1) {
    const { index, piece, own, from, to, area, srcMask } = list[p];
    const kind = groupKind(piece.group);
    const helm = kind === 3;
    // Formed in place, never lifted or tilted: the helmet, and the narrow
    // hanging plates (the front tasset, a box much taller than wide) — a
    // staged offset of theirs read as a shift when they completed (owner,
    // 2026-10-16: 「前がけの生成完了時にズレるのを修正して。」).
    const fixed = helm || /^tasset/.test(piece.id) || (kind === 0 && piece.h > 1.85 * piece.w);
    const [seatX, seatY] = piece.seat;
    let nx = seatX - coreX;
    let ny = 0.5 * (seatY - coreY);
    let length = Math.hypot(nx, ny);
    if (length < 1e-6) {
      nx = 0;
      ny = -1;
      length = 1;
    }
    nx /= length;
    ny /= length;
    const boxX = piece.x + piece.w / 2;
    const boxY = piece.y + piece.h / 2;
    let gx = boxX - seatX;
    let gy = boxY - seatY;
    length = Math.hypot(gx, gy);
    if (length < 4) {
      gx = -nx;
      gy = -ny;
    } else {
      gx /= length;
      gy /= length;
    }
    const share = Math.sqrt(area / maxArea);
    const ornament = kind === 1 || kind === 2;
    const lift = helm ? 0 : (10 + 12 * share) * (ornament ? 1.4 : 1);
    const hx = Math.sign(seatX - W / 2) * Math.min(1, Math.abs(seatX - W / 2) / (0.25 * W));
    const accent = accentOf.includes(p);
    const isCrest = p === crest;
    const contact = to + (helm ? 0.003 : N.seat);
    let reach = 1;
    for (const i of own) reach = Math.max(reach, Math.hypot(CX[i] - seatX, CY[i] - seatY));
    const box = goldBoxes?.[piece.id];
    const seg = kind === 1 ? Number(/tail-(\d)/.exec(piece.id)?.[1] ?? 0) : 0;
    // Seams.
    const loops = decodeNaniteSeam(seams?.[piece.id]);
    const firstLoop = loopStart.length;
    for (const xy of loops) {
      const count = xy.length / 2;
      if (count < 2) continue;
      loopStart.push(seamPoints);
      loopCount.push(count);
      let cum = 0;
      for (let k = 0; k < count; k += 1) {
        if (k) cum += Math.hypot(xy[2 * k] - xy[2 * k - 2], xy[2 * k + 1] - xy[2 * k - 1]);
        seamXs.push(xy[2 * k]);
        seamYs.push(xy[2 * k + 1]);
        seamCums.push(cum);
      }
      cum += Math.hypot(xy[0] - xy[2 * count - 2], xy[1] - xy[2 * count - 1]);
      loopPerim.push(cum);
      seamPoints += count;
    }
    // The river's gate, 0.1H out along the normal — kept inside the frame:
    // a gate that would fall below the feet moves outward instead.
    let gateX = seatX + nx * 0.1 * H;
    let gateY = seatY + ny * 0.1 * H;
    if (gateY > H - 36) {
      gateX += (seatX < W / 2 ? -1 : 1) * (gateY - (H - 36));
      gateY = H - 36;
    }
    const shock =
      Math.min(220, Math.max(40, 1.6 * Math.max(piece.w, piece.h) * (0.6 + 0.9 * share))) *
      (isCrest ? 1.4 : accent ? 1.3 : 1);
    npieces.push({
      index,
      id: piece.id,
      group: piece.group,
      kind,
      seg,
      helm,
      fixed,
      ornament,
      srcMask,
      x: piece.x,
      y: piece.y,
      w: piece.w,
      h: piece.h,
      ax: piece.ax ?? 0,
      ay: piece.ay ?? 0,
      atlas: piece.ax !== undefined && piece.ay !== undefined,
      seatX,
      seatY,
      nx,
      ny,
      gateX,
      gateY,
      gx,
      gy,
      lift,
      theta: fixed ? 0 : (coarse ? 12 : 18) * DEG,
      offX: fixed ? 0 : lift * (0.55 * hx - 0.3),
      offY: fixed ? 0 : lift * -0.55,
      area,
      share,
      from,
      to,
      contact,
      stageEnd: contact + (kind === 1 || kind === 2 ? 0.012 : N.overshoot),
      accent,
      crest: isCrest,
      reach,
      shock: Math.min(220, shock),
      spall: isCrest ? 14 : accent ? 10 : 6,
      gbox: box ? [box[0], box[1], box[2], box[3]] : [piece.x, piece.y, piece.w, piece.h],
      hasGoldBox: Boolean(box),
      loopFirst: firstLoop,
      loopCount: loopStart.length - firstLoop,
      tiles: null,
      t1s: null,
      // Gold: its cells (global indices, sorted by lock), its pour window.
      goldFirst: 0,
      goldEnd: 0,
      g0: Infinity,
      g1: -Infinity,
      span: helm ? 0.016 : 0.03,
      // The guideway's build window (set with the gold) and its climb.
      buildStart: Infinity,
      buildEnd: Infinity,
      climb: -1,
      recedeEnd: contact + 0.02,
      releaseEnd: contact + 0.028,
    });
    if (tick()) yield;
  }

  // Each plate's tiles (sorted by landing, as the plan is).
  for (let p = 0; p < NP; p += 1) {
    const own = list[p].own;
    const ids = new Int32Array(own.length);
    const t1s = new Float64Array(own.length);
    own.forEach((i, k) => {
      ids[k] = i;
      t1s[k] = T1[i];
    });
    npieces[p].tiles = ids;
    npieces[p].t1s = t1s;
    if (tick()) yield;
  }

  // The tiles' nanite fields.
  const pieceOf = new Int16Array(n).fill(-1);
  const ring = new Uint8Array(n);
  const lane = new Int8Array(n);
  const th0 = new Float32Array(n);
  const phi = new Float32Array(n);
  const f0 = new Float32Array(n);
  const spin = new Float32Array(n);
  const r0 = new Float32Array(n);
  const psi0 = new Float32Array(n);
  const birth = new Float64Array(n);
  const arm = new Uint8Array(n);
  const armDir = new Int8Array(n);
  const gateJ = new Float32Array(n);
  const helmD = new Float32Array(n);
  const hsh = new Float32Array(n);
  const tp = new Float64Array(n);
  const rings = naniteRings(W, H);
  let helmReach = 1;
  for (let i = 0; i < n; i += 1)
    if (owner[i] >= 0 && npieces[npOf[owner[i]]].helm)
      helmReach = Math.max(helmReach, Math.hypot(CX[i] - eyeX, CY[i] - eyeY));
  const [m0, m1] = [0.07, 0.16];
  for (let i = 0; i < n; i += 1) {
    const p = owner[i] >= 0 ? npOf[owner[i]] : -1;
    pieceOf[i] = p;
    const piece = p >= 0 ? npieces[p] : null;
    // The ring nearest the tile's target height (the helmet's: the top).
    let r = 0;
    if (!piece?.helm) {
      let best = Infinity;
      for (let k = 0; k < RING_COUNT; k += 1) {
        const d = Math.abs(rings.cy[k] - CY[i]);
        if (d < best) {
          best = d;
          r = k;
        }
      }
    }
    ring[i] = r;
    lane[i] = Math.min(1, Math.floor(naniteHash(i, 11) * 3) - 1);
    th0[i] = TAU * naniteHash(i, 12);
    phi[i] = TAU * naniteHash(i, 13);
    f0[i] = 24 * naniteHash(i, 14);
    spin[i] = 0.2 + 0.3 * naniteHash(i, 15);
    r0[i] = 10 + 12 * naniteHash(i, 16);
    psi0[i] = TAU * naniteHash(i, 17);
    const wave = Math.min(5, Math.max(0, Math.floor((M[i] - m0) / BIRTH)));
    birth[i] = Math.min(M[i], m0 + BIRTH * wave + 0.003 * naniteHash(i, 18));
    arm[i] = Math.floor(naniteHash(i, 19) * 3) % 3;
    armDir[i] = wave % 2 ? -1 : 1;
    gateJ[i] = (naniteHash(i, 21) - 0.5) * 0.024 * H;
    hsh[i] = naniteHash(i, 22);
    if (piece?.helm) helmD[i] = Math.hypot(CX[i] - eyeX, CY[i] - eyeY) / helmReach;
    // Paint develops from the seat outward after contact.
    if (piece) {
      const d = Math.hypot(CX[i] - piece.seatX, CY[i] - piece.seatY) / piece.reach;
      tp[i] = Math.max(piece.contact + 0.001 + (piece.helm ? 0.004 : N.paint) * d, T1[i] + 0.0005);
    } else tp[i] = T1[i] + 0.0005;
    if (tick()) yield;
  }
  void m1;

  // The lattice parent (the nearest earlier 8-neighbour of its plate) and
  // the tile sharing its cell (an ornament over the armour).
  const cols = plan.cols;
  const rows = plan.rows;
  const grids = [new Int32Array(cols * rows).fill(-1), new Int32Array(cols * rows).fill(-1)];
  const cellOf = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const c = Math.min(cols - 1, Math.floor(SX[i] / plan.tile));
    const rr = Math.min(rows - 1, Math.floor(SY[i] / plan.tile));
    cellOf[i] = rr * cols + c;
    grids[SRC[i] ? 1 : 0][cellOf[i]] = i;
    if (tick()) yield;
  }
  const parent = new Int32Array(n).fill(-1);
  const under = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i += 1) {
    const grid = grids[SRC[i] ? 1 : 0];
    const other = grids[SRC[i] ? 0 : 1][cellOf[i]];
    if (other >= 0 && other !== i) under[i] = other;
    const c = cellOf[i] % cols;
    const rr = (cellOf[i] - c) / cols;
    let best = -1;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const x = c + dx;
        const y = rr + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const j = grid[y * cols + x];
        if (j < 0 || pieceOf[j] !== pieceOf[i] || j >= i) continue;
        if (j > best) best = j;
      }
    parent[i] = best;
    if (tick()) yield;
  }

  // The paint order: a stable merge sort by paint time, with checkpoints.
  let order = Int32Array.from({ length: n }, (_, i) => i);
  let scratch = new Int32Array(n);
  for (let width = 1; width < n; width *= 2) {
    for (let start = 0; start < n; start += width * 2) {
      const mid = Math.min(start + width, n);
      const end = Math.min(start + width * 2, n);
      let left = start;
      let right = mid;
      for (let at = start; at < end; at += 1) {
        scratch[at] =
          right >= end || (left < mid && tp[order[left]] <= tp[order[right]])
            ? order[left++]
            : order[right++];
        if (tick()) yield;
      }
    }
    [order, scratch] = [scratch, order];
  }
  const paintAt = new Float64Array(n);
  const paintRank = new Int32Array(n);
  for (let k = 0; k < n; k += 1) {
    paintAt[k] = tp[order[k]];
    paintRank[order[k]] = k;
    if (tick()) yield;
  }
  // How far past q the seated pass must look along the paint order: the
  // longest a landed tile waits for its paint once no stage holds it. A
  // staged plate holds its tiles until its stage ends; the helmet, formed in
  // place and never staged, holds none — its outer tiles land up to ~.05
  // before their paint and must stay drawn all that while (review
  // 2026-10-16: they vanished after landing, then popped back as metal).
  let seatLag = 0.0125;
  for (let i = 0; i < n; i += 1) {
    const piece = pieceOf[i] >= 0 ? npieces[pieceOf[i]] : null;
    const held = piece && !piece.fixed ? Math.max(T1[i], piece.stageEnd) : T1[i];
    if (tp[i] - held > seatLag) seatLag = tp[i] - held;
  }

  // Each plate's gold cells (the gold plan is sorted by lock).
  let goldIdx = new Int32Array(0);
  let goldHash = new Float32Array(0);
  if (gold?.count && gold.piece) {
    const per = new Int32Array(NP + 1);
    for (let i = 0; i < gold.count; i += 1) {
      const p = gold.piece[i] >= 0 ? npOf[gold.piece[i]] : -1;
      if (p >= 0) per[p + 1] += 1;
      if (tick()) yield;
    }
    for (let p = 0; p < NP; p += 1) per[p + 1] += per[p];
    const fill = per.slice(0, NP);
    goldIdx = new Int32Array(per[NP]);
    goldHash = new Float32Array(gold.count);
    for (let i = 0; i < gold.count; i += 1) {
      goldHash[i] = naniteHash(i, 31);
      const p = gold.piece[i] >= 0 ? npOf[gold.piece[i]] : -1;
      if (p < 0) continue;
      goldIdx[fill[p]++] = i;
      const piece = npieces[p];
      if (gold.lock[i] < piece.g0) piece.g0 = gold.lock[i];
      if (gold.lock[i] > piece.g1) piece.g1 = gold.lock[i];
      if (tick()) yield;
    }
    for (let p = 0; p < NP; p += 1) {
      const piece = npieces[p];
      piece.goldFirst = per[p];
      piece.goldEnd = per[p + 1];
      if (piece.goldEnd > piece.goldFirst) {
        // The pour runs from to + delay; flow = (lock − start) / span.
        piece.g0 = Math.min(piece.g0, done[piece.index] + 0.008);
        piece.recedeEnd = piece.g1 + 0.012;
        piece.releaseEnd = piece.recedeEnd + N.release;
        if (!piece.hasGoldBox) {
          let x0 = Infinity;
          let y0 = Infinity;
          let x1 = -Infinity;
          let y1 = -Infinity;
          for (let k = piece.goldFirst; k < piece.goldEnd; k += 1) {
            const i = goldIdx[k];
            x0 = Math.min(x0, gold.x[i]);
            y0 = Math.min(y0, gold.y[i]);
            x1 = Math.max(x1, gold.x[i] + gold.w[i]);
            y1 = Math.max(y1, gold.y[i] + gold.h[i]);
          }
          piece.gbox = [x0, y0, x1 - x0, y1 - y0];
          piece.hasGoldBox = true;
        }
      }
      if (tick()) yield;
    }
  }

  // The guideway's build (owner, 2026-10-16: 「金のガイドウェイは上から
  // 被さる形ではなく、足先から滑らかに作られていく。」): each plate's conduit
  // grows from its lowest cell along its trims (the geodesic distance through
  // its 8-connected gold cells; a higher island starts when the front has
  // climbed to it), and each beat's front climbs the body from its lowest
  // plate at a steady speed, ahead of that beat's landings — from the toe
  // tips up the legs first. Per plate, its cells sorted by build time.
  const G = goldCell;
  const buildB = new Float32Array(gold?.count ?? 0);
  const buildAt = new Float64Array(goldIdx.length);
  const buildIdx = new Int32Array(goldIdx.length);
  if (goldIdx.length) {
    // A climb per beat (the ribbons, which hang from the shoulders to the
    // feet, climb beside the tail rather than below it).
    const groupBottom = new Map();
    const groupTop = new Map();
    const groupFrom = new Map();
    const groupContact = new Map();
    const bottomOf = new Float64Array(NP);
    for (let p = 0; p < NP; p += 1) {
      const piece = npieces[p];
      if (piece.goldEnd <= piece.goldFirst) continue;
      let bottom = -Infinity;
      let top = Infinity;
      for (let k = piece.goldFirst; k < piece.goldEnd; k += 1) {
        const i = goldIdx[k];
        bottom = Math.max(bottom, gold.y[i] + gold.h[i]);
        top = Math.min(top, gold.y[i]);
      }
      bottomOf[p] = bottom;
      const beat = beatOf[piece.index];
      const key = piece.kind === 2 ? 40 : beat >= 0 ? beat : 10 + piece.kind;
      piece.climb = key;
      groupBottom.set(key, Math.max(groupBottom.get(key) ?? -Infinity, bottom));
      groupTop.set(key, Math.min(groupTop.get(key) ?? Infinity, top));
      groupFrom.set(key, Math.min(groupFrom.get(key) ?? Infinity, piece.from));
      groupContact.set(key, Math.min(groupContact.get(key) ?? Infinity, piece.contact));
      if (tick()) yield;
    }
    // Each climb starts with its plates' first flights (the latch's lead),
    // or later, so its frames appear just before their plates are fitted.
    const groupStart = new Map();
    for (const [key, bottom] of groupBottom) {
      const climbs = (bottom - groupTop.get(key)) / ASSEMBLY_GUIDEWAY.climb;
      groupStart.set(
        key,
        Math.max(
          groupFrom.get(key) - N.lead,
          groupContact.get(key) - ASSEMBLY_GUIDEWAY.ready - climbs - ASSEMBLY_GUIDEWAY.early,
        ),
      );
    }
    // The tail is one chain (review 2026-10-16: it grew from the hanging
    // blade and at the root at once, a cloud of flecks): root to blade,
    // tail-0 → 1a → 1b → … → 4b, each segment from the cell nearest the
    // last its predecessor built, starting as that one is 80% done. The
    // other plates keep the plate order.
    const chainOrder = [];
    for (let p = 0; p < NP; p += 1) if (npieces[p].kind !== 1) chainOrder.push(p);
    const tailOrder = [];
    for (let p = 0; p < NP; p += 1) if (npieces[p].kind === 1) tailOrder.push(p);
    tailOrder.sort((a, b) =>
      npieces[a].seg !== npieces[b].seg
        ? npieces[a].seg - npieces[b].seg
        : npieces[a].id < npieces[b].id
          ? -1
          : 1,
    );
    for (const p of tailOrder) chainOrder.push(p);
    let anchorX = NaN;
    let anchorY = NaN;
    let chainNext = NaN;
    for (const p of chainOrder) {
      const piece = npieces[p];
      const first = piece.goldFirst;
      const count = piece.goldEnd - first;
      if (count <= 0) continue;
      const chained = piece.kind === 1 && anchorX === anchorX;
      const cols = Math.ceil(piece.w / G) + 2;
      const rows = Math.ceil(piece.h / G) + 2;
      const grid = new Int32Array(cols * rows).fill(-1);
      const col = new Int32Array(count);
      const row = new Int32Array(count);
      for (let k = 0; k < count; k += 1) {
        const i = goldIdx[first + k];
        col[k] = Math.min(cols - 1, Math.max(0, Math.round((gold.x[i] - piece.x) / G)));
        row[k] = Math.min(rows - 1, Math.max(0, Math.round((gold.y[i] - piece.y) / G)));
        grid[row[k] * cols + col[k]] = k;
      }
      // Each island in turn, from its lowest cell (nearest its middle).
      const dist = new Float64Array(count).fill(-1);
      const queue = new Int32Array(count);
      const label = new Int32Array(count).fill(-1);
      const heapD = new Float64Array(count * 8 + 8);
      const heapK = new Int32Array(count * 8 + 8);
      for (let seed = 0; seed < count; seed += 1) {
        if (label[seed] >= 0) continue;
        // The island's cells.
        let head = 0;
        let tail = 0;
        queue[tail++] = seed;
        label[seed] = seed;
        while (head < tail) {
          const k = queue[head++];
          for (let dy = -1; dy <= 1; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1) {
              const c = col[k] + dx;
              const r = row[k] + dy;
              if ((!dx && !dy) || c < 0 || r < 0 || c >= cols || r >= rows) continue;
              const j = grid[r * cols + c];
              if (j < 0 || label[j] >= 0) continue;
              label[j] = seed;
              queue[tail++] = j;
            }
        }
        let low = -1;
        let mean = 0;
        for (let at = 0; at < tail; at += 1) {
          const k = queue[at];
          mean += col[k];
          if (low < 0 || row[k] > row[low]) low = k;
        }
        mean /= tail;
        let entry = low;
        for (let at = 0; at < tail; at += 1) {
          const k = queue[at];
          if (row[k] === row[low] && Math.abs(col[k] - mean) < Math.abs(col[entry] - mean))
            entry = k;
        }
        // A chained tail segment's island starts at its cell nearest the
        // chain's front, as far along as that cell lies from it.
        let near = Infinity;
        if (chained)
          for (let at = 0; at < tail; at += 1) {
            const kk = queue[at];
            const ii = goldIdx[first + kk];
            const d = Math.hypot(
              gold.x[ii] + gold.w[ii] / 2 - anchorX,
              gold.y[ii] + gold.h[ii] / 2 - anchorY,
            );
            if (d < near) {
              near = d;
              entry = kk;
            }
          }
        // The front reaches a higher island when it has climbed to it.
        const i = goldIdx[first + entry];
        const offset = chained
          ? near / G
          : Math.max(0, (bottomOf[p] - (gold.y[i] + gold.h[i])) / G);
        // Dijkstra over the island (the diagonal costs √2), a binary heap.
        let size = 0;
        const push = (k, d) => {
          let at = size++;
          while (at > 0) {
            const up = (at - 1) >> 1;
            if (heapD[up] <= d) break;
            heapD[at] = heapD[up];
            heapK[at] = heapK[up];
            at = up;
          }
          heapD[at] = d;
          heapK[at] = k;
        };
        dist[entry] = offset;
        push(entry, offset);
        while (size > 0) {
          const k = heapK[0];
          const dk = heapD[0];
          size -= 1;
          const lastD = heapD[size];
          const lastK = heapK[size];
          let at = 0;
          for (;;) {
            let child = 2 * at + 1;
            if (child >= size) break;
            if (child + 1 < size && heapD[child + 1] < heapD[child]) child += 1;
            if (heapD[child] >= lastD) break;
            heapD[at] = heapD[child];
            heapK[at] = heapK[child];
            at = child;
          }
          heapD[at] = lastD;
          heapK[at] = lastK;
          if (dk > dist[k] + 1e-9) continue;
          for (let dy = -1; dy <= 1; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1) {
              const c = col[k] + dx;
              const r = row[k] + dy;
              if ((!dx && !dy) || c < 0 || r < 0 || c >= cols || r >= rows) continue;
              const j = grid[r * cols + c];
              if (j < 0) continue;
              const d = dk + (dx && dy ? Math.SQRT2 : 1);
              if (dist[j] >= 0 && dist[j] <= d + 1e-9) continue;
              dist[j] = d;
              push(j, d);
            }
          if (tick()) yield;
        }
      }
      if (chained) {
        // (Its nearest cell is where it starts: along from there.)
        let least = Infinity;
        for (let k = 0; k < count; k += 1) if (dist[k] >= 0 && dist[k] < least) least = dist[k];
        for (let k = 0; k < count; k += 1) if (dist[k] >= 0) dist[k] -= least;
      }
      let most = 0;
      let last = 0;
      for (let k = 0; k < count; k += 1)
        if (dist[k] > most) {
          most = dist[k];
          last = k;
        }
      // Its window: the beat's front reaches its bottom, then it grows at the
      // climb's speed along its trims; always done before it seats. A tail
      // segment follows its predecessor along the chain.
      const key = piece.climb;
      let gs = chained
        ? chainNext
        : piece.kind === 1
          ? groupStart.get(key)
          : groupStart.get(key) + (groupBottom.get(key) - bottomOf[p]) / ASSEMBLY_GUIDEWAY.climb;
      // (The chain runs half again as fast: nine segments in one build.)
      let length = (most * G) / (ASSEMBLY_GUIDEWAY.climb * (piece.kind === 1 ? 1.5 : 1));
      const latest = piece.contact - ASSEMBLY_GUIDEWAY.ready;
      if (gs > latest - 0.004) gs = latest - 0.004;
      if (gs + length > latest) length = latest - gs;
      piece.buildStart = gs;
      piece.buildEnd = gs + length;
      if (piece.kind === 1) {
        const li = goldIdx[first + last];
        anchorX = gold.x[li] + gold.w[li] / 2;
        anchorY = gold.y[li] + gold.h[li] / 2;
        chainNext = gs + 0.8 * length;
      }
      for (let k = 0; k < count; k += 1) {
        const i = goldIdx[first + k];
        const b = most > 0 ? Math.max(0, dist[k]) / most : 0;
        buildB[i] = b;
        buildAt[first + k] = gs + b * length;
        buildIdx[first + k] = i;
      }
      // Sorted by build time (insertion sort into the plate's segment).
      for (let k = first + 1; k < first + count; k += 1) {
        const t = buildAt[k];
        const i = buildIdx[k];
        let at = k - 1;
        while (at >= first && buildAt[at] > t) {
          buildAt[at + 1] = buildAt[at];
          buildIdx[at + 1] = buildIdx[at];
          at -= 1;
        }
        buildAt[at + 1] = t;
        buildIdx[at + 1] = i;
        if (tick()) yield;
      }
    }
  }

  // The free chips: born in the pump waves, they never fly; at the seal
  // they spiral into the reactor.
  const F = coarse ? FREE_CHIPS_TOUCH : FREE_CHIPS;
  const free = {
    count: F,
    ring: new Uint8Array(F),
    lane: new Int8Array(F),
    th0: new Float32Array(F),
    phi: new Float32Array(F),
    f0: new Float32Array(F),
    spin: new Float32Array(F),
    birth: new Float64Array(F),
    arm: new Uint8Array(F),
    armDir: new Int8Array(F),
    tone: new Uint8Array(F),
    hsh: new Float32Array(F),
  };
  for (let j = 0; j < F; j += 1) {
    const k = j + 100003;
    free.ring[j] = Math.min(RING_COUNT - 1, Math.floor(naniteHash(k, 40) * RING_COUNT));
    free.lane[j] = Math.min(1, Math.floor(naniteHash(k, 41) * 3) - 1);
    free.th0[j] = TAU * naniteHash(k, 42);
    free.phi[j] = TAU * naniteHash(k, 43);
    free.f0[j] = 24 * naniteHash(k, 44);
    free.spin[j] = 0.2 + 0.3 * naniteHash(k, 45);
    free.birth[j] = m0 + BIRTH * (j % 6) + 0.003 * naniteHash(k, 46);
    free.arm[j] = Math.floor(naniteHash(k, 47) * 3) % 3;
    free.armDir[j] = (j % 6) % 2 ? -1 : 1;
    free.tone[j] = j % 9 === 0 ? 2 : j % 2;
    free.hsh[j] = naniteHash(k, 49);
  }

  const seamX = Float32Array.from(seamXs);
  const seamY = Float32Array.from(seamYs);
  const seamCum = Float32Array.from(seamCums);
  yield;
  return {
    count: n,
    pieces: npieces,
    T0,
    T1,
    M,
    CX,
    CY,
    SX,
    SY,
    TW,
    TH,
    SRC,
    TONE,
    COV,
    pieceOf,
    ring,
    lane,
    th0,
    phi,
    f0,
    spin,
    r0,
    psi0,
    birth,
    arm,
    armDir,
    gateJ,
    helmD,
    hsh,
    tp,
    parent,
    under,
    paintOrder: order,
    paintAt,
    paintRank,
    seatLag,
    goldIdx,
    goldHash,
    buildB,
    buildAt,
    buildIdx,
    rings,
    free,
    seams: {
      x: seamX,
      y: seamY,
      cum: seamCum,
      start: Int32Array.from(loopStart),
      count: Int32Array.from(loopCount),
      perimeter: Float32Array.from(loopPerim),
    },
  };
}

/** The same plan, synchronously (tests and callers). */
export function planAssemblyNanites(options) {
  const steps = assemblyNanitePlanSteps(options);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

/** The scaffold lattice (armour A2), drawn once in idle slices onto a
 * figure-sized sheet: each tile's centre an ice node, links to its right
 * and lower neighbours in the same plate. */
export function* naniteLatticeSteps(context, nano, tile) {
  const n = nano.count;
  const cols = Math.max(1, Math.round(Math.max(...nano.SX) / tile) + 2);
  const grid = new Map();
  for (let i = 0; i < n; i += 1) {
    const key = Math.round(nano.SY[i] / tile) * cols + Math.round(nano.SX[i] / tile);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  const neighbour = (i, dx, dy) => {
    const key = (Math.round(nano.SY[i] / tile) + dy) * cols + Math.round(nano.SX[i] / tile) + dx;
    const there = grid.get(key);
    if (!there) return -1;
    for (const j of there) if (nano.pieceOf[j] === nano.pieceOf[i]) return j;
    return -1;
  };
  for (let start = 0; start < n; start += 320) {
    const end = Math.min(n, start + 320);
    context.globalAlpha = 0.3;
    context.strokeStyle = "rgb(150 236 255)";
    context.lineWidth = 0.6;
    context.beginPath();
    for (let i = start; i < end; i += 1) {
      if (nano.pieceOf[i] < 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const j = neighbour(i, dx, dy);
        if (j < 0) continue;
        context.moveTo(nano.CX[i], nano.CY[i]);
        context.lineTo(nano.CX[j], nano.CY[j]);
      }
    }
    context.stroke();
    context.globalAlpha = 0.85;
    context.fillStyle = "rgb(190 246 255)";
    context.beginPath();
    for (let i = start; i < end; i += 1) {
      if (nano.pieceOf[i] < 0) continue;
      context.rect(nano.CX[i] - 0.55, nano.CY[i] - 0.55, 1.1, 1.1);
    }
    context.fill();
    context.globalAlpha = 1;
    yield;
  }
}

/* ---------------- the conduit's own layers (review, 2026-10-16) ----------------
   The guide (REXONANCE_NANITE_GUIDE) is traced from each plate's raw gold
   mask, which also covers dark metal the finished art never shows as gold
   (a whole triangle under the helmet's brow, the knee discs' crystals). The
   conduit is re-made from it per plate, for exactly the gold the finished
   art shows there: hard-light ice glass over that gold only, a continuous
   ice channel down every strip, and gold rails — the guide's own wherever
   gold shows, plus rails traced along the visible gold's edges — lit from
   the upper left. Everything conduit-derived (the face, its hologram, its
   walls, the molten gold's mask, which cells pulse, print and throw
   droplets) comes from it, so nothing paints gold the art does not show. */

/** How much a pixel of the finished art reads as gold, 0–1: warm (red over
 * green over blue, green clearly above blue, so never the pink or cyan
 * lights), saturated (highlights a little less) and lit. */
export function naniteGoldTone(r, g, b) {
  const warm = clamp01((g - b - 12) / 30) * clamp01((r - g + 6) / 20);
  if (!warm) return 0;
  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const sat = max ? (max - min) / max : 0;
  const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return warm * clamp01((sat - 0.08) / 0.12) * clamp01((L - 0.1) / 0.1);
}

// The rails' gold, dark amber to white-hot: stops (t, r, g, b).
const CONDUIT_GOLD = [
  0, 64, 36, 10, 0.3, 170, 104, 34, 0.6, 236, 182, 92, 0.82, 255, 224, 150, 1, 255, 248, 226,
];
const CONDUIT_ICE = [140, 217, 255];
const CONDUIT_CHANNEL = [200, 245, 255];
const conduitByte = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
// The eight compass steps (dx, dy).
const CONDUIT_RAYS = [1, 0, 1, 1, 0, 1, -1, 1, -1, 0, -1, -1, 0, -1, 1, -1];

// A cut in plate gold: a pixel where the art's gold runs on although this
// plate's gold has ended beside it — or the plate's gold running into the
// cell's edge.
const conduitCut = (tn, gold, w, h, x, y) => {
  const k = y * w + x;
  if (tn[k] < 0.3) return false;
  const own = gold[k * 4 + 3];
  if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return own >= 24;
  if (own >= 24) return false;
  for (let yy = y - 1; yy <= y + 1; yy += 1)
    for (let xx = x - 1; xx <= x + 1; xx += 1) {
      const kk = yy * w + xx;
      if (tn[kk] >= 0.3 && gold[kk * 4 + 3] >= 64) return true;
    }
  return false;
};

/**
 * One plate's conduit, row by row (yields after every row, so the idle
 * slices that drive it stay short). `cell` = { w, h, fx, fy }: the plate's
 * atlas cell size and its place in the figure. `io`: the plate's `guide`,
 * `gold` and `art` pixels (w × h RGBA; `art` the finished figure under the
 * cell), scratch `m`, `tn`, `hm` (Float32Array) and `d`, `dc` (Uint16Array) of at least
 * w × h, the outputs `face` and optional `holo` and `walls` (w × h RGBA,
 * zeroed), and the figure-space `mask` and optional `figFace` (W × H RGBA,
 * accumulated: the mask by maximum, the face overwritten).
 */
export function* naniteConduitRows(cell, io) {
  const { w, h, fx, fy } = cell;
  const { guide, gold, art, m, tn, hm, d, dc, face, holo, walls, mask, figFace, W, H } = io;
  // 1. The art's gold tone, and the gold it shows in this plate: its gold
  // alpha × the tone.
  for (let y = 0; y < h; y += 1) {
    for (let x = 0, i = y * w * 4; x < w; x += 1, i += 4) {
      const ga = gold[i + 3];
      const k = y * w + x;
      const tone = art[i + 3] ? (art[i + 3] / 255) * naniteGoldTone(art[i], art[i + 1], art[i + 2]) : 0;
      tn[k] = tone;
      if (!ga || !tone) {
        m[k] = 0;
        continue;
      }
      m[k] = (ga / 255) * tone;
    }
    yield;
  }
  // 2. Its distance transform (chamfer 3–4, the cell's border as outside),
  // a 5 px running maximum along the rows for the dilated mask, and the
  // distance to a cut (`dc`): where the art's gold runs on past this plate's
  // gold (into the next plate, or past the cell's edge), so the conduit
  // fades there instead of ending on a straight line (review 2026-10-16:
  // the helmet's brow).
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const k = y * w + x;
      let c = 65535;
      if (conduitCut(tn, gold, w, h, x, y)) c = 0;
      else {
        if (x > 0 && dc[k - 1] + 3 < c) c = dc[k - 1] + 3;
        if (y > 0) {
          if (dc[k - w] + 3 < c) c = dc[k - w] + 3;
          if (x > 0 && dc[k - w - 1] + 4 < c) c = dc[k - w - 1] + 4;
          if (x + 1 < w && dc[k - w + 1] + 4 < c) c = dc[k - w + 1] + 4;
        }
      }
      dc[k] = c;
      let best = 0;
      if (m[k] > 0.4) {
        best = 65535;
        const l = x > 0 ? d[k - 1] + 3 : 3;
        if (l < best) best = l;
        if (y > 0) {
          const u = d[k - w] + 3;
          if (u < best) best = u;
          const ul = x > 0 ? d[k - w - 1] + 4 : 4;
          if (ul < best) best = ul;
          const ur = x + 1 < w ? d[k - w + 1] + 4 : 4;
          if (ur < best) best = ur;
        } else best = Math.min(best, 3);
      }
      d[k] = best;
      let peak = 0;
      for (let t = x - 2; t <= x + 2; t += 1) if (t >= 0 && t < w && m[y * w + t] > peak) peak = m[y * w + t];
      hm[k] = peak;
    }
    yield;
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const k = y * w + x;
      let c = dc[k];
      if (c) {
        if (x + 1 < w && dc[k + 1] + 3 < c) c = dc[k + 1] + 3;
        if (y + 1 < h) {
          if (dc[k + w] + 3 < c) c = dc[k + w] + 3;
          if (x + 1 < w && dc[k + w + 1] + 4 < c) c = dc[k + w + 1] + 4;
          if (x > 0 && dc[k + w - 1] + 4 < c) c = dc[k + w - 1] + 4;
        }
        dc[k] = c;
      }
      let best = d[k];
      if (!best) continue;
      const r = x + 1 < w ? d[k + 1] + 3 : 3;
      if (r < best) best = r;
      if (y + 1 < h) {
        const b = d[k + w] + 3;
        if (b < best) best = b;
        const br = x + 1 < w ? d[k + w + 1] + 4 : 4;
        if (br < best) best = br;
        const bl = x > 0 ? d[k + w - 1] + 4 : 4;
        if (bl < best) best = bl;
      } else if (3 < best) best = 3;
      d[k] = best;
    }
    yield;
  }
  // 3. The face, its hologram and its walls. Rails run only along the art's
  // own trim edges (where its gold tone ends), never along a cut where one
  // plate's gold meets the next plate's across a straight line, nor along
  // the cell's edge (the tone is read as running on past it), and the whole
  // conduit fades out over the last 5 px before a cut.
  const at = (x, y) =>
    tn[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  const dist = (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? d[y * w + x] : 0);
  // Outside the art's gold: low tone, and not a speck of shadow (within
  // 3 px of gold every way round) inside it. Coordinates clamp to the cell.
  const low = (x, y) => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x;
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y;
    if (tn[cy * w + cx] >= 0.3) return false;
    for (let r = 0; r < 16; r += 2) {
      let hit = false;
      for (let step = 1; step <= 3; step += 1) {
        const xx = cx + CONDUIT_RAYS[r] * step;
        const yy = cy + CONDUIT_RAYS[r + 1] * step;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
        if (tn[yy * w + xx] >= 0.3) {
          hit = true;
          break;
        }
      }
      if (!hit) return true;
    }
    return false;
  };
  const ridge = (k0, a, b) => k0 >= a && k0 >= b && (k0 > a || k0 > b);
  for (let y = 0; y < h; y += 1) {
    const Y = fy + y;
    const scan = ((Y % 3) + 3) % 3 === 2 ? 0.22 : 1;
    for (let x = 0, i = y * w * 4; x < w; x += 1, i += 4) {
      const k = y * w + x;
      const v = m[k];
      // The visible gold's mask (the molten gold's), softened over 4 px
      // before a cut like the conduit.
      if (v > 0) {
        const X = fx + x;
        const byte = conduitByte(v * smooth(clamp01((dc[k] - 1) / 12)) * 255);
        if (byte && X >= 0 && X < W && Y >= 0 && Y < H) {
          const o = (Y * W + X) * 4;
          if (byte > mask[o + 3]) {
            mask[o] = mask[o + 1] = mask[o + 2] = 255;
            mask[o + 3] = byte;
          }
        }
      }
      let dilated = 0;
      for (let t = y - 2; t <= y + 2; t += 1) if (t >= 0 && t < h && hm[t * w + x] > dilated) dilated = hm[t * w + x];
      if (dilated <= 0.02) continue;
      const cut = smooth(clamp01((dc[k] - 3) / 15));
      if (cut <= 0) continue;
      // Glass: ice, over the visible gold only.
      let a = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      const glass = (72 / 255) * smooth(clamp01(v / 0.6));
      if (glass > 0) {
        a = glass;
        r = CONDUIT_ICE[0];
        g = CONDUIT_ICE[1];
        b = CONDUIT_ICE[2];
      }
      // The channel: the distance transform's ridge, in strips ≥ 3 px wide.
      const dk = d[k];
      if (dk >= 5) {
        const dl = dist(x - 1, y);
        const dr = dist(x + 1, y);
        const du = dist(x, y - 1);
        const dd = dist(x, y + 1);
        if (
          ridge(dk, dl, dr) ||
          ridge(dk, du, dd) ||
          ridge(dk, dist(x - 1, y - 1), dist(x + 1, y + 1)) ||
          ridge(dk, dist(x + 1, y - 1), dist(x - 1, y + 1))
        ) {
          const ca = (210 / 255) * clamp01((dk / 3 - 1.2) / 0.8);
          const na = ca + a * (1 - ca);
          if (na > 0) {
            r = (CONDUIT_CHANNEL[0] * ca + r * a * (1 - ca)) / na;
            g = (CONDUIT_CHANNEL[1] * ca + g * a * (1 - ca)) / na;
            b = (CONDUIT_CHANNEL[2] * ca + b * a * (1 - ca)) / na;
            a = na;
          }
        }
      }
      // Rails: along the visible gold's true edges (on its inner side, 2 px
      // wide: where the art's gold ends, never along its own shading nor
      // round a speck of shadow inside it), lit where the edge faces the
      // upper left; and the guide's own rails wherever gold shows.
      let rail = 0;
      let tone = 0;
      if (v > 0.3 && tn[k] > 0.3) {
        const near =
          low(x + 1, y) || low(x - 1, y) || low(x, y + 1) || low(x, y - 1)
            ? 1
            : low(x + 2, y) || low(x - 2, y) || low(x, y + 2) || low(x, y - 2)
              ? 0.72
              : 0;
        if (near) {
          const gx = at(x + 1, y) - at(x - 1, y) + 0.5 * (at(x + 2, y) - at(x - 2, y));
          const gy = at(x, y + 1) - at(x, y - 1) + 0.5 * (at(x, y + 2) - at(x, y - 2));
          const edge = Math.hypot(gx, gy);
          rail = near;
          tone = edge > 0.05 ? 0.6 + 0.4 * ((gx + gy) / (Math.SQRT2 * edge)) : 0.6;
        }
      }
      const guideA = guide[i + 3];
      let nearEdge = false;
      if (guideA >= 120 && dilated > 0.25)
        for (let yy = y - 1; yy <= y + 1 && !nearEdge; yy += 1)
          for (let xx = x - 1; xx <= x + 1; xx += 1)
            if (low(xx, yy)) {
              nearEdge = true;
              break;
            }
      if (nearEdge) {
        const keep = (guideA / 255) * clamp01(dilated * 1.6);
        if (keep > rail) {
          const L = (0.2126 * guide[i] + 0.7152 * guide[i + 1] + 0.0722 * guide[i + 2]) / 255;
          rail = keep;
          tone = clamp01(0.05 + 1.15 * L);
        }
      }
      if (rail > 0) {
        let s = 4;
        while (s < 16 && tone > CONDUIT_GOLD[s]) s += 4;
        const u = (tone - CONDUIT_GOLD[s - 4]) / (CONDUIT_GOLD[s] - CONDUIT_GOLD[s - 4]);
        const rr = CONDUIT_GOLD[s - 3] + (CONDUIT_GOLD[s + 1] - CONDUIT_GOLD[s - 3]) * u;
        const rg = CONDUIT_GOLD[s - 2] + (CONDUIT_GOLD[s + 2] - CONDUIT_GOLD[s - 2]) * u;
        const rb = CONDUIT_GOLD[s - 1] + (CONDUIT_GOLD[s + 3] - CONDUIT_GOLD[s - 1]) * u;
        const na = rail + a * (1 - rail);
        r = (rr * rail + r * a * (1 - rail)) / na;
        g = (rg * rail + g * a * (1 - rail)) / na;
        b = (rb * rail + b * a * (1 - rail)) / na;
        a = na;
        if (walls && rail > 0.25) {
          walls[i] = 92;
          walls[i + 1] = 60;
          walls[i + 2] = 22;
          walls[i + 3] = conduitByte(255 * rail * cut);
        }
      }
      a *= cut;
      if (a <= 0) continue;
      const fr = conduitByte(r);
      const fg = conduitByte(g);
      const fb = conduitByte(b);
      const fa = conduitByte(255 * a);
      face[i] = fr;
      face[i + 1] = fg;
      face[i + 2] = fb;
      face[i + 3] = fa;
      const X = fx + x;
      if (figFace && X >= 0 && X < W && Y >= 0 && Y < H) {
        const o = (Y * W + X) * 4;
        figFace[o] = fr;
        figFace[o + 1] = fg;
        figFace[o + 2] = fb;
        figFace[o + 3] = fa;
      }
      if (!holo) continue;
      // The hologram (gold G1): ice, brighter where the face is, scan-lined
      // on the figure's rows.
      const L = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      holo[i] = conduitByte(40 + 186 * L);
      holo[i + 1] = conduitByte(150 + 100 * L);
      holo[i + 2] = conduitByte(200 + 55 * L);
      holo[i + 3] = conduitByte(255 * a * (0.35 + 0.65 * L) * scan);
    }
    yield;
  }
}

/**
 * The conduit's layers for every plate (gold G1–G7), as an idle job with
 * the pixel jobs' contract (rexonance-unlit.js): step(until, idleDeadline)
 * → done; commit() → the result or null (idempotent; null when pixels
 * cannot be read); cancel() releases what was not published.
 * `pieces`: [{ x, y, w, h, ax, ay, layer }] in the order their figure-space
 * faces are laid (a later plate's pixel covers an earlier's). Result:
 * { face, holo?, walls? } atlas-space canvases the guide's size, `mask` the
 * figure-space visible gold (its alpha), `figFace` two figure-space faces
 * by `layer` (when `figureFace`: touch draws them through clips), and `vis`, one byte per
 * gold cell of `goldPlan`: 1 where the finished art shows gold in it.
 */
export function createAssemblyConduitJob({
  guide,
  gold,
  art,
  pieces,
  size,
  goldPlan = null,
  holo = true,
  walls = false,
  figureFace = false,
  document = globalThis.document,
}) {
  const owned = [];
  try {
    const AW = guide ? (guide.naturalWidth ?? guide.width) : NaN;
    const AH = guide ? (guide.naturalHeight ?? guide.height) : NaN;
    const { width: W, height: H } = size;
    if (!Number.isInteger(AW) || !Number.isInteger(AH) || AW <= 0 || AH <= 0 || !gold || !art)
      throw new Error("invalid conduit inputs");
    const make = (w, h) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      owned.push(canvas);
      return canvas;
    };
    let maxW = 1;
    let maxH = 1;
    let maxArea = 1;
    for (const piece of pieces) {
      maxW = Math.max(maxW, piece.w);
      maxH = Math.max(maxH, piece.h);
      maxArea = Math.max(maxArea, piece.w * piece.h);
    }
    const scratch = make(maxW, maxH);
    const uc = scratch.getContext("2d", { willReadFrequently: true });
    if (!uc) throw new Error("unavailable conduit context");
    const outFace = make(AW, AH);
    const outHolo = holo ? make(AW, AH) : null;
    const outWalls = walls ? make(AW, AH) : null;
    const outMask = make(W, H);
    const outFig = figureFace ? [make(W, H), make(W, H)] : null;
    const contexts = [outFace, outHolo, outWalls].map((canvas) => canvas?.getContext("2d") ?? null);
    if (!contexts[0]) throw new Error("unavailable conduit output");
    let maskImage = uc.createImageData(W, H);
    let figImages = outFig ? outFig.map(() => uc.createImageData(W, H)) : null;
    if (!maskImage?.data || (figImages && figImages.some((image) => !image?.data)))
      throw new Error("invalid conduit pixels");
    let m = new Float32Array(maxArea);
    let tn = new Float32Array(maxArea);
    let hm = new Float32Array(maxArea);
    let d = new Uint16Array(maxArea);
    let dc = new Uint16Array(maxArea);
    const vis = new Uint8Array(goldPlan?.count ?? 0);
    let k = 0;
    let rows = null;
    let piece = null;
    let images = null;
    let cell = 0;
    let cancelled = false;
    let result = null;
    const read = (source, sx, sy, w, h) => {
      uc.clearRect(0, 0, w, h);
      uc.drawImage(source, sx, sy, w, h, 0, 0, w, h);
      const data = uc.getImageData(0, 0, w, h)?.data;
      if (!data || data.length < w * h * 4) throw new Error("invalid conduit pixels");
      return data;
    };
    const release = () => {
      m = tn = hm = d = dc = null;
      maskImage = figImages = images = rows = null;
      for (const canvas of owned) canvas.width = canvas.height = 0;
    };
    const begin = () => {
      piece = pieces[k];
      const { x, y, w, h, ax, ay } = piece;
      images = [uc.createImageData(w, h), holo ? uc.createImageData(w, h) : null];
      images.push(walls ? uc.createImageData(w, h) : null);
      if (images.some((image, index) => (index === 0 || image) && !image?.data))
        throw new Error("invalid conduit pixels");
      rows = naniteConduitRows(
        { w, h, fx: x, fy: y },
        {
          guide: read(guide, ax, ay, w, h),
          gold: read(gold, ax, ay, w, h),
          art: read(art, x, y, w, h),
          m,
          tn,
          hm,
          d,
          dc,
          face: images[0].data,
          holo: images[1]?.data ?? null,
          walls: images[2]?.data ?? null,
          mask: maskImage.data,
          figFace: figImages ? figImages[piece.layer ? 1 : 0].data : null,
          W,
          H,
        },
      );
    };
    const finishPiece = () => {
      for (let index = 0; index < 3; index += 1)
        if (images[index] && contexts[index]) contexts[index].putImageData(images[index], piece.ax, piece.ay);
      rows = images = piece = null;
      k += 1;
    };
    // Each gold cell: shown when the art's visible gold covers ≥ 2 px of it.
    const cells = (until) => {
      const g = goldPlan;
      const data = maskImage.data;
      while (cell < vis.length) {
        const x0 = Math.max(0, Math.floor(g.x[cell]));
        const y0 = Math.max(0, Math.floor(g.y[cell]));
        const x1 = Math.min(W, Math.ceil(g.x[cell] + g.w[cell]));
        const y1 = Math.min(H, Math.ceil(g.y[cell] + g.h[cell]));
        let sum = 0;
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) sum += data[(y * W + x) * 4 + 3];
        vis[cell] = sum >= 2 * 255 ? 1 : 0;
        cell += 1;
        if ((cell & 255) === 0 && until()) return false;
      }
      return true;
    };
    return {
      step(until, idleDeadline) {
        if (cancelled || result) return true;
        const late = (margin = 0) =>
          (until !== Infinity && globalThis.performance.now() >= until - margin) ||
          (idleDeadline && idleDeadline.timeRemaining() < 2 + margin);
        try {
          let worked = false;
          while (k < pieces.length) {
            // A plate's reads (up to ~115k px) want 2.5 ms of the slice left.
            if (!rows) {
              if (worked && late(2.5)) return false;
              begin();
            }
            if (rows.next().done) finishPiece();
            worked = true;
            if (late()) return false;
          }
          return cells(() => late());
        } catch {
          cancelled = true;
          release();
          return true;
        }
      },
      commit() {
        if (result) return result;
        if (cancelled || k < pieces.length || cell < vis.length) return null;
        try {
          // (CPU-backed: the molten job reads it straight back.)
          const mc = outMask.getContext("2d", { willReadFrequently: true });
          if (!mc) throw new Error("unavailable conduit output");
          mc.putImageData(maskImage, 0, 0);
          if (outFig)
            outFig.forEach((canvas, index) => {
              const fc = canvas.getContext("2d");
              if (!fc) throw new Error("unavailable conduit output");
              fc.putImageData(figImages[index], 0, 0);
            });
          scratch.width = scratch.height = 0;
          m = tn = hm = d = dc = null;
          maskImage = figImages = null;
          result = { face: outFace, holo: outHolo, walls: outWalls, mask: outMask, figFace: outFig, vis };
          return result;
        } catch {
          cancelled = true;
          release();
          return null;
        }
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

/* ---------------- figure-space layers in bands (idle slices ≤ 6 ms) ----------------
   The raw nanite metal (armour A3) and the molten gold (G6/G7), with the
   formulas of createNaniteMetalJob and createNaniteMoltenJob
   (rexonance-unlit.js) and the same bytes, made a band of rows at a time:
   the source (and the mask) are first copied to the CPU, each in a slice
   of its own, then read a band at a time (a whole-figure read and its
   canvases in one slice cost 7–12 ms on a phone), so no slice of the
   preparation runs long. */
const LAYER_BAND = 16;
// The CPU copies are made a strip of rows a slice.
const LAYER_STRIP = 104;
const MOLTEN_RAMP = [0, 120, 52, 10, 0.4, 236, 140, 40, 0.7, 255, 210, 120, 1, 255, 250, 236];

/**
 * A figure-space layer job with the pixel jobs' contract (step(until,
 * idleDeadline) → done; commit() → result | null, idempotent; cancel()).
 * `kind` "metal" → { metal, silhouette? } (`silhouette`, `pitch`), "molten"
 * → { molten } (`mask`: its alpha scales the molten's). Bytes do not depend
 * on how the work is sliced.
 */
export function createAssemblyLayerJob({
  source,
  width: W,
  height: H,
  kind,
  silhouette = false,
  pitch = 4.6,
  mask = null,
  document = globalThis.document,
}) {
  const owned = [];
  try {
    if (!source || !Number.isInteger(W) || !Number.isInteger(H) || W <= 0 || H <= 0)
      throw new Error("invalid layer inputs");
    const make = (w, h) => {
      const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
      owned.push(canvas);
      return canvas;
    };
    const metal = kind === "metal";
    const names = metal ? (silhouette ? ["metal", "silhouette"] : ["metal"]) : ["molten"];
    const outputs = names.map(() => make(W, H));
    const contexts = outputs.map((canvas) => canvas.getContext("2d"));
    // The CPU copies of the source and the mask, made by the first steps.
    const copies = (mask ? [source, mask] : [source]).map(() => make(W, H));
    const copyContexts = copies.map((canvas) => canvas.getContext("2d", { willReadFrequently: true }));
    if (copyContexts.some((context) => !context) || contexts.some((context) => !context))
      throw new Error("unavailable layer context");
    let images = names.map(() => copyContexts[0].createImageData(W, LAYER_BAND));
    if (images.some((image) => !image?.data)) throw new Error("invalid layer pixels");
    let copied = 0;
    let copyTop = 0;
    let top = 0;
    let cancelled = false;
    let result = null;
    const release = () => {
      images = null;
      for (const canvas of owned) canvas.width = canvas.height = 0;
    };
    // Rows [y0, y0 + rows) of copy `index`, as RGBA bytes.
    const read = (index, y0, rows) => {
      const data = copyContexts[index].getImageData(0, y0, W, rows)?.data;
      if (!data || data.length < W * rows * 4) throw new Error("invalid layer pixels");
      return data;
    };
    const band = () => {
      const rows = Math.min(LAYER_BAND, H - top);
      // (One row of context either side for the metal's rim.)
      const above = metal && top > 0 ? 1 : 0;
      const below = metal && top + rows < H ? 1 : 0;
      const a = read(0, top - above, rows + above + below);
      const m = mask ? read(1, top, rows) : null;
      const out = images.map((image) => image.data);
      for (const data of out) data.fill(0);
      const stride = W * 4;
      for (let y = 0; y < rows; y += 1) {
        const Y = top + y;
        for (let x = 0, o = y * stride, i = (y + above) * stride; x < W; x += 1, o += 4, i += 4) {
          const alpha = a[i + 3];
          if (!alpha) continue;
          const L = (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) / 255;
          if (metal) {
            const hgt = naniteHexHeight(x + 0.5, Y + 0.5, pitch);
            const lit = naniteHexLight(x + 0.5, Y + 0.5, pitch);
            const right = x + 1 < W ? a[i + 7] : 0;
            const left = x > 0 ? a[i - 1] : 0;
            const down = Y + 1 < H ? a[i + stride + 3] : 0;
            const up = Y > 0 ? a[i - stride + 3] : 0;
            const rim = Math.max(-1, Math.min(1, ((-(right - left) - (down - up)) / 255) * 0.9));
            const v = (26 + 150 * L) * (0.74 + 0.26 * hgt) + 34 * lit + 70 * rim;
            const mt = out[0];
            mt[o] = conduitByte(v * 0.92);
            mt[o + 1] = conduitByte(v * 0.97 + 4 * hgt);
            mt[o + 2] = conduitByte(v * 1.06 + 10 * hgt);
            mt[o + 3] = alpha;
            if (out[1]) {
              const sh = out[1];
              sh[o] = 6;
              sh[o + 1] = 10;
              sh[o + 2] = 18;
              sh[o + 3] = alpha;
            }
          } else {
            const t = clamp01(0.25 + 0.85 * L);
            let k = 4;
            while (k < 12 && t > MOLTEN_RAMP[k]) k += 4;
            const u = (t - MOLTEN_RAMP[k - 4]) / (MOLTEN_RAMP[k] - MOLTEN_RAMP[k - 4]);
            const mo = out[0];
            for (let c = 1; c < 4; c += 1)
              mo[o + c - 1] = conduitByte(MOLTEN_RAMP[k - 4 + c] + (MOLTEN_RAMP[k + c] - MOLTEN_RAMP[k - 4 + c]) * u);
            mo[o + 3] = m ? conduitByte((alpha * m[o + 3]) / 255) : alpha;
          }
        }
      }
      images.forEach((image, index) => contexts[index].putImageData(image, 0, top, 0, 0, W, rows));
      top += rows;
    };
    return {
      step(until, idleDeadline) {
        if (cancelled || result || top >= H) return true;
        try {
          if (copied < copies.length) {
            // The copies, a strip a slice.
            const rows = Math.min(LAYER_STRIP, H - copyTop);
            copyContexts[copied].drawImage(copied ? mask : source, 0, copyTop, W, rows, 0, copyTop, W, rows);
            copyTop += rows;
            if (copyTop >= H) {
              copied += 1;
              copyTop = 0;
            }
            return false;
          }
          do band();
          while (
            top < H &&
            (until === Infinity || globalThis.performance.now() < until) &&
            (!idleDeadline || idleDeadline.timeRemaining() >= 2)
          );
          return top >= H;
        } catch {
          cancelled = true;
          release();
          return true;
        }
      },
      commit() {
        if (result) return result;
        if (cancelled || top < H) return null;
        for (const canvas of copies) canvas.width = canvas.height = 0;
        images = null;
        result = {};
        names.forEach((name, index) => (result[name] = outputs[index]));
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

// The kit's sheet geometry (REXONANCE_NANITES), used when a config omits it.
const KIT = {
  cells: {
    cell: 32,
    mip: { x: [0, 384, 0, 384], y: [128, 128, 144, 144] },
    unfold: { y: 160, x: [0, 224, 448] },
    bokeh: { x: [672, 704, 736, 256], y: [160, 160, 160, 192] },
    bead: { x: 0, y: 192 },
    spark: { x: 288, y: 192 },
  },
  comets: { rows: { ice: 0, pink: 2, gold: 4 }, tail: [8, 15] },
  fx: {
    clamp: {
      x: 0,
      y: 0,
      cell: 48,
      anchor: { tl: [12, 12], tr: [36, 12], bl: [12, 36], br: [36, 36] },
    },
    latch: { x: 0, y: 192, cell: 48 },
    scan: { x: 576, y: 0, w: 256, h: 64, edgeY: 32 },
    drop: { x: 576, y: 64, cell: 24 },
    shock: { x: 0, y: 240, w: 192, h: 72, cols: 5, centre: [96, 36] },
  },
};

const goldCountOf = (gold) => gold?.count ?? 0;
const TONE_CSS = ["rgb(121 232 255)", "rgb(255 143 216)", "rgb(244 251 255)"];
const SHADE_CSS = ["rgb(22 58 74)", "rgb(74 34 62)", "rgb(58 64 76)"];
// Touch's hex chips: the desktop sprites' pastel tones, their shade, and the
// lit core (review, 2026-10-16: never flat saturated squares on a phone).
const TOUCH_TONE_CSS = ["rgb(176 238 255)", "rgb(255 192 232)", "rgb(244 251 255)"];
const TOUCH_SHADE_CSS = ["rgb(34 70 90)", "rgb(90 46 78)", "rgb(62 68 82)"];
// A hexagon's six corners at 24 turns through its 60° symmetry: the chip
// spins with its tumble frame.
const HEX_TURNS = (() => {
  const table = new Float32Array(24 * 12);
  for (let f = 0; f < 24; f += 1)
    for (let k = 0; k < 6; k += 1) {
      const angle = (Math.PI / 3) * (k + f / 24);
      table[f * 12 + k * 2] = Math.cos(angle);
      table[f * 12 + k * 2 + 1] = Math.sin(angle);
    }
  return table;
})();

/**
 * The swarm's renderer for one prepared scene. `frame(q, dq, calm, scale,
 * backRects)` poses every chip and plate for the displayed progress q (dq
 * the last step, for the comets; scale the device px per figure px); the
 * passes then draw in the scene's order, on a context whose transform is
 * the view (`view(scale, x, y)` in device px).
 */
export function createAssemblyNanites({
  nano,
  size,
  core,
  visor,
  coarse = false,
  sprites = null,
  kit = null,
  layers = {},
  gold = null,
  goldCell = 4,
  touchArtBudget = 64,
}) {
  const N = ASSEMBLY_NANITES;
  const { width: W, height: H } = size;
  const n = nano.count;
  const P = nano.pieces;
  const NP = P.length;
  const free = nano.free;
  const F = free.count;
  const total = n + F;
  const SC = total;
  const rings = nano.rings;
  const [coreX, coreY] = core;
  const [visorX, visorY] = visor ?? [W / 2, H * 0.14];
  const cells = sprites?.cells ?? null;
  const cometSheet = coarse ? null : (sprites?.comets ?? null);
  const fxSheet = sprites?.fx ?? null;
  const k = {
    cells: kit?.cells ?? KIT.cells,
    comets: kit?.comets ?? KIT.comets,
    fx: kit?.fx ?? KIT.fx,
  };
  const MIPX = Float64Array.from(k.cells.mip.x);
  const MIPY = Float64Array.from(k.cells.mip.y);
  const UNX = Float64Array.from(k.cells.unfold.x);
  const UNY = k.cells.unfold.y;
  const BKX = Float64Array.from(k.cells.bokeh.x);
  const BKY = Float64Array.from(k.cells.bokeh.y);
  const BEADX = k.cells.bead.x;
  const BEADY = k.cells.bead.y;
  const SPX = k.cells.spark.x;
  const SPY = k.cells.spark.y;
  const COMET_ROW = Float64Array.from([
    k.comets.rows.ice,
    k.comets.rows.pink,
    k.comets.rows.ice,
    k.comets.rows.gold,
  ]);
  const TAIL0 = k.comets.tail[0];
  const TAIL1 = k.comets.tail[1];
  const CL = k.fx.clamp;
  const CLAX = Float64Array.from([
    CL.anchor.tl[0],
    CL.anchor.tr[0],
    CL.anchor.bl[0],
    CL.anchor.br[0],
  ]);
  const CLAY = Float64Array.from([
    CL.anchor.tl[1],
    CL.anchor.tr[1],
    CL.anchor.bl[1],
    CL.anchor.br[1],
  ]);
  const LT = k.fx.latch;
  const DRP = k.fx.drop;
  const SHK = k.fx.shock;
  const metal = layers.metal ?? [null, null];
  const silhouette = layers.silhouette ?? [null, null];
  const art = layers.art ?? [null, null];
  const holo = layers.holo ?? null;
  const walls = layers.walls ?? null;
  const face = layers.face ?? null;
  // Touch: the conduits' faces laid in the figure (armour, ornaments).
  const figFace = layers.figFace ?? null;
  // One byte per gold cell: 1 where the finished art shows gold in it.
  const VIS = layers.goldVisible ?? null;
  const frameSheet = layers.frame ?? null;
  const frameDeep = layers.frameDeep ?? null;
  const molten = layers.molten ?? null;
  const goldArt = layers.goldArt ?? null;
  const lattice = layers.lattice ?? null;
  const metalOf = (src) => metal[src] || art[src];
  const s0 = 10;
  const T0 = nano.T0;
  const T1 = nano.T1;
  const M = nano.M;
  const CX = nano.CX;
  const CY = nano.CY;
  const SX = nano.SX;
  const SY = nano.SY;
  const TW = nano.TW;
  const TH = nano.TH;
  const SRC = nano.SRC;
  const TONE = nano.TONE;
  const COV = nano.COV;
  const PO = nano.pieceOf;
  const RING = nano.ring;
  const LANE = nano.lane;
  const TH0 = nano.th0;
  const PHI = nano.phi;
  const F0 = nano.f0;
  const SPIN = nano.spin;
  const R0 = nano.r0;
  const PSI0 = nano.psi0;
  const BIRTHS = nano.birth;
  const ARM = nano.arm;
  const ARMDIR = nano.armDir;
  const GATEJ = nano.gateJ;
  const HELMD = nano.helmD;
  const HSH = nano.hsh;
  const TP = nano.tp;
  const PARENT = nano.parent;
  const ORDER = nano.paintOrder;
  const PAINT = nano.paintAt;
  const SEAT_LAG = nano.seatLag ?? 0.0125;
  const GIDX = nano.goldIdx;
  const GHASH = nano.goldHash;
  const BB = nano.buildB ?? new Float32Array(goldCountOf(gold));
  const BAT = nano.buildAt ?? new Float64Array(0);
  const BIDX = nano.buildIdx ?? new Int32Array(0);
  const RCY = rings.cy;
  const RRX = rings.rx;
  const RRY = rings.ry;
  const RCOS = rings.cos;
  const RSIN = rings.sin;
  const RDIR = rings.dir;
  const ROM = rings.omega;
  const SEAMX = nano.seams.x;
  const SEAMY = nano.seams.y;
  const SEAMC = nano.seams.cum;
  const LSTART = nano.seams.start;
  const LCOUNT = nano.seams.count;
  const LPER = nano.seams.perimeter;

  // Per-frame pose buffers (slot `total` is the comets' scratch pose).
  const X = new Float32Array(total + 1);
  const Y = new Float32Array(total + 1);
  const S = new Float32Array(total + 1);
  const A = new Float32Array(total + 1);
  const Z = new Float32Array(total + 1);
  const FR = new Float32Array(total + 1);
  const U = new Float32Array(total + 1);
  const KIND = new Uint8Array(total + 1);
  const TN = new Uint8Array(total + 1);
  const UF = new Int8Array(total + 1);
  // Per slot: the glint its lit face throws as it banks into the key light
  // (0–1), and its velocity tracer's tail (NaN: none).
  const GL = new Float32Array(total + 1);
  const TRX = new Float32Array(total + 1);
  const TRY = new Float32Array(total + 1);
  // The plates seating now: seat x, y, age 0–1, strength.
  const RIP = new Float64Array(RIPPLE_MAX * 4);
  let ripN = 0;
  const backList = new Int32Array(total);
  const midList = new Int32Array(total);
  const frontList = new Int32Array(total);
  const flightList = new Int32Array(n);
  const implodeList = new Int32Array(F);
  let nBack = 0;
  let nMid = 0;
  let nFront = 0;
  let nFlight = 0;
  let nImplode = 0;
  const jig = new Float64Array(NP * 6);
  // Which staged plates move under a jig, decided once: in the order they
  // start, a plate is jigged when fewer than the cap are jigged over its
  // start; it keeps that for its whole stage. (A count taken frame by frame
  // promoted a waiting plate, seated until then, to its offset pose the
  // moment another finished — a jump on touch.)
  const JIGGED = new Uint8Array(NP);
  {
    const cap = coarse ? STAGED_TOUCH : STAGED_MAX;
    const byFrom = [];
    for (let p = 0; p < NP; p += 1) if (!P[p].fixed) byFrom.push(p);
    byFrom.sort((a, b) => P[a].from - P[b].from || a - b);
    for (let k = 0; k < byFrom.length; k += 1) {
      const p = byFrom[k];
      const start = P[p].from;
      let open = 0;
      for (let kk = 0; kk < k; kk += 1) {
        const o = byFrom[kk];
        if (JIGGED[o] && P[o].stageEnd > start) open += 1;
      }
      if (open < cap) JIGGED[p] = 1;
    }
  }
  const LAM = new Float64Array(NP);
  const STAGED = new Uint8Array(NP);
  const laneCount = new Uint16Array(NP);
  const beamI = new Int32Array(NP * 2);
  const heldList = new Int32Array(NP);
  const beamU = new Float32Array(NP * 2);
  const topI = new Int32Array(TOUCH_CHIPS);
  const topU = new Float32Array(TOUCH_CHIPS);
  const topChip = new Uint8Array(total + 1);
  // Batched rects: chips (3 tones × dim/bright), and one general batch.
  const RECT_CAP = total + 64;
  const chipRects = new Float32Array(6 * RECT_CAP * 4);
  const chipCounts = new Int32Array(6);
  const goldCount = gold?.count ?? 0;
  const batchCap = Math.max(4096, n + goldCount + 1024);
  const batch = new Float32Array(batchCap * 4);
  let batchN = 0;
  const links = new Float32Array(3 * n * 4);
  const linkCounts = new Int32Array(3);
  // The guideway's build heads, glows, sparks and latch beams.
  const HEAD_CAP = 4096;
  const headRects = new Float32Array(HEAD_CAP * 4);
  const glowRects = new Float32Array(HEAD_CAP * 4);
  const emberRects = new Float32Array(HEAD_CAP * 4);
  const beams = new Float32Array(NP * 4 + 4);
  let headN = 0;
  let glowN = 0;
  let emberN = 0;
  let beamN = 0;

  let Q = 0;
  let DQ = 0;
  let CALM = false;
  let SCALE = 1;
  let BACKRECTS = false;
  let VS = 1;
  let VX = 0;
  let VY = 0;
  let keep = 1;
  let sprites_ = 0;
  let cometsDrawn = 0;
  // Each pass's share of the comet budget: the far band (behind the body)
  // takes little, the near bands and the flights the rest.
  let cometLimit = 0;
  let heroes = 0;
  let conduitDraws = 0;
  let nanitesDrawn = 0;
  const state = {
    shakeX: 0,
    shakeY: 0,
    sprites: 0,
    heroes: 0,
    nanites: 0,
    comets: 0,
  };

  // Ring geometry scratch: one typed slot, written per chip (a double in a
  // closure \`let\` is boxed into a fresh heap number on every write, which
  // is a per-frame allocation — the review's finding on the call, 2026-10-16;
  // no per-frame allocation, owner 2026-10-16).
  const RG = new Float64Array(5);

  /* -- draw passes: allocation-free from here -- */
  const ringPoint = (r, theta, ln, ph, tangent) => {
    const kk = 1 + 0.045 * ln;
    const R = RRX[r] * kk;
    const Ry = RRY[r] * kk;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const lx = R * c;
    const ly = Ry * s + 3 * Math.sin(5 * theta + ph);
    const tc = RCOS[r];
    const ts = RSIN[r];
    RG[0] = W / 2 + lx * tc - ly * ts;
    RG[1] = RCY[r] + 4 * ln + lx * ts + ly * tc;
    RG[2] = s;
    if (tangent) {
      const dir = RDIR[r];
      const dlx = -R * s * dir;
      const dly = (Ry * c + 15 * Math.cos(5 * theta + ph)) * dir;
      const tx = dlx * tc - dly * ts;
      const ty = dlx * ts + dly * tc;
      const len = Math.hypot(tx, ty) || 1;
      RG[3] = tx / len;
      RG[4] = ty / len;
    }
  };
  // N13, traffic in the cocoon: each ring carries three density packets
  // travelling at half its chips' speed, so the chips bunch and stream
  // through them rather than turning like a rigid wheel, and each weaves
  // across its ring's lanes as it goes round. A function of the chip's angle
  // and q (the river leaves from exactly this pose).
  const orbit = (r, theta, ln, ph, tangent, q) => {
    const th = theta + 0.2333 * Math.sin(3 * theta - 1.5 * ROM[r] * q + 1.7 * r);
    ringPoint(r, th, ln + 0.9 * Math.sin(2 * th + ph), ph, tangent);
  };
  // The birth spiral (N2): out of the core along one of three arms; s 0–1.
  // Every chip of a wave shares the arms' curve (radius and angle are
  // functions of s alone), so a pump reads as three spiral arms; in its last
  // 40% each chip swings onto its own ring pose.
  const spiral = (s, armK, dir, tx, ty) => {
    const angle = (TAU * armK) / 3 + dir * 3 * Math.PI * (1 - s);
    const rho = 210 * s ** 0.9;
    const ax = coreX + rho * Math.cos(angle);
    const ay = coreY + rho * Math.sin(angle) * 0.8;
    const e = smooth(clamp01((s - 0.6) / 0.4));
    RG[0] = ax + (tx - ax) * e;
    RG[1] = ay + (ty - ay) * e;
  };
  const jigX = (p, x, y) => jig[p * 6] * x + jig[p * 6 + 2] * y + jig[p * 6 + 4];
  const jigY = (p, x, y) => jig[p * 6 + 1] * x + jig[p * 6 + 3] * y + jig[p * 6 + 5];

  const poseTile = (i, q, slot) => {
    const b = BIRTHS[i];
    const t0 = T0[i];
    const t1 = T1[i];
    if (q < b || q >= t1) {
      KIND[slot] = 0;
      return;
    }
    const p = PO[i];
    const r = RING[i];
    const m = M[i];
    const rate = 2400 * SPIN[i];
    let fr = F0[i] + rate * (q - m);
    TN[slot] = TONE[i];
    UF[slot] = -1;
    GL[slot] = 0;
    TRX[slot] = NaN;
    const helm = p >= 0 && P[p].helm;
    if (q < t0) {
      orbit(r, TH0[i] + ROM[r] * (q - m), LANE[i], PHI[i], false, q);
      let x = RG[0];
      let y = RG[1];
      let z = RG[2];
      let kind = 2;
      if (helm && q >= N.crown[0]) {
        const beta = smooth(clamp01((q - N.crown[0]) / (N.crown[1] - N.crown[0])));
        const ang = TH0[i] + (3 * Math.PI * (q - N.crown[0])) / 0.05;
        const rc = 60 + 30 * HELMD[i];
        x += (visorX + rc * Math.cos(ang) - x) * beta;
        y += (visorY - CROWN_LIFT + 0.35 * rc * Math.sin(ang) - y) * beta;
        z += (Math.sin(ang) - z) * beta;
        kind = 3;
      }
      let size = s0 * (1 + 0.45 * z);
      const s = (q - b) / BIRTH;
      if (s < 1) {
        spiral(s, ARM[i], ARMDIR[i], x, y);
        x = RG[0];
        y = RG[1];
        size *= 0.6 + 0.4 * s;
        if (s < 0.5) TN[slot] = 2;
        kind = 1;
      }
      X[slot] = x;
      Y[slot] = y;
      Z[slot] = z;
      S[slot] = size;
      A[slot] = 0.45 + 0.25 * (z + 1);
      FR[slot] = fr;
      U[slot] = -1;
      KIND[slot] = kind;
      return;
    }
    const span = t1 - t0;
    const u = (q - t0) / span;
    U[slot] = u;
    const nx = p >= 0 ? P[p].nx : 0;
    const ny = p >= 0 ? P[p].ny : -1;
    const qx = -ny;
    const qy = nx;
    const cx = p >= 0 ? jigX(p, CX[i], CY[i]) : CX[i];
    const cy = p >= 0 ? jigY(p, CX[i], CY[i]) : CY[i];
    const hx = cx + nx * 10;
    const hy = cy + ny * 10;
    const tile = Math.max(TW[i], TH[i]);
    let x;
    let y;
    let size = s0;
    let alpha = 0.95;
    let kind;
    const dive = helm ? 0.7 : 0.8;
    if (helm && u < dive) {
      // The helmet skips the lanes: from the crown it spirals inward.
      const ang = TH0[i] + (3 * Math.PI * (t0 - N.crown[0])) / 0.05;
      const rc = 60 + 30 * HELMD[i];
      const px0 = visorX + rc * Math.cos(ang) - hx;
      const py0 = visorY - CROWN_LIFT + 0.35 * rc * Math.sin(ang) - hy;
      const w = u / dive;
      const turn = RDIR[0] * 1.5 * Math.PI * w;
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const shrink = (1 - w) ** 1.3;
      x = hx + (px0 * c - py0 * s) * shrink;
      y = hy + (px0 * s + py0 * c) * shrink;
      size = s0 * (1 + 0.3 * Math.sin(Math.PI * w));
      fr += rate * 1.5 * (q - t0);
      kind = 5;
    } else if (u < 0.55) {
      // The river: from its ring pose at t0, out along the ring, through the
      // plate's gate, onto its orbit.
      fr += rate * 2 * (q - t0);
      orbit(r, TH0[i] + ROM[r] * (t0 - m), LANE[i], PHI[i], true, t0);
      const p0x = RG[0];
      const p0y = RG[1];
      const z0 = RG[2];
      const p1x = p0x + RG[3] * 0.12 * H;
      const p1y = p0y + RG[4] * 0.12 * H;
      const p2x = (p >= 0 ? P[p].gateX : hx + nx * 0.1 * H) + qx * GATEJ[i];
      const p2y = (p >= 0 ? P[p].gateY : hy + ny * 0.1 * H) + qy * GATEJ[i];
      const p3x = hx + R0[i] * (Math.cos(PSI0[i]) * qx + 0.45 * Math.sin(PSI0[i]) * nx);
      const p3y = hy + R0[i] * (Math.cos(PSI0[i]) * qy + 0.45 * Math.sin(PSI0[i]) * ny);
      const v = smooth(u / 0.55);
      const a = (1 - v) * (1 - v) * (1 - v);
      const bb = 3 * (1 - v) * (1 - v) * v;
      const c = 3 * (1 - v) * v * v;
      const d = v * v * v;
      x = a * p0x + bb * p1x + c * p2x + d * p3x;
      y = a * p0y + bb * p1y + c * p2y + d * p3y;
      // Its heading (the curve's derivative): the tracer behind it and, as
      // it banks into the key light, its lit face's glint (N15, N16).
      const d0 = 3 * (1 - v) * (1 - v);
      const d1 = 6 * (1 - v) * v;
      const d2 = 3 * v * v;
      const vx = d0 * (p1x - p0x) + d1 * (p2x - p1x) + d2 * (p3x - p2x);
      const vy = d0 * (p1y - p0y) + d1 * (p2y - p1y) + d2 * (p3y - p2y);
      const speed = Math.hypot(vx, vy);
      if (speed > 1) {
        const k = 0.026 * Math.sin(Math.PI * v);
        TRX[slot] = x - vx * k;
        TRY[slot] = y - vy * k;
        const dot = (vx * LIGHT_X + vy * LIGHT_Y) / speed;
        if (dot > 0.93) GL[slot] = ((dot - 0.93) / 0.07) * Math.sin(Math.PI * v);
      }
      if (p >= 0 && P[p].kind === 2) {
        const wave = 6 * Math.sin(y / 40 - 60 * q) * Math.sin(Math.PI * v);
        x += qx * wave;
        y += qy * wave;
      }
      const ring0 = s0 * (1 + 0.45 * z0);
      size = ring0 + (s0 * 1.1 - ring0) * v;
      alpha = 0.45 + 0.25 * (z0 + 1) + (0.95 - 0.45 - 0.25 * (z0 + 1)) * v;
      kind = 4;
    } else if (u < dive) {
      // The aim: it circles the hover point, closing in.
      fr += rate * (2 * 0.55 * span + 0.5 * (q - t0 - 0.55 * span));
      const w = (u - 0.55) / (dive - 0.55);
      const psi = PSI0[i] + 1.5 * Math.PI * w;
      const rr = R0[i] * (1 - w) ** 1.5;
      x = hx + rr * (Math.cos(psi) * qx + 0.45 * Math.sin(psi) * nx);
      y = hy + rr * (Math.cos(psi) * qy + 0.45 * Math.sin(psi) * ny);
      size = s0 * (1 + 0.25 * Math.sin(psi));
      // N15: banking round the hover point, its lit face catches the key
      // light once a turn — a glint, and the face-on frame.
      const hdx = -Math.sin(psi) * qx + 0.45 * Math.cos(psi) * nx;
      const hdy = -Math.sin(psi) * qy + 0.45 * Math.cos(psi) * ny;
      const hl = Math.hypot(hdx, hdy) || 1;
      const dot = (hdx * LIGHT_X + hdy * LIGHT_Y) / hl;
      if (dot > 0.9 && rr > 2) {
        const g = (dot - 0.9) / 0.1;
        GL[slot] = g;
        fr *= 1 - g;
      }
      kind = 5;
    } else {
      // The dive: speed peaks at contact; it turns face-on and unfolds.
      fr += helm ? rate * 1.5 * dive * span : rate * (2 * 0.55 * span + 0.5 * 0.25 * span);
      const w = (u - dive) / (1 - dive);
      // N14, leaders and followers: a plate's first tiles dive at once; the
      // rest hesitate at the hover point — backing off a breath along the
      // plate's normal, sniffing sideways — then dart in, faster, to land at
      // the same moment. (Rank: when the tile lands within its plate's
      // flights; the hesitation grows with it, per-chip varied.)
      let hes = 0;
      if (!helm && p >= 0) {
        const pc = P[p];
        const rank = (t1 - pc.from) / Math.max(1e-6, pc.to - pc.from);
        hes = (0.12 + 0.16 * HSH[i]) * smooth(clamp01((rank - 0.12) / 0.3));
      }
      if (w < hes) {
        const sn = w / hes;
        const bob = Math.sin(Math.PI * sn);
        const sniff = 2.5 * Math.sin(TAU * (sn + HSH[i])) * bob;
        x = hx + nx * 6 * bob + qx * sniff;
        y = hy + ny * 6 * bob + qy * sniff;
      } else {
        const wd = hes > 0 ? (w - hes) / (1 - hes) : w;
        const e = hes > 0 ? wd * wd * wd : wd * wd * wd * wd;
        x = hx + (cx - hx) * e;
        y = hy + (cy - hy) * e;
        // N16: its tracer, as long as it is fast.
        const wb = wd > 0.1 ? wd - 0.1 : 0;
        const eb = hes > 0 ? wb * wb * wb : wb * wb * wb * wb;
        const tx = hx + (cx - hx) * eb;
        const ty = hy + (cy - hy) * eb;
        if (Math.abs(x - tx) + Math.abs(y - ty) > 2) {
          TRX[slot] = tx;
          TRY[slot] = ty;
        }
      }
      let f = fr % 24;
      if (f < 0) f += 24;
      if (f > 12) f -= 24;
      fr = f * (1 - w) * (1 - w);
      if (u >= 0.86) {
        const g = (u - 0.86) / 0.14;
        UF[slot] = Math.min(6, Math.floor(g * 7));
        size = s0 + (tile * (0.6 + 0.4 * COV[i]) - s0) * g;
        alpha = 0.95 * (1 - g);
      }
      kind = 6;
    }
    X[slot] = x;
    Y[slot] = y;
    Z[slot] = 1;
    S[slot] = size;
    A[slot] = alpha;
    FR[slot] = fr;
    KIND[slot] = kind;
  };

  const poseFree = (j, q, slot) => {
    const b = free.birth[j];
    if (q < b || q >= N.implode[1]) {
      KIND[slot] = 0;
      return;
    }
    const r = free.ring[j];
    orbit(r, free.th0[j] + ROM[r] * (q - b), free.lane[j], free.phi[j], false, q);
    let x = RG[0];
    let y = RG[1];
    const z = RG[2];
    let size = s0 * (1 + 0.45 * z);
    let alpha = 0.45 + 0.25 * (z + 1);
    TN[slot] = free.tone[j];
    UF[slot] = -1;
    GL[slot] = 0;
    TRX[slot] = NaN;
    let kind = 7;
    const s = (q - b) / BIRTH;
    if (s < 1) {
      spiral(s, free.arm[j], free.armDir[j], x, y);
      x = RG[0];
      y = RG[1];
      size *= 0.6 + 0.4 * s;
      if (s < 0.5) TN[slot] = 2;
    }
    if (q >= N.implode[0]) {
      // The seal (N12): each ring spins up and collapses onto the reactor,
      // its chips spiralling in along their own shrinking ellipses (rotating
      // the whole cocoon about the core would sweep its tall rings off the
      // figure).
      const u = (q - N.implode[0]) / (N.implode[1] - N.implode[0]);
      orbit(
        r,
        free.th0[j] + ROM[r] * (q - b) + RDIR[r] * 3 * Math.PI * u * u,
        free.lane[j],
        free.phi[j],
        false,
        q,
      );
      const k = 1 - smooth(u);
      x = coreX + (RG[0] - coreX) * k;
      y = coreY + (RG[1] - coreY) * k;
      size *= 1 - 0.4 * u;
      alpha *= 1 - u * u;
      kind = 8;
    }
    X[slot] = x;
    Y[slot] = y;
    Z[slot] = z;
    S[slot] = size;
    A[slot] = alpha;
    FR[slot] = free.f0[j] + 2400 * free.spin[j] * (q - b);
    U[slot] = -1;
    KIND[slot] = kind;
  };

  // N17, the seating ripple: a plate that seats sends a ring wave out
  // through the cocoon from its seat — the chips at the wavefront are pushed
  // outward, brighten and swell, then fall back into their lanes.
  const ripple = (slot) => {
    for (let k = 0; k < ripN; k += 1) {
      const o = k * 4;
      const dx = X[slot] - RIP[o];
      const dy = Y[slot] - RIP[o + 1];
      const d = Math.hypot(dx, dy) || 1;
      const t = RIP[o + 2];
      const g = (d - 24 - 300 * t) / 30;
      if (g > 3 || g < -3) continue;
      const w = Math.exp(-g * g) * (1 - t) * (1 - t) * RIP[o + 3];
      X[slot] += (dx / d) * 12 * w;
      Y[slot] += (dy / d) * 12 * w;
      const a = A[slot] * (1 + 0.9 * w);
      A[slot] = a > 1 ? 1 : a;
      S[slot] *= 1 + 0.3 * w;
    }
  };

  // The tiles of plate p landed by q (its tiles sorted by landing).
  const landedIn = (p, q) => {
    const t1s = P[p].t1s;
    let low = 0;
    let high = t1s.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (t1s[mid] <= q) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const paintedBy = (q) => {
    let low = 0;
    let high = n;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (PAINT[mid] <= q) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const landedBy = (q) => {
    let low = 0;
    let high = n;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (T1[mid] <= q) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  const goldBy = (q) => {
    if (!gold) return 0;
    const lock = gold.lock;
    let low = 0;
    let high = gold.count;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (lock[mid] <= q) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  // A plate's gold cells locking after `q` (its list is sorted by lock).
  const goldAfter = (p, q) => {
    const lock = gold.lock;
    let low = P[p].goldFirst;
    let high = P[p].goldEnd;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (lock[GIDX[mid]] <= q) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  // The stage (A3): plate p's affine jig M at q, and its lift λ.
  const jigFor = (p, q, allowed) => {
    const pc = P[p];
    const j = p * 6;
    let lam = 0;
    let turn = 0;
    let skew = 0;
    const staged = !pc.fixed && q >= pc.from - N.lead && q < pc.stageEnd;
    // From contact on the plate is exactly at its seat — no overshoot, no
    // flutter — so the gold that forms on it (from contact + .003), the
    // paint and the conduit all lie where the plate is (owner, 2026-10-16:
    // nothing shifts when a part completes).
    if (staged && q < pc.contact) {
      if (q < pc.from) lam = 1;
      else if (q < pc.to) lam = 1 - (0.35 * landedIn(p, q)) / pc.t1s.length;
      else {
        const u = (q - pc.to) / (pc.contact - pc.to);
        lam = 0.65 * (1 - u * u * u);
      }
      if (pc.kind === 1) turn = -(10 + 4 * pc.seg) * DEG * lam;
      if (pc.kind === 2) skew = -0.1 * lam;
    }
    STAGED[p] = staged ? (allowed ? 1 : 2) : 0;
    LAM[p] = staged ? lam : 0;
    if (!staged || !allowed || (lam === 0 && turn === 0 && skew === 0)) {
      jig[j] = 1;
      jig[j + 1] = 0;
      jig[j + 2] = 0;
      jig[j + 3] = 1;
      jig[j + 4] = 0;
      jig[j + 5] = 0;
      return;
    }
    const ang = pc.theta * lam;
    const cf = Math.cos(ang) - 1;
    const sk = (coarse ? 0 : 0.08) * Math.sin(ang);
    const gx = pc.gx;
    const gy = pc.gy;
    const hx = -gy;
    const hy = gx;
    const f00 = 1 + cf * gx * gx + sk * hx * gx;
    const f01 = cf * gx * gy + sk * hx * gy;
    const f10 = cf * gy * gx + sk * hy * gx;
    const f11 = 1 + cf * gy * gy + sk * hy * gy;
    const cr = Math.cos(turn);
    const sr = Math.sin(turn);
    let a00 = cr * f00 - sr * f10;
    let a01 = cr * f01 - sr * f11;
    const a10 = sr * f00 + cr * f10;
    const a11 = sr * f01 + cr * f11;
    a00 += skew * a10;
    a01 += skew * a11;
    const sc = 1 + 0.04 * lam;
    const ox = pc.offX * lam;
    const oy = pc.offY * lam;
    jig[j] = a00 * sc;
    jig[j + 1] = a10 * sc;
    jig[j + 2] = a01 * sc;
    jig[j + 3] = a11 * sc;
    jig[j + 4] = pc.seatX + ox - (jig[j] * pc.seatX + jig[j + 2] * pc.seatY);
    jig[j + 5] = pc.seatY + oy - (jig[j + 1] * pc.seatX + jig[j + 3] * pc.seatY);
  };

  const pushRect = (buffer, at, x, y, w, h) => {
    buffer[at] = x;
    buffer[at + 1] = y;
    buffer[at + 2] = w;
    buffer[at + 3] = h;
  };
  const fillBatch = (ctx, buffer, count, style, alpha) => {
    if (!count) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = style;
    ctx.beginPath();
    for (let i = 0; i < count; i += 4)
      ctx.rect(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]);
    ctx.fill();
  };
  // A chip without its sprite, batched (touch, fallbacks, decimation): on
  // touch a spinning two-tone hexagon in the desktop's pastel tones, mixed
  // per chip, with a lit core; elsewhere two-tone rects. Its size pulses
  // with the tumble either way.
  const rectChip = (slot, bright, speck = false) => {
    let f = FR[slot] % 24;
    if (f < 0) f += 24;
    let size = S[slot] * (speck ? 0.32 : 1) * (0.55 + 0.45 * Math.abs(Math.cos((TAU * f) / 24)));
    let t = TN[slot] > 2 ? 0 : TN[slot];
    if (coarse) {
      if (size > 12) size = 12;
      if (t !== 2 && slot < total) {
        const hash = slot >= n ? free.hsh[slot - n] : HSH[slot];
        t = (hash * 7.13) % 1 < 0.5 ? 0 : 1;
      }
    }
    const b = t * 2 + (bright ? 1 : 0);
    const at = chipCounts[b];
    if (at >= RECT_CAP * 4) return;
    const base = b * RECT_CAP * 4 + at;
    chipRects[base] = X[slot];
    chipRects[base + 1] = Y[slot];
    // (A hexagon of about the sprite chip's own footprint, ~3/4 of its cell.)
    chipRects[base + 2] = coarse ? size * 0.38 : size / 2;
    chipRects[base + 3] = Math.floor(f) % 24;
    chipCounts[b] = at + 4;
  };
  const chipPath = (ctx, base, count, offset) => {
    ctx.beginPath();
    for (let i = base; i < base + count; i += 4) {
      const cx = chipRects[i] + offset;
      const cy = chipRects[i + 1] + offset;
      const r = chipRects[i + 2];
      if (!coarse) {
        ctx.rect(cx - r, cy - r, 2 * r, 2 * r);
        continue;
      }
      const turn = chipRects[i + 3] * 12;
      ctx.moveTo(cx + r * HEX_TURNS[turn], cy + r * HEX_TURNS[turn + 1]);
      for (let k = 2; k < 12; k += 2) ctx.lineTo(cx + r * HEX_TURNS[turn + k], cy + r * HEX_TURNS[turn + k + 1]);
      ctx.closePath();
    }
  };
  const flushChips = (ctx) => {
    for (let b = 0; b < 6; b += 1) {
      const count = chipCounts[b];
      if (!count) continue;
      const base = b * RECT_CAP * 4;
      const t = b >> 1;
      ctx.globalAlpha = b & 1 ? 0.75 : 0.42;
      ctx.fillStyle = coarse ? TOUCH_SHADE_CSS[t] : SHADE_CSS[t];
      chipPath(ctx, base, count, 0.9);
      ctx.fill();
      if (coarse) ctx.globalAlpha = b & 1 ? 0.66 : 0.36;
      ctx.fillStyle = coarse ? TOUCH_TONE_CSS[t] : TONE_CSS[t];
      chipPath(ctx, base, count, 0);
      ctx.fill();
      if (coarse && b & 1) {
        // The lit core of each near chip.
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgb(246 253 255)";
        ctx.beginPath();
        for (let i = base; i < base + count; i += 4)
          if (chipRects[i + 2] > 1.4) ctx.rect(chipRects[i] - 0.7, chipRects[i + 1] - 0.7, 1.4, 1.4);
        ctx.fill();
      }
      chipCounts[b] = 0;
    }
    ctx.globalAlpha = 1;
  };
  // A chip as its Blender sprite: the tumble frame (16 px mip when small),
  // the unfold when it lands, the defocused bokeh when nearest.
  const spriteChip = (ctx, slot, alphaCap, bokeh) => {
    const size = S[slot];
    if (size <= 0.3 || A[slot] <= 0.01) return;
    const t = TN[slot];
    let f = FR[slot] % 24;
    if (f < 0) f += 24;
    f = Math.floor(f) % 24;
    const uf = UF[slot];
    let sx;
    let sy;
    let cs = 32;
    let draw = size;
    let alpha = A[slot] < alphaCap ? A[slot] : alphaCap;
    if (bokeh && Z[slot] > 0.92) {
      sx = BKX[t];
      sy = BKY[t];
      draw = size * 1.6;
      alpha = 0.3;
    } else if (uf >= 0 && t < 3) {
      sx = UNX[t] + 32 * uf;
      sy = UNY;
    } else if (size * SCALE <= 12) {
      sx = MIPX[t] + 16 * f;
      sy = MIPY[t];
      cs = 16;
    } else {
      sx = 32 * f;
      sy = 32 * t;
    }
    ctx.globalAlpha = alpha;
    ctx.drawImage(cells, sx, sy, cs, cs, X[slot] - draw / 2, Y[slot] - draw / 2, draw, draw);
    sprites_ += 1;
  };
  // A comet (N7): the pose 3 steps back gives the streak, pre-rotated.
  const comet = (ctx, slot, i) => {
    if (cometsDrawn >= cometLimit) return;
    const back = Q - 3 * DQ;
    if (i < n) poseTile(i, back, SC);
    else poseFree(i - n, back, SC);
    if (!KIND[SC]) return;
    const dx = X[slot] - X[SC];
    const dy = Y[slot] - Y[SC];
    const length = Math.hypot(dx, dy);
    if (length < 4) return;
    let a = Math.round(Math.atan2(dy, dx) / (Math.PI / 8)) % 16;
    if (a < 0) a += 16;
    const long = length >= 12 ? 1 : 0;
    const tail = long ? TAIL1 : TAIL0;
    let kk = length / tail;
    kk = kk < 0.6 ? 0.6 : kk > 2.5 ? 2.5 : kk;
    const draw = 32 * kk;
    const row = COMET_ROW[TN[slot]] + long;
    // Added light: the sheet's tails are faint, so a flick glows into streaks.
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, 0.85 * A[slot]);
    ctx.drawImage(
      cometSheet,
      32 * a,
      32 * row,
      32,
      32,
      X[slot] - draw / 2,
      Y[slot] - draw / 2,
      draw,
      draw,
    );
    ctx.globalCompositeOperation = "source-over";
    cometsDrawn += 1;
  };

  // One band of the cocoon: back (behind the body), mid (under the plates)
  // or front (over everything, its alpha capped at .7, the nearest
  // defocused).
  // Beyond the sprite budget (or a slow last frame), the far band's chips
  // become dim specks by index hash; the near bands are always sprites.
  const band = (ctx, list, count, front, far) => {
    const rich = cells && !coarse;
    const comets = cometSheet && !CALM && DQ > 0;
    const share = far ? (BACKRECTS ? 0 : keep) : 1;
    for (let c = 0; c < count; c += 1) {
      const slot = list[c];
      const hash = slot >= n ? free.hsh[slot - n] : HSH[slot];
      if (comets && hash < 1 / 3) comet(ctx, slot, slot);
      if (rich && hash < share) spriteChip(ctx, slot, front ? 0.7 : 1, front);
      else rectChip(slot, Z[slot] > -0.15, rich);
    }
    flushChips(ctx);
    ctx.globalAlpha = 1;
  };

  /**
   * Poses the frame: every plate's jig and every chip, sorted into its
   * band. Returns the shake (figure px) the view takes this frame.
   */
  const frame = (q, dq, calm, scale, backRects) => {
    Q = q;
    DQ = dq;
    CALM = calm;
    SCALE = scale;
    BACKRECTS = backRects;
    sprites_ = 0;
    cometsDrawn = 0;
    heroes = 0;
    conduitDraws = 0;
    nanitesDrawn = 0;
    for (let p = 0; p < NP; p += 1) jigFor(p, q, JIGGED[p] === 1);
    // Micro-shake (A5): the four DEUS！ accents and the crest.
    state.shakeX = 0;
    state.shakeY = 0;
    if (!calm && !coarse)
      for (let p = 0; p < NP; p += 1) {
        const pc = P[p];
        if (!pc.accent && !pc.crest) continue;
        const t = (q - pc.contact) / 0.006;
        if (t < 0 || t >= 1) continue;
        const e = 1.6 * Math.exp(-6 * t);
        state.shakeX += e * Math.sin(41 * t);
        state.shakeY += e * Math.cos(37 * t);
      }
    // The plates seating now, newest first (their ripples, N17).
    ripN = 0;
    for (let p = NP - 1; p >= 0 && ripN < RIPPLE_MAX; p -= 1) {
      const pc = P[p];
      const t = (q - pc.contact) / RIPPLE_T;
      if (t < 0 || t >= 1) continue;
      const o = ripN * 4;
      RIP[o] = pc.seatX;
      RIP[o + 1] = pc.seatY;
      RIP[o + 2] = t;
      RIP[o + 3] = 0.55 + 0.6 * pc.share + (pc.accent || pc.crest ? 0.4 : 0);
      ripN += 1;
    }
    nBack = nMid = nFront = nFlight = nImplode = 0;
    let visible = 0;
    for (let b = 0; b < NP * 2; b += 1) {
      beamI[b] = -1;
      beamU[b] = -1;
    }
    for (let p = 0; p < NP; p += 1) laneCount[p] = 0;
    for (let c = 0; c < TOUCH_CHIPS; c += 1) {
      topI[c] = -1;
      topU[c] = -1;
    }
    for (let i = 0; i < n; i += 1) {
      poseTile(i, q, i);
      const kind = KIND[i];
      topChip[i] = 0;
      if (!kind) continue;
      visible += 1;
      if (ripN && kind < 4) ripple(i);
      if (kind >= 4) {
        flightList[nFlight++] = i;
        const u = U[i];
        const p = PO[i];
        if (p >= 0 && kind === 4) laneCount[p] += 1;
        if (p >= 0 && u >= 0.8 && u < 1) {
          const b = p * 2;
          if (u > beamU[b]) {
            beamU[b + 1] = beamU[b];
            beamI[b + 1] = beamI[b];
            beamU[b] = u;
            beamI[b] = i;
          } else if (u > beamU[b + 1]) {
            beamU[b + 1] = u;
            beamI[b + 1] = i;
          }
        }
        if (coarse && u > topU[TOUCH_CHIPS - 1]) {
          let at = TOUCH_CHIPS - 1;
          while (at > 0 && u > topU[at - 1]) {
            topU[at] = topU[at - 1];
            topI[at] = topI[at - 1];
            at -= 1;
          }
          topU[at] = u;
          topI[at] = i;
        }
        continue;
      }
      const z = Z[i];
      if (z < -0.15) backList[nBack++] = i;
      else if (z <= 0.35) midList[nMid++] = i;
      else frontList[nFront++] = i;
    }
    for (let c = 0; c < TOUCH_CHIPS; c += 1) if (topI[c] >= 0) topChip[topI[c]] = 1;
    for (let j = 0; j < F; j += 1) {
      const slot = n + j;
      poseFree(j, q, slot);
      if (!KIND[slot]) continue;
      visible += 1;
      if (ripN && KIND[slot] === 7) ripple(slot);
      if (KIND[slot] === 8) implodeList[nImplode++] = slot;
      else if (Z[slot] < -0.15) backList[nBack++] = slot;
      else if (Z[slot] <= 0.35) midList[nMid++] = slot;
      else frontList[nFront++] = slot;
    }
    // The far band takes what the sprite budget leaves after the near bands,
    // the flights, the gold's incoming chips and droplets and the effects —
    // every term a function of q, never of the last frame.
    const near = visible - nBack;
    let reserve = FX_RESERVE;
    if (gold && goldCount && !coarse) {
      const head = goldBy(q);
      reserve += goldBy(q + 0.007) - head;
      reserve += Math.min(DROP_MAX, head - goldBy(q - 0.0016));
    }
    keep = nBack ? Math.min(1, Math.max(0, ASSEMBLY_SPRITE_BUDGET - reserve - near) / nBack) : 1;
    return state;
  };

  const view = (vs, vx, vy) => {
    VS = vs;
    VX = vx;
    VY = vy;
  };
  const setJig = (ctx, p) => {
    const j = p * 6;
    ctx.setTransform(
      VS * jig[j],
      VS * jig[j + 1],
      VS * jig[j + 2],
      VS * jig[j + 3],
      VS * jig[j + 4] + VX,
      VS * jig[j + 5] + VY,
    );
  };
  const resetView = (ctx) => ctx.setTransform(VS, 0, 0, VS, VX, VY);

  // A plate's cell of an atlas-space sheet (the guide and its layers), or
  // the figure-space fallback (the traced frame), cropped to rows [0, rows).
  const plateDraw = (ctx, sheet, atlas, p, dx, dy, rows) => {
    const pc = P[p];
    const h = rows < pc.h ? rows : pc.h;
    if (h <= 0) return;
    if (atlas) ctx.drawImage(sheet, pc.ax, pc.ay, pc.w, h, pc.x + dx, pc.y + dy, pc.w, h);
    else ctx.drawImage(sheet, pc.x, pc.y, pc.w, h, pc.x + dx, pc.y + dy, pc.w, h);
  };
  // The conduit's sheets: atlas-space per plate (the conduit job), else the
  // traced frame in figure space. Touch has no atlas hologram: it draws the
  // figure-space ones through clips.
  const guideHolo = () => (holo ? holo : face ? null : frameSheet);
  const guideFace = () => (face ? face : frameSheet);
  const guideWalls = () => (walls ? walls : face ? null : frameDeep);
  const atlasGuide = () => Boolean(face);
  const shown = (i) => !VIS || VIS[i] === 1;

  // The rects of plate p's gold cells [first, end) as a clip.
  const goldClip = (ctx, first, end) => {
    ctx.beginPath();
    for (let k = first; k < end; k += 1) {
      const i = GIDX[k];
      ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
    }
    ctx.clip();
  };

  /* 1–3: the cocoon behind the body, then under the plates. */
  const backPass = (ctx) => {
    cometLimit = 0.15 * ASSEMBLY_COMET_BUDGET;
    band(ctx, backList, nBack, false, true);
  };
  const midPass = (ctx) => {
    cometLimit = cometsDrawn + 0.3 * ASSEMBLY_COMET_BUDGET;
    band(ctx, midList, nMid, false, false);
  };

  /* 5: seated plates still in metal, then the lacquer front (A6). */
  const seatedPass = (ctx, painted) => {
    const q = Q;
    for (let src = 0; src < 2; src += 1) {
      const sheet = metalOf(src);
      if (!sheet) continue;
      let any = false;
      // Every landed, unpainted tile no stage holds (the helmet's all along).
      for (let kk = painted; kk < n && PAINT[kk] <= q + SEAT_LAG; kk += 1) {
        const i = ORDER[kk];
        if (SRC[i] !== src || T1[i] > q) continue;
        const p = PO[i];
        if (p >= 0 && STAGED[p] && q >= P[p].from) continue;
        if (!any) {
          ctx.save();
          ctx.beginPath();
          any = true;
        }
        ctx.rect(SX[i], SY[i], TW[i], TH[i]);
      }
      if (any) {
        ctx.clip();
        ctx.globalAlpha = 1;
        ctx.drawImage(sheet, 0, 0, W, H);
        ctx.restore();
      }
    }
    if (CALM) return;
    const first = paintedBy(q - N.lacquer);
    if (first >= painted) return;
    // The lacquer (A6): a white-ice sheen sweeping out from the seat over the
    // fresh paint — the plate's own raw metal (neutral, ice-cool, the art's
    // exact alpha and hex relief) added as light through the cells painted
    // in the last .0015, in three age bands, brightest at the front. Never
    // the mote sheet: no mosaic squares, and no cyan or pink before the seal
    // (owner: the lights stay monochrome until the suit is whole). Touch
    // takes one band.
    const bands = coarse ? 1 : 3;
    for (let src = 0; src < 2; src += 1) {
      const sheet = metalOf(src);
      if (!sheet) continue;
      for (let age = 0; age < bands; age += 1) {
        const newest = q - (age * N.lacquer) / bands;
        const oldest = q - ((age + 1) * N.lacquer) / bands;
        let any = false;
        for (let kk = first; kk < painted; kk += 1) {
          const i = ORDER[kk];
          if (SRC[i] !== src || TP[i] > newest || TP[i] <= oldest) continue;
          if (!any) {
            ctx.save();
            ctx.beginPath();
            any = true;
          }
          ctx.rect(SX[i], SY[i], TW[i], TH[i]);
        }
        if (any) {
          ctx.clip();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = coarse ? 0.32 : 0.46 - 0.14 * age;
          ctx.drawImage(sheet, 0, 0, W, H);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  /* 6: the molten band and the cooling cells (G6, G7), over the gold. */
  const moltenPass = (ctx) => {
    if (!gold || !molten || !goldCount) return;
    const q = Q;
    const head = goldBy(q);
    const band0 = goldBy(q - 0.004);
    // The cooling cells (aged .004–.012) in age bands that dim as they cool
    // (touch: one), so the cooled edge melts into the painted gold rather
    // than ending on the cells' straight lines (review 2026-10-16).
    const bands = coarse ? 1 : 4;
    for (let b = 0; b < bands; b += 1) {
      const from = goldBy(q - 0.004 - ((b + 1) * 0.008) / bands);
      const to = b ? goldBy(q - 0.004 - (b * 0.008) / bands) : band0;
      if (from >= to) continue;
      ctx.save();
      ctx.beginPath();
      for (let i = from; i < to; i += 1) ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
      ctx.clip();
      ctx.globalAlpha = coarse ? 0.3 : 0.45 * (1 - b / bands);
      ctx.drawImage(molten, 0, 0, W, H);
      ctx.restore();
    }
    if (band0 < head) {
      ctx.save();
      ctx.beginPath();
      for (let i = band0; i < head; i += 1) ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
      ctx.clip();
      ctx.globalAlpha = 1;
      ctx.drawImage(molten, 0, 0, W, H);
      ctx.restore();
    }
  };

  // Plate p's guideway cells built by q (its cells sorted by build time).
  const builtIn = (p, q) => {
    let low = P[p].goldFirst;
    let high = P[p].goldEnd;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (BAT[mid] <= q) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  // The rects of plate p's build-ordered cells [first, end) as a clip.
  const buildClip = (ctx, first, end) => {
    ctx.beginPath();
    for (let k = first; k < end; k += 1) {
      const i = BIDX[k];
      ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
    }
    ctx.clip();
  };
  // The walls' parallax (G5): the rails turn as you scroll through a plate's
  // whole guideway, from its build to its pour.
  const wallTurn = (pc, q) => Math.PI / 4 + 0.6 * Math.max(-1, Math.min(1, (q - pc.contact) / 0.1));

  // The conduit's body at alpha `a`: its walls in dark amber stepped
  // down-right at 1.1 and 2.2 px (the rails' depth, turning with the
  // scroll), then its face — ice glass, the channel and the gold rails —
  // and the hologram's scanlines left in the glass.
  const conduitBody = (ctx, p, faceSheet, wallSheet, atlas, a, q) => {
    const pc = P[p];
    if (wallSheet) {
      const turn = wallTurn(pc, q);
      const dx = 2.2 * Math.cos(turn);
      const dy = 2.2 * Math.sin(turn);
      ctx.globalAlpha = 0.72 * a;
      plateDraw(ctx, wallSheet, atlas, p, dx, dy, pc.h);
      ctx.globalAlpha = 0.85 * a;
      plateDraw(ctx, wallSheet, atlas, p, 0.5 * dx, 0.5 * dy, pc.h);
    }
    ctx.globalAlpha = a;
    plateDraw(ctx, faceSheet, atlas, p, 0, 0, pc.h);
    if (holo && atlas) {
      ctx.globalAlpha = 0.22 * a;
      plateDraw(ctx, holo, true, p, 0, 0, pc.h);
    }
  };
  // The rails' travelling glint (fine pointers): a band of cells running up
  // each conduit from its toe end, its face added as light through them.
  // A function of q alone, so it stays at rest.
  const glint = (ctx, p, faceSheet, atlas, a, first, end, byBuild) => {
    const pc = P[p];
    let any = false;
    for (let kk = first; kk < end; kk += 1) {
      const i = byBuild ? BIDX[kk] : GIDX[kk];
      let v = (2.5 * BB[i] - 70 * Q) % 1;
      if (v < 0) v += 1;
      if (v >= 0.1 || !shown(i)) continue;
      if (!any) {
        ctx.save();
        ctx.beginPath();
        any = true;
      }
      ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
    }
    if (!any) return;
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.42 * a;
    plateDraw(ctx, faceSheet, atlas, p, 0, 0, pc.h);
    ctx.restore();
  };

  // The pulses (G2) on plate p's built cells [first, end) not yet poured,
  // marching up the trims from the toe end, into `batch`.
  const pulses = (p, end) => {
    const pc = P[p];
    const q = Q;
    for (let kk = pc.goldFirst; kk < end; kk += 1) {
      const i = BIDX[kk];
      if (gold.lock[i] <= q) continue;
      let v = (6 * BB[i] - 150 * q) % 1;
      if (v < 0) v += 1;
      if (v >= 0.16 || batchN >= batchCap * 4 - 4 || !shown(i)) continue;
      pushRect(batch, batchN, gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
      batchN += 4;
    }
  };

  // The same pulses as bands of hard light along the trims' real shape: the
  // hologram added through the pulse cells (fine pointers; touch keeps rects).
  const pulseLight = (ctx, p, end, sheet, atlas) => {
    if (coarse || !sheet) {
      pulses(p, end);
      return;
    }
    const pc = P[p];
    const q = Q;
    let any = false;
    for (let kk = pc.goldFirst; kk < end; kk += 1) {
      const i = BIDX[kk];
      if (gold.lock[i] <= q) continue;
      let v = (6 * BB[i] - 150 * q) % 1;
      if (v < 0) v += 1;
      if (v >= 0.16 || !shown(i)) continue;
      if (!any) {
        ctx.save();
        ctx.beginPath();
        any = true;
      }
      ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
    }
    if (!any) return;
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.6;
    plateDraw(ctx, sheet, atlas, p, 0, 0, pc.h);
    ctx.restore();
  };

  /* 8: before contact, each trim's guideway is BUILT on the body (owner,
     2026-10-16: 「金のガイドウェイは上から被さる形ではなく、足先から滑らかに
     作られていく。」): the solid conduit (walls, rails, glass, channel) grows
     from the plate's lowest cell along its trims, the ice hologram a short
     stretch ahead of it, a white-hot weld head at the front throwing sparks,
     a hard-light beam from the latch driving it; then the pulses (G2). */
  const hologramPass = (ctx) => {
    if (!gold || !goldCount) return;
    const faceSheet = guideFace();
    const holoSheet = guideHolo();
    const wallSheet = coarse ? null : guideWalls();
    const atlas = atlasGuide();
    const q = Q;
    const GW = ASSEMBLY_GUIDEWAY;
    const live = !CALM && !coarse;
    batchN = 0;
    headN = 0;
    glowN = 0;
    emberN = 0;
    beamN = 0;
    let plates = 0;
    let held = 0;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      const first = pc.goldFirst;
      if (pc.goldEnd <= first) continue;
      // (A jigged plate's stays under it while its conduit comes through.)
      const until = JIGGED[p] === 1 && !pc.fixed ? pc.contact + 0.002 : pc.contact;
      if (q < pc.buildStart - GW.holo || q >= until) continue;
      // Touch draws per plate only the (up to four) conduits still being
      // built; every other built frame holds in one figure-space clip below,
      // so none pops in and out.
      if (coarse && (q >= pc.buildEnd || plates >= TOUCH_CONDUITS)) {
        if (figFace && q >= pc.buildStart) heldList[held++] = p;
        continue;
      }
      plates += 1;
      const built = builtIn(p, q);
      const ahead = q < pc.buildEnd ? builtIn(p, q + GW.holo) : built;
      if (built > first && faceSheet) {
        ctx.save();
        buildClip(ctx, first, built);
        conduitBody(ctx, p, faceSheet, wallSheet, atlas, 1, q);
        conduitDraws += 1;
        ctx.restore();
        if (!coarse && atlas) glint(ctx, p, faceSheet, atlas, 1, first, built, true);
      }
      if (ahead > built) {
        // The hologram ahead of the head (touch: a faint preview of the
        // conduit itself, from the figure-space face, through a clip).
        if (holoSheet) {
          ctx.save();
          buildClip(ctx, built, ahead);
          ctx.globalAlpha = 0.85;
          plateDraw(ctx, holoSheet, atlas, p, 0, 0, pc.h);
          conduitDraws += 1;
          ctx.restore();
        } else if (figFace) {
          ctx.save();
          buildClip(ctx, built, ahead);
          ctx.globalAlpha = 0.45;
          ctx.drawImage(figFace[pc.ornament ? 1 : 0], 0, 0, W, H);
          ctx.restore();
        }
      }
      if (q < pc.buildEnd + GW.head) {
        // The weld head: the cells just built, white-hot, with a glow (only
        // where the art shows gold).
        const from = builtIn(p, q - GW.head);
        for (let k = from; k < built && headN < HEAD_CAP * 4 - 4; k += 1) {
          const i = BIDX[k];
          if (!shown(i)) continue;
          const age = (q - BAT[k]) / GW.head;
          const cx = gold.x[i] + gold.w[i] / 2;
          const cy = gold.y[i] + gold.h[i] / 2;
          const s = 2.4 - 1.2 * age;
          pushRect(headRects, headN, cx - s / 2, cy - s / 2, s, s);
          headN += 4;
          if (glowN < HEAD_CAP * 4 - 4) {
            const g = 6 - 3 * age;
            pushRect(glowRects, glowN, cx - g / 2, cy - g / 2, g, g);
            glowN += 4;
          }
        }
        if (live && built > first && q < pc.buildEnd) {
          // The front's spark star and the beam from the latch.
          const k = built - 1;
          const i = BIDX[k];
          const cx = gold.x[i] + gold.w[i] / 2;
          const cy = gold.y[i] + gold.h[i] / 2;
          if (cells && shown(i)) {
            const f = Math.floor(q / 0.0006 + 4 * GHASH[i]) % 4;
            const draw = 11;
            ctx.globalAlpha = 0.9;
            ctx.drawImage(
              cells,
              SPX + 32 * f,
              SPY,
              32,
              32,
              cx - draw / 2,
              cy - draw / 2,
              draw,
              draw,
            );
            sprites_ += 1;
          }
          if (beamN < NP * 4) {
            beams[beamN] = pc.seatX;
            beams[beamN + 1] = pc.seatY;
            beams[beamN + 2] = cx;
            beams[beamN + 3] = cy;
            beamN += 4;
          }
        }
        if (live) {
          // Sparks flung from the weld, falling as they cool.
          const from2 = builtIn(p, q - GW.ember);
          for (let k = from2; k < built && emberN < HEAD_CAP * 4 - 4; k += 1) {
            const i = BIDX[k];
            const h = GHASH[i];
            if (h >= 0.4 || !shown(i)) continue;
            const age = (q - BAT[k]) / GW.ember;
            const ang = TAU * ((h * 7.31) % 1);
            const speed = 10 + 22 * ((h * 13.7) % 1);
            const x = gold.x[i] + gold.w[i] / 2 + Math.cos(ang) * speed * age;
            const y =
              gold.y[i] + gold.h[i] / 2 + Math.sin(ang) * speed * age * 0.7 + 30 * age * age;
            const s = 0.5 + 1.1 * (1 - age);
            pushRect(emberRects, emberN, x - s / 2, y - s / 2, s, s);
            emberN += 4;
          }
        }
      }
      if (!CALM && built > first) pulseLight(ctx, p, built, holoSheet, atlas);
    }
    // Touch: every other built frame, whole, through one clip per layer
    // (armour, ornaments) of the figure-space faces — a five-argument draw.
    if (held) heldFrames(ctx, held, false);
    if (beamN) {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = TONE_CSS[0];
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let at = 0; at < beamN; at += 4) {
        ctx.moveTo(beams[at], beams[at + 1]);
        ctx.lineTo(beams[at + 2], beams[at + 3]);
      }
      ctx.stroke();
    }
    fillBatch(ctx, glowRects, glowN, "rgb(150 236 255)", coarse ? 0.3 : 0.38);
    fillBatch(ctx, headRects, headN, "rgb(250 254 255)", 0.95);
    fillBatch(ctx, emberRects, emberN, "rgb(255 232 170)", 0.85);
    fillBatch(ctx, batch, batchN, "rgb(170 240 255)", 0.34);
    ctx.globalAlpha = 1;
  };
  // Touch's held frames (heldList[0, count)): before contact the cells built
  // by q (and the hologram's stretch ahead); after it (`seated`) the cells
  // not yet behind the cooling front.
  const heldFrames = (ctx, count, seated) => {
    const GW = ASSEMBLY_GUIDEWAY;
    const q = Q;
    for (let layer = 0; layer < 2; layer += 1) {
      let any = false;
      for (let h = 0; h < count; h += 1) {
        const p = heldList[h];
        const pc = P[p];
        if ((pc.ornament ? 1 : 0) !== layer) continue;
        if (!any) {
          ctx.save();
          ctx.beginPath();
          any = true;
        }
        if (seated) {
          for (let kk = goldAfter(p, q - 0.012); kk < pc.goldEnd; kk += 1) {
            const i = GIDX[kk];
            ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
          }
        } else {
          const end = builtIn(p, q + GW.holo);
          for (let kk = pc.goldFirst; kk < end; kk += 1) {
            const i = BIDX[kk];
            ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
          }
        }
      }
      if (!any) continue;
      ctx.clip();
      ctx.globalAlpha = 1;
      ctx.drawImage(figFace[layer], 0, 0, W, H);
      ctx.restore();
    }
  };

  // The landed, unpainted tiles of plate p with source `src`, as a path.
  const landedPath = (ctx, p, src, q) => {
    const pc = P[p];
    const ids = pc.tiles;
    const end = landedIn(p, q);
    let any = false;
    ctx.beginPath();
    for (let kk = 0; kk < end; kk += 1) {
      const i = ids[kk];
      if (SRC[i] !== src || TP[i] <= q) continue;
      ctx.rect(SX[i], SY[i], TW[i], TH[i]);
      any = true;
    }
    return any;
  };

  /* 9: each staged plate's contact shadow, on the body at its seat. */
  const shadowPass = (ctx) => {
    const q = Q;
    for (let p = 0; p < NP; p += 1) {
      if (STAGED[p] !== 1 || q < P[p].from) continue;
      const lam = LAM[p];
      if (lam <= 0) continue;
      const pc = P[p];
      for (let src = 0; src < 2; src += 1) {
        if (!(pc.srcMask & (1 << src))) continue;
        const sheet = silhouette[src];
        if (!sheet) continue;
        ctx.save();
        ctx.translate(0.35 * pc.lift * 0.45 * lam, 0.6 * pc.lift * 0.45 * lam);
        if (landedPath(ctx, p, src, q)) {
          ctx.clip();
          ctx.globalAlpha = 0.38;
          ctx.drawImage(sheet, 0, 0, W, H);
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  };

  /* 10: the staged plates under their jigs: lattice, walls, metal. */
  const stagedPass = (ctx) => {
    const q = Q;
    let rich = 0;
    let lattices = 0;
    for (let p = 0; p < NP; p += 1) {
      if (!STAGED[p]) continue;
      const pc = P[p];
      if (q < pc.from - 0.02) continue;
      const jigged = STAGED[p] === 1;
      if (jigged) setJig(ctx, p);
      const full = !coarse && rich < STAGED_RICH;
      if (jigged) rich += 1;
      // The scaffold lattice (A2), growing from the seat.
      if (lattice && q < pc.to && (coarse ? lattices < TOUCH_LATTICE : full)) {
        const grow = easeOut(clamp01((q - (pc.from - 0.02)) / (pc.to - pc.from + 0.02)));
        ctx.save();
        ctx.beginPath();
        ctx.rect(pc.x, pc.y, pc.w, pc.h);
        ctx.clip();
        ctx.beginPath();
        ctx.arc(pc.seatX, pc.seatY, Math.max(1, pc.reach * 1.05 * grow), 0, TAU);
        ctx.clip();
        ctx.globalAlpha = 0.6;
        ctx.drawImage(lattice, 0, 0, W, H);
        ctx.restore();
        lattices += 1;
      }
      if (q >= pc.from)
        for (let src = 0; src < 2; src += 1) {
          if (!(pc.srcMask & (1 << src))) continue;
          const sheet = metalOf(src);
          if (!sheet) continue;
          ctx.save();
          if (landedPath(ctx, p, src, q)) {
            ctx.clip();
            const wall = silhouette[src];
            if (full && wall && jigged) {
              ctx.globalAlpha = 0.9;
              ctx.drawImage(wall, 1.6, 2.0, W, H);
              ctx.drawImage(wall, 0.8, 1.0, W, H);
            }
            ctx.globalAlpha = 1;
            ctx.drawImage(sheet, 0, 0, W, H);
          }
          ctx.restore();
        }
      if (jigged) resetView(ctx);
    }
    ctx.globalAlpha = 1;
  };

  /* 11: from the seat on, the built conduit over the plate as it slams
     home into it (fading in through the seat), its walls turning with the
     scroll (G5), pulses marching up it until the pour, receding behind the
     cooling front (G7). */
  const conduitPass = (ctx) => {
    if (!gold) return;
    const faceSheet = guideFace();
    if (!faceSheet) return;
    const wallSheet = coarse ? null : guideWalls();
    const atlas = atlasGuide();
    const q = Q;
    batchN = 0;
    let plates = 0;
    let held = 0;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      if (q < pc.to || q >= pc.recedeEnd || pc.goldEnd <= pc.goldFirst) continue;
      // Never over a plate still moving under its jig: a jigged plate's
      // conduit comes through as it seats (the guideway lay on the body
      // under it until then), so the two never disagree (owner, 2026-10-16).
      const moving = JIGGED[p] === 1 && !pc.fixed;
      if (moving && q < pc.contact) continue;
      if (coarse && (plates >= TOUCH_CONDUITS || conduitDraws >= TOUCH_CONDUITS * 2)) {
        // Touch: the seated conduits beyond its per-plate draws hold in the
        // figure-space clip.
        if (figFace && q >= pc.contact) heldList[held++] = p;
        continue;
      }
      plates += 1;
      const seat = moving
        ? smooth(clamp01((q - pc.contact) / 0.002))
        : q < pc.contact
          ? smooth(clamp01((q - pc.to) / (pc.contact - pc.to)))
          : 1;
      // Behind the cooling front the conduit is gone: it became the gold.
      const first = goldAfter(p, q - 0.012);
      if (pc.goldEnd > first) {
        ctx.save();
        goldClip(ctx, first, pc.goldEnd);
        conduitBody(ctx, p, faceSheet, wallSheet, atlas, seat, q);
        conduitDraws += 1;
        ctx.restore();
        if (!coarse && atlas) glint(ctx, p, faceSheet, atlas, seat, first, pc.goldEnd, false);
      }
      if (!CALM && q >= pc.contact) pulseLight(ctx, p, pc.goldEnd, guideHolo(), atlas);
    }
    if (held) heldFrames(ctx, held, true);
    fillBatch(ctx, batch, batchN, "rgb(170 240 255)", 0.34);
    ctx.globalAlpha = 1;
  };

  /* 12: the hardpoint latches (A1), the corner clamps (G3), the beams (N9). */
  const hardwarePass = (ctx) => {
    const q = Q;
    let latches = 0;
    ctx.lineWidth = 1.2;
    let strokes = false;
    for (let p = 0; p < NP && latches < LATCH_MAX; p += 1) {
      const pc = P[p];
      // A tail segment's latch opens only as the chain's build front nears
      // it (review 2026-10-16: nine irises hung in the empty sky for .06).
      const start =
        pc.kind === 1 ? Math.max(pc.from - N.lead, pc.buildStart - 0.004) : pc.from - N.lead;
      if (q < start || q >= pc.contact + 0.01) continue;
      latches += 1;
      const appear = clamp01((q - start) / 0.006);
      const fade = q > pc.contact + 0.004 ? 1 - (q - pc.contact - 0.004) / 0.006 : 1;
      let f;
      if (q < pc.contact - 0.003) f = Math.floor((q - start) / 0.004) % 6;
      else if (q < pc.contact)
        f = 6 + Math.min(5, Math.floor(((q - pc.contact + 0.003) / 0.003) * 6));
      else f = 11;
      const size = (pc.accent || pc.crest ? 32 : 26) * (0.6 + 0.4 * appear);
      const alpha = appear * fade;
      if (alpha <= 0) continue;
      if (fxSheet && !coarse) {
        const draw = size * 1.35;
        ctx.globalAlpha = alpha;
        ctx.drawImage(
          fxSheet,
          LT.x + LT.cell * f,
          LT.y,
          LT.cell,
          LT.cell,
          pc.seatX - draw / 2,
          pc.seatY - draw / 2,
          draw,
          draw,
        );
        sprites_ += 1;
      } else {
        if (!strokes) {
          ctx.beginPath();
          strokes = true;
        }
        const r = size * 0.42 * (f >= 6 ? 1 - (f - 6) * 0.08 : 1);
        ctx.moveTo(pc.seatX + r, pc.seatY);
        ctx.arc(pc.seatX, pc.seatY, r, 0, TAU);
      }
    }
    if (strokes) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = "rgb(150 236 255)";
      ctx.stroke();
    }
    // The clamps: one per gold-box corner. They SLIDE in along the body's
    // surface from beside the box (owner, 2026-10-16: nothing descends onto
    // it) — the lower pair first, as the guideway was built — bite as the
    // plate lands, and slide away as the conduit recedes.
    strokes = false;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      if (!pc.hasGoldBox || pc.helm) continue;
      const start = pc.to - N.clampIn;
      const relStart = pc.recedeEnd;
      if (q < start || q >= relStart + N.release) continue;
      const [bx, by, bw, bh] = pc.gbox;
      const kk = Math.max(0.3, Math.min(0.6, Math.min(bw, bh) / 80));
      const draw = CL.cell * kk;
      const reach = 10 + 0.25 * bw;
      for (let c = 0; c < 4; c += 1) {
        const sxn = c & 1 ? 1 : -1;
        const syn = c & 2 ? 1 : -1;
        const at = start + (c < 2 ? 0.003 : 0);
        if (q < at) continue;
        let f = 7;
        let slide = 0;
        let alpha = 1;
        if (q < at + 0.008) {
          const w = (q - at) / 0.008;
          slide = 1 - easeOut(w);
          alpha = clamp01(w * 2.5);
        } else if (q >= pc.contact - 0.002 && q < pc.contact + 0.002)
          f = 8 + Math.min(3, Math.floor(((q - pc.contact + 0.002) / 0.004) * 4));
        else if (q >= pc.contact + 0.002 && q < relStart) f = 11;
        else if (q >= relStart) {
          const r = (q - relStart) / N.release;
          f = Math.max(7, 11 - Math.floor(r * 5));
          slide = smooth(r);
          alpha = 1 - r;
        }
        if (alpha <= 0) continue;
        const cx = (sxn > 0 ? bx + bw : bx) + sxn * reach * slide;
        const cy = syn > 0 ? by + bh : by;
        if (fxSheet && !coarse) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(
            fxSheet,
            CL.x + CL.cell * f,
            CL.y + CL.cell * c,
            CL.cell,
            CL.cell,
            cx - CLAX[c] * kk,
            cy - CLAY[c] * kk,
            draw,
            draw,
          );
          sprites_ += 1;
        } else {
          if (!strokes) {
            ctx.beginPath();
            strokes = true;
          }
          const arm = draw * 0.32;
          const ox = cx + sxn * (f >= 8 ? 0.6 : 1.5);
          const oy = cy + syn * (f >= 8 ? 0.6 : 1.5);
          ctx.moveTo(ox - sxn * arm, oy);
          ctx.lineTo(ox, oy);
          ctx.lineTo(ox, oy - syn * arm);
        }
      }
    }
    if (strokes) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "rgb(255 220 140)";
      ctx.stroke();
    }
    // The rivers' gates: two ice posts where each plate's stream narrows.
    let posts = false;
    const half = 0.012 * H;
    for (let p = 0; p < NP; p += 1) {
      if (laneCount[p] < 3) continue;
      const pc = P[p];
      if (!posts) {
        ctx.beginPath();
        posts = true;
      }
      for (let side = -1; side <= 1; side += 2) {
        const x = pc.gateX - pc.ny * half * side;
        const y = pc.gateY + pc.nx * half * side;
        ctx.moveTo(x - pc.nx * 4, y - pc.ny * 4);
        ctx.lineTo(x + pc.nx * 4, y + pc.ny * 4);
      }
    }
    if (posts) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = TONE_CSS[0];
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    // Hard-light beams from each staged plate's latch to its diving tiles.
    if (!CALM && !coarse) {
      let any = false;
      for (let p = 0; p < NP; p += 1)
        for (let b = 0; b < 2; b += 1) {
          const i = beamI[p * 2 + b];
          if (i < 0) continue;
          if (!any) {
            ctx.beginPath();
            any = true;
          }
          ctx.moveTo(P[p].seatX, P[p].seatY);
          ctx.lineTo(X[i], Y[i]);
        }
      if (any) {
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = TONE_CSS[0];
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  /* 14: the flights — comets, chips, unfolds, the metal tiles fading in,
     the recoil of each lock, its spark and the lattice link it lights. */
  const flightPass = (ctx) => {
    const q = Q;
    const comets = cometSheet && !CALM && DQ > 0;
    cometLimit = cometsDrawn + 0.25 * ASSEMBLY_COMET_BUDGET;
    let arts = 0;
    for (let c = 0; c < nFlight; c += 1) {
      const i = flightList[c];
      if (U[i] >= 0.86) arts += 1;
    }
    let budget = arts;
    if (coarse) {
      let chips = 0;
      for (let c = 0; c < TOUCH_CHIPS; c += 1) if (topI[c] >= 0) chips += 1;
      // (+1: the undersuit's own nine-argument draw shares the canvas, so a
      // frame stays within 64 in all.)
      const reserve = conduitDraws + (cells ? chips : 0) + TOUCH_RINGS + 1;
      budget = Math.max(0, Math.min(arts, touchArtBudget - reserve));
    }
    let drawnArts = 0;
    let seenArts = 0;
    // N16, velocity tracers: a hairline from where each fast chip was a
    // moment of its flight ago (the river's, the dart's), under the chips,
    // tapering — faint over its whole length, brighter over the half nearest
    // the chip.
    ctx.strokeStyle = "rgb(196 244 255)";
    ctx.lineWidth = 0.8;
    for (let half = 0; half < 2; half += 1) {
      let traced = 0;
      ctx.beginPath();
      for (let c = 0; c < nFlight; c += 1) {
        const i = flightList[c];
        const tx = TRX[i];
        if (tx !== tx || A[i] <= 0.05) continue;
        const k = half ? 0.5 : 0;
        ctx.moveTo(tx + (X[i] - tx) * k, TRY[i] + (Y[i] - TRY[i]) * k);
        ctx.lineTo(X[i], Y[i]);
        traced += 1;
      }
      if (!traced) break;
      ctx.globalAlpha = (half ? 0.42 : 0.18) * (coarse ? 0.85 : 1);
      ctx.stroke();
    }
    for (let c = 0; c < nFlight; c += 1) {
      const i = flightList[c];
      if (comets && (KIND[i] === 4 || KIND[i] === 5)) comet(ctx, i, i);
      if (coarse) {
        if (cells && topChip[i]) {
          spriteChip(ctx, i, 1, false);
          heroes += 1;
          nanitesDrawn += 1;
        } else if (A[i] > 0.05) rectChip(i, true);
      } else if (cells) spriteChip(ctx, i, 1, false);
      else rectChip(i, true);
      const u = U[i];
      if (u >= 0.86) {
        // Its metal tile fades in where it will lock.
        const g = (u - 0.86) / 0.14;
        const slot = seenArts++;
        const take =
          budget >= arts || Math.floor((drawnArts * arts) / Math.max(1, budget)) === slot;
        if (take && drawnArts < budget) {
          drawnArts += 1;
          const w = TW[i] * (0.7 + 0.3 * g);
          const h = TH[i] * (0.7 + 0.3 * g);
          ctx.globalAlpha = g;
          ctx.drawImage(
            metalOf(SRC[i]),
            SX[i],
            SY[i],
            TW[i],
            TH[i],
            X[i] - w / 2,
            Y[i] - h / 2,
            w,
            h,
          );
        } else rectChip(i, true);
      }
    }
    flushChips(ctx);
    // N15, the glints: the star of light a banking chip's face throws.
    if (cells && !coarse) {
      let glints = 0;
      ctx.globalCompositeOperation = "lighter";
      for (let c = 0; c < nFlight && glints < GLINT_MAX; c += 1) {
        const i = flightList[c];
        const g = GL[i];
        if (g <= 0.05 || A[i] <= 0.1) continue;
        const draw = S[i] * (1.1 + 1.3 * g);
        ctx.globalAlpha = 0.85 * g;
        ctx.drawImage(cells, SPX, SPY, 32, 32, X[i] - draw / 2, Y[i] - draw / 2, draw, draw);
        sprites_ += 1;
        glints += 1;
      }
      ctx.globalCompositeOperation = "source-over";
    }
    if (coarse || CALM) {
      ctx.globalAlpha = 1;
      return;
    }
    // The recoil: each just-locked tile, alone over its plate, snaps in —
    // squashed along its plate's normal by the impact, across it widened,
    // then a rebound (N18, snap and bounce).
    const landed = landedBy(q);
    for (let i = landedBy(q - N.recoil); i < landed; i += 1) {
      const p = PO[i];
      const t = (q - T1[i]) / N.recoil;
      const sq = 0.18 * Math.exp(-5 * t) * Math.cos(9.4 * t);
      const along = p >= 0 ? Math.abs(P[p].nx) : 0;
      const cx = p >= 0 ? jigX(p, CX[i], CY[i]) : CX[i];
      const cy = p >= 0 ? jigY(p, CX[i], CY[i]) : CY[i];
      const w = TW[i] * (1 - sq * along + 0.6 * sq * (1 - along));
      const h = TH[i] * (1 - sq * (1 - along) + 0.6 * sq * along);
      ctx.globalAlpha = 1 - t * 0.5;
      ctx.drawImage(metalOf(SRC[i]), SX[i], SY[i], TW[i], TH[i], cx - w / 2, cy - h / 2, w, h);
    }
    // Sparks (1 lock in 6) and lattice links to the parent cell.
    linkCounts[0] = linkCounts[1] = linkCounts[2] = 0;
    for (let i = landedBy(q - N.spark); i < landed; i += 1) {
      const p = PO[i];
      const t = (q - T1[i]) / N.spark;
      const cx = p >= 0 ? jigX(p, CX[i], CY[i]) : CX[i];
      const cy = p >= 0 ? jigY(p, CX[i], CY[i]) : CY[i];
      if (cells && HSH[i] < 1 / 6) {
        const f = Math.min(3, Math.floor(t * 4));
        const draw = 1.6 * Math.max(TW[i], TH[i]);
        const nx = p >= 0 ? P[p].nx : 0;
        const ny = p >= 0 ? P[p].ny : -1;
        const ex = cx - nx * TW[i] * 0.5;
        const ey = cy - ny * TH[i] * 0.5;
        ctx.globalAlpha = 1;
        ctx.drawImage(cells, SPX + 32 * f, SPY, 32, 32, ex - draw / 2, ey - draw / 2, draw, draw);
        sprites_ += 1;
      }
      const j = PARENT[i];
      if (j >= 0) {
        const bucket = t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
        const at = bucket * n * 4 + linkCounts[bucket];
        links[at] = cx;
        links[at + 1] = cy;
        links[at + 2] = p >= 0 ? jigX(p, CX[j], CY[j]) : CX[j];
        links[at + 3] = p >= 0 ? jigY(p, CX[j], CY[j]) : CY[j];
        linkCounts[bucket] += 4;
      }
    }
    ctx.strokeStyle = TONE_CSS[0];
    ctx.lineWidth = 0.8;
    for (let bucket = 0; bucket < 3; bucket += 1) {
      const count = linkCounts[bucket];
      if (!count) continue;
      ctx.globalAlpha = 0.6 * (1 - (bucket + 0.5) / 3);
      ctx.beginPath();
      const base = bucket * n * 4;
      for (let at = base; at < base + count; at += 4) {
        ctx.moveTo(links[at], links[at + 1]);
        ctx.lineTo(links[at + 2], links[at + 3]);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  // A stretch [a, b] (arc length, a ≤ b, any sign) of seam loop L as a path.
  const seamArc = (ctx, L, a, b) => {
    const start = LSTART[L];
    const count = LCOUNT[L];
    const per = LPER[L];
    if (per <= 0 || b <= a) return;
    if (b - a > per) b = a + per;
    const shift = Math.floor(a / per) * per;
    a -= shift;
    b -= shift;
    // The segment holding arc length a.
    let low = 0;
    let high = count - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (SEAMC[start + mid] <= a) low = mid;
      else high = mid - 1;
    }
    let k = low;
    let base = 0;
    const point = (index) => start + (index % count);
    const cumAt = (index) => (index >= count ? per : SEAMC[start + index]);
    {
      const c0 = cumAt(k);
      const c1 = cumAt(k + 1);
      const t = c1 > c0 ? (a - c0) / (c1 - c0) : 0;
      const i0 = point(k);
      const i1 = point(k + 1);
      ctx.moveTo(SEAMX[i0] + (SEAMX[i1] - SEAMX[i0]) * t, SEAMY[i0] + (SEAMY[i1] - SEAMY[i0]) * t);
    }
    for (let guard = 0; guard < count * 2 + 2; guard += 1) {
      const next = k + 1;
      const cNext = base + cumAt(next);
      if (cNext >= b) {
        const c0 = base + cumAt(k);
        const t = cNext > c0 ? (b - c0) / (cNext - c0) : 1;
        const i0 = point(k);
        const i1 = point(next);
        ctx.lineTo(
          SEAMX[i0] + (SEAMX[i1] - SEAMX[i0]) * t,
          SEAMY[i0] + (SEAMY[i1] - SEAMY[i0]) * t,
        );
        return;
      }
      ctx.lineTo(SEAMX[point(next)], SEAMY[point(next)]);
      k = next;
      if (k >= count) {
        k = 0;
        base += per;
      }
    }
  };

  /* 15: the seam ignition (A4), the shock rings and spall (A5). */
  const impactPass = (ctx) => {
    if (CALM) return;
    const q = Q;
    let seamPlates = 0;
    // Tails, then heads, then afterglow: three batched strokes.
    for (let pass = 0; pass < 3; pass += 1) {
      let any = false;
      seamPlates = 0;
      for (let p = 0; p < NP; p += 1) {
        const pc = P[p];
        if (!pc.loopCount) continue;
        const t = (q - pc.contact) / N.seam;
        if (t < 0 || t >= 1 + N.seamGlow / N.seam) continue;
        if (coarse && seamPlates >= TOUCH_SEAMS) continue;
        seamPlates += 1;
        for (let L = pc.loopFirst; L < pc.loopFirst + pc.loopCount; L += 1) {
          const per = LPER[L];
          if (pass < 2) {
            if (t >= 1) continue;
            const s = (t * per) / 2;
            const tail = pass === 0 ? 0.15 * per : 0.03 * per;
            if (!any) {
              ctx.beginPath();
              any = true;
            }
            seamArc(ctx, L, Math.max(0, s - tail), s);
            seamArc(ctx, L, -s, Math.min(0, -s + tail));
          } else if (t >= 1) {
            if (!any) {
              ctx.beginPath();
              any = true;
            }
            seamArc(ctx, L, 0, per);
          }
        }
      }
      if (!any) continue;
      if (pass === 0) {
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = TONE_CSS[0];
        ctx.lineWidth = 1.2;
      } else if (pass === 1) {
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = "rgb(242 252 255)";
        ctx.lineWidth = 2.6;
      } else {
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = TONE_CSS[0];
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    }
    // Shock rings in each plate's plane.
    let ringsDrawn = 0;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      const t = (q - pc.contact) / N.shock;
      if (t < 0 || t >= 1) continue;
      if (ringsDrawn >= (coarse ? TOUCH_RINGS : SHOCK_MAX)) break;
      if (!fxSheet) continue;
      ringsDrawn += 1;
      const frameK = Math.min(9, Math.floor(t * 10));
      const w = pc.shock;
      const h = (w * SHK.h) / SHK.w;
      const rot = Math.atan2(pc.ny, pc.nx) - Math.PI / 2;
      const c = Math.cos(rot) * VS;
      const s = Math.sin(rot) * VS;
      ctx.setTransform(c, s, -s, c, VS * pc.seatX + VX, VS * pc.seatY + VY);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(
        fxSheet,
        SHK.x + SHK.w * (frameK % SHK.cols),
        SHK.y + SHK.h * Math.floor(frameK / SHK.cols),
        SHK.w,
        SHK.h,
        (-SHK.centre[0] * w) / SHK.w,
        (-SHK.centre[1] * h) / SHK.h,
        w,
        h,
      );
      heroes += coarse ? 1 : 0;
      nanitesDrawn += coarse ? 1 : 0;
      sprites_ += 1;
    }
    if (ringsDrawn) resetView(ctx);
    // Spall: chips flung across the plate's plane, falling.
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      const t = (q - pc.contact) / N.shock;
      if (t < 0 || t >= 1) continue;
      const qx = -pc.ny;
      const qy = pc.nx;
      for (let j = 0; j < pc.spall; j += 1) {
        const hs = naniteHash(j, pc.index * 31 + 7);
        const side = j % 2 ? 1 : -1;
        const speed = 40 + 30 * hs;
        const vx = qx * side * speed + pc.nx * 20;
        const vy = qy * side * speed + pc.ny * 20;
        const x = pc.seatX + vx * t;
        const y = pc.seatY + vy * t + 60 * t * t;
        const size = 6 + 3 * naniteHash(j, pc.index * 31 + 8);
        const slot = SC;
        X[slot] = x;
        Y[slot] = y;
        S[slot] = size;
        A[slot] = (1 - t) * (1 - t);
        Z[slot] = 0;
        FR[slot] = 24 * hs + 72 * t;
        TN[slot] = j % 3 === 0 ? 2 : pc.seatX < W / 2 ? 0 : 1;
        UF[slot] = -1;
        if (cells && !coarse) spriteChip(ctx, slot, 1, false);
        else rectChip(slot, true);
      }
    }
    flushChips(ctx);
    ctx.globalAlpha = 1;
  };

  /* 16: gold nanites incoming (N11), droplets at the band's head (G6), the
     recede front's rising chips (G7), sparks, and the glint. */
  const goldPass = (ctx) => {
    if (!gold || !goldCount || coarse) return;
    const q = Q;
    const approach = 0.007;
    const G = goldCell;
    // Incoming: gold hex chips on the flow path.
    if (cells) {
      const end = goldBy(q + approach);
      for (let i = goldBy(q); i < end; i += 1) {
        if (!shown(i)) continue;
        const u = 1 - (gold.lock[i] - q) / approach;
        const e = smooth(clamp01(u));
        const size = G * (0.9 + 0.7 * e);
        const x = gold.x[i] + gold.w[i] / 2 + gold.ux[i] * (1 - u);
        const y = gold.y[i] + gold.h[i] / 2 + gold.uy[i] * (1 - u);
        let f = Math.floor(24 * GHASH[i] + 30 * u) % 24;
        if (f < 0) f += 24;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(
          cells,
          MIPX[3] + 16 * f,
          MIPY[3],
          16,
          16,
          x - size / 2,
          y - size / 2,
          size,
          size,
        );
        sprites_ += 1;
      }
    }
    if (CALM) return;
    // Droplets: oriented along the flow, rounding off as they settle.
    let drops = 0;
    const dropStart = goldBy(q - 0.0016);
    const head = goldBy(q);
    for (let i = dropStart; i < head && drops < DROP_MAX; i += 1) {
      if (!shown(i)) continue;
      const age = (q - gold.lock[i]) / 0.0016;
      const size = 1.4 * G;
      const cx = gold.x[i] + gold.w[i] / 2;
      const cy = gold.y[i] + gold.h[i] / 2;
      drops += 1;
      if (age >= 0.75 && cells) {
        const f = Math.floor(GHASH[i] * 8 + age * 8) % 8;
        const draw = size * 1.6;
        ctx.globalAlpha = 1 - (age - 0.75) * 2;
        ctx.drawImage(
          cells,
          BEADX + 32 * f,
          BEADY,
          32,
          32,
          cx - draw / 2,
          cy - draw / 2,
          draw,
          draw,
        );
      } else if (fxSheet) {
        let a = Math.round(Math.atan2(-gold.uy[i], -gold.ux[i]) / (Math.PI / 8)) % 8;
        if (a < 0) a += 8;
        const e = age < 0.25 ? 2 : age < 0.5 ? 1 : 0;
        const draw = size * 2.2;
        ctx.globalAlpha = 1;
        ctx.drawImage(
          fxSheet,
          DRP.x + DRP.cell * a,
          DRP.y + DRP.cell * e,
          DRP.cell,
          DRP.cell,
          cx - draw / 2,
          cy - draw / 2,
          draw,
          draw,
        );
      }
      sprites_ += 1;
    }
    // One lock in twenty throws a spark.
    if (cells) {
      for (let i = goldBy(q - 0.004); i < head; i += 1) {
        if (GHASH[i] >= 0.05 || !shown(i)) continue;
        const f = Math.min(3, Math.floor(((q - gold.lock[i]) / 0.004) * 4));
        const draw = 5 * G;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(
          cells,
          SPX + 32 * f,
          SPY,
          32,
          32,
          gold.x[i] + gold.w[i] / 2 - draw / 2,
          gold.y[i] + gold.h[i] / 2 - draw / 2,
          draw,
          draw,
        );
        sprites_ += 1;
      }
      // The recede front: one cell in four sheds a chip that rises and fades.
      const recEnd = goldBy(q - 0.012);
      for (let i = goldBy(q - 0.016); i < recEnd; i += 1) {
        if (GHASH[i] >= 0.25 || !shown(i)) continue;
        const t = (q - 0.012 - gold.lock[i]) / 0.004;
        const rise = (6 + 4 * GHASH[i] * 4) * t;
        const size = G * 1.2;
        let f = Math.floor(24 * GHASH[i] * 4 + 40 * t) % 24;
        if (f < 0) f += 24;
        ctx.globalAlpha = 0.9 * (1 - t);
        ctx.drawImage(
          cells,
          MIPX[3] + 16 * f,
          MIPY[3],
          16,
          16,
          gold.x[i] + gold.w[i] / 2 - size / 2,
          gold.y[i] - rise - size / 2,
          size,
          size,
        );
        sprites_ += 1;
      }
    }
    // The glint follows the cooled front along the finished trim.
    if (goldArt) {
      const g0 = goldBy(q - 0.012 - 0.006);
      const g1 = goldBy(q - 0.012);
      if (g1 > g0) {
        ctx.save();
        ctx.beginPath();
        for (let i = g0; i < g1; i += 1) ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45;
        ctx.drawImage(goldArt, 0, 0, W, H);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  };

  /* 17–18: the cocoon in front, then the free chips imploding (N12). */
  const frontPass = (ctx) => {
    cometLimit = ASSEMBLY_COMET_BUDGET;
    band(ctx, frontList, nFront, true, false);
  };
  const freePass = (ctx) => {
    const rich = cells && !coarse;
    // Charged as they fall in: added light, so they read over the armour.
    if (rich && nImplode) ctx.globalCompositeOperation = "lighter";
    for (let c = 0; c < nImplode; c += 1) {
      const slot = implodeList[c];
      if (rich) {
        A[slot] = Math.min(1, A[slot] * 1.7);
        spriteChip(ctx, slot, 1, false);
      } else rectChip(slot, true);
    }
    ctx.globalCompositeOperation = "source-over";
    flushChips(ctx);
    ctx.globalAlpha = 1;
  };
  // The frame's tally (instrumentation only: nothing reads it back).
  const endFrame = () => {
    state.sprites = sprites_;
    state.heroes = heroes + conduitDraws;
    state.nanites = nanitesDrawn + (face ? conduitDraws : 0);
    state.comets = cometsDrawn;
  };
  /* -- end of the draw passes -- */

  return {
    state,
    frame,
    view,
    paintedBy,
    backPass,
    midPass,
    seatedPass,
    moltenPass,
    hologramPass,
    shadowPass,
    stagedPass,
    conduitPass,
    hardwarePass,
    flightPass,
    impactPass,
    goldPass,
    frontPass,
    freePass,
    endFrame,
  };
}
