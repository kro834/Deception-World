import { FIRE_BOUNDS, FIRE_GRID, farFromEmberPosition, farFromFractureOrigins, rasterFarFromFire } from "./far-from-flame-field.ts";
import { fireGridStepped, fireRasterTook } from "./far-from-fire-noise.ts";
import { drawFarFromNanoGather } from "./far-from-ultra-intake.ts";
import { drawFarFromFormPlumes } from "./far-from-form-plumes.ts";

const COLORS = ["#49f681", "#ff4252", "#ffc647"] as const;
const HOT_CORES = ["#dcffb7", "#ffcc8d", "#fff2ab"] as const;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const sparks = Array.from({ length: 300 }, (_, i) => farFromEmberPosition(i + 1));
type Raster = {
  surface: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  words: Uint32Array;
};
const buffers = new WeakMap<CanvasRenderingContext2D, Raster>();

function drawMantle(context: CanvasRenderingContext2D, u: number, tone: number, coarse: boolean, sourceForm: string) {
  // The lightweight renderer's touch grid, or a touch screen that could not
  // hold the desktop grid (far-from-fire-noise.ts: the governor).
  const view = context.canvas.ownerDocument.defaultView;
  const small = coarse || fireGridStepped(view);
  const [w, h] = small ? FIRE_GRID.touch : FIRE_GRID.desktop;
  let buffer = buffers.get(context);
  if (!buffer || buffer.surface.width !== w || buffer.surface.height !== h) {
    const surface = context.canvas.ownerDocument.createElement("canvas");
    surface.width = w;
    surface.height = h;
    const ctx = surface.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(w, h);
    buffer = { surface, ctx, image, words: new Uint32Array(image.data.buffer) };
    buffers.set(context, buffer);
  }
  const began = small ? 0 : performance.now();
  rasterFarFromFire(buffer.words, w, h, u, tone, sourceForm);
  if (!small) fireRasterTook(performance.now() - began);
  buffer.ctx.putImageData(buffer.image, 0, 0);
  context.drawImage(buffer.surface, FIRE_BOUNDS.left, FIRE_BOUNDS.top, FIRE_BOUNDS.width, FIRE_BOUNDS.height);
}

function drawEmbers(context: CanvasRenderingContext2D, u: number, tone: number, coarse: boolean, sourceForm: string) {
  const origins = farFromFractureOrigins(sourceForm);
  const count = coarse ? 72 : 138;
  const burst = clamp((u - .48) / .47);
  context.lineCap = "round";
  for (let pass = 0; pass < 3; pass++) {
    const tint = tone < 0 ? pass : tone;
    context.strokeStyle = pass === 2 ? HOT_CORES[tint] : COLORS[tint];
    context.lineWidth = pass === 2 ? .002 : .0032;
    context.globalAlpha = smooth(u / .16) * (1 - smooth((u - .71) / .27)) * (pass === 2 ? .94 : .77);
    context.beginPath();
    for (let i = pass; i < count; i += 3) {
      const p = sparks[i];
      const source = 3 * ((i * 193 + 71) % (origins.length / 3));
      // Each fragment starts at the bit of armour which released it. Before
      // rupture the fine cinders rise in the same draft as the flame fronts.
      const born = .48 + .30 * p.delay;
      const x0 = origins[source];
      const y0 = origins[source + 1];
      if (u < born) {
        const age = (u * (2.9 + p.drift) + p.speed * 3.2) % 1;
        if (u < .025 + origins[source + 2] * .205 || age > .92 || age < .08) continue;
        const x = x0 + Math.sin(p.angle + age * 4) * age * .07;
        const y = y0 - age * age * (.16 + p.drift * .18);
        context.moveTo(x, y);
        context.lineTo(x + .0015 * Math.cos(p.angle), y + .002 + .007 * age);
        continue;
      }
      const age = clamp((u - born) / (.49 - p.delay * .44));
      const travel = (1 - (1 - age) ** 2) * p.speed;
      const vx = (x0 - .5) * 1.35 + Math.cos(p.angle) * .34;
      const vy = (y0 - .43) * .39 + Math.sin(p.angle) * .19 - .12;
      const x = x0 + vx * travel;
      const y = y0 + vy * travel + age * age * .085;
      const trail = (.005 + .045 * p.drift) * (1 - burst * .79);
      context.moveTo(x - trail * vx, y - trail * vy);
      context.lineTo(x, y);
    }
    context.stroke();
  }
}

/** Width and height describe the complete artwork cutout, with the chest at
 * (0.5, 0.264). The field extends into the air above and beside that cutout. */
export function drawFarFromFormCombustion(
  context: CanvasRenderingContext2D, key: string, u: number,
  width: number, height: number, coarse: boolean, coreY = .264, sourceForm = key === "high" ? "middle" : key === "xhigh" ? "high" : key === "max" ? "xhigh" : "max",
) {
  if (!(u > 0 && u < 1) || width <= 0 || height <= 0) return;
  const ultra = key === "ultra" || key === "ultra-body";
  const tone = key === "high" ? 0 : key === "xhigh" ? 1 : key === "max" ? 2 : -1;
  if (!ultra && tone < 0) return;
  context.save();
  context.scale(width, height);
  context.translate(0, coreY - .264);
  if (u < .88) {
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    drawMantle(context, u, tone, coarse, sourceForm);
    drawFarFromFormPlumes(context, key, u, coarse);
  }
  context.globalCompositeOperation = "lighter";
  drawEmbers(context, u, tone, coarse, sourceForm);
  if (ultra && u > .475) drawFarFromNanoGather(context, u, coarse);
  context.restore();
}
