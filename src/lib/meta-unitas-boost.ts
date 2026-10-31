/** META UNITAS SAGA — the suit-up's nanite boost (2026-10-30).
 *
 * Owner: 「ナノマシンの装着遷移アニメーションとスクロールアニメーションを
 * 強化して」. The scene itself stays the Rexonance engine's (owner:
 * 「メタ・ウニタスはレクソナンスと同じ装着です」; src/lib/rexonance-resonance.js
 * is shared and untouched). This layer rides on the same runway, reads the
 * same progress the engine reads (the pinned frame's travel) and the same
 * beats, and adds, in Meta Unitas' own light (teal scale, orange light paths,
 * white-silver; ウルトラ's pale lilac):
 *
 *  - a deeper swarm in three depths: a tilted vortex disc behind the figure,
 *    and streams in front that curl along a flow field into the part being
 *    built, captured as they arrive;
 *  - the construction scan: each group's real plate outlines (the suit's
 *    seams) traced in orange light as its window runs, a spark at the head;
 *  - debris: shards drawn in from the frame's edge on curved paths onto the
 *    seams, positioned by the scroll (scrubbing back returns them);
 *  - the lock: when a group's last plate lands, a small ring and a spark
 *    burst at the plate, a short camera kick; the seal's closing ring; the
 *    light's one impact glow (at most one large glow a second; never red,
 *    never full-screen white) and its afterglow of rising embers;
 *  - a restrained camera: a slow push in over the build and a few pixels of
 *    damped shake on each lock, applied to the scene's own layers.
 *
 * Two canvases (a half-resolution back one, a front one), typed-array pools
 * sized by the device's tier and trimmed further by a frame-time governor.
 * It sleeps when the scroll rests and the effects have died, and when the
 * runway is off screen; reduced motion, economy and the still tiers never
 * mount it (the engine's finished still is their light version).
 */

import { hasConstrainedResources } from "./rendering-profile.js";
import {
  META_UNITAS_RX_DRIVER,
  META_UNITAS_RX_MARKS,
  META_UNITAS_RX_PIECES,
  META_UNITAS_RX_SIZE,
} from "./meta-unitas-rx-suit.ts";
import { META_UNITAS_RX_SEAMS } from "./meta-unitas-rx-suit-nanites.ts";

/** The engine's beats (ASSEMBLY_BEATS in rexonance-resonance.js; pinned
 * equal by scripts/meta-unitas-boost.test.mjs). */
export const META_UNITAS_BOOST_BEATS = {
  scan: [0, 0.07],
  motes: [0.07, 0.16],
  deus: [0.16, 0.62],
  rexonance: [0.62, 0.82],
  clamp: 0.86,
  seal: [0.86, 0.9],
  light: [0.9, 0.915],
  form: [0.915, 0.975],
  complete: 0.93,
} as const;

/** The engine's group → beat (BEAT_OF_GROUP). */
const BEAT_OF_GROUP: Record<string, number> = {
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

/** Each beat's window (the engine's beatWindow): its last plate lands at
 * the window's end, which is where the lock strikes. */
export function metaUnitasBoostWindow(beat: number): readonly [number, number] {
  const B = META_UNITAS_BOOST_BEATS;
  if (beat <= 3) {
    const step = (B.deus[1] - B.deus[0]) / 4;
    return [B.deus[0] + beat * step, B.deus[0] + (beat + 1) * step];
  }
  if (beat === 4) return B.rexonance;
  return [B.rexonance[0] + 0.06, B.clamp - 0.012];
}

export type MetaUnitasBoostTier = "high" | "touch" | "lite";

/** The tier's budgets: swarm size, shards per group, sparks per lock, the
 * front canvas' pixel budget and its device-pixel cap. */
export const META_UNITAS_BOOST_BUDGET: Record<
  MetaUnitasBoostTier,
  {
    swarm: number;
    shards: number;
    sparks: number;
    pixels: number;
    ratio: number;
    back: boolean;
    shake: number;
  }
> = {
  high: {
    swarm: 1100,
    shards: 16,
    sparks: 44,
    pixels: 2_400_000,
    ratio: 1.5,
    back: true,
    shake: 3,
  },
  touch: {
    swarm: 560,
    shards: 10,
    sparks: 26,
    pixels: 1_150_000,
    ratio: 1.25,
    back: true,
    shake: 2,
  },
  lite: { swarm: 240, shards: 6, sparks: 14, pixels: 600_000, ratio: 1, back: false, shake: 1.5 },
};

type Device = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/** The user's lightweight choice selects the reduced scene; input capability
 * still selects bounded touch versus desktop budgets. */
export function metaUnitasBoostTier(environment: typeof globalThis = window): MetaUnitasBoostTier {
  const device = environment.navigator as Device;
  const info = {
    userAgent: device.userAgent,
    maxTouchPoints: device.maxTouchPoints,
    deviceMemory: device.deviceMemory,
    hardwareConcurrency: device.hardwareConcurrency,
    connection: device.connection,
  };
  if (hasConstrainedResources(info)) return "lite";
  return environment.matchMedia("(pointer: coarse)").matches ? "touch" : "high";
}

/* ---------------- the suit's geometry (figure px) ---------------- */

type Loop = { xy: Float32Array; cum: Float32Array; length: number };
type Group = {
  beat: number;
  loops: Loop[];
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  box: readonly [number, number, number, number];
};

function decodeSeam(base64: string | undefined): Float32Array[] {
  if (!base64) return [];
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return [];
  }
  const value = (k: number) => ((bytes[2 * k] | (bytes[2 * k + 1] << 8)) << 16) >> 16;
  const words = bytes.length >> 1;
  const loops: Float32Array[] = [];
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

let groupsCache: Group[] | null = null;
/** The six beats' plates: their outlines with running lengths, their
 * centre, and the seat of the plate that lands last (the lock's anchor). */
export function metaUnitasBoostGroups(): Group[] {
  if (groupsCache) return groupsCache;
  const groups: Group[] = [];
  for (let beat = 0; beat < 6; beat += 1) {
    const loops: Loop[] = [];
    let sx = 0;
    let sy = 0;
    let area = 0;
    let anchor: readonly [number, number] | null = null;
    let anchorKey = -Infinity;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const piece of META_UNITAS_RX_PIECES) {
      if (META_UNITAS_RX_DRIVER.includes(piece.id)) continue;
      if ((BEAT_OF_GROUP[piece.group] ?? 2) !== beat) continue;
      const a = piece.w * piece.h;
      x0 = Math.min(x0, piece.x);
      y0 = Math.min(y0, piece.y);
      x1 = Math.max(x1, piece.x + piece.w);
      y1 = Math.max(y1, piece.y + piece.h);
      sx += (piece.x + piece.w / 2) * a;
      sy += (piece.y + piece.h / 2) * a;
      area += a;
      // The engine lands each DEUS！ bottom first, the helmet from the eyes
      // out: the last plate is the top one (the helmet's outermost).
      const key =
        beat === 5 ? Math.hypot(piece.seat[0] - 346, piece.seat[1] - 160) : -piece.seat[1];
      if (key > anchorKey) {
        anchorKey = key;
        anchor = piece.seat;
      }
      for (const xy of decodeSeam(META_UNITAS_RX_SEAMS[piece.id])) {
        const n = xy.length / 2;
        const cum = new Float32Array(n + 1);
        for (let k = 1; k <= n; k += 1) {
          const i = (k % n) * 2;
          const j = (k - 1) * 2;
          cum[k] = cum[k - 1] + Math.hypot(xy[i] - xy[j], xy[i + 1] - xy[j + 1]);
        }
        loops.push({ xy, cum, length: cum[n] });
      }
    }
    const cx = area ? sx / area : META_UNITAS_RX_MARKS.core[0];
    const cy = area ? sy / area : META_UNITAS_RX_MARKS.core[1];
    const box = (area ? [x0, y0, x1, y1] : [cx, cy, cx, cy]) as [number, number, number, number];
    groups.push({ beat, loops, cx, cy, ax: anchor?.[0] ?? cx, ay: anchor?.[1] ?? cy, box });
  }
  groupsCache = groups;
  return groups;
}

