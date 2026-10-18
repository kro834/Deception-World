import { reactorCoilAngle, reactorCoilScale, reactorFormation } from "./rexonance-reactor.js";

const IDS = new Set(["core-disc", "core-swirl"]);

/** The real reactor and its coiled armour, not a circular crop of the chest.
 * Both sheets are small, prepared once at idle and owned by the scene. */
export function createReactorLayers({ document, pieces, atlas, art, undersuit, size }) {
  const parts = pieces.filter((piece) => IDS.has(piece.id));
  if (!atlas || parts.length !== 2 || parts.some((p) => !Number.isFinite(p.ax + p.ay))) return null;
  const x = Math.min(...parts.map((p) => p.x));
  const y = Math.min(...parts.map((p) => p.y));
  const w = Math.ceil(Math.max(...parts.map((p) => p.x + p.w)) - x);
  const h = Math.ceil(Math.max(...parts.map((p) => p.y + p.h)) - y);
  const picture = document.createElement("canvas");
  const socket = document.createElement("canvas");
  picture.width = socket.width = w;
  picture.height = socket.height = h;
  const pc = picture.getContext("2d");
  const sc = socket.getContext("2d");
  if (!pc || !sc) {
    picture.width = picture.height = socket.width = socket.height = 0;
    return null;
  }
  // Atlas transparency follows every blade and the pendant, so neither
  // neighbouring chest plates nor the shoulder medallions rotate with it.
  for (const p of parts) pc.drawImage(atlas, p.ax, p.ay, p.w, p.h, p.x - x, p.y - y, p.w, p.h);
  sc.drawImage(picture, 0, 0);
  const layers = { art: picture, socket, x, y, w, h };
  repaintReactorArt(layers, art, size);
  sc.globalCompositeOperation = "source-in";
  sc.drawImage(undersuit, 0, 0, size.width, size.height, -x, -y, size.width, size.height);
  sc.globalCompositeOperation = "source-over";
  return layers;
}

/** Replace colour without disturbing the atlas silhouette (lights stay off). */
export function repaintReactorArt(layers, art, size) {
  const context = layers.art.getContext("2d");
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
}
