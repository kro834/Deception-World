import {
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
  type RexonanceSuitGroup,
} from "./rexonance-suit";
import { REXONANCE_SUIT_DRIVER } from "./rexonance-calls";

/* REXONANCE SURGE (owner, 2026-10-30: 「ナノマシンの装着遷移アニメーションと
   スクロールアニメーションを強化して」). A light layer that plays over
   Rexonance's own suit-up engines without touching them (they are shared
   with Meta Unitas and Far From): two 2D canvases, one behind the figure and
   one in front, in the figure's own coordinates (571 x 1040).

   - The swarm: nanite cells on helical flow lines round the body, with
     depth (the far half behind the figure, small and dim; the near half in
     front, larger, with a glow head), streaking as they turn;
   - attraction: while a group of plates forms, part of the swarm is pulled
     off its orbit into a tight vortex on that group, and shards of debris
     fly in from outside along curved paths and dock on its seats;
   - construction scans: a band of the plate's own micro-tiles is outlined
     as it sweeps across the plate, seam first, with a hot leading edge and
     the plate's corner brackets;
   - lock-in: as a group seats, a small impact (a ring, spikes, a tight
     bloom) and its plates' afterglow; the last lock (the helmet) a larger
     one with a wave over the body and embers. Small-area light only: the
     one larger bloom is the final lock's, at most once a second;
   - the camera: a short, small shake on each lock (the caller applies it).

   Every position is closed-form in the clock the caller passes (the entry's
   canonical time or the scroll's progress); only the swarm's orbit flows
   on wall time. Nothing is allocated per frame. The particle counts come
   from the device tier (surgeTier) and fall further if frames run long. */

const W = REXONANCE_SUIT_SIZE.width;
const H = REXONANCE_SUIT_SIZE.height;
const AXIS = REXONANCE_SUIT_MARKS.core[0];
const TILE = REXONANCE_SUIT_TILE;

export const SURGE_GROUPS: readonly RexonanceSuitGroup[] = [
  "legs",
  "waist",
  "arms",
  "chest",
  "shoulders",
  "tail",
  "ribbon",
  "helm",
];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const surgeSpan = (x: number, from: number, to: number) =>
  to > from ? clamp01((x - from) / (to - from)) : x >= to ? 1 : 0;
const hash = (a: number, b: number) => {
  const h = Math.imul(a * 374761393 + b * 668265263, 1274126177) >>> 0;
  return ((h ^ (h >>> 13)) % 10007) / 10007;
};

/* ---------------- the suit's data, prepared once ---------------- */

export type SurgePiece = {
  id: string;
  group: number;
  x: number;
  y: number;
  w: number;
  h: number;
  seat: readonly [number, number];
  /** Its micro-tiles: x, y (figure px, top left) and `along` (0 at the seam). */
  tiles: Float32Array;
};

let PIECES: SurgePiece[] | null = null;
/** The plates that assemble (the driver is on the body from the start). */
export function surgePieces(): SurgePiece[] {
  if (PIECES) return PIECES;
  PIECES = REXONANCE_SUIT_PIECES.filter((piece) => !REXONANCE_SUIT_DRIVER.includes(piece.id)).map(
    (piece) => {
      const bits = Uint8Array.from(atob(piece.tiles), (c) => c.charCodeAt(0));
      const cols = Math.ceil(piece.w / TILE);
      const rows = Math.ceil(piece.h / TILE);
      const out: number[] = [];
      for (let row = 0; row < rows; row += 1)
        for (let col = 0; col < cols; col += 1) {
          const i = row * cols + col;
          if (!(bits[i >> 3] & (1 << (i & 7)))) continue;
          const cx = (col + 0.5) * TILE;
          const cy = (row + 0.5) * TILE;
          const along =
            piece.dir === "up"
              ? 1 - cy / piece.h
              : piece.dir === "down"
                ? cy / piece.h
                : piece.dir === "left"
                  ? 1 - cx / piece.w
                  : cx / piece.w;
          out.push(piece.x + col * TILE, piece.y + row * TILE, along);
        }
      return {
        id: piece.id,
        group: SURGE_GROUPS.indexOf(piece.group),
        x: piece.x,
        y: piece.y,
        w: piece.w,
        h: piece.h,
        seat: piece.seat,
        tiles: new Float32Array(out),
      };
    },
  );
  return PIECES;
}

/** Each group's anchor (its seats' mean) and box. */
function groupFrames(pieces: SurgePiece[]) {
  return SURGE_GROUPS.map((_, g) => {
    const own = pieces.filter((piece) => piece.group === g);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let sx = 0;
    let sy = 0;
    for (const piece of own) {
      x0 = Math.min(x0, piece.x);
      y0 = Math.min(y0, piece.y);
      x1 = Math.max(x1, piece.x + piece.w);
      y1 = Math.max(y1, piece.y + piece.h);
      sx += piece.seat[0];
      sy += piece.seat[1];
    }
    const n = Math.max(1, own.length);
    return {
      anchor: own.length ? [sx / n, sy / n] : [AXIS, H / 2],
      box: own.length ? [x0, y0, x1 - x0, y1 - y0] : [AXIS - 40, H / 2 - 40, 80, 80],
      pieces: own,
    };
  });
}

