/** META UNITAS SAGA — the partition scene (2026-10-23).
 *
 * Draws the suit-up at any progress p (src/lib/meta-unitas-timeline.ts) on a
 * 2D canvas, closed-form: the same p always draws the same frame, so the
 * scroll runway plays it forwards and backwards and the entry transition
 * plays it on a clock. Its own engine (not the Rexonance one): the plates are
 * SAM's cut of the owner's two cutouts (src/lib/meta-unitas-suit.ts, built by
 * scripts/build-meta-unitas-suit.mjs), drawn from one atlas per form with
 * per-plate transforms; the light, the boundaries and the glow are baked
 * pictures; only the halo, its axis, the bits' orbit trails and the helix's
 * glow are drawn as vectors. Nothing here touches the DOM beyond the canvas
 * it is given.
 *
 * Photosensitivity: the brightest moment (the glowing whole) is a moderate
 * teal-gold, never white, and rises over at least a quarter second (the
 * runway caps its own speed through it); no red; nothing loops.
 */

import {
  META_UNITAS_PLATES,
  META_UNITAS_SUIT,
  META_UNITAS_SUIT_MARKS,
  META_UNITAS_SUIT_SIZE,
  type MetaUnitasPlate,
} from "./meta-unitas-suit.ts";
import {
  BIT_FLIGHT,
  META_UNITAS_BEATS as B,
  META_UNITAS_MIDDLE_DONE,
  bell,
  bitLaunch,
  clamp01,
  easeInOut,
  easeOutCubic,
  flipState,
  plateState,
  smoothstep,
  tailState,
  ultraClock,
} from "./meta-unitas-timeline.ts";

export type MetaUnitasForm = "middle" | "ultra";

type Pictures = {
  undersuit: CanvasImageSource;
  glow: CanvasImageSource;
  middleFigure: CanvasImageSource;
  middleAtlas: CanvasImageSource;
  middleLit: CanvasImageSource;
  middleSeams: CanvasImageSource;
  ultraFigure?: CanvasImageSource;
  ultraAtlas?: CanvasImageSource;
  ultraSeams?: CanvasImageSource;
};

/** The pictures the scene needs, ミドル's first (ウルトラ's only when chosen). */
export const META_UNITAS_MIDDLE_PICTURES = Object.freeze({
  undersuit: META_UNITAS_SUIT.undersuit,
  glow: META_UNITAS_SUIT.glow,
  middleFigure: META_UNITAS_SUIT.middle.figure,
  middleAtlas: META_UNITAS_SUIT.middle.atlas.src,
  middleLit: META_UNITAS_SUIT.middle.lit,
  middleSeams: META_UNITAS_SUIT.middle.seams,
});
export const META_UNITAS_ULTRA_PICTURES = Object.freeze({
  ultraFigure: META_UNITAS_SUIT.ultra.figure,
  ultraAtlas: META_UNITAS_SUIT.ultra.atlas.src,
  ultraSeams: META_UNITAS_SUIT.ultra.seams,
});

/** Loads and decodes a set of pictures (rejects if one fails). */
export function loadPictures<T extends Record<string, string>>(
  sources: T,
): Promise<Record<keyof T, HTMLImageElement>> {
  const entries = Object.entries(sources).map(async ([key, src]) => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    await image.decode();
    return [key, image] as const;
  });
  return Promise.all(entries).then(
    (pairs) => Object.fromEntries(pairs) as Record<keyof T, HTMLImageElement>,
  );
}

const SIZE = META_UNITAS_SUIT_SIZE;
const M = META_UNITAS_SUIT_MARKS;
const [HX, HY] = M.helix;

type Prepared = MetaUnitasPlate & {
  /** Distance from the helix, 0 … 1 (the partition's order). */
  order: number;
  /** The drift's direction (unit) and its turn (rad). */
  dx: number;
  dy: number;
  turn: number;
  /** Index along its chain (tail), or its bit's index. */
  index: number;
};

