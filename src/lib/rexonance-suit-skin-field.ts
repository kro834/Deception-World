/* REXONANCE SKIN, the bake (see rexonance-suit-skin.ts): the growth field
   the skin's front is compared against, computed from the art's alpha and
   the suit's plates. It runs offline (scripts/build-rexonance-skin.mjs
   writes the picture the page loads) and in the tests; the page itself
   never imports this file. Pure: typed arrays in and out, no imports. */

/** The field picture's size for the 571 x 1040 figure (a third). */
export const SKIN_FIELD_SIZE = { width: 191, height: 347 } as const;
/** The blue channel: the armour's mask. */
export const SKIN_MASK = { body: 128, head: 255, bodyEdge: 96, headEdge: 224 } as const;

/* ---------------- regions ---------------- */

export const SKIN_REGION = {
  torso: 0,
  arms: 1,
  legs: 2,
  hands: 3,
  feet: 4,
  jaw: 5,
  head: 6,
  face: 7,
  tail: 8,
  ribbon: 9,
  none: 255,
} as const;

/** A plate's region, from its id (rexonance-suit.ts REXONANCE_SUIT_PIECES). */
export function skinRegionOf(id: string) {
  if (id.startsWith("helmet-visor")) return SKIN_REGION.face;
  if (id.startsWith("helmet-jaw")) return SKIN_REGION.jaw;
  if (id.startsWith("helmet")) return SKIN_REGION.head;
  if (id.startsWith("arm-fist")) return SKIN_REGION.hands;
  if (id.startsWith("boot-foot")) return SKIN_REGION.feet;
  if (id.startsWith("arm") || id.startsWith("shoulder")) return SKIN_REGION.arms;
  if (id.startsWith("thigh") || id.startsWith("knee") || id.startsWith("boot"))
    return SKIN_REGION.legs;
  if (id.startsWith("tail")) return SKIN_REGION.tail;
  if (id.startsWith("ribbon")) return SKIN_REGION.ribbon;
  return SKIN_REGION.torso;
}

const isHead = (region: number) =>
  region === SKIN_REGION.jaw || region === SKIN_REGION.head || region === SKIN_REGION.face;

export type SkinPlate = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Its micro-tile bitmask (base64, rows of ceil(w / tile) bits). */
  tiles: string;
};

/** The plates' regions on a w x h grid over a figure of `width` px (front
 * plates first: the first plate over a cell names it). */
export function skinRegions(
  plates: readonly SkinPlate[],
  tile: number,
  width: number,
  w: number,
  h: number,
) {
  const out = new Uint8Array(w * h).fill(SKIN_REGION.none);
  const k = w / width;
  for (const plate of plates) {
    const region = skinRegionOf(plate.id);
    const bits = Uint8Array.from(atob(plate.tiles), (c) => c.charCodeAt(0));
    const cols = Math.ceil(plate.w / tile);
    const rows = Math.ceil(plate.h / tile);
    for (let row = 0; row < rows; row += 1)
      for (let col = 0; col < cols; col += 1) {
        const bit = row * cols + col;
        if (!(bits[bit >> 3] & (1 << (bit & 7)))) continue;
        const x0 = Math.max(0, Math.floor((plate.x + col * tile) * k));
        const y0 = Math.max(0, Math.floor((plate.y + row * tile) * k));
        const x1 = Math.min(
          w,
          Math.ceil(Math.min(plate.x + plate.w, plate.x + (col + 1) * tile) * k),
        );
        const y1 = Math.min(
          h,
          Math.ceil(Math.min(plate.y + plate.h, plate.y + (row + 1) * tile) * k),
        );
        for (let y = y0; y < y1; y += 1)
          for (let x = x0; x < x1; x += 1)
            if (out[y * w + x] === SKIN_REGION.none) out[y * w + x] = region;
      }
  }
  return out;
}

/* ---------------- the field ---------------- */

const hash2 = (x: number, y: number) => {
  const h = Math.imul(Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263), 1274126177) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
const valueNoise = (x: number, y: number) => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
/** Two octaves, zero mean. */
const fbm = (x: number, y: number) =>
  (valueNoise(x, y) - 0.5) * 0.66 + (valueNoise(x * 2.03 + 17, y * 2.03 + 5) - 0.5) * 0.34;

