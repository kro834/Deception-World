import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { BELT_OUTLINE } from "./far-from-belt-outline.mjs";
import {
  FAR_FROM_SUIT_ATLAS,
  FAR_FROM_SUIT_DRIVER,
  FAR_FROM_SUIT_DRIVER_STANDIN,
  FAR_FROM_SUIT_PIECES,
  FAR_FROM_SUIT_SIZE,
} from "../src/lib/far-from-suit.ts";
import { FAR_FROM_SUIT_SCALE } from "../src/lib/far-from-stage.ts";
import { separateDriverPixels } from "../src/lib/rexonance-unlit.js";
import { FAR_FROM_ENTRY_PIECES } from "../src/lib/far-from-entry-suit.ts";

/* FAR FROM SAGA — the driver's cutout (owner, 2026-10-23: 「腰回りのドライバー
   の切り抜きが甘い」). The エクスサーガドライバー is the loading stand-in under
   the canvas and the five preset plates the engine lays on the body: it must
   be the belt and nothing else (no scale chunks above, no ribbon slivers
   under, no detached slivers at the sides, no polygon edges through the art),
   with soft edges, and it must sit exactly where the driver sits on ミドル.
   The outline is scripts/far-from-belt-outline.mjs, traced over the cutout;
   both the scroll suit-up's and the entry's builds cut by it. */

const publicFile = (src) => fileURLToPath(new URL(`../public${src}`, import.meta.url));
const SCALE = FAR_FROM_SUIT_SCALE;
// The soft edge and the delivery's resampling spread a pixel or two past the
// outline (cutout px).
const REACH = 2.5;

const inside = (polygon, x, y) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && ((xj - xi) * (y - yi)) / (yj - yi) + xi - x > 0) hit = !hit;
  }
  return hit;
};
const edgeDistance = (polygon, x, y) => {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [ax, ay] = polygon[j];
    const [bx, by] = polygon[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
};
/** Distance (cutout px) outside the belt's outline: 0 on or inside it. */
const outside = (x, y) => {
  let best = Infinity;
  for (const shape of BELT_OUTLINE) {
    if (inside(shape, x, y)) return 0;
    best = Math.min(best, edgeDistance(shape, x, y));
  }
  return best;
};

const loadRaw = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
/** The owner's cutout's alpha (1024 x 1536), where the art really is opaque. */
const sourceAlpha = async () => {
  const { data, width } = await loadRaw(
    fileURLToPath(new URL("../design/far-from-suit-20261022/middle.webp", import.meta.url)),
  );
  return (cx, cy) => data[(Math.round(cy - 0.5) * width + Math.round(cx - 0.5)) * 4 + 3];
};
/** Well inside the outline (3 px from every edge). */
const wellInside = (cx, cy) =>
  BELT_OUTLINE.some((shape) => inside(shape, cx, cy) && edgeDistance(shape, cx, cy) >= 3);

const driverPieces = FAR_FROM_SUIT_PIECES.filter((piece) => FAR_FROM_SUIT_DRIVER.includes(piece.id));

test("the stand-in is the belt alone: no opaque pixel outside the belt's outline", async () => {
  const { data, width, height } = await loadRaw(publicFile(FAR_FROM_SUIT_DRIVER_STANDIN));
  assert.equal(width, FAR_FROM_SUIT_SIZE.width);
  assert.equal(height, FAR_FROM_SUIT_SIZE.height);
  let painted = 0;
  let stray = 0;
  let worst = 0;
  const box = { x0: width, y0: height, x1: -1, y1: -1 };
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * 4 + 3];
      // (Below 5% the resampling's faintest ripple is not a visible pixel.)
      if (a < 12) continue;
      painted += 1;
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
      const d = outside((x + 0.5) / SCALE, (y + 0.5) / SCALE);
      worst = Math.max(worst, d);
      // A faint pixel may reach a little further than an opaque one.
      if (d > REACH || (a > 64 && d > REACH - 1)) stray += 1;
    }
  assert.equal(stray, 0, `${stray} stand-in pixels outside the belt's outline (worst ${worst.toFixed(2)} px)`);
  assert.ok(painted > 9000, `the belt is whole (${painted} px)`);
  // Its box is the belt's: the old crop reached from x 228 to 465 and from y
  // 350 to 452 with armour above and below; the belt is shorter than 100 px.
  assert.ok(box.y1 - box.y0 < 100, `the belt is ${box.y1 - box.y0 + 1} px tall`);
  assert.ok(box.x0 >= 232 && box.x1 <= 462, `${box.x0}..${box.x1}`);
});