const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

function prepare(plates: readonly MetaUnitasPlate[]): Prepared[] {
  const reach = Math.hypot(SIZE.width, SIZE.height) * 0.5;
  return plates.map((plate) => {
    const vx = plate.cx - HX;
    const vy = plate.cy - HY;
    const length = Math.hypot(vx, vy) || 1;
    const index = Number(/(\d+)/.exec(plate.id)?.[1] ?? 0);
    return {
      ...plate,
      order: clamp01(length / reach),
      dx: vx / length,
      dy: vy / length,
      turn: (hash(plate.id) - 0.5) * 0.16,
      index,
    };
  });
}

const MIDDLE = prepare(META_UNITAS_PLATES.middle);
const ULTRA = prepare(META_UNITAS_PLATES.ultra);
const ULTRA_BY_ID = new Map(ULTRA.map((plate) => [plate.id, plate]));
const MIDDLE_BY_ID = new Map(MIDDLE.map((plate) => [plate.id, plate]));
const MIDDLE_BITS = MIDDLE.filter((plate) => plate.group === "bits").sort(
  (a, b) => a.index - b.index,
);
/** The tails' chains from their roots (segment numbers): ミドル's upper and
 * lower runs, ウルトラ's one. */
const TAIL_CHAINS = {
  middle: [
    [1, 2, 3],
    [4, 5, 6, 7, 8],
  ],
  ultra: [[1, 2, 3]],
} as Record<MetaUnitasForm, readonly (readonly number[])[]>;
const chainIndex = (form: MetaUnitasForm, n: number) =>
  Math.max(0, TAIL_CHAINS[form].find((chain) => chain.includes(n))?.indexOf(n) ?? 0);
/** The drift's reach (figure px). */
const DRIFT = 44;

export type SceneFrame = {
  /** The figure's box on the canvas (device px). */
  x: number;
  y: number;
  scale: number;
};

export type PartitionScene = {
  /** Draws the frame for p (and the chosen form) into the figure box. */
  draw: (p: number, form: MetaUnitasForm, box: SceneFrame) => void;
  /** Whether ウルトラ's pictures are in. */
  hasUltra: () => boolean;
  setUltra: (pictures: Pick<Pictures, "ultraFigure" | "ultraAtlas" | "ultraSeams">) => void;
};

