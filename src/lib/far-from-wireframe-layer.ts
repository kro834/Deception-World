/** FAR FROM SAGA — the armour generated as a wireframe (2026-10-23; owner:
 * 「また、ファーフロムはワイヤーフレーム風の生成方式を採るように。」).
 *
 * Rexonance's armour is grown by nanites; FAR FROM's — the ultimate — is
 * engineered. Each plate is first CONSTRUCTED: its real outline traced, then
 * its mesh drawn out from its seat (far-from-wireframe.ts: a conforming
 * Delaunay mesh of the plate's own alpha, dense along the art's edges),
 * every edge growing from the vertex nearer the seat, a node lighting as the
 * line reaches it. The surface then fills facet by facet: each triangle
 * lights up and resolves into the plate's art (its gold still raw metal).
 * Last, a scan crosses each group — up the legs, the arms, the chest, the
 * waist on SA-GA！DEUS！, down the plume, the wings and the bits on FAR
 * FROM！, in onto the eyes over the helmet — and resolves the material: the
 * gold forms behind it and the wire retracts into the seams. The chest's
 * crystal (the reactor) keeps its rim as a wire ring until its pixel squares
 * fill it (the engine's, as the compound eyes').
 *
 * Every plate's times come from the engine's own plan (each facet fills when
 * the plan's tile under it lands: the beats, bottom first, from the seat
 * outward, the helmet from its outer layer in), so the calls, the HUD and the
 * landing order are exactly the scene's; the helmet runs a little ahead of
 * its tiles so it is whole, scanned, before the eyes fill.
 *
 * The chain of forms: the next form's wireframe draws over the current one
 * from the reactor out, then its facets fill from the reactor out, and the
 * last form's parts it lacks go with them.
 *
 * The engine (rexonance-resonance.js) calls this as RexonanceAssemblyConfig
 * `generation`: it keeps the undersuit's scan, the fire, the seal, the
 * light, the reactor's and the eyes' pixel squares, the rings and the 光輪;
 * this replaces the swarm, the plates' paint, the gold's pour and the field.
 *
 * Contracts (the engine's): every frame a closed-form function of the
 * progress (forward or back, at rest or moving); nothing allocated in a
 * frame (typed arrays made once, batched paths); no shadows, no filters, no
 * per-line blur — one stroke per bucket of lines (Android).
 */

import { ASSEMBLY_BEATS } from "./rexonance-resonance.js";
import { FAR_FROM_WIREFRAME_FORMS, FAR_FROM_WIREFRAME_PLATES } from "./far-from-wireframe.ts";
import {
  WIRE_UNIT,
  decodeWireMesh,
  triangulateWireMeshSteps,
  type WireMesh,
} from "./far-from-wireframe-mesh.ts";

type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
type Piece = Box & {
  readonly id: string;
  readonly group: string;
  readonly seat: readonly [number, number];
  readonly ax?: number;
  readonly ay?: number;
  readonly preset?: boolean;
};
type PlanTile = {
  readonly sx: number;
  readonly sy: number;
  readonly t1: number;
  readonly beat?: number;
  readonly pieceId: string | null;
};
type Plan = {
  readonly tiles: readonly PlanTile[];
  readonly cols: number;
  readonly rows: number;
  readonly tile: number;
};

/** The construction's times (shares of the runway's progress). */
export const FAR_FROM_WIRE_TIMING = Object.freeze({
  /** An interior edge is drawn this long before the facets it bounds fill. */
  lead: 0.02,
  /** The outline is traced this much earlier again. */
  outline: 0.012,
  /** An edge takes at least this long to draw from end to end. */
  grow: 0.004,
  /** A node lights this long as the line reaches it. */
  node: 0.005,
  /** A facet's light as it fills, then the art. */
  glow: 0.006,
  /** The wire over a filled facet holds, then fades to its trace. */
  hold: 0.004,
  fade: 0.008,
  /** The material scan over a group, and the seam's glow after it. */
  scan: 0.022,
  helmScan: 0.017,
  seam: 0.012,
  /** The helmet runs this far ahead of its tiles (whole before the eyes). */
  helmAhead: 0.022,
});

/** The same over the nanite build: the interior a cell's flight ahead of
 * the tiles it bounds (ASSEMBLY_BEATS' flight .05), the outline ahead of it. */
export const FAR_FROM_WIRE_OVERLAY_TIMING = Object.freeze({
  ...FAR_FROM_WIRE_TIMING,
  lead: 0.056,
  helmAhead: 0,
});

/** The boost (owner, 2026-10-30): debris drawn in to each forming plate (per
 * plate by tier, from `reach` figure px round it, turning `swirl` radians as
 * it closes over `span` of the progress, a streak `size` CSS px wide (ice,
 * gold) trailing `tail` of its course), and each plate's
 * lock: the flash and afterglow over `lock`, the shock outline growing
 * `grow` of the plate's size over `shock`. Calm draws the afterglow only. */
export const FAR_FROM_WIRE_BOOST = Object.freeze({
  motes: { desktop: 40, touch: 14 },
  reach: [30, 92] as const,
  swirl: 2.6,
  span: 0.036,
  size: [1.1, 1.5] as const,
  tail: 0.22,
  lock: 0.022,
  shock: 0.011,
  grow: 0.1,
});

/** The wire's look: line widths (CSS px) and the light of each kind. */
export const FAR_FROM_WIRE_STYLE = Object.freeze({
  outline: 1.15,
  edge: 0.6,
  front: 1.35,
  node: 1.8,
  head: 8,
  scan: 1.4,
  scanBand: 5,
});