/** A binary heap of cells by distance. */
class Heap {
  private keys: Float32Array;
  private cells: Int32Array;
  size = 0;
  constructor(capacity: number) {
    this.keys = new Float32Array(capacity);
    this.cells = new Int32Array(capacity);
  }
  push(key: number, cell: number) {
    if (this.size >= this.keys.length) {
      const keys = new Float32Array(this.keys.length * 2);
      keys.set(this.keys);
      this.keys = keys;
      const cells = new Int32Array(this.cells.length * 2);
      cells.set(this.cells);
      this.cells = cells;
    }
    let i = this.size;
    this.size += 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= key) break;
      this.keys[i] = this.keys[parent];
      this.cells[i] = this.cells[parent];
      i = parent;
    }
    this.keys[i] = key;
    this.cells[i] = cell;
  }
  /** Pops the nearest cell into `out` ([key, cell]). */
  pop(out: Float64Array) {
    out[0] = this.keys[0];
    out[1] = this.cells[0];
    this.size -= 1;
    const key = this.keys[this.size];
    const cell = this.cells[this.size];
    let i = 0;
    for (;;) {
      let child = i * 2 + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) child += 1;
      if (this.keys[child] >= key) break;
      this.keys[i] = this.keys[child];
      this.cells[i] = this.cells[child];
      i = child;
    }
    this.keys[i] = key;
    this.cells[i] = cell;
  }
}

export type SkinFieldInput = {
  /** The grid, and the art's alpha and each cell's region on it. */
  w: number;
  h: number;
  alpha: Uint8Array | Uint8ClampedArray;
  region: Uint8Array;
  /** The reactor and the visor, in cells. */
  core: readonly [number, number];
  visor: readonly [number, number];
  /** Satellite seeds: x, y (cells) and its delay as a share of the body. */
  satellites?: ReadonlyArray<readonly [number, number, number]>;
};

export type SkinBake = {
  w: number;
  h: number;
  /** RGB, w x h (see the end of buildSkinField). */
  texture: Uint8ClampedArray;
  /** The field itself, 0–1 per cell (-1 outside the armour), and whether the
   * cell is the head's. */
  field: Float32Array;
  head: Uint8Array;
};

const NEIGHBOURS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;
const HAND_FOOT_OFFSET = 0.04;
/** The head's field: the skull rises over the first share, the face closes
 * over the rest. */
export const SKIN_FACE_FROM = 0.72;

