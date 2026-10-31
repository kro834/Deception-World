import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseLabState,
  labSearch,
  advanceLab,
  LAB_RIDERS,
  LAB_ZOOMS,
  LAB_BEATS,
  LAB_FORMS,
} from "../src/lib/transformation-lab-state.js";

test("lab URL round trips all riders and zooms with a paused exact comparison beat", () => {
  for (const rider of LAB_RIDERS)
    for (const zoom of LAB_ZOOMS) {
      const state = {
        rider,
        compare: "far-from",
        zoom,
        speed: 0.25,
        progress: 0.82,
        form: "standard",
        compareForm: "ultra",
        loop: true,
      };
      assert.deepEqual(parseLabState(labSearch(state)), state);
    }
});
test("malformed and stale links safely constrain every transport input", () => {
  assert.deepEqual(
    parseLabState("?rider=bad&compare=bad&at=Infinity&zoom=bad&speed=-1"),
    parseLabState(""),
  );
  assert.equal(parseLabState("?at=12").progress, 1);
  assert.equal(parseLabState("?at=-2").progress, 0);
  assert.equal(parseLabState("?at=NaN").progress, 0);
});
test("transport reverses symmetrically and stops exactly at endpoints", () => {
  for (const speed of [0.25, 0.5, 1, 1.5, 2]) {
    const forward = advanceLab(0.4, 50, speed, 1);
    assert.ok(Math.abs(advanceLab(forward, 50, speed, -1) - 0.4) < 1e-12);
  }
  assert.equal(advanceLab(0.999, 100, 2, 1), 1);
  assert.equal(advanceLab(0.001, 100, 2, -1), 0);
  assert.equal(advanceLab(0.5, 30000, 1, 1), advanceLab(0.5, 100, 1, 1));
});
test("transport beats are ordered and span the complete established assembly", () => {
  assert.equal(LAB_BEATS[0].at, 0);
  assert.equal(LAB_BEATS.at(-1).at, 1);
  LAB_BEATS.slice(1).forEach((beat, i) => assert.ok(beat.at > LAB_BEATS[i].at));
});
test("direct playhead is opt in and cannot run the scroll spring or resting fire clock", () => {
  const engine = readFileSync(
    new URL("../src/lib/rexonance-resonance.js", import.meta.url),
    "utf8",
  );
  assert.match(engine, /if \(lastProgress >= 0 && !config.directProgress\)/);
  assert.match(engine, /const flameClock =\s*config.directProgress\s*\? progress \* 12/);
  assert.match(engine, /if \(config.directProgress\) return;\s*\/\/ Resting with the fire/);
});

test("all supported forms survive URL restoration, including same-rider comparison", () => {
  for (const rider of LAB_RIDERS)
    for (const [form] of LAB_FORMS[rider]) {
      const state = {
        ...parseLabState(""),
        rider,
        form,
        compare: rider,
        compareForm: "ultra",
        progress: 0.945,
      };
      assert.deepEqual(parseLabState(labSearch(state)), state);
    }
  assert.equal(parseLabState("?rider=meta-unitas&form=excelsior").form, "standard");
});
test("direct playback keeps deterministic field and particles while ordinary scroll keeps visit seed", () => {
  const engine = readFileSync(
    new URL("../src/lib/rexonance-resonance.js", import.meta.url),
    "utf8",
  );
  assert.match(engine, /config.directProgress \? 20261031 : fieldLib.fieldVisitSeed/);
  assert.match(engine, /draw\(shown, false, config.directProgress \? 0 : step\)/);
  assert.match(engine, /config.directProgress \|\| coarse.matches/);
});