// The palette: ice, gold, white (FAR FROM's).
const ICE = "rgb(127 230 255)";
const PALE = "rgb(206 246 255)";
const WHITE = "rgb(244 251 255)";
const GOLD = "rgb(255 215 122)";
const SCAN = "rgb(255 238 190)";
const KEYLINE = "rgb(3 8 18)";

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const EMPTY = new Float32Array(0);
/** The muffler's plates: its neck wrap and its streamers. */
const RIBBED = /^(collar|ribbon-)/;
const smooth = (u: number) => u * u * (3 - 2 * u);
const hash = (i: number, salt: number) => {
  let x = Math.imul((i + 1) ^ Math.imul(salt + 0x51ed27, 0x9e3779b1), 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

/** The groups the construction runs in (the engine's beats): legs, arms,
 * chest and shoulders, waist, the ornaments, the helmet. */
const BEAT_OF_GROUP: Readonly<Record<string, number>> = {
  legs: 0,
  arms: 1,
  chest: 2,
  shoulders: 2,
  waist: 3,
  tail: 4,
  ribbon: 4,
  bits: 4,
  helm: 5,
};
const beatWindow = (beat: number): readonly [number, number] => {
  const B = ASSEMBLY_BEATS;
  if (beat <= 3) {
    const step = (B.deus[1] - B.deus[0]) / 4;
    return [B.deus[0] + beat * step, B.deus[0] + (beat + 1) * step];
  }
  if (beat === 4) return B.rexonance;
  return [B.rexonance[0] + 0.06, B.clamp - 0.012];
};

/** One plate's construction, prepared once. */
type WirePlate = {
  readonly index: number;
  readonly id: string;
  readonly beat: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ax: number;
  readonly ay: number;
  /** Vertices (figure px), the outline's loops first. */
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly loopStart: Int32Array;
  readonly loopCount: Int32Array;
  readonly outline: number;
  /** When the wire reaches each vertex. */
  readonly vt: Float32Array;
  /** Triangles: vertices, and when each fills. */
  readonly tri: Int32Array;
  readonly tf: Float32Array;
  /** Edges: ends (from the earlier), start/end times, when their facets are
   * all filled, whether on the outline. */
  readonly ea: Int32Array;
  readonly eb: Int32Array;
  readonly e0: Float32Array;
  readonly e1: Float32Array;
  readonly ef: Float32Array;
  readonly eo: Uint8Array;
  /** The muffler's ribs (a ribbon's contour lines across it, from its root
   * to its tip): segments, and when each is drawn. */
  readonly rib: Float32Array;
  readonly rt: Float32Array;
  first: number;
  fillStart: number;
  fillEnd: number;
  wireEnd: number;
};

/** One group's material scan. */
type WireGroup = {
  readonly plates: number[];
  from: number;
  to: number;
  /** "up" (a DEUS！ group), "down" (the ornaments), "in" (the helmet). */
  readonly mode: 0 | 1 | 2;
  top: number;
  bottom: number;
  reach: number;
};

/** One form's wireframe (the chain's overwrite). */
type WireForm = {
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly tri: Int32Array;
  readonly tk: Float32Array;
  /** Each facet's farthest vertex from the reactor, and the form's reach. */
  readonly td: Float32Array;
  readonly reach: number;
  readonly ea: Int32Array;
  readonly eb: Int32Array;
  readonly ek: Float32Array;
  readonly eo: Uint8Array;
};

export type FarFromWireInput = {
  readonly document: Document;
  readonly size: { readonly width: number; readonly height: number };
  readonly pieces: readonly Piece[];
  readonly plan: Plan;
  readonly core: readonly [number, number];
  readonly visor: readonly [number, number];
  readonly coarse: boolean;
  readonly reactorGlow?: readonly (readonly [number, number])[];
  /** The figure with its lights held back, and the plates' gold unformed. */
  readonly unlit: CanvasImageSource;
  readonly gold?: CanvasImageSource | null;
  /** The form meshes to prepare (the chain's keys and "standard"). */
  readonly forms?: readonly string[];
  /** Over the nanite build (FAR FROM, 2026-10-24: 「ナノマシンによる生成を
   * ワイヤーフレームと組み合わせて」): only the wire, the facets' light, the
   * scans' lines, the ribs and the rim; the swarm paints the plates. */
  readonly overlay?: boolean;
};

export type FarFromWireLayer = {
  /** The armour at `progress` (the engine calls it until the seal is
   * whole), on a context in figure px; `vs` device px per figure px,
   * `ratio` device px per CSS px. */
  draw(context: CanvasRenderingContext2D, progress: number, calm: boolean, vs: number, ratio: number): void;
  /** One change of the chain: `from` (the current form's sheet) overwritten
   * by `to` at `u` (0–1). False when the forms are not prepared. */
  form(
    context: CanvasRenderingContext2D,
    from: CanvasImageSource,
    to: CanvasImageSource,
    fromKey: string,
    toKey: string,
    u: number,
    tone: string,
    calm: boolean,
    vs: number,
    ratio: number,
  ): boolean;
  release(): void;
  /** For tests: the prepared construction. */
  readonly plates: readonly WirePlate[];
  readonly groups: readonly WireGroup[];
};

/** Edges of a triangulation: unique (u, v), whether on the outline. */
function meshEdges(tri: Int32Array, outline: number, loopStart: Int32Array, loopCount: Int32Array) {
  const seen = new Map<number, number>();
  const us: number[] = [];
  const vs: number[] = [];
  const adj: number[][] = [];
  for (let t = 0; t < tri.length; t += 3)
    for (let k = 0; k < 3; k += 1) {
      const a = tri[t + k];
      const b = tri[t + ((k + 1) % 3)];
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      let e = seen.get(key);
      if (e === undefined) {
        e = us.length;
        seen.set(key, e);
        us.push(a);
        vs.push(b);
        adj.push([]);
      }
      adj[e].push(t / 3);
    }
  const onLoop = new Uint8Array(us.length);
  for (let L = 0; L < loopStart.length; L += 1) {
    const first = loopStart[L];
    const n = loopCount[L];
    for (let k = 0; k < n; k += 1) {
      const a = first + k;
      const b = first + ((k + 1) % n);
      const e = seen.get(a < b ? a * 65536 + b : b * 65536 + a);
      if (e !== undefined) onLoop[e] = 1;
    }
  }
  void outline;
  return { us, vs, adj, onLoop };
}

/** A plate without a stored mesh (the suit cut again since the wireframe
 * build): its plan tiles as two triangles each, its box's outline. */
function tileMesh(piece: Piece, plan: Plan): WireMesh | null {
  const own = plan.tiles.filter((tile) => tile.pieceId === piece.id);
  if (!own.length) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const corner = new Map<number, number>();
  const at = (x: number, y: number) => {
    const key = Math.round(y) * 65536 + Math.round(x);
    let i = corner.get(key);
    if (i === undefined) {
      i = xs.length;
      corner.set(key, i);
      xs.push(Math.round(x * WIRE_UNIT));
      ys.push(Math.round(y * WIRE_UNIT));
    }
    return i;
  };
  const x0 = Math.min(...own.map((t) => t.sx));
  const y0 = Math.min(...own.map((t) => t.sy));
  const x1 = Math.max(...own.map((t) => t.sx + plan.tile));
  const y1 = Math.max(...own.map((t) => t.sy + plan.tile));
  // The box's outline as the loop, then the tiles' corners inside it.
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ])
    at(x, y);
  for (const tile of own) {
    at(tile.sx, tile.sy);
    at(tile.sx + plan.tile, tile.sy);
    at(tile.sx, tile.sy + plan.tile);
    at(tile.sx + plan.tile, tile.sy + plan.tile);
  }
  return {
    xs: Int32Array.from(xs),
    ys: Int32Array.from(ys),
    loopStart: Int32Array.of(0),
    loopCount: Int32Array.of(4),
    outline: 4,
  };
}

/**
 * Prepares the construction: each plate's mesh triangulated, its edges, its
 * times from the plan; each group's scan; the plates' art cut to their
 * meshes (one sheet in raw metal, one finished); the forms' meshes. A
 * generator for the engine's idle slices; null if nothing can be drawn.
 */
