import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";
import { BELT_OUTLINE as ILLUSION_OUTLINE } from "./illusionculum-belt-outline.mjs";
import { BELT_OUTLINE as META_OUTLINE } from "./meta-unitas-belt-outline.mjs";
import {
  ILLUSIONCULUM_SUIT_ATLAS,
  ILLUSIONCULUM_SUIT_DRIVER,
  ILLUSIONCULUM_SUIT_DRIVER_STANDIN,
  ILLUSIONCULUM_SUIT_PIECES,
  ILLUSIONCULUM_SUIT_SIZE,
} from "../src/lib/illusionculum-suit.ts";
import {
  META_UNITAS_RX_ATLAS,
  META_UNITAS_RX_DRIVER,
  META_UNITAS_RX_DRIVER_STANDIN,
  META_UNITAS_RX_PIECES,
  META_UNITAS_RX_SIZE,
} from "../src/lib/meta-unitas-rx-suit.ts";

/* イリュージョンクルム and メタ・ウニタス — the transformation belt's cutout
   (owner, 2026-10-24: 「変身ベルトの切り抜きが甘い」). The driver is the
   loading stand-in under the canvas and the plates the engine lays on the
   body: it must be the belt and nothing else (no armour fragments, no slivers,
   no polygon edges through the art), whole, with no hairline between its
   plates. The outlines are scripts/illusionculum-belt-outline.mjs and
   scripts/meta-unitas-belt-outline.mjs, traced over the cutouts. */

