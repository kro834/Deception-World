#!/usr/bin/env node
// FAR FROM SAGA (2026-10-23): the wireframe its armour is constructed from
// (owner: 「また、ファーフロムはワイヤーフレーム風の生成方式を採るように。」).
//
//   node scripts/build-far-from-wireframe.mjs [--check] [--debug=<dir>]
//
// Reads what the suit build made — never polygons of its own — so it can be
// run again whenever the suit is cut again (scripts/build-far-from-suit.mjs,
// e.g. after the SAM masks): the plates of src/lib/far-from-suit.ts (their
// boxes, their atlas cells), the plates' atlas (FAR_FROM_SUIT_ATLAS: each
// plate's art and its real alpha), and the forms the suit-up runs through
// (ミドル's figure, FAR_FROM_SUIT_FORMS, ウルトラ's two sheets in
// far-from-ultra-art.ts). It writes src/lib/far-from-wireframe.ts:
//
// - per plate, a mesh of its real shape: its outline (the alpha's contour,
//   a pixel out so the plate's soft edge is inside it) as closed loops of
//   vertices, every few px and wherever it bends, then interior vertices
//   whose density follows the plate art's own edges (a Sobel of its
//   luminance: dense along trims, crystal facets and panel lines, sparse on
//   flat metal), vertices placed on the strongest edges themselves, and a
//   conforming Delaunay triangulation of them (each outline segment split
//   until no vertex encroaches on it, so every segment is an edge and every
//   triangle lies inside the outline or wholly outside it);
// - per form, the same at a coarser pitch over its whole figure (the chain's
//   overwrite draws the next form's wire over the last);
// - the fingerprint of the suit data it was made from, so a test can tell
//   when the suit was cut again without this being run.
//
// Each mesh is stored as its vertices only (src/lib/far-from-wireframe-mesh.ts
// encodeWireMesh: varint deltas of figure px × 4, the loops first, in order
// along each loop): the scene triangulates them with the same code the build
// checks them with (exact predicates), so it draws exactly these triangles.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || "sharp");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const importTs = (path) => import(pathToFileURL(join(ROOT, path)).href);
const MODULE = join(ROOT, "src/lib/far-from-wireframe.ts");
const ENTRY_MODULE = join(ROOT, "src/lib/far-from-wireframe-entry.ts");
const CHECK = process.argv.includes("--check");
const debugArg = process.argv.find((arg) => arg.startsWith("--debug="));
const DEBUG = debugArg ? debugArg.slice("--debug=".length) : null;

const suit = await importTs("src/lib/far-from-suit.ts");
const wire = await importTs("src/lib/far-from-wireframe-mesh.ts");
const ultraArt = await importTs("src/lib/far-from-ultra-art.ts");
const entrySuit = await importTs("src/lib/far-from-entry-suit.ts");
const {
  FAR_FROM_SUIT_ATLAS: ATLAS,
  FAR_FROM_SUIT_DRIVER: DRIVER,
  FAR_FROM_SUIT_FIGURE: FIGURE,
  FAR_FROM_SUIT_FORMS: FORMS,
  FAR_FROM_SUIT_PIECES: PIECES,
  FAR_FROM_SUIT_SIZE: SIZE,
} = suit;
const publicFile = (src) => join(ROOT, "public", src.replace(/^\//, ""));
const UNIT = wire.WIRE_UNIT;

/** The forms the chain runs through, each with the picture its mesh is
 * made from (the engine draws every one of them into the figure's frame). */
const FORM_SOURCES = {
  standard: FIGURE,
  high: FORMS.high,
  xhigh: FORMS.xhigh,
  max: FORMS.max,
  "ultra-body": ultraArt.farFromUltraSrc("body", 768),
  ultra: ultraArt.farFromUltraSrc("interface", 768),
};

/* ---------------------------------------------------------------- params */

/** The plates' mesh: the alpha a plate's outline is traced at (its soft
 * edge stays inside, one px of growth past it), the outline's spacing (px)
 * and its simplification, the interior's pitch on flat metal and on the
 * art's strongest edges, the edge detector's blur, and the vertices put on
 * edges (their pitch and the share of the plate's strongest edges). */
const PLATE = Object.freeze({
  alpha: 0.05,
  grow: 1,
  holes: 40,
  islands: 10,
  smooth: 0.7,
  epsilon: 0.5,
  boundary: 8,
  boundaryEdge: 5,
  flat: 18,
  edge: 8.5,
  blur: 1.6,
  feature: 10,
  featureShare: 0.55,
  density: 3.5,
  relax: 2,
});
/** A form's mesh, over its whole figure: coarser (it is seen for a moment). */
const FORM = Object.freeze({
  alpha: 0.06,
  grow: 1,
  holes: 150,
  islands: 40,
  smooth: 1,
  epsilon: 0.8,
  boundary: 13,
  boundaryEdge: 9,
  flat: 30,
  edge: 14,
  blur: 2,
  feature: 16,
  featureShare: 0.6,
  density: 5,
  relax: 2,
});

/** The entry transition's plates (its own cut, far-from-entry-suit.ts): a
 * plate is constructed in a third of a second there, so its mesh is lighter. */
const ENTRY = Object.freeze({ ...PLATE, boundary: 10, boundaryEdge: 6.5, flat: 24, edge: 11, feature: 13 });

/* ------------------------------------------------------------ the pixels */

const gaussian = (sigma) => {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return { kernel, radius };
};
function blur(field, w, h, sigma) {
  if (!(sigma > 0)) return Float64Array.from(field);
  const { kernel, radius } = gaussian(sigma);
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        sum += field[y * w + xx] * kernel[k + radius];
      }
      tmp[y * w + x] = sum;
    }
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        sum += tmp[yy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = sum;
    }
  return out;
}
const dilate = (mask, w, h, r) => {
  let current = mask;
  for (let pass = 0; pass < r; pass += 1) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 1) {
        let on = 0;
        for (let dy = -1; dy <= 1 && !on; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && current[yy * w + xx]) {
              on = 1;
              break;
            }
          }
        next[y * w + x] = on;
      }
    current = next;
  }
  return current;
};
// Connected components (4-neighbours) of value `on` in a mask.
function components(mask, w, h, on) {
  const label = new Int32Array(w * h).fill(-1);
  const list = [];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start += 1) {
    if (label[start] >= 0 || mask[start] !== on) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = list.length;
    let border = false;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= w * h) continue;
        const jx = j % w;
        if (Math.abs(jx - x) > 1) continue;
        if (label[j] >= 0 || mask[j] !== on) continue;
        label[j] = list.length;
        queue[tail++] = j;
      }
    }
    list.push({ pixels: queue.slice(0, tail), border });
  }
  return list;
}
/** A shape's mask: alpha over the threshold, grown, its small holes filled
 * and its specks dropped. */