export function* prepareFarFromWireframe(
  input: FarFromWireInput,
): Generator<undefined, FarFromWireLayer | null, unknown> {
  // Over the swarm the wire leads the cells' whole flight, so they stream
  // in along it.
  const T = input.overlay ? FAR_FROM_WIRE_OVERLAY_TIMING : FAR_FROM_WIRE_TIMING;
  const { plan, pieces, document } = input;
  const { cols, rows, tile } = plan;
  // The plan's tiles by cell: when each lands, and whose it is.
  const ids = new Map<string, number>();
  pieces.forEach((piece, index) => ids.set(piece.id, index));
  const cellT = new Float32Array(cols * rows).fill(-1);
  const cellP = new Int16Array(cols * rows).fill(-1);
  const tilesOf = new Map<number, number[]>();
  const beatVotes = new Map<number, number[]>();
  for (let i = 0; i < plan.tiles.length; i += 1) {
    if (i && i % 512 === 0) yield;
    const t = plan.tiles[i];
    const index = t.pieceId != null ? (ids.get(t.pieceId) ?? -1) : -1;
    if (index < 0) continue;
    const cell = Math.floor(t.sy / tile) * cols + Math.floor(t.sx / tile);
    if (cell >= 0 && cell < cellT.length) {
      cellT[cell] = t.t1;
      cellP[cell] = index;
    }
    let list = tilesOf.get(index);
    if (!list) tilesOf.set(index, (list = []));
    list.push(t.t1);
    const beat = t.beat ?? -1;
    let votes = beatVotes.get(index);
    if (!votes) beatVotes.set(index, (votes = [0, 0, 0, 0, 0, 0]));
    if (beat >= 0 && beat < 6) votes[beat] += 1;
  }
  // When the plan has plate `p` land at (x, y): its tile there, else its
  // nearest tile within three cells, else its median.
  const landing = (p: number, x: number, y: number, median: number) => {
    const c = Math.floor(x / tile);
    const r = Math.floor(y / tile);
    for (let ring = 0; ring <= 3; ring += 1) {
      let best = -1;
      let bestD = Infinity;
      for (let dy = -ring; dy <= ring; dy += 1)
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const cc = c + dx;
          const rr = r + dy;
          if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
          const cell = rr * cols + cc;
          if (cellP[cell] !== p) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = cell;
          }
        }
      if (best >= 0) return cellT[best];
    }
    return median;
  };

  const plates: WirePlate[] = [];
  for (const [index, piece] of pieces.entries()) {
    if (piece.preset) continue;
    yield;
    const mesh = decodeWireMesh(FAR_FROM_WIREFRAME_PLATES[piece.id]) ?? tileMesh(piece, plan);
    if (!mesh) continue;
    const tri = yield* triangulateWireMeshSteps(mesh);
    if (!tri.length) continue;
    const n = mesh.xs.length;
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      vx[i] = mesh.xs[i] / WIRE_UNIT;
      vy[i] = mesh.ys[i] / WIRE_UNIT;
    }
    const votes = beatVotes.get(index);
    let beat = BEAT_OF_GROUP[piece.group] ?? 2;
    if (votes) {
      let most = -1;
      for (let b = 0; b < 6; b += 1)
        if (votes[b] > most) {
          most = votes[b];
          beat = votes[b] > 0 ? b : beat;
        }
    }
    const [from, to] = beatWindow(beat);
    const own = (tilesOf.get(index) ?? []).slice().sort((a, b) => a - b);
    const median = own.length ? own[Math.floor(own.length / 2)] : (from + to) / 2;
    const ahead = beat === 5 ? T.helmAhead : 0;
    // Each facet fills when the plan's tile under its centroid lands, the
    // plan's small noise smoothed over the facet's neighbours, so the fill
    // runs as one front.
    const nt = tri.length / 3;
    const tf = new Float32Array(nt);
    for (let t = 0; t < nt; t += 1) {
      const a = tri[t * 3];
      const b = tri[t * 3 + 1];
      const c = tri[t * 3 + 2];
      tf[t] = landing(index, (vx[a] + vx[b] + vx[c]) / 3, (vy[a] + vy[b] + vy[c]) / 3, median);
    }
    const edges = meshEdges(tri, mesh.outline, mesh.loopStart, mesh.loopCount);
    {
      const next = new Float32Array(nt);
      const sums = new Float32Array(nt);
      const counts = new Uint16Array(nt);
      for (let pass = 0; pass < 3; pass += 1) {
        sums.fill(0);
        counts.fill(0);
        for (const adj of edges.adj) {
          if (adj.length !== 2) continue;
          sums[adj[0]] += tf[adj[1]];
          counts[adj[0]] += 1;
          sums[adj[1]] += tf[adj[0]];
          counts[adj[1]] += 1;
        }
        for (let t = 0; t < nt; t += 1)
          next[t] = counts[t] ? (tf[t] * 2 + sums[t]) / (2 + counts[t]) : tf[t];
        tf.set(next);
      }
    }
    for (let t = 0; t < nt; t += 1) tf[t] = Math.max(from + T.lead + T.outline, tf[t] - ahead);
    let fillFirst = Infinity;
    for (let t = 0; t < nt; t += 1) if (tf[t] < fillFirst) fillFirst = tf[t];
    // The interior's vertices are reached a lead before the first facet
    // they bound fills.
    const vt = new Float32Array(n).fill(Infinity);
    for (let t = 0; t < nt; t += 1)
      for (let k = 0; k < 3; k += 1) {
        const v = tri[t * 3 + k];
        if (v < mesh.outline) continue;
        const at = tf[t] - T.lead;
        if (at < vt[v]) vt[v] = at;
      }
    // The outline is traced first, as two pens from its point nearest the
    // seat running round it both ways to meet on the far side, at a pace by
    // its length; every loop of it (an island, a hole) from its own nearest
    // point, a little later the farther that is from the seat.
    {
      const [seatX, seatY] = piece.seat;
      let perimeter = 0;
      for (let L = 0; L < mesh.loopStart.length; L += 1) {
        const start = mesh.loopStart[L];
        const count = mesh.loopCount[L];
        for (let k = 0; k < count; k += 1) {
          const a = start + k;
          const b = start + ((k + 1) % count);
          perimeter += Math.hypot(vx[b] - vx[a], vy[b] - vy[a]);
        }
      }
      const span = Math.min(0.02, Math.max(0.007, 0.004 + perimeter / 42000));
      const pace = span / Math.max(1, perimeter / 2);
      const traceFrom = Math.max(from, fillFirst - T.lead - T.outline);
      for (let L = 0; L < mesh.loopStart.length; L += 1) {
        const start = mesh.loopStart[L];
        const count = mesh.loopCount[L];
        let nearest = 0;
        let best = Infinity;
        for (let k = 0; k < count; k += 1) {
          const d = (vx[start + k] - seatX) ** 2 + (vy[start + k] - seatY) ** 2;
          if (d < best) {
            best = d;
            nearest = k;
          }
        }
        const offset = Math.min(0.01, Math.sqrt(best) * pace * 0.5);
        // Arc length from the nearest point, forward and back; the lesser.
        const forward = new Float32Array(count);
        for (let step = 1; step < count; step += 1) {
          const a = start + ((nearest + step - 1) % count);
          const b = start + ((nearest + step) % count);
          forward[step] = forward[step - 1] + Math.hypot(vx[b] - vx[a], vy[b] - vy[a]);
        }
        const total =
          forward[count - 1] +
          Math.hypot(
            vx[start + nearest] - vx[start + ((nearest + count - 1) % count)],
            vy[start + nearest] - vy[start + ((nearest + count - 1) % count)],
          );
        for (let step = 0; step < count; step += 1) {
          const v = start + ((nearest + step) % count);
          vt[v] = traceFrom + offset + Math.min(forward[step], total - forward[step]) * pace;
        }
      }
    }
    for (let v = 0; v < n; v += 1) if (vt[v] < from) vt[v] = from;
    // No interior line before the outline beside it.
    for (let e = 0; e < edges.us.length; e += 1) {
      const a = edges.us[e];
      const b = edges.vs[e];
      if (a < mesh.outline && b >= mesh.outline && vt[b] < vt[a]) vt[b] = vt[a];
      else if (b < mesh.outline && a >= mesh.outline && vt[a] < vt[b]) vt[a] = vt[b];
    }
    const ne = edges.us.length;
    const ea = new Int32Array(ne);
    const eb = new Int32Array(ne);
    const e0 = new Float32Array(ne);
    const e1 = new Float32Array(ne);
    const ef = new Float32Array(ne);
    const eo = Uint8Array.from(edges.onLoop);
    let first = Infinity;
    let fillStart = Infinity;
    let fillEnd = -Infinity;
    for (let e = 0; e < ne; e += 1) {
      let a = edges.us[e];
      let b = edges.vs[e];
      if (vt[b] < vt[a]) {
        const s = a;
        a = b;
        b = s;
      }
      ea[e] = a;
      eb[e] = b;
      // An outline segment is the pen's own stroke; an interior edge is
      // drawn quickly once the front reaches its later end, from the earlier.
      const onOutline = edges.onLoop[e] === 1;
      e0[e] = onOutline ? vt[a] : Math.max(vt[a], vt[b] - T.grow);
      e1[e] = onOutline ? Math.max(vt[b], vt[a] + 0.0005) : vt[b] + (vt[b] - vt[a] < T.grow ? T.grow * 0.5 : 0);
      let filled = -Infinity;
      for (const t of edges.adj[e]) filled = Math.max(filled, tf[t]);
      ef[e] = filled;
      if (e0[e] < first) first = e0[e];
    }
    for (let t = 0; t < nt; t += 1) {
      if (tf[t] < fillStart) fillStart = tf[t];
      if (tf[t] > fillEnd) fillEnd = tf[t];
    }
    // The muffler (its neck wrap and its streamers) is drawn as a wire
    // ribbon: contour lines of its fill's front, every 10 px or so from its
    // root to its tip, each drawn as the wire's front passes it.
    let rib = EMPTY;
    let rt = EMPTY;
    if (RIBBED.test(piece.id) && fillEnd > fillStart) {
      const vf = new Float32Array(n);
      const vc = new Uint16Array(n);
      for (let t = 0; t < nt; t += 1)
        for (let k = 0; k < 3; k += 1) {
          vf[tri[t * 3 + k]] += tf[t];
          vc[tri[t * 3 + k]] += 1;
        }
      for (let v = 0; v < n; v += 1) vf[v] = vc[v] ? vf[v] / vc[v] : fillStart;
      const length = Math.hypot(piece.w, piece.h);
      const levels = Math.max(6, Math.min(28, Math.round(length / 10)));
      const out: number[] = [];
      const when: number[] = [];
      for (let level = 0; level < levels; level += 1) {
        const at = fillStart + ((level + 0.5) / levels) * (fillEnd - fillStart);
        for (let t = 0; t < nt; t += 1) {
          let found = 0;
          let x0 = 0;
          let y0 = 0;
          for (let k = 0; k < 3; k += 1) {
            const a = tri[t * 3 + k];
            const b = tri[t * 3 + ((k + 1) % 3)];
            const fa = vf[a];
            const fb = vf[b];
            if (fa < at === fb < at || fa === fb) continue;
            const g = (at - fa) / (fb - fa);
            const x = vx[a] + (vx[b] - vx[a]) * g;
            const y = vy[a] + (vy[b] - vy[a]) * g;
            if (!found) {
              x0 = x;
              y0 = y;
              found = 1;
            } else {
              out.push(x0, y0, x, y);
              when.push(at - T.lead);
              break;
            }
          }
        }
      }
      rib = Float32Array.from(out);
      rt = Float32Array.from(when);
    }
    plates.push({
      index,
      id: piece.id,
      beat,
      x: piece.x,
      y: piece.y,
      w: piece.w,
      h: piece.h,
      ax: piece.ax ?? 0,
      ay: piece.ay ?? 0,
      vx,
      vy,
      loopStart: mesh.loopStart,
      loopCount: mesh.loopCount,
      outline: mesh.outline,
      vt,
      tri,
      tf,
      ea,
      eb,
      e0,
      e1,
      ef,
      eo,
      rib,
      rt,
      first,
      fillStart,
      fillEnd,
      wireEnd: Infinity,
    });
  }
  if (!plates.length) return null;

  // Each group's scan: once its last facet has filled, up (a DEUS！ group),
  // down (the ornaments) or in onto the eyes (the helmet).
  const [visorX, visorY] = input.visor;
  const groups: WireGroup[] = [];
  for (let beat = 0; beat < 6; beat += 1) {
    const members = plates.flatMap((plate, k) => (plate.beat === beat ? [k] : []));
    if (!members.length) continue;
    let last = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    let reach = 1;
    for (const k of members) {
      const plate = plates[k];
      last = Math.max(last, plate.fillEnd);
      top = Math.min(top, plate.y);
      bottom = Math.max(bottom, plate.y + plate.h);
      for (let v = 0; v < plate.vx.length; v += 1)
        reach = Math.max(reach, Math.hypot(plate.vx[v] - visorX, plate.vy[v] - visorY));
    }
    const span = beat === 5 ? T.helmScan : T.scan;
    let from = last + 0.004;
    // The helmet is scanned whole before the compound eyes fill.
    if (beat === 5) from = Math.min(from, ASSEMBLY_BEATS.pixels[0] - 0.002 - span);
    const group: WireGroup = {
      plates: members,
      from,
      to: from + span,
      mode: beat === 5 ? 2 : beat === 4 ? 1 : 0,
      top: top - 2,
      bottom: bottom + 2,
      reach: reach + 2,
    };
    groups.push(group);
    for (const k of members) plates[k].wireEnd = group.to + T.seam;
    yield;
  }
  const groupOf = new Int16Array(plates.length).fill(-1);
  groups.forEach((group, g) => {
    for (const k of group.plates) groupOf[k] = g;
  });

  // The art, cut to each plate's mesh (its outline, a pixel out): one sheet
  // with the gold still raw metal, one finished — both in the plates'
  // atlas layout, so a plate is one draw.
  let atlasW = 1;
  let atlasH = 1;
  for (const plate of plates) {
    atlasW = Math.max(atlasW, plate.ax + plate.w);
    atlasH = Math.max(atlasH, plate.ay + plate.h);
  }
  const make = (w: number, h: number) =>
    Object.assign(document.createElement("canvas"), { width: w, height: h });
  // (Over the swarm no art is cut: the nanites paint it.)
  const rawSheet = input.overlay ? make(1, 1) : make(atlasW, atlasH);
  const finSheet = input.overlay ? make(1, 1) : make(atlasW, atlasH);
  const scratch = make(1, 1);
  const rc = rawSheet.getContext("2d");
  const fc = finSheet.getContext("2d");
  const sc = scratch.getContext("2d");
  if (!rc || !fc || !sc) {
    rawSheet.width = rawSheet.height = finSheet.width = finSheet.height = 0;
    scratch.width = scratch.height = 0;
    return null;
  }
  const outlinePath = (context: CanvasRenderingContext2D, plate: WirePlate, dx: number, dy: number) => {
    context.beginPath();
    for (let L = 0; L < plate.loopStart.length; L += 1) {
      const start = plate.loopStart[L];
      const count = plate.loopCount[L];
      for (let k = 0; k < count; k += 1) {
        const v = start + k;
        if (k) context.lineTo(plate.vx[v] + dx, plate.vy[v] + dy);
        else context.moveTo(plate.vx[v] + dx, plate.vy[v] + dy);
      }
      context.closePath();
    }
  };
  for (const plate of input.overlay ? [] : plates) {
    yield;
    const { x, y, w, h, ax, ay } = plate;
    for (const [target, raw] of [
      [fc, false],
      [rc, true],
    ] as const) {
      scratch.width = w;
      scratch.height = h;
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalCompositeOperation = "source-over";
      sc.fillStyle = "#fff";
      sc.strokeStyle = "#fff";
      sc.lineWidth = 2;
      sc.lineJoin = "round";
      // The mask: the outline filled and stroked (a pixel out).
      outlinePath(sc, plate, -x, -y);
      sc.fill("evenodd");
      sc.stroke();
      sc.globalCompositeOperation = "source-in";
      sc.drawImage(input.unlit, x, y, w, h, 0, 0, w, h);
      if (raw && input.gold) {
        // Its gold still raw metal: the gold atlas's gunmetal channel over it.
        sc.globalCompositeOperation = "source-atop";
        sc.drawImage(input.gold, ax, ay, w, h, 0, 0, w, h);
      }
      sc.globalCompositeOperation = "source-over";
      target.drawImage(scratch, ax, ay);
    }
  }
  scratch.width = scratch.height = 0;

  // The forms' meshes (the chain), each facet and edge keyed by its
  // distance from the reactor (a little noise), for the overwrite.
  const [coreX, coreY] = input.core;
  const forms = new Map<string, WireForm>();
  for (const key of input.forms ?? []) {
    const mesh = decodeWireMesh(FAR_FROM_WIREFRAME_FORMS[key]);
    if (!mesh) continue;
    yield;
    const tri = yield* triangulateWireMeshSteps(mesh);
    const n = mesh.xs.length;
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    let reach = 1;
    for (let i = 0; i < n; i += 1) {
      vx[i] = mesh.xs[i] / WIRE_UNIT;
      vy[i] = mesh.ys[i] / WIRE_UNIT;
      reach = Math.max(reach, Math.hypot(vx[i] - coreX, vy[i] - coreY));
    }
    const nt = tri.length / 3;
    const tk = new Float32Array(nt);
    const td = new Float32Array(nt);
    for (let t = 0; t < nt; t += 1) {
      const a = tri[t * 3];
      const b = tri[t * 3 + 1];
      const c = tri[t * 3 + 2];
      const d = Math.hypot((vx[a] + vx[b] + vx[c]) / 3 - coreX, (vy[a] + vy[b] + vy[c]) / 3 - coreY);
      tk[t] = clamp01((d / reach) * 0.9 + hash(t, 61) * 0.1);
      td[t] = Math.max(
        Math.hypot(vx[a] - coreX, vy[a] - coreY),
        Math.hypot(vx[b] - coreX, vy[b] - coreY),
        Math.hypot(vx[c] - coreX, vy[c] - coreY),
      );
    }
    const edges = meshEdges(tri, mesh.outline, mesh.loopStart, mesh.loopCount);
    const ne = edges.us.length;
    const ea = Int32Array.from(edges.us);
    const eb = Int32Array.from(edges.vs);
    const ek = new Float32Array(ne);
    for (let e = 0; e < ne; e += 1) {
      const d = Math.hypot((vx[ea[e]] + vx[eb[e]]) / 2 - coreX, (vy[ea[e]] + vy[eb[e]]) / 2 - coreY);
      ek[e] = clamp01((d / reach) * 0.9 + hash(e, 67) * 0.1);
    }
    forms.set(key, { vx, vy, tri, tk, td, reach, ea, eb, ek, eo: Uint8Array.from(edges.onLoop) });
  }

  // Per-frame buffers, made once: the wire's segments by kind, the facets'
  // light by tone and age, the nodes, the scan's crossings.
  let maxEdges = 0;
  let maxTris = 0;
  let maxLoop = 0;
  for (const plate of plates) {
    maxEdges += plate.ea.length + plate.rt.length;
    maxTris += plate.tf.length;
    for (let L = 0; L < plate.loopCount.length; L += 1) maxLoop = Math.max(maxLoop, plate.loopCount[L]);
  }
  for (const form of forms.values()) {
    maxEdges = Math.max(maxEdges, form.ea.length);
    maxTris = Math.max(maxTris, form.tk.length);
  }
  const KINDS = 5;
  const segs = Array.from({ length: KINDS }, () => new Float32Array(maxEdges * 4));
  const segCount = new Int32Array(KINDS);
  const GLOWS = 6;
  const glows = Array.from({ length: GLOWS }, () => new Float32Array(maxTris * 6));
  const glowCount = new Int32Array(GLOWS);
  const nodes = new Float32Array(maxEdges * 2 + 16);
  const crossings = new Float64Array(Math.max(16, plates.reduce((n, p) => n + p.outline, 0) * 2 + 8));
  const scanSegs = new Float32Array(crossings.length * 2 + 8);
  // The boost (owner, 2026-10-30: 「ナノマシンの装着遷移アニメーションと
  // スクロールアニメーションを強化して」): debris drawn in to each plate as it
  // forms, spiralling in from round its seat; each outline pen's head a
  // scan head; and each plate's lock — its outline flashes and leaves an
  // afterglow while a shock outline grows off it — then its group's lock at
  // the scan's end, the whole group's outline at once. Made once, here.
  const B = FAR_FROM_WIRE_BOOST;
  const perPlate = input.coarse ? B.motes.touch : B.motes.desktop;
  const moteTotal = perPlate * plates.length;
  const moteX = new Float32Array(moteTotal);
  const moteY = new Float32Array(moteTotal);
  const moteA = new Float32Array(moteTotal);
  const moteR = new Float32Array(moteTotal);
  const moteT0 = new Float32Array(moteTotal);
  const moteT1 = new Float32Array(moteTotal);
  const moteTone = new Uint8Array(moteTotal);
  const plateCX = new Float32Array(plates.length);
  const plateCY = new Float32Array(plates.length);
  let outlineMax = 0;
  for (let k = 0; k < plates.length; k += 1) {
    const plate = plates[k];
    plateCX[k] = plate.x + plate.w / 2;
    plateCY[k] = plate.y + plate.h / 2;
    outlineMax += plate.outline;
    const n = plate.vx.length;
    const open = Math.max(plate.first, plate.fillStart - B.span * 0.4);
    const close = Math.max(open + 0.002, plate.fillEnd);
    for (let m = 0; m < perPlate; m += 1) {
      const i = k * perPlate + m;
      const h1 = hash(i, 101);
      const h2 = hash(i, 202);
      const h3 = hash(i, 303);
      // Most land on the outline (the seams), the rest on the surface.
      const v = Math.min(n - 1, Math.floor((h1 < 0.6 ? h1 / 0.6 : h1) * (h1 < 0.6 ? plate.outline : n)));
      moteX[i] = plate.vx[v];
      moteY[i] = plate.vy[v];
      const out = Math.atan2(plate.vy[v] - plateCY[k], plate.vx[v] - plateCX[k]);
      moteA[i] = out + (h2 - 0.5) * 1.4;
      moteR[i] = B.reach[0] + (B.reach[1] - B.reach[0]) * h3;
      moteT1[i] = open + (close - open) * hash(i, 404);
      moteT0[i] = moteT1[i] - B.span * (0.7 + 0.6 * h2);
      moteTone[i] = h3 < 0.2 ? 1 : 0;
    }
  }
  // Each streak a curve of four points along its spiral.
  const motes = [new Float32Array(moteTotal * 8), new Float32Array(moteTotal * 8)];
  const moteCount = new Int32Array(2);
  const heads = new Float32Array(maxEdges * 2 + 16);
  // Lock lines: 0 the fresh flash and the shock outline, 1 the afterglow.
  const locks = [new Float32Array(outlineMax * 8 + 16), new Float32Array(outlineMax * 8 + 16)];
  const lockCount = new Int32Array(2);
  // The reactor's rim: its outline a little outside the crystal's own frame
  // (scaled about the outline's centre), so the ring reads over the frame.
  const reactor = input.reactorGlow?.length ? Float32Array.from(input.reactorGlow.flat()) : null;
  if (reactor) {
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < reactor.length; k += 2) {
      cx += reactor[k];
      cy += reactor[k + 1];
    }
    cx /= reactor.length / 2;
    cy /= reactor.length / 2;
    for (let k = 0; k < reactor.length; k += 2) {
      reactor[k] = cx + (reactor[k] - cx) * 1.1;
      reactor[k + 1] = cy + (reactor[k + 1] - cy) * 1.1;
    }
  }
  let reactorLength = 0;
  if (reactor)
    for (let k = 0; k < reactor.length / 2; k += 1) {
      const j = (k + 1) % (reactor.length / 2);
      reactorLength += Math.hypot(reactor[j * 2] - reactor[k * 2], reactor[j * 2 + 1] - reactor[k * 2 + 1]);
    }
  // The reactor's rim forms with the crystal's own wire.
  let rimFrom = Infinity;
  for (const plate of plates) if (/^crystal/.test(plate.id)) rimFrom = Math.min(rimFrom, plate.first);
  const RIM = { from: rimFrom, trace: 0.02, fill: ASSEMBLY_BEATS.pixels[0], gone: 0.885 };

  // Kinds of line: 0 the outline, 1 an interior edge, 2 a line being drawn,
  // 3 the faint trace over filled facets, 4 the seam after the scan.
  const KIND_STYLE = [PALE, ICE, WHITE, ICE, GOLD];
  const KIND_ALPHA = [0.82, 0.42, 0.7, 0.14, 0.75];
  const KIND_WIDTH = [
    FAR_FROM_WIRE_STYLE.outline,
    FAR_FROM_WIRE_STYLE.edge,
    FAR_FROM_WIRE_STYLE.front,
    FAR_FROM_WIRE_STYLE.edge,
    FAR_FROM_WIRE_STYLE.outline,
  ];
  // The facets' light: three tones × two ages.
  const GLOW_STYLE = [ICE, ICE, WHITE, WHITE, GOLD, GOLD];
  const GLOW_ALPHA = [0.3, 0.13, 0.26, 0.11, 0.3, 0.13];

  /* -- draw passes: allocation-free from here -- */

  const pushSeg = (kind: number, x0: number, y0: number, x1: number, y1: number) => {
    const at = segCount[kind];
    const buffer = segs[kind];
    buffer[at] = x0;
    buffer[at + 1] = y0;
    buffer[at + 2] = x1;
    buffer[at + 3] = y1;
    segCount[kind] = at + 4;
  };
  const pushGlow = (bucket: number, plate: WirePlate | WireForm, t: number) => {
    const at = glowCount[bucket];
    const buffer = glows[bucket];
    const a = plate.tri[t * 3];
    const b = plate.tri[t * 3 + 1];
    const c = plate.tri[t * 3 + 2];
    buffer[at] = plate.vx[a];
    buffer[at + 1] = plate.vy[a];
    buffer[at + 2] = plate.vx[b];
    buffer[at + 3] = plate.vy[b];
    buffer[at + 4] = plate.vx[c];
    buffer[at + 5] = plate.vy[c];
    glowCount[bucket] = at + 6;
  };
  const flushGlows = (context: CanvasRenderingContext2D, light: number) => {
    for (let bucket = 0; bucket < GLOWS; bucket += 1) {
      const count = glowCount[bucket];
      if (!count) continue;
      const buffer = glows[bucket];
      context.beginPath();
      for (let i = 0; i < count; i += 6) {
        context.moveTo(buffer[i], buffer[i + 1]);
        context.lineTo(buffer[i + 2], buffer[i + 3]);
        context.lineTo(buffer[i + 4], buffer[i + 5]);
        context.closePath();
      }
      context.globalAlpha = GLOW_ALPHA[bucket] * light;
      context.fillStyle = GLOW_STYLE[bucket];
      context.fill();
    }
  };
  // Each bucket of lines in one stroke; over a finished form (`tone`) each
  // line is cased first — a dark keyline under it (source-over), so the next
  // form's wire reads over the art — then lit (lighter).
  const flushSegs = (context: CanvasRenderingContext2D, px: number, tone: string | null) => {
    for (let kind = 0; kind < KINDS; kind += 1) {
      const count = segCount[kind];
      if (!count) continue;
      const buffer = segs[kind];
      context.beginPath();
      for (let i = 0; i < count; i += 4) {
        context.moveTo(buffer[i], buffer[i + 1]);
        context.lineTo(buffer[i + 2], buffer[i + 3]);
      }
      if (tone) {
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = 0.5 * KIND_ALPHA[kind];
        context.strokeStyle = KEYLINE;
        context.lineWidth = (KIND_WIDTH[kind] + 1.6) * px;
        context.stroke();
        context.globalCompositeOperation = "lighter";
      }
      // (Over a form, the next form's outline in its own light.)
      context.globalAlpha = tone ? Math.min(1, KIND_ALPHA[kind] * 1.7) : KIND_ALPHA[kind];
      context.strokeStyle = tone && kind === 0 ? tone : KIND_STYLE[kind];
      context.lineWidth = KIND_WIDTH[kind] * px;
      context.stroke();
    }
  };
  const reset = () => {
    segCount.fill(0);
    glowCount.fill(0);
  };
  const sprite = (context: CanvasRenderingContext2D, sheet: HTMLCanvasElement, plate: WirePlate) =>
    context.drawImage(sheet, plate.ax, plate.ay, plate.w, plate.h, plate.x, plate.y, plate.w, plate.h);
  // Where a group's scan front is at `s` (0–1): a height, or a radius.
  const frontOf = (group: WireGroup, s: number) => {
    const e = smooth(s);
    return group.mode === 0
      ? group.bottom - (group.bottom - group.top) * e
      : group.mode === 1
        ? group.top + (group.bottom - group.top) * e
        : group.reach * (1 - e);
  };
  // Whether (x, y) is behind a group's scan front (its material resolved).
  const behind = (group: WireGroup, front: number, x: number, y: number) =>
    group.mode === 0
      ? y >= front
      : group.mode === 1
        ? y <= front
        : (x - visorX) * (x - visorX) + (y - visorY) * (y - visorY) >= front * front;
  // The half (or the ring) behind the front, as a clip path.
  const behindPath = (context: CanvasRenderingContext2D, group: WireGroup, front: number, outside: boolean) => {
    const W = input.size.width;
    const H = input.size.height;
    context.beginPath();
    if (group.mode === 2) {
      // The ring outside the front's circle (even-odd), or the disc inside.
      const r = Math.max(0.5, front);
      if (outside) context.rect(-W, -H, W * 3, H * 3);
      context.moveTo(visorX + r, visorY);
      context.arc(visorX, visorY, r, 0, Math.PI * 2);
      return;
    }
    const below = group.mode === 0 ? outside : !outside;
    if (below) context.rect(-W, front, W * 3, H * 2);
    else context.rect(-W, -H, W * 3, front + H);
  };
  // The scan's line across a group's plates: the outline's crossings of a
  // height (or of a circle round the eyes), paired into the spans inside.
  const scanLine = (context: CanvasRenderingContext2D, group: WireGroup, front: number) => {
    let count = 0;
    for (let m = 0; m < group.plates.length; m += 1) {
      const plate = plates[group.plates[m]];
      if (group.mode !== 2 && (front < plate.y - 2 || front > plate.y + plate.h + 2)) continue;
      let n = 0;
      for (let L = 0; L < plate.loopStart.length; L += 1) {
        const start = plate.loopStart[L];
        const size = plate.loopCount[L];
        for (let k2 = 0; k2 < size; k2 += 1) {
          const a = start + k2;
          const b = start + ((k2 + 1) % size);
          const ax = plate.vx[a];
          const ay = plate.vy[a];
          const bx = plate.vx[b];
          const by = plate.vy[b];
          if (group.mode !== 2) {
            if (ay > front !== by > front) crossings[n++] = ax + ((front - ay) / (by - ay)) * (bx - ax);
          } else {
            // A segment's crossings of the circle, as angles.
            const dx = bx - ax;
            const dy = by - ay;
            const fx = ax - visorX;
            const fy = ay - visorY;
            const A = dx * dx + dy * dy;
            const Bq = 2 * (fx * dx + fy * dy);
            const C = fx * fx + fy * fy - front * front;
            const disc = Bq * Bq - 4 * A * C;
            if (A <= 0 || disc < 0) continue;
            const root = Math.sqrt(disc);
            for (let sign = -1; sign <= 1; sign += 2) {
              const t = (-Bq + sign * root) / (2 * A);
              if (t >= 0 && t < 1) crossings[n++] = Math.atan2(fy + dy * t, fx + dx * t);
            }
          }
        }
      }
      if (n < 2) continue;
      // Insertion sort (a handful of crossings).
      for (let i = 1; i < n; i += 1) {
        const v = crossings[i];
        let j = i - 1;
        while (j >= 0 && crossings[j] > v) {
          crossings[j + 1] = crossings[j];
          j -= 1;
        }
        crossings[j + 1] = v;
      }
      if (group.mode !== 2) {
        for (let i = 0; i + 1 < n; i += 2) {
          scanSegs[count++] = crossings[i];
          scanSegs[count++] = crossings[i + 1];
        }
      } else {
        // The arcs between consecutive crossings whose middle is inside.
        for (let i = 0; i < n; i += 1) {
          const a0 = crossings[i];
          const a1 = i + 1 < n ? crossings[i + 1] : crossings[0] + Math.PI * 2;
          const mid = (a0 + a1) / 2;
          if (insidePlate(plate, visorX + Math.cos(mid) * front, visorY + Math.sin(mid) * front)) {
            scanSegs[count++] = a0;
            scanSegs[count++] = a1;
          }
        }
      }
    }
    if (!count) return false;
    context.beginPath();
    for (let i = 0; i < count; i += 2) {
      if (group.mode !== 2) {
        context.moveTo(scanSegs[i], front);
        context.lineTo(scanSegs[i + 1], front);
      } else {
        context.moveTo(visorX + Math.cos(scanSegs[i]) * front, visorY + Math.sin(scanSegs[i]) * front);
        context.arc(visorX, visorY, front, scanSegs[i], scanSegs[i + 1]);
      }
    }
    return true;
  };
  const insidePlate = (plate: WirePlate, px: number, py: number) => {
    let hit = false;
    for (let L = 0; L < plate.loopStart.length; L += 1) {
      const start = plate.loopStart[L];
      const size = plate.loopCount[L];
      for (let i = 0, j = size - 1; i < size; j = i, i += 1) {
        const xi = plate.vx[start + i];
        const yi = plate.vy[start + i];
        const xj = plate.vx[start + j];
        const yj = plate.vy[start + j];
        if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
      }
    }
    return hit;
  };

  // A plate's outline into a lock bucket, grown `k` about its centre.
  const pushLock = (bucket: number, k: number, grow: number) => {
    const plate = plates[k];
    const buffer = locks[bucket];
    let at = lockCount[bucket];
    const cx = plateCX[k];
    const cy = plateCY[k];
    const g = 1 + grow;
    for (let L = 0; L < plate.loopStart.length; L += 1) {
      const start = plate.loopStart[L];
      const size = plate.loopCount[L];
      for (let i = 0; i < size; i += 1) {
        const a = start + i;
        const b = start + ((i + 1) % size);
        buffer[at] = cx + (plate.vx[a] - cx) * g;
        buffer[at + 1] = cy + (plate.vy[a] - cy) * g;
        buffer[at + 2] = cx + (plate.vx[b] - cx) * g;
        buffer[at + 3] = cy + (plate.vy[b] - cy) * g;
        at += 4;
        if (at + 4 > buffer.length) {
          lockCount[bucket] = at;
          return;
        }
      }
    }
    lockCount[bucket] = at;
  };
  // The debris drawn in to the plates forming at q: each a streak closing
  // on its point of the plate along a tightening spiral (its tail where it
  // was a moment ago, so the flow reads as a vortex).
  const spiralX = (i: number, u: number) => {
    const left = 1 - u * u * (1.6 - 0.6 * u);
    return moteX[i] + Math.cos(moteA[i] + B.swirl * left * (i % 2 ? 1 : -1)) * moteR[i] * left;
  };
  const spiralY = (i: number, u: number) => {
    const left = 1 - u * u * (1.6 - 0.6 * u);
    return moteY[i] + Math.sin(moteA[i] + B.swirl * left * (i % 2 ? 1 : -1)) * moteR[i] * left;
  };
  const gatherMotes = (q: number) => {
    moteCount[0] = 0;
    moteCount[1] = 0;
    for (let i = 0; i < moteTotal; i += 1) {
      const t0 = moteT0[i];
      const t1 = moteT1[i];
      if (q <= t0 || q >= t1) continue;
      // Drawn in: slow at first, fastest as it strikes.
      const u = (q - t0) / (t1 - t0);
      const tail = u > B.tail ? u - B.tail : 0;
      const tone = moteTone[i];
      const at = moteCount[tone];
      const buffer = motes[tone];
      for (let k = 0; k < 4; k += 1) {
        const w = tail + ((u - tail) * k) / 3;
        buffer[at + k * 2] = spiralX(i, w);
        buffer[at + k * 2 + 1] = spiralY(i, w);
      }
      moteCount[tone] = at + 8;
    }
  };
  const flushMotes = (context: CanvasRenderingContext2D, px: number) => {
    for (let tone = 0; tone < 2; tone += 1) {
      const count = moteCount[tone];
      if (!count) continue;
      const buffer = motes[tone];
      context.beginPath();
      for (let i = 0; i < count; i += 8) {
        context.moveTo(buffer[i], buffer[i + 1]);
        context.lineTo(buffer[i + 2], buffer[i + 3]);
        context.lineTo(buffer[i + 4], buffer[i + 5]);
        context.lineTo(buffer[i + 6], buffer[i + 7]);
      }
      context.globalAlpha = tone ? 0.75 : 0.8;
      context.strokeStyle = tone ? GOLD : ICE;
      context.lineWidth = (tone ? B.size[1] : B.size[0]) * px;
      context.stroke();
    }
  };
  // The locks at q: a plate's at its last facet's fill, a group's at its
  // scan's end; calm keeps the afterglow alone.
  const gatherLocks = (q: number, calm: boolean) => {
    lockCount[0] = 0;
    lockCount[1] = 0;
    for (let k = 0; k < plates.length; k += 1) {
      const plate = plates[k];
      const a = (q - plate.fillEnd) / B.lock;
      if (a < 0 || a >= 1) continue;
      if (a < 0.4) pushLock(0, k, 0);
      else pushLock(1, k, 0);
      if (!calm && a < B.shock / B.lock) pushLock(0, k, (B.grow * a * B.lock) / B.shock);
    }
    for (let g = 0; g < groups.length; g += 1) {
      const group = groups[g];
      const a = (q - group.to) / B.lock;
      if (a < 0 || a >= 1) continue;
      for (let m = 0; m < group.plates.length; m += 1) {
        pushLock(a < 0.35 ? 0 : 1, group.plates[m], 0);
        if (!calm && a < B.shock / B.lock)
          pushLock(0, group.plates[m], (B.grow * 0.6 * a * B.lock) / B.shock);
      }
    }
  };
  const flushLocks = (context: CanvasRenderingContext2D, px: number) => {
    for (let bucket = 0; bucket < 2; bucket += 1) {
      const count = lockCount[bucket];
      if (!count) continue;
      const buffer = locks[bucket];
      context.beginPath();
      for (let i = 0; i < count; i += 4) {
        context.moveTo(buffer[i], buffer[i + 1]);
        context.lineTo(buffer[i + 2], buffer[i + 3]);
      }
      context.globalAlpha = bucket ? 0.55 : 0.9;
      context.strokeStyle = bucket ? GOLD : WHITE;
      context.lineWidth = (bucket ? 1.4 : 2.2) * px;
      context.stroke();
    }
  };

  const draw = (
    context: CanvasRenderingContext2D,
    q: number,
    calm: boolean,
    vs: number,
    ratio: number,
  ) => {
    const px = ratio / Math.max(1e-6, vs);
    reset();
    let nodeCount = 0;
    let headCount = 0;
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    // The art: finished plates whole; plates whose group is being scanned,
    // finished behind the front and raw ahead; plates filling, through
    // their filled facets.
    for (let k = 0; k < (input.overlay ? 0 : plates.length); k += 1) {
      const plate = plates[k];
      if (q < plate.fillStart) continue;
      const group = groups[groupOf[k]];
      const s = group ? clamp01((q - group.from) / (group.to - group.from)) : 1;
      if (s >= 1) {
        sprite(context, finSheet, plate);
        continue;
      }
      if (q >= plate.fillEnd) {
        if (s <= 0) {
          sprite(context, rawSheet, plate);
          continue;
        }
        const front = frontOf(group, s);
        context.save();
        behindPath(context, group, front, true);
        context.clip("evenodd");
        sprite(context, finSheet, plate);
        context.restore();
        context.save();
        behindPath(context, group, front, false);
        context.clip("evenodd");
        sprite(context, rawSheet, plate);
        context.restore();
        continue;
      }
      // Filling: one clip of its filled facets.
      context.save();
      context.beginPath();
      let any = false;
      for (let t = 0; t < plate.tf.length; t += 1) {
        if (plate.tf[t] > q) continue;
        const a = plate.tri[t * 3];
        const b = plate.tri[t * 3 + 1];
        const c = plate.tri[t * 3 + 2];
        context.moveTo(plate.vx[a], plate.vy[a]);
        context.lineTo(plate.vx[b], plate.vy[b]);
        context.lineTo(plate.vx[c], plate.vy[c]);
        context.closePath();
        any = true;
      }
      if (any) {
        context.clip();
        sprite(context, rawSheet, plate);
      }
      context.restore();
    }
    // The construction: facets lighting, lines drawing, nodes; for each
    // plate between its first line and its seam's end.
    for (let k = 0; k < plates.length; k += 1) {
      const plate = plates[k];
      if (q < plate.first || q >= plate.wireEnd) continue;
      const group = groups[groupOf[k]];
      const s = group ? clamp01((q - group.from) / (group.to - group.from)) : 0;
      const front = group && s > 0 ? frontOf(group, s) : NaN;
      const seamAge = group ? (q - group.to) / T.seam : -1;
      // The facets' light.
      if (!calm || q < plate.fillEnd)
        for (let t = 0; t < plate.tf.length; t += 1) {
          const age = (q - plate.tf[t]) / T.glow;
          if (age < 0 || age >= 1) continue;
          const tone = hash(t + plate.index * 977, 5);
          const base = tone < 0.12 ? 4 : tone < 0.3 ? 2 : 0;
          pushGlow(base + (age < 0.45 ? 0 : 1), plate, t);
        }
      for (let e = 0; e < plate.ea.length; e += 1) {
        const t0 = plate.e0[e];
        if (q < t0) continue;
        const a = plate.ea[e];
        const b = plate.eb[e];
        const ax = plate.vx[a];
        const ay = plate.vy[a];
        let bx = plate.vx[b];
        let by = plate.vy[b];
        const outline = plate.eo[e] === 1;
        const t1 = plate.e1[e];
        if (q < t1) {
          // Drawing: from the earlier end toward the later (the outline's
          // pens carry a bright head).
          const g = (q - t0) / (t1 - t0);
          bx = ax + (bx - ax) * g;
          by = ay + (by - ay) * g;
          pushSeg(outline ? 0 : 2, ax, ay, bx, by);
          if (outline && !calm) {
            nodes[nodeCount++] = bx;
            nodes[nodeCount++] = by;
            heads[headCount++] = bx;
            heads[headCount++] = by;
          }
          continue;
        }
        // Behind the scan's front: the interior is gone, the outline glows
        // as a seam, then fades.
        if (s > 0 && behind(group, front, (ax + bx) / 2, (ay + by) / 2)) {
          if (outline && seamAge < 1) pushSeg(4, ax, ay, bx, by);
          continue;
        }
        if (outline) {
          pushSeg(0, ax, ay, bx, by);
          continue;
        }
        // Over filled facets the wire holds, then fades to its trace (on
        // touch screens it goes: fewer lines a frame).
        const filled = q - plate.ef[e];
        if (filled < T.hold + T.fade * 0.5) pushSeg(1, ax, ay, bx, by);
        else if (!input.coarse) pushSeg(3, ax, ay, bx, by);
      }
      // The muffler's ribs, each as the front passes it; gone behind the scan.
      for (let r = 0; r < plate.rt.length; r += 1) {
        if (q < plate.rt[r]) continue;
        const x0 = plate.rib[r * 4];
        const y0 = plate.rib[r * 4 + 1];
        const x1 = plate.rib[r * 4 + 2];
        const y1 = plate.rib[r * 4 + 3];
        if (s > 0 && behind(group, front, (x0 + x1) / 2, (y0 + y1) / 2)) continue;
        const age = q - plate.rt[r];
        pushSeg(age < T.grow ? 2 : age < T.lead + T.hold ? 0 : 3, x0, y0, x1, y1);
      }
      // The mesh's nodes, lit as the lines reach them.
      if (!calm)
        for (let v = plate.outline; v < plate.vt.length; v += 1) {
          const age = q - plate.vt[v];
          if (age < 0 || age >= T.node) continue;
          nodes[nodeCount++] = plate.vx[v];
          nodes[nodeCount++] = plate.vy[v];
        }
    }
    context.globalCompositeOperation = "lighter";
    flushGlows(context, 1);
    context.lineCap = "round";
    context.lineJoin = "round";
    flushSegs(context, px, null);
    gatherLocks(q, calm);
    flushLocks(context, px);
    if (!calm) {
      gatherMotes(q);
      flushMotes(context, px);
    }
    // The reactor's rim: a wire ring traced with the crystal, held until its
    // pixel squares fill it, then gone with them.
    if (reactor && q >= RIM.from && q < RIM.gone) {
      const traced = clamp01((q - RIM.from) / RIM.trace) * reactorLength;
      // Bright as it is traced, a standing ring while it waits, bright again
      // as the squares fill it, then gone with them.
      const traceLight = 1 - 0.45 * smooth(clamp01((q - RIM.from - RIM.trace) / 0.02));
      const fillLight = q < RIM.fill ? 0 : smooth(clamp01((q - RIM.fill) / 0.008));
      const fade = q < RIM.fill + 0.01 ? 1 : 1 - smooth(clamp01((q - RIM.fill - 0.01) / (RIM.gone - RIM.fill - 0.01)));
      const light = Math.min(1, traceLight + 0.45 * fillLight) * fade;
      const points = reactor.length / 2;
      context.beginPath();
      context.moveTo(reactor[0], reactor[1]);
      let walked = 0;
      for (let k = 0; k < points && walked < traced; k += 1) {
        const j = (k + 1) % points;
        const x0 = reactor[k * 2];
        const y0 = reactor[k * 2 + 1];
        const x1 = reactor[j * 2];
        const y1 = reactor[j * 2 + 1];
        const length = Math.hypot(x1 - x0, y1 - y0);
        const g = Math.min(1, (traced - walked) / Math.max(1e-6, length));
        context.lineTo(x0 + (x1 - x0) * g, y0 + (y1 - y0) * g);
        walked += length;
      }
      context.globalAlpha = 0.85 * light;
      context.strokeStyle = PALE;
      context.lineWidth = FAR_FROM_WIRE_STYLE.outline * 1.25 * px;
      context.stroke();
    }
    // The nodes.
    if (nodeCount) {
      const size = FAR_FROM_WIRE_STYLE.node * px;
      context.beginPath();
      for (let i = 0; i < nodeCount; i += 2)
        context.rect(nodes[i] - size / 2, nodes[i + 1] - size / 2, size, size);
      context.globalAlpha = 0.95;
      context.fillStyle = WHITE;
      context.fill();
    }
    // The pens' heads: a scan head's light round each.
    if (headCount) {
      const size = FAR_FROM_WIRE_STYLE.head * px;
      context.beginPath();
      for (let i = 0; i < headCount; i += 2)
        context.rect(heads[i] - size / 2, heads[i + 1] - size / 2, size, size);
      context.globalAlpha = 0.38;
      context.fillStyle = ICE;
      context.fill();
    }
    // The scans: a line of gold light across each group being resolved.
    for (let g = 0; g < groups.length; g += 1) {
      const group = groups[g];
      if (q <= group.from || q >= group.to) continue;
      const s = (q - group.from) / (group.to - group.from);
      const front = frontOf(group, s);
      const light = Math.sin(Math.PI * clamp01(s * 1.15));
      if (!scanLine(context, group, front)) continue;
      context.globalAlpha = 0.2 * light;
      context.strokeStyle = SCAN;
      context.lineWidth = FAR_FROM_WIRE_STYLE.scanBand * px;
      context.stroke();
      context.globalAlpha = 0.95 * light;
      context.lineWidth = FAR_FROM_WIRE_STYLE.scan * px;
      context.stroke();
    }
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
  };

  // One change of the chain: the next form's wire from the reactor out over
  // the first 45%, its facets filling from the reactor out from 30%, the
  // last form's parts it lacks going with them; the wire retracts behind
  // the fill.
  const form = (
    context: CanvasRenderingContext2D,
    from: CanvasImageSource,
    to: CanvasImageSource,
    fromKey: string,
    toKey: string,
    u: number,
    tone: string,
    calm: boolean,
    vs: number,
    ratio: number,
  ) => {
    const next = forms.get(toKey);
    const last = forms.get(fromKey);
    if (!next) return false;
    const W = input.size.width;
    const H = input.size.height;
    const px = ratio / Math.max(1e-6, vs);
    const wire = smooth(clamp01(u / 0.45)) * 1.08;
    const fill = clamp01((u - 0.3) / 0.62) * 1.12 - 0.06;
    reset();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    if (!input.overlay) context.drawImage(from, 0, 0, W, H);
    if (fill > 0 && !input.overlay) {
      context.save();
      context.beginPath();
      let any = false;
      // Every facet whose key is under the fill is reached; within this
      // radius every facet is (its key at most fill − .15), so the disc
      // stands for them and only the band beyond it is drawn as facets.
      const inner = Math.max(0, (fill - 0.25) / 0.9);
      for (let pair = 0; pair < (last ? 2 : 1); pair += 1) {
        const m = pair === 0 ? next : last;
        if (!m) continue;
        const r0 = inner * m.reach;
        if (r0 > 1) {
          context.moveTo(coreX + r0, coreY);
          context.arc(coreX, coreY, r0, 0, Math.PI * 2);
          any = true;
        }
        for (let t = 0; t < m.tk.length; t += 1) {
          if (m.tk[t] > fill || m.td[t] <= r0) continue;
          const a = m.tri[t * 3];
          const b = m.tri[t * 3 + 1];
          const c = m.tri[t * 3 + 2];
          context.moveTo(m.vx[a], m.vy[a]);
          context.lineTo(m.vx[b], m.vy[b]);
          context.lineTo(m.vx[c], m.vy[c]);
          context.closePath();
          any = true;
        }
      }
      if (any) {
        context.clip();
        context.clearRect(0, 0, W, H);
        context.drawImage(to, 0, 0, W, H);
      }
      context.restore();
    }
    // The fresh facets' light, then the next form's wire.
    if (!calm)
      for (let t = 0; t < next.tk.length; t += 1) {
        const age = (fill - next.tk[t]) / 0.06;
        if (age < 0 || age >= 1) continue;
        pushGlow(hash(t, 71) < 0.3 ? 2 + (age < 0.45 ? 0 : 1) : age < 0.45 ? 0 : 1, next, t);
      }
    for (let e = 0; e < next.ea.length; e += 1) {
      const k = next.ek[e];
      if (k > wire) continue;
      // Behind the fill the wire has retracted.
      if (k < fill - 0.08) continue;
      const a = next.ea[e];
      const b = next.eb[e];
      const ax = next.vx[a];
      const ay = next.vy[a];
      const bx = next.vx[b];
      const by = next.vy[b];
      if (k > wire - 0.05) pushSeg(2, ax, ay, bx, by);
      else pushSeg(next.eo[e] ? 0 : 1, ax, ay, bx, by);
    }
    context.globalCompositeOperation = "lighter";
    flushGlows(context, 0.85);
    context.lineCap = "round";
    context.lineJoin = "round";
    flushSegs(context, px, tone);
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    return true;
  };

  /* -- end of the draw passes -- */

  const release = () => {
    rawSheet.width = rawSheet.height = 0;
    finSheet.width = finSheet.height = 0;
    forms.clear();
  };
  return { draw, form, release, plates, groups };
}

/** The engine's generation hook (RexonanceAssemblyConfig.generation). */
export const farFromWireGeneration = Object.freeze({
  // Over the nanite build (owner, 2026-10-24): the swarm stays.
  overlay: true,
  prepare: prepareFarFromWireframe,
});
