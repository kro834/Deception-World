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
  coarse = false,
}) {
  const N = ASSEMBLY_NANITES;
  const { width: W, height: H } = size;
  const tiles = plan.tiles;
  const n = tiles.length;
  let work = 0;
  // A checkpoint every few thousand simple steps: well inside an idle
  // slice, and few enough that a starved idle queue still finishes.
  const tick = () => ++work % 4096 === 0;

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
      gateX: seatX + nx * 0.1 * H,
      gateY: seatY + ny * 0.1 * H,
      gx,
      gy,
      lift,
      theta: helm ? 0 : (coarse ? 12 : 18) * DEG,
      offX: lift * (0.55 * hx - 0.3),
      offY: lift * -0.55,
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
      gbox: box
        ? [box[0], box[1], box[2], box[3]]
        : [piece.x, piece.y, piece.w, piece.h],
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
      tp[i] = Math.max(
        piece.contact + 0.001 + (piece.helm ? 0.004 : N.paint) * d,
        T1[i] + 0.0005,
      );
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
    goldIdx,
    goldHash,
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
    const key =
      (Math.round(nano.SY[i] / tile) + dy) * cols + Math.round(nano.SX[i] / tile) + dx;
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
    clamp: { x: 0, y: 0, cell: 48, anchor: { tl: [12, 12], tr: [36, 12], bl: [12, 36], br: [36, 36] } },
    latch: { x: 0, y: 192, cell: 48 },
    scan: { x: 576, y: 0, w: 256, h: 64, edgeY: 32 },
    drop: { x: 576, y: 64, cell: 24 },
    shock: { x: 0, y: 240, w: 192, h: 72, cols: 5, centre: [96, 36] },
  },
};

