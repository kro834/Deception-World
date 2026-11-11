/* EXTREME SAGA's entry suit-up: the renderer (Canvas 2D).

   Loaded only by the entry sequence (src/components/extreme-saga/
   extreme-entry-sequence.tsx) while the route transition screen covers a
   navigation to /extreme-saga. Built from the owner's suit art alone:

   - the art is split, once, into a dark undersuit (the body, glow lines
     out, deep shade), the armour (the body with its glow lines held back),
     the glow lines, the horns, and the cape (everything outside the body);
   - the armour is cut into small hexagonal plates (extreme-suitup-geometry.ts)
     packed into one atlas, and each plate flies on its own schedule: it
     leaves from the belt side, unfolds, turns, slides along the body,
     overshoots and locks with a gold edge glint, then its glow line traces
     on; locked plates are baked into one layer, so a frame only draws the
     plates in the air;
   - the belt core ignites first; the star gems flash on; the helmet
     segments fold over the head and the horns extend; the cape unfurls
     with a starfield shimmer; a light sweep, and the playback completes.

   The clock is the renderer's own: it advances only on painted frames (a
   hidden page pauses it, and the playback's watchdog with it). No sound. */

import type { EntryPlayback } from "./entry-playback.ts";
import {
  EXTREME_SUITUP_BEATS,
  EXTREME_SUITUP_END_MS,
  EXTREME_SUITUP_HOLD_MS,
  extremeSuitupDpr,
  extremeSuitupSource,
  pickExtremeSuitupWidth,
} from "./extreme-entry.ts";
import {
  SUITUP_CORE,
  SUITUP_GEMS,
  SUITUP_HORNS,
  SUITUP_HORN_BASE_Y,
  SUITUP_PLATE_RADIUS_MAX,
  SUITUP_REGIONS,
  buildSuitupPlates,
  pointInPoly,
  type Point,
  type SuitupPlate,
} from "./extreme-suitup-geometry.ts";

const ART_W = 1024;
const ART_H = 1536;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (v: number) => 1 - (1 - v) ** 3;
const easeInOutCubic = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2);
const easeOutBack = (v: number, s = 1.5) => 1 + (s + 1) * (v - 1) ** 3 + s * (v - 1) ** 2;
const beat = (key: keyof typeof EXTREME_SUITUP_BEATS, t: number) => {
  const [a, b] = EXTREME_SUITUP_BEATS[key];
  return clamp01((t - a) / (b - a));
};

type Canvas = HTMLCanvasElement;
type Ctx = CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): [Canvas, Ctx] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return [canvas, ctx];
}

function tracePoly(ctx: Ctx | Path2D, poly: readonly Point[], k = 1, dx = 0, dy = 0) {
  ctx.moveTo(poly[0][0] * k + dx, poly[0][1] * k + dy);
  for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i][0] * k + dx, poly[i][1] * k + dy);
  ctx.closePath();
}

/** Sprites are cut a touch larger than their cells (no hairline seams). */
const GROW = 1.07;
function grown(plate: { poly: readonly Point[]; at: Point }): Point[] {
  const [cx, cy] = plate.at;
  return plate.poly.map(([x, y]) => [cx + (x - cx) * GROW, cy + (y - cy) * GROW] as const);
}

function bodyPath(k: number, withHorns: boolean) {
  const path = new Path2D();
  for (const region of SUITUP_REGIONS) tracePoly(path, region.poly, k);
  if (withHorns) for (const horn of SUITUP_HORNS) tracePoly(path, horn, k);
  return path;
}

type Prepared = {
  k: number;
  under: Canvas;
  cape: Canvas;
  horns: Canvas;
  locked: Canvas;
  lockedCtx: Ctx;
  atlas: Canvas;
  glowAtlas: Canvas;
  slotW: number;
  slotH: number;
  plates: (SuitupPlate & {
    slot: number;
    hasGlow: boolean;
    solid: boolean;
    baked: 0 | 1 | 2;
  })[];
  body: Path2D;
  sparkles: { x: number; y: number; phase: number; size: number }[];
  shimmer: Canvas;
  shimmerCtx: Ctx;
  art: HTMLImageElement;
};