test("the belt is whole: the core with its rim, the crystal boxes and the band are all opaque", async () => {
  const { data, width } = await loadRaw(publicFile(FAR_FROM_SUIT_DRIVER_STANDIN));
  const source = await sourceAlpha();
  const alphaAt = (cx, cy) => data[(Math.round(cy * SCALE) * width + Math.round(cx * SCALE)) * 4 + 3];
  // Wherever the cutout is opaque well inside the traced outline, so is the
  // stand-in (the outline never bites into the art).
  let inner = 0;
  let solid = 0;
  for (let cy = 540; cy <= 655; cy += 1)
    for (let cx = 350; cx <= 675; cx += 1) {
      if (!wellInside(cx + 0.5, cy + 0.5) || source(cx + 0.5, cy + 0.5) < 250) continue;
      inner += 1;
      if (alphaAt(cx + 0.5, cy + 0.5) > 235) solid += 1;
    }
  assert.ok(inner > 15000, `${inner} px well inside the outline`);
  assert.ok(solid / inner > 0.99, `the belt's inside is solid (${((solid / inner) * 100).toFixed(2)}%)`);
  // The marks: the core's centre, the crown and the point of its rim, both
  // wings' crystal boxes.
  for (const [cx, cy] of [
    [512.8, 592],
    [512.5, 542],
    [512.5, 648],
    [412, 592],
    [450, 590],
    [575, 590],
    [610, 590],
  ])
    assert.ok(alphaAt(cx, cy) > 235, `the belt at ${cx}, ${cy}`);
});

test("the driver's plates hold only the belt, and overlap across their cuts so no hairline opens between them", async () => {
  const atlas = await loadRaw(publicFile(FAR_FROM_SUIT_ATLAS.src));
  for (const piece of driverPieces) {
    let stray = 0;
    for (let y = 0; y < piece.h; y += 1)
      for (let x = 0; x < piece.w; x += 1) {
        const a = atlas.data[((piece.ay + y) * atlas.width + piece.ax + x) * 4 + 3];
        if (a < 12) continue;
        const d = outside((piece.x + x + 0.5) / SCALE, (piece.y + y + 0.5) / SCALE);
        if (d > REACH || (a > 64 && d > REACH - 1)) stray += 1;
      }
    assert.equal(stray, 0, `${piece.id}: ${stray} pixels outside the belt's outline`);
  }
  // Composited as the engine lays them on its driver sheet, every pixel the
  // belt covers well inside is opaque: no seam of the undersuit at a cut.
  const layers = await Promise.all(
    driverPieces
      .slice()
      .reverse()
      .map(async (piece) => ({
        input: await sharp(publicFile(FAR_FROM_SUIT_ATLAS.src))
          .extract({ left: piece.ax, top: piece.ay, width: piece.w, height: piece.h })
          .png()
          .toBuffer(),
        left: piece.x,
        top: piece.y,
      })),
  );
  const { width, height } = FAR_FROM_SUIT_SIZE;
  const sheet = await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
    .composite(layers)
    .raw()
    .toBuffer();
  const source = await sourceAlpha();
  let holes = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const cx = (x + 0.5) / SCALE;
      const cy = (y + 0.5) / SCALE;
      if (wellInside(cx, cy) && source(cx, cy) >= 250 && sheet[(y * width + x) * 4 + 3] < 235) holes += 1;
    }
  assert.ok(holes <= 12, `${holes} translucent pixels inside the composited belt`);
});