const TONE_CSS = ["rgb(121 232 255)", "rgb(255 143 216)", "rgb(244 251 255)"];
const SHADE_CSS = ["rgb(22 58 74)", "rgb(74 34 62)", "rgb(58 64 76)"];

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
  const k = { cells: kit?.cells ?? KIT.cells, comets: kit?.comets ?? KIT.comets, fx: kit?.fx ?? KIT.fx };
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
  const COMET_ROW = Float64Array.from([k.comets.rows.ice, k.comets.rows.pink, k.comets.rows.ice, k.comets.rows.gold]);
  const TAIL0 = k.comets.tail[0];
  const TAIL1 = k.comets.tail[1];
  const CL = k.fx.clamp;
  const CLAX = Float64Array.from([CL.anchor.tl[0], CL.anchor.tr[0], CL.anchor.bl[0], CL.anchor.br[0]]);
  const CLAY = Float64Array.from([CL.anchor.tl[1], CL.anchor.tr[1], CL.anchor.bl[1], CL.anchor.br[1]]);
  const LT = k.fx.latch;
  const SCN = k.fx.scan;
  const DRP = k.fx.drop;
  const SHK = k.fx.shock;
  const metal = layers.metal ?? [null, null];
  const silhouette = layers.silhouette ?? [null, null];
  const art = layers.art ?? [null, null];
  const motes = layers.motes ?? [null, null];
  const holo = layers.holo ?? null;
  const walls = layers.walls ?? null;
  const face = layers.face ?? null;
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
  const GIDX = nano.goldIdx;
  const GHASH = nano.goldHash;
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
  const LAM = new Float64Array(NP);
  const STAGED = new Uint8Array(NP);
  const beamI = new Int32Array(NP * 2);
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
  let fxReserve = 160;
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

  // Ring geometry scratch (no allocation).
  let RX = 0;
  let RY = 0;
  let RZ = 0;
  let TX = 0;
  let TY = 0;

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
    RX = W / 2 + lx * tc - ly * ts;
    RY = RCY[r] + 4 * ln + lx * ts + ly * tc;
    RZ = s;
    if (tangent) {
      const dir = RDIR[r];
      const dlx = -R * s * dir;
      const dly = (Ry * c + 15 * Math.cos(5 * theta + ph)) * dir;
      const tx = dlx * tc - dly * ts;
      const ty = dlx * ts + dly * tc;
      const len = Math.hypot(tx, ty) || 1;
      TX = tx / len;
      TY = ty / len;
    }
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
    RX = ax + (tx - ax) * e;
    RY = ay + (ty - ay) * e;
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
    const helm = p >= 0 && P[p].helm;
    if (q < t0) {
      ringPoint(r, TH0[i] + ROM[r] * (q - m), LANE[i], PHI[i], false);
      let x = RX;
      let y = RY;
      let z = RZ;
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
        x = RX;
        y = RY;
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
      const turn = (RDIR[0] * 1.5 * Math.PI * w);
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
      ringPoint(r, TH0[i] + ROM[r] * (t0 - m), LANE[i], PHI[i], true);
      const p0x = RX;
      const p0y = RY;
      const z0 = RZ;
      const p1x = p0x + TX * 0.12 * H;
      const p1y = p0y + TY * 0.12 * H;
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
      kind = 5;
    } else {
      // The dive: speed peaks at contact; it turns face-on and unfolds.
      fr += helm ? rate * 1.5 * dive * span : rate * (2 * 0.55 * span + 0.5 * 0.25 * span);
      const w = (u - dive) / (1 - dive);
      const w2 = w * w;
      x = hx + (cx - hx) * w2 * w2;
      y = hy + (cy - hy) * w2 * w2;
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
    ringPoint(r, free.th0[j] + ROM[r] * (q - b), free.lane[j], free.phi[j], false);
    let x = RX;
    let y = RY;
    const z = RZ;
    let size = s0 * (1 + 0.45 * z);
    let alpha = 0.45 + 0.25 * (z + 1);
    TN[slot] = free.tone[j];
    UF[slot] = -1;
    let kind = 7;
    const s = (q - b) / BIRTH;
    if (s < 1) {
      spiral(s, free.arm[j], free.armDir[j], x, y);
      x = RX;
      y = RY;
      size *= 0.6 + 0.4 * s;
      if (s < 0.5) TN[slot] = 2;
    }
    if (q >= N.implode[0]) {
      const u = (q - N.implode[0]) / (N.implode[1] - N.implode[0]);
      const c = Math.cos(TAU * u);
      const sn = Math.sin(TAU * u);
      const k3 = 1 - u * u * u;
      const dx = x - coreX;
      const dy = y - coreY;
      x = coreX + (dx * c - dy * sn) * k3;
      y = coreY + (dx * sn + dy * c) * k3;
      size *= 1 - 0.6 * u;
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
    const staged = !pc.helm && q >= pc.from - N.lead && q < pc.stageEnd;
    if (staged) {
      if (q < pc.from) lam = 1;
      else if (q < pc.to) lam = 1 - (0.35 * landedIn(p, q)) / pc.t1s.length;
      else if (q < pc.contact) {
        const u = (q - pc.to) / (pc.contact - pc.to);
        lam = 0.65 * (1 - u * u * u);
      } else if (q < pc.contact + N.overshoot) {
        const t = (q - pc.contact) / N.overshoot;
        lam = -0.1 * Math.sin(Math.PI * t) * Math.exp(-2 * t);
      }
      if (pc.kind === 1) {
        turn = -(10 + 4 * pc.seg) * DEG * lam;
        if (q >= pc.contact) {
          const t = (q - pc.contact) / 0.012;
          if (t < 1) turn += 3 * DEG * Math.exp(-6 * t) * Math.cos(12 * t);
        }
      }
      if (pc.kind === 2 && q >= pc.contact) {
        const t = (q - pc.contact) / 0.012;
        if (t < 1) skew = 0.12 * Math.exp(-4 * t) * Math.sin(10 * t);
      }
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
    for (let i = 0; i < count; i += 4) ctx.rect(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3]);
    ctx.fill();
  };
  // A chip as two-tone rects (touch, fallbacks, decimation): the tone over
  // a darker shade 1 px down-right, its size pulsing with the tumble.
  const rectChip = (slot, bright, speck = false) => {
    let f = FR[slot] % 24;
    if (f < 0) f += 24;
    const size =
      S[slot] * (speck ? 0.32 : 1) * (0.55 + 0.45 * Math.abs(Math.cos((TAU * f) / 24)));
    const t = TN[slot] > 2 ? 0 : TN[slot];
    const b = t * 2 + (bright ? 1 : 0);
    const at = chipCounts[b];
    if (at >= RECT_CAP * 4) return;
    pushRect(chipRects, b * RECT_CAP * 4 + at, X[slot] - size / 2, Y[slot] - size / 2, size, size);
    chipCounts[b] = at + 4;
  };
  const flushChips = (ctx) => {
    for (let b = 0; b < 6; b += 1) {
      const count = chipCounts[b];
      if (!count) continue;
      const base = b * RECT_CAP * 4;
      const t = b >> 1;
      ctx.globalAlpha = b & 1 ? 0.75 : 0.42;
      ctx.fillStyle = SHADE_CSS[t];
      ctx.beginPath();
      for (let i = base; i < base + count; i += 4)
        ctx.rect(chipRects[i] + 0.9, chipRects[i + 1] + 0.9, chipRects[i + 2], chipRects[i + 3]);
      ctx.fill();
      ctx.fillStyle = TONE_CSS[t];
      ctx.beginPath();
      for (let i = base; i < base + count; i += 4)
        ctx.rect(chipRects[i], chipRects[i + 1], chipRects[i + 2], chipRects[i + 3]);
      ctx.fill();
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
    if (bokeh && Z[slot] > 0.85) {
      sx = BKX[t];
      sy = BKY[t];
      draw = size * 1.6;
      alpha = 0.35;
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
    ctx.drawImage(cometSheet, 32 * a, 32 * row, 32, 32, X[slot] - draw / 2, Y[slot] - draw / 2, draw, draw);
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
    let stagedCount = 0;
    const cap = coarse ? STAGED_TOUCH : STAGED_MAX;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      const active = !pc.helm && q >= pc.from && q < pc.stageEnd;
      jigFor(p, q, !active || stagedCount < cap);
      if (active && stagedCount < cap) stagedCount += 1;
    }
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
    nBack = nMid = nFront = nFlight = nImplode = 0;
    let visible = 0;
    for (let b = 0; b < NP * 2; b += 1) {
      beamI[b] = -1;
      beamU[b] = -1;
    }
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
      if (kind >= 4) {
        flightList[nFlight++] = i;
        const u = U[i];
        const p = PO[i];
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
      if (KIND[slot] === 8) implodeList[nImplode++] = slot;
      else if (Z[slot] < -0.15) backList[nBack++] = slot;
      else if (Z[slot] <= 0.35) midList[nMid++] = slot;
      else frontList[nFront++] = slot;
    }
    // The far band takes what the sprite budget leaves.
    const near = visible - nBack;
    keep = nBack ? Math.min(1, Math.max(0, ASSEMBLY_SPRITE_BUDGET - fxReserve - near) / nBack) : 1;
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
  const guideHolo = () => (holo ? holo : frameSheet);
  const guideFace = () => (face ? face : frameSheet);
  const guideWalls = () => (walls ? walls : face ? null : frameDeep);
  const atlasGuide = () => Boolean(face || holo);

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
      for (let kk = painted; kk < n && PAINT[kk] <= q + 0.0125; kk += 1) {
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
    if (coarse) {
      batchN = 0;
      for (let kk = first; kk < painted; kk += 1) {
        const i = ORDER[kk];
        pushRect(batch, batchN, SX[i], SY[i], TW[i], TH[i]);
        batchN += 4;
      }
      fillBatch(ctx, batch, batchN, "rgb(214 248 255)", 0.25);
      ctx.globalAlpha = 1;
      return;
    }
    // The lacquer: the art in nanite light, added over the fresh paint in
    // three age bands, brightest at the front, so it sweeps rather than
    // stamps cells.
    for (let src = 0; src < 2; src += 1) {
      const sheet = motes[src] || motes[1] || motes[0];
      if (!sheet) continue;
      for (let age = 0; age < 3; age += 1) {
        const newest = q - (age * N.lacquer) / 3;
        const oldest = q - ((age + 1) * N.lacquer) / 3;
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
          ctx.globalAlpha = 0.55 - 0.17 * age;
          ctx.drawImage(sheet, 0, 0, W, H);
          ctx.restore();
        }
      }
    }
  };

  /* 6: the molten band and the cooling cells (G6, G7), over the gold. */
  const moltenPass = (ctx) => {
    if (!gold || !molten || !goldCount) return;
    const q = Q;
    const head = goldBy(q);
    const band0 = goldBy(q - 0.004);
    const cool0 = goldBy(q - 0.012);
    if (cool0 < band0) {
      ctx.save();
      ctx.beginPath();
      for (let i = cool0; i < band0; i += 1) ctx.rect(gold.x[i], gold.y[i], gold.w[i], gold.h[i]);
      ctx.clip();
      ctx.globalAlpha = 0.45;
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

  // The pulses (G2) of plate p's unpoured cells, into `batch`.
  const pulses = (p) => {
    const pc = P[p];
    const q = Q;
    for (let kk = pc.goldFirst; kk < pc.goldEnd; kk += 1) {
      const i = GIDX[kk];
      if (gold.lock[i] <= q) continue;
      const flow = (gold.lock[i] - pc.g0) / pc.span;
      let v = (7 * flow - 150 * q) % 1;
      if (v < 0) v += 1;
      if (v >= 0.16 || batchN >= batchCap * 4 - 4) continue;
      const s = 0.6 * goldCell;
      pushRect(batch, batchN, gold.x[i] + (gold.w[i] - s) / 2, gold.y[i] + (gold.h[i] - s) / 2, s, s);
      batchN += 4;
    }
  };

  /* 8: before contact, each trim's hologram on the body (G1), its scan
     plane, and the pulses (G2). */
  const hologramPass = (ctx) => {
    const sheet = guideHolo();
    if (!sheet && !gold) return;
    const q = Q;
    const atlas = atlasGuide();
    const wallSheet = coarse ? null : guideWalls();
    batchN = 0;
    let plates = 0;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      const start = pc.from - N.lead;
      if (q < start || q >= pc.contact) continue;
      if (coarse && (plates >= TOUCH_CONDUITS || conduitDraws >= TOUCH_CONDUITS * 2)) continue;
      const u = (q - start) / N.sweep;
      const rise = easeOut(clamp01(u));
      const alpha = 0.9 * clamp01(u * 4);
      const [bx, by, bw, bh] = pc.gbox;
      const sweep = by + bh * rise;
      const rows = sweep - pc.y;
      if (sheet && rows > 0) {
        plates += 1;
        if (wallSheet) {
          const angle = Math.PI / 4 - 0.5;
          ctx.globalAlpha = 0.35 * alpha;
          plateDraw(ctx, wallSheet, atlas, p, 2.2 * Math.cos(angle), 2.2 * Math.sin(angle), rows);
        }
        ctx.globalAlpha = alpha;
        plateDraw(ctx, sheet, atlas, p, 0, 0, rows);
        conduitDraws += 1;
      }
      if (!CALM && u < 1) {
        // The scan plane: a perspective ice grid sweeping down the site.
        const fade = 1 - clamp01(u);
        if (fxSheet && !coarse) {
          const dh = 0.4 * bh;
          ctx.globalAlpha = 0.85 * Math.sqrt(fade) * clamp01(u * 6);
          ctx.drawImage(fxSheet, SCN.x, SCN.y, SCN.w, SCN.h, bx, sweep - dh * (SCN.edgeY / SCN.h), bw, dh);
          sprites_ += 1;
        } else {
          ctx.fillStyle = TONE_CSS[0];
          ctx.globalAlpha = 0.18 * fade;
          ctx.fillRect(bx, sweep - 10, bw, 10);
          ctx.globalAlpha = 0.6 * fade;
          ctx.fillStyle = TONE_CSS[2];
          ctx.fillRect(bx, sweep - 0.6, bw, 1.2);
        }
      }
      if (!CALM && gold && q >= pc.from - 0.028) pulses(p);
    }
    fillBatch(ctx, batch, batchN, "rgb(236 252 255)", 0.8);
    ctx.globalAlpha = 1;
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
        ctx.globalAlpha = 0.9;
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

  /* 11: after contact, the conduit: printed from the hologram (G4), its
     walls turning with the scroll (G5), receding behind the pour (G7). */
  const conduitPass = (ctx) => {
    if (!gold) return;
    const faceSheet = guideFace();
    const holoSheet = guideHolo();
    if (!faceSheet) return;
    const wallSheet = coarse ? null : guideWalls();
    const atlas = atlasGuide();
    const q = Q;
    batchN = 0;
    let plates = 0;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      if (q < pc.contact || q >= pc.recedeEnd || pc.goldEnd <= pc.goldFirst) continue;
      if (coarse && (plates >= TOUCH_CONDUITS || conduitDraws >= TOUCH_CONDUITS * 2)) continue;
      plates += 1;
      const front = (q - pc.contact) / N.print;
      const turn = Math.PI / 4 + 0.5 * Math.max(-1, Math.min(1, (q - pc.contact) / 0.05));
      const dx = 2.2 * Math.cos(turn);
      const dy = 2.2 * Math.sin(turn);
      let first = pc.goldFirst;
      let cut = pc.goldEnd;
      if (front < 1) cut = goldAfter(p, pc.g0 + front * pc.span);
      else first = goldAfter(p, q - 0.012);
      if (cut > first) {
        ctx.save();
        goldClip(ctx, first, cut);
        if (wallSheet) {
          ctx.globalAlpha = 0.7;
          plateDraw(ctx, wallSheet, atlas, p, 0.5 * dx, 0.5 * dy, pc.h);
          ctx.globalAlpha = 0.45;
          plateDraw(ctx, wallSheet, atlas, p, dx, dy, pc.h);
        }
        ctx.globalAlpha = 1;
        plateDraw(ctx, faceSheet, atlas, p, 0, 0, pc.h);
        conduitDraws += 1;
        ctx.restore();
      }
      if (front < 1) {
        if (holoSheet && pc.goldEnd > cut && (!coarse || conduitDraws < TOUCH_CONDUITS * 2)) {
          ctx.save();
          goldClip(ctx, cut, pc.goldEnd);
          ctx.globalAlpha = 0.9;
          plateDraw(ctx, holoSheet, atlas, p, 0, 0, pc.h);
          conduitDraws += 1;
          ctx.restore();
        }
        // The print head: laser-weld dots on the cells just printed.
        if (!CALM)
          for (let kk = pc.goldFirst; kk < cut; kk += 1) {
            const i = GIDX[kk];
            const flow = (gold.lock[i] - pc.g0) / pc.span;
            if (flow <= front - 0.05 || batchN >= batchCap * 4 - 4) continue;
            pushRect(batch, batchN, gold.x[i] + gold.w[i] / 2 - 1, gold.y[i] + gold.h[i] / 2 - 1, 2, 2);
            batchN += 4;
          }
      }
    }
    fillBatch(ctx, batch, batchN, "rgb(240 253 255)", 0.95);
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
      const start = pc.from - N.lead;
      if (q < start || q >= pc.contact + 0.01) continue;
      latches += 1;
      const appear = clamp01((q - start) / 0.006);
      const fade = q > pc.contact + 0.004 ? 1 - (q - pc.contact - 0.004) / 0.006 : 1;
      let f;
      if (q < pc.contact - 0.003) f = Math.floor((q - start) / 0.004) % 6;
      else if (q < pc.contact) f = 6 + Math.min(5, Math.floor(((q - pc.contact + 0.003) / 0.003) * 6));
      else f = 11;
      const size = (pc.accent || pc.crest ? 32 : 26) * (0.6 + 0.4 * appear);
      const alpha = appear * fade;
      if (alpha <= 0) continue;
      if (fxSheet && !coarse) {
        const draw = size * 1.35;
        ctx.globalAlpha = alpha;
        ctx.drawImage(fxSheet, LT.x + LT.cell * f, LT.y, LT.cell, LT.cell, pc.seatX - draw / 2, pc.seatY - draw / 2, draw, draw);
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
    // The clamps: one per gold-box corner, swinging in, biting, releasing.
    strokes = false;
    for (let p = 0; p < NP; p += 1) {
      const pc = P[p];
      if (!pc.hasGoldBox || pc.helm) continue;
      const start = pc.to - N.clampIn;
      const relStart = pc.recedeEnd;
      if (q < start || q >= relStart + N.release) continue;
      let f;
      let drift = 0;
      let alpha = 1;
      if (q < pc.to - 0.006) f = Math.min(7, Math.floor(((q - start) / 0.01) * 8));
      else if (q < pc.contact - 0.002) f = 7;
      else if (q < pc.contact + 0.002) f = 8 + Math.min(3, Math.floor(((q - pc.contact + 0.002) / 0.004) * 4));
      else if (q < relStart) f = 11;
      else {
        const r = (q - relStart) / N.release;
        f = Math.max(0, 11 - Math.floor(r * 12));
        drift = smooth(r);
        alpha = 1 - r;
      }
      const [bx, by, bw, bh] = pc.gbox;
      const kk = Math.max(0.3, Math.min(0.6, Math.min(bw, bh) / 80));
      const draw = CL.cell * kk;
      for (let c = 0; c < 4; c += 1) {
        const sxn = c & 1 ? 1 : -1;
        const syn = c & 2 ? 1 : -1;
        const cx = (sxn > 0 ? bx + bw : bx) + sxn * 0.4 * (bw / 2) * drift;
        const cy = (syn > 0 ? by + bh : by) + syn * 0.4 * (bh / 2) * drift;
        if (fxSheet && !coarse) {
          ctx.globalAlpha = alpha;
          ctx.drawImage(fxSheet, CL.x + CL.cell * f, CL.y + CL.cell * c, CL.cell, CL.cell, cx - CLAX[c] * kk, cy - CLAY[c] * kk, draw, draw);
          sprites_ += 1;
        } else {
          if (!strokes) {
            ctx.beginPath();
            strokes = true;
          }
          const arm = draw * 0.32 * (f < 8 ? 0.4 + (0.6 * f) / 7 : 1);
          const ox = cx + sxn * 1.5;
          const oy = cy + syn * 1.5;
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
      const reserve = conduitDraws + (cells ? chips : 0) + TOUCH_RINGS;
      budget = Math.max(0, Math.min(arts, touchArtBudget - reserve));
    }
    let drawnArts = 0;
    let seenArts = 0;
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
        const take = budget >= arts || Math.floor((drawnArts * arts) / Math.max(1, budget)) === slot;
        if (take && drawnArts < budget) {
          drawnArts += 1;
          const w = TW[i] * (0.7 + 0.3 * g);
          const h = TH[i] * (0.7 + 0.3 * g);
          ctx.globalAlpha = g;
          ctx.drawImage(metalOf(SRC[i]), SX[i], SY[i], TW[i], TH[i], X[i] - w / 2, Y[i] - h / 2, w, h);
        } else rectChip(i, true);
      }
    }
    flushChips(ctx);
    if (coarse || CALM) {
      ctx.globalAlpha = 1;
      return;
    }
    // The recoil: each just-locked tile, alone over its plate, rings.
    const landed = landedBy(q);
    for (let i = landedBy(q - N.recoil); i < landed; i += 1) {
      const p = PO[i];
      const t = (q - T1[i]) / N.recoil;
      const scale = 1 + 0.14 * Math.exp(-5 * t) * Math.cos(9.4 * t);
      const cx = p >= 0 ? jigX(p, CX[i], CY[i]) : CX[i];
      const cy = p >= 0 ? jigY(p, CX[i], CY[i]) : CY[i];
      const w = TW[i] * scale;
      const h = TH[i] * scale;
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
        ctx.lineTo(SEAMX[i0] + (SEAMX[i1] - SEAMX[i0]) * t, SEAMY[i0] + (SEAMY[i1] - SEAMY[i0]) * t);
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
        const u = 1 - (gold.lock[i] - q) / approach;
        const e = smooth(clamp01(u));
        const size = G * (0.9 + 0.7 * e);
        const x = gold.x[i] + gold.w[i] / 2 + gold.ux[i] * (1 - u);
        const y = gold.y[i] + gold.h[i] / 2 + gold.uy[i] * (1 - u);
        let f = Math.floor(24 * GHASH[i] + 30 * u) % 24;
        if (f < 0) f += 24;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(cells, MIPX[3] + 16 * f, MIPY[3], 16, 16, x - size / 2, y - size / 2, size, size);
        sprites_ += 1;
      }
    }
    if (CALM) return;
    // Droplets: oriented along the flow, rounding off as they settle.
    let drops = 0;
    const dropStart = goldBy(q - 0.0016);
    const head = goldBy(q);
    for (let i = dropStart; i < head && drops < DROP_MAX; i += 1) {
      const age = (q - gold.lock[i]) / 0.0016;
      const size = 1.4 * G;
      const cx = gold.x[i] + gold.w[i] / 2;
      const cy = gold.y[i] + gold.h[i] / 2;
      drops += 1;
      if (age >= 0.75 && cells) {
        const f = Math.floor(GHASH[i] * 8 + age * 8) % 8;
        const draw = size * 1.6;
        ctx.globalAlpha = 1 - (age - 0.75) * 2;
        ctx.drawImage(cells, BEADX + 32 * f, BEADY, 32, 32, cx - draw / 2, cy - draw / 2, draw, draw);
      } else if (fxSheet) {
        let a = Math.round(Math.atan2(-gold.uy[i], -gold.ux[i]) / (Math.PI / 8)) % 8;
        if (a < 0) a += 8;
        const e = age < 0.25 ? 2 : age < 0.5 ? 1 : 0;
        const draw = size * 2.2;
        ctx.globalAlpha = 1;
        ctx.drawImage(fxSheet, DRP.x + DRP.cell * a, DRP.y + DRP.cell * e, DRP.cell, DRP.cell, cx - draw / 2, cy - draw / 2, draw, draw);
      }
      sprites_ += 1;
    }
    // One lock in twenty throws a spark.
    if (cells) {
      for (let i = goldBy(q - 0.004); i < head; i += 1) {
        if (GHASH[i] >= 0.05) continue;
        const f = Math.min(3, Math.floor(((q - gold.lock[i]) / 0.004) * 4));
        const draw = 5 * G;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(cells, SPX + 32 * f, SPY, 32, 32, gold.x[i] + gold.w[i] / 2 - draw / 2, gold.y[i] + gold.h[i] / 2 - draw / 2, draw, draw);
        sprites_ += 1;
      }
      // The recede front: one cell in four sheds a chip that rises and fades.
      const recEnd = goldBy(q - 0.012);
      for (let i = goldBy(q - 0.016); i < recEnd; i += 1) {
        if (GHASH[i] >= 0.25) continue;
        const t = (q - 0.012 - gold.lock[i]) / 0.004;
        const rise = (6 + 4 * GHASH[i] * 4) * t;
        const size = G * 1.2;
        let f = Math.floor(24 * GHASH[i] * 4 + 40 * t) % 24;
        if (f < 0) f += 24;
        ctx.globalAlpha = 0.9 * (1 - t);
        ctx.drawImage(cells, MIPX[3] + 16 * f, MIPY[3], 16, 16, gold.x[i] + gold.w[i] / 2 - size / 2, gold.y[i] - rise - size / 2, size, size);
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
    for (let c = 0; c < nImplode; c += 1) {
      const slot = implodeList[c];
      if (rich) spriteChip(ctx, slot, 1, false);
      else rectChip(slot, true);
    }
    flushChips(ctx);
    ctx.globalAlpha = 1;
  };
  // The frame's tally: the next frame's effect reserve, and the counts.
  const endFrame = () => {
    fxReserve = Math.max(160, sprites_ - (nBack + nMid + nFront));
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
