import assert from "node:assert/strict";
import test from "node:test";
import {
  mountRexonanceReadingPosition,
  rexonanceMoviePlaying,
  rexonanceReadingAnchor,
  rexonanceReadingOffset,
} from "../src/lib/rexonance-reading-position.ts";

/** A page whose runway moves when the window turns, under stub globals. */
function rotatingPage({ movieState = null } = {}) {
  const saved = {};
  const globals = {
    innerWidth: 390,
    innerHeight: 844,
    scrollY: 9000,
    visualViewport: { scale: 1 },
  };
  const listeners = new Map();
  const frames = [];
  const scrolls = [];
  let runwayTop = 8000;
  const section = (id, top, height) => ({
    id,
    get offsetHeight() {
      return height();
    },
    getBoundingClientRect: () => ({ top: top() - globals.scrollY }),
  });
  const sections = [
    section("assembly", () => runwayTop - 700, () => 700),
    section("assembly-runway", () => runwayTop, () => 3000),
  ];
  const control = { dataset: { state: movieState ?? "idle" } };
  const page = {
    querySelectorAll: () => sections,
    querySelector: (selector) =>
      selector === '.rzn-movie[data-state="playing"]' && control.dataset.state === "playing" ? control : null,
  };
  const stubs = {
    ...globals,
    requestAnimationFrame: (callback) => frames.push(callback),
    cancelAnimationFrame: () => {},
    scrollTo: ({ top }) => {
      scrolls.push(top);
      stubs.scrollY = top;
    },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  for (const [key, value] of Object.entries(stubs)) {
    saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {
      configurable: true,
      get: () => (key in globals ? globals[key] : stubs[key]),
      set: (next) => {
        if (key in globals) globals[key] = next;
        else stubs[key] = next;
      },
    });
  }
  saved.window = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
  const restore = () => {
    for (const [key, descriptor] of Object.entries(saved))
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
  };
  return {
    page,
    control,
    globals,
    scrolls,
    listeners,
    restore,
    /** The window turns: wider, the runway higher up. */
    rotate() {
      globals.innerWidth = 844;
      globals.innerHeight = 390;
      runwayTop = 6000;
      listeners.get("resize")?.();
    },
    flushFrames() {
      for (let k = 0; k < 4 && frames.length; k += 1) frames.splice(0).forEach((frame) => frame(0));
    },
  };
}

test("a turned window keeps the reader's place in the suit-up — unless the auto transformation movie plays, which keeps it itself", () => {
  for (const movieState of ["idle", "paused", "playing"]) {
    const t = rotatingPage({ movieState });
    try {
      const dispose = mountRexonanceReadingPosition(t.page);
      t.rotate();
      t.flushFrames();
      if (movieState === "playing")
        assert.deepEqual(t.scrolls, [], "the movie places the page each frame: no restore under it");
      else assert.equal(t.scrolls.length, 1, `${movieState}: the place is restored`);
      dispose();
    } finally {
      t.restore();
    }
  }
  assert.equal(rexonanceMoviePlaying({ querySelector: () => null }), false);
});

test("orientation restores the suit-up fraction, not portrait pixels", () => {
  const portrait = [
    { id: "assembly", top: 8000, span: 700 },
    { id: "assembly-runway", top: 8700, span: 2200 },
    { id: "stages", top: 11700, span: 2000 },
  ];
  const landscape = [
    { id: "assembly", top: 6000, span: 500 },
    { id: "assembly-runway", top: 6500, span: 1800 },
    { id: "stages", top: 8700, span: 1500 },
  ];
  const anchor = rexonanceReadingAnchor(portrait, 9690);
  assert.deepEqual(anchor, { id: "assembly-runway", fraction: 0.45 });
  assert.equal(rexonanceReadingOffset(landscape, anchor), 7310);
});
test("reading anchors clamp gaps and tolerate a removed chapter", () => {
  const segments = [{ id: "performance", top: 100, span: 200 }];
  assert.equal(rexonanceReadingAnchor(segments, 0), null);
  assert.deepEqual(rexonanceReadingAnchor(segments, 500), { id: "performance", fraction: 1 });
  assert.equal(rexonanceReadingOffset([], { id: "removed", fraction: 0.5 }), null);
});
