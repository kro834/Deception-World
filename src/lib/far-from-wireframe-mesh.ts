/** FAR FROM SAGA — the wireframe's meshes (2026-10-23; owner: 「また、
 * ファーフロムはワイヤーフレーム風の生成方式を採るように。」).
 *
 * The geometry both sides share: scripts/build-far-from-wireframe.mjs makes
 * each mesh's vertices (a plate's real outline, then its interior, dense
 * where its art has edges) and stores them here encoded
 * (src/lib/far-from-wireframe.ts); the scene decodes them and triangulates
 * them with this same code, so the triangles it draws are exactly the ones
 * the build checked (every outline segment an edge, every triangle inside
 * the outline or wholly outside it).
 *
 * Vertices are integers: figure px × FAR_FROM_WIREFRAME_UNIT. Orientation
 * and in-circle run in doubles and are recomputed exactly (BigInt) where
 * the double result is too close to call, so the triangulation is the same
 * on every engine. Pure functions, no DOM.
 *
 * Encoding (bytes, then base64): varints — the loop count, each loop's
 * vertex count, the interior's count — then every vertex as zigzag varint
 * deltas (x, y) from the one before it, the loops' first (in order along
 * each loop), then the interior's.
 */

/** Mesh coordinates are figure px times this (quarter px). */
export const WIRE_UNIT = 4;

/** The suit a set of meshes was made from: its plates as FAR_FROM_SUIT_PIECES
 * lists them (ids, groups, boxes, atlas cells, micro-tiles), hashed (FNV-1a,
 * 64 bits as two 32-bit halves): the build stores it, the tests and the
 * scene compare it with the suit they have. */
export function wireSuitFingerprint(
  pieces: readonly {
    readonly id: string;
    readonly group: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly ax?: number;
    readonly ay?: number;
    readonly tiles?: string;
  }[],
): string {
  const text = JSON.stringify(
    pieces.map(({ id, group, x, y, w, h, ax, ay, tiles }) => [id, group, x, y, w, h, ax, ay, tiles]),
  );
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c ^ (h1 >>> 7), 0x0100019d) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export type WireMesh = {
  /** Vertex coordinates (figure px × unit). */
  readonly xs: Int32Array;
  readonly ys: Int32Array;
  /** Each loop's first vertex and its count (the loops come first). */
  readonly loopStart: Int32Array;
  readonly loopCount: Int32Array;
  /** Vertices on a loop (the outline), the rest are interior. */
  readonly outline: number;
};

/* ------------------------------------------------------------- encoding */

const zigzag = (value: number) => (value < 0 ? -value * 2 - 1 : value * 2);
const unzigzag = (value: number) => (value & 1 ? -(value + 1) / 2 : value / 2);

