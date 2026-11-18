/** Thin tongues peeling away from the large combustion field. The sheet is
 * the site's Blender volume, graded offline so WebKit only blits its frames. */
const SOURCE = "/far-from-fire-20261118/plumes.webp";
const TILE_W = 88;
const TILE_H = 176;
const FRAMES = 16;
const COLUMNS = 8;
const PLUME_HEIGHT = 3 * FRAMES / COLUMNS * TILE_H;

/** The two 24-frame metal turntables live in the last two rows of this sheet. */
export function drawIntakeCell(
  ctx: CanvasRenderingContext2D, x: number, y: number, size: number, frame: number, silver: boolean,
) {
  if (!sheet) return false;
  const height = size * 2 / 3;
  ctx.drawImage(sheet, frame * 16, PLUME_HEIGHT + (silver ? 16 : 0), 16, 16,
    x - size / 2, y - height / 2, size, height);
  return true;
}

// Values are local to the full-body cutout: root, extent, outward lean and phase.
const vents = [
  { x: 0.32, y: 0.96, w: 0.32, h: 0.39, lean: 0.13, phase: 2 },
  { x: 0.69, y: 0.95, w: 0.29, h: 0.34, lean: -0.23, phase: 10 },
  { x: 0.37, y: 0.72, w: 0.32, h: 0.43, lean: 0.28, phase: 6 },
  { x: 0.66, y: 0.73, w: 0.36, h: 0.49, lean: -0.14, phase: 14 },
  { x: 0.23, y: 0.54, w: 0.34, h: 0.48, lean: 0.22, phase: 9 },
  { x: 0.77, y: 0.54, w: 0.37, h: 0.51, lean: -0.33, phase: 1 },
  { x: 0.33, y: 0.30, w: 0.41, h: 0.48, lean: 0.36, phase: 12 },
  { x: 0.65, y: 0.29, w: 0.38, h: 0.42, lean: -0.17, phase: 4 },
  { x: 0.49, y: 0.18, w: 0.34, h: 0.45, lean: 0.08, phase: 7 },
] as const;

let sheet: HTMLImageElement | null = null;
let pending: HTMLImageElement | null = null;
let leases = 0;

/** Retain the one shared image while a panel or runway needs its detail. */
export function warmFarFromFormPlumes(): () => void {
  if (
    typeof Image !== "function" || typeof document === "undefined" || document.hidden ||
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ||
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce), (forced-colors: active)").matches ||
    document.documentElement.dataset.worldEffects === "economy"
  ) return () => {};
  if (!sheet && !pending) {
    const image = new Image();
    pending = image;
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = SOURCE;
    // A downloaded WebP may still need decoding. Keep that work off the
    // animation frame; the procedural body fire already plays without it.
    void image.decode().then(() => {
      if (pending !== image) return;
      sheet = image;
      pending = null;
    }, () => {
      if (pending === image) pending = null;
    });
  }
  leases++;
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    if (--leases === 0) {
      // This private loader can already be complete while decode() is pending.
      if (pending) pending.src = "";
      pending = null;
      sheet = null;
    }
  };
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function drawFarFromFormPlumes(
  ctx: CanvasRenderingContext2D,
  key: string,
  progress: number,
  coarse: boolean,
) {
  if (!sheet || progress <= 0 || progress >= 0.76) return;
  const tone = key === "high" ? 0 : key === "xhigh" ? 1 : key === "max" ? 2 : -1;
  const ultra = key === "ultra-body" || key === "ultra";
  if (tone < 0 && !ultra) return;
  const fade = clamp((0.76 - progress) / 0.25);
  const rootOpacity = ctx.globalAlpha;
  for (let i = 0; i < vents.length; i++) {
    if (coarse && (i === 2 || i === 3)) continue;
    const v = vents[i];
    const growth = clamp((progress - (1 - v.y) * 0.27) / 0.16);
    if (!growth) continue;
    const frame = (Math.floor(progress * 44) + v.phase) % FRAMES;
    const index = (ultra ? i % 3 : tone) * FRAMES + frame;
    const height = v.h * (0.38 + 0.62 * growth);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = rootOpacity * growth * fade * 0.88;
    ctx.transform(i % 2 ? -1 : 1, 0, v.lean, 1, v.x, v.y);
    ctx.drawImage(sheet, (index % COLUMNS) * TILE_W, Math.floor(index / COLUMNS) * TILE_H,
      TILE_W, TILE_H, -v.w / 2, -height * 0.969, v.w, height);
    ctx.restore();
  }
}