/** The body's half width at figure height y (for the swarm's orbits). */
function bodyHalf(y: number) {
  const k = y / H;
  if (k < 0.17) return 52;
  if (k < 0.27) return 150;
  if (k < 0.45) return 128;
  if (k < 0.58) return 108;
  return 92;
}

/* ---------------- the device tier ---------------- */

export type SurgeTier = { swarm: number; shards: number; dpr: number; name: string };

/** Particle counts by device: desktop, tablet, phone, and constrained phones
 * (≤ 4 GB or ≤ 4 cores on touch). */
export function surgeTier(): SurgeTier {
  const nav = globalThis.navigator as
    | (Navigator & { deviceMemory?: number; hardwareConcurrency?: number })
    | undefined;
  const coarse = Boolean(
    globalThis.matchMedia?.("(pointer: coarse), (any-pointer: coarse)").matches,
  );
  const memory = nav?.deviceMemory;
  const cores = nav?.hardwareConcurrency ?? 0;
  const short = Math.min(globalThis.innerWidth || 0, globalThis.innerHeight || 0);
  const ratio = globalThis.devicePixelRatio || 1;
  if (!coarse) return { swarm: 1100, shards: 160, dpr: Math.min(ratio, 1.5), name: "desktop" };
  if ((memory !== undefined && memory <= 4) || (cores > 0 && cores <= 4))
    return { swarm: 240, shards: 48, dpr: 1, name: "low" };
  if (short >= 700) return { swarm: 560, shards: 96, dpr: 1, name: "tablet" };
  return { swarm: 380, shards: 64, dpr: 1, name: "phone" };
}

/* ---------------- the frame's inputs ---------------- */

export type SurgeFrame = {
  /** Wall clock (ms): the swarm's flow and the locks' play. */
  now: number;
  /** The swarm's presence, 0–1. */
  swarm: number;
  /** The swarm's implosion into the core, 0–1. */
  implode: number;
  /** Each group's pull on the swarm, 0–1 (SURGE_GROUPS order). */
  pull: Float32Array;
  /** Each group's debris flight, 0–1 (0: not yet, 1: docked). */
  debris: Float32Array;
  /** Each plate's construction scan, 0–1 (surgePieces order; ≤0 or ≥1 idle). */
  scans: Float32Array;
};

export function createSurgeFrame(): SurgeFrame {
  return {
    now: 0,
    swarm: 0,
    implode: 0,
    pull: new Float32Array(SURGE_GROUPS.length),
    debris: new Float32Array(SURGE_GROUPS.length),
    scans: new Float32Array(surgePieces().length),
  };
}

/* ---------------- the engine ---------------- */

const TONES = ["121 232 255", "255 143 216", "242 216 150"] as const;
const LOCK_MS = 820;
const FINAL_MS = 1500;
const BIG_GAP_MS = 1000;

type Lock = { group: number; at: number; big: boolean };

export type SurgeView = {
  /** The canvases' CSS size. */
  width: number;
  height: number;
  /** Where the figure's (0, 0) sits on the canvases (CSS px), and its scale. */
  x: number;
  y: number;
  scale: number;
};

export class SurgeEngine {
  private back: CanvasRenderingContext2D | null;
  private front: CanvasRenderingContext2D | null;
  private view: SurgeView = { width: 0, height: 0, x: 0, y: 0, scale: 1 };
  private ratio = 1;
  private pieces = surgePieces();
  private groups = groupFrames(surgePieces());
  /** Swarm: a0, angular speed, y0, rise speed, radius, tone, size, seed. */
  private swarm: Float32Array;
  private swarmCount: number;
  private swarmLive: number;
  /** Each cell's place this frame: x, y, depth, and its streak's tail. */
  private pos: Float32Array;
  /** Depth bands per canvas: two on desktop, one on touch tiers (half the
   * stroke batches). */
  private bands: number;
  private focusGroup = -1;
  private focusPull = 0;
  /** Shards: group, angle, distance, bend, delay, target x, target y, size. */
  private shards: Float32Array;
  private shardCount: number;
  private locks: Lock[] = [];
  private lastBig = -Infinity;
  private sprites: HTMLCanvasElement[] = [];
  private glows = new Map<number, { canvas: HTMLCanvasElement; x: number; y: number; k: number }>();
  private slow = 0;
  private lastNow = 0;
  private drawn = false;

