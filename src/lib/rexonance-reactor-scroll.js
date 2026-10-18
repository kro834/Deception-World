import { reactorCoilAngle, reactorCoilScale, reactorFormation } from "./rexonance-reactor.js";

const IDS = new Set(["core-disc", "core-swirl"]);

/** The real reactor and its coiled armour, not a circular crop of the chest.
 * Three small sheets separate the fixed disc from the rotating coil. */
export function createReactorLayers({ document, pieces, atlas, art, undersuit, size }) {
  const parts = pieces.filter((piece) => IDS.has(piece.id));
  if (!atlas || parts.length !== 2 || parts.some((p) => !Number.isFinite(p.ax + p.ay))) return null;
  const x = Math.min(...parts.map((p) => p.x));
  const y = Math.min(...parts.map((p) => p.y));
  const w = Math.ceil(Math.max(...parts.map((p) => p.x + p.w)) - x);
  const h = Math.ceil(Math.max(...parts.map((p) => p.y + p.h)) - y);
  const picture = document.createElement("canvas");
  const socket = document.createElement("canvas");
  const disc = document.createElement("canvas");
  picture.width = socket.width = disc.width = w;
  picture.height = socket.height = disc.height = h;
  const pc = picture.getContext("2d");
  const sc = socket.getContext("2d");
  const dc = disc.getContext("2d");
  if (!pc || !sc || !dc) {
    picture.width = picture.height = socket.width = socket.height = disc.width = disc.height = 0;
    return null;
  }
  // Atlas transparency follows every blade and the pendant, so neither
  // neighbouring chest plates nor the shoulder medallions rotate with it.
  for (const p of parts) {
    const target = p.id === "core-disc" ? dc : pc;
    target.drawImage(atlas, p.ax, p.ay, p.w, p.h, p.x - x, p.y - y, p.w, p.h);
  }
  sc.drawImage(picture, 0, 0);
  sc.drawImage(disc, 0, 0);
  const layers = { art: picture, disc, socket, x, y, w, h };
  repaintReactorArt(layers, art, size);
  sc.globalCompositeOperation = "source-in";
  sc.drawImage(undersuit, 0, 0, size.width, size.height, -x, -y, size.width, size.height);
  sc.globalCompositeOperation = "source-over";
  return layers;
}

/** Replace colour without disturbing the atlas silhouette (lights stay off). */
export function repaintReactorArt(layers, art, size) {
  for (const sheet of [layers.art, layers.disc]) {
    const context = sheet.getContext("2d");
    context.globalCompositeOperation = "source-in";
    context.drawImage(
      art,
      0,
      0,
      size.width,
      size.height,
      -layers.x,
      -layers.y,
      size.width,
      size.height,
    );
    context.globalCompositeOperation = "source-over";
  }
}

/** Only the two independently rendered pieces leave the normal tile plan. */
export function deferReactorPieces(pieces) {
  return pieces.map((piece) => (IDS.has(piece.id) ? { ...piece, preset: true } : piece));
}

/** Reversible scroll-time pose; u=1 is the original artwork exactly. */
export function drawReactorFormation(context, layers, core, u) {
  const { x, y, w, h, art, socket } = layers;
  context.save();
  context.globalAlpha = 1;
  context.drawImage(socket, x, y, w, h);
  if (u > 0) {
    const [cx, cy] = core;
    const formation = reactorFormation(u);
    context.translate(cx, cy);
    context.rotate(reactorCoilAngle(u));
    const scale = reactorCoilScale(u);
    context.scale(scale, scale);
    // An angular front grows the physical coil while it turns, instead of
    // sliding a fully built ring down the chest. At completion no clip stays.
    if (u < 1) {
      const radius =
        Math.max(
          Math.hypot(x - cx, y - cy),
          Math.hypot(x + w - cx, y - cy),
          Math.hypot(x - cx, y + h - cy),
          Math.hypot(x + w - cx, y + h - cy),
        ) + 1;
      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * formation);
      context.closePath();
      context.clip();
    }
    context.globalAlpha = Math.min(1, u * 3);
    context.drawImage(art, x - cx, y - cy, w, h);
  }
  context.restore();
  // The reactor itself forms in place, never inheriting the coil's rotation
  // or scale. Both use the same clock; the disc keeps its original orientation.
  if (u > 0) {
    context.save();
    context.globalAlpha = reactorFormation(u);
    context.drawImage(layers.disc, x, y, w, h);
    context.restore();
  }
  // The forming edge: a thin gold-to-pink line where the nanites are laying
  // the coil, turning with it and fading out as it closes (owner, 2026-10-18).
  if (u > 0 && u < 1) {
    const [cx, cy] = core;
    const front = -Math.PI / 2 + Math.PI * 2 * reactorFormation(u);
    const reach = Math.max(w, h) * 0.5;
    const cos = Math.cos(front);
    const sin = Math.sin(front);
    context.save();
    context.translate(cx, cy);
    context.rotate(reactorCoilAngle(u));
    const scale = reactorCoilScale(u);
    context.scale(scale, scale);
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.85;
    context.lineWidth = 1.6;
    context.lineCap = "round";
    for (const [from, to, tone] of [
      [0.2, 0.62, "rgb(240 207 134)"],
      [0.62, 0.95, "rgb(255 143 216)"],
    ]) {
      context.strokeStyle = tone;
      context.beginPath();
      context.moveTo(cos * reach * from, sin * reach * from);
      context.lineTo(cos * reach * to, sin * reach * to);
      context.stroke();
    }
    context.restore();
  }
}