const publicFile = (src) => fileURLToPath(new URL(`../public${src}`, import.meta.url));
const designFile = (path) => fileURLToPath(new URL(`../design/${path}`, import.meta.url));
// The soft edge and the delivery's resampling spread a pixel or two past the
// outline (cutout px).
const REACH = 2.5;
const CUTOUT = { width: 1024, height: 1536 };

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
const loadRaw = async (input) => {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

const PAGES = [
  {
    name: "イリュージョンクルム",
    outline: ILLUSION_OUTLINE,
    cutout: designFile("illusionculum-saga-20261023/cutout-standard.webp"),
    standin: ILLUSIONCULUM_SUIT_DRIVER_STANDIN,
    size: ILLUSIONCULUM_SUIT_SIZE,
    atlas: ILLUSIONCULUM_SUIT_ATLAS,
    driver: ILLUSIONCULUM_SUIT_DRIVER,
    pieces: ILLUSIONCULUM_SUIT_PIECES,
    builds: ["build-illusionculum-suit.mjs", "illusionculum-belt-outline.mjs"],
    // [cx, cy] of the core's centre, the crown, the point and both wings' gems.
    marks: [
      [512.5, 690],
      [512.5, 632],
      [512.5, 728],
      [370, 685],
      [655, 685],
    ],
    minPainted: 9000,
  },
  {
    name: "メタ・ウニタス",
    outline: META_OUTLINE,
    cutout: designFile("meta-unitas-saga-20261023/cutouts/middle.webp"),
    standin: META_UNITAS_RX_DRIVER_STANDIN,
    size: META_UNITAS_RX_SIZE,
    atlas: META_UNITAS_RX_ATLAS,
    driver: META_UNITAS_RX_DRIVER,
    pieces: META_UNITAS_RX_PIECES,
    builds: ["build-meta-unitas-rx-suit.mjs", "meta-unitas-belt-outline.mjs"],
    marks: [
      [512, 676],
      [512, 630],
      [512, 725],
      [378, 683],
      [646, 683],
    ],
    minPainted: 9000,
  },
];

for (const page of PAGES) {
  const SCALE = page.size.height / CUTOUT.height;
  const outside = (x, y) => (inside(page.outline[0], x, y) ? 0 : edgeDistance(page.outline[0], x, y));
  const wellInside = (cx, cy) => inside(page.outline[0], cx, cy) && edgeDistance(page.outline[0], cx, cy) >= 3;
  const sourceAlpha = async () => {
    const { data, width } = await loadRaw(page.cutout);
    return (cx, cy) => data[(Math.round(cy - 0.5) * width + Math.round(cx - 0.5)) * 4 + 3];
  };
  const driverPieces = page.pieces.filter((piece) => page.driver.includes(piece.id));

  test(`${page.name}: the stand-in is the belt alone (no opaque pixel outside the outline)`, async () => {
    const { data, width, height } = await loadRaw(publicFile(page.standin));
    assert.equal(width, page.size.width);
    assert.equal(height, page.size.height);
    let painted = 0;
    let stray = 0;
    let worst = 0;
    const box = { x0: width, y0: height, x1: -1, y1: -1 };
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const a = data[(y * width + x) * 4 + 3];
        if (a < 12) continue;
        painted += 1;
        box.x0 = Math.min(box.x0, x);
        box.x1 = Math.max(box.x1, x);
        box.y0 = Math.min(box.y0, y);
        box.y1 = Math.max(box.y1, y);
        const d = outside((x + 0.5) / SCALE, (y + 0.5) / SCALE);
        worst = Math.max(worst, d);
        if (d > REACH || (a > 64 && d > REACH - 1)) stray += 1;
      }
    assert.equal(stray, 0, `${stray} stand-in pixels outside the outline (worst ${worst.toFixed(2)} px)`);
    assert.ok(painted > page.minPainted, `the belt is whole (${painted} px)`);
    assert.ok(box.y1 - box.y0 < 100, `the belt is ${box.y1 - box.y0 + 1} px tall`);
  });

  test(`${page.name}: the belt is whole and in one piece (no slivers, no hairlines)`, async () => {
    const { data, width, height } = await loadRaw(publicFile(page.standin));
    const source = await sourceAlpha();
    const alphaAt = (cx, cy) => data[(Math.round(cy * SCALE) * width + Math.round(cx * SCALE)) * 4 + 3];
    // Wherever the cutout is opaque well inside the outline, so is the
    // stand-in (the outline never bites into the art; no hairline opens).
    let inner = 0;
    let solid = 0;
    for (let cy = 600; cy <= 760; cy += 1)
      for (let cx = 340; cx <= 690; cx += 1) {
        if (!wellInside(cx + 0.5, cy + 0.5) || source(cx + 0.5, cy + 0.5) < 250) continue;
        inner += 1;
        if (alphaAt(cx + 0.5, cy + 0.5) > 235) solid += 1;
      }
    assert.ok(inner > 15000, `${inner} px well inside the outline`);
    assert.ok(solid / inner > 0.99, `the belt's inside is solid (${((solid / inner) * 100).toFixed(2)}%)`);
    for (const [cx, cy] of page.marks) assert.ok(alphaAt(cx, cy) > 235, `the belt at ${cx}, ${cy}`);
    // One connected body: every visible pixel belongs to the belt's one
    // component, or to a speck of at most 6 px.
    const label = new Int32Array(width * height);
    const sizes = [0];
    for (let start = 0; start < label.length; start += 1) {
      if (label[start] || data[start * 4 + 3] < 64) continue;
      const id = sizes.length;
      sizes.push(0);
      const stack = [start];
      label[start] = id;
      while (stack.length) {
        const i = stack.pop();
        sizes[id] += 1;
        const x = i % width;
        for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
          if (j < 0 || j >= label.length || label[j] || data[j * 4 + 3] < 64) continue;
          label[j] = id;
          stack.push(j);
        }
      }
    }
    const big = sizes.slice(1).filter((n) => n > 6);
    assert.equal(big.length, 1, `${big.length} separate pieces in the stand-in (${big.join(", ")} px)`);
  });

  test(`${page.name}: the driver's plates hold only the belt, with no seam between them`, async () => {
    const atlas = await loadRaw(publicFile(page.atlas.src));
    for (const piece of driverPieces) {
      let stray = 0;
      for (let y = 0; y < piece.h; y += 1)
        for (let x = 0; x < piece.w; x += 1) {
          const a = atlas.data[((piece.ay + y) * atlas.width + piece.ax + x) * 4 + 3];
          if (a < 12) continue;
          const d = outside((piece.x + x + 0.5) / SCALE, (piece.y + y + 0.5) / SCALE);
          if (d > REACH || (a > 64 && d > REACH - 1)) stray += 1;
        }
      assert.equal(stray, 0, `${piece.id}: ${stray} pixels outside the outline`);
    }
    const layers = await Promise.all(
      driverPieces
        .slice()
        .reverse()
        .map(async (piece) => ({
          input: await sharp(publicFile(page.atlas.src))
            .extract({ left: piece.ax, top: piece.ay, width: piece.w, height: piece.h })
            .png()
            .toBuffer(),
          left: piece.x,
          top: piece.y,
        })),
    );
    const { width, height } = page.size;
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

  test(`${page.name}: the build is wired to the traced outline`, () => {
    const [build, outlineFile] = page.builds;
    const text = readFileSync(new URL(`./${build}`, import.meta.url), "utf8");
    assert.match(text, new RegExp(outlineFile.replace(/\./g, "\\.")));
    assert.ok(page.outline.length === 1 && page.outline[0].length >= 40, "a traced, detailed outline");
    for (const [x, y] of page.outline[0]) assert.ok(x > 340 && x < 690 && y > 600 && y < 760, `${x}, ${y}`);
  });
}
