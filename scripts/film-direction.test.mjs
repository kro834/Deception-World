import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { mountFilmMotion } from "../src/lib/film-motion.js";

function fixture({ reduced = false, economy = false, hidden = false, scan = false } = {}) {
  const events = new Map(),
    mediaEvents = new Map();
  const document = {
    hidden,
    documentElement: { dataset: economy ? { worldEffects: "economy" } : {} },
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const media = {
    matches: reduced,
    addEventListener: (name, fn) => mediaEvents.set(name, fn),
    removeEventListener: (name) => mediaEvents.delete(name),
  };
  const animations = [];
  const animate = (frames, timing) => {
    const animation = {
      frames,
      timing,
      cancelled: false,
      finished: new Promise(() => {}),
      cancel() {
        this.cancelled = true;
      },
    };
    animations.push(animation);
    return animation;
  };
  const node = {
    animate,
    querySelector: (selector) => (selector === ".film-boundary-line" || scan ? { animate } : null),
  };
  const root = { ownerDocument: document, querySelectorAll: () => [node] };
  const observers = [];
  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.observed = new Set();
      observers.push(this);
    }
    observe(node) {
      this.observed.add(node);
    }
    unobserve(node) {
      this.observed.delete(node);
    }
    disconnect() {
      this.observed.clear();
    }
  }
  const cleanup = mountFilmMotion(root, {
    matchMedia: () => media,
    IntersectionObserver: Observer,
  });
  return {
    cleanup,
    document,
    node,
    events,
    mediaEvents,
    media,
    animations,
    get observer() {
      return observers[0];
    },
  };
}

test("film motion is progressive and makes no observer for reduced motion or economy mode", () => {
  for (const options of [{ reduced: true }, { economy: true }]) {
    const f = fixture(options);
    assert.equal(f.observer, undefined);
    assert.equal(f.animations.length, 0);
    f.cleanup();
  }
  assert.doesNotThrow(mountFilmMotion(null));
});

test("chapter entrance and boundary cut run once, with finite compositor-only keyframes", () => {
  const f = fixture();
  f.observer.callback([{ target: f.node, isIntersecting: false }]);
  assert.equal(f.animations.length, 0);
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  assert.equal(f.animations.length, 2);
  assert.equal(f.observer.observed.size, 0);
  for (const animation of f.animations) {
    assert.ok(animation.timing.duration <= 700);
    assert.equal(animation.timing.iterations, undefined);
    for (const frame of animation.frames)
      assert.ok(Object.keys(frame).every((key) => ["transform", "opacity"].includes(key)));
  }
  f.cleanup();
  assert.ok(f.animations.every((animation) => animation.cancelled));
  assert.equal(f.events.size + f.mediaEvents.size, 0);
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  assert.equal(f.animations.length, 2);
});

test("background entry remains pending until the tab is visible", () => {
  const f = fixture({ hidden: true });
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  assert.equal(f.animations.length, 0);
  assert.equal(f.observer.observed.has(f.node), true);
  f.document.hidden = false;
  f.events.get("visibilitychange")();
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  assert.equal(f.animations.length, 2);
  f.document.hidden = true;
  f.events.get("visibilitychange")();
  assert.ok(f.animations.every((animation) => animation.cancelled));
  f.cleanup();
});

test("heading light scan is one-shot, readable and cancelled on route cleanup", () => {
  const f = fixture({ scan: true });
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  assert.equal(f.animations.length, 3);
  assert.ok(f.animations[0].frames[0].opacity >= 0.8);
  for (const animation of f.animations) {
    assert.ok(animation.timing.duration <= 700);
    assert.equal(animation.timing.iterations, undefined);
    for (const frame of animation.frames)
      assert.ok(Object.keys(frame).every((key) => ["transform", "opacity"].includes(key)));
  }
  f.cleanup();
  assert.ok(f.animations.every((animation) => animation.cancelled));
});

test("changing motion preference cancels active animation and detaches the observer", () => {
  const f = fixture();
  f.observer.callback([{ target: f.node, isIntersecting: true }]);
  f.media.matches = true;
  f.mediaEvents.get("change")();
  assert.ok(f.animations.every((animation) => animation.cancelled));
  assert.equal(f.observer.observed.size, 0);
  f.cleanup();
});

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
test("film theme is delivered after the addon without changing special-route ordering", () => {
  const head = read("src/lib/world-head.ts");
  assert.match(head, /styles-film-direction\.css\?url/);
  assert.ok(
    head.indexOf("WORLD_ADDON_STYLESHEET_LINK,") <
      head.indexOf('{ rel: "stylesheet", href: filmDirectionCssUrl }'),
  );
});

