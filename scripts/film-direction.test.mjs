import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
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
    querySelector: (selector) =>
      selector === ".film-boundary-line" || scan ? { animate } : null,
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

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("film theme is delivered after the addon without changing special-route ordering", () => {
  const head = read("src/lib/world-head.ts");
  assert.match(head, /styles-film-direction\.css\?url/);
  assert.ok(
    head.indexOf("WORLD_ADDON_STYLESHEET_LINK,") <
      head.indexOf('{ rel: "stylesheet", href: filmDirectionCssUrl }'),
  );
});

test("poster autoplay pauses for overlays, decodes the next image and preserves failed frames", () => {
  const home = read("src/components/world/world-home.tsx");
  const effect = home.slice(
    home.indexOf("let cancelled = false;\n    let decoding = false;"),
    home.indexOf("const pauseInfiniteAnimations"),
  );
  assert.match(
    home,
    /if \(sideMenuOpen \|\| pickupOpen \|\| episodePickup !== null \|\| shuffling\) return/,
  );
  assert.match(effect, /await image\.decode\(\)/);
  assert.match(effect, /if \(cancelled \|\| image\.naturalWidth === 0/);
  assert.match(effect, /document\.querySelector\("dialog\[open\]"\)/);
  assert.match(effect, /cancelled = true/);
  assert.match(effect, /clearInterval\(t\)/);
  assert.match(home, /POSTERS\[\(poster \+ 1\) % POSTERS\.length\]\.src/);
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
