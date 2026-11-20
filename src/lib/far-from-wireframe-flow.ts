import { FAR_FROM_WIREFRAME_FORMS, FAR_FROM_WIREFRAME_PLATES } from "./far-from-wireframe.ts";
import { WIRE_UNIT, decodeWireMesh, triangulateWireMeshSteps } from "./far-from-wireframe-mesh.ts";
import type { NaniteSkinInput } from "./nanite-skin.ts";

/** Live machine caps, before the skin's frame-cost governor steps down. */
export const FAR_FROM_WIRE_FLOW = Object.freeze({ fine: 4200, coarse: 1600 });

type PrepareFlow = NonNullable<NaniteSkinInput["prepareFlow"]>;
type Field = Parameters<PrepareFlow>[0];

const EDGE_STRIDE = 10;
const WIRE_STRIDE = 9;
const CHIP_STRIDE = 3;
const ICE = "#9ceeff";
const GOLD = "#ffdb8d";
const WHITE = "#eefbff";
const QUALITY = [1, 0.64, 0.38];
const clamp = (u: number) => Math.max(0, Math.min(1, u));
const smooth = (u: number) => u * u * (3 - 2 * u);

type Route = {
  readonly edges: Float32Array;
  readonly lead: number;
  readonly tail: number;
};

// A mesh outline runs just outside its cutout. Find the armour's time
// underneath it; an edge over bare undersuit doesn't get a route.
function fieldTime(field: Field, times: Float32Array, x: number, y: number): number {
  const col = Math.floor(x / field.grid);
  const row = Math.floor(y / field.grid);
  if (col >= 0 && col < field.width && row >= 0 && row < field.height) {
    const center = times[row * field.width + col];
    if (Number.isFinite(center)) return center;
  }
  let best = NaN;
  let distance = Infinity;
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const nx = col + dx;
      const ny = row + dy;
      const d = dx * dx + dy * dy;
      if (d >= distance || nx < 0 || nx >= field.width || ny < 0 || ny >= field.height) continue;
      const t = times[ny * field.width + nx];
      if (!Number.isFinite(t)) continue;
      best = t;
      distance = d;
    }
  }
  return best;
}

/**
 * Bake the actual armour outlines and their internal triangular edges.
 * Orient each edge down the skin's time field, so the packets fan out from
 * each junction and meet on its far side. The forms have their own outlines,
 * including the two Ultra passes. This uses the runway's existing idle slices.
 */
function* buildRoute(
  field: Field,
  meshes: Iterable<string>,
  change: boolean,
): Generator<undefined, Route, unknown> {
  const edges: number[][] = [];
  const time = change ? field.change : field.base;
  const lead = change ? 0.145 : 0.046;
  const tail = change ? 0.085 : 0.037;
  for (const geometry of meshes) {
    const mesh = decodeWireMesh(geometry);
    if (!mesh) continue;
    const { xs, ys, loopStart, loopCount } = mesh;
    const triangles = yield* triangulateWireMeshSteps(mesh);
    const times = new Float32Array(xs.length);
    for (let i = 0; i < xs.length; i += 1)
      times[i] = fieldTime(field, time, xs[i] / WIRE_UNIT, ys[i] / WIRE_UNIT);

    const seen = new Set<number>();
    const socket = new Uint8Array(xs.length);
    const append = (i: number, j: number, outline: boolean) => {
      const key = Math.min(i, j) * xs.length + Math.max(i, j);
      if (seen.has(key)) return;
      seen.add(key);
      const ti = times[i];
      const tj = times[j];
      if (!Number.isFinite(ti) || !Number.isFinite(tj)) return;
      const a = ti < tj || (ti === tj && i < j) ? i : j;
      const b = a === i ? j : i;
      const ax = xs[a] / WIRE_UNIT;
      const ay = ys[a] / WIRE_UNIT;
      const bx = xs[b] / WIRE_UNIT;
      const by = ys[b] / WIRE_UNIT;
      const length = Math.hypot(bx - ax, by - ay);
      if (length < 2) return;
      const join = socket[b] === 0 && (outline || b % 4 === 0);
      if (join) socket[b] = 1;
      const seed = ((Math.imul(key + 1, 0x9e3779b1) >>> 12) & 255) / 256;
      edges.push([times[b], times[a], ax, ay, bx, by, length, seed, Number(outline), Number(join)]);
    };
    for (let loop = 0; loop < loopStart.length; loop += 1) {
      const start = loopStart[loop];
      const size = loopCount[loop];
      for (let i = 0; i < size; i += 1) append(start + i, start + ((i + 1) % size), true);
    }
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i];
      const b = triangles[i + 1];
      const c = triangles[i + 2];
      append(a, b, false);
      append(b, c, false);
      append(c, a, false);
      if (i % 768 === 765) yield;
    }
    yield;
  }
  edges.sort((a, b) => a[0] - b[0]);
  yield;
  const sorted = new Float32Array(edges.length * EDGE_STRIDE);
  for (let i = 0; i < edges.length; i += 1) sorted.set(edges[i], i * EDGE_STRIDE);
  return { edges: sorted, lead, tail };
}