  constructor(
    private backCanvas: HTMLCanvasElement,
    private frontCanvas: HTMLCanvasElement,
    private tier: SurgeTier,
  ) {
    this.back = backCanvas.getContext("2d");
    this.front = frontCanvas.getContext("2d");
    this.swarmCount = tier.swarm;
    this.swarmLive = tier.swarm;
    this.swarm = new Float32Array(tier.swarm * 8);
    this.pos = new Float32Array(tier.swarm * 5);
    this.bands = tier.name === "desktop" ? 2 : 1;
    for (let i = 0; i < tier.swarm; i += 1) {
      const o = i * 8;
      const k = hash(i, 11);
      this.swarm[o] = hash(i, 3) * Math.PI * 2;
      // Most turn one way (the vortex); a few against it, for depth.
      this.swarm[o + 1] = (k < 0.86 ? 1 : -0.7) * (0.0011 + 0.0016 * hash(i, 5));
      this.swarm[o + 2] = hash(i, 7) * H;
      this.swarm[o + 3] = 0.018 + 0.05 * hash(i, 13);
      this.swarm[o + 4] = 14 + 150 * Math.pow(hash(i, 17), 1.6);
      this.swarm[o + 5] = i % 9 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
      this.swarm[o + 6] = 0.6 + 1.6 * hash(i, 19);
      this.swarm[o + 7] = hash(i, 23);
    }
    this.shardCount = tier.shards;
    this.shards = new Float32Array(tier.shards * 8);
    for (let i = 0; i < tier.shards; i += 1) {
      const o = i * 8;
      const g = i % SURGE_GROUPS.length;
      const own = this.groups[g].pieces;
      const piece = own[Math.floor(hash(i, 29) * own.length) % Math.max(1, own.length)];
      const target = piece ? piece.seat : this.groups[g].anchor;
      this.shards[o] = g;
      this.shards[o + 1] = hash(i, 31) * Math.PI * 2;
      this.shards[o + 2] = H * (0.32 + 0.38 * hash(i, 37));
      this.shards[o + 3] = (hash(i, 41) - 0.5) * 1.6;
      this.shards[o + 4] = hash(i, 43) * 0.62;
      this.shards[o + 5] = target[0] + (hash(i, 47) - 0.5) * 26;
      this.shards[o + 6] = target[1] + (hash(i, 53) - 0.5) * 26;
      this.shards[o + 7] = 2.2 + 3.4 * hash(i, 59);
    }
    for (const tone of TONES) this.sprites.push(sprite(tone));
  }

  /** The canvases' box and the figure in it (CSS px). */
  resize(view: SurgeView) {
    this.view = view;
    const ratio = this.tier.dpr;
    this.ratio = ratio;
    const width = Math.max(1, Math.round(view.width * ratio));
    const height = Math.max(1, Math.round(view.height * ratio));
    for (const canvas of [this.backCanvas, this.frontCanvas]) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    this.drawn = true;
  }

  /** A group seats (SURGE_GROUPS index). The helmet's is the final lock. */
  lock(group: number, now: number) {
    let big = SURGE_GROUPS[group] === "helm";
    if (big && now - this.lastBig < BIG_GAP_MS) big = false;
    if (big) this.lastBig = now;
    // A group locked again within its own play (a scroll back and forth)
    // replays from now rather than stacking.
    this.locks = this.locks.filter((lock) => lock.group !== group);
    this.locks.push({ group, at: now, big });
  }

  /** The camera's shake this frame (CSS px). */
  shake(now: number): [number, number] {
    let x = 0;
    let y = 0;
    const s = this.view.scale * H;
    for (const lock of this.locks) {
      const k = (now - lock.at) / (lock.big ? 520 : 300);
      if (k < 0 || k >= 1) continue;
      const a = (lock.big ? 0.0065 : 0.0032) * s * (1 - k) * (1 - k);
      x += a * Math.sin(now * 0.083 + lock.group * 1.7);
      y += a * 0.7 * Math.cos(now * 0.067 + lock.group);
    }
    return [x, y];
  }

  /** Anything left to play once the inputs are still (locks, embers). */
  busy(now: number) {
    return this.locks.some((lock) => now - lock.at < (lock.big ? FINAL_MS : LOCK_MS));
  }

  clear() {
    if (!this.drawn) return;
    this.drawn = false;
    for (const context of [this.back, this.front]) {
      if (!context) continue;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
    }
  }

