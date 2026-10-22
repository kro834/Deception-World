/* FAR FROM SAGA — the ウルトラ sequence's scene (owner, 2026-10-22:
   「ファーフロム・ウルトラだけ体全身が白に染まった後、さらにナノマシンにより追加
   部分が生成された後、…コンピュータの様な補助インターフェースが腕の外などに
   展開されます。ウルトラだけ未来的で特殊なシークエンスで、更に別のナノマシンも
   使う」).

   Every frame is a closed-form function of the scroll progress q (0..1):
   no history, no clock, so a scrub in either direction, a jump or a cold
   frame lands on the same pixels. The one cache (the crystal armour's landed
   tiles) is a prefix of a fixed order, rebuilt under a per-frame budget when
   the scroll runs back.

   What it draws, in the owner's order, from the マックス cutout the #suitup
   runway ends on:
   1. the body turns white from the feet up (a white layer made once from
      マックス by blend modes, revealed behind the kit's scan plane);
   2. ウルトラ's own nanites (far-from-ultra-kit: a third kind, the Rexonance
      kit standing in) orbit the figure on the engine's ring lanes and dive
      onto the body tile by tile, the crystal armour spreading from the chest
      outward, then the added parts — the sharply extended head from the
      helmet up, the shoulder mechanisms, the bits' crystals, the blade tips
      — built outward; a chip's landing reveals its tile of the ウルトラ art;
   3. the light rings open around the figure, a sheen crosses the finished
      armour;
   4. the auxiliary interfaces deploy outside the arms: vector panels
      (unfold, scan, settle), wrist rings and the crown gauge, typed on in
      the HUD face. The marked draw passes allocate nothing; the ring and
      hash geometry is the Rexonance engine's (rexonance-assembly-nanites).

   Never imported on the page's startup path: far-from-ultra.ts imports this
   chunk once the runway is near, and only under the motion gate. */
import {
  FAR_FROM_ULTRA_BUDGET,
  FAR_FROM_ULTRA_CORE,
  FAR_FROM_ULTRA_FIGURE,
  FAR_FROM_ULTRA_FLIGHT,
  FAR_FROM_ULTRA_HUD,
  FAR_FROM_ULTRA_HUD_FONT,
  FAR_FROM_ULTRA_READOUTS,
  FAR_FROM_ULTRA_RINGS,
  FAR_FROM_ULTRA_TILE,
  FAR_FROM_ULTRA_WINDOWS,
  type FarFromUltraTier,
} from "./far-from-ultra-art.ts";
import type { FarFromUltraKit } from "./far-from-ultra-kit.ts";
import { naniteHash, naniteRings, naniteSizeScale } from "./rexonance-assembly-nanites.js";

const TAU = Math.PI * 2;
const W = FAR_FROM_ULTRA_FIGURE.width;
const H = FAR_FROM_ULTRA_FIGURE.height;
const T = FAR_FROM_ULTRA_TILE;
const WIN = FAR_FROM_ULTRA_WINDOWS;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const span = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const smooth = (u: number) => u * u * (3 - 2 * u);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
/** Calm, then the rush: a chip is fastest as it lands. */
const charge = (u: number) => 0.3 * u + 0.7 * u * u * u;
const bell = (u: number) => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI));

/* ---------------- the plan ---------------- */

/** Alpha samples of the マックス and ウルトラ cutouts on one grid (any
 * resolution proportional to the figure; one byte per sample). */
export type FarFromUltraAlpha = {
  width: number;
  height: number;
  max: ArrayLike<number>;
  body: ArrayLike<number>;
};

export interface FarFromUltraPlan {
  /** Tiles, in the order they land (t non-decreasing). */
  count: number;
  x: Float32Array;
  y: Float32Array;
  w: Float32Array;
  h: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  /** Each tile's landing (progress). */
  t: Float64Array;
  /** 0 the crystal armour over the body, 1 an added part. */
  group: Uint8Array;
  cov: Float32Array;
  /** The chips that build each tile. */
  chipFirst: Int32Array;
  chipCount: Uint8Array;
  chips: number;
  chipRing: Uint8Array;
  chipAngle: Float32Array;
  chipSize: Float32Array;
  chipHash: Float32Array;
  /** Tiles by group. */
  armourCount: number;
  partsCount: number;
  rings: ReturnType<typeof naniteRings>;
}

/** Plans the tiles from the two cutouts' alpha: where ウルトラ is opaque,
 * which of it マックス lacks (the added parts), and when each tile lands. */
export function planFarFromUltra(alpha: FarFromUltraAlpha): FarFromUltraPlan {
  const cols = Math.ceil(W / T);
  const rows = Math.ceil(H / T);
  const sx = alpha.width / W;
  const sy = alpha.height / H;
  const tiles: {
    x: number;
    y: number;
    w: number;
    h: number;
    cov: number;
    group: number;
    t: number;
  }[] = [];
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1) {
      const x = c * T;
      const y = r * T;
      const w = Math.min(T, W - x);
      const h = Math.min(T, H - y);
      const ax0 = Math.floor(x * sx);
      const ax1 = Math.max(ax0 + 1, Math.floor((x + w) * sx));
      const ay0 = Math.floor(y * sy);
      const ay1 = Math.max(ay0 + 1, Math.floor((y + h) * sy));
      let samples = 0;
      let body = 0;
      let added = 0;
      for (let ay = ay0; ay < ay1; ay += 1)
        for (let ax = ax0; ax < ax1; ax += 1) {
          const k = ay * alpha.width + ax;
          samples += 1;
          if (alpha.body[k] > 96) {
            body += 1;
            if (alpha.max[k] <= 96) added += 1;
          }
        }
      const cov = samples ? body / samples : 0;
      if (cov < 0.05) continue;
      tiles.push({ x, y, w, h, cov, group: added / body > 0.5 ? 1 : 0, t: 0 });
    }
  // The armour spreads from the chest outward; the added parts build from
  // the helmet up (the crown) and from the body outward (everything else).
  const [coreX, coreY] = FAR_FROM_ULTRA_CORE;
  let dMax = 1;
  for (const tile of tiles) {
    if (tile.group) continue;
    const d = Math.hypot(tile.x + tile.w / 2 - coreX, tile.y + tile.h / 2 - coreY);
    if (d > dMax) dMax = d;
  }
  tiles.forEach((tile, index) => {
    const cx = tile.x + tile.w / 2;
    const cy = tile.y + tile.h / 2;
    const jitter = naniteHash(index, 1);
    if (tile.group === 0) {
      const order = Math.hypot(cx - coreX, cy - coreY) / dMax;
      tile.t =
        WIN.armour[0] + (WIN.armour[1] - WIN.armour[0]) * (0.04 + 0.8 * order + 0.16 * jitter);
    } else {
      const crown = cy < 240 && Math.abs(cx - W / 2) < 220;
      const order = crown ? ((240 - cy) / 240) * 0.9 : 0.2 + (0.8 * Math.abs(cx - W / 2)) / (W / 2);
      tile.t = WIN.parts[0] + (WIN.parts[1] - WIN.parts[0]) * (0.04 + 0.8 * order + 0.16 * jitter);
    }
  });
  const order = tiles.map((_, index) => index).sort((a, b) => tiles[a].t - tiles[b].t || a - b);
  const n = tiles.length;
  const plan: FarFromUltraPlan = {
    count: n,
    x: new Float32Array(n),
    y: new Float32Array(n),
    w: new Float32Array(n),
    h: new Float32Array(n),
    cx: new Float32Array(n),
    cy: new Float32Array(n),
    t: new Float64Array(n),
    group: new Uint8Array(n),
    cov: new Float32Array(n),
    chipFirst: new Int32Array(n),
    chipCount: new Uint8Array(n),
    chips: 0,
    chipRing: new Uint8Array(0),
    chipAngle: new Float32Array(0),
    chipSize: new Float32Array(0),
    chipHash: new Float32Array(0),
    armourCount: 0,
    partsCount: 0,
    rings: naniteRings(W, H),
  };
  let chips = 0;
  order.forEach((source, i) => {
    const tile = tiles[source];
    plan.x[i] = tile.x;
    plan.y[i] = tile.y;
    plan.w[i] = tile.w;
    plan.h[i] = tile.h;
    plan.cx[i] = tile.x + tile.w / 2;
    plan.cy[i] = tile.y + tile.h / 2;
    plan.t[i] = tile.t;
    plan.group[i] = tile.group;
    plan.cov[i] = tile.cov;
    if (tile.group) plan.partsCount += 1;
    else plan.armourCount += 1;
    const count = tile.group
      ? 2 + (naniteHash(i, 2) > 0.5 ? 1 : 0)
      : 1 + (naniteHash(i, 2) > 0.55 ? 1 : 0);
    plan.chipFirst[i] = chips;
    plan.chipCount[i] = count;
    chips += count;
  });
  plan.chips = chips;
  plan.chipRing = new Uint8Array(chips);
  plan.chipAngle = new Float32Array(chips);
  plan.chipSize = new Float32Array(chips);
  plan.chipHash = new Float32Array(chips);
  for (let j = 0; j < chips; j += 1) {
    plan.chipRing[j] = Math.floor(naniteHash(j, 3) * plan.rings.count);
    plan.chipAngle[j] = naniteHash(j, 4) * TAU;
    plan.chipSize[j] = naniteSizeScale(naniteHash(j, 5));
    plan.chipHash[j] = naniteHash(j, 6);
  }
  return plan;
}