/* ---------------- helpers ---------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeOut = (v: number) => 1 - (1 - v) ** 3;
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
// A seeded hash in [0, 1).
const hash = (n: number) => ((Math.imul(n + 1, 2654435761) >>> 0) % 100003) / 100003;

type Tone = readonly [number, number, number];
const TEAL: Tone = [70, 206, 200];
const ORANGE: Tone = [255, 158, 84];
const SILVER: Tone = [244, 248, 250];
const GOLD: Tone = [255, 214, 150];
const LILAC: Tone = [240, 222, 255];
const ICE: Tone = [190, 244, 240];
const rgba = ([r, g, b]: Tone, a: number) => `rgba(${r},${g},${b},${a.toFixed(3)})`;

function glowSprite(document: Document, tone: Tone, size: number) {
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  const r = size / 2;
  const gradient = context.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, rgba(tone, 0.95));
  gradient.addColorStop(0.5, rgba(tone, 0.28));
  gradient.addColorStop(1, rgba(tone, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return sprite;
}

export type MetaUnitasBoostOptions = {
  /** The entry transition: the swarm runs from the first frame (before the
   * engine is live) and never rests. */
  entry?: boolean;
  tier?: MetaUnitasBoostTier;
};

/** Mounts the boost on a runway (.rzn-suitup with its .rzn-frame and the
 * engine's .rzn-canvas). Returns the disposer. */