test("poster autoplay pauses for overlays, decodes the next image and preserves failed frames", async () => {
  const home = read("src/components/world/world-home.tsx");
  const start = home.indexOf(
    "  useEffect(() => {\n    if (locked || ambientPaused || motionReduced",
  );
  const effect = home.slice(start, home.indexOf("\n\n  useEffect(", start + 1));
  const { outputText } = ts.transpileModule(effect, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const calls = [];
  const timers = new Map();
  let cleanup;
  let timerId = 0;
  let settleWarmup;
  let dialog = false;
  const queueTimer = (callback, delay) => {
    timers.set(delay, callback);
    return ++timerId;
  };
  const focused = { current: false };
  runInNewContext(outputText, {
    useEffect: (callback) => {
      cleanup = callback();
    },
    locked: false,
    ambientPaused: false,
    motionReduced: false,
    heroVisible: true,
    heroInViewRef: { current: true },
    posterControlsFocused: false,
    posterControlsFocusedRef: focused,
    posterResetting: false,
    posterFailure: null,
    sideMenuOpen: false,
    pickupOpen: false,
    episodePickup: null,
    shuffling: false,
    shuffleActive: { current: false },
    poster: 0,
    POSTERS: [0, 1],
    document: { hidden: false, querySelector: (selector) => selector === "dialog[open]" && dialog },
    navigator: {},
    loadPoster: (next, priority) => {
      calls.push(["warm", next, priority]);
      return new Promise((resolve) => {
        settleWarmup = resolve;
      });
    },
    goPoster: async (next, { canShow }) => {
      calls.push(["show", next, canShow]);
    },
    window: {
      setTimeout: queueTimer,
      setInterval: queueTimer,
      clearTimeout: (id) => {
        assert.equal(id, 1);
        timers.delete(2400);
      },
      clearInterval: (id) => {
        assert.equal(id, 2);
        timers.delete(5200);
      },
    },
  });

  focused.current = true;
  timers.get(2400)();
  await timers.get(5200)();
  assert.deepEqual(calls, [], "focus blocks both speculative warmup and rotation");

  focused.current = false;
  dialog = true;
  timers.get(2400)();
  await timers.get(5200)();
  assert.deepEqual(calls, [], "an open overlay blocks both timers");

  dialog = false;
  timers.get(2400)();
  const failed = timers.get(5200)();
  assert.deepEqual(calls, [["warm", 1, "low"]]);
  settleWarmup(false);
  await failed;
  assert.equal(calls.length, 1, "a failed warmup cannot replace the decoded frame");

  timers.get(2400)();
  const next = timers.get(5200)();
  settleWarmup(true);
  await next;
  assert.deepEqual(
    calls.map(([action, index]) => [action, index]),
    [
      ["warm", 1],
      ["warm", 1],
      ["show", 1],
    ],
  );
  const canShow = calls.at(-1)[2];
  assert.equal(canShow(), true);
  focused.current = true;
  assert.equal(canShow(), false, "focus acquired during mounted decode blocks the commit");
  focused.current = false;
  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(canShow(), false, "cleanup also invalidates pending decode completion");

  assert.match(
    home,
    /if \(sideMenuOpen \|\| pickupOpen \|\| episodePickup !== null \|\| shuffling\) return/,
  );
  assert.doesNotMatch(home, /RETURNING SIGNAL/);
});

test("hero identity is before the key visual and new typography remains touch-scrollable", () => {
  const home = read("src/components/world/world-home.tsx");
  assert.ok(home.indexOf('className="film-hero-identity"') < home.indexOf('id="poster-stage"'));
  const css = read("src/styles-film-direction.css");
  assert.match(css, /grid-template-areas: "identity" "visual" "copy"/);
  assert.doesNotMatch(css, /touch-action:\s*none|animation:[^;]*infinite|height:\s*100vh/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  const scan = read("src/components/cinematic/film-text-scan.tsx");
  assert.match(scan, /aria-hidden="true"/);
  assert.doesNotMatch(scan, /onTouch|onPointer|tabIndex/);
  assert.match(css, /\.film-text-scan > i\s*\{[^}]*pointer-events: none/);
});