/** Split the art into its layers and cut the plates (once per play). */
function prepare(art: HTMLImageElement): Prepared {
  const w = art.naturalWidth;
  const h = art.naturalHeight;
  const k = w / ART_W;
  const [source, sctx] = makeCanvas(w, h);
  sctx.drawImage(art, 0, 0, w, h);
  const pixels = sctx.getImageData(0, 0, w, h);
  const data = pixels.data;
  const armour = new ImageData(w, h);
  const glow = new ImageData(w, h);
  const shade = new ImageData(w, h);
  const ad = armour.data;
  const gd = glow.data;
  const ud = shade.data;
  const glowMass = new Float32Array(Math.ceil(w / 8) * Math.ceil(h / 8));
  const cols = Math.ceil(w / 8);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    // Blue glow: bright blue over red (the gold and the black scales are not).
    const line = clamp01((b - 70) / 110) * clamp01((b - r - 15) / 60);
    const keep = 1 - line;
    // The armour, its lines held back to a deep steel.
    ad[i] = r * keep + 10 * line;
    ad[i + 1] = g * keep + 14 * line;
    ad[i + 2] = b * keep + 30 * line;
    ad[i + 3] = a;
    gd[i] = r;
    gd[i + 1] = g;
    gd[i + 2] = b;
    gd[i + 3] = a * line;
    // The undersuit: the armour's shape, in deep shade.
    // Highlights are capped, so the gold and the gems do not show through.
    const lum = Math.min(70, ad[i] * 0.3 + ad[i + 1] * 0.5 + ad[i + 2] * 0.2) * 0.3;
    ud[i] = lum * 0.85 + 7;
    ud[i + 1] = lum * 0.95 + 10;
    ud[i + 2] = lum * 1.3 + 22;
    ud[i + 3] = a;
    if (line > 0.35 && a > 128) {
      const x = p % w;
      const y = (p / w) | 0;
      glowMass[((y >> 3) * cols + (x >> 3)) | 0] += 1;
    }
  }
  const body = bodyPath(k, false);
  const bodyWithHorns = bodyPath(k, true);
  const layer = (image: ImageData, clip: Path2D | null, mode: "in" | "out" = "in") => {
    const [canvas, ctx] = makeCanvas(w, h);
    ctx.putImageData(image, 0, 0);
    if (clip) {
      ctx.globalCompositeOperation = mode === "in" ? "destination-in" : "destination-out";
      ctx.fill(clip);
      ctx.globalCompositeOperation = "source-over";
    }
    return canvas;
  };
  const armourBody = layer(armour, body);
  const glowBody = layer(glow, body);
  const under = layer(shade, body);
  const cape = layer(pixels, bodyWithHorns, "out");
  const [horns, hctx] = makeCanvas(w, h);
  hctx.beginPath();
  for (const horn of SUITUP_HORNS) tracePoly(hctx, horn, k);
  hctx.clip();
  hctx.drawImage(source, 0, 0);

  const alphaAt = ([x, y]: Point) => {
    const px = Math.min(w - 1, Math.max(0, Math.round(x * k)));
    const py = Math.min(h - 1, Math.max(0, Math.round(y * k)));
    return data[(py * w + px) * 4 + 3] > 96;
  };
  const glowAt = (x: number, y: number) => {
    const gx = Math.floor((x * k) / 8);
    const gy = Math.floor((y * k) / 8);
    if (gx < 0 || gy < 0 || gx >= cols) return 0;
    return glowMass[gy * cols + gx] ?? 0;
  };
  const geometry = buildSuitupPlates({ opaque: alphaAt });

  // One fixed slot per plate (every hexagon is the same size).
  const slotW = Math.ceil(Math.sqrt(3) * SUITUP_PLATE_RADIUS_MAX * k * GROW) + 4;
  const slotH = Math.ceil(2 * SUITUP_PLATE_RADIUS_MAX * k * GROW) + 4;
  const perRow = Math.max(1, Math.floor(2048 / slotW));
  const rows = Math.ceil(geometry.length / perRow);
  const [atlas, actx] = makeCanvas(perRow * slotW, rows * slotH);
  const [glowAtlas, gctx] = makeCanvas(perRow * slotW, rows * slotH);
  const plates = geometry.map((plate, slot) => {
    const sx = (slot % perRow) * slotW;
    const sy = Math.floor(slot / perRow) * slotH;
    const ox = sx + slotW / 2 - plate.at[0] * k;
    const oy = sy + slotH / 2 - plate.at[1] * k;
    let mass = 0;
    for (const [x, y] of plate.poly) mass += glowAt((x + plate.at[0]) / 2, (y + plate.at[1]) / 2);
    mass += glowAt(plate.at[0], plate.at[1]);
    const hasGlow = mass > 2;
    // Mostly body (not a sliver at the silhouette's edge): its machined
    // edges and its lock glint may show.
    const probes = [
      plate.at,
      ...plate.poly.map(([x, y]) => [(x + plate.at[0]) / 2, (y + plate.at[1]) / 2] as Point),
    ];
    const solid =
      probes.filter(
        (probe) => alphaAt(probe) && SUITUP_REGIONS.some((r) => pointInPoly(probe, r.poly)),
      ).length >= 6;
    for (const [ctx, src] of [
      [actx, armourBody],
      ...(hasGlow ? ([[gctx, glowBody]] as const) : []),
    ] as const) {
      ctx.save();
      ctx.beginPath();
      // A little larger than its cell, so locked neighbours close seamlessly.
      tracePoly(ctx, grown(plate), k, ox, oy);
      ctx.clip();
      ctx.drawImage(src, ox, oy);
      ctx.restore();
    }
    return { ...plate, slot, hasGlow, solid, baked: 0 as 0 | 1 | 2 };
  });

  // The cape's stars: bright points on its deep blue.
  const sparkles: Prepared["sparkles"] = [];
  const capeCtx = cape.getContext("2d")!;
  const capeData = capeCtx.getImageData(0, 0, w, h).data;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let tries = 0; tries < 5000 && sparkles.length < 90; tries += 1) {
    const x = rand() * ART_W;
    const y = 240 + rand() * (ART_H - 260);
    const i = ((Math.round(y * k) * w + Math.round(x * k)) | 0) * 4;
    if (capeData[i + 3] < 220) continue;
    if (capeData[i + 2] < 90 || capeData[i] > 140) continue;
    sparkles.push({ x, y, phase: rand() * Math.PI * 2, size: 2 + rand() * 4.5 });
  }
  const [shimmer, shimmerCtx] = makeCanvas(Math.round(w / 2), Math.round(h / 2));
  const [locked, lockedCtx] = makeCanvas(w, h);
  source.width = source.height = 0;
  armourBody.width = armourBody.height = 0;
  glowBody.width = glowBody.height = 0;
  return {
    k,
    under,
    cape,
    horns,
    locked,
    lockedCtx,
    atlas,
    glowAtlas,
    slotW,
    slotH,
    plates,
    sparkles,
    shimmer,
    shimmerCtx,
    art,
    body: bodyPath(1, true),
  };
}

