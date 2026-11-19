import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultStringifySearch } from "@tanstack/react-router";
import { guardedHref } from "../src/lib/guarded-href.ts";
import {
  assemblyComparisonSearch,
  parseLabState,
  labSearch,
  advanceLab,
  LAB_RIDERS,
  LAB_ZOOMS,
  LAB_BEATS,
  LAB_FORMS,
  createLabUrlWriter,
} from "../src/lib/transformation-lab-state.js";

test("both assembly comparison links keep the selected form and beat on native and client navigation", () => {
  for (const [rider, compare] of [["rexonance", "far-from"], ["far-from", "rexonance"]]) {
    const query = assemblyComparisonSearch(rider, "ultra");
    const native = new URL(guardedHref("/transformation-lab", undefined, query), "https://example.test");
    for (const search of [native.search, defaultStringifySearch(query)]) {
      const state = parseLabState(search);
      assert.equal(state.rider, rider);
      assert.equal(state.form, "ultra");
      assert.equal(state.compare, compare);
      assert.equal(state.progress, 0.41);
    }
  }
});

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
  assert.match(engine, /if \(lastProgress >= 0 && !config.directProgress && filmProgress === null\)/);
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

// Owner (2026-11-20): 「サイトも大きく改善します」 — the lab's choices are its own
// pressed buttons (no bare OS select), its bar stands in the site's lane, and
// a visit that asks for no moment opens on the suit-up, played once.
test("the lab chooses by its own buttons, in the site's bar lane, and opens on the suit-up", () => {
  const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const lab = read("components/transformation-lab/transformation-lab.tsx");
  assert.doesNotMatch(lab, /<select\b/);
  for (const label of ["ライダー", "フォーム", "同じ瞬間を比較", "比較フォーム", "速度"])
    assert.ok(lab.includes(`label="${label}"`), `${label} keeps its name`);
  assert.match(lab, /\["", "比較しない"\]/);
  // Play and the playhead stand directly under the stage.
  assert.ok(lab.indexOf('className="lab-controls"') < lab.indexOf('className="lab-zoom"'));
  // The opening play: only with no `at` and no comparison asked for, never
  // under reduced motion or on an economy device, never after the reader's hand.
  assert.match(
    lab,
    /opening\.current =\s*!asked\.has\("at"\) &&\s*!asked\.has\("compare"\) &&\s*!matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches &&\s*root\.dataset\.worldEffects !== "economy" &&\s*!\("rznConstrained" in root\.dataset\);/,
  );
  assert.match(lab, /if \(!ready \|\| !opening\.current\) return;\s*opening\.current = false;/);
  assert.match(lab, /leave\.cancel\(\);\s*opening\.current = false;\s*setPlaying\(false\);/);
  const sheet = read("styles-transformation-lab.css");
  assert.match(sheet, /\.lab-topbar \{[^}]*min-height: calc\(var\(--sh-bar-h, 76px\) \+ env\(safe-area-inset-top, 0px\)\);/);
  assert.match(sheet, /--lab-pad: var\(--sh-gutter, clamp\(16px, 4vw, 72px\)\);/);
  assert.match(sheet, /\.lab-topbar > \.side-panel-trigger \{[^}]*width: 48px;[^}]*height: 48px;/);
  // The stage's light leaves as the armour arrives; the scene is not touched.
  assert.match(sheet, /\.lab-stage::before \{[^}]*opacity: clamp\(0, calc\(1 - var\(--lab-progress, 0\) \* 1\.5\), 1\);/);
});