/** The bytes of a mesh (the build's). */
export function encodeWireMesh(
  loops: readonly (readonly (readonly [number, number])[])[],
  interior: readonly (readonly [number, number])[],
): Uint8Array {
  const bytes: number[] = [];
  const put = (value: number) => {
    if (!Number.isInteger(value) || value < 0) throw new Error(`varint ${value}`);
    let v = value;
    while (v >= 0x80) {
      bytes.push((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    bytes.push(v);
  };
  put(loops.length);
  for (const loop of loops) put(loop.length);
  put(interior.length);
  let px = 0;
  let py = 0;
  for (const points of [...loops, interior])
    for (const [x, y] of points) {
      put(zigzag(x - px));
      put(zigzag(y - py));
      px = x;
      py = y;
    }
  return Uint8Array.from(bytes);
}

const decodeBase64 = (text: string): Uint8Array => {
  if (typeof atob === "function") return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  return Uint8Array.from(
    (globalThis as { Buffer?: { from(s: string, e: string): ArrayLike<number> } }).Buffer!.from(
      text,
      "base64",
    ),
  );
};

/** A stored mesh (base64), decoded; null if it cannot be read. */
export function decodeWireMesh(text: string | undefined): WireMesh | null {
  if (typeof text !== "string" || !text) return null;
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(text);
  } catch {
    return null;
  }
  let at = 0;
  const read = () => {
    let value = 0;
    let scale = 1;
    for (;;) {
      if (at >= bytes.length) throw new Error("short mesh");
      const byte = bytes[at++];
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) return value;
      scale *= 128;
    }
  };
  try {
    const loops = read();
    if (loops > 64) return null;
    const loopCount = new Int32Array(loops);
    const loopStart = new Int32Array(loops);
    let outline = 0;
    for (let k = 0; k < loops; k += 1) {
      loopStart[k] = outline;
      loopCount[k] = read();
      outline += loopCount[k];
    }
    const total = outline + read();
    if (total > 65535) return null;
    const xs = new Int32Array(total);
    const ys = new Int32Array(total);
    let x = 0;
    let y = 0;
    for (let i = 0; i < total; i += 1) {
      x += unzigzag(read());
      y += unzigzag(read());
      xs[i] = x;
      ys[i] = y;
    }
    return { xs, ys, loopStart, loopCount, outline };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------- predicates */

// Below this every product and sum of integers is exact in a double.
const EXACT = 2 ** 52;

/** > 0 when a, b, c turn counter-clockwise (in a y-up sense), exact. */
export function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const l = (bx - ax) * (cy - ay);
  const r = (by - ay) * (cx - ax);
  const det = l - r;
  // Exact whenever both products are (every vertex of ours, and the
  // enclosing triangle's): integers under 2^53.
  if (Math.abs(l) < EXACT && Math.abs(r) < EXACT) return det > 0 ? 1 : det < 0 ? -1 : 0;
  if (Math.abs(det) > 1e-9 * (Math.abs(l) + Math.abs(r))) return det > 0 ? 1 : -1;
  const big =
    (BigInt(bx) - BigInt(ax)) * (BigInt(cy) - BigInt(ay)) -
    (BigInt(by) - BigInt(ay)) * (BigInt(cx) - BigInt(ax));
  return big > 0n ? 1 : big < 0n ? -1 : 0;
}

/** > 0 when d is strictly inside the circle through a, b, c (a, b, c
 * counter-clockwise), exact. */
export function inCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) {
  const adx = ax - dx;
  const ady = ay - dy;
  const bdx = bx - dx;
  const bdy = by - dy;
  const cdx = cx - dx;
  const cdy = cy - dy;
  const al = adx * adx + ady * ady;
  const bl = bdx * bdx + bdy * bdy;
  const cl = cdx * cdx + cdy * cdy;
  const det = al * (bdx * cdy - bdy * cdx) + bl * (cdx * ady - cdy * adx) + cl * (adx * bdy - ady * bdx);
  const permanent =
    al * (Math.abs(bdx * cdy) + Math.abs(bdy * cdx)) +
    bl * (Math.abs(cdx * ady) + Math.abs(cdy * adx)) +
    cl * (Math.abs(adx * bdy) + Math.abs(ady * bdx));
  if (permanent < EXACT) return det > 0 ? 1 : det < 0 ? -1 : 0;
  if (Math.abs(det) > 1e-10 * permanent) return det > 0 ? 1 : -1;
  const Adx = BigInt(ax) - BigInt(dx);
  const Ady = BigInt(ay) - BigInt(dy);
  const Bdx = BigInt(bx) - BigInt(dx);
  const Bdy = BigInt(by) - BigInt(dy);
  const Cdx = BigInt(cx) - BigInt(dx);
  const Cdy = BigInt(cy) - BigInt(dy);
  const exact =
    (Adx * Adx + Ady * Ady) * (Bdx * Cdy - Bdy * Cdx) +
    (Bdx * Bdx + Bdy * Bdy) * (Cdx * Ady - Cdy * Adx) +
    (Cdx * Cdx + Cdy * Cdy) * (Adx * Bdy - Ady * Bdx);
  return exact > 0n ? 1 : exact < 0n ? -1 : 0;
}

/* ------------------------------------------------------------- Delaunay */

/**
 * Bowyer–Watson over distinct integer points, inserted in their order: a
 * walk to the triangle holding each point, then a flood over the triangles
 * whose circle strictly holds it. Returns the triangles (index triples,
 * counter-clockwise) not touching the enclosing triangle. A generator that
 * yields every `every` insertions (the scene's idle slices); `delaunay`
 * runs it whole.
 */
export function* delaunaySteps(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  every = 48,
): Generator<undefined, Int32Array, unknown> {
  const n = xs.length;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    if (xs[i] < minX) minX = xs[i];
    if (ys[i] < minY) minY = ys[i];
    if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const span = Math.max(maxX - minX, maxY - minY, 16);
  const X = new Float64Array(n + 3);
  const Y = new Float64Array(n + 3);
  for (let i = 0; i < n; i += 1) {
    X[i] = xs[i];
    Y[i] = ys[i];
  }
  const cx = Math.round((minX + maxX) / 2);
  const cy = Math.round((minY + maxY) / 2);
  const big = span * 24;
  X[n] = cx - big;
  Y[n] = cy - big;
  X[n + 1] = cx + big;
  Y[n + 1] = cy - big;
  X[n + 2] = cx;
  Y[n + 2] = cy + big;
  // Triangles: vertices (V) and the neighbour across the edge opposite each
  // vertex (E), 3 slots each; dead triangles are marked.
  let capacity = Math.max(16, n * 2 + 8);
  let V = new Int32Array(capacity * 3);
  let E = new Int32Array(capacity * 3);
  let dead = new Uint8Array(capacity);
  let count = 0;
  const grow = () => {
    capacity *= 2;
    const v = new Int32Array(capacity * 3);
    v.set(V);
    V = v;
    const e = new Int32Array(capacity * 3);
    e.set(E);
    E = e;
    const d = new Uint8Array(capacity);
    d.set(dead);
    dead = d;
  };
  const add = (a: number, b: number, c: number) => {
    if (count >= capacity) grow();
    if (orient(X[a], Y[a], X[b], Y[b], X[c], Y[c]) < 0) {
      const t = b;
      b = c;
      c = t;
    }
    const t = count++;
    V[t * 3] = a;
    V[t * 3 + 1] = b;
    V[t * 3 + 2] = c;
    E[t * 3] = E[t * 3 + 1] = E[t * 3 + 2] = -1;
    dead[t] = 0;
    return t;
  };
  add(n, n + 1, n + 2);
  const holds = (t: number, p: number) => {
    const a = V[t * 3];
    const b = V[t * 3 + 1];
    const c = V[t * 3 + 2];
    return (
      orient(X[a], Y[a], X[b], Y[b], X[p], Y[p]) >= 0 &&
      orient(X[b], Y[b], X[c], Y[c], X[p], Y[p]) >= 0 &&
      orient(X[c], Y[c], X[a], Y[a], X[p], Y[p]) >= 0
    );
  };
  const circles = (t: number, p: number) => {
    const a = V[t * 3];
    const b = V[t * 3 + 1];
    const c = V[t * 3 + 2];
    return inCircle(X[a], Y[a], X[b], Y[b], X[c], Y[c], X[p], Y[p]) > 0;
  };
  // Scratch lists, reused for every insertion.
  let bad: number[] = [];
  const inBad = new Map<number, true>();
  const rimU: number[] = [];
  const rimV: number[] = [];
  const rimOut: number[] = [];
  const fresh: number[] = [];
  const open = new Map<number, number>();
  let last = 0;
  for (let p = 0; p < n; p += 1) {
    if (p && p % every === 0) yield;
    let t = dead[last] ? count - 1 : last;
    while (dead[t]) t -= 1;
    for (let guard = 0; guard < count * 3 + 10; guard += 1) {
      const a = V[t * 3];
      const b = V[t * 3 + 1];
      const c = V[t * 3 + 2];
      if (orient(X[b], Y[b], X[c], Y[c], X[p], Y[p]) < 0 && E[t * 3] >= 0) t = E[t * 3];
      else if (orient(X[c], Y[c], X[a], Y[a], X[p], Y[p]) < 0 && E[t * 3 + 1] >= 0)
        t = E[t * 3 + 1];
      else if (orient(X[a], Y[a], X[b], Y[b], X[p], Y[p]) < 0 && E[t * 3 + 2] >= 0)
        t = E[t * 3 + 2];
      else break;
    }
    if (!holds(t, p)) {
      t = -1;
      for (let s = 0; s < count; s += 1)
        if (!dead[s] && holds(s, p)) {
          t = s;
          break;
        }
      if (t < 0) throw new Error("delaunay: a point outside the enclosing triangle");
    }
    bad = [t];
    inBad.clear();
    inBad.set(t, true);
    for (let k = 0; k < bad.length; k += 1) {
      const s = bad[k];
      for (let j = 0; j < 3; j += 1) {
        const q = E[s * 3 + j];
        if (q < 0 || inBad.has(q) || dead[q]) continue;
        if (circles(q, p)) {
          inBad.set(q, true);
          bad.push(q);
        }
      }
    }
    rimU.length = rimV.length = rimOut.length = 0;
    for (const s of bad)
      for (let j = 0; j < 3; j += 1) {
        const q = E[s * 3 + j];
        if (q >= 0 && inBad.has(q)) continue;
        rimU.push(V[s * 3 + ((j + 1) % 3)]);
        rimV.push(V[s * 3 + ((j + 2) % 3)]);
        rimOut.push(q);
      }
    for (const s of bad) dead[s] = 1;
    fresh.length = 0;
    open.clear();
    for (let r = 0; r < rimU.length; r += 1) {
      const u = rimU[r];
      const v = rimV[r];
      const out = rimOut[r];
      const f = add(u, v, p);
      fresh.push(f);
      if (out >= 0)
        for (let j = 0; j < 3; j += 1) {
          const a = V[out * 3 + ((j + 1) % 3)];
          const b = V[out * 3 + ((j + 2) % 3)];
          if ((a === u && b === v) || (a === v && b === u)) E[out * 3 + j] = f;
        }
      for (let j = 0; j < 3; j += 1) {
        const a = V[f * 3 + ((j + 1) % 3)];
        const b = V[f * 3 + ((j + 2) % 3)];
        if ((a === u && b === v) || (a === v && b === u)) E[f * 3 + j] = out;
        else {
          // An edge through p: its other end names it.
          const other = a === p ? b : a;
          const waiting = open.get(other);
          if (waiting === undefined) open.set(other, f * 3 + j);
          else {
            E[f * 3 + j] = Math.floor(waiting / 3);
            E[waiting] = f;
            open.delete(other);
          }
        }
      }
    }
    last = fresh[0];
  }
  let alive = 0;
  for (let t = 0; t < count; t += 1) {
    if (dead[t]) continue;
    if (V[t * 3] >= n || V[t * 3 + 1] >= n || V[t * 3 + 2] >= n) continue;
    alive += 1;
  }
  const out = new Int32Array(alive * 3);
  let at = 0;
  for (let t = 0; t < count; t += 1) {
    if (dead[t]) continue;
    if (V[t * 3] >= n || V[t * 3 + 1] >= n || V[t * 3 + 2] >= n) continue;
    out[at++] = V[t * 3];
    out[at++] = V[t * 3 + 1];
    out[at++] = V[t * 3 + 2];
  }
  return out;
}

const drain = <T>(steps: Generator<undefined, T, unknown>): T => {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
};

/** The Delaunay triangulation of distinct integer points, whole. */
export function delaunay(xs: ArrayLike<number>, ys: ArrayLike<number>): Int32Array {
  return drain(delaunaySteps(xs, ys));
}

/** Whether (px, py) is inside the mesh's outline (even-odd over its loops). */
export function insideOutline(mesh: WireMesh, px: number, py: number) {
  const { xs, ys, loopStart, loopCount } = mesh;
  let hit = false;
  for (let L = 0; L < loopStart.length; L += 1) {
    const first = loopStart[L];
    const n = loopCount[L];
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
      const xi = xs[first + i];
      const yi = ys[first + i];
      const xj = xs[first + j];
      const yj = ys[first + j];
      if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
    }
  }
  return hit;
}

