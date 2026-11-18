/** Far From's form ignition, in the coordinates of the complete suit cutout.
 * Every trajectory is a function of progress so a backward scrub retraces it. */
const COLORS = ["#49f681", "#ff4252", "#ffc647"] as const;
const HOT_CORES = ["#dbffd8", "#fff0ab", "#ffffdd"] as const;
const AFTERGLOW = ["#0ab85a", "#fc3122", "#ff901c"] as const;
const TAU = 2 * Math.PI;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const noise = (i: number, seed: number) => {
  const v = Math.sin((i + 1) * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// Lines down the chest, arms and legs in the common artwork frame.
const limbs = [
  [0.5, 0.12, 0.5, 0.48],
  [0.38, 0.22, 0.24, 0.49],
  [0.62, 0.22, 0.76, 0.49],
  [0.44, 0.46, 0.35, 0.92],
  [0.56, 0.46, 0.65, 0.92],
];
const sparks = Array.from({ length: 180 }, (_, i) => {
  const [x0, y0, x1, y1] = limbs[i % limbs.length];
  const t = noise(i, 1);
  const angle = TAU * noise(i, 2);
  return {
    x: x0 + (x1 - x0) * t + (noise(i, 3) - 0.5) * 0.1,
    y: y0 + (y1 - y0) * t,
    dx: Math.cos(angle), dy: Math.sin(angle),
    speed: 0.55 + 0.45 * noise(i, 4),
    delay: noise(i, 5) * 0.18,
    size: 0.003 + 0.006 * noise(i, 6),
  };
});

export function drawFarFromFormCombustion(
  context: CanvasRenderingContext2D, key: string, u: number,
  width: number, height: number, coarse: boolean, coreY = 0.264,
) {
  if (u <= 0 || u >= 1) return;
  const ultra = key === "ultra" || key === "ultra-body";
  const tone = key === "high" ? 0 : key === "xhigh" ? 1 : key === "max" ? 2 : -1;
  if (!ultra && tone < 0) return;
  context.save();
  context.scale(width, height);
  context.globalCompositeOperation = "lighter";
  const count = coarse ? 90 : sparks.length;
  for (let color = 0; color < COLORS.length; color++) {
    if (!ultra && color !== tone) continue;
    context.fillStyle = COLORS[color];
    // Build tapering sheets of flame along the body before the shell ruptures.
    const heat = clamp(u / 0.26) * clamp((0.55 - u) / 0.17);
    if (heat > 0) {
      for (let layer = 0; layer < 3; layer++) {
        const widthScale = layer === 0 ? 1.7 : layer === 1 ? 1 : 0.48;
        const heightScale = layer === 0 ? 1.17 : layer === 1 ? 0.9 : 0.56;
        context.fillStyle = layer === 0 ? AFTERGLOW[color] : layer === 1 ? COLORS[color] : HOT_CORES[color];
        context.globalAlpha = heat * (layer === 0 ? 0.21 : layer === 1 ? 0.66 : 0.94);
        context.beginPath();
        for (let i = ultra ? color : 0; i < 45; i += ultra ? 3 : 1) {
          const p = sparks[i];
          const wave = Math.sin(u * (24 + p.speed * 12) + i * 1.8);
          const flicker = 0.76 + 0.24 * Math.sin(i * 2.3 - u * 32);
          const reach = heat * heightScale * flicker * (0.045 + p.speed * 0.16);
          const half = (0.006 + p.size * 1.7) * widthScale;
          const bend = wave * reach * 0.35;
          const tip = p.x + bend * 0.8 + p.dx * reach * 0.22;
          context.moveTo(p.x - half, p.y);
          context.bezierCurveTo(p.x - half * 1.8, p.y - reach * 0.34,
            tip + bend, p.y - reach * 0.58, tip, p.y - reach);
          context.bezierCurveTo(tip + half * 1.6, p.y - reach * 0.66,
            p.x - bend + half * 1.9, p.y - reach * 0.38, p.x + half, p.y);
          context.quadraticCurveTo(p.x, p.y + half * 0.75, p.x - half, p.y);
        }
        context.fill();
      }
    }
    // Hot fragments depart from the limb that burnt. Ultra simultaneously
    // draws a separate cloud inward along curved paths to the chest crystal.
    const burst = clamp((u - 0.38) / 0.48);
    if (burst > 0 && burst < 1) {
      const light = Math.sin(Math.PI * burst ** 0.65);
      const radius = 0.055 + Math.sqrt(burst) * 0.38;
      const flare = context.createRadialGradient(0.5, coreY, 0, 0.5, coreY, radius);
      flare.addColorStop(0, HOT_CORES[color]);
      flare.addColorStop(0.26, COLORS[color]);
      flare.addColorStop(1, "transparent");
      context.globalAlpha = light * (ultra ? 0.18 : 0.44);
      context.fillStyle = flare;
      context.fillRect(0.5 - radius, coreY - radius, radius * 2, radius * 2);
      context.globalAlpha = light;
      context.fillStyle = COLORS[color];
      context.beginPath();
      for (let i = ultra ? color : 0; i < count; i += ultra ? 3 : 1) {
        const p = sparks[i];
        const travel = Math.sqrt(burst) * p.speed;
        const x = p.x + p.dx * travel * 0.43;
        const y = p.y + p.dy * travel * 0.28;
        context.moveTo(x, y);
        context.lineTo(x - p.dx * 0.043, y - p.dy * 0.031);
        context.lineTo(x + p.size * 1.55, y + p.size);
      }
      context.fill();
    }
    if (ultra && u > 0.38) {
      context.fillStyle = HOT_CORES[color];
      context.globalAlpha = clamp((u - 0.38) / 0.05) * clamp((1 - u) / 0.15);
      context.beginPath();
      for (let i = color; i < count; i += 3) {
        const p = sparks[i];
        const t = clamp((u - 0.38 - p.delay) / (0.62 - p.delay));
        const r = (1 - t) * p.speed;
        const a = t * (1.15 + p.delay);
        const x = 0.5 + (p.dx * Math.cos(a) - p.dy * Math.sin(a)) * r * 0.75;
        const y = coreY + (p.dy * Math.cos(a) + p.dx * Math.sin(a)) * r * 0.52;
        const size = p.size * 1.65;
        context.rect(x, y, size, size * 0.67);
        context.moveTo(x + size, y);
        context.lineTo(x + (x - 0.5) * 0.075, y + (y - coreY) * 0.075);
        context.lineTo(x, y + size * 0.6);
      }
      context.fill();
    }
  }
  context.restore();
}