function loadArt(src: string): Promise<HTMLImageElement> {
  const art = new Image();
  art.decoding = "async";
  art.src = src;
  return art
    .decode()
    .catch(
      () =>
        new Promise<void>((resolve, reject) => {
          if (art.complete && art.naturalWidth) resolve();
          else {
            art.onload = () => resolve();
            art.onerror = () => reject(new Error("art"));
          }
        }),
    )
    .then(() => art);
}

/** A four-point star glare, centred at (x, y), art units. */
function star(ctx: Ctx, x: number, y: number, r: number, alpha: number) {
  if (alpha <= 0.01 || r <= 0) return;
  ctx.globalAlpha = Math.min(1, alpha);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.2);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.25, "rgba(150,200,255,0.55)");
  glow.addColorStop(1, "rgba(40,90,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(235,245,255,0.95)";
  ctx.beginPath();
  const t = r * 0.09;
  ctx.moveTo(x, y - r * 2.1);
  ctx.lineTo(x + t, y - t);
  ctx.lineTo(x + r * 2.1, y);
  ctx.lineTo(x + t, y + t);
  ctx.lineTo(x, y + r * 2.1);
  ctx.lineTo(x - t, y + t);
  ctx.lineTo(x - r * 2.1, y);
  ctx.lineTo(x - t, y - t);
  ctx.closePath();
  ctx.fill();
}

