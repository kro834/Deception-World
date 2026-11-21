import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { decodeNaniteSeam } from "../src/lib/rexonance-assembly-nanites.js";
import { REXONANCE_NANITE_SEAMS } from "../src/lib/rexonance-nanites.ts";
import { RexonanceScrollSwarm } from "../src/lib/rexonance-scroll-swarm.ts";
import { REXONANCE_SUIT_DRIVER } from "../src/lib/rexonance-calls.ts";
import { REXONANCE_SUIT_PIECES } from "../src/lib/rexonance-suit.ts";
import {
  REXONANCE_SKIN_FIELD,
  SKIN_SCROLL,
  skinReach,
  skinSamples,
} from "../src/lib/rexonance-suit-skin.ts";

const pieces = REXONANCE_SUIT_PIECES.filter((piece) => !REXONANCE_SUIT_DRIVER.includes(piece.id));
const windows = Float32Array.from(
  pieces.flatMap((piece) => (piece.group === "helm" ? [0.68, 0.848] : [0.25, 0.4])),
);
const { data, info } = await sharp(
  fileURLToPath(new URL("../public" + REXONANCE_SKIN_FIELD, import.meta.url)),
)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const field = skinSamples(data, info.width, info.height, 6000);
const bind = (swarm) => swarm.bindSkin(field, (value, head) => skinReach(SKIN_SCROLL, value, head));

function draw(swarm, q, skin = true, share = 1) {
  const positions = [];
  let batches = 0;
  const context = {
    beginPath() {},
    closePath() {},
    lineTo() {},
    moveTo(x, y) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      positions.push(x, y);
    },
    fill() {
      batches++;
    },
  };
  const count = swarm.draw(context, context, q, skin, 0.55, share);
  assert.equal(positions.length, count * 2, "one visible facet per machine");
  assert.ok(batches <= 6, "all facets fit in six depth/colour batches");
  return { count, positions };
}

test("the cooled fragment flocks follow skin and classic clocks and replay exactly on reverse scroll", () => {
  const swarm = new RexonanceScrollSwarm("desktop", pieces, windows);
  bind(swarm);
  for (const q of [0, 0.06, 0.1135, 0.86, 0.9, 1]) assert.equal(draw(swarm, q).count, 0);
  const snapshots = new Map();
  // 2026-11-21 (face seam): the head's field is spread evenly by rank so the
  // face closes in one motion; the visor's flocks, which dock where the skin
  // reaches their seat, now land by 0.68, so the last-flock probe is 0.67.
  for (const q of [0.125, 0.15, 0.2, 0.35, 0.48, 0.67]) snapshots.set(q, draw(swarm, q));
  assert.ok(snapshots.get(0.125).count > 300);
  assert.ok(snapshots.get(0.15).count > 2000);
  assert.ok(snapshots.get(0.35).count > 400);
  assert.ok(snapshots.get(0.67).count > 30);
  assert.notDeepEqual(draw(swarm, 0.35, false), snapshots.get(0.35));
  for (const [q, frame] of [...snapshots].reverse()) assert.deepEqual(draw(swarm, q), frame);
});

test("touch and governed flocks stay bounded and retain a visible burst", () => {
  for (const [tier, expected] of [
    ["desktop", 2304],
    ["tablet", 1152],
    ["phone", 720],
    ["low", 288],
  ]) {
    const swarm = new RexonanceScrollSwarm(tier, pieces, windows);
    assert.equal(swarm.count, expected);
    const rich = draw(swarm, 0.15);
    const lean = draw(swarm, 0.15, true, 0.4);
    assert.ok(lean.count <= expected * 0.4 && lean.count > expected * 0.3);
    assert.ok(rich.count > lean.count * 2);
  }
});

test("a drawn packet reaches the boot's decoded edge or assembly seat before disappearing", () => {
  const boot = pieces.find((piece) => piece.id === "boot-foot-l");
  const swarm = new RexonanceScrollSwarm("phone", [boot], Float32Array.of(0.2, 0.4));
  swarm.bindSkin(field, () => 0.4);
  const loop = decodeNaniteSeam(REXONANCE_NANITE_SEAMS[boot.id])[0];
  const distance = (x, y) => {
    let best = Math.hypot(x - boot.seat[0], y - boot.seat[1]);
    for (let a = 0; a < loop.length; a += 2) {
      const b = (a + 2) % loop.length;
      const dx = loop[b] - loop[a],
        dy = loop[b + 1] - loop[a + 1];
      const u = Math.max(
        0,
        Math.min(1, ((x - loop[a]) * dx + (y - loop[a + 1]) * dy) / (dx * dx + dy * dy || 1)),
      );
      best = Math.min(best, Math.hypot(x - loop[a] - u * dx, y - loop[a + 1] - u * dy));
    }
    return best;
  };
  const seated = draw(swarm, 0.387);
  const handedOff = draw(swarm, 0.4);
  assert.ok(seated.count > 300);
  assert.ok(handedOff.count > 300);
  // moveTo gives the left edge of each facet (up to six figure pixels
  // wide), including the three-pixel socket inset.
  for (const { positions } of [seated, handedOff]) {
    for (let i = 0; i < positions.length; i += 2)
      assert.ok(distance(positions[i], positions[i + 1]) < 11);
  }
  assert.equal(draw(swarm, 0.407).count, 0);
  const airborne = draw(swarm, 0.27).positions;
  assert.ok(airborne.some((x, i) => i % 2 === 0 && distance(x, airborne[i + 1]) > 100));
});

test("a coarse scroll still catches both cheeks before the inner visor at the low budget", () => {
  const reducedSwarm = new RexonanceScrollSwarm("low", pieces, windows);
  bind(reducedSwarm);
  const faceShare = 0.17; // Four families at the smallest device tier.
  const sample = (q) => {
    const { positions } = draw(reducedSwarm, q, true, faceShare);
    return Array.from({ length: positions.length / 2 }, (_, i) => ({
      x: positions[i * 2],
      y: positions[i * 2 + 1],
    }));
  };
  const frames = Array.from({ length: 20 }, (_, i) => sample(0.52 + i * 0.015));
  const cheeks = frames.findIndex((points) =>
    points.some(({ x, y }) => x >= 216 && x <= 255 && y >= 172 && y <= 205) &&
    points.some(({ x, y }) => x >= 316 && x <= 351 && y >= 172 && y <= 205),
  );
  const visor = frames.findIndex((points) =>
    points.some(({ x, y }) => x >= 261 && x < 283 && y >= 151 && y <= 168) &&
    points.some(({ x, y }) => x > 285 && x <= 305 && y >= 151 && y <= 168),
  );
  assert.ok(cheeks >= 0 && visor > cheeks, "the two sides seat on the cheeks and then close inward");
});