function shapeMask(alpha, w, h, params) {
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) mask[i] = alpha[i] >= params.alpha ? 1 : 0;
  mask = dilate(mask, w, h, params.grow);
  for (const hole of components(mask, w, h, 0))
    if (!hole.border && hole.pixels.length < params.holes) for (const i of hole.pixels) mask[i] = 1;
  for (const speck of components(mask, w, h, 1))
    if (speck.pixels.length < params.islands) for (const i of speck.pixels) mask[i] = 0;
  return mask;
}
/** The art's edges: the Sobel magnitude of its luminance (premultiplied by
 * its alpha, so the silhouette counts), after a small blur; and that
 * magnitude thinned to its ridges (non-maximum suppression). */
function artEdges(rgba, w, h, sigma) {
  const lum = new Float64Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const a = rgba[i * 4 + 3] / 255;
    lum[i] =
      ((0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255) * a;
  }
  const soft = blur(lum, w, h, sigma);
  const at = (x, y) => soft[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  const mag = new Float64Array(w * h);
  const gx = new Float64Array(w * h);
  const gy = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const sx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const sy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      gx[y * w + x] = sx;
      gy[y * w + x] = sy;
      mag[y * w + x] = Math.sqrt(sx * sx + sy * sy);
    }
  const ridge = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y += 1)
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const m = mag[i];
      if (!m) continue;
      const angle = Math.atan2(gy[i], gx[i]);
      const dx = Math.round(Math.cos(angle));
      const dy = Math.round(Math.sin(angle));
      if (m >= mag[i + dy * w + dx] && m >= mag[i - dy * w - dx]) ridge[i] = m;
    }
  return { mag, ridge };
}
const percentile = (values, share) => {
  const list = [];
  for (const v of values) if (v > 0) list.push(v);
  if (!list.length) return 1;
  list.sort((a, b) => a - b);
  return list[Math.min(list.length - 1, Math.floor(list.length * share))] || 1;
};

/* ------------------------------------------------------------- the outline */

const CASES = [
  null,
  [[3, 2]],
  [[2, 1]],
  [[3, 1]],
  [[1, 0]],
  [
    [3, 0],
    [1, 2],
  ],
  [[2, 0]],
  [[3, 0]],
  [[0, 3]],
  [[0, 2]],
  [
    [0, 1],
    [2, 3],
  ],
  [[0, 1]],
  [[1, 3]],
  [[1, 2]],
  [[2, 3]],
  null,
];
// Marching squares over pixel centres (pixel i's centre at i + 0.5), the
// suit build's own tracer (scripts/build-far-from-suit.mjs traceContours).
function traceContours(field, w, h, iso) {
  const stride = w + 2;
  const value = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : field[j * w + i]);
  const next = new Map();
  const at = new Map();
  const hKey = (i, j) => ((j + 1) * stride + (i + 1)) * 2;
  const vKey = (i, j) => ((j + 1) * stride + (i + 1)) * 2 + 1;
  const cut = (a, b) => (iso - a) / (b - a);
  for (let j = -1; j < h; j += 1) {
    for (let i = -1; i < w; i += 1) {
      const a = value(i, j);
      const b = value(i + 1, j);
      const c = value(i + 1, j + 1);
      const d = value(i, j + 1);
      const index = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
      const segments = CASES[index];
      if (!segments) continue;
      const side = (s) => {
        let key;
        let point;
        if (s === 0) [key, point] = [hKey(i, j), () => [i + 0.5 + cut(a, b), j + 0.5]];
        else if (s === 1) [key, point] = [vKey(i + 1, j), () => [i + 1.5, j + 0.5 + cut(b, c)]];
        else if (s === 2) [key, point] = [hKey(i, j + 1), () => [i + 0.5 + cut(d, c), j + 1.5]];
        else [key, point] = [vKey(i, j), () => [i + 0.5, j + 0.5 + cut(a, d)]];
        if (!at.has(key)) at.set(key, point());
        return key;
      };
      for (const [from, to] of segments) next.set(side(from), side(to));
    }
  }
  const seen = new Set();
  const loops = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let key = start;
    while (key !== undefined && !seen.has(key)) {
      seen.add(key);
      loop.push(at.get(key));
      key = next.get(key);
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
const shoelace = (loop) => {
  let sum = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const [x0, y0] = loop[i];
    const [x1, y1] = loop[(i + 1) % loop.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
};
const segmentDistance = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
function simplifyRun(points, epsilon) {
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = segmentDistance(points[i], points[a], points[b]);
      if (d > best) [best, at] = [d, i];
    }
    if (best > epsilon) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
function simplifyLoop(loop, epsilon) {
  if (loop.length <= 4) return loop.slice();
  let far = 1;
  for (let i = 1; i < loop.length; i += 1)
    if (
      Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]) >
      Math.hypot(loop[far][0] - loop[0][0], loop[far][1] - loop[0][1])
    )
      far = i;
  const first = simplifyRun(loop.slice(0, far + 1), epsilon);
  const second = simplifyRun([...loop.slice(far), loop[0]], epsilon);
  return [...first, ...second.slice(1, -1)];
}