/** The phase (FAR_FROM_ULTRA_PHASES index) lit at q. */
export function farFromUltraPhase(q: number): number {
  if (q >= WIN.interface[0]) return 4;
  if (q >= WIN.halo[0]) return 3;
  if (q >= WIN.armour[0]) return 2;
  if (q >= WIN.white[0]) return 1;
  return 0;
}

/* ---------------- the scene ---------------- */

type Sheet = CanvasImageSource & { readonly width: number; readonly height: number };
type Layer = HTMLCanvasElement;

export interface FarFromUltraSceneOptions {
  plan: FarFromUltraPlan;
  tier: FarFromUltraTier;
  /** The cutouts (any delivery width, the figure's proportions) and the
   * kit's sheets (null: the swarm is not drawn). */
  bitmaps: { max: Sheet; body: Sheet; cells: Sheet | null; comets: Sheet | null; fx: Sheet | null };
  kit: FarFromUltraKit;
  /** For the scene's own layers (the white body, the landed tiles, a mask). */
  document: Document;
}

export interface FarFromUltraScene {
  /** The figure's place: device px per figure px, the figure's origin and
   * the frame, device px; the device ratio (CSS px → device px). */
  view(
    scale: number,
    x: number,
    y: number,
    ratio: number,
    frameWidth: number,
    frameHeight: number,
  ): void;
  /** The frame's state at q and the cache's catch-up under its budget. */
  frame(q: number): void;
  /** Whether the landed cache matches the last frame's q. */
  settled(): boolean;
  /** Every pass, in order, on a context already sized to the frame. */
  draw(context: CanvasRenderingContext2D): void;
  /** The last frame's q. */
  progress(): number;
  release(): void;
}

// The HUD's panel metrics, device px, one stride per panel. A panel's local
// frame has its origin on its inner edge's midpoint, x rightward on screen
// (so its read-outs read the right way on either side) and y down, leaned
// by its rotation; the panel spans [x0, x0 + w], x0 = −w on the left side.
const PM = 20;
const PM_OX = 0; // the inner edge's midpoint
const PM_OY = 1;
const PM_EXX = 2; // the local x axis (unit, on screen)
const PM_EXY = 3;
const PM_EYX = 4; // the local y axis
const PM_EYY = 5;
const PM_W = 6;
const PM_HH = 7; // half height
const PM_TX = 8; // the tether point
const PM_TY = 9;
const PM_HEAD = 10; // the header bar's height
const PM_PAD = 11;
const PM_LINE = 12; // the read-outs' line height
const PM_T0 = 13; // when it starts and ends (progress)
const PM_T1 = 14;
const PM_TITLE_W = 15;
const PM_X0 = 16; // the panel's near x (0 on the right side, −w on the left)
const LINES = 5;
const CHARS = 16;

// The state slots a frame leaves for the passes (doubles in one array).
const S_Q = 0;
const S_WHITE = 1; // the white front, 0 feet → 1 head
const S_FRONT = 2; // its y, figure px
const S_ARMOUR = 3; // the armour window's share
const S_SHEEN = 4;
const S_HALO = 5;
const S_IFACE = 6;
const S_MOTES = 7; // the orbiting motes' alpha
const S_LO = 8; // the active tiles [lo, hi)
const S_HI = 9;
const S_STRIDE = 10;
const S_SCAN = 11; // the body scan before the interfaces
const S_LANDED = 12;
const S_TARGET = 13;
const SLOTS = 16;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const AQUA = "rgb(156 241 255)";
const AQUA_DIM = "rgb(94 190 230)";
const WHITE = "rgb(248 252 255)";
const DEEP = "rgb(40 120 220)";
const INK = "rgb(4 10 22)";

