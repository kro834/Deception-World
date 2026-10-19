import assert from "node:assert/strict";
import test from "node:test";
import { connectedFireEvidence } from "./rexonance-fire-evidence.mjs";

const width = 31;
const height = 45;
const regions = {
  head: [12, 2, 7, 4],
  chest: [12, 12, 7, 4],
  abdomen: [12, 20, 7, 4],
  armLeft: [6, 20, 4, 5],
  armRight: [21, 20, 4, 5],
  thighLeft: [9, 28, 5, 5],
  thighRight: [17, 28, 5, 5],
  shinLeft: [9, 35, 5, 4],
  shinRight: [17, 35, 5, 4],
  footLeft: [7, 42, 7, 3],
  footRight: [17, 42, 7, 3],
};
const rect = (grid, [x, y, w, h], value = 255) => {
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++) grid[yy * width + xx] = value;
};
function fixture() {
  const bodyMask = new Uint8Array(width * height);
  for (const r of [
    [12, 1, 7, 27],
    [6, 13, 4, 18],
    [21, 13, 4, 18],
    [9, 11, 13, 6],
    [9, 25, 5, 20],
    [17, 25, 5, 20],
    [7, 42, 7, 3],
    [17, 42, 7, 3],
  ])
    rect(bodyMask, r);
  return { bodyMask, fire: new Uint8Array(width * height) };
}
const analyse = ({ bodyMask, fire }, options = {}) => {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < fire.length; i++) if (fire[i]) pixels.set([35, 180, 60, fire[i]], i * 4);
  return connectedFireEvidence({
    pixels,
    width,
    height,
    bodyMask,
    regions,
    bodyPadding: 0,
    ...options,
  });
};
const allJoined = (evidence) =>
  Object.values(evidence.largest.regional).every((r) => r.ratio >= 0.05);

test("one connected body field reaches all eleven real regions", () => {
  const f = fixture();
  f.fire.set(f.bodyMask);
  const evidence = analyse(f);
  assert.equal(evidence.componentCount, 1);
  assert.equal(evidence.largest.fractionOfGreen, 1);
  assert.ok(allJoined(evidence));
});

test("a hollow vortex wraps both sides of every body level without requiring a green human centre", () => {
  const f = fixture();
  f.fire.fill(255);
  for (let i = 0; i < f.fire.length; i++) if (f.bodyMask[i]) f.fire[i] = 0;
  const evidence = analyse(f);
  assert.equal(evidence.wrap.regions["head-left"].ratio, 1);
  assert.equal(evidence.wrap.regions["foot-right"].ratio, 1);
  assert.equal(Object.keys(evidence.wrap.regions).length, 12);
  assert.ok(
    evidence.wrap.minimum >= 0.9,
    "the genuine outside vortex reaches all anatomical bands",
  );
  f.fire.fill(0);
  f.fire.set(f.bodyMask);
  assert.equal(
    analyse(f).wrap.minimum,
    0,
    "a coloured human stencil alone cannot satisfy the wrap gate",
  );
});

test("exterior evidence distinguishes a broad nearby plume from a coloured human stencil or distant HUD", () => {
  const f = fixture();
  f.fire.set(f.bodyMask);
  const stencil = analyse(f, { bodyPadding: 1, exteriorPadding: 4 });
  assert.equal(stencil.exterior.greenPixels, 0, "the body copy alone is not a broad plume");
  rect(f.fire, [1, 16, 4, 10]);
  const plume = analyse(f, { bodyPadding: 1, exteriorPadding: 4 });
  assert.ok(plume.exterior.greenPixels > 10);
  assert.ok(plume.exterior.relativeToBody > 0);
  rect(f.fire, [0, 0, 3, 5]);
  const hud = analyse(f, { bodyPadding: 1, exteriorPadding: 4 });
  assert.equal(
    hud.exterior.greenPixels,
    plume.exterior.greenPixels,
    "distant decorative light is not flame evidence",
  );
});

test("eleven disconnected patches cannot masquerade as a whole-body fire", () => {
  const f = fixture();
  for (const region of Object.values(regions)) rect(f.fire, region);
  const evidence = analyse(f, { bridge: 0 });
  assert.ok(
    Object.values(evidence.regional).every((r) => r.ratio === 1),
    "the old per-region rule passes",
  );
  assert.ok(evidence.componentCount > 5);
  assert.equal(allJoined(evidence), false, "the new one-component rule rejects separate flames");
});

test("HUD/background green cannot bridge separate surface fires", () => {
  const f = fixture();
  for (const region of Object.values(regions)) rect(f.fire, region);
  for (let i = 0; i < f.fire.length; i++) if (!f.bodyMask[i]) f.fire[i] = 255;
  const evidence = analyse(f, { bridge: 0 });
  assert.equal(allJoined(evidence), false);
  assert.ok(
    evidence.greenPixels < f.fire.filter(Boolean).length,
    "outside-body pixels are excluded",
  );
});

test("a tiny texture pinhole is tolerated but a separated band is not", () => {
  const f = fixture();
  f.fire.set(f.bodyMask);
  rect(f.fire, [12, 18, 7, 1], 0);
  assert.equal(allJoined(analyse(f, { bridge: 1 })), true);
  rect(f.fire, [0, 17, width, 5], 0);
  assert.equal(allJoined(analyse(f, { bridge: 1 })), false);
});

test("transparent pixels and cyan artwork are not green-fire evidence", () => {
  const f = fixture();
  f.fire.set(f.bodyMask.map((value) => (value ? 20 : 0)));
  assert.equal(analyse(f).greenPixels, 0);
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < f.bodyMask.length; i++) pixels.set([25, 180, 220, 255], i * 4);
  assert.equal(
    connectedFireEvidence({ pixels, width, height, bodyMask: f.bodyMask, regions }).greenPixels,
    0,
  );
});

test("burst intensity measures the actual visible pixels rather than component dilation", () => {
  const f = fixture();
  f.fire.set(f.bodyMask.map((value) => (value ? 80 : 0)));
  const slow = analyse(f, { bridge: 2 });
  f.fire.set(f.bodyMask);
  const burst = analyse(f, { bridge: 2 });
  assert.equal(slow.greenPixels, burst.greenPixels);
  assert.ok(burst.meanGreenExcess > slow.meanGreenExcess * 3);
});

test("a malformed evidence grid fails instead of silently counting the wrong figure", () => {
  assert.throws(
    () =>
      connectedFireEvidence({
        pixels: new Uint8Array(4),
        width: 2,
        height: 2,
        bodyMask: new Uint8Array(4),
        regions,
      }),
    /share the sampling grid/,
  );
});