/* ------------------------------------------------------------------ the mesh */

const seeded = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/**
 * A mesh of one shape: `alpha` (0–1) and `rgba` over a w × h box whose
 * pixel (0, 0) is figure pixel (ox, oy). Returns its loops (figure px × 4,
 * integer, each in order), its interior vertices and its triangles (into
 * the loops' vertices then the interior's), or null if the shape is empty.
 */
function meshShape({ rgba, alpha, w, h, ox, oy, params, seed }) {
  const mask = shapeMask(alpha, w, h, params);
  let any = false;
  for (let i = 0; i < w * h && !any; i += 1) any = mask[i] === 1;
  if (!any) return null;
  // The outline: the grown mask's contour, smoothed a little.
  const field = blur(Float64Array.from(mask), w, h, params.smooth);
  const traced = traceContours(field, w, h, 0.5)
    .map((loop) => ({ loop, area: shoelace(loop) }))
    .filter(({ area }) => Math.abs(area) >= params.islands);
  if (!traced.length) return null;
  // The edges, and the density they ask for.
  const { mag, ridge } = artEdges(rgba, w, h, params.blur);
  const high = percentile(mag, 0.96);
  const density = blur(
    Float64Array.from(mag, (v) => Math.min(1, v / high)),
    w,
    h,
    params.density,
  );
  const inside = (x, y) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    return i >= 0 && j >= 0 && i < w && j < h && mask[j * w + i] === 1;
  };
  const pitch = (x, y) => {
    const i = Math.min(w - 1, Math.max(0, Math.floor(x)));
    const j = Math.min(h - 1, Math.max(0, Math.floor(y)));
    const e = Math.min(1, density[j * w + i] * 1.6);
    return params.flat + (params.edge - params.flat) * e;
  };
  // The loops' vertices: the simplified contour's corners (a turn of more
  // than CORNER) kept, the runs between them resampled by arc length at the
  // pitch there (graded with the interior's, so no fan of thin triangles
  // meets the outline).
  const CORNER = (32 * Math.PI) / 180;
  const loops = [];
  for (const { loop } of traced) {
    const simple = simplifyLoop(loop, params.epsilon);
    const n = simple.length;
    if (n < 3) continue;
    const corner = simple.map((point, k) => {
      const [x0, y0] = simple[(k + n - 1) % n];
      const [x1, y1] = point;
      const [x2, y2] = simple[(k + 1) % n];
      const a = Math.atan2(y1 - y0, x1 - x0);
      const b = Math.atan2(y2 - y1, x2 - x1);
      let turn = Math.abs(b - a);
      if (turn > Math.PI) turn = Math.PI * 2 - turn;
      return turn > CORNER;
    });
    let first = corner.indexOf(true);
    if (first < 0) {
      // No corner: start at the loop's topmost-leftmost point.
      first = 0;
      for (let k = 1; k < n; k += 1)
        if (simple[k][1] < simple[first][1] || (simple[k][1] === simple[first][1] && simple[k][0] < simple[first][0]))
          first = k;
      corner[first] = true;
    }
    const spacing = (x, y) =>
      Math.min(params.boundary, Math.max(params.boundaryEdge, pitch(x, y) * 0.8));
    const points = [];
    let k = first;
    do {
      // One run: from corner k to the next corner.
      const run = [simple[k]];
      let m = (k + 1) % n;
      while (!corner[m]) {
        run.push(simple[m]);
        m = (m + 1) % n;
      }
      run.push(simple[m]);
      const lengths = [0];
      for (let i = 1; i < run.length; i += 1)
        lengths.push(lengths[i - 1] + Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]));
      const total = lengths[lengths.length - 1];
      const at = (d) => {
        let i = 1;
        while (i < lengths.length - 1 && lengths[i] < d) i += 1;
        const t = (d - lengths[i - 1]) / Math.max(1e-9, lengths[i] - lengths[i - 1]);
        return [
          run[i - 1][0] + (run[i][0] - run[i - 1][0]) * t,
          run[i - 1][1] + (run[i][1] - run[i - 1][1]) * t,
        ];
      };
      points.push(run[0]);
      // Steps at the local spacing, evened out so the run ends on its corner.
      const steps = [];
      let d = 0;
      while (d < total) {
        const [x, y] = at(d);
        const step = spacing(x, y);
        steps.push(step);
        d += step;
      }
      const count = Math.max(1, Math.round(total / (total / Math.max(1, steps.length))));
      if (count > 1) {
        const scale = total / steps.slice(0, count).reduce((sum, v) => sum + v, 0);
        let walked = 0;
        for (let i = 0; i < count - 1; i += 1) {
          walked += steps[i] * scale;
          points.push(at(walked));
        }
      }
      k = m;
    } while (k !== first);
    loops.push(points);
  }
  // Interior vertices: first on the strongest edges (their ridges, in
  // order of strength, a feature pitch apart), then a variable-radius
  // Poisson fill (Bridson) at the pitch the density asks.
  const cell = Math.max(2, params.edge * 0.5);
  const gw = Math.ceil(w / cell) + 1;
  const grid = new Map();
  const all = [];
  const put = (x, y, kind) => {
    const key = Math.floor(y / cell) * gw + Math.floor(x / cell);
    let list = grid.get(key);
    if (!list) grid.set(key, (list = []));
    list.push(all.length);
    all.push([x, y, kind]);
  };
  const near = (x, y, r) => {
    const reach = Math.ceil(r / cell);
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let dy = -reach; dy <= reach; dy += 1)
      for (let dx = -reach; dx <= reach; dx += 1) {
        const list = grid.get((gy + dy) * gw + gx + dx);
        if (!list) continue;
        for (const k of list) {
          const [px, py] = all[k];
          if ((px - x) ** 2 + (py - y) ** 2 < r * r) return true;
        }
      }
    return false;
  };
  for (const loop of loops) for (const [x, y] of loop) put(x, y, 0);
  const ridgeHigh = percentile(ridge, 0.99);
  const candidates = [];
  for (let j = 1; j < h - 1; j += 1)
    for (let i = 1; i < w - 1; i += 1) {
      const v = ridge[j * w + i];
      if (v >= ridgeHigh * params.featureShare && mask[j * w + i]) candidates.push([v, i, j]);
    }
  candidates.sort((a, b) => b[0] - a[0] || a[2] - b[2] || a[1] - b[1]);
  for (const [, i, j] of candidates) {
    const x = i + 0.5;
    const y = j + 0.5;
    // Off the outline by most of a pitch (no slivers against it).
    if (near(x, y, params.feature)) continue;
    if (!inside(x - 1.5, y) || !inside(x + 1.5, y) || !inside(x, y - 1.5) || !inside(x, y + 1.5))
      continue;
    put(x, y, 1);
  }
  const random = seeded(seed);
  const active = [];
  for (let k = 0; k < all.length; k += 1) active.push(k);
  // Seed the fill where nothing is yet: a coarse scan of the mask.
  for (let j = 0; j < h; j += Math.max(4, params.flat / 2))
    for (let i = 0; i < w; i += Math.max(4, params.flat / 2)) {
      const x = i + random();
      const y = j + random();
      if (!inside(x, y) || near(x, y, pitch(x, y))) continue;
      put(x, y, 2);
      active.push(all.length - 1);
    }
  while (active.length) {
    const pick = Math.floor(random() * active.length);
    const [x, y] = all[active[pick]];
    const r = pitch(x, y);
    let placed = false;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const distance = r * (1 + random());
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (!inside(px, py)) continue;
      const rp = pitch(px, py);
      if (near(px, py, rp)) continue;
      put(px, py, 2);
      active.push(all.length - 1);
      placed = true;
      break;
    }
    if (!placed) {
      active[pick] = active[active.length - 1];
      active.pop();
    }
  }
  // Integer coordinates (quarter px, figure frame), every vertex distinct:
  // an outline vertex on another's spot (two loops touching) moves a quarter
  // px off it.
  const q = (v, o) => Math.round((v + o) * UNIT);
  const taken = new Set();
  const NUDGES = [
    [0, 0],
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [2, 0],
    [0, 2],
    [-2, 0],
    [0, -2],
  ];
  const claim = (point) => {
    const [x0, y0] = point;
    for (const [dx, dy] of NUDGES) {
      point[0] = x0 + dx;
      point[1] = y0 + dy;
      if (!taken.has(`${point[0]},${point[1]}`)) break;
    }
    taken.add(`${point[0]},${point[1]}`);
    return point;
  };
  const loopPoints = loops
    .map((loop) => {
      const out = [];
      for (const [x, y] of loop) {
        const point = [q(x, ox), q(y, oy)];
        const last = out[out.length - 1];
        if (last && last[0] === point[0] && last[1] === point[1]) continue;
        out.push(point);
      }
      return out;
    })
    .filter((loop) => loop.length >= 3);
  for (const loop of loopPoints) for (const point of loop) claim(point);
  // No pinch: a vertex within a little over half a px of a segment it is
  // not an end of (a needle a pixel wide, its two sides touching) is
  // dropped, until none is, so every loop is a simple polygon with room
  // between its sides. (Run again after every split.)
  const unpinch = () => {
    const size = 8 * UNIT;
    let total = 0;
    for (let pass = 0; pass < 20; pass += 1) {
      const segments = new Map();
      loopPoints.forEach((loop, L) =>
        loop.forEach(([ax, ay], k) => {
          const [bx, by] = loop[(k + 1) % loop.length];
          const x0 = Math.floor(Math.min(ax, bx) / size);
          const x1 = Math.floor(Math.max(ax, bx) / size);
          const y0 = Math.floor(Math.min(ay, by) / size);
          const y1 = Math.floor(Math.max(ay, by) / size);
          for (let gy = y0; gy <= y1; gy += 1)
            for (let gx = x0; gx <= x1; gx += 1) {
              const key = `${gx},${gy}`;
              if (!segments.has(key)) segments.set(key, []);
              segments.get(key).push([L, k]);
            }
        }),
      );
      let dropped = 0;
      for (const [L, loop] of loopPoints.entries()) {
        for (let k = loop.length - 1; k >= 0 && loop.length > 3; k -= 1) {
          const [px, py] = loop[k];
          const list = segments.get(`${Math.floor(px / size)},${Math.floor(py / size)}`) ?? [];
          let pinched = false;
          for (const [M, j] of list) {
            const other = loopPoints[M];
            if (M === L && (j === k || (j + 1) % other.length === k)) continue;
            if (j >= other.length) continue;
            const a = other[j];
            const b = other[(j + 1) % other.length];
            if (segmentDistance([px, py], a, b) < 2.5) {
              pinched = true;
              break;
            }
          }
          if (pinched) {
            taken.delete(`${px},${py}`);
            loop.splice(k, 1);
            dropped += 1;
          }
        }
      }
      total += dropped;
      if (!dropped) break;
    }
    return total;
  };
  unpinch();
  // Inside the outline (even-odd over every loop).
  const insideLoops = (px, py) => {
    let hit = false;
    for (const loop of loopPoints)
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
        const [xi, yi] = loop[i];
        const [xj, yj] = loop[j];
        if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
      }
    return hit;
  };
  // The interior's vertices: [x, y, kind] (1 on an edge, 2 the fill).
  let interior = [];
  for (const [x, y, kind] of all) {
    if (!kind) continue;
    const point = [q(x, ox), q(y, oy), kind];
    if (taken.has(`${point[0]},${point[1]}`) || !insideLoops(point[0], point[1])) continue;
    taken.add(`${point[0]},${point[1]}`);
    interior.push(point);
  }
  // Splits an outline segment at its midpoint (if that spot is free).
  const splitAt = (loop, k) => {
    const [ax, ay] = loop[k];
    const [bx, by] = loop[(k + 1) % loop.length];
    if ((ax - bx) ** 2 + (ay - by) ** 2 <= 4) return false;
    const point = [Math.round((ax + bx) / 2), Math.round((ay + by) / 2)];
    const key = `${point[0]},${point[1]}`;
    if (taken.has(key)) {
      // An interior vertex on the segment itself gives way to the outline.
      const at = interior.findIndex(([x, y]) => x === point[0] && y === point[1]);
      if (at < 0) return false;
      interior.splice(at, 1);
    }
    taken.add(key);
    loop.splice(k + 1, 0, point);
    return true;
  };
  // Conforming: an outline segment a vertex encroaches on (inside its
  // diametral circle) is split until none does, so the Delaunay
  // triangulation holds every segment as an edge.
  const encroachSplits = () => {
    const everything = [...loopPoints.flat(), ...interior.map(([x, y]) => [x, y])];
    const size = params.flat * UNIT * 2;
    const map = new Map();
    for (const [k, [x, y]] of everything.entries()) {
      const key = `${Math.floor(x / size)},${Math.floor(y / size)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(k);
    }
    const encroached = (ax, ay, bx, by, self) => {
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2;
      const r2 = ((ax - bx) ** 2 + (ay - by) ** 2) / 4;
      const gx = Math.floor(mx / size);
      const gy = Math.floor(my / size);
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const list = map.get(`${gx + dx},${gy + dy}`);
          if (!list) continue;
          for (const k of list) {
            if (k === self[0] || k === self[1]) continue;
            const [px, py] = everything[k];
            if ((px - mx) ** 2 + (py - my) ** 2 < r2) return true;
          }
        }
      return false;
    };
    let split = 0;
    let offset = 0;
    for (const loop of loopPoints) {
      const marks = [];
      for (let k = 0; k < loop.length; k += 1) {
        const [ax, ay] = loop[k];
        const [bx, by] = loop[(k + 1) % loop.length];
        if (encroached(ax, ay, bx, by, [offset + k, offset + ((k + 1) % loop.length)])) marks.push(k);
      }
      offset += loop.length;
      for (let m = marks.length - 1; m >= 0; m -= 1) if (splitAt(loop, marks[m])) split += 1;
    }
    return split;
  };
  const triangulate = () => {
    const xs = [];
    const ys = [];
    for (const loop of loopPoints)
      for (const [x, y] of loop) {
        xs.push(x);
        ys.push(y);
      }
    for (const [x, y] of interior) {
      xs.push(x);
      ys.push(y);
    }
    const flat = wire.delaunay(xs, ys);
    const triangles = [];
    for (let t = 0; t < flat.length; t += 3) {
      const [a, b, c] = [flat[t], flat[t + 1], flat[t + 2]];
      if (insideLoops((xs[a] + xs[b] + xs[c]) / 3, (ys[a] + ys[b] + ys[c]) / 3)) triangles.push([a, b, c]);
    }
    return { xs, ys, triangles };
  };
  // The outline segments no triangle edge holds (k into each loop).
  const missingSegments = ({ triangles }) => {
    const edges = new Set();
    for (const [a, b, c] of triangles)
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ])
        edges.add(u < v ? `${u},${v}` : `${v},${u}`);
    const missing = [];
    let offset = 0;
    for (const [L, loop] of loopPoints.entries()) {
      for (let k = 0; k < loop.length; k += 1) {
        const u = offset + k;
        const v = offset + ((k + 1) % loop.length);
        if (!edges.has(u < v ? `${u},${v}` : `${v},${u}`)) missing.push([L, k]);
      }
      offset += loop.length;
    }
    return missing;
  };
  for (let round = 0; round < 40 && encroachSplits(); round += 1);
  unpinch();
  let mesh = triangulate();
  // Relaxed: each fill vertex moves part of the way to its neighbours' mean
  // (kept inside, off the outline), so the triangles even out.
  for (let pass = 0; pass < (params.relax ?? 0); pass += 1) {
    const sums = new Map();
    const boundaryCount = loopPoints.reduce((n, loop) => n + loop.length, 0);
    for (const [a, b, c] of mesh.triangles)
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
        [b, a],
        [c, b],
        [a, c],
      ]) {
        if (u < boundaryCount) continue;
        let entry = sums.get(u);
        if (!entry) sums.set(u, (entry = { x: 0, y: 0, n: 0, seen: new Set() }));
        if (entry.seen.has(v)) continue;
        entry.seen.add(v);
        entry.x += mesh.xs[v];
        entry.y += mesh.ys[v];
        entry.n += 1;
      }
    const boundary = loopPoints.flat();
    const moved = [];
    for (const [k, point] of interior.entries()) {
      const entry = sums.get(boundaryCount + k);
      if (point[2] !== 2 || !entry?.n) {
        moved.push(point);
        continue;
      }
      const nx = Math.round(point[0] + (entry.x / entry.n - point[0]) * 0.6);
      const ny = Math.round(point[1] + (entry.y / entry.n - point[1]) * 0.6);
      const key = `${nx},${ny}`;
      let ok = !taken.has(key) && insideLoops(nx, ny);
      if (ok) {
        const clearance = pitch(nx / UNIT - ox, ny / UNIT - oy) * UNIT * 0.45;
        for (const [bx, by] of boundary)
          if ((bx - nx) ** 2 + (by - ny) ** 2 < clearance * clearance) {
            ok = false;
            break;
          }
      }
      if (!ok) {
        moved.push(point);
        continue;
      }
      taken.delete(`${point[0]},${point[1]}`);
      taken.add(key);
      moved.push([nx, ny, 2]);
    }
    interior = moved;
    for (let round = 0; round < 40 && encroachSplits(); round += 1);
    unpinch();
    mesh = triangulate();
  }
  // The interior in the order it is stored (a serpentine scan, bands of 8
  // px: consecutive vertices near, their deltas short) — the scene inserts
  // the vertices in this order, so the checks below are made on it.
  const band = 8 * UNIT;
  interior.sort((a, b) => {
    const ra = Math.floor(a[1] / band);
    const rb = Math.floor(b[1] / band);
    if (ra !== rb) return ra - rb;
    return ra % 2 ? b[0] - a[0] || a[1] - b[1] : a[0] - b[0] || a[1] - b[1];
  });
  mesh = triangulate();
  // Any segment still not an edge (a degenerate neighbourhood): split it
  // and triangulate again.
  for (let round = 0; round < 12; round += 1) {
    const missing = missingSegments(mesh);
    if (process.env.WIRE_DEBUG && missing.length) console.log("round", round, "missing", JSON.stringify(missing.map(([L, k]) => [L, k, loopPoints[L][k], loopPoints[L][(k + 1) % loopPoints[L].length]])));
    if (!missing.length) break;
    let split = 0;
    for (const [L, k] of missing.sort((a, b) => b[0] - a[0] || b[1] - a[1])) {
      const loop = loopPoints[L];
      if (splitAt(loop, k)) split += 1;
      else if (loop.length > 3) {
        // Too short to split (a vertex sits right against it): the segment
        // merges with the next, its end vertex dropped (under a pixel).
        const end = (k + 1) % loop.length;
        taken.delete(`${loop[end][0]},${loop[end][1]}`);
        loop.splice(end, 1);
        split += 1;
      }
    }
    if (!split) break;
    for (let again = 0; again < 40 && encroachSplits(); again += 1);
    unpinch();
    mesh = triangulate();
  }
  const { xs, ys } = mesh;
  const kept3 = mesh.triangles;
  const kept = interior;
  return {
    loops: loopPoints,
    interior: kept.map(([x, y]) => [x, y]),
    features: kept.map(([, , kind]) => kind === 1),
    triangles: kept3,
    xs,
    ys,
  };
}

/** A mesh as it is stored, and as the scene will read it back: encoded,
 * decoded, triangulated and checked again with the scene's own code
 * (far-from-wireframe-mesh.ts). */
function storeMesh(mesh, name) {
  const interior = mesh.interior;
  const bytes = wire.encodeWireMesh(mesh.loops, interior);
  const text = Buffer.from(bytes).toString("base64");
  const read = wire.decodeWireMesh(text);
  if (!read) throw new Error(`${name}: does not decode`);
  const triangles = wire.triangulateWireMesh(read);
  const check = wire.checkWireMesh(read, triangles);
  if (check.missing && process.env.WIRE_DEBUG) {
    const same = read.xs.length === mesh.xs.length && read.xs.every((v, i) => v === mesh.xs[i] && read.ys[i] === mesh.ys[i]);
    console.log(name, "internal tris", mesh.triangles.length, "decoded", triangles.length / 3, "same vertices", same);
  }
  return {
    text,
    read,
    triangles,
    stats: { name, vertices: read.xs.length, outline: read.outline, bytes: bytes.length, ...check },
  };
}

/* ---------------------------------------------------------------- the build */

const atlasPath = publicFile(ATLAS.src);
const atlasBytes = readFileSync(atlasPath);
const atlas = await sharp(atlasBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (atlas.info.width !== ATLAS.width || atlas.info.height !== ATLAS.height)
  throw new Error(
    `atlas ${atlas.info.width} x ${atlas.info.height}, module says ${ATLAS.width} x ${ATLAS.height}`,
  );
const cellOf = (piece) => {
  const { ax, ay, w, h } = piece;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const alpha = new Float64Array(w * h);
  for (let j = 0; j < h; j += 1)
    for (let i = 0; i < w; i += 1) {
      const from = ((ay + j) * ATLAS.width + ax + i) * 4;
      const to = (j * w + i) * 4;
      for (let c = 0; c < 4; c += 1) rgba[to + c] = atlas.data[from + c];
      alpha[j * w + i] = atlas.data[from + 3] / 255;
    }
  return { rgba, alpha };
};

const plates = {};
const stats = [];
const debugPlates = [];
for (const [index, piece] of PIECES.entries()) {
  if (DRIVER.includes(piece.id)) continue;
  const { rgba, alpha } = cellOf(piece);
  const mesh = meshShape({
    rgba,
    alpha,
    w: piece.w,
    h: piece.h,
    ox: piece.x,
    oy: piece.y,
    params: PLATE,
    seed: 4801 + index,
  });
  if (!mesh) throw new Error(`${piece.id}: no shape in its atlas cell`);
  const stored = storeMesh(mesh, piece.id);
  stats.push(stored.stats);
  plates[piece.id] = stored.text;
  debugPlates.push(stored);
}

const forms = {};
const formHashes = {};
const debugForms = [];
for (const [key, src] of Object.entries(FORM_SOURCES)) {
  const bytes = readFileSync(publicFile(src));
  formHashes[key] = hashOf(bytes);
  const { data } = await sharp(bytes)
    .ensureAlpha()
    .resize(SIZE.width, SIZE.height, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alpha = Float64Array.from({ length: SIZE.width * SIZE.height }, (_, i) => data[i * 4 + 3] / 255);
  const mesh = meshShape({
    rgba: data,
    alpha,
    w: SIZE.width,
    h: SIZE.height,
    ox: 0,
    oy: 0,
    params: FORM,
    seed: 9100 + Object.keys(FORM_SOURCES).indexOf(key),
  });
  if (!mesh) throw new Error(`${key}: an empty form`);
  const stored = storeMesh(mesh, `form:${key}`);
  stats.push(stored.stats);
  forms[key] = stored.text;
  debugForms.push({ key, ...stored, data });
}

// The entry transition's plates, from its own atlas (the same way).
const entryAtlasBytes = readFileSync(publicFile(entrySuit.FAR_FROM_ENTRY_ATLAS.src));
const entryAtlas = await sharp(entryAtlasBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const entryPlates = {};
for (const [index, piece] of entrySuit.FAR_FROM_ENTRY_PIECES.entries()) {
  const { ax, ay, w, h } = piece;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const alpha = new Float64Array(w * h);
  for (let j = 0; j < h; j += 1)
    for (let i = 0; i < w; i += 1) {
      const from = ((ay + j) * entryAtlas.info.width + ax + i) * 4;
      for (let c = 0; c < 4; c += 1) rgba[(j * w + i) * 4 + c] = entryAtlas.data[from + c];
      alpha[j * w + i] = entryAtlas.data[from + 3] / 255;
    }
  const mesh = meshShape({ rgba, alpha, w, h, ox: piece.x, oy: piece.y, params: ENTRY, seed: 7301 + index });
  if (!mesh) throw new Error(`entry ${piece.id}: no shape in its atlas cell`);
  const stored = storeMesh(mesh, `entry:${piece.id}`);
  stats.push(stored.stats);
  entryPlates[piece.id] = stored.text;
}

// The fingerprint of the suit this was made from: the plates as the suit
// module lists them, and the atlas's bytes (scripts/far-from-wireframe.test.mjs
// recomputes both).
const SOURCE = {
  pieces: wire.wireSuitFingerprint(PIECES),
  atlas: hashOf(atlasBytes),
  forms: formHashes,
};

const bad = stats.filter((s) => s.folded || s.missing || s.open || s.cover < 0.999 || s.cover > 1.001);
const lines = (record) =>
  Object.entries(record)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
    .join("\n");
const plateStats = stats.filter((s) => !s.name.startsWith("form:") && !s.name.startsWith("entry:"));
const entryStats = stats.filter((s) => s.name.startsWith("entry:"));
const formStats = stats.filter((s) => s.name.startsWith("form:"));
const sum = (list, key) => list.reduce((total, s) => total + s[key], 0);
const summary = (list) =>
  `${sum(list, "vertices")} vertices (${sum(list, "outline")} on outlines), ${sum(list, "triangles")} triangles`;
const source = `// Generated by scripts/build-far-from-wireframe.mjs from the suit
// (src/lib/far-from-suit.ts and its plates' atlas, ${ATLAS.src}) and the
// forms' pictures — do not edit by hand. Re-run it whenever the suit is cut
// again (scripts/build-far-from-suit.mjs): scripts/far-from-wireframe.test.mjs
// checks the fingerprint below against the suit.
// ${plateStats.length} plates: ${summary(plateStats)}.
// ${formStats.length} forms: ${summary(formStats)}.

/** What the meshes were made from: the suit's plates (wireSuitFingerprint of
 * FAR_FROM_SUIT_PIECES), its atlas and each form's picture (sha-256, 64 bits). */
export const FAR_FROM_WIREFRAME_SOURCE = {
  pieces: ${JSON.stringify(SOURCE.pieces)},
  atlas: ${JSON.stringify(SOURCE.atlas)},
  forms: {
${Object.entries(SOURCE.forms)
  .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
  .join("\n")}
  },
} as const;

/** Each plate's mesh (every plate but the driver's), by its id: its
 * vertices, encoded (far-from-wireframe-mesh.ts decodeWireMesh; figure px ×
 * WIRE_UNIT): its outline's loops in order (its real alpha, a pixel out),
 * then its interior (dense where its art has edges). The scene triangulates
 * them (triangulateWireMesh). */
export const FAR_FROM_WIREFRAME_PLATES: Readonly<Record<string, string>> = {
${lines(plates)}
};

/** Each form's mesh over its whole figure (the same encoding), by the
 * runway's form keys: "standard" is ミドル, the base figure. */
export const FAR_FROM_WIREFRAME_FORMS: Readonly<Record<string, string>> = {
${lines(forms)}
};
`;

console.log(
  `plates ${plateStats.length}: ${summary(plateStats)}, ${sum(plateStats, "bytes")} bytes; forms ${formStats.length}: ${summary(formStats)}, ${sum(formStats, "bytes")} bytes; module ${Buffer.byteLength(source)} bytes`,
);
if (bad.length) {
  for (const s of bad) console.log("  check:", JSON.stringify(s));
  if (!DEBUG) throw new Error(`${bad.length} meshes do not conform to their outline`);
}

if (DEBUG) {
  mkdirSync(DEBUG, { recursive: true });
  // Every plate's mesh over the figure, and each form's over its own art.
  const svg = (meshes, width, height) => {
    const parts = [];
    for (const { read, triangles } of meshes) {
      const edges = new Set();
      let d = "";
      for (let t = 0; t < triangles.length; t += 3)
        for (const [u, v] of [
          [triangles[t], triangles[t + 1]],
          [triangles[t + 1], triangles[t + 2]],
          [triangles[t + 2], triangles[t]],
        ]) {
          const key = u < v ? `${u},${v}` : `${v},${u}`;
          if (edges.has(key)) continue;
          edges.add(key);
          d += `M${read.xs[u] / UNIT} ${read.ys[u] / UNIT}L${read.xs[v] / UNIT} ${read.ys[v] / UNIT}`;
        }
      parts.push(`<path d="${d}" stroke="#7fe6ff" stroke-width="0.45" fill="none" opacity="0.9"/>`);
      let outline = "";
      for (let L = 0; L < read.loopStart.length; L += 1) {
        const points = [];
        for (let k = 0; k < read.loopCount[L]; k += 1) {
          const i = read.loopStart[L] + k;
          points.push(`${read.xs[i] / UNIT} ${read.ys[i] / UNIT}`);
        }
        outline += `M${points.join("L")}Z`;
      }
      parts.push(`<path d="${outline}" stroke="#ffffff" stroke-width="0.8" fill="none"/>`);
    }
    return Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`,
    );
  };
  const scale = 2;
  const figure = await sharp(publicFile(FIGURE))
    .resize(SIZE.width * scale, SIZE.height * scale)
    .flatten({ background: "#0b1220" })
    .modulate({ brightness: 0.55 })
    .toBuffer();
  const overlay = await sharp(svg(debugPlates, SIZE.width, SIZE.height))
    .resize(SIZE.width * scale, SIZE.height * scale)
    .png()
    .toBuffer();
  await sharp(figure)
    .composite([{ input: overlay }])
    .png()
    .toFile(join(DEBUG, "plates.png"));
  for (const form of debugForms) {
    const art = await sharp(form.data, { raw: { width: SIZE.width, height: SIZE.height, channels: 4 } })
      .resize(SIZE.width * scale, SIZE.height * scale)
      .flatten({ background: "#0b1220" })
      .modulate({ brightness: 0.55 })
      .png()
      .toBuffer();
    const lay = await sharp(svg([form], SIZE.width, SIZE.height))
      .resize(SIZE.width * scale, SIZE.height * scale)
      .png()
      .toBuffer();
    await sharp(art).composite([{ input: lay }]).png().toFile(join(DEBUG, `form-${form.key}.png`));
  }
  writeFileSync(join(DEBUG, "stats.json"), JSON.stringify(stats, null, 2));
}