export function mountMetaUnitasBoost(
  runway: HTMLElement | null | undefined,
  environment: typeof globalThis = window,
  options: MetaUnitasBoostOptions = {},
): () => void {
  const frame = runway?.querySelector<HTMLElement>(".rzn-frame");
  const engineCanvas = runway?.querySelector<HTMLCanvasElement>(".rzn-canvas");
  if (!runway || !frame || !engineCanvas) return () => {};
  const document = runway.ownerDocument;
  const entry = Boolean(options.entry);
  const tier = options.tier ?? metaUnitasBoostTier(environment);
  const budget = META_UNITAS_BOOST_BUDGET[tier];

  const makeCanvas = (className: string) => {
    const canvas = document.createElement("canvas");
    canvas.className = className;
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = 1;
    canvas.height = 1;
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      // The page's frame stacks its layers at 1 (the calls above); the
      // entry's paint in order, the calls last.
      zIndex: entry ? "auto" : "1",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 220ms ease",
    });
    return canvas;
  };
  const front = makeCanvas("mus-boost mus-boost-front");
  const back = budget.back ? makeCanvas("mus-boost mus-boost-back") : null;
  engineCanvas.after(front);
  // Behind the wearer too (the undersuit stands before the engine's canvas).
  if (back) (frame.querySelector(":scope > .rzn-under") ?? engineCanvas).before(back);
  const fctx = front.getContext("2d");
  const bctx = back?.getContext("2d") ?? null;
  if (!fctx) {
    front.remove();
    back?.remove();
    return () => {};
  }
  const sprites = {
    teal: glowSprite(document, TEAL, 32),
    orange: glowSprite(document, ORANGE, 32),
    silver: glowSprite(document, SILVER, 32),
    lilac: glowSprite(document, LILAC, 32),
    gold: glowSprite(document, GOLD, 32),
  };
  const groups = metaUnitasBoostGroups();
  const B = META_UNITAS_BOOST_BEATS;
  const windows = groups.map((group) => metaUnitasBoostWindow(group.beat));

  /* ---- geometry ---- */
  let cssW = 0;
  let cssH = 0;
  let fRatio = 1;
  let bRatio = 1;
  let scale = 1; // figure px → frame CSS px
  let ox = 0;
  let oy = 0;
  let figH = 0;
  let unit = 1;
  let pinTop = 0;
  let travel = 0;
  let originX = 0;
  let originY = 0;
  type Target = { element: HTMLElement; ox: number; oy: number; depth: number };
  let targets: Target[] = [];
  const measure = () => {
    const width = frame.clientWidth;
    const height = frame.clientHeight;
    if (!width || !height) return false;
    cssW = width;
    cssH = height;
    const style = environment.getComputedStyle(front);
    const hShare = Number.parseFloat(style.getPropertyValue("--rzn-fig-h")) || 0.84;
    const wShare = Number.parseFloat(style.getPropertyValue("--rzn-fig-w")) || 0.9;
    const centreX = Number.parseFloat(style.getPropertyValue("--rzn-fig-x")) || 0.5;
    const bottom = Number.parseFloat(style.getPropertyValue("--rzn-fig-b")) || 0.05;
    const { width: W, height: H } = META_UNITAS_RX_SIZE;
    figH = Math.min(height * hShare, (width * wShare * H) / W);
    scale = figH / H;
    ox = width * centreX - (W * scale) / 2;
    oy = height * (1 - bottom) - figH;
    unit = Math.max(0.75, figH / 720);
    const dpr = environment.devicePixelRatio || 1;
    fRatio = Math.min(dpr, budget.ratio, Math.sqrt(budget.pixels / (width * height)));
    bRatio = fRatio * 0.5;
    const fw = Math.max(1, Math.round(width * fRatio));
    const fh = Math.max(1, Math.round(height * fRatio));
    if (front.width !== fw || front.height !== fh) {
      front.width = fw;
      front.height = fh;
    }
    if (back) {
      const bw = Math.max(1, Math.round(width * bRatio));
      const bh = Math.max(1, Math.round(height * bRatio));
      if (back.width !== bw || back.height !== bh) {
        back.width = bw;
        back.height = bh;
      }
    }
    pinTop = Number.parseFloat(environment.getComputedStyle(frame).top) || 0;
    travel = runway.offsetHeight - frame.offsetHeight;
    // The camera's centre: the figure's chest.
    originX = ox + META_UNITAS_RX_MARKS.core[0] * scale;
    originY = oy + META_UNITAS_RX_MARKS.core[1] * scale;
    collectTargets();
    return true;
  };
  const collectTargets = () => {
    for (const target of targets) target.element.style.transform = "";
    const frameBox = frame.getBoundingClientRect();
    const list: Target[] = [];
    const add = (element: HTMLElement, depth: number) => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const ex = originX - (box.left - frameBox.left);
      const ey = originY - (box.top - frameBox.top);
      element.style.transformOrigin = `${ex.toFixed(1)}px ${ey.toFixed(1)}px`;
      list.push({ element, ox: ex, oy: ey, depth });
    };
    for (const element of frame.querySelectorAll<HTMLElement>(
      ":scope > :is(.rzn-canvas, .rzn-field, .rzn-under, .rzn-driver-standin)",
    ))
      add(element, 1);
    if (back) add(back, 0.55);
    add(front, 1.2);
    targets = list;
    camera.written = "";
  };
  const toX = (fx: number) => ox + fx * scale;
  const toY = (fy: number) => oy + fy * scale;

  /* ---- the swarm (frame CSS px) ---- */
  const N = budget.swarm;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const qx = new Float32Array(N); // last frame's position (streaks)
  const qy = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const life = new Float32Array(N);
  const layer = new Uint8Array(N); // 0 back disc, 1 mid stream, 2 near stream
  const tone = new Uint8Array(N); // 0 teal, 1 orange, 2 silver
  const alive = new Uint8Array(N);
  let rngState = 0x9e3779b9;
  const random = () => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return (rngState >>> 0) / 4294967296;
  };
  for (let i = 0; i < N; i += 1) {
    const r = random();
    layer[i] = r < 0.42 ? 0 : r < 0.8 ? 1 : 2;
    const t = random();
    tone[i] = t < 0.5 ? 0 : t < 0.86 ? 1 : 2;
  }
  // The attractor (frame px) and its strengths, set per frame.
  let tx = 0;
  let ty = 0;
  let pull = 1;
  let swirl = 1;
  const spawn = (i: number) => {
    const diag = Math.hypot(cssW, cssH) / 2;
    const angle = random() * Math.PI * 2;
    if (layer[i] === 0) {
      // The disc: born on its rim, already turning.
      const radius = figH * (0.16 + random() * 0.4);
      px[i] = tx + Math.cos(angle) * radius;
      py[i] = ty + Math.sin(angle) * radius;
      const speed = (60 + random() * 80) * unit;
      vx[i] = -Math.sin(angle) * speed;
      vy[i] = Math.cos(angle) * speed;
      life[i] = 1.2 + random() * 2.2;
    } else {
      // The streams: from around the figure, curling in.
      const radius = Math.min(diag, figH * (0.38 + random() * 0.5));
      px[i] = tx + Math.cos(angle) * radius * 0.8;
      py[i] = ty + Math.sin(angle) * radius;
      const speed = (80 + random() * 120) * unit;
      const turn = layer[i] === 2 ? 1 : -1;
      vx[i] = -Math.sin(angle) * speed * turn;
      vy[i] = Math.cos(angle) * speed * turn;
      life[i] = 1.1 + random() * 1.6;
    }
    qx[i] = px[i];
    qy[i] = py[i];
    alive[i] = 1;
  };

  /* ---- sparks (lock bursts, the light's burst, embers) ---- */
  const S = budget.sparks * 8;
  const sx = new Float32Array(S);
  const sy = new Float32Array(S);
  const svx = new Float32Array(S);
  const svy = new Float32Array(S);
  const sl = new Float32Array(S); // life left (s)
  const sl0 = new Float32Array(S);
  const stone = new Uint8Array(S); // 0 teal 1 orange 2 silver 3 lilac 4 gold
  let sparkAt = 0;
  let sparksAlive = 0;
  const burst = (
    x: number,
    y: number,
    count: number,
    speed: number,
    lifeS: number,
    toneOf: (k: number) => number,
    rise = 0,
  ) => {
    for (let k = 0; k < count; k += 1) {
      const i = sparkAt;
      sparkAt = (sparkAt + 1) % S;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.35 + random() * 0.65) * unit;
      sx[i] = x;
      sy[i] = y;
      svx[i] = Math.cos(angle) * v;
      svy[i] = Math.sin(angle) * v - rise * unit;
      sl0[i] = sl[i] = lifeS * (0.6 + random() * 0.4);
      stone[i] = toneOf(k);
    }
  };

  /* ---- timed effects: rings and glows ---- */
  type Effect = {
    x: number;
    y: number;
    at: number;
    kind: "lock" | "light" | "form";
    glow: boolean;
  };
  const effects: Effect[] = [];
  let lastBig = -Infinity;
  let lastGlow = -Infinity;
  let afterglowAt = -Infinity;
  let afterglowTone: Tone = GOLD;

  /* ---- camera ---- */
  const camera = { kick: 0, shake: 0, phase: 0, written: "" };

  /* ---- clock and state ---- */
  let raf = 0;
  let disposed = false;
  let visible = true;
  let lastNow = 0;
  let lastP = -1;
  let lastMoveAt = -Infinity;
  let activity = entry ? 1 : 0;
  let startedAt = -1;
  let governor = 1;
  let slowFor = 0;
  let fastFor = 0;
  let ema = 16.7;
  let shown = false;
  let measured = false;

  const engineLive = () => runway.dataset.rznState === "live" && !runway.dataset.rznArming;
  const readProgress = () => {
    if (travel <= 0) return 1;
    return clamp01((pinTop - runway.getBoundingClientRect().top) / travel);
  };
  const ultra = () => runway.dataset.form === "ultra";

  const show = (on: boolean) => {
    if (on === shown) return;
    shown = on;
    front.style.opacity = on ? "1" : "0";
    if (back) back.style.opacity = on ? "1" : "0";
  };

  const writeCamera = (s: number, dx: number, dy: number) => {
    const key = `${s.toFixed(4)}|${dx.toFixed(2)}|${dy.toFixed(2)}`;
    if (key === camera.written) return;
    camera.written = key;
    const rest = Math.abs(s - 1) < 0.0002 && Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05;
    for (const target of targets) {
      if (rest) {
        target.element.style.transform = "";
        continue;
      }
      const k = 1 + (s - 1) * target.depth;
      target.element.style.transform = `translate3d(${(dx * target.depth).toFixed(2)}px,${(dy * target.depth).toFixed(2)}px,0) scale(${k.toFixed(4)})`;
    }
  };

  const drawSeams = (
    context: CanvasRenderingContext2D,
    group: Group,
    fraction: number,
    alpha: number,
    head: boolean,
    toneA: Tone,
    toneB: Tone,
  ) => {
    if (alpha <= 0.004 || fraction <= 0) return;
    const heads: number[] = [];
    context.beginPath();
    for (const loop of group.loops) {
      const n = loop.xy.length / 2;
      const target = loop.length * fraction;
      context.moveTo(toX(loop.xy[0]), toY(loop.xy[1]));
      let k = 1;
      for (; k <= n && loop.cum[k] <= target; k += 1) {
        const i = (k % n) * 2;
        context.lineTo(toX(loop.xy[i]), toY(loop.xy[i + 1]));
      }
      if (k <= n && fraction < 1) {
        const i = (k % n) * 2;
        const j = (k - 1) * 2;
        const seg = loop.cum[k] - loop.cum[k - 1] || 1;
        const f = (target - loop.cum[k - 1]) / seg;
        const hx = toX(loop.xy[j] + (loop.xy[i] - loop.xy[j]) * f);
        const hy = toY(loop.xy[j + 1] + (loop.xy[i + 1] - loop.xy[j + 1]) * f);
        context.lineTo(hx, hy);
        if (head) heads.push(hx, hy);
      }
    }
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = rgba(toneA, 0.3 * alpha);
    context.lineWidth = 6 * unit;
    context.stroke();
    context.strokeStyle = rgba(toneB, alpha);
    context.lineWidth = 1.7 * unit;
    context.stroke();
    const size = 22 * unit;
    for (let h = 0; h < heads.length; h += 2)
      context.drawImage(sprites.gold, heads[h] - size / 2, heads[h + 1] - size / 2, size, size);
  };

  const drawShards = (
    context: CanvasRenderingContext2D,
    group: Group,
    index: number,
    p: number,
    lilac: boolean,
  ) => {
    const [a, lock] = windows[index];
    const count = budget.shards;
    const diag = Math.hypot(cssW, cssH) / 2;
    const gx = toX(group.cx);
    const gy = toY(group.cy);
    for (let k = 0; k < count; k += 1) {
      const seed = index * 97 + k * 13;
      const stagger = hash(seed);
      const t0 = a - 0.025 + stagger * (lock - a) * 0.55;
      const t1 = t0 + (lock - a) * 0.45 + 0.02;
      const s = span(p, t0, t1);
      if (s <= 0 || s >= 1) continue;
      // Its landing point: a point on the group's seams.
      const loop = group.loops[Math.floor(hash(seed + 1) * group.loops.length)] ?? null;
      let ex = gx;
      let ey = gy;
      if (loop) {
        const n = loop.xy.length / 2;
        const at = Math.floor(hash(seed + 2) * n) * 2;
        ex = toX(loop.xy[at]);
        ey = toY(loop.xy[at + 1]);
      }
      const angle = hash(seed + 3) * Math.PI * 2;
      const radius = Math.min(diag, figH * (0.42 + hash(seed + 4) * 0.42));
      const bx = gx + Math.cos(angle) * radius;
      const by = gy + Math.sin(angle) * radius * 0.8;
      const bend = (hash(seed + 5) - 0.5) * 1.6;
      const mx = (bx + ex) / 2 - (ey - by) * bend * 0.5;
      const my = (by + ey) / 2 + (ex - bx) * bend * 0.5;
      const e = easeInOut(s);
      const u = 1 - e;
      const x = u * u * bx + 2 * u * e * mx + e * e * ex;
      const y = u * u * by + 2 * u * e * my + e * e * ey;
      const e0 = easeInOut(Math.max(0, s - 0.05));
      const u0 = 1 - e0;
      const x0 = u0 * u0 * bx + 2 * u0 * e0 * mx + e0 * e0 * ex;
      const y0 = u0 * u0 * by + 2 * u0 * e0 * my + e0 * e0 * ey;
      const fade = Math.min(1, s * 6) * Math.min(1, (1 - s) * 8);
      // The trail.
      context.strokeStyle = rgba(lilac ? LILAC : ORANGE, 0.5 * fade);
      context.lineWidth = 1.2 * unit;
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x, y);
      context.stroke();
      // The shard: a sliver of plate turning as it comes.
      const size = (6 + hash(seed + 6) * 7) * unit * (1 - 0.55 * e);
      const rot = hash(seed + 7) * 6.28 + s * (hash(seed + 8) - 0.5) * 14;
      const c = Math.cos(rot);
      const n = Math.sin(rot);
      context.setTransform(c * fRatio, n * fRatio, -n * fRatio, c * fRatio, x * fRatio, y * fRatio);
      context.fillStyle = rgba(lilac ? LILAC : k % 3 === 0 ? SILVER : TEAL, 0.85 * fade);
      context.beginPath();
      context.moveTo(-size, -size * 0.32);
      context.lineTo(size * 0.7, -size * 0.5);
      context.lineTo(size, size * 0.3);
      context.lineTo(-size * 0.6, size * 0.45);
      context.closePath();
      context.fill();
      context.strokeStyle = rgba(lilac ? SILVER : ORANGE, 0.9 * fade);
      context.lineWidth = 0.8 * unit;
      context.stroke();
      context.setTransform(fRatio, 0, 0, fRatio, 0, 0);
    }
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    if (!measured) measured = measure();
    if (!measured) {
      raf = environment.requestAnimationFrame(tick);
      return;
    }
    const dtMs = lastNow ? Math.min(100, now - lastNow) : 16.7;
    lastNow = now;
    const dt = Math.min(dtMs, 34) / 1000;
    if (startedAt < 0) startedAt = now;
    // The governor: a sustained slow frame trims the swarm, a calm one
    // brings it back (never above the tier's budget).
    ema += (dtMs - ema) * 0.1;
    if (ema > 21) {
      slowFor += dtMs;
      fastFor = 0;
      if (slowFor > 500) {
        governor = Math.max(0.3, governor * 0.8);
        slowFor = 0;
      }
    } else if (ema < 17.6) {
      fastFor += dtMs;
      slowFor = 0;
      if (fastFor > 2000) {
        governor = Math.min(1, governor * 1.12);
        fastFor = 0;
      }
    }

    const live = engineLive();
    const p = live ? readProgress() : 0;
    const preRoll = entry && !live;
    const drawable = live || preRoll;
    show(drawable);

    // Forward crossings fire the timed effects (a jump does not).
    if (live && lastP >= 0 && p > lastP && p - lastP < 0.08) {
      for (let g = 0; g < groups.length; g += 1) {
        const lock = windows[g][1];
        if (lastP < lock && p >= lock) {
          const group = groups[g];
          const x = toX(group.ax);
          const y = toY(group.ay);
          const glow = now - lastGlow > 240;
          if (glow) lastGlow = now;
          effects.push({ x, y, at: now, kind: "lock", glow });
          burst(x, y, budget.sparks, 260, 0.55, (k) => (k % 3 === 0 ? 2 : k % 3 === 1 ? 1 : 0));
          camera.kick += 0.006;
          camera.shake = Math.min(budget.shake * 2, camera.shake + budget.shake);
        }
      }
      const coreX = toX(META_UNITAS_RX_MARKS.core[0]);
      const coreY = toY(META_UNITAS_RX_MARKS.core[1]);
      if (lastP < B.light[0] && p >= B.light[0]) {
        const big = now - lastBig >= 1000;
        if (big) lastBig = now;
        effects.push({ x: coreX, y: coreY, at: now, kind: "light", glow: big });
        burst(coreX, coreY, budget.sparks * 3, 520, 0.9, (k) => (k % 4 === 0 ? 2 : k % 2 ? 4 : 0));
        afterglowAt = now;
        afterglowTone = GOLD;
        camera.kick += 0.012;
        camera.shake = Math.min(budget.shake * 2.2, camera.shake + budget.shake * 1.8);
      }
      if (ultra() && lastP < B.form[0] + 0.01 && p >= B.form[0] + 0.01) {
        const big = now - lastBig >= 1000;
        if (big) lastBig = now;
        effects.push({ x: coreX, y: coreY, at: now, kind: "form", glow: big });
        burst(coreX, coreY, budget.sparks * 2, 420, 0.8, (k) => (k % 3 === 0 ? 2 : 3));
        afterglowAt = now;
        afterglowTone = LILAC;
        camera.kick += 0.01;
      }
    }
    if (live && p !== lastP) {
      if (lastP >= 0) lastMoveAt = now;
      lastP = p;
    }
    // The swarm answers the scroll: up at once, at rest it settles.
    if (!entry) {
      const moving = now - lastMoveAt < 320;
      const goal = moving ? 1 : 0;
      activity += (goal - activity) * (1 - Math.exp(-dt / (moving ? 0.12 : 0.7)));
    }

    // The score: how much swarm, and where it is drawn.
    const coreX = toX(META_UNITAS_RX_MARKS.core[0]);
    const coreY = toY(META_UNITAS_RX_MARKS.core[1]);
    let intensity = 0;
    if (preRoll) {
      intensity = 0.75 * (0.45 + 0.55 * Math.min(1, (now - startedAt) / 320));
      tx = coreX;
      ty = toY(META_UNITAS_RX_SIZE.height * 0.48);
      pull = 0.8;
      swirl = 1.3;
    } else if (live) {
      intensity =
        p < B.motes[0]
          ? 0.25 + 0.3 * span(p, 0.005, B.motes[0])
          : p < B.deus[0]
            ? 0.55 + 0.4 * span(p, B.motes[0], B.deus[0])
            : p < B.seal[1]
              ? 1
              : 1 - span(p, B.seal[1], B.complete + 0.01);
      if (p < 0.004 && !entry) intensity = 0;
      // The entry's swarm, already running from its first frame, does not
      // thin out when the engine joins.
      if (entry && p < B.deus[0]) intensity = Math.max(intensity, 0.75);
      // The active group: the latest window that has begun.
      let active = -1;
      for (let g = 0; g < groups.length; g += 1) if (p >= windows[g][0] - 0.02) active = g;
      if (p >= B.seal[0]) {
        const s = span(p, B.seal[0], B.seal[1]);
        tx = coreX;
        ty = coreY;
        pull = 1.4 + 2.2 * s;
        swirl = 1.4 + 0.8 * s;
      } else if (active >= 0) {
        const group = groups[active];
        const [a, lock] = windows[active];
        const s = span(p, a, lock);
        tx = toX(group.cx);
        ty = toY(group.cy);
        pull = 1 + 0.6 * s;
        swirl = 1.1 - 0.3 * s;
      } else {
        tx = coreX;
        ty = toY(META_UNITAS_RX_SIZE.height * 0.5);
        pull = 0.7;
        swirl = 1.3;
      }
    }
    const level = intensity * activity * governor;
    const want = drawable ? Math.floor(N * level) : 0;

    // Camera.
    let camScale = 1;
    if (live)
      camScale =
        1 +
        0.026 *
          smooth(span(p, B.deus[0] - 0.06, B.clamp)) *
          (1 - smooth(span(p, B.light[0], B.form[1])));
    camera.kick *= Math.exp(-dt / 0.3);
    camera.shake *= Math.exp(-dt / 0.13);
    camera.phase += dt;
    const dx = camera.shake * Math.sin(camera.phase * 61 + 1.3);
    const dy = camera.shake * Math.cos(camera.phase * 47);
    writeCamera(drawable ? camScale + camera.kick : 1, drawable ? dx : 0, drawable ? dy : 0);

    // Clear.
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.clearRect(0, 0, front.width, front.height);
    if (bctx && back) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, back.width, back.height);
    }
    const effectsAlive = effects.length > 0 || sparksAlive > 0 || now - afterglowAt < 1700;
    if (!drawable) {
      sleepOrContinue(false);
      return;
    }
    fctx.setTransform(fRatio, 0, 0, fRatio, 0, 0);
    fctx.globalCompositeOperation = "lighter";
    const bc = bctx ?? fctx;
    const br = bctx ? bRatio : fRatio;
    bc.setTransform(br, 0, 0, br, 0, 0);
    bc.globalCompositeOperation = "lighter";

    // The vortex's heart behind the figure.
    if (level > 0.01) {
      const radius = figH * 0.42;
      const gradient = bc.createRadialGradient(tx, ty, 0, tx, ty, radius);
      const hue = ultra() && p > B.form[0] ? LILAC : TEAL;
      gradient.addColorStop(0, rgba(hue, 0.16 * level));
      gradient.addColorStop(0.45, rgba(ORANGE, 0.05 * level));
      gradient.addColorStop(1, rgba(hue, 0));
      bc.fillStyle = gradient;
      bc.fillRect(tx - radius, ty - radius, radius * 2, radius * 2);
    }

    // Swarm: simulate and draw.
    const time = now / 1000;
    const flowF = 0.006 / unit;
    const capture = 10 * unit;
    const lilacSwarm = ultra() && p > B.form[0];
    const toneSprite = [sprites.teal, lilacSwarm ? sprites.lilac : sprites.orange, sprites.silver];
    const streak = [rgba(TEAL, 0.55), rgba(lilacSwarm ? LILAC : ORANGE, 0.6), rgba(SILVER, 0.6)];
    // Streaks by (layer, tone) in one path each.
    for (let pass = 1; pass <= 2; pass += 1) {
      for (let c = 0; c < 3; c += 1) {
        fctx.beginPath();
        let any = false;
        for (let i = 0; i < want; i += 1) {
          if (layer[i] !== pass || tone[i] !== c || !alive[i]) continue;
          fctx.moveTo(qx[i], qy[i]);
          fctx.lineTo(px[i], py[i]);
          any = true;
        }
        if (any) {
          fctx.strokeStyle = streak[c];
          fctx.lineWidth = (pass === 2 ? 1.6 : 0.9) * unit;
          fctx.stroke();
        }
      }
    }
    for (let i = 0; i < N; i += 1) {
      if (i >= want) {
        alive[i] = 0;
        continue;
      }
      if (!alive[i]) spawn(i);
      qx[i] = px[i];
      qy[i] = py[i];
      const L = layer[i];
      let ddx = tx - px[i];
      let ddy = ty - py[i];
      if (L === 0) ddy /= 0.45; // the disc is tilted: its space is flattened
      const dist = Math.hypot(ddx, ddy) + 0.001;
      ddx /= dist;
      ddy /= dist;
      const reach = figH * 0.5;
      const near = reach / (dist + reach);
      const k = L === 0 ? 0.35 : L === 1 ? 1 : 1.35;
      // pull, vortex, flow
      let ax = ddx * pull * 220 * unit * k * Math.min(1, dist / (reach * 0.4) + 0.25);
      let ay = ddy * pull * 220 * unit * k * Math.min(1, dist / (reach * 0.4) + 0.25);
      const turn = (L === 2 ? 1 : -1) * swirl * 520 * unit * near * (L === 0 ? 1.4 : 1);
      ax += -ddy * turn;
      ay += ddx * turn;
      const theta =
        2.2 * Math.sin(px[i] * flowF + time * 0.7 + L) +
        1.6 * Math.cos(py[i] * flowF * 1.3 - time * 0.55);
      const flow = (L === 0 ? 40 : 120) * unit;
      ax += Math.cos(theta) * flow;
      ay += Math.sin(theta) * flow;
      vx[i] += ax * dt;
      vy[i] += ay * dt;
      const drag = Math.exp(-dt * (L === 0 ? 0.9 : 1.6));
      vx[i] *= drag;
      vy[i] *= drag;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      life[i] -= dt;
      if (L !== 0 && dist < capture) alive[i] = 0;
      else if (life[i] <= 0) alive[i] = 0;
      if (L === 0) {
        // Drawn on the tilted disc behind the figure.
        const size = (7 + (i % 6) * 1.5) * unit;
        const yy = ty + (py[i] - ty) * 0.45;
        const fade = Math.min(1, life[i] * 2);
        bc.globalAlpha = 0.75 * fade;
        bc.drawImage(toneSprite[tone[i]], px[i] - size / 2, yy - size / 2, size, size);
      } else if (L === 2) {
        const size = (8 + (i % 4) * 2.5) * unit;
        fctx.globalAlpha = Math.min(1, life[i] * 2) * 0.9;
        fctx.drawImage(toneSprite[tone[i]], px[i] - size / 2, py[i] - size / 2, size, size);
      }
    }
    fctx.globalAlpha = 1;
    bc.globalAlpha = 1;

    if (live) {
      // The construction scan and the afterglow on the seams.
      for (let g = 0; g < groups.length; g += 1) {
        const [a, lock] = windows[g];
        if (p < a - 0.01 || p > lock + 0.04) continue;
        const s = span(p, a, lock);
        const lilac = lilacSwarm;
        if (s > 0 && s < 1) {
          // The construction scan: a line sweeping the group's box in the
          // order the engine lands it (bottom up; the helmet top down).
          const [bx0, by0, bx1, by1] = groups[g].box;
          const up = g !== 5;
          const yy = toY(up ? by1 - (by1 - by0) * s : by0 + (by1 - by0) * s);
          const left = toX(bx0) - 12 * unit;
          const right = toX(bx1) + 12 * unit;
          const band = fctx.createLinearGradient(left, 0, right, 0);
          const fade = Math.sin(Math.PI * s);
          band.addColorStop(0, rgba(TEAL, 0));
          band.addColorStop(0.5, rgba(lilac ? LILAC : ICE, 0.8 * fade));
          band.addColorStop(1, rgba(TEAL, 0));
          fctx.fillStyle = band;
          fctx.fillRect(left, yy - 1 * unit, right - left, 2 * unit);
          const haze = fctx.createLinearGradient(0, yy, 0, yy + (up ? 26 : -26) * unit);
          haze.addColorStop(0, rgba(TEAL, 0.16 * fade));
          haze.addColorStop(1, rgba(TEAL, 0));
          fctx.fillStyle = haze;
          fctx.fillRect(left, up ? yy : yy - 26 * unit, right - left, 26 * unit);
        }
        if (s < 1)
          drawSeams(
            fctx,
            groups[g],
            easeOut(Math.min(1, s * 1.2)),
            0.55 + 0.45 * s,
            true,
            TEAL,
            lilac ? LILAC : ORANGE,
          );
        else drawSeams(fctx, groups[g], 1, 1 - span(p, lock, lock + 0.04), false, ORANGE, GOLD);
        drawShards(fctx, groups[g], g, p, lilac);
      }
      // The seal: two rings closing on the core.
      if (p > B.seal[0] && p < B.seal[1] + 0.01) {
        const s = span(p, B.seal[0], B.seal[1]);
        const fade = Math.sin(Math.PI * Math.min(1, s * 1.05));
        for (const [r0, toneR, w] of [
          [0.62, TEAL, 2.2],
          [0.48, ORANGE, 1.4],
        ] as const) {
          const r = figH * r0 * (1 - 0.86 * easeInOut(s)) + 6 * unit;
          fctx.strokeStyle = rgba(toneR, 0.75 * fade);
          fctx.lineWidth = w * unit;
          fctx.beginPath();
          fctx.ellipse(coreX, coreY, r, r * 0.92, 0, 0, Math.PI * 2);
          fctx.stroke();
        }
      }
    }

    // Timed effects.
    for (let e = effects.length - 1; e >= 0; e -= 1) {
      const effect = effects[e];
      const age = now - effect.at;
      const span_ = effect.kind === "lock" ? 460 : 820;
      if (age > span_) {
        effects.splice(e, 1);
        continue;
      }
      const t = age / span_;
      const toneE = effect.kind === "form" ? LILAC : effect.kind === "light" ? GOLD : ORANGE;
      // The glow: small, short, at most one large a second.
      const glowLife = effect.kind === "lock" ? 260 : 520;
      if (effect.glow && age < glowLife) {
        const g = 1 - age / glowLife;
        const radius = figH * (effect.kind === "lock" ? 0.13 : 0.62);
        const peak = effect.kind === "lock" ? 0.5 : 0.38;
        const gradient = fctx.createRadialGradient(
          effect.x,
          effect.y,
          0,
          effect.x,
          effect.y,
          radius,
        );
        gradient.addColorStop(0, rgba(SILVER, peak * g * g));
        gradient.addColorStop(0.35, rgba(toneE, peak * 0.6 * g * g));
        gradient.addColorStop(1, rgba(toneE, 0));
        fctx.fillStyle = gradient;
        fctx.fillRect(effect.x - radius, effect.y - radius, radius * 2, radius * 2);
      }
      // The shock ring.
      const reach = figH * (effect.kind === "lock" ? 0.2 : effect.kind === "light" ? 1.25 : 0.9);
      const r = reach * easeOut(t) + 4 * unit;
      fctx.strokeStyle = rgba(effect.kind === "lock" ? GOLD : toneE, 0.85 * (1 - t) ** 1.5);
      fctx.lineWidth = (effect.kind === "lock" ? 2 : 3) * unit * (1 - t * 0.6);
      fctx.beginPath();
      fctx.ellipse(
        effect.x,
        effect.y,
        r,
        r * (effect.kind === "lock" ? 0.8 : 0.42),
        0,
        0,
        Math.PI * 2,
      );
      fctx.stroke();
      if (effect.kind !== "lock") {
        fctx.strokeStyle = rgba(TEAL, 0.6 * (1 - t) ** 2);
        fctx.lineWidth = 1.2 * unit;
        fctx.beginPath();
        fctx.ellipse(effect.x, effect.y, r * 0.72, r * 0.72 * 0.42, 0, 0, Math.PI * 2);
        fctx.stroke();
      }
    }
    // The light's afterglow and its embers.
    const afterAge = now - afterglowAt;
    if (afterAge < 1700) {
      const g = 1 - afterAge / 1700;
      const radius = figH * 0.36;
      const gradient = bc.createRadialGradient(coreX, coreY, 0, coreX, coreY, radius);
      gradient.addColorStop(0, rgba(afterglowTone, 0.3 * g * g));
      gradient.addColorStop(1, rgba(afterglowTone, 0));
      bc.fillStyle = gradient;
      bc.fillRect(coreX - radius, coreY - radius, radius * 2, radius * 2);
      if (Math.floor(afterAge / 90) !== Math.floor((afterAge - dtMs) / 90) && afterAge < 1100)
        burst(
          coreX + (random() - 0.5) * figH * 0.4,
          coreY + (random() - 0.2) * figH * 0.5,
          Math.max(2, Math.round(budget.sparks / 8)),
          40,
          1.4,
          (k) => (k % 2 ? 4 : afterglowTone === LILAC ? 3 : 0),
          60,
        );
    }
    // Sparks.
    sparksAlive = 0;
    const sparkTones: Tone[] = [TEAL, ORANGE, SILVER, LILAC, GOLD];
    const sparkDrag = Math.exp(-dt * 3.2);
    fctx.lineCap = "round";
    for (let i = 0; i < S; i += 1) {
      if (sl[i] <= 0) continue;
      sl[i] -= dt;
      if (sl[i] <= 0) continue;
      sparksAlive += 1;
      const x0 = sx[i];
      const y0 = sy[i];
      svx[i] *= sparkDrag;
      svy[i] *= sparkDrag;
      sx[i] += svx[i] * dt;
      sy[i] += svy[i] * dt;
      const a = sl[i] / sl0[i];
      fctx.strokeStyle = rgba(sparkTones[stone[i]], 0.9 * a);
      fctx.lineWidth = 1.5 * unit;
      fctx.beginPath();
      fctx.moveTo(x0 - svx[i] * 0.02, y0 - svy[i] * 0.02);
      fctx.lineTo(sx[i], sy[i]);
      fctx.stroke();
    }
    fctx.globalCompositeOperation = "source-over";
    bc.globalCompositeOperation = "source-over";
    sleepOrContinue(
      level > 0.004 || effectsAlive || camera.shake > 0.05 || camera.kick > 0.0004 || preRoll,
    );
  };

  const sleepOrContinue = (busy: boolean) => {
    if (disposed) return;
    if (entry || (busy && visible)) {
      raf = environment.requestAnimationFrame(tick);
      return;
    }
    // Asleep: the canvases are clear; the camera rests where the scroll put
    // it (its push follows the scroll on the next wake).
    lastNow = 0;
  };
  const wake = () => {
    if (disposed || raf || !visible) return;
    raf = environment.requestAnimationFrame(tick);
  };
  const onResize = () => {
    measured = false;
    wake();
  };
  environment.addEventListener("scroll", wake, { passive: true });
  environment.addEventListener("resize", onResize);
  const resizer =
    typeof environment.ResizeObserver === "function"
      ? new environment.ResizeObserver(onResize)
      : null;
  resizer?.observe(frame);
  // The engine adds its field canvases and flips its state: re-collect.
  const mutations =
    typeof environment.MutationObserver === "function"
      ? new environment.MutationObserver(() => {
          measured = false;
          wake();
        })
      : null;
  mutations?.observe(frame, { childList: true });
  mutations?.observe(runway, {
    attributes: true,
    attributeFilter: ["data-rzn-state", "data-rzn-arming", "data-form"],
  });
  const viewer =
    !entry && typeof environment.IntersectionObserver === "function"
      ? new environment.IntersectionObserver((records) => {
          visible = records[records.length - 1]?.isIntersecting ?? true;
          if (visible) wake();
        })
      : null;
  viewer?.observe(runway);
  wake();
  return () => {
    disposed = true;
    if (raf) environment.cancelAnimationFrame(raf);
    raf = 0;
    environment.removeEventListener("scroll", wake);
    environment.removeEventListener("resize", onResize);
    resizer?.disconnect();
    mutations?.disconnect();
    viewer?.disconnect();
    for (const target of targets) {
      target.element.style.transform = "";
      target.element.style.transformOrigin = "";
    }
    front.width = 0;
    front.height = 0;
    front.remove();
    if (back) {
      back.width = 0;
      back.height = 0;
      back.remove();
    }
  };
}