export function createPartitionScene(
  context: CanvasRenderingContext2D,
  pictures: Pictures,
): PartitionScene {
  const ctx = context;
  let pics = { ...pictures };
  let base: SceneFrame = { x: 0, y: 0, scale: 1 };

  /** Sets the transform for drawing in figure px, plus a local transform
   * about (ox, oy): translate (tx, ty), rotate r, scale (sx, sy). */
  const place = (
    ox: number,
    oy: number,
    tx: number,
    ty: number,
    r: number,
    sx: number,
    sy: number,
  ) => {
    const k = base.scale;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    // figure → device: k·(R·S·(q − o) + o + t) + base
    const a = k * cos * sx;
    const b = k * sin * sx;
    const c = -k * sin * sy;
    const d = k * cos * sy;
    const e = base.x + k * (ox + tx) - (a * ox + c * oy);
    const f = base.y + k * (oy + ty) - (b * ox + d * oy);
    ctx.setTransform(a, b, c, d, e, f);
  };
  const identity = () => {
    const k = base.scale;
    ctx.setTransform(k, 0, 0, k, base.x, base.y);
  };
  const sprite = (
    atlas: CanvasImageSource,
    plate: MetaUnitasPlate,
    tx = 0,
    ty = 0,
    r = 0,
    sx = 1,
    sy = 1,
    ox = plate.cx,
    oy = plate.cy,
  ) => {
    place(ox, oy, tx, ty, r, sx, sy);
    ctx.drawImage(atlas, plate.ax, plate.ay, plate.w, plate.h, plate.x, plate.y, plate.w, plate.h);
  };
  const whole = (image: CanvasImageSource | undefined, alpha: number) => {
    if (!image || alpha <= 0.002) return;
    identity();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(image, 0, 0, SIZE.width, SIZE.height);
  };

  /** The UNITAS HALO drawn as a vector: its ellipse drawn round (0 … 1). */
  const halo = (progress: number, alpha: number) => {
    if (progress <= 0 || alpha <= 0.01) return;
    identity();
    const { cx, cy, rx, ry } = M.halo;
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgb(255 170 82)";
    ctx.shadowColor = "rgb(255 150 60 / 0.9)";
    ctx.shadowBlur = 10 * base.scale;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, Math.PI / 2, Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
  };

  /** The light axis through the halo's centre, down to the soles. */
  const axis = (length: number, alpha: number) => {
    if (length <= 0 || alpha <= 0.01) return;
    identity();
    const { cx, cy } = M.halo;
    const bottom = cy + (M.sole - cy) * length;
    const gradient = ctx.createLinearGradient(cx, cy, cx, bottom);
    gradient.addColorStop(0, "rgb(255 214 150 / 0.95)");
    gradient.addColorStop(0.7, "rgb(255 160 80 / 0.55)");
    gradient.addColorStop(1, "rgb(255 140 60 / 0)");
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gradient;
    ctx.fillRect(cx - 1.4, cy, 2.8, bottom - cy);
    ctx.globalCompositeOperation = "source-over";
  };

  /** The helix (and the visor) lit: small, bounded glows. */
  const ignite = (amount: number) => {
    if (amount <= 0.01) return;
    identity();
    ctx.globalCompositeOperation = "lighter";
    for (const [[x, y], radius, strength] of [
      [M.helix, 46, 1],
      [M.visor, 22, 0.7],
    ] as const) {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgb(255 214 150 / ${0.75 * strength})`);
      gradient.addColorStop(0.45, `rgb(255 150 60 / ${0.35 * strength})`);
      gradient.addColorStop(1, "rgb(255 130 50 / 0)");
      ctx.globalAlpha = amount;
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  /** The boundaries over the figure, revealed in a disc from the helix. */
  const seams = (image: CanvasImageSource | undefined, reach: number, alpha: number) => {
    if (!image || reach <= 0 || alpha <= 0.01) return;
    identity();
    ctx.save();
    ctx.beginPath();
    ctx.arc(HX, HY, reach * SIZE.height * 0.82, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(image, 0, 0, SIZE.width, SIZE.height);
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  };

  /** The glowing whole: revealed from the axis outward. */
  const glow = (spread: number, alpha: number) => {
    if (spread <= 0 || alpha <= 0.01) return;
    identity();
    ctx.save();
    const half = SIZE.width * 0.55 * spread;
    ctx.beginPath();
    ctx.rect(HX - half, 0, half * 2, SIZE.height);
    ctx.clip();
    ctx.globalAlpha = alpha;
    ctx.drawImage(pics.glow, 0, 0, SIZE.width, SIZE.height);
    ctx.restore();
  };

  /** A bit on its halo orbit: from the helix out to its seat (t 0 … 1). */
  const bit = (plate: Prepared, t: number, atlas: CanvasImageSource) => {
    if (t <= 0) return;
    const e = easeOutCubic(t);
    const sx = plate.cx - HX;
    const sy = plate.cy - HY;
    const seatAngle = Math.atan2(sy, sx);
    const seatRadius = Math.hypot(sx, sy);
    const sweep = plate.cx < HX ? -2.2 : 2.2;
    const angleAt = (v: number) => seatAngle - (1 - easeOutCubic(v)) * sweep;
    const radiusAt = (v: number) => seatRadius * easeOutCubic(v) ** 0.8;
    const at = (v: number) =>
      [
        HX + Math.cos(angleAt(v)) * radiusAt(v),
        HY + Math.sin(angleAt(v)) * radiusAt(v) * 0.92,
      ] as const;
    // The trail: the orbit it has flown, fading behind it.
    if (t < 1) {
      identity();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgb(255 168 84)";
      ctx.lineWidth = 2.2;
      const from = Math.max(0, t - 0.45);
      for (let i = 0; i < 12; i += 1) {
        const v0 = from + ((t - from) * i) / 12;
        const v1 = from + ((t - from) * (i + 1)) / 12;
        const [x0, y0] = at(v0);
        const [x1, y1] = at(v1);
        ctx.globalAlpha = ((i + 1) / 12) * 0.7 * (1 - smoothstep(0.75, 1, t));
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }
    const [x, y] = at(t);
    ctx.globalAlpha = smoothstep(0, 0.18, t);
    sprite(
      atlas,
      plate,
      x - plate.cx,
      y - plate.cy,
      (1 - e) * (plate.cx < HX ? -1.6 : 1.6),
      0.45 + 0.55 * e,
      0.45 + 0.55 * e,
    );
  };

  /** A tail segment unfolding from the joint before it. */
  const tail = (
    plate: Prepared,
    amount: number,
    atlas: CanvasImageSource,
    joint: readonly [number, number],
  ) => {
    if (amount <= 0.001) return;
    const e = easeOutCubic(amount);
    ctx.globalAlpha = Math.min(1, amount * 1.6);
    sprite(
      atlas,
      plate,
      0,
      0,
      (1 - e) * -0.5,
      0.55 + 0.45 * e,
      0.55 + 0.45 * e,
      joint[0],
      joint[1],
    );
  };

  /** A tail segment's joint: the centre of the segment before it on its
   * chain (its own centre for a root). */
  const jointOf = (plates: Prepared[], plate: Prepared) => {
    const chain = TAIL_CHAINS[plates === MIDDLE ? "middle" : "ultra"].find((ids) =>
      ids.includes(plate.index),
    );
    const at = chain ? chain.indexOf(plate.index) : 0;
    const previous =
      at > 0 && chain
        ? plates.find((other) => other.group === "tail" && other.index === chain[at - 1])
        : null;
    return previous ? ([previous.cx, previous.cy] as const) : ([plate.cx, plate.cy] as const);
  };

  /** ミドル being built (p up to META_UNITAS_MIDDLE_DONE and past it). */
  const drawMiddle = (p: number) => {
    const done = smoothstep(0.81, META_UNITAS_MIDDLE_DONE, p);
    // The wearer.
    if (done < 1) {
      identity();
      ctx.globalAlpha = 1;
      ctx.drawImage(pics.undersuit, 0, 0, SIZE.width, SIZE.height);
    }
    axis(smoothstep(...B.axis, p), 0.85 * (1 - smoothstep(0.2, 0.32, p)));
    // The single glowing whole, until its plates have taken over.
    glow(
      easeInOut(smoothstep(...B.whole, p)),
      smoothstep(...B.whole, p) * (1 - smoothstep(0.32, 0.44, p)),
    );
    if (done < 1) {
      const atlas = pics.middleAtlas;
      for (const plate of MIDDLE) {
        if (plate.group === "driver") {
          ctx.globalAlpha = 1;
          sprite(atlas, plate);
          continue;
        }
        if (plate.group !== "body") continue;
        const state = plateState(plate.order, p);
        if (!state.drawn) continue;
        const drift = easeInOut(state.drift);
        const tx = plate.dx * DRIFT * drift;
        const ty = plate.dy * DRIFT * drift;
        const r = plate.turn * drift;
        if (state.armour < 1) {
          ctx.globalAlpha = 1;
          sprite(pics.middleLit, plate, tx, ty, r);
        }
        if (state.armour > 0) {
          ctx.globalAlpha = state.armour;
          sprite(atlas, plate, tx, ty, r);
        }
      }
      // The halo's own plate lands as the boundaries cool.
      const haloIn = smoothstep(0.78, 0.84, p);
      for (const plate of MIDDLE) {
        if (plate.group === "halo" && haloIn > 0) {
          ctx.globalAlpha = haloIn;
          sprite(atlas, plate);
        } else if (plate.group === "bits") {
          bit(plate, clamp01((p - bitLaunch(MIDDLE_BITS.indexOf(plate))) / BIT_FLIGHT), atlas);
        } else if (plate.group === "tail") {
          tail(
            plate,
            tailState(chainIndex("middle", plate.index), p),
            atlas,
            jointOf(MIDDLE, plate),
          );
        }
      }
    }
    // The boundaries: drawn out across the whole, gone while the plates are
    // apart, back as light paths once they settle, cooling on the seal.
    const seamAlpha =
      (1 - smoothstep(0.3, 0.38, p)) * smoothstep(B.seams[0], B.seams[0] + 0.02, p) +
      0.75 * smoothstep(0.54, 0.6, p) * (1 - smoothstep(0.8, 0.87, p));
    whole(pics.middleFigure, done);
    seams(pics.middleSeams, smoothstep(...B.seams, p), seamAlpha);
    halo(smoothstep(...B.halo, p), 1 - smoothstep(0.8, 0.86, p));
    ignite(bell(0.79, 0.95, p) * 0.9 + smoothstep(0.84, 0.9, p) * 0.35);
  };

  /** ウルトラ over the finished ミドル (u: its clock). */
  const drawUltra = (u: number) => {
    const ultraAtlas = pics.ultraAtlas;
    const ultraFigure = pics.ultraFigure;
    if (!ultraAtlas || !ultraFigure) {
      whole(pics.middleFigure, 1);
      ignite(0.35);
      return;
    }
    const finished = smoothstep(0.9, 1, u);
    if (finished < 1) {
      // The wearer stands inside while the plates turn over.
      identity();
      ctx.globalAlpha = 1;
      ctx.drawImage(pics.undersuit, 0, 0, SIZE.width, SIZE.height);
      const middleAtlas = pics.middleAtlas;
      const middleOut = smoothstep(0, 0.06, u);
      whole(pics.middleFigure, 1 - middleOut);
      // ミドル's satellites give way: the bits draw in toward their seats,
      // the tail and the halo fade.
      for (const plate of MIDDLE) {
        if (plate.group === "body") continue;
        const fade =
          plate.group === "driver"
            ? smoothstep(0.3, 0.5, u)
            : plate.group === "bits"
              ? smoothstep(0.08, 0.32, u)
              : smoothstep(0.05, 0.3, u);
        if (fade >= 1 || middleOut <= 0) continue;
        const shrink = 1 - 0.35 * fade;
        ctx.globalAlpha = (1 - fade) * middleOut;
        sprite(middleAtlas, plate, 0, 0, 0, shrink, shrink);
      }
      // Every body plate turns over into its crystal counterpart, from the
      // helix out; the turn's far side lights for a moment.
      for (const plate of ULTRA) {
        if (plate.group !== "body" && plate.group !== "driver") continue;
        if (plate.group === "driver") {
          ctx.globalAlpha = smoothstep(0.3, 0.5, u);
          sprite(ultraAtlas, plate);
          continue;
        }
        const before = MIDDLE_BY_ID.get(plate.id);
        const t = flipState(plate.order, u);
        const squash = 0.28 + 0.72 * Math.abs(Math.cos(t * Math.PI));
        if (t < 0.5 && before) {
          if (middleOut <= 0) continue;
          ctx.globalAlpha = middleOut;
          sprite(middleAtlas, before, 0, 0, 0, squash, 1);
        } else if (t >= 0.5) {
          ctx.globalAlpha = 1;
          sprite(ultraAtlas, plate, 0, 0, 0, squash, 1);
          const flash = bell(0.5, 1, t) * 0.55;
          if (flash > 0.01) {
            ctx.globalCompositeOperation = "lighter";
            ctx.globalAlpha = flash;
            sprite(ultraAtlas, plate, 0, 0, 0, squash, 1);
            ctx.globalCompositeOperation = "source-over";
          }
        }
      }
      // The crystal units: re-formed from the bits, flown out to their places.
      const crystals = ULTRA.filter((plate) => plate.group === "crystal");
      crystals.forEach((plate, index) => {
        const nearest = MIDDLE_BITS.reduce((best, b) =>
          Math.hypot(b.cx - plate.cx, b.cy - plate.cy) <
          Math.hypot(best.cx - plate.cx, best.cy - plate.cy)
            ? b
            : best,
        );
        const t = easeOutCubic(smoothstep(0.18 + index * 0.03, 0.5 + index * 0.03, u));
        if (t <= 0) return;
        const x = nearest.cx + (plate.cx - nearest.cx) * t;
        const y = nearest.cy + (plate.cy - nearest.cy) * t;
        ctx.globalAlpha = Math.min(1, t * 1.5);
        sprite(
          ultraAtlas,
          plate,
          x - plate.cx,
          y - plate.cy,
          (1 - t) * 1.2,
          0.5 + 0.5 * t,
          0.5 + 0.5 * t,
        );
      });
      // The tail re-grows in crystal.
      for (const plate of ULTRA)
        if (plate.group === "tail")
          tail(
            plate,
            smoothstep(0.42 + (plate.index - 1) * 0.08, 0.56 + (plate.index - 1) * 0.08, u),
            ultraAtlas,
            jointOf(ULTRA, plate),
          );
      // TETRA MANUS: the four arms unfold from behind the shoulders and ribs.
      for (const plate of ULTRA) {
        if (plate.group !== "manus") continue;
        const arm = /manus-(?:fist-)?(\d)-([lr])/.exec(plate.id);
        if (!arm) continue;
        const key = `manus-${arm[1]}-${arm[2]}` as keyof typeof M.manusPivot;
        const [px, py] = M.manusPivot[key];
        const start = arm[1] === "1" ? 0.48 : 0.56;
        const t = easeOutCubic(smoothstep(start, start + 0.3, u));
        if (t <= 0) continue;
        const side = arm[2] === "l" ? 1 : -1;
        const fold = (arm[1] === "1" ? 0.9 : -0.7) * side;
        ctx.globalAlpha = Math.min(1, t * 1.4);
        sprite(ultraAtlas, plate, 0, 0, fold * (1 - t), 0.3 + 0.7 * t, 0.3 + 0.7 * t, px, py);
        const flash = bell(0.2, 0.9, t) * 0.4;
        if (flash > 0.01) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = flash;
          sprite(ultraAtlas, plate, 0, 0, fold * (1 - t), 0.3 + 0.7 * t, 0.3 + 0.7 * t, px, py);
          ctx.globalCompositeOperation = "source-over";
        }
      }
      seams(pics.ultraSeams, smoothstep(0.04, 0.5, u), bell(0.04, 0.9, u) * 0.7);
    }
    whole(ultraFigure, finished);
    ignite(0.35 + bell(0.7, 1, u) * 0.4);
  };

  return {
    draw(p, form, box) {
      base = box;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      if (form === "ultra" && p > B.ultra[0]) drawUltra(ultraClock(p));
      else drawMiddle(p);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    },
    hasUltra: () => Boolean(pics.ultraAtlas && pics.ultraFigure),
    setUltra(next) {
      pics = { ...pics, ...next };
    },
  };
}

/** ULTRA_BY_ID is exported for the tests (every ウルトラ body plate has its
 * ミドル counterpart). */
export const META_UNITAS_PLATE_PAIRS = Object.freeze({
  middle: MIDDLE.filter((plate) => plate.group === "body").map((plate) => plate.id),
  ultra: [...ULTRA_BY_ID.values()]
    .filter((plate) => plate.group === "body")
    .map((plate) => plate.id),
});