/** Bakes the growth field (see the header). Pure: typed arrays in and out. */
export function buildSkinField(input: SkinFieldInput): SkinBake {
  const { w, h, alpha } = input;
  const size = w * h;
  const inside = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) inside[i] = alpha[i] > 127 ? 1 : 0;
  // Cells of the armour no plate names (the bodysuit between the plates)
  // take the nearest plate's region.
  const region = Uint8Array.from(input.region);
  {
    const queue = new Int32Array(size);
    let headAt = 0;
    let tail = 0;
    for (let i = 0; i < size; i += 1)
      if (inside[i] && region[i] !== SKIN_REGION.none) queue[tail++] = i;
    while (headAt < tail) {
      const i = queue[headAt++];
      const x = i % w;
      const y = (i - x) / w;
      for (let n = 0; n < 4; n += 1) {
        const nx = x + NEIGHBOURS[n][0];
        const ny = y + NEIGHBOURS[n][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!inside[j] || region[j] !== SKIN_REGION.none) continue;
        region[j] = region[i];
        queue[tail++] = j;
      }
    }
    for (let i = 0; i < size; i += 1)
      if (inside[i] && region[i] === SKIN_REGION.none) region[i] = SKIN_REGION.torso;
  }
  const head = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) head[i] = inside[i] && isHead(region[i]) ? 1 : 0;
  // The plates' masks are in 9 px tiles: round the head's boundary off (a
  // majority over 5 x 5, twice), or the collar shows as a staircase while
  // the body is on and the helmet has not risen.
  for (let pass = 0; pass < 2; pass += 1) {
    const from = Uint8Array.from(head);
    for (let y = 2; y < h - 2; y += 1)
      for (let x = 2; x < w - 2; x += 1) {
        const i = y * w + x;
        if (!inside[i]) continue;
        let heads = 0;
        let cells = 0;
        for (let dy = -2; dy <= 2; dy += 1)
          for (let dx = -2; dx <= 2; dx += 1) {
            const j = i + dy * w + dx;
            if (!inside[j]) continue;
            cells += 1;
            heads += from[j];
          }
        head[i] = heads * 2 > cells ? 1 : 0;
      }
  }

  // The body: geodesic distance inside the armour from the reactor and the
  // satellites. The tail is entered only from the torso, the legs and the
  // ribbons (it passes behind the shoulder in the picture), and runs faster
  // (it is long: it must not make the body wait).
  const dist = new Float32Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const heap = new Heap(size);
  const nearestBody = (cx: number, cy: number) => {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < size; i += 1) {
      if (!inside[i] || head[i]) continue;
      const dx = (i % w) - cx;
      const dy = Math.floor(i / w) - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const span = h * 0.8;
  const seed = nearestBody(input.core[0], input.core[1]);
  if (seed >= 0) {
    dist[seed] = 0;
    heap.push(0, seed);
  }
  for (const [sx, sy, delay] of input.satellites ?? []) {
    const cell = nearestBody(sx, sy);
    if (cell < 0 || dist[cell] <= delay * span) continue;
    dist[cell] = delay * span;
    heap.push(dist[cell], cell);
  }
  const popped = new Float64Array(2);
  const relax = (through: boolean) => {
    while (heap.size) {
      heap.pop(popped);
      const d = popped[0];
      const i = popped[1];
      if (d > dist[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      for (let n = 0; n < 8; n += 1) {
        const nx = x + NEIGHBOURS[n][0];
        const ny = y + NEIGHBOURS[n][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (head[j]) continue;
        let cost = NEIGHBOURS[n][2];
        if (inside[j]) {
          if (region[j] === SKIN_REGION.tail) {
            if (
              inside[i] &&
              region[i] !== SKIN_REGION.tail &&
              region[i] !== SKIN_REGION.torso &&
              region[i] !== SKIN_REGION.legs &&
              region[i] !== SKIN_REGION.ribbon
            )
              continue;
            cost *= 0.55;
          }
          // The second pass only reaches what the first could not.
          if (through && dist[j] !== Infinity && !inside[i]) {
            if (d + cost >= dist[j]) continue;
          }
        } else {
          if (!through) continue;
          cost *= 2.5;
        }
        const next = d + cost;
        if (next < dist[j]) {
          dist[j] = next;
          parent[j] = i;
          heap.push(next, j);
        }
      }
    }
  };
  relax(false);
  // Islands (a ribbon's tip, a tail segment the picture separates): reached
  // across the gap, from the nearest armour already reached.
  let stranded = false;
  for (let i = 0; i < size; i += 1)
    if (inside[i] && !head[i] && dist[i] === Infinity) {
      stranded = true;
      break;
    }
  if (stranded) {
    for (let y = 1; y < h - 1; y += 1)
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        if (!inside[i] || head[i] || dist[i] === Infinity) continue;
        if (inside[i - 1] && inside[i + 1] && inside[i - w] && inside[i + w]) continue;
        heap.push(dist[i], i);
      }
    relax(true);
  }
  let far = 1;
  for (let i = 0; i < size; i += 1)
    if (inside[i] && !head[i] && dist[i] !== Infinity && dist[i] > far) far = dist[i];

  const field = new Float32Array(size).fill(-1);
  for (let i = 0; i < size; i += 1) {
    if (!inside[i] || head[i]) continue;
    const d = dist[i] === Infinity ? far : dist[i];
    let t = (d / far) * (1 - HAND_FOOT_OFFSET);
    if (region[i] === SKIN_REGION.hands || region[i] === SKIN_REGION.feet) t += HAND_FOOT_OFFSET;
    field[i] = t;
  }

  // The veins: the flow's own paths back from each extremity (the farthest
  // cell of each hand, foot, the tail and each side's ribbon) to its seed.
  const vein = new Float32Array(size);
  {
    const targets: number[] = [];
    const mid = input.core[0];
    for (const [target, sides] of [
      [SKIN_REGION.hands, 2],
      [SKIN_REGION.feet, 2],
      [SKIN_REGION.ribbon, 2],
      [SKIN_REGION.tail, 1],
    ] as const)
      for (let side = 0; side < sides; side += 1) {
        let best = -1;
        for (let i = 0; i < size; i += 1) {
          if (!inside[i] || region[i] !== target || dist[i] === Infinity) continue;
          if (sides === 2 && i % w < mid !== (side === 0)) continue;
          if (best < 0 || dist[i] > dist[best]) best = i;
        }
        if (best >= 0) targets.push(best);
      }
    for (const target of targets) {
      let i = target;
      let guard = size;
      while (i >= 0 && guard > 0) {
        guard -= 1;
        if (inside[i]) vein[i] = 1;
        i = parent[i];
      }
    }
    // Soften across one cell each side.
    const soft = new Float32Array(size);
    for (let y = 1; y < h - 1; y += 1)
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        if (!inside[i]) continue;
        let most = vein[i];
        for (let n = 0; n < 8; n += 1)
          most = Math.max(most, vein[i + NEIGHBOURS[n][1] * w + NEIGHBOURS[n][0]] * 0.55);
        soft[i] = most;
      }
    vein.set(soft);
  }

  // The head: the skull rises from the neck (the sides a little ahead), then
  // the face closes from the jaw and both sides toward the visor.
  {
    let top = h;
    let bottom = 0;
    let left = w;
    let right = 0;
    let faceTop = h;
    let faceBottom = 0;
    let faceHalf = 1;
    for (let i = 0; i < size; i += 1) {
      if (!head[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
      if (region[i] === SKIN_REGION.face) {
        faceTop = Math.min(faceTop, y);
        faceBottom = Math.max(faceBottom, y);
        faceHalf = Math.max(faceHalf, Math.abs(x - input.visor[0]));
      }
    }
    const tall = Math.max(1, bottom - top);
    const half = Math.max(1, (right - left) / 2);
    const centre = (left + right) / 2;
    const faceTall = Math.max(1, faceBottom - faceTop);
    const faceReach = Math.hypot(faceHalf, faceTall) || 1;
    const closeOf = (x: number, y: number) => {
      const side = 1 - Math.abs(x - input.visor[0]) / faceHalf;
      const up = ((faceBottom - y) / faceTall) * 1.2;
      const iris = 1 - Math.hypot(x - input.visor[0], y - input.visor[1]) / faceReach;
      return 0.45 * Math.min(side, up) + 0.55 * iris;
    };
    let closed = 1e-6;
    for (let i = 0; i < size; i += 1)
      if (head[i] && region[i] === SKIN_REGION.face)
        closed = Math.max(closed, closeOf(i % w, Math.floor(i / w)));
    for (let i = 0; i < size; i += 1) {
      if (!head[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (region[i] === SKIN_REGION.face) {
        const close = closeOf(x, y) / closed;
        field[i] = SKIN_FACE_FROM + (1 - SKIN_FACE_FROM) * Math.min(1, Math.max(0, close));
      } else {
        const rise = (bottom - y) / tall;
        const sides = 1 - Math.abs(x - centre) / half;
        field[i] = SKIN_FACE_FROM * Math.min(1, Math.max(0, rise * 0.86 + sides * 0.14));
      }
    }
  }

  // The fingered edge, and the veins' lead.
  for (let i = 0; i < size; i += 1) {
    if (!inside[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    const u = x / h;
    const v = y / h;
    const k = head[i] ? 0.5 : 1;
    let t = field[i] + k * (0.035 * fbm(u * 12, v * 12) * 2 + 0.012 * fbm(u * 48 + 9, v * 48) * 2);
    t -= 0.05 * vein[i] * Math.min(1, field[i] * 6);
    // The seed itself is the front's first cell.
    field[i] = Math.min(1, Math.max(0, t));
  }

  // The texture, RGB (an opaque picture: a browser must never premultiply
  // it): R the field dithered to 8 bits, G the veins, B the armour's mask
  // (SKIN_MASK: the body, the head, and their edges). Outside the armour the
  // nearest cell's field, three cells out, so the art's own
  // crisp edge can be the mask with no early fringe.
  const texture = new Uint8ClampedArray(size * 3);
  const filled = new Float32Array(field);
  const headFilled = Uint8Array.from(head);
  for (let pass = 0; pass < 3; pass += 1) {
    const from = new Float32Array(filled);
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        if (from[i] >= 0) continue;
        let sum = 0;
        let count = 0;
        let heads = 0;
        for (let n = 0; n < 8; n += 1) {
          const nx = x + NEIGHBOURS[n][0];
          const ny = y + NEIGHBOURS[n][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (from[j] < 0) continue;
          sum += from[j];
          count += 1;
          heads += headFilled[j];
        }
        if (!count) continue;
        filled[i] = sum / count;
        headFilled[i] = heads * 2 > count ? 1 : 0;
      }
  }
  for (let i = 0; i < size; i += 1) {
    const o = i * 3;
    const t = filled[i] < 0 ? 1 : filled[i];
    texture[o] = Math.round(t * 255 + (hash2(i % w, Math.floor(i / w)) - 0.5) * 0.9);
    texture[o + 1] = Math.round(vein[i] * 255);
    texture[o + 2] = inside[i]
      ? head[i]
        ? SKIN_MASK.head
        : SKIN_MASK.body
      : filled[i] < 0
        ? 0
        : headFilled[i]
          ? SKIN_MASK.headEdge
          : SKIN_MASK.bodyEdge;
  }
  return { w, h, texture, field, head };
}
