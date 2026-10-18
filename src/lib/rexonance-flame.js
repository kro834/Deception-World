// The nanites' source (owner, 2026-10-18): a forest-green fire round the
// reactor that kindles slowly, burns across its surroundings and dies down
// slowly. Shared by the scroll scene (rexonance-resonance.js) and the entry
// call (rexonance-suit-nanites.tsx); `scale` maps figure px to canvas px.
//
// Realism (owner: より リアル に): not shapes but a particle fire — soft
// blobs that rise from a burning bed, swell, drift on a turbulent sway,
// cool from a pale-green core through green to dark forest green and thin
// into smoke, with sparks lifting off. Each particle's state is a pure
// function of the clock, so a resting frame is the same however reached.

const FLAMES = 150;
const SPARKS = 26;
const SPRITE = 64;
// Colour by age: core, flame, forest, smoke.
const TONES = [
  [210, 255, 196],
  [96, 214, 92],
  [40, 160, 44],
  [14, 70, 26],
];

let sprites = null;
const makeSprites = () => {
  const doc = globalThis.document;
  if (!doc?.createElement) return null;
  return TONES.map(([r, g, b]) => {
    const canvas = doc.createElement("canvas");
    canvas.width = canvas.height = SPRITE;
    const c = canvas.getContext("2d");
    if (!c || !c.createRadialGradient) return canvas;
    const half = SPRITE / 2;
    const glow = c.createRadialGradient(half, half, 0, half, half, half);
    glow.addColorStop(0, `rgb(${r} ${g} ${b} / 1)`);
    glow.addColorStop(0.35, `rgb(${r} ${g} ${b} / 0.55)`);
    glow.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    c.fillStyle = glow;
    c.fillRect(0, 0, SPRITE, SPRITE);
    return canvas;
  });
};

const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * `strength` 0–1 is how far the fire has kindled (the callers ease it in
 * and out slowly); `clock` in seconds drives the flicker.
 */
export function drawNaniteFlame(context, [cx, cy], strength, clock, scale = 1) {
  if (strength <= 0) return;
  sprites ??= makeSprites();
  if (!sprites) return;
  context.save();
  if (scale !== 1) context.scale(scale, scale);
  // The burning bed widens as the fire takes hold, round the reactor.
  const bedX = 34 + 70 * strength;
  const bedY = 16 + 26 * strength;
  const height = 70 + 110 * strength;
  context.globalCompositeOperation = "lighter";
  for (let i = 0; i < FLAMES; i += 1) {
    // Only as many tongues as the fire has caught.
    if (hash(i + 0.5) > strength * 1.15) continue;
    const rate = 0.55 + 0.5 * hash(i + 1.3);
    const age = (clock * rate + hash(i + 2.7)) % 1;
    const angle = hash(i + 4.1) * Math.PI * 2;
    const reach = Math.sqrt(hash(i + 5.9));
    const bx = cx + Math.cos(angle) * bedX * reach;
    const by = cy + 18 + Math.sin(angle) * bedY * reach;
    // Nearer the middle, taller; the turbulence grows as it rises.
    const lift = height * (1 - 0.55 * reach) * age;
    const sway =
      Math.sin(clock * 2.3 + i * 1.7 + age * 5) * 10 * age +
      Math.sin(clock * 5.1 + i * 0.6) * 3 * age * age;
    const x = bx + sway;
    const y = by - lift;
    // Swells as it leaves the bed, then thins.
    const size = (20 + 24 * hash(i + 7.3)) * (0.5 + age * 1.1) * (1 - age * 0.55);
    const tone = age < 0.18 ? 0 : age < 0.45 ? 1 : age < 0.78 ? 2 : 3;
    const fade = Math.sin(Math.PI * Math.min(1, age * 1.15)) * strength;
    context.globalAlpha = Math.min(1, fade * (tone === 3 ? 0.3 : tone === 0 ? 0.85 : 0.7));
    if (tone === 3) context.globalCompositeOperation = "source-over";
    context.drawImage(sprites[tone], x - size / 2, y - size * 0.62, size, size * 1.24);
    if (tone === 3) context.globalCompositeOperation = "lighter";
  }
  // Sparks lifting off the fire.
  context.fillStyle = "rgb(186 255 170)";
  for (let i = 0; i < SPARKS; i += 1) {
    if (hash(i + 31.5) > strength) continue;
    const age = (clock * (0.35 + 0.3 * hash(i + 33.1)) + hash(i + 35.7)) % 1;
    const x = cx + (hash(i + 37.3) - 0.5) * bedX * 2 + Math.sin(clock * 3 + i) * 14 * age;
    const y = cy + 10 - (height * 1.3) * age;
    context.globalAlpha = (1 - age) * 0.8 * strength;
    const size = 1.4 + 1.6 * (1 - age);
    context.fillRect(x - size / 2, y - size / 2, size, size);
  }
  context.restore();
}