test("the stand-in is the plates' composite with the lights separated (the engine's own driver sheet)", async () => {
  const atlasFile = publicFile(FAR_FROM_SUIT_ATLAS.src);
  const layers = await Promise.all(
    driverPieces
      .slice()
      .reverse()
      .map(async (piece) => ({
        input: await sharp(atlasFile)
          .extract({ left: piece.ax, top: piece.ay, width: piece.w, height: piece.h })
          .png()
          .toBuffer(),
        left: piece.x,
        top: piece.y,
      })),
  );
  const { width, height } = FAR_FROM_SUIT_SIZE;
  const expected = await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
    .composite(layers)
    .raw()
    .toBuffer();
  separateDriverPixels(expected);
  const { data } = await loadRaw(publicFile(FAR_FROM_SUIT_DRIVER_STANDIN));
  let far = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < expected.length; i += 4) {
    if (!expected[i + 3] && !data[i + 3]) continue;
    // The stand-in is cut from the art before the atlas's lossy encode: its
    // alpha agrees to a few levels and its colours to the encode's noise,
    // never by geometry.
    if (Math.abs(data[i + 3] - expected[i + 3]) > 24) far += 1;
    if (expected[i + 3] > 200) {
      for (let c = 0; c < 3; c += 1) sum += Math.abs(data[i + c] - expected[i + c]);
      count += 3;
    }
  }
  assert.equal(far, 0, `${far} stand-in pixels differ in coverage from the plates' composite`);
  assert.ok(sum / count < 10, `mean colour difference ${(sum / count).toFixed(2)}`);
});

test("the entry's belt plate is the belt alone too (its own atlas, hard-edged at the delivery size)", async () => {
  const belt = FAR_FROM_ENTRY_PIECES.find((piece) => piece.id === "belt");
  assert.ok(belt, "the entry has a belt plate");
  // The old plate was the 320 x 92 box of the cutout (212 x 62 px at the
  // delivery size, plus the scale chunks above and the ribbons under it).
  const entryScale = 1040 / 1536;
  const { data, width } = await loadRaw(publicFile("/far-from-entry-20261022/plates.webp"));
  let stray = 0;
  let painted = 0;
  for (let y = 0; y < belt.h; y += 1)
    for (let x = 0; x < belt.w; x += 1) {
      const a = data[((belt.ay + y) * width + belt.ax + x) * 4 + 3];
      if (a < 6) continue;
      painted += 1;
      if (outside((belt.x + x + 0.5) / entryScale, (belt.y + y + 0.5) / entryScale) > 1.5) stray += 1;
    }
  assert.equal(stray, 0, `${stray} belt-plate pixels outside the outline`);
  assert.ok(painted > 8000, `${painted} px`);
});

test("asset budgets: the stand-in and the atlas stay small, and the build is wired to the one outline", () => {
  const size = (src) => statSync(publicFile(src)).size;
  assert.ok(size(FAR_FROM_SUIT_DRIVER_STANDIN) <= 36_000, `stand-in ${size(FAR_FROM_SUIT_DRIVER_STANDIN)} bytes`);
  assert.ok(size(FAR_FROM_SUIT_ATLAS.src) <= 300_000, `atlas ${size(FAR_FROM_SUIT_ATLAS.src)} bytes`);
  assert.ok(size("/far-from-entry-20261022/plates.webp") <= 300_000, "the entry's atlas");
  const suitBuild = readFileSync(new URL("./build-far-from-suit.mjs", import.meta.url), "utf8");
  const entryBuild = readFileSync(new URL("./build-far-from-entry.mjs", import.meta.url), "utf8");
  assert.match(suitBuild, /far-from-belt-outline\.mjs/);
  assert.match(entryBuild, /far-from-belt-outline\.mjs/);
  assert.match(suitBuild, /rasterise\(BELT_OUTLINE/);
  // The outline: two wings and the core with its crown, point and shards.
  assert.ok(BELT_OUTLINE.length >= 9);
  for (const shape of BELT_OUTLINE) {
    assert.ok(shape.length >= 3);
    for (const [x, y] of shape) assert.ok(x > 340 && x < 690 && y > 520 && y < 670, `${x}, ${y}`);
  }
});