function edgeBound(edges: Float32Array, time: number): number {
  let low = 0;
  let high = edges.length / EDGE_STRIDE;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (edges[middle * EDGE_STRIDE] < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function* prepareFarFromWireframeFlow(field: Field): ReturnType<PrepareFlow> {
  let base: Route | null = yield* buildRoute(
    field,
    Object.values(FAR_FROM_WIREFRAME_PLATES),
    false,
  );
  if (!base.edges.length) return null;
  const forms = new Map<string, Route>();
  for (const [form, mesh] of Object.entries(FAR_FROM_WIREFRAME_FORMS)) {
    if (form !== "standard") forms.set(form, yield* buildRoute(field, [mesh], true));
  }
  const limit = field.coarse ? FAR_FROM_WIRE_FLOW.coarse : FAR_FROM_WIRE_FLOW.fine;
  const wireLimit = Math.ceil(limit / 4);
  // Reuse one batch for the transient raised edges, and three for the chips.
  const wires = new Float32Array(wireLimit * WIRE_STRIDE);
  const chips = [0, 1, 2].map(() => new Float32Array(limit * CHIP_STRIDE));
  const counts = new Uint16Array(chips.length);
  return {
    draw(context, q, level, vs, ratio, form, tone = ICE) {
      const route = form ? forms.get(form) : base;
      if (!route?.edges.length) return null;
      const { edges, lead, tail } = route;
      const first = edgeBound(edges, q - tail);
      const last = edgeBound(edges, q + lead);
      if (first === last) return 0;

      const px = ratio / Math.max(vs, 1e-6);
      // One device px, in figure px: the chips' ceiling (nano pass,
      // 2026-11-21: a nanite is far below a pixel, so a chip is a glint of
      // a few thousand of them — never a square). The wires keep `px`: they
      // are the armour's macro construction, not nanites.
      const device = 1 / Math.max(vs, 1e-6);
      const budget = Math.round(limit * QUALITY[level]);
      const edgeBudget = Math.ceil(budget / 4);
      // Thin the edges by a fixed rank of each (a golden-ratio sequence over
      // the sorted edges), never by a stride: a stride that changed with the
      // window's size swapped the whole drawn set between frames (a pop);
      // a rank lets edges come and go one at a time (nanosuit pass,
      // 2026-11-20).
      const share = Math.min(1, edgeBudget / (last - first));
      const lift = form ? 18 : 24;
      let wireCount = 0;
      let drawn = 0;
      counts.fill(0);
      for (let i = first; i < last; i += 1) {
        if (share < 1 && (i * 0.6180339887) % 1 >= share) continue;
        const edge = i * EDGE_STRIDE;
        const arrive = edges[edge];
        const age = q - arrive;
        const seed = edges[edge + 7];
        const outline = edges[edge + 8] !== 0;
        const join = edges[edge + 9] !== 0;
        const ax = edges[edge + 2];
        const ay = edges[edge + 3];
        const bx = edges[edge + 4];
        const by = edges[edge + 5];
        const length = edges[edge + 6];
        const rise = smooth(clamp((age + lead) / (lead * 0.35)));
        if (rise < 0.04) continue;
        // Every edge attached to this vertex shares its projection. Junctions
        // stay welded as the raised net folds into the armour.
        const originAge = q - edges[edge + 1];
        const originRise = smooth(clamp((originAge + lead) / (lead * 0.35)));
        const near = (1 - smooth(clamp(originAge / (tail * 0.72)))) * lift * originRise;
        const far = (1 - smooth(clamp(age / (tail * 0.72)))) * lift * rise;
        const sx = ax + near * 0.44;
        const sy = ay - near;
        const ex = bx + far * 0.44;
        const ey = by - far;
        const head = clamp((age + lead) / lead);
        const tipX = sx + (ex - sx) * head;
        const tipY = sy + (ey - sy) * head;
        const at = wireCount++ * WIRE_STRIDE;
        wires[at] = sx;
        wires[at + 1] = sy;
        wires[at + 2] = tipX;
        wires[at + 3] = tipY;
        wires[at + 4] = bx;
        wires[at + 5] = by;
        wires[at + 6] = ex;
        wires[at + 7] = ey;
        wires[at + 8] = outline || (length > 10 && seed < 0.32) ? 1 : 0;

        // Several short, parallel streams feed the same contact. Smaller
        // chips follow behind the leading white chip and weld into the vertex.
        const feed = clamp(1 - age / (tail * 0.66));
        // (More, finer lanes since the nano pass: a stream of dust.)
        const lanes = Math.min(26, 10 + Math.floor(length / 2));
        const nx = (ay - by) / length;
        const ny = (bx - ax) / length;
        for (let k = 0; k < lanes && drawn < budget; k += 1) {
          const lag = (k + (k ? seed : 0)) / lanes;
          const u = head - lag * (0.72 + seed * 0.14) + Math.max(0, age) / (tail * 0.55);
          if (u < 0 || u > 1 || feed <= 0) continue;
          const lane = k === 0 ? 0 : ((k % 3) - 1) * (1.05 + seed) * rise * feed;
          const ink = k === 0 ? 2 : (i + k * 3) % 11 < 4 ? 1 : 0;
          const batch = chips[ink];
          const index = counts[ink]++ * CHIP_STRIDE;
          batch[index] = sx + (ex - sx) * u + nx * lane;
          batch[index + 1] = sy + (ey - sy) * u + ny * lane;
          // (At most one device px since the nano pass, 2026-11-21.)
          batch[index + 2] =
            device * (ink === 2 ? 1 : ink === 1 ? 0.9 : 0.8) * (0.76 + 0.24 * rise * feed);
          drawn += 1;
        }
        if (join && age >= 0 && age < tail * 0.34 && drawn < budget) {
          const index = counts[2]++ * CHIP_STRIDE;
          chips[2][index] = ex;
          chips[2][index + 1] = ey;
          chips[2][index + 2] = device * Math.max(0, 1 - (age / tail) * 1.2);
          drawn += 1;
        }
      }
      if (!wireCount) return 0;

      context.save();
      context.globalCompositeOperation = "lighter";
      // (Thinner wires since the nanosuit pass, 2026-11-20.)
      context.lineWidth = px * 0.4;
      context.strokeStyle = tone;
      context.globalAlpha = 0.3;
      context.beginPath();
      for (let i = 0; i < wireCount * WIRE_STRIDE; i += WIRE_STRIDE) {
        context.moveTo(wires[i], wires[i + 1]);
        context.lineTo(wires[i + 2], wires[i + 3]);
      }
      context.stroke();
      // Brighter channels follow the cutout and its larger mesh diagonals.
      // Keep these readable above the finer web and chip trains.
      context.lineWidth = px * 0.7;
      context.globalAlpha = 0.46;
      context.beginPath();
      for (let i = 0; i < wireCount * WIRE_STRIDE; i += WIRE_STRIDE) {
        if (!wires[i + 8]) continue;
        context.moveTo(wires[i], wires[i + 1]);
        context.lineTo(wires[i + 2], wires[i + 3]);
      }
      context.stroke();
      context.lineWidth = px * 0.42;
      context.globalAlpha = 0.35;
      context.strokeStyle = GOLD;
      context.beginPath();
      for (let i = 0; i < wireCount * WIRE_STRIDE; i += WIRE_STRIDE) {
        if (!wires[i + 8]) continue;
        const x = wires[i + 4];
        const y = wires[i + 5];
        const ex = wires[i + 6];
        const ey = wires[i + 7];
        // Attach side struts where the leading edge has reached its socket.
        const tipY = wires[i + 3];
        if (ey === tipY && y - ey > 1) {
          context.moveTo(x, y);
          context.lineTo(ex, ey);
        }
      }
      context.stroke();
      for (let ink = 0; ink < counts.length; ink += 1) {
        if (!counts[ink]) continue;
        const batch = chips[ink];
        context.fillStyle = ink === 0 ? tone : ink === 1 ? GOLD : WHITE;
        // (Dimmer since the nano pass: more of them, each a faint glint.)
        context.globalAlpha = ink === 0 ? 0.42 : ink === 1 ? 0.58 : 0.74;
        context.beginPath();
        for (let i = 0; i < counts[ink] * CHIP_STRIDE; i += CHIP_STRIDE) {
          const half = batch[i + 2] / 2;
          context.rect(batch[i] - half, batch[i + 1] - half, 2 * half, 2 * half);
        }
        context.fill();
      }
      context.restore();
      return drawn;
    },
    release() {
      base = null;
      forms.clear();
    },
  };
}
