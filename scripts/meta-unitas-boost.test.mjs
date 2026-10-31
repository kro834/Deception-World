// META UNITAS SAGA — the suit-up's nanite boost (2026-10-30): it rides the
// shared Rexonance engine without touching it, so its beats must stay the
// engine's, its budgets must scale by tier, and its flashes stay within the
// site's photosensitivity rules.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ASSEMBLY_BEATS } from "../src/lib/rexonance-resonance.js";
import {
  META_UNITAS_BOOST_BEATS,
  META_UNITAS_BOOST_BUDGET,
  metaUnitasBoostGroups,
  metaUnitasBoostTier,
  metaUnitasBoostWindow,
} from "../src/lib/meta-unitas-boost.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const boost = read("src/lib/meta-unitas-boost.ts");

test("the boost's beats are the shared engine's", () => {
  for (const [key, value] of Object.entries(META_UNITAS_BOOST_BEATS))
    assert.deepEqual(value, ASSEMBLY_BEATS[key], key);
  // The engine's beatWindow, restated: four DEUS！ quarters, REXONANCE！,
  // then the helmet up to just before the clamp.
  const [d0, d1] = ASSEMBLY_BEATS.deus;
  assert.deepEqual(metaUnitasBoostWindow(0), [d0, d0 + (d1 - d0) / 4]);
  assert.deepEqual(metaUnitasBoostWindow(4), ASSEMBLY_BEATS.rexonance);
  assert.deepEqual(metaUnitasBoostWindow(5), [
    ASSEMBLY_BEATS.rexonance[0] + 0.06,
    ASSEMBLY_BEATS.clamp - 0.012,
  ]);
});

test("every beat has the suit's real seams to trace", () => {
  const groups = metaUnitasBoostGroups();
  assert.equal(groups.length, 6);
  for (const group of groups) {
    assert.ok(group.loops.length > 0, `beat ${group.beat} has seams`);
    for (const loop of group.loops) assert.ok(loop.length > 0);
  }
  // Bottom up: the legs below the chest, the helmet on top.
  assert.ok(groups[0].cy > groups[2].cy && groups[2].cy > groups[5].cy);
});

test("explicit lightweight choice scales budgets; pointer capability selects high or touch", () => {
  const order = ["high", "touch", "lite"];
  for (const key of ["swarm", "shards", "sparks", "pixels"])
    for (let i = 1; i < order.length; i += 1)
      assert.ok(
        META_UNITAS_BOOST_BUDGET[order[i - 1]][key] > META_UNITAS_BOOST_BUDGET[order[i]][key],
        `${key}: ${order[i - 1]} > ${order[i]}`,
      );
  const env = (navigator, coarse) => ({ navigator, matchMedia: () => ({ matches: coarse }) });
  const galaxy = {
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/130 Mobile",
    maxTouchPoints: 5,
    deviceMemory: 4,
    hardwareConcurrency: 8,
  };
  assert.equal(metaUnitasBoostTier(env(galaxy, true)), "touch");
  assert.equal(metaUnitasBoostTier(env({ ...galaxy, hardwareConcurrency: 4, deviceMemory: 2 }, true)), "touch");
  assert.equal(
    metaUnitasBoostTier(
      env({ userAgent: "Mozilla/5.0 (Macintosh)", hardwareConcurrency: 10 }, false),
    ),
    "high",
  );
});

test("flashes: one large glow a second, never red or white full-screen; finite", () => {
  assert.match(boost, /now - lastBig >= 1000/);
  assert.doesNotMatch(boost, /\[255, 0, 0\]|rgb\(255 0 0|#f00\b/i);
  assert.doesNotMatch(boost, /fillRect\(0, 0, cssW, cssH\)/);
  // It sleeps when the scroll rests and the effects die, and never draws
  // without the live engine (the still tiers never mount it).
  assert.match(boost, /const sleepOrContinue/);
  assert.match(boost, /runway\.dataset\.rznState === "live"/);
});

test("the shared engines are only imported, never forked", () => {
  assert.doesNotMatch(boost, /from "\.\/rexonance-resonance\.js"/);
  const engine = read("src/lib/meta-unitas-rx-engine.ts");
  assert.match(engine, /options\.eager \? null : mountMetaUnitasBoost\(runway, environment\)/);
  const entry = read("src/components/meta-unitas-saga/meta-unitas-entry-sequence.tsx");
  assert.match(entry, /mountMetaUnitasBoost\(runway, window, \{ entry: true \}\)/);
});
