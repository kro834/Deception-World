import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/record-arrival.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function setup({ reduce = false, economy = false, interactive = false } = {}) {
  const frames = new Map();
  const timers = new Map();
  const listeners = new Map();
  const attributes = new Set();
  const blurs = [];
  const dataset = {};
  let serial = 0;
  let focused = 0;
  let dialog = false;
  let visible = true;
  let observer;
  const target = {
    dataset,
    getClientRects: () => (visible ? [{}] : []),
    closest: () => null,
    matches: () => interactive,
    set tabIndex(value) {
      assert.equal(value, -1);
      attributes.add("tabindex");
    },
    removeAttribute(name) {
      attributes.delete(name);
      if (name.startsWith("data-"))
        delete dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    },
    addEventListener(name, callback, options) {
      assert.equal(name, "blur");
      assert.equal(options.once, true);
      blurs.push(callback);
    },
    focus(options) {
      assert.equal(options.preventScroll, true);
      focused++;
    },
  };
  const root = {
    dataset: { worldEffects: economy ? "economy" : "full" },
    hasAttribute: (name) => attributes.has(name),
  };
  const window = {
    location: { pathname: "/search", hash: "" },
    requestAnimationFrame(callback) {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(callback, delay) {
      timers.set(++serial, { callback, delay });
      return serial;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    matchMedia: () => ({ matches: reduce }),
  };
  const document = {
    documentElement: root,
    body: {},
    getElementById: (id) => (id === "dream-roster-lupin" ? target : null),
    querySelector: () => (dialog ? {} : null),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  function Observer(callback) {
    const instance = {
      callback,
      active: true,
      observe() {},
      disconnect() {
        instance.active = false;
      },
    };
    observer = instance;
    return instance;
  }
  const exports = {};
  vm.runInNewContext(compiled, { exports, window, document, MutationObserver: Observer });
  return {
    watch: () => exports.watchRecordArrival("/dream-chapter", "dream-roster-lupin"),
    frames,
    timers,
    listeners,
    attributes,
    dataset,
    root,
    window,
    active: () => observer.active,
    focused: () => focused,
    navigate() {
      window.location.pathname = "/dream-chapter";
      window.location.hash = "#dream-roster-lupin";
      observer.callback();
    },
    change() {
      observer.callback();
    },
    flush() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
    expire(delay) {
      for (const [id, timer] of [...timers])
        if (timer.delay === delay) {
          timers.delete(id);
          timer.callback();
        }
    },
    blur() {
      blurs.forEach((callback) => callback());
    },
    dialog() {
      dialog = true;
    },
    invisible() {
      visible = false;
    },
  };
}

test("search/library arrival waits for the route cover and focuses without scrolling", () => {
  const h = setup();
  h.watch();
  h.flush();
  assert.equal(h.focused(), 0);
  h.attributes.add("data-route-cover");
  h.navigate();
  h.flush();
  assert.equal(h.focused(), 0);
  h.attributes.delete("data-route-cover");
  h.change();
  h.flush();
  assert.equal(h.focused(), 1);
  assert.equal(h.dataset.routeFocus, "true");
  assert.equal(h.dataset.skipMark, "true");
  // Owner (2026-10-21): the landing ring (data-record-landing, styles-record-landing.css) holds 6s beside the 2.4s cue.
  assert.equal(h.dataset.recordLanding, "live");
  assert.equal(h.active(), false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.listeners.size, 0);
  assert.deepEqual(
    [...h.timers.values()].map((timer) => timer.delay),
    [2400, 6000],
  );
  h.blur();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.dataset, {});
  assert.equal(h.attributes.has("tabindex"), false);
});

test("arrival cue expires while keyboard destination remains until blur", () => {
  const h = setup();
  h.watch();
  h.navigate();
  h.flush();
  h.expire(2400);
  assert.equal(h.dataset.skipMark, undefined);
  assert.equal(h.dataset.routeFocus, "true");
  // Owner (2026-10-21): the landing ring outlasts the brief cue, then goes on its own.
  assert.equal(h.dataset.recordLanding, "live");
  h.expire(6000);
  assert.equal(h.dataset.recordLanding, undefined);
  assert.equal(h.dataset.routeFocus, "true");
  h.blur();
  assert.equal(h.dataset.routeFocus, undefined);
});

test("interactive targets keep their existing tabindex, and reduced/economy modes omit motion", () => {
  for (const options of [{ reduce: true }, { economy: true }]) {
    const h = setup({ ...options, interactive: true });
    h.attributes.add("tabindex");
    h.watch();
    h.navigate();
    h.flush();
    assert.equal(h.focused(), 1);
    assert.equal(h.dataset.skipMark, undefined);
    // Owner (2026-10-21): reduced motion and economy keep a still landing ring (no lock-on animation).
    assert.equal(h.dataset.recordLanding, "still");
    assert.equal(h.dataset.routeFocus, undefined);
    h.blur();
    assert.equal(h.dataset.recordLanding, undefined);
    assert.equal(h.attributes.has("tabindex"), true);
  }
});

test("dialog, user input, timeout and cancellation never steal focus or leave observers", () => {
  for (const mode of [
    "dialog",
    "pointerdown",
    "wheel",
    "keydown",
    "timeout",
    "cancel",
    "malformed",
  ]) {
    const h = setup();
    const stop = h.watch();
    if (mode === "dialog") {
      h.dialog();
      h.navigate();
    } else if (mode === "timeout") h.expire(15000);
    else if (mode === "cancel") stop();
    else if (mode === "malformed") {
      h.navigate();
      h.window.location.hash = "#%E0%A4%A";
    } else h.listeners.get(mode)();
    h.flush();
    assert.equal(h.focused(), 0, mode);
    assert.equal(h.active(), false, mode);
    assert.equal(h.frames.size, 0, mode);
    assert.equal(h.timers.size, 0, mode);
    assert.equal(h.listeners.size, 0, mode);
  }
});

test("a hidden destination stays pending only until the bounded deadline", () => {
  const h = setup();
  h.invisible();
  h.watch();
  h.navigate();
  h.flush();
  assert.equal(h.focused(), 0);
  assert.equal(h.active(), true);
  h.expire(15000);
  assert.equal(h.active(), false);
  assert.equal(h.listeners.size, 0);
});

test("the landing reticle is decorative, follows its anchor and leaves with the ring", () => {
  const source = readFileSync(new URL("../src/lib/record-arrival.ts", import.meta.url), "utf8");
  // Its own fixed layer: hidden from assistive tech, never in the way of a pointer.
  assert.match(source, /layer\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(source, /pointer-events:none/);
  // Unstyled until the sheet applies: invisible rather than raw text.
  assert.match(source, /opacity:var\(--record-landing-visible,0\)/);
  // Forced colours keep the element's own Highlight ring instead.
  assert.match(source, /matchMedia\("\(forced-colors: active\)"\)\.matches/);
  // A tall destination is marked at its first heading on screen.
  // Owner (2026-10-22): "on screen" is the band between the top chrome and the foot plates.
  assert.match(source, /function anchorOf\(target: HTMLElement, top = 0, foot = 0\)/);
  // Hold and blur both release it; a newer arrival releases the old one.
  assert.match(source, /target\.removeAttribute\("data-record-landing"\);\s*release\?\.\(\);/);
  assert.match(source, /window\.clearTimeout\(hold\);\s*release\?\.\(\);/);
  assert.match(source, /cancelPending\?\.\(\);\s*releaseReticle\?\.\(\);/);
});

test("the landing sheet keeps the 12px floor, gated finite motion and forced colours", () => {
  const css = readFileSync(new URL("../src/styles-record-landing.css", import.meta.url), "utf8");
  for (const [, size] of css.matchAll(/font:\s*(?:\d+\s+)?([\d.]+)px/g))
    assert.ok(Number(size) >= 12, `font ${size}px`);
  let outside = css;
  for (let at = outside.indexOf("@media (prefers-reduced-motion: no-preference)"); at >= 0; ) {
    let depth = 0;
    let end = outside.indexOf("{", at);
    for (; end < outside.length; end += 1) {
      if (outside[end] === "{") depth += 1;
      else if (outside[end] === "}" && --depth === 0) break;
    }
    const block = outside.slice(at, end + 1);
    assert.match(block, /html:not\(\[data-world-effects="economy"\]\)/);
    assert.doesNotMatch(block, /infinite/);
    outside = outside.slice(0, at) + outside.slice(end + 1);
    at = outside.indexOf("@media (prefers-reduced-motion: no-preference)");
  }
  assert.doesNotMatch(outside, /\banimation\s*:\s*record-/, "ungated motion");
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.record-landing-layer\s*\{\s*display: none;/);
});

test("the reticle keeps clear of the plates docked at the foot and of the words around it", () => {
  const source = readFileSync(new URL("../src/lib/record-arrival.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles-record-landing.css", import.meta.url), "utf8");
  // A heading behind the way-back or guide plate is no landing: the band
  // ends at the plates, and the layer is clipped above them.
  assert.match(source, /function chromeFoot\(\)/);
  assert.match(source, /box\.bottom <= window\.innerHeight - foot/);
  assert.match(source, /clipPath = clip \|\| foot \? `inset\(\$\{clip\}px 0 \$\{foot\}px 0\)`/);
  // The on-screen frame stops above the plates too.
  assert.match(source, /Math\.min\(box\.bottom, window\.innerHeight - foot - 14\)/);
  // The tag takes the first free place: on the top line, beside, below.
  assert.match(source, /\["above", at\(left \+ 20, top - half\)\]/);
  assert.match(source, /\["side", at\(right \+ 12, top\)\]/);
  assert.match(source, /\["below", at\(left \+ 20, bottom - half\)\]/);
  assert.match(css, /\[data-tag="side"\] > \.record-landing-tag \{[^}]*left: calc\(100% \+ 12px\)/);
  // The still tier's tag also leaves after three seconds, by opacity alone.
  assert.match(source, /const TAG_HOLD_MS = 3200;/);
  assert.match(source, /tag\.dataset\.faded = "true"/);
  assert.match(source, /window\.clearTimeout\(fadeTag\)/);
  const still = /\.record-landing-layer\[data-mode="still"\] \.record-landing-tag\[data-faded\] \{([^}]*)\}/.exec(css);
  assert.ok(still, "still tag fade");
  assert.match(still[1], /opacity: 0;/);
  assert.doesNotMatch(still[1], /transform|translate|animation/);
  // A frame round a whole screenful draws no floor and no sweep.
  assert.match(css, /\.record-landing-reticle\[data-whole\] > \.record-landing-scan \{\s*display: none;/);
});

test("the reticle's tag never covers the page's words: the code alone, inside the corner, or out", () => {
  const source = readFileSync(new URL("../src/lib/record-arrival.ts", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles-record-landing.css", import.meta.url), "utf8");
  // Owner (2026-10-22): with words on every side (a phone's heading between
  // its eyebrow and first line) the tag no longer takes the least-covered place.
  assert.match(source, /\["inside", at\(right - 10 - width, top \+ 6\)\]/);
  assert.match(source, /textUnder\(at, anchor, name === "inside"\) === 0/);
  assert.match(source, /return \{ name: "none", compact: true \} as const;/);
  assert.doesNotMatch(source, /covered < least/);
  // Chosen again while the route settles, and a tag left out while it shows.
  assert.match(source, /\(side === "none" && since < TAG_HOLD_MS\) \|\| \(since < SETTLE_MS && next !== chosenFor\)/);
  assert.match(css, /\.record-landing-tag\[data-compact\] > span \{\s*display: none;/);
  assert.match(css, /\[data-tag="none"\] > \.record-landing-tag \{\s*visibility: hidden;/);
  assert.match(css, /\[data-tag="inside"\] > \.record-landing-tag \{[^}]*right: 10px;/);
});