export function createFarFromUltraScene(options: FarFromUltraSceneOptions): FarFromUltraScene {
  const { plan, kit } = options;
  const budget = FAR_FROM_ULTRA_BUDGET[options.tier];
  const coarse = options.tier === "coarse";
  const sizes = FAR_FROM_ULTRA_HUD.sizes[options.tier];
  const max = options.bitmaps.max;
  const body = options.bitmaps.body;
  const cells = options.bitmaps.cells;
  const comets = options.bitmaps.comets;
  const fx = options.bitmaps.fx;
  const kitCells = kit.cells;
  const kitComets = kit.comets;
  // The chips' tones: most the main (white) tone, every third the accent.
  const toneMain = kitCells.tones[kit.tones.main] ?? 0;
  const toneAccent = kitCells.tones[kit.tones.accent] ?? 0;
  const cometRow = kitComets.rows[kit.cometTone] ?? 0;
  const CELL = kitCells.cell;
  const MIP = kitCells.mip.cell;
  const FRAMES = kitCells.frames;
  const doc = options.document;
  // The bitmaps' scale against the figure grid (integer tile edges: 24 × 0.75).
  const bs = max.width / W;
  const bw = Math.round(W * bs);
  const bh = Math.round(H * bs);

  const layer = (width: number, height: number): Layer => {
    const canvas = doc.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  // The white body: マックス desaturated, lifted and cooled, its alpha kept.
  const white = layer(bw, bh);
  {
    const context = white.getContext("2d") as CanvasRenderingContext2D;
    context.drawImage(max, 0, 0, bw, bh);
    context.globalCompositeOperation = "saturation";
    context.fillStyle = "#808080";
    context.fillRect(0, 0, bw, bh);
    context.globalCompositeOperation = "screen";
    context.fillStyle = "rgb(150 162 178)";
    context.fillRect(0, 0, bw, bh);
    context.globalCompositeOperation = "multiply";
    context.fillStyle = "rgb(234 244 255)";
    context.fillRect(0, 0, bw, bh);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(max, 0, 0, bw, bh);
    context.globalCompositeOperation = "source-over";
  }
  // The landed tiles (a prefix of the plan) and a scratch mask.
  const settled = layer(bw, bh);
  const settledContext = settled.getContext("2d") as CanvasRenderingContext2D;
  const mask = layer(bw, bh);
  const maskContext = mask.getContext("2d") as CanvasRenderingContext2D;
  // The white front's feather (transparent above, white below) and the sheen band.
  const FEATHER = Math.round(72 * bs);
  const feather = layer(4, FEATHER);
  {
    const context = feather.getContext("2d") as CanvasRenderingContext2D;
    const ramp = context.createLinearGradient(0, 0, 0, FEATHER);
    ramp?.addColorStop(0, "rgba(255,255,255,0)");
    ramp?.addColorStop(1, "rgba(255,255,255,1)");
    context.fillStyle = ramp ?? "#fff";
    context.fillRect(0, 0, 4, FEATHER);
  }
  const BAND = Math.round(bw * 0.42);
  const band = layer(BAND, 4);
  {
    const context = band.getContext("2d") as CanvasRenderingContext2D;
    const ramp = context.createLinearGradient(0, 0, BAND, 0);
    ramp?.addColorStop(0, "rgba(255,255,255,0)");
    ramp?.addColorStop(0.5, "rgba(255,255,255,1)");
    ramp?.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = ramp ?? "#fff";
    context.fillRect(0, 0, BAND, 4);
  }

  const S = new Float64Array(SLOTS);
  S[S_Q] = -1;
  // The view, device px.
  const V = new Float64Array(8);
  const V_SCALE = 0;
  const V_X = 1;
  const V_Y = 2;
  const V_RATIO = 3;
  const V_FW = 4;
  const V_FH = 5;
  V[V_SCALE] = 1;
  V[V_RATIO] = 1;
  // The chip base size (figure px) and the landed cache.
  const CHIP = 21;
  // The chips tumble through the kit's lit frames only (f9–f15 are the dark
  // back): sixteen frames, the back skipped.
  const LIT = FRAMES - 7;
  const litFrame = (f: number) => (f < 9 ? f : f + 7);
  let landed = 0;
  const rings = plan.rings;
  const MOTES = budget.motes;
  const IS = WIN.interface[1] - WIN.interface[0];

  // The HUD: the panels' metrics, their read-outs as single characters with
  // measured offsets (the type-on draws a prefix without slicing a string).
  const panels = FAR_FROM_ULTRA_HUD.panels;
  const P = new Float64Array(panels.length * PM);
  const GX = new Float32Array(panels.length * LINES * (CHARS + 1));
  const TX = new Float32Array(panels.length * (CHARS + 1));
  const lines: string[][][] = panels.map((panel) =>
    FAR_FROM_ULTRA_READOUTS[panel.kind].map((line) => Array.from(line.slice(0, CHARS))),
  );
  const titles: string[][] = panels.map((panel) => Array.from(panel.title.slice(0, CHARS)));
  const crownLabel = Array.from(FAR_FROM_ULTRA_HUD.crown.label);
  const CX = new Float32Array(CHARS + 1);
  let fontText = "";
  let fontTitle = "";
  let fontCrown = "";
  let digitW = 0;
  let crownW = 0;
  const measurer = doc.createElement("canvas").getContext("2d");

  const view: FarFromUltraScene["view"] = (scale, x, y, ratio, frameWidth, frameHeight) => {
    V[V_SCALE] = scale;
    V[V_X] = x;
    V[V_Y] = y;
    V[V_RATIO] = ratio;
    V[V_FW] = frameWidth;
    V[V_FH] = frameHeight;
    const textPx = Math.round(sizes.text * ratio);
    const titlePx = Math.round(sizes.title * ratio);
    fontText = `500 ${textPx}px ${FAR_FROM_ULTRA_HUD_FONT}`;
    fontTitle = `600 ${titlePx}px ${FAR_FROM_ULTRA_HUD_FONT}`;
    fontCrown = `600 ${Math.round((coarse ? 9 : 11) * ratio)}px ${FAR_FROM_ULTRA_HUD_FONT}`;
    const measure = (
      font: string,
      chars: readonly string[],
      out: ArrayLike<number> & { [k: number]: number },
      at: number,
    ) => {
      let run = 0;
      if (measurer) measurer.font = font;
      for (let k = 0; k < chars.length; k += 1) {
        out[at + k] = run;
        run += measurer ? measurer.measureText(chars[k]).width : textPx * 0.62;
      }
      out[at + chars.length] = run;
      return run;
    };
    if (measurer) measurer.font = fontText;
    digitW = measurer ? measurer.measureText("0").width : textPx * 0.7;
    crownW = measure(fontCrown, crownLabel, CX, 0);
    panels.forEach((panel, p) => {
      const base = p * PM;
      const [wCss, hCss] = sizes[panel.size];
      const cos = Math.cos(panel.rot);
      const sin = Math.sin(panel.rot);
      const pad = Math.round(textPx * 0.7);
      P[base + PM_OX] = x + panel.ix * scale;
      P[base + PM_OY] = y + panel.iy * scale;
      P[base + PM_EXX] = cos;
      P[base + PM_EXY] = sin;
      P[base + PM_EYX] = -sin;
      P[base + PM_EYY] = cos;
      P[base + PM_HH] = Math.round((hCss * ratio) / 2);
      P[base + PM_TX] = x + panel.tether[0] * scale;
      P[base + PM_TY] = y + panel.tether[1] * scale;
      P[base + PM_HEAD] = Math.round(titlePx * 1.9);
      P[base + PM_PAD] = pad;
      P[base + PM_LINE] = Math.round(textPx * 1.5);
      P[base + PM_T0] = WIN.interface[0] + panel.at * IS;
      P[base + PM_T1] = WIN.interface[0] + (panel.at + panel.span) * IS;
      // Wide enough for its longest read-out and its title.
      let longest = measure(fontTitle, titles[p], TX, p * (CHARS + 1));
      P[base + PM_TITLE_W] = longest;
      lines[p].forEach((chars, l) => {
        const run = measure(fontText, chars, GX, (p * LINES + l) * (CHARS + 1));
        if (run > longest) longest = run;
      });
      const w = Math.round(Math.max(wCss * ratio, longest + 2 * pad + 2 * ratio));
      P[base + PM_W] = w;
      P[base + PM_X0] = panel.side < 0 ? -w : 0;
    });
  };

  const upperBound = (q: number) => {
    let lo = 0;
    let hi = plan.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (plan.t[mid] <= q) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const lowerBound = (q: number) => {
    let lo = 0;
    let hi = plan.count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (plan.t[mid] < q) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const weld = (i: number) => {
    const sx = plan.x[i] * bs;
    const sy = plan.y[i] * bs;
    const sw = plan.w[i] * bs;
    const sh = plan.h[i] * bs;
    settledContext.drawImage(body, sx, sy, sw, sh, sx, sy, sw, sh);
  };

  const frame: FarFromUltraScene["frame"] = (q) => {
    q = clamp01(q);
    S[S_Q] = q;
    const w = easeOut(span(q, WIN.white[0], WIN.white[1]));
    S[S_WHITE] = w;
    S[S_FRONT] = H * (1 - w);
    S[S_ARMOUR] = span(q, WIN.armour[0], WIN.armour[1]);
    S[S_SHEEN] = span(q, WIN.parts[1] - 0.02, WIN.halo[1] - 0.02);
    S[S_HALO] = span(q, WIN.halo[0], WIN.halo[1]);
    S[S_IFACE] = span(q, WIN.interface[0], WIN.interface[1]);
    S[S_SCAN] = span(q, WIN.interface[0] - 0.03, WIN.interface[0] + 0.05);
    S[S_MOTES] =
      span(q, WIN.armour[0] - 0.05, WIN.armour[0]) *
      (1 - span(q, WIN.halo[1], WIN.interface[0] + 0.04));
    // The tiles in flight or flashing: [lo, hi) of the plan's order.
    const flight = Math.max(FAR_FROM_ULTRA_FLIGHT.armour, FAR_FROM_ULTRA_FLIGHT.parts);
    const lo = lowerBound(q - FAR_FROM_ULTRA_FLIGHT.flash);
    const hi = upperBound(q + flight);
    S[S_LO] = lo;
    S[S_HI] = hi;
    let active = 0;
    for (let i = lo; i < hi; i += 1) active += plan.chipCount[i];
    S[S_STRIDE] = active > budget.sprites ? Math.ceil(active / budget.sprites) : 1;
    // The landed cache: a prefix of the order, caught up under the budget.
    const target = upperBound(q);
    S[S_TARGET] = target;
    if (target < landed) {
      settledContext.clearRect(0, 0, bw, bh);
      landed = 0;
    }
    let work = budget.cache;
    while (landed < target && work > 0) {
      weld(landed);
      landed += 1;
      work -= 1;
    }
    S[S_LANDED] = landed;
  };

  // A chip's pose and velocity, written by chipPose for the flight pass.
  const POSE = new Float64Array(6);

  /* -- draw passes: allocation-free from here -- */

  const chip = (
    context: CanvasRenderingContext2D,
    tone: number,
    f: number,
    x: number,
    y: number,
    k: number,
  ) => {
    if (!cells) return;
    if (k <= 12) {
      const m = Math.round(k * 1.15) | 1;
      context.drawImage(
        cells,
        kitCells.mip.x[tone] + MIP * f,
        kitCells.mip.y[tone],
        MIP,
        MIP,
        Math.round(x - m / 2),
        Math.round(y - m / 2),
        m,
        m,
      );
    } else {
      context.drawImage(
        cells,
        CELL * f,
        CELL * tone,
        CELL,
        CELL,
        Math.round(x - k / 2),
        Math.round(y - k / 2),
        k,
        k,
      );
    }
  };

  const spark = (context: CanvasRenderingContext2D, f: number, x: number, y: number, k: number) => {
    if (!cells) return;
    context.drawImage(
      cells,
      kitCells.spark.x + CELL * f,
      kitCells.spark.y,
      CELL,
      CELL,
      Math.round(x - k / 2),
      Math.round(y - k / 2),
      k,
      k,
    );
  };

  // A chip's pose at u along its flight to tile i: from its ring lane (as the
  // lane has turned by its departure) along a bowed path to the tile.
  const chipPose = (i: number, j: number, u: number) => {
    const r = plan.chipRing[j];
    const depart =
      plan.t[i] - (plan.group[i] ? FAR_FROM_ULTRA_FLIGHT.parts : FAR_FROM_ULTRA_FLIGHT.armour);
    const a = plan.chipAngle[j] + rings.omega[r] * 0.35 * depart;
    const ex = rings.rx[r] * Math.cos(a);
    const ey = rings.ry[r] * Math.sin(a);
    const x0 = W / 2 + ex * rings.cos[r] - ey * rings.sin[r];
    const y0 = rings.cy[r] + ex * rings.sin[r] + ey * rings.cos[r];
    const x1 = plan.cx[i];
    const y1 = plan.cy[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const bow = (plan.chipHash[j] - 0.5) * 0.6;
    const mx = (x0 + x1) / 2 - dy * bow;
    const my = (y0 + y1) / 2 + dx * bow;
    const s = charge(u);
    const t1 = 1 - s;
    POSE[0] = t1 * t1 * x0 + 2 * t1 * s * mx + s * s * x1;
    POSE[1] = t1 * t1 * y0 + 2 * t1 * s * my + s * s * y1;
    // The velocity (per unit u), for the comet's heading and length.
    POSE[2] = 2 * t1 * (mx - x0) + 2 * s * (x1 - mx);
    POSE[3] = 2 * t1 * (my - y0) + 2 * s * (y1 - my);
  };

  const comet = (
    context: CanvasRenderingContext2D,
    row: number,
    vx: number,
    vy: number,
    x: number,
    y: number,
    k: number,
  ) => {
    if (!comets) return;
    let a = Math.round(Math.atan2(vy, vx) / (kitComets.step * (Math.PI / 180)));
    a = ((a % kitComets.angles) + kitComets.angles) % kitComets.angles;
    const c = kitComets.cell;
    const size = Math.round(c * k);
    context.drawImage(
      comets,
      c * a,
      c * (row + 1),
      c,
      c,
      Math.round(x - kitComets.head[0] * k),
      Math.round(y - kitComets.head[1] * k),
      size,
      size,
    );
  };

  // The orbiting motes: on the engine's ring lanes, turning with q.
  const motes = (context: CanvasRenderingContext2D, front: boolean) => {
    if (!cells || S[S_MOTES] <= 0) return;
    const q = S[S_Q];
    const scale = V[V_SCALE];
    const ox = V[V_X];
    const oy = V[V_Y];
    context.globalAlpha = 0.85 * S[S_MOTES];
    for (let m = 0; m < MOTES; m += 1) {
      const r = m % rings.count;
      const a = naniteHash(m, 11) * TAU + rings.omega[r] * 0.35 * q;
      const sin = Math.sin(a);
      if (sin > 0 !== front) continue;
      const ex = rings.rx[r] * Math.cos(a);
      const ey = rings.ry[r] * sin;
      const x = ox + (W / 2 + ex * rings.cos[r] - ey * rings.sin[r]) * scale;
      const y = oy + (rings.cy[r] + ex * rings.sin[r] + ey * rings.cos[r]) * scale;
      const k = Math.round((10 + 8 * naniteHash(m, 12)) * scale * (front ? 1 : 0.8)) | 1;
      const f = litFrame(Math.floor(naniteHash(m, 13) * LIT + q * 60) % LIT);
      chip(context, m % 3 === 0 ? toneAccent : toneMain, f, x, y, k);
    }
    context.globalAlpha = 1;
  };

  // A light ring's arc: the part behind the figure (its upper half) or
  // before it, open 2e about its back centre, with its ticks.
  const ring = (context: CanvasRenderingContext2D, k: number, front: boolean) => {
    const spec = FAR_FROM_ULTRA_RINGS[k];
    const v = span(S[S_HALO], spec.from, spec.to);
    if (v <= 0) return;
    const scale = V[V_SCALE];
    const ratio = V[V_RATIO];
    const cx = V[V_X] + spec.cx * scale;
    const cy = V[V_Y] + spec.cy * scale;
    const rx = spec.rx * scale * (0.92 + 0.08 * easeOut(v));
    const ry = spec.ry * scale * (0.92 + 0.08 * easeOut(v));
    const e = Math.PI * easeOut(v);
    const turn = S[S_Q] * (k % 2 ? -0.9 : 0.7);
    context.strokeStyle = k === 1 ? WHITE : AQUA;
    context.lineWidth = ratio * (k === 2 ? 1 : 1.4);
    context.globalAlpha = (k === 2 ? 0.34 : 0.7) * Math.min(1, v * 2);
    context.beginPath();
    if (spec.behind) {
      if (front) return;
      context.ellipse(cx, cy, rx, ry, 0, 1.5 * Math.PI - e, 1.5 * Math.PI + e);
    } else if (!front) {
      const half = Math.min(e, Math.PI / 2);
      context.ellipse(cx, cy, rx, ry, 0, 1.5 * Math.PI - half, 1.5 * Math.PI + half);
    } else {
      if (e <= Math.PI / 2) return;
      context.ellipse(cx, cy, rx, ry, 0, 1.5 * Math.PI - e, Math.PI);
      context.moveTo(cx + rx, cy);
      context.ellipse(cx, cy, rx, ry, 0, 0, e - Math.PI / 2);
    }
    context.stroke();
    // The ticks, one path.
    context.beginPath();
    for (let n = 0; n < spec.ticks; n += 1) {
      const a = (TAU * n) / spec.ticks + turn;
      const sin = Math.sin(a);
      if (sin > 0 !== front && !spec.behind) continue;
      if (spec.behind && sin > 0 && k !== 2) continue;
      // Within the open arc: its angle from the back centre.
      let d = ((a - 1.5 * Math.PI) % TAU) + (a < 1.5 * Math.PI ? TAU : 0);
      if (d > Math.PI) d = TAU - d;
      if (d > e) continue;
      const cos = Math.cos(a);
      const long = n % 6 === 0 ? 1.09 : 1.045;
      context.moveTo(cx + rx * cos, cy + ry * sin);
      context.lineTo(cx + rx * long * cos, cy + ry * long * sin);
    }
    context.stroke();
    context.globalAlpha = 1;
  };

  const backPass = (context: CanvasRenderingContext2D) => {
    ring(context, 2, false);
    ring(context, 0, false);
    ring(context, 1, false);
    motes(context, false);
  };

  // The figure: マックス, then the white body rising behind its front, then
  // the crystal armour's landed tiles over the white, then ウルトラ whole.
  const bodyPass = (context: CanvasRenderingContext2D) => {
    const q = S[S_Q];
    const scale = V[V_SCALE];
    context.setTransform(scale, 0, 0, scale, V[V_X], V[V_Y]);
    if (q < WIN.white[0]) {
      context.drawImage(max, 0, 0, bw, bh, 0, 0, W, H);
    } else if (q < WIN.white[1]) {
      context.drawImage(max, 0, 0, bw, bh, 0, 0, W, H);
      const front = Math.round(S[S_FRONT] * bs);
      maskContext.clearRect(0, 0, bw, bh);
      maskContext.fillStyle = "#fff";
      maskContext.fillRect(0, front, bw, bh - front);
      maskContext.drawImage(feather, 0, front - FEATHER, bw, FEATHER);
      maskContext.globalCompositeOperation = "source-in";
      maskContext.drawImage(white, 0, 0);
      maskContext.globalCompositeOperation = "source-over";
      context.drawImage(mask, 0, 0, bw, bh, 0, 0, W, H);
    } else if (landed < plan.count) {
      context.drawImage(white, 0, 0, bw, bh, 0, 0, W, H);
      if (landed > 0) context.drawImage(settled, 0, 0, bw, bh, 0, 0, W, H);
    } else {
      context.drawImage(body, 0, 0, bw, bh, 0, 0, W, H);
    }
    // The sheen across the finished armour.
    const sheen = S[S_SHEEN];
    if (sheen > 0 && sheen < 1) {
      maskContext.clearRect(0, 0, bw, bh);
      maskContext.setTransform(1, 0, -0.42, 1, Math.round(-BAND + (bw + 2 * BAND) * sheen), 0);
      maskContext.drawImage(band, 0, 0, BAND, bh * 1.2);
      maskContext.setTransform(1, 0, 0, 0, 0, 0);
      maskContext.setTransform(1, 0, 0, 1, 0, 0);
      maskContext.globalCompositeOperation = "destination-in";
      maskContext.drawImage(landed < plan.count ? settled : body, 0, 0, bw, bh);
      maskContext.globalCompositeOperation = "source-over";
      context.globalAlpha = 0.55 * bell(sheen);
      context.drawImage(mask, 0, 0, bw, bh, 0, 0, W, H);
      context.globalAlpha = 1;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
  };

  // The white front: the kit's scan plane receding upward from the front,
  // the lit edge, and sparks on the body along it.
  const frontPass = (context: CanvasRenderingContext2D) => {
    const w = S[S_WHITE];
    if (w <= 0 || w >= 1) return;
    const scale = V[V_SCALE];
    const ratio = V[V_RATIO];
    const ox = V[V_X];
    const oy = V[V_Y];
    const y = oy + S[S_FRONT] * scale;
    const width = W * scale;
    if (fx) {
      const scan = kit.fx.scan;
      const sw = Math.round(width * 1.12);
      const k = sw / scan.w;
      const sh = Math.round(scan.h * k);
      context.globalAlpha = 0.9 * bell(w * 0.9 + 0.05);
      context.drawImage(
        fx,
        scan.x,
        scan.y,
        scan.w,
        scan.h,
        Math.round(ox - (sw - width) / 2),
        Math.round(y - scan.edgeY * k),
        sw,
        sh,
      );
      context.globalAlpha = 1;
    }
    context.fillStyle = WHITE;
    context.globalAlpha = 0.22;
    context.fillRect(
      Math.round(ox),
      Math.round(y - 8 * ratio),
      Math.round(width),
      Math.round(10 * ratio),
    );
    context.globalAlpha = 0.95;
    context.fillRect(
      Math.round(ox),
      Math.round(y - ratio),
      Math.round(width),
      Math.round(2 * ratio),
    );
    context.globalAlpha = 1;
    // Sparks on the body tiles the front is crossing.
    let drawn = 0;
    const front = S[S_FRONT];
    for (let i = 0; i < plan.count && drawn < 28; i += 1) {
      if (plan.group[i] || plan.cov[i] < 0.5) continue;
      const d = plan.cy[i] - front;
      if (d < -T || d > T) continue;
      const h = naniteHash(i, 21);
      if (h > 0.35) continue;
      drawn += 1;
      const f = Math.floor(h * 40 + S[S_Q] * 400) & 3;
      spark(
        context,
        f,
        ox + plan.cx[i] * scale,
        y + (h - 0.17) * 40 * scale,
        Math.round((22 + 18 * h) * scale),
      );
    }
  };

  // The chips in flight to their tiles, their comets at speed, and each
  // landing's flash on the tile it reveals.
  const flightPass = (context: CanvasRenderingContext2D) => {
    const q = S[S_Q];
    const lo = S[S_LO];
    const hi = S[S_HI];
    if (hi <= lo) return;
    const stride = S[S_STRIDE];
    const scale = V[V_SCALE];
    const ox = V[V_X];
    const oy = V[V_Y];
    let n = 0;
    for (let i = lo; i < hi; i += 1) {
      const parts = plan.group[i] === 1;
      const flight = parts ? FAR_FROM_ULTRA_FLIGHT.parts : FAR_FROM_ULTRA_FLIGHT.armour;
      const t = plan.t[i];
      if (q >= t) {
        // Landed: the flash on the tile.
        const f = (q - t) / FAR_FROM_ULTRA_FLIGHT.flash;
        if (f >= 1) continue;
        context.globalAlpha = (1 - f) * (parts ? 0.7 : 0.45);
        context.fillStyle = WHITE;
        context.fillRect(
          Math.round(ox + plan.x[i] * scale),
          Math.round(oy + plan.y[i] * scale),
          Math.round(plan.w[i] * scale) || 1,
          Math.round(plan.h[i] * scale) || 1,
        );
        context.globalAlpha = 1;
        spark(
          context,
          Math.min(3, Math.floor(f * 4)),
          ox + plan.cx[i] * scale,
          oy + plan.cy[i] * scale,
          Math.round((parts ? 46 : 34) * scale),
        );
        continue;
      }
      const u = (q - (t - flight)) / flight;
      if (u < 0) continue;
      const first = plan.chipFirst[i];
      const count = plan.chipCount[i];
      for (let c = 0; c < count; c += 1) {
        n += 1;
        if (n % stride) continue;
        const j = first + c;
        const lag = 0.12 * plan.chipHash[j];
        const uc = clamp01((u - lag) / (1 - lag));
        if (uc <= 0) continue;
        chipPose(i, j, uc);
        const x = ox + POSE[0] * scale;
        const y = oy + POSE[1] * scale;
        const tone = j % 3 === 0 ? toneAccent : toneMain;
        if (uc > 0.12 && uc < 0.78 && plan.chipHash[j] > 0.45) {
          const speed = Math.sqrt(POSE[2] * POSE[2] + POSE[3] * POSE[3]) * scale;
          const k = Math.min(1.8, Math.max(0.6, speed / (kitComets.tail[1] * 14)));
          comet(context, cometRow, POSE[2], POSE[3], x, y, k);
        } else {
          const k = Math.round(CHIP * plan.chipSize[j] * (1.25 - 0.3 * uc) * scale) | 1;
          const f =
            uc > 0.88
              ? kitCells.lockFrame
              : litFrame(Math.floor(plan.chipHash[j] * LIT + uc * 40) % LIT);
          chip(context, tone, f, x, y, k);
        }
      }
    }
  };

  // The body scan before the interfaces deploy: one line down the figure.
  const scanPass = (context: CanvasRenderingContext2D) => {
    const s = S[S_SCAN];
    if (s <= 0 || s >= 1) return;
    const scale = V[V_SCALE];
    const ratio = V[V_RATIO];
    const ox = Math.round(V[V_X] - 24 * scale);
    const width = Math.round((W + 48) * scale);
    const y = V[V_Y] + H * s * scale;
    context.fillStyle = AQUA;
    context.globalAlpha = 0.08 * bell(s);
    context.fillRect(ox, Math.round(y - 14 * ratio), width, Math.round(14 * ratio));
    context.globalAlpha = 0.75 * bell(s);
    context.fillRect(ox, Math.round(y - ratio), width, Math.round(ratio) || 1);
    context.globalAlpha = 1;
  };

  // A prefix of a read-out's characters, typed on.
  const type = (
    context: CanvasRenderingContext2D,
    chars: string[],
    offsets: ArrayLike<number>,
    at: number,
    x: number,
    y: number,
    visible: number,
  ) => {
    for (let k = 0; k < chars.length && k < visible; k += 1)
      context.fillText(chars[k], x + offsets[at + k], y);
  };

  // A number 0–999 from the digit table, right-aligned at x.
  const number = (context: CanvasRenderingContext2D, value: number, x: number, y: number) => {
    let v = Math.floor(value);
    if (v < 0) v = 0;
    if (v > 999) v = 999;
    const ones = v % 10;
    const tens = Math.floor(v / 10) % 10;
    const hundreds = Math.floor(v / 100);
    context.fillText(DIGITS[ones], x - digitW, y);
    if (v >= 10) context.fillText(DIGITS[tens], x - 2 * digitW, y);
    if (v >= 100) context.fillText(DIGITS[hundreds], x - 3 * digitW, y);
  };

  const panelPass = (context: CanvasRenderingContext2D) => {
    const q = S[S_Q];
    const ratio = V[V_RATIO];
    for (let p = 0; p < panels.length; p += 1) {
      const base = p * PM;
      const v = span(q, P[base + PM_T0], P[base + PM_T1]);
      if (v <= 0) continue;
      const kind = panels[p].kind;
      const u = easeOut(span(v, 0, 0.35));
      const a = span(v, 0.22, 0.5);
      const s = span(v, 0.3, 0.72);
      const settleV = span(v, 0.7, 1);
      const w = P[base + PM_W];
      const x0 = P[base + PM_X0];
      const x1 = x0 + w;
      const hh = P[base + PM_HH];
      const head = P[base + PM_HEAD];
      const pad = P[base + PM_PAD];
      const line = P[base + PM_LINE];
      const ox = P[base + PM_OX];
      const oy = P[base + PM_OY];
      // The tether, from the inner edge's midpoint to the arm.
      context.globalAlpha = 0.8 * a;
      context.strokeStyle = AQUA;
      context.lineWidth = ratio;
      context.beginPath();
      context.moveTo(ox, oy);
      context.lineTo(P[base + PM_TX], P[base + PM_TY]);
      context.stroke();
      context.fillStyle = WHITE;
      context.beginPath();
      context.arc(P[base + PM_TX], P[base + PM_TY], 2.2 * ratio, 0, TAU);
      context.fill();
      // The panel's frame, unfolding outward from its inner edge (x scaled
      // about the origin, which sits on that edge).
      const grow = u * (1 + 0.05 * bell(span(v, 0.3, 0.5)));
      context.setTransform(
        P[base + PM_EXX] * grow,
        P[base + PM_EXY] * grow,
        P[base + PM_EYX],
        P[base + PM_EYY],
        ox,
        oy,
      );
      const glow = 1 + 0.45 * (1 - settleV);
      // The glass: an ink backing (the read-outs stay legible over the
      // figure's brightest crystal), the blue tint, the lit header.
      context.globalAlpha = 0.5;
      context.fillStyle = INK;
      context.fillRect(x0, -hh, w, 2 * hh);
      context.globalAlpha = 0.18 * glow;
      context.fillStyle = DEEP;
      context.fillRect(x0, -hh, w, 2 * hh);
      context.globalAlpha = 0.34 * glow;
      context.fillStyle = AQUA;
      context.fillRect(x0, -hh, w, head);
      context.globalAlpha = 0.9;
      context.strokeStyle = AQUA;
      context.lineWidth = ratio;
      context.strokeRect(x0 + 0.5, -hh + 0.5, w - 1, 2 * hh - 1);
      // The corner brackets.
      const b = Math.round(8 * ratio);
      context.strokeStyle = WHITE;
      context.lineWidth = 1.5 * ratio;
      context.beginPath();
      context.moveTo(x0, -hh + b);
      context.lineTo(x0, -hh);
      context.lineTo(x0 + b, -hh);
      context.moveTo(x1 - b, -hh);
      context.lineTo(x1, -hh);
      context.lineTo(x1, -hh + b);
      context.moveTo(x1, hh - b);
      context.lineTo(x1, hh);
      context.lineTo(x1 - b, hh);
      context.moveTo(x0 + b, hh);
      context.lineTo(x0, hh);
      context.lineTo(x0, hh - b);
      context.stroke();
      // The seam at the leading (outer) edge while it unfolds.
      if (u < 1) {
        context.globalAlpha = 1 - u;
        context.fillStyle = WHITE;
        context.fillRect((x0 < 0 ? x0 : x1) - 1.5 * ratio, -hh, 3 * ratio, 2 * hh);
      }
      // The contents.
      if (a > 0) {
        context.globalAlpha = a;
        context.fillStyle = WHITE;
        context.font = fontTitle;
        context.textBaseline = "middle";
        type(
          context,
          titles[p],
          TX,
          p * (CHARS + 1),
          x0 + pad,
          -hh + head / 2,
          Math.floor(a * CHARS) + 1,
        );
        context.font = fontText;
        const top = -hh + head + pad;
        const inner = w - 2 * pad;
        const left = x0 + pad;
        if (kind === "dial") {
          const r = Math.min(inner * 0.42, (hh * 2 - head - 3 * line - 3 * pad) * 0.42);
          const cx = x0 + w / 2;
          const cy = top + r + pad;
          context.strokeStyle = AQUA_DIM;
          context.lineWidth = ratio;
          context.beginPath();
          context.arc(cx, cy, r, 0, TAU);
          context.stroke();
          context.beginPath();
          for (let n = 0; n < 12; n += 1) {
            const an = (TAU * n) / 12;
            context.moveTo(cx + r * 0.86 * Math.cos(an), cy + r * 0.86 * Math.sin(an));
            context.lineTo(cx + r * Math.cos(an), cy + r * Math.sin(an));
          }
          context.stroke();
          context.strokeStyle = AQUA;
          context.lineWidth = 2 * ratio;
          context.beginPath();
          context.arc(cx, cy, r * 0.7, -Math.PI / 2, -Math.PI / 2 + TAU * 0.78 * smooth(s));
          context.stroke();
          context.lineWidth = ratio;
          context.beginPath();
          context.arc(cx, cy, r * 0.5, Math.PI * 0.3, Math.PI * 0.3 + TAU * 0.55 * smooth(s));
          context.stroke();
          const needle = -Math.PI / 2 + TAU * 0.78 * smooth(s);
          context.strokeStyle = WHITE;
          context.beginPath();
          context.moveTo(cx, cy);
          context.lineTo(cx + r * 0.62 * Math.cos(needle), cy + r * 0.62 * Math.sin(needle));
          context.moveTo(cx - r * 0.2, cy);
          context.lineTo(cx + r * 0.2, cy);
          context.moveTo(cx, cy - r * 0.2);
          context.lineTo(cx, cy + r * 0.2);
          context.stroke();
          const ly = cy + r + pad + line / 2;
          context.fillStyle = AQUA;
          for (let l = 0; l < 3; l += 1) {
            const visible = Math.floor(span(v, 0.36 + 0.08 * l, 0.6 + 0.08 * l) * (CHARS + 1));
            type(
              context,
              lines[p][l],
              GX,
              (p * LINES + l) * (CHARS + 1),
              left,
              ly + l * line,
              visible,
            );
          }
          context.fillStyle = WHITE;
          number(context, 100 * smooth(s), x1 - pad - digitW, ly + 2 * line);
          context.fillText("%", x1 - pad - digitW, ly + 2 * line);
        } else if (kind === "bars") {
          const bars = 6;
          const gap = Math.round(2 * ratio);
          const bw2 = (inner - gap * (bars - 1)) / bars;
          const floor = hh - pad - 3 * line;
          const height = floor - top - pad;
          for (let n = 0; n < bars; n += 1) {
            const level =
              (0.35 + 0.65 * naniteHash(n + p * 8, 31)) *
              smooth(span(v, 0.3 + 0.05 * n, 0.6 + 0.05 * n));
            const x = left + n * (bw2 + gap);
            context.fillStyle = DEEP;
            context.globalAlpha = 0.5 * a;
            context.fillRect(x, top, bw2, height);
            context.globalAlpha = a;
            context.fillStyle = AQUA;
            context.fillRect(x, floor - height * level, bw2, height * level);
            context.fillStyle = WHITE;
            context.fillRect(x, floor - height * level, bw2, 1.5 * ratio);
          }
          context.fillStyle = AQUA;
          for (let l = 0; l < 3; l += 1) {
            const visible = Math.floor(span(v, 0.36 + 0.08 * l, 0.6 + 0.08 * l) * (CHARS + 1));
            type(
              context,
              lines[p][l],
              GX,
              (p * LINES + l) * (CHARS + 1),
              left,
              floor + pad + line / 2 + l * line,
              visible,
            );
          }
        } else if (kind === "text") {
          context.fillStyle = AQUA;
          for (let l = 0; l < LINES; l += 1) {
            const visible = Math.floor(span(v, 0.3 + 0.07 * l, 0.5 + 0.07 * l) * (CHARS + 1));
            context.fillStyle = l === LINES - 1 ? WHITE : AQUA;
            type(
              context,
              lines[p][l],
              GX,
              (p * LINES + l) * (CHARS + 1),
              left,
              top + line / 2 + l * line,
              visible,
            );
          }
          // A cell grid lighting up under the lines.
          const gy = top + LINES * line + pad;
          const cols = 4;
          const rowsN = Math.max(1, Math.floor((hh - pad - gy) / (line * 0.8)));
          const cw = inner / cols;
          const ch = line * 0.8;
          for (let n = 0; n < cols * rowsN; n += 1) {
            const lit = naniteHash(n + p * 64, 41) < smooth(s) * 0.9;
            context.fillStyle = lit ? AQUA : DEEP;
            context.globalAlpha = (lit ? 0.75 : 0.3) * a;
            context.fillRect(
              left + (n % cols) * cw + ratio,
              gy + Math.floor(n / cols) * ch + ratio,
              cw - 2 * ratio,
              ch - 2 * ratio,
            );
          }
        } else {
          // graph: a wave settling, a cursor crossing it while it scans.
          const points = 16;
          const floor = hh - pad - 3 * line;
          const mid = (top + floor) / 2;
          const amp = (floor - top) * 0.42;
          context.strokeStyle = AQUA_DIM;
          context.lineWidth = ratio;
          context.beginPath();
          context.moveTo(left, mid);
          context.lineTo(x1 - pad, mid);
          context.stroke();
          context.strokeStyle = AQUA;
          context.lineWidth = 1.5 * ratio;
          context.beginPath();
          for (let n = 0; n < points; n += 1) {
            const x = left + (inner * n) / (points - 1);
            const y =
              mid -
              amp *
                (naniteHash(n + p * 32, 51) - 0.5) *
                2 *
                smooth(span(v, 0.3 + (0.4 * n) / points, 0.5 + (0.4 * n) / points));
            if (n === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
          }
          context.stroke();
          if (s > 0 && s < 1) {
            context.fillStyle = WHITE;
            context.fillRect(left + inner * s, top, 1.5 * ratio, floor - top);
          }
          context.fillStyle = AQUA;
          for (let l = 0; l < 3; l += 1) {
            const visible = Math.floor(span(v, 0.36 + 0.08 * l, 0.6 + 0.08 * l) * (CHARS + 1));
            type(
              context,
              lines[p][l],
              GX,
              (p * LINES + l) * (CHARS + 1),
              left,
              floor + pad + line / 2 + l * line,
              visible,
            );
          }
        }
      }
      // The scan line sweeping down the panel.
      if (s > 0 && s < 1) {
        const y = -hh + 2 * hh * s;
        context.fillStyle = WHITE;
        context.globalAlpha = 0.9;
        context.fillRect(x0, y, w, 1.5 * ratio);
        context.globalAlpha = 0.3;
        context.fillRect(x0, y - 4 * ratio, w, 3 * ratio);
        context.globalAlpha = 0.12;
        context.fillRect(x0, y - 12 * ratio, w, 8 * ratio);
      }
      context.globalAlpha = 1;
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
  };

  // The wrist rings: three concentric ellipses about each wrist with their
  // ticks turning, opened outward; and the crown gauge over the head.
  const ringsPass = (context: CanvasRenderingContext2D) => {
    const q = S[S_Q];
    const scale = V[V_SCALE];
    const ratio = V[V_RATIO];
    const ox = V[V_X];
    const oy = V[V_Y];
    const wrists = FAR_FROM_ULTRA_HUD.wrists;
    for (let n = 0; n < wrists.length; n += 1) {
      const wrist = wrists[n];
      const v = span(
        q,
        WIN.interface[0] + wrist.at * IS,
        WIN.interface[0] + (wrist.at + wrist.span) * IS,
      );
      if (v <= 0) continue;
      const cx = ox + wrist.cx * scale;
      const cy = oy + wrist.cy * scale;
      for (let r = 0; r < 3; r += 1) {
        const open = easeOut(span(v, 0.12 * r, 0.5 + 0.12 * r));
        if (open <= 0) continue;
        const rx = wrist.rx * (1 + 0.28 * r) * scale * (0.5 + 0.5 * open);
        const ry = wrist.ry * (1 + 0.28 * r) * scale * (0.5 + 0.5 * open);
        context.globalAlpha = (r === 1 ? 0.9 : 0.6) * open;
        context.strokeStyle = r === 1 ? WHITE : AQUA;
        context.lineWidth = ratio * (r === 1 ? 1.4 : 1);
        context.beginPath();
        context.ellipse(cx, cy, rx, ry, 0, 0, TAU);
        context.stroke();
        context.beginPath();
        const ticks = 16 + 8 * r;
        const turn = q * (r % 2 ? -5 : 4) + n;
        for (let k = 0; k < ticks; k += 1) {
          const a = (TAU * k) / ticks + turn;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          context.moveTo(cx + rx * cos, cy + ry * sin);
          context.lineTo(cx + rx * 1.1 * cos, cy + ry * 1.1 * sin);
        }
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    const crown = FAR_FROM_ULTRA_HUD.crown;
    const cv = span(
      q,
      WIN.interface[0] + crown.at * IS,
      WIN.interface[0] + (crown.at + crown.span) * IS,
    );
    if (cv > 0) {
      const cx = ox + crown.cx * scale;
      const cy = oy + crown.cy * scale;
      const rx = crown.rx * scale;
      const ry = crown.ry * scale;
      const open = easeOut(span(cv, 0, 0.6));
      context.globalAlpha = 0.5 * open;
      context.strokeStyle = AQUA_DIM;
      context.lineWidth = ratio;
      context.beginPath();
      context.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU);
      context.stroke();
      context.globalAlpha = 0.95 * open;
      context.strokeStyle = WHITE;
      context.lineWidth = 2 * ratio;
      context.beginPath();
      context.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI + Math.PI * smooth(span(cv, 0.2, 0.9)));
      context.stroke();
      context.globalAlpha = span(cv, 0.5, 0.9);
      context.fillStyle = WHITE;
      context.font = fontCrown;
      context.textBaseline = "middle";
      type(
        context,
        crownLabel,
        CX,
        0,
        cx - crownW / 2,
        cy - ry - 9 * ratio,
        Math.floor(span(cv, 0.5, 0.95) * (CHARS + 1)),
      );
      context.globalAlpha = 1;
    }
  };

  const draw: FarFromUltraScene["draw"] = (context) => {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, V[V_FW], V[V_FH]);
    backPass(context);
    bodyPass(context);
    frontPass(context);
    ring(context, 0, true);
    ring(context, 1, true);
    motes(context, true);
    flightPass(context);
    scanPass(context);
    ringsPass(context);
    panelPass(context);
  };

  /* -- end of the draw passes -- */

  const release = () => {
    white.width = 0;
    settled.width = 0;
    mask.width = 0;
    feather.width = 0;
    band.width = 0;
    landed = 0;
  };

  return {
    view,
    frame,
    settled: () => S[S_Q] >= 0 && landed === S[S_TARGET],
    draw,
    progress: () => S[S_Q],
    release,
  };
}
