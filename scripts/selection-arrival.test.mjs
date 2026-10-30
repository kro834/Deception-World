import test from "node:test";
import assert from "node:assert/strict";
import { animateSelectionArrival } from "../src/lib/selection-arrival.js";

function fixture({ reduce = false, economy = false, hidden = false, offscreen = false } = {}) {
  const media = Object.assign(new EventTarget(), { matches: reduce });
  let disconnects = 0;
  const observers = [];
  const view = {
    innerHeight: 800,
    matchMedia: () => media,
    MutationObserver: class {
      constructor(callback) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {
        disconnects++;
      }
    },
  };
  const doc = Object.assign(new EventTarget(), {
    hidden,
    defaultView: view,
    documentElement: { getAttribute: () => (economy ? "economy" : null) },
  });
  const runs = [];
  const cards = Array.from({ length: 12 }, () => ({
    animate(frames, options) {
      const run = {
        frames,
        options,
        canceled: 0,
        cancel() {
          this.canceled++;
        },
      };
      runs.push(run);
      return run;
    },
  }));
  const panel = Object.assign(new EventTarget(), {
    ownerDocument: doc,
    animate() {},
    children: cards,
    getBoundingClientRect: () => ({ top: offscreen ? 900 : 100, bottom: 600 }),
    querySelectorAll: () => cards,
  });
  return { panel, media, doc, runs, observers, disconnects: () => disconnects };
}

test("selection direction/stagger is bounded and keyboard focus immediately settles cards", () => {
  const f = fixture();
  const stop = animateSelectionArrival(f.panel, -1);
  assert.equal(f.runs.length, 8);
  assert.match(f.runs[0].frames[0].transform, /-36px/);
  assert.equal(f.runs[7].options.delay, 294);
  f.panel.dispatchEvent(new Event("focusin"));
  assert.ok(f.runs.every((r) => r.canceled === 1));
  stop();
  assert.equal(f.disconnects(), 1);
  const count = f.runs[0].canceled;
  f.panel.dispatchEvent(new Event("focusin"));
  assert.equal(f.runs[0].canceled, count);
});

test("reduced motion, economy, hidden and offscreen panels never allocate animations", () => {
  for (const option of [
    { reduce: true },
    { economy: true },
    { hidden: true },
    { offscreen: true },
  ]) {
    const f = fixture(option);
    animateSelectionArrival(f.panel)();
    assert.equal(f.runs.length, 0);
  }
  animateSelectionArrival(null)();
});

test("a running selection cancels on motion-policy change and hidden document", () => {
  for (const policy of ["reduce", "hidden"]) {
    const f = fixture();
    const stop = animateSelectionArrival(f.panel);
    if (policy === "reduce") {
      f.media.matches = true;
      f.media.dispatchEvent(new Event("change"));
    } else {
      f.doc.hidden = true;
      f.doc.dispatchEvent(new Event("visibilitychange"));
    }
    assert.ok(f.runs.every((r) => r.canceled === 1));
    stop();
  }
});