  draw(frame: SurgeFrame) {
    const back = this.back;
    const front = this.front;
    if (!back || !front || !this.view.width) return;
    // The governor: long frames shed swarm (never below 40 %).
    const dt = frame.now - this.lastNow;
    this.lastNow = frame.now;
    if (dt > 0 && dt < 200) {
      this.slow = dt > 24 ? this.slow + 1 : Math.max(0, this.slow - 0.25);
      if (this.slow > 24 && this.swarmLive > this.swarmCount * 0.4) {
        this.swarmLive = Math.max(Math.floor(this.swarmCount * 0.4), Math.floor(this.swarmLive * 0.7));
        this.slow = 0;
      }
    }
    const r = this.ratio;
    const { x: ox, y: oy, scale } = this.view;
    const s = scale * r;
    for (const context of [back, front]) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, context.canvas.width, context.canvas.height);
      // Figure space from here on.
      context.setTransform(s, 0, 0, s, ox * r, oy * r);
      context.globalCompositeOperation = "lighter";
    }
    this.drawn = true;
    this.drawSwarm(back, front, frame, scale);
    this.drawShards(front, frame, scale);
    this.drawScans(front, frame, scale);
    this.drawLocks(back, front, frame.now, scale);
    for (const context of [back, front]) context.globalCompositeOperation = "source-over";
    // Finished locks leave the list.
    if (this.locks.length)
      this.locks = this.locks.filter(
        (lock) => frame.now - lock.at < (lock.big ? FINAL_MS : LOCK_MS),
      );
  }

  /* The swarm's position at wall time `t`, into out[0..2] (x, y, depth). */
  private place(i: number, t: number, frame: SurgeFrame, out: Float32Array) {
    const p = this.swarm;
    const o = i * 8;
    const seed = p[o + 7];
    let y = p[o + 2] - p[o + 3] * t;
    y = ((y % H) + H) % H;
    const angle = p[o] + p[o + 1] * t;
    const radius = bodyHalf(y) + p[o + 4] * (1.15 - 0.25 * frame.swarm);
    const wobble = Math.sin(t * 0.0021 + seed * 9) * 10;
    let x = AXIS + Math.cos(angle) * radius + wobble;
    let z = Math.sin(angle);
    // Squash the orbit's height a little with depth (a perspective tilt).
    y += z * 10;
    // Attraction: every second cell answers the forming group's pull.
    if ((i & 1) === 0) {
      const g = this.focusGroup;
      const best = this.focusPull;
      if (g >= 0) {
        const [ax, ay] = this.groups[g].anchor;
        const [, , bw, bh] = this.groups[g].box;
        const spin = angle * 2.6 + seed * 6;
        const rr = 10 + Math.min(bw, bh) * 0.36 * (0.4 + seed);
        const tx = ax + Math.cos(spin) * rr * (bw > bh ? 1.4 : 0.8);
        const ty = ay + Math.sin(spin) * rr * (bh > bw ? 1.2 : 0.55);
        const k = smooth(best) * (0.55 + 0.45 * seed);
        x += (tx - x) * k;
        y += (ty - y) * k;
        z = z * (1 - k) + Math.sin(spin) * k;
      }
    }
    if (frame.implode > 0) {
      const k = Math.pow(frame.implode, 1.4);
      const [cx, cy] = REXONANCE_SUIT_MARKS.core;
      const spin = angle * 3 + seed * 5;
      const rr = (1 - k) * 60;
      x += (cx + Math.cos(spin) * rr - x) * k;
      y += (cy + Math.sin(spin) * rr * 0.6 - y) * k;
    }
    out[0] = x;
    out[1] = y;
    out[2] = z;
  }

  private drawSwarm(
    back: CanvasRenderingContext2D,
    front: CanvasRenderingContext2D,
    frame: SurgeFrame,
    scale: number,
  ) {
    const presence = frame.swarm * (1 - Math.pow(frame.implode, 3));
    if (presence <= 0.01) return;
    const t = frame.now;
    const a = SCRATCH_A;
    const b = SCRATCH_B;
    const px = 1 / Math.max(0.05, scale);
    // Every cell's place now and 34 ms ago, once; then a stroke batch per
    // canvas (far half behind, near half in front), tone and depth band.
    const pos = this.pos;
    const live = this.swarmLive;
    this.focusGroup = -1;
    this.focusPull = 0;
    for (let g = 0; g < frame.pull.length; g += 1)
      if (frame.pull[g] > this.focusPull) {
        this.focusPull = frame.pull[g];
        this.focusGroup = g;
      }
    const lag = 34 + 30 * frame.implode;
    for (let i = 0; i < live; i += 1) {
      this.place(i, t, frame, a);
      this.place(i, t - lag, frame, b);
      const o = i * 5;
      pos[o] = a[0];
      pos[o + 1] = a[1];
      pos[o + 2] = a[2];
      // A cell that wrapped from the crown back to the soles has no streak.
      const wrapped = Math.abs(a[1] - b[1]) > 80 || Math.abs(a[0] - b[0]) > 80;
      pos[o + 3] = wrapped ? a[0] : b[0];
      pos[o + 4] = wrapped ? a[1] : b[1];
    }
    for (let layer = 0; layer < 2; layer += 1) {
      const context = layer === 0 ? back : front;
      context.lineCap = "round";
      for (let tone = 0; tone < 3; tone += 1) {
        for (let band = 0; band < this.bands; band += 1) {
          context.beginPath();
          let any = false;
          for (let i = 0; i < live; i += 1) {
            if (this.swarm[i * 8 + 5] !== tone) continue;
            const o = i * 5;
            const z = pos[o + 2];
            if ((layer === 1) !== z >= 0) continue;
            if (this.bands > 1 && (z > 0.5 || z < -0.5 ? 1 : 0) !== band) continue;
            context.moveTo(pos[o + 3], pos[o + 4]);
            context.lineTo(pos[o] + 0.01, pos[o + 1]);
            any = true;
          }
          if (!any) continue;
          context.lineWidth =
            (layer === 1 ? (band ? 2.3 : 1.6) : band ? 0.9 : 1.2) * px * (scale < 0.6 ? 1.15 : 1);
          const alpha =
            (this.bands === 1
              ? layer === 1
                ? 0.76
                : 0.34
              : layer === 1
                ? band
                  ? 0.85
                  : 0.62
                : band
                  ? 0.26
                  : 0.38) * presence;
          context.strokeStyle = `rgb(${TONES[tone]} / ${alpha.toFixed(3)})`;
          context.stroke();
        }
      }
    }
    // The near cells' heads glow (every third one, the nearest band).
    const size = 9 * px;
    front.globalAlpha = Math.min(1, presence * 0.8);
    for (let i = 0; i < live; i += 3) {
      const o = i * 5;
      if (pos[o + 2] < 0.5) continue;
      const k = this.swarm[i * 8 + 6] * size;
      front.drawImage(this.sprites[this.swarm[i * 8 + 5]], pos[o] - k, pos[o + 1] - k, k * 2, k * 2);
    }
    front.globalAlpha = 1;
  }

  private drawShards(front: CanvasRenderingContext2D, frame: SurgeFrame, scale: number) {
    const px = 1 / Math.max(0.05, scale);
    const p = this.shards;
    front.lineCap = "round";
    for (let tone = 0; tone < 2; tone += 1) {
      front.beginPath();
      let heads = false;
      for (let i = 0; i < this.shardCount; i += 1) {
        if ((i & 1) !== tone) continue;
        const o = i * 8;
        const g = p[o];
        const flight = frame.debris[g];
        if (flight <= 0 || flight >= 1) continue;
        const delay = p[o + 4];
        const u = surgeSpan(flight, delay, delay + 0.38);
        if (u <= 0 || u >= 1) continue;
        heads = true;
        shardAt(p, o, u, SCRATCH_A);
        shardAt(p, o, Math.max(0, u - 0.09), SCRATCH_B);
        front.moveTo(SCRATCH_B[0], SCRATCH_B[1]);
        front.lineTo(SCRATCH_A[0], SCRATCH_A[1]);
      }
      if (!heads) continue;
      front.lineWidth = 1.4 * px;
      front.strokeStyle = tone ? "rgb(242 216 150 / 0.55)" : "rgb(150 236 255 / 0.6)";
      front.stroke();
      // The shards themselves: small turning diamonds.
      front.beginPath();
      for (let i = 0; i < this.shardCount; i += 1) {
        if ((i & 1) !== tone) continue;
        const o = i * 8;
        const flight = frame.debris[p[o]];
        if (flight <= 0 || flight >= 1) continue;
        const u = surgeSpan(flight, p[o + 4], p[o + 4] + 0.38);
        if (u <= 0 || u >= 1) continue;
        shardAt(p, o, u, SCRATCH_A);
        const k = p[o + 7] * px * (0.6 + 0.6 * (1 - u)) * Math.max(1, scale * 1.2);
        const turn = p[o + 1] + u * 9;
        const c = Math.cos(turn) * k;
        const s = Math.sin(turn) * k;
        front.moveTo(SCRATCH_A[0] + c, SCRATCH_A[1] + s);
        front.lineTo(SCRATCH_A[0] - s * 0.5, SCRATCH_A[1] + c * 0.5);
        front.lineTo(SCRATCH_A[0] - c, SCRATCH_A[1] - s);
        front.lineTo(SCRATCH_A[0] + s * 0.5, SCRATCH_A[1] - c * 0.5);
        front.closePath();
      }
      front.fillStyle = tone ? "rgb(255 236 190 / 0.85)" : "rgb(210 248 255 / 0.85)";
      front.fill();
    }
  }

  private drawScans(front: CanvasRenderingContext2D, frame: SurgeFrame, scale: number) {
    const px = 1 / Math.max(0.05, scale);
    const band = 0.2;
    // The band of outlined tiles, then the hot leading edge, then brackets.
    front.beginPath();
    let any = false;
    for (let n = 0; n < this.pieces.length; n += 1) {
      const u = frame.scans[n];
      if (u <= 0 || u >= 1) continue;
      const tiles = this.pieces[n].tiles;
      const head = u * 1.15;
      for (let i = 0; i < tiles.length; i += 3) {
        const along = tiles[i + 2];
        if (along > head || along < head - band) continue;
        front.rect(tiles[i] + 0.5, tiles[i + 1] + 0.5, TILE - 1, TILE - 1);
        any = true;
      }
    }
    if (!any) return;
    front.lineWidth = 0.9 * px;
    front.strokeStyle = "rgb(121 232 255 / 0.5)";
    front.stroke();
    front.beginPath();
    for (let n = 0; n < this.pieces.length; n += 1) {
      const u = frame.scans[n];
      if (u <= 0 || u >= 1) continue;
      const tiles = this.pieces[n].tiles;
      const head = u * 1.15;
      for (let i = 0; i < tiles.length; i += 3) {
        const along = tiles[i + 2];
        if (along > head || along < head - 0.05) continue;
        front.rect(tiles[i] + 2, tiles[i + 1] + 2, TILE - 4, TILE - 4);
      }
    }
    front.fillStyle = "rgb(236 252 255 / 0.62)";
    front.fill();
    front.beginPath();
    for (let n = 0; n < this.pieces.length; n += 1) {
      const u = frame.scans[n];
      if (u <= 0 || u >= 1) continue;
      const { x, y, w, h } = this.pieces[n];
      const k = Math.min(10, w * 0.25, h * 0.25);
      const fade = Math.min(1, u * 5, (1 - u) * 5);
      if (fade <= 0.05) continue;
      bracket(front, x, y, w, h, k);
    }
    front.lineWidth = 1.2 * px;
    front.strokeStyle = "rgb(242 216 150 / 0.55)";
    front.stroke();
  }

  private drawLocks(
    back: CanvasRenderingContext2D,
    front: CanvasRenderingContext2D,
    now: number,
    scale: number,
  ) {
    const px = 1 / Math.max(0.05, scale);
    for (const lock of this.locks) {
      const life = lock.big ? FINAL_MS : LOCK_MS;
      const k = (now - lock.at) / life;
      if (k < 0 || k >= 1) continue;
      const fall = (1 - k) * (1 - k);
      const [ax, ay] = lock.big ? REXONANCE_SUIT_MARKS.visor : this.groups[lock.group].anchor;
      // The plates' afterglow, behind the impact.
      const glow = this.glow(lock.group);
      if (glow) {
        back.globalAlpha = 0.7 * Math.pow(1 - k, 1.5);
        back.drawImage(
          glow.canvas,
          glow.x,
          glow.y,
          glow.canvas.width / glow.k,
          glow.canvas.height / glow.k,
        );
        front.globalAlpha = 0.32 * Math.pow(1 - Math.min(1, k * 1.6), 2);
        front.drawImage(
          glow.canvas,
          glow.x,
          glow.y,
          glow.canvas.width / glow.k,
          glow.canvas.height / glow.k,
        );
        back.globalAlpha = 1;
        front.globalAlpha = 1;
      }
      // A tight bloom (small: the larger one is the final lock's alone).
      const bloomK = Math.min(1, k * 2.4);
      const bloom = (lock.big ? 0.2 : 0.075) * H * (0.6 + 0.4 * bloomK);
      front.globalAlpha = (lock.big ? 0.42 : 0.5) * (1 - bloomK) * (1 - bloomK);
      front.drawImage(this.sprites[lock.big ? 0 : 2], ax - bloom, ay - bloom, bloom * 2, bloom * 2);
      front.globalAlpha = 1;
      // The rings: ice, then gold a beat behind.
      const ease = 1 - Math.pow(1 - k, 3);
      const reach = (lock.big ? 0.62 : 0.17) * H;
      front.lineWidth = (lock.big ? 3.2 : 2.2) * px * (1 - k * 0.6);
      front.strokeStyle = `rgb(150 236 255 / ${(0.75 * fall).toFixed(3)})`;
      front.beginPath();
      front.ellipse(ax, ay, 8 + reach * ease, (8 + reach * ease) * (lock.big ? 1 : 0.62), 0, 0, Math.PI * 2);
      front.stroke();
      const k2 = clamp01(k * 1.25 - 0.1);
      if (k2 > 0) {
        const e2 = 1 - Math.pow(1 - k2, 3);
        front.strokeStyle = `rgb(242 216 150 / ${(0.6 * (1 - k2) * (1 - k2)).toFixed(3)})`;
        front.beginPath();
        front.ellipse(ax, ay, 6 + reach * 0.7 * e2, (6 + reach * 0.7 * e2) * (lock.big ? 1 : 0.62), 0, 0, Math.PI * 2);
        front.stroke();
      }
      // The spikes.
      const spikes = lock.big ? 16 : 10;
      const length = (lock.big ? 0.16 : 0.07) * H * ease;
      front.beginPath();
      for (let i = 0; i < spikes; i += 1) {
        const angle = (i / spikes) * Math.PI * 2 + lock.group * 0.4 + hash(i, lock.group) * 0.3;
        const inner = 6 + length * 0.35;
        const outer = inner + length * (0.6 + 0.6 * hash(i, 77));
        front.moveTo(ax + Math.cos(angle) * inner, ay + Math.sin(angle) * inner * 0.8);
        front.lineTo(ax + Math.cos(angle) * outer, ay + Math.sin(angle) * outer * 0.8);
      }
      front.lineWidth = 1.3 * px;
      front.strokeStyle = `rgb(236 252 255 / ${(0.7 * fall).toFixed(3)})`;
      front.stroke();
      if (lock.big) this.drawEmbers(front, k, px);
    }
  }

  /** The final lock's embers: lifting off the whole suit, cooling. */
  private drawEmbers(front: CanvasRenderingContext2D, k: number, px: number) {
    const count = Math.min(90, Math.floor(this.swarmLive / 8));
    for (let tone = 0; tone < 3; tone += 1) {
      front.beginPath();
      for (let i = tone; i < count; i += 3) {
        const x0 = AXIS + (hash(i, 101) - 0.5) * 360;
        const y0 = H * (0.1 + 0.8 * hash(i, 103));
        const rise = k * (40 + 120 * hash(i, 107));
        const drift = Math.sin(k * 6 + i) * 10;
        const x = x0 + drift;
        const y = y0 - rise;
        front.moveTo(x, y + 5 + 10 * k);
        front.lineTo(x, y);
      }
      front.lineWidth = 1.6 * px;
      front.strokeStyle = `rgb(${TONES[tone]} / ${(0.7 * (1 - k)).toFixed(3)})`;
      front.stroke();
    }
  }

  /** A group's afterglow: its plates' micro-tiles in light, drawn once. */
  private glow(group: number) {
    const cached = this.glows.get(group);
    if (cached) return cached;
    const own = this.groups[group];
    if (!own.pieces.length || typeof document === "undefined") return null;
    const [bx, by, bw, bh] = own.box;
    const k = 0.5;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil((bw + 16) * k));
    canvas.height = Math.max(1, Math.ceil((bh + 16) * k));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.scale(k, k);
    context.translate(8 - bx, 8 - by);
    context.fillStyle = "rgb(121 232 255 / 0.22)";
    context.strokeStyle = "rgb(190 245 255 / 0.75)";
    context.lineWidth = 1.4;
    context.beginPath();
    for (const piece of own.pieces) {
      const tiles = piece.tiles;
      for (let i = 0; i < tiles.length; i += 3) context.rect(tiles[i] + 1, tiles[i + 1] + 1, TILE - 2, TILE - 2);
    }
    context.fill();
    context.stroke();
    const entry = { canvas, x: bx - 8, y: by - 8, k };
    this.glows.set(group, entry);
    return entry;
  }

  dispose() {
    this.clear();
    for (const { canvas } of this.glows.values()) {
      canvas.width = 0;
      canvas.height = 0;
    }
    this.glows.clear();
    for (const canvas of this.sprites) {
      canvas.width = 0;
      canvas.height = 0;
    }
    this.sprites = [];
    this.locks = [];
    this.back = null;
    this.front = null;
  }
}