/** The outline's segments in horizontal bands, for a fast even-odd test. */
function outlineBands(mesh: WireMesh) {
  const { ys, loopStart, loopCount } = mesh;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < mesh.outline; i += 1) {
    if (ys[i] < minY) minY = ys[i];
    if (ys[i] > maxY) maxY = ys[i];
  }
  const size = 32;
  const bands = Math.max(1, Math.ceil((maxY - minY + 1) / size));
  const counts = new Int32Array(bands + 1);
  const each = (visit: (band: number, a: number, b: number) => void) => {
    for (let L = 0; L < loopStart.length; L += 1) {
      const first = loopStart[L];
      const n = loopCount[L];
      for (let k = 0; k < n; k += 1) {
        const a = first + k;
        const b = first + ((k + 1) % n);
        const y0 = Math.min(ys[a], ys[b]);
        const y1 = Math.max(ys[a], ys[b]);
        const from = Math.max(0, Math.floor((y0 - minY) / size));
        const to = Math.min(bands - 1, Math.floor((y1 - minY) / size));
        for (let band = from; band <= to; band += 1) visit(band, a, b);
      }
    }
  };
  each((band) => (counts[band + 1] += 1));
  for (let band = 0; band < bands; band += 1) counts[band + 1] += counts[band];
  const fill = counts.slice(0, bands);
  const segments = new Int32Array(counts[bands] * 2);
  each((band, a, b) => {
    const at = fill[band]++;
    segments[at * 2] = a;
    segments[at * 2 + 1] = b;
  });
  return { minY, size, bands, counts, segments };
}

