// The nanites' source (owner, 2026-10-18): a forest-green flame. Shared by
// the scroll scene (rexonance-resonance.js) and the entry call
// (rexonance-suit-nanites.tsx); `scale` maps figure px to canvas px.
const FLAME_TONGUES = 14;
// Forest-green flame tongues licking up round the reactor (an outer forest
// green, an inner brighter green, a pale heart), each flickering on its own.
const FLAME_LAYERS = [
  [1, 0.34, "rgb(34 139 34)"],
  [0.66, 0.42, "rgb(72 180 70)"],
  [0.38, 0.5, "rgb(176 240 160)"],
];
export function drawNaniteFlame(context, [cx, cy], strength, clock, scale = 1) {
  context.save();
  if (scale !== 1) context.scale(scale, scale);
  context.globalCompositeOperation = "lighter";
  for (const [layer, alpha, colour] of FLAME_LAYERS) {
    context.fillStyle = colour;
    for (let k = 0; k < FLAME_TONGUES; k += 1) {
      const seed = (k * 0.618 + layer) % 1;
      const flicker = 0.72 + 0.28 * Math.sin(clock * (6.1 + seed * 4) + k * 1.9 + layer * 3);
      const spread = k / (FLAME_TONGUES - 1) - 0.5;
      const lean = spread * 1.5 + 0.22 * Math.sin(clock * 2.4 + k * 0.7);
      const height = (95 + 75 * seed) * layer * flicker * strength * (1 - Math.abs(spread) * 0.75);
      const width = (10 + 8 * seed) * (0.6 + 0.4 * layer);
      const bx = cx + spread * 90 * layer;
      const by = cy + 26 * layer;
      const tx = bx + lean * height * 0.5;
      const ty = by - height;
      const mx = bx + lean * height * 0.18;
      context.globalAlpha = alpha * strength * flicker;
      context.beginPath();
      context.moveTo(bx - width, by);
      context.bezierCurveTo(bx - width * 1.2, by - height * 0.4, mx - width * 0.4, by - height * 0.7, tx, ty);
      context.bezierCurveTo(mx + width * 0.4, by - height * 0.7, bx + width * 1.2, by - height * 0.4, bx + width, by);
      context.quadraticCurveTo(bx, by + width, bx - width, by);
      context.fill();
    }
  }
  context.restore();
}