const SCRATCH_A = new Float32Array(3);
const SCRATCH_B = new Float32Array(3);

/** A shard on its curved path at u (0: out in the air, 1: docked). */
function shardAt(p: Float32Array, o: number, u: number, out: Float32Array) {
  const tx = p[o + 5];
  const ty = p[o + 6];
  const angle = p[o + 1];
  const distance = p[o + 2];
  const sx = tx + Math.cos(angle) * distance;
  const sy = ty + Math.sin(angle) * distance * 0.7;
  // The bend: a control point off the straight line, so it curls in.
  const mx = (sx + tx) / 2 - Math.sin(angle) * distance * p[o + 3] * 0.5;
  const my = (sy + ty) / 2 + Math.cos(angle) * distance * p[o + 3] * 0.35;
  const e = 1 - Math.pow(1 - u, 2.2);
  const q = 1 - e;
  out[0] = q * q * sx + 2 * q * e * mx + e * e * tx;
  out[1] = q * q * sy + 2 * q * e * my + e * e * ty;
}

function bracket(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number) {
  context.moveTo(x, y + k);
  context.lineTo(x, y);
  context.lineTo(x + k, y);
  context.moveTo(x + w - k, y);
  context.lineTo(x + w, y);
  context.lineTo(x + w, y + k);
  context.moveTo(x + w, y + h - k);
  context.lineTo(x + w, y + h);
  context.lineTo(x + w - k, y + h);
  context.moveTo(x + k, y + h);
  context.lineTo(x, y + h);
  context.lineTo(x, y + h - k);
}