/** The mesh's triangles: the Delaunay triangulation of its vertices, those
 * inside its outline (by their centroids; the build makes every outline
 * segment an edge, so each triangle is wholly inside or wholly outside). A
 * generator for the scene's idle slices; triangulateWireMesh runs it whole. */
export function* triangulateWireMeshSteps(
  mesh: WireMesh,
): Generator<undefined, Int32Array, unknown> {
  const all = yield* delaunaySteps(mesh.xs, mesh.ys);
  const { xs, ys } = mesh;
  const index = outlineBands(mesh);
  const inside = (px: number, py: number) => {
    const band = Math.floor((py - index.minY) / index.size);
    if (band < 0 || band >= index.bands) return false;
    let hit = false;
    for (let k = index.counts[band]; k < index.counts[band + 1]; k += 1) {
      const i = index.segments[k * 2];
      const j = index.segments[k * 2 + 1];
      const xi = xs[i];
      const yi = ys[i];
      const xj = xs[j];
      const yj = ys[j];
      if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
    }
    return hit;
  };
  const keep = new Uint8Array(all.length / 3);
  let kept = 0;
  for (let t = 0; t < keep.length; t += 1) {
    if (t && t % 256 === 0) yield;
    const a = all[t * 3];
    const b = all[t * 3 + 1];
    const c = all[t * 3 + 2];
    if (inside((xs[a] + xs[b] + xs[c]) / 3, (ys[a] + ys[b] + ys[c]) / 3)) {
      keep[t] = 1;
      kept += 1;
    }
  }
  const out = new Int32Array(kept * 3);
  let at = 0;
  for (let t = 0; t < keep.length; t += 1) {
    if (!keep[t]) continue;
    out[at++] = all[t * 3];
    out[at++] = all[t * 3 + 1];
    out[at++] = all[t * 3 + 2];
  }
  return out;
}

