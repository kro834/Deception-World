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
  createLabUrlWriter,
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

test("a seek drag stays under WebKit's 100 replaceState per 10 s flood guard", () => {
  // WebKit throws SecurityError past 100 writes in 10 s; a thrown effect put
  // the route's load-error page over the lab mid-transformation.
  let now = 0;
  const timers = [];
  const writes = [];
  const history = {
    state: { key: 1 },
    replaceState(state, _unused, url) {
      const recent = writes.filter((at) => at > now - 10000).length;
      if (recent >= 100) throw new Error("SecurityError");
      writes.push(now);
      this.last = url;
    },
  };
  const writer = createLabUrlWriter(history, {
    schedule: (fn, delay) => timers.push({ at: now + delay, fn }) && timers.length,
    cancel: (id) => {
      if (timers[id - 1]) timers[id - 1].fn = () => {};
    },
  });
  const advance = (ms) => {
    const end = now + ms;
    for (; now < end; now += 1)
      for (const timer of timers) if (timer.at === now) timer.fn();
  };
  // 10 s of a 120 Hz drag.
  for (let i = 0; i < 1200; i++) {
    writer.write(`?at=${(i / 1200).toFixed(4)}`);
    advance(8);
  }
  advance(1000);
  assert.ok(writes.length > 0 && writes.length < 100, `wrote ${writes.length} times`);
  assert.equal(history.last, "?at=0.9992", "the last scrub position lands");
  writer.write("?at=0.5");
  writer.cancel();
  advance(1000);
  assert.equal(history.last, "?at=0.9992", "a cancelled write never lands after leaving");
});

test("the lab writes its URL through the throttled writer, never per input", () => {
  const source = readFileSync(
    new URL("../src/components/transformation-lab/transformation-lab.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /createLabUrlWriter\(window\.history\)/);
  assert.doesNotMatch(source, /window\.history\.replaceState/);
});