/** A soft round glow in a tone (32 px), drawn once. */
function sprite(tone: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgb(255 255 255 / 0.95)");
    gradient.addColorStop(0.18, `rgb(${tone} / 0.75)`);
    gradient.addColorStop(0.5, `rgb(${tone} / 0.18)`);
    gradient.addColorStop(1, `rgb(${tone} / 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  }
  return canvas;
}

/* ---------------- the two clocks ---------------- */

/** The entry's group windows (canonical ms) and lock times, from the call's
 * cascade: [from, to] per SURGE_GROUPS index. */
export type SurgeWindows = Float32Array;

/** Fills the frame for the entry at canonical time t (ms). `fits` holds
 * each plate's fit time (surgePieces order); `windows` each group's
 * [from, to] (canonical ms). */
export function entrySurgeFrame(
  frame: SurgeFrame,
  t: number,
  now: number,
  fits: Float32Array,
  windows: SurgeWindows,
  final: number,
) {
  frame.now = now;
  // Born from the fire's burst (canonical ≈ 470 ms), at full strength by the
  // chant, imploding into the core on the last call.
  frame.swarm = smooth(surgeSpan(t, 440, 700));
  frame.implode = smooth(surgeSpan(t, final + 40, final + 420));
  for (let g = 0; g < SURGE_GROUPS.length; g += 1) {
    const from = windows[g * 2];
    const to = windows[g * 2 + 1];
    frame.pull[g] = smooth(surgeSpan(t, from - 220, from)) * (1 - smooth(surgeSpan(t, to, to + 140)));
    frame.debris[g] = surgeSpan(t, from - 300, to + 10);
  }
  for (let n = 0; n < fits.length; n += 1) frame.scans[n] = surgeSpan(t, fits[n] - 170, fits[n] + 30);
  return frame;
}

/** The scroll scene's beat windows (rexonance-resonance.js ASSEMBLY_BEATS,
 * per its beatWindow), per SURGE_GROUPS index. */
export function scrollWindows(): SurgeWindows {
  const deus = [0.16, 0.62];
  const step = (deus[1] - deus[0]) / 4;
  const beat = (b: number) =>
    b <= 3 ? [deus[0] + b * step, deus[0] + (b + 1) * step] : b === 4 ? [0.62, 0.82] : [0.68, 0.848];
  // legs 0, waist 3, arms 1, chest 2, shoulders 2, tail 4, ribbon 4, helm 5.
  const beats = [0, 3, 1, 2, 2, 4, 4, 5];
  const out = new Float32Array(SURGE_GROUPS.length * 2);
  beats.forEach((b, g) => {
    const [from, to] = beat(b);
    out[g * 2] = from;
    out[g * 2 + 1] = to;
  });
  return out;
}

/** Each plate's scan window on the scroll (bottom first within its beat,
 * as the scene lands them), [from, to] per surgePieces() index. */
export function scrollPieceWindows(windows: SurgeWindows): Float32Array {
  const pieces = surgePieces();
  const out = new Float32Array(pieces.length * 2);
  for (let g = 0; g < SURGE_GROUPS.length; g += 1) {
    const own = pieces
      .map((piece, index) => ({ piece, index }))
      .filter(({ piece }) => piece.group === g)
      .sort((a, b) => b.piece.seat[1] - a.piece.seat[1]);
    const from = windows[g * 2];
    const to = windows[g * 2 + 1];
    const span = Math.max(0.01, to - from - 0.05);
    own.forEach(({ index }, rank) => {
      const r = own.length > 1 ? rank / (own.length - 1) : 0;
      const u0 = from + r * 0.36 * span;
      out[index * 2] = u0;
      out[index * 2 + 1] = u0 + 0.62 * span + 0.05;
    });
  }
  return out;
}

/** Fills the frame for the scroll at progress q. */
export function scrollSurgeFrame(
  frame: SurgeFrame,
  q: number,
  now: number,
  windows: SurgeWindows,
  pieceWindows: Float32Array,
) {
  frame.now = now;
  frame.swarm = smooth(surgeSpan(q, 0.07, 0.16));
  frame.implode = smooth(surgeSpan(q, 0.82, 0.885));
  for (let g = 0; g < SURGE_GROUPS.length; g += 1) {
    const from = windows[g * 2];
    const to = windows[g * 2 + 1];
    frame.pull[g] =
      smooth(surgeSpan(q, from - 0.025, from + 0.01)) * (1 - smooth(surgeSpan(q, to - 0.01, to + 0.02)));
    frame.debris[g] = surgeSpan(q, from - 0.03, to);
  }
  for (let n = 0; n < frame.scans.length; n += 1)
    frame.scans[n] = surgeSpan(q, pieceWindows[n * 2], pieceWindows[n * 2 + 1]);
  return frame;
}

/** The scroll's camera push: a slow, small lean in over the build. */
export function scrollPush(q: number) {
  return 1 + 0.035 * smooth(surgeSpan(q, 0.12, 0.34)) * (1 - smooth(surgeSpan(q, 0.8, 0.9)));
}

/** The figure's box inside a canvas box, per the scene's CSS variables. */
export function figureIn(width: number, height: number, w: number, h: number, cx: number, bottom: number) {
  const figureHeight = Math.min(height * h, (width * w * H) / W);
  const scale = figureHeight / H;
  return { x: width * cx - (W * scale) / 2, y: height * (1 - bottom) - figureHeight, scale };
}