/** The mesh's triangles, whole (the build's and the tests'). */
export function triangulateWireMesh(mesh: WireMesh): Int32Array {
  return drain(triangulateWireMeshSteps(mesh));
}

/** The checks the build holds every mesh to: no folded triangle, every
 * outline segment exactly one triangle's edge, every other edge two's, and
 * the triangles' area the outline's. */
export function checkWireMesh(mesh: WireMesh, triangles: Int32Array) {
  const { xs, ys } = mesh;
  const uses = new Map<number, number>();
  const key = (u: number, v: number) => (u < v ? u * 65536 + v : v * 65536 + u);
  let area = 0;
  let folded = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t];
    const b = triangles[t + 1];
    const c = triangles[t + 2];
    if (orient(xs[a], ys[a], xs[b], ys[b], xs[c], ys[c]) <= 0) folded += 1;
    area += ((xs[b] - xs[a]) * (ys[c] - ys[a]) - (ys[b] - ys[a]) * (xs[c] - xs[a])) / 2;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ])
      uses.set(key(u, v), (uses.get(key(u, v)) ?? 0) + 1);
  }
  let missing = 0;
  let polygon = 0;
  const outlineKeys = new Set<number>();
  for (let L = 0; L < mesh.loopStart.length; L += 1) {
    const first = mesh.loopStart[L];
    const n = mesh.loopCount[L];
    let loopArea = 0;
    for (let k = 0; k < n; k += 1) {
      const u = first + k;
      const v = first + ((k + 1) % n);
      outlineKeys.add(key(u, v));
      if (uses.get(key(u, v)) !== 1) missing += 1;
      loopArea += xs[u] * ys[v] - xs[v] * ys[u];
    }
    polygon += loopArea / 2;
  }
  let open = 0;
  for (const [edge, count] of uses) if (!outlineKeys.has(edge) && count !== 2) open += 1;
  return {
    triangles: triangles.length / 3,
    folded,
    missing,
    open,
    cover: Math.abs(area) / Math.max(1, Math.abs(polygon)),
  };
}