export type ExtremeSuitupOptions = {
  /** Called with the phase each frame (for tests and the frame strips). */
  onFrame?: (t: number) => void;
};

/** Mount the suit-up on `canvas` (sized by its box). The playback starts on
 * the first frame painted after preparation and completes after the sweep.
 * Returns the disposer. */
export function mountExtremeSuitup(
  canvas: HTMLCanvasElement,
  playback: EntryPlayback,
  options: ExtremeSuitupOptions = {},
): () => void {
  let disposed = false;
  let raf = 0;
  let prepared: Prepared | null = null;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    playback.fail();
    return () => undefined;
  }
  const coarse = window.matchMedia("(any-pointer: coarse)").matches;
  let cssW = 0;
  let cssH = 0;
  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  const layout = () => {
    const box = canvas.getBoundingClientRect();
    cssW = Math.max(1, box.width || window.innerWidth);
    cssH = Math.max(1, box.height || window.innerHeight);
    dpr = extremeSuitupDpr(window.devicePixelRatio, coarse);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const portrait = cssH > cssW;
    scale = Math.min((cssH * (portrait ? 0.8 : 0.9)) / ART_H, (cssW * 1.02) / ART_W);
    ox = (cssW - ART_W * scale) / 2;
    oy = (cssH - ART_H * scale) * (portrait ? 0.42 : 0.5);
  };
  layout();
  let resized = false;
  const onResize = () => {
    resized = true;
  };
  window.addEventListener("resize", onResize);
  const onVisibility = () => {
    if (document.hidden) playback.pause();
    else playback.resume();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const width = pickExtremeSuitupWidth(ART_H * scale, dpr);
  loadArt(extremeSuitupSource(width))
    .then((art) => {
      if (disposed) return;
      prepared = prepare(art);
      raf = window.requestAnimationFrame(frame);
    })
    .catch(() => {
      if (!disposed) playback.fail();
    });

  let t = 0;
  let last = -1;
  let started = false;
  const frame = (now: number) => {
    raf = 0;
    if (disposed || !prepared) return;
    if (playback.state !== "preparing" && playback.state !== "playing") return;
    if (playback.frame(now) === null) return;
    if (started) t += Math.min(64, Math.max(0, now - last));
    started = true;
    last = now;
    if (resized) {
      resized = false;
      layout();
    }
    draw(prepared, t);
    options.onFrame?.(t);
    if (t >= EXTREME_SUITUP_END_MS + EXTREME_SUITUP_HOLD_MS) playback.complete();
    else raf = window.requestAnimationFrame(frame);
  };

  const base = () => ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);

  function draw(p: Prepared, now: number) {
    const c = ctx!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.clearRect(0, 0, canvas.width, canvas.height);
    base();
    const [cx, cy] = SUITUP_CORE;

    // The cape, behind everything, unfurling from the shoulders.
    const capeU = beat("cape", now);
    if (capeU > 0) {
      const f = easeOutCubic(capeU) * 1.3;
      if (capeU >= 1) c.drawImage(p.cape, 0, 0, ART_W, ART_H);
      else {
        const top = 220;
        const strips = 30;
        const step = (ART_H - top) / strips;
        for (let i = 0; i < strips; i += 1) {
          const y = top + i * step;
          const n = i / strips;
          const a = clamp01((f - n) / 0.14);
          if (a <= 0) break;
          const sx = 0.3 + 0.7 * easeOutCubic(clamp01((f - n * 0.75) / 0.6));
          const ripple = Math.sin(n * 10 - now * 0.014) * 16 * (1 - capeU);
          c.globalAlpha = a;
          c.drawImage(
            p.cape,
            0,
            y * p.k,
            p.cape.width,
            (step + 1.5) * p.k,
            512 - 512 * sx + ripple,
            y,
            ART_W * sx,
            step + 1.5,
          );
        }
        c.globalAlpha = 1;
      }
    }

    // The dark undersuit.
    c.globalAlpha = easeOutCubic(clamp01(now / 360));
    c.drawImage(p.under, 0, 0, ART_W, ART_H);
    c.globalAlpha = 1;

    // Bake what has locked; the glow lines trace on after.
    const lctx = p.lockedCtx;
    const hw = p.slotW / 2;
    const hh = p.slotH / 2;
    const perRow = Math.floor(p.atlas.width / p.slotW);
    for (const plate of p.plates) {
      if (plate.baked === 0 && now >= plate.lock) {
        const sx = (plate.slot % perRow) * p.slotW;
        const sy = Math.floor(plate.slot / perRow) * p.slotH;
        lctx.drawImage(
          p.atlas,
          sx,
          sy,
          p.slotW,
          p.slotH,
          plate.at[0] * p.k - hw,
          plate.at[1] * p.k - hh,
          p.slotW,
          p.slotH,
        );
        plate.baked = plate.hasGlow ? 1 : 2;
      }
      if (plate.baked === 1 && now >= plate.glow + 260) {
        const sx = (plate.slot % perRow) * p.slotW;
        const sy = Math.floor(plate.slot / perRow) * p.slotH;
        lctx.drawImage(
          p.glowAtlas,
          sx,
          sy,
          p.slotW,
          p.slotH,
          plate.at[0] * p.k - hw,
          plate.at[1] * p.k - hh,
          p.slotW,
          p.slotH,
        );
        plate.baked = 2;
      }
    }
    c.drawImage(p.locked, 0, 0, ART_W, ART_H);

    // Glow lines tracing on (the bright pass fades as they settle).
    const unit = 1 / p.k;
    for (const plate of p.plates) {
      if (plate.baked !== 1 || now < plate.glow) continue;
      const v = clamp01((now - plate.glow) / 260);
      const sx = (plate.slot % perRow) * p.slotW;
      const sy = Math.floor(plate.slot / perRow) * p.slotH;
      const dx = plate.at[0] - hw * unit;
      const dy = plate.at[1] - hh * unit;
      c.globalAlpha = easeOutCubic(v);
      c.drawImage(p.glowAtlas, sx, sy, p.slotW, p.slotH, dx, dy, p.slotW * unit, p.slotH * unit);
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = Math.sin(Math.PI * v) * 0.9;
      c.drawImage(p.glowAtlas, sx, sy, p.slotW, p.slotH, dx, dy, p.slotW * unit, p.slotH * unit);
      c.globalCompositeOperation = "source-over";
    }
    c.globalAlpha = 1;

    // Plates in the air: unfold, turn, slide, overshoot and lock.
    c.lineJoin = "round";
    for (const plate of p.plates) {
      if (now < plate.start || now >= plate.lock) continue;
      const u = (now - plate.start) / (plate.lock - plate.start);
      const travel = easeOutBack(clamp01(u / 0.86), 1.35);
      const x = plate.from[0] + (plate.at[0] - plate.from[0]) * travel;
      const y = plate.from[1] + (plate.at[1] - plate.from[1]) * travel;
      const turn = plate.spin * (1 - easeOutBack(clamp01(u / 0.8), 1.1));
      const unfold = easeOutCubic(clamp01(u / 0.62));
      const punch = 1 + 0.08 * Math.sin(Math.PI * clamp01((u - 0.8) / 0.2));
      const sxs = (0.08 + 0.92 * unfold) * punch;
      const sys = (0.5 + 0.5 * easeOutCubic(clamp01(u / 0.5))) * punch;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const m = dpr * scale;
      c.setTransform(
        m * cos * sxs,
        m * sin * sxs,
        -m * sin * sys,
        m * cos * sys,
        dpr * ox + m * x,
        dpr * oy + m * y,
      );
      c.globalAlpha = clamp01(u / 0.16);
      const sx = (plate.slot % perRow) * p.slotW;
      const sy = Math.floor(plate.slot / perRow) * p.slotH;
      c.drawImage(
        p.atlas,
        sx,
        sy,
        p.slotW,
        p.slotH,
        -hw * unit,
        -hh * unit,
        p.slotW * unit,
        p.slotH * unit,
      );
      // The machined edge, catching the light as it turns.
      if (!plate.solid) continue;
      c.globalAlpha = (0.12 + 0.5 * Math.abs(sin)) * (1 - clamp01((u - 0.7) / 0.3));
      c.strokeStyle = "rgb(170,205,255)";
      c.lineWidth = 0.9;
      c.beginPath();
      tracePoly(c, plate.poly, 1, -plate.at[0], -plate.at[1]);
      c.stroke();
    }
    base();
    c.globalAlpha = 1;

    // The lock: a glint runs along the plate's upper gold edges.
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    c.save();
    c.clip(p.body);
    for (const plate of p.plates) {
      const v = (now - plate.lock) / 240;
      if (v < 0 || v >= 1 || !plate.solid) continue;
      const [a, b, d] = [plate.poly[5], plate.poly[0], plate.poly[1]];
      c.globalAlpha = 0.8 * (1 - v) ** 1.5;
      c.strokeStyle = "rgb(255,214,128)";
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.lineTo(d[0], d[1]);
      c.stroke();
      // The spark that rides it.
      const q = easeOutCubic(v);
      const sx = q < 0.5 ? a[0] + (b[0] - a[0]) * q * 2 : b[0] + (d[0] - b[0]) * (q - 0.5) * 2;
      const sy = q < 0.5 ? a[1] + (b[1] - a[1]) * q * 2 : b[1] + (d[1] - b[1]) * (q - 0.5) * 2;
      c.fillStyle = "rgb(255,246,220)";
      c.beginPath();
      c.arc(sx, sy, 2.2 * (1 - v) + 0.6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();

    // The belt core: it ignites, then breathes with every wave.
    const ignite = beat("core", now);
    if (ignite > 0) {
      const flicker = ignite < 0.45 ? 0.55 + 0.45 * Math.sin(ignite * 70) ** 2 : 1;
      const pulse = 0.82 + 0.18 * Math.sin(now * 0.009);
      const r = 30 + 26 * easeOutCubic(ignite);
      c.globalAlpha = clamp01(ignite * 2.2) * flicker * pulse;
      const core = c.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      core.addColorStop(0, "rgba(255,255,255,1)");
      core.addColorStop(0.18, "rgba(190,220,255,0.95)");
      core.addColorStop(0.45, "rgba(70,130,255,0.45)");
      core.addColorStop(1, "rgba(20,60,255,0)");
      c.fillStyle = core;
      c.beginPath();
      c.arc(cx, cy, r * 2.2, 0, Math.PI * 2);
      c.fill();
      // The ignition ring.
      if (ignite < 1) {
        c.globalAlpha = (1 - ignite) * 0.9;
        c.strokeStyle = "rgb(150,200,255)";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(cx, cy, 20 + 260 * easeOutCubic(ignite), 0, Math.PI * 2);
        c.stroke();
      }
    }

    // The star gems flash on, the chest first, then outward.
    const [g0, g1] = EXTREME_SUITUP_BEATS.gems;
    SUITUP_GEMS.forEach((gem, index) => {
      const start = g0 + ((g1 - g0 - 260) * index) / (SUITUP_GEMS.length - 1);
      const v = (now - start) / 420;
      if (v < 0 || v >= 1) return;
      const swell =
        v < 0.25 ? easeOutCubic(v / 0.25) : 1 - easeInOutCubic((v - 0.25) / 0.75) * 0.75;
      star(c, gem.at[0], gem.at[1], gem.r * (0.6 + swell * 0.9), swell);
    });

    // The horns extend out of the closed helmet.
    const hornU = beat("horns", now);
    if (hornU > 0) {
      const rise = easeOutBack(hornU, 1.6);
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = clamp01(hornU * 4);
      c.save();
      c.beginPath();
      c.rect(0, 0, ART_W, SUITUP_HORN_BASE_Y);
      c.clip();
      c.drawImage(p.horns, 0, (1 - rise) * 118, ART_W, ART_H);
      c.restore();
      if (hornU < 1) {
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = Math.sin(Math.PI * hornU) * 0.7;
        c.save();
        c.beginPath();
        c.rect(0, 0, ART_W, SUITUP_HORN_BASE_Y);
        c.clip();
        c.drawImage(p.horns, 0, (1 - rise) * 118, ART_W, ART_H);
        c.restore();
      }
      c.globalAlpha = 1;
    }

    // The cape's starfield: points twinkle as the cloth reaches them, and a
    // shimmer runs across it.
    c.globalCompositeOperation = "lighter";
    if (capeU > 0) {
      const f = easeOutCubic(capeU) * 1.3;
      const fade = 1 - clamp01((now - EXTREME_SUITUP_BEATS.cape[1]) / 500) * 0.6;
      for (const s of p.sparkles) {
        const n = (s.y - 220) / (ART_H - 220);
        if (n > f) continue;
        const tw = 0.5 + 0.5 * Math.sin(now * 0.012 + s.phase);
        c.globalAlpha = tw * clamp01((f - n) / 0.1) * fade;
        c.fillStyle = "rgb(200,225,255)";
        c.fillRect(s.x - s.size, s.y - 0.6, s.size * 2, 1.2);
        c.fillRect(s.x - 0.6, s.y - s.size, 1.2, s.size * 2);
      }
      if (capeU < 1) sheen(p, p.cape, capeU, 0.32);
    }

    // The final pose: the owner's art itself settles over the build, under
    // one light sweep.
    const sweepU = beat("sweep", now);
    if (sweepU > 0) {
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = easeInOutCubic(clamp01(sweepU / 0.7));
      c.drawImage(p.art, 0, 0, ART_W, ART_H);
      c.globalAlpha = 1;
      if (sweepU < 1) sheen(p, p.art, sweepU, 0.55);
    }
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
  }

  /** A diagonal band of light across `layer`, through its own alpha. */
  function sheen(p: Prepared, layer: CanvasImageSource, u: number, strength: number) {
    const s = p.shimmerCtx;
    const w = p.shimmer.width;
    const h = p.shimmer.height;
    s.globalCompositeOperation = "source-over";
    s.clearRect(0, 0, w, h);
    s.drawImage(layer, 0, 0, w, h);
    s.globalCompositeOperation = "source-in";
    // The band runs from the upper left to the lower right.
    const pos = -0.25 + 1.5 * easeInOutCubic(u);
    const band = s.createLinearGradient(
      w * (pos - 0.16),
      h * (pos - 0.16),
      w * (pos + 0.16),
      h * (pos + 0.16),
    );
    band.addColorStop(0, "rgba(255,255,255,0)");
    band.addColorStop(0.5, "rgba(225,235,255,0.85)");
    band.addColorStop(1, "rgba(255,255,255,0)");
    s.fillStyle = band;
    s.fillRect(0, 0, w, h);
    const c = ctx!;
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = strength * Math.sin(Math.PI * u);
    c.drawImage(p.shimmer, 0, 0, ART_W, ART_H);
    c.globalAlpha = 1;
  }

  return () => {
    disposed = true;
    if (raf) window.cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    if (prepared) {
      // Let iOS reclaim the layers' memory at once.
      for (const layer of [
        prepared.under,
        prepared.cape,
        prepared.horns,
        prepared.locked,
        prepared.atlas,
        prepared.glowAtlas,
        prepared.shimmer,
      ]) {
        layer.width = layer.height = 0;
      }
      prepared = null;
    }
  };
}