const entrySource = `// Generated by scripts/build-far-from-wireframe.mjs from the entry
// transition's suit (src/lib/far-from-entry-suit.ts and its plates' atlas,
// ${entrySuit.FAR_FROM_ENTRY_ATLAS.src}) — do not edit by hand.
// ${entryStats.length} plates: ${summary(entryStats)}.

/** What the meshes were made from (wireSuitFingerprint of
 * FAR_FROM_ENTRY_PIECES, and the atlas's sha-256, 64 bits). */
export const FAR_FROM_WIREFRAME_ENTRY_SOURCE = {
  pieces: ${JSON.stringify(wire.wireSuitFingerprint(entrySuit.FAR_FROM_ENTRY_PIECES))},
  atlas: ${JSON.stringify(hashOf(entryAtlasBytes))},
} as const;

/** Each entry plate's mesh, by its id (far-from-wireframe-mesh.ts
 * decodeWireMesh): its outline's loops in order, then its interior. */
export const FAR_FROM_WIREFRAME_ENTRY: Readonly<Record<string, string>> = {
${lines(entryPlates)}
};
`;

const outputs = [
  [MODULE, source],
  [ENTRY_MODULE, entrySource],
];
if (CHECK) {
  let stale = false;
  for (const [path, text] of outputs) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = "";
    }
    if (current !== text) {
      stale = true;
      console.error(`${path} is stale: run node scripts/build-far-from-wireframe.mjs`);
    }
  }
  if (stale) process.exit(1);
  console.log("the wireframe modules are current");
} else {
  for (const [path, text] of outputs) {
    writeFileSync(path, text);
    console.log(`wrote ${path}`);
  }
}
