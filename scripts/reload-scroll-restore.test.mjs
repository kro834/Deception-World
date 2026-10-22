import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

/* 2026-10-21 sweep F34: reloading mid-page on a desktop sent the reader back
   to the hero (6 of 9 trials at 1440 on /rexonance-saga, every trial on
   /world). The router restores the saved position once, when it first
   renders, while the page is still short (the gate holds the body, the lower
   chapters mount on idle), and /world's fresh-entry reset then sent it to the
   top. A reload (or a return from another site) is now a history arrival:
   no reset, and the saved position is applied again once the page can hold
   it (src/components/load-gate.tsx). This runs the shipped functions. */

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const slice = (from, to) => gate.slice(gate.indexOf(from), gate.indexOf(to));
const code = ts.transpileModule(
  `${slice("const SCROLL_KEYS = new Set([", "let routeScrollMotionLocks")}
${slice("const RELOAD_RESTORE_MS", "export function AppGuards()")}
exports.reloadPosition = reloadPosition;
exports.restoreReloadPosition = restoreReloadPosition;`,
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

function load({ type = "reload", hash = "", pathname = "/rexonance-saga" } = {}) {
  const frames = new Map();
  const listeners = new Map();
  const scrolls = [];
  let serial = 0;
  let now = 0;
  const root = { dataset: {}, scrollHeight: 900 };
  const window = {
    innerHeight: 900,
    scrollY: 0,
    location: { hash, pathname },
    performance: { getEntriesByType: (kind) => (kind === "navigation" ? [{ type }] : []) },
    requestAnimationFrame(fn) {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    scrollTo(options) {
      scrolls.push({ ...options, restoring: root.dataset.routeRestoring });
      window.scrollY = options.top;
    },
  };
  const document = {
    documentElement: root,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
  };
  class KeyboardEvent {
    constructor(key) {
      this.key = key;
    }
  }
  const exports = {};
  runInNewContext(code, {
    exports,
    window,
    document,
    KeyboardEvent,
    performance: { now: () => now },
  });
  return {
    ...exports,
    KeyboardEvent,
    window,
    root,
    frames,
    listeners,
    scrolls,
    tick(ms = 16) {
      now += ms;
      for (const [id, fn] of [...frames]) {
        frames.delete(id);
        fn();
      }
    },
  };
}

test("only a reload or a return from another site, with a saved place and no section, restores", () => {
  const saved = { scrollX: 0, scrollY: 12518 };
  assert.deepEqual({ ...load().reloadPosition(saved) }, { x: 0, y: 12518 });
  assert.deepEqual({ ...load({ type: "back_forward" }).reloadPosition(saved) }, { x: 0, y: 12518 });
  // A fresh visit starts where the page starts; a section link lands there.
  assert.equal(load({ type: "navigate" }).reloadPosition(saved), null);
  assert.equal(load({ hash: "#p14" }).reloadPosition(saved), null);
  // Nothing saved, or saved at the top: nothing to do.
  assert.equal(load().reloadPosition(undefined), null);
  assert.equal(load().reloadPosition({ scrollX: 0, scrollY: 0 }), null);
});

test("the saved place is applied once the page is tall enough to hold it", () => {
  const ui = load();
  const stop = ui.restoreReloadPosition({ x: 0, y: 12518 }, false);
  // Still short (the gate holds the body; the lower chapters are not mounted).
  for (let i = 0; i < 100; i++) ui.tick();
  assert.equal(ui.scrolls.length, 0);
  ui.root.scrollHeight = 16482;
  ui.tick();
  assert.deepEqual(ui.scrolls, [
    { top: 12518, left: 0, behavior: "instant", restoring: undefined },
  ]);
  // Once: no frame or listener is left behind.
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.listeners.size, 0);
  stop();
});

test("a router restore that already landed is left alone", () => {
  const ui = load();
  ui.window.scrollY = 12518;
  ui.root.scrollHeight = 16482;
  ui.restoreReloadPosition({ x: 0, y: 12518 }, false);
  ui.tick();
  assert.equal(ui.scrolls.length, 0);
  assert.equal(ui.frames.size, 0);
});

test("the reader's own scroll, touch, press or scroll key ends the wait; typing does not", () => {
  for (const type of ["wheel", "touchmove", "pointerdown"]) {
    const ui = load();
    ui.restoreReloadPosition({ x: 0, y: 9000 }, false);
    ui.tick();
    ui.listeners.get(type)({});
    ui.root.scrollHeight = 16482;
    ui.tick();
    assert.equal(ui.scrolls.length, 0, type);
    assert.equal(ui.frames.size, 0, type);
  }
  const typing = load();
  typing.restoreReloadPosition({ x: 0, y: 9000 }, false);
  typing.listeners.get("keydown")(new typing.KeyboardEvent("a"));
  typing.root.scrollHeight = 16482;
  typing.tick();
  assert.equal(typing.scrolls.length, 1, "a letter is not the reader moving on");
  const paging = load();
  paging.restoreReloadPosition({ x: 0, y: 9000 }, false);
  paging.listeners.get("keydown")(new paging.KeyboardEvent("PageDown"));
  paging.root.scrollHeight = 16482;
  paging.tick();
  assert.equal(paging.scrolls.length, 0);
});

test("it gives up after its window, and when the reader has left the page", () => {
  const late = load();
  late.restoreReloadPosition({ x: 0, y: 9000 }, false);
  late.tick(4100);
  late.root.scrollHeight = 16482;
  late.tick();
  assert.equal(late.scrolls.length, 0);
  assert.equal(late.frames.size, 0);
  const left = load();
  left.restoreReloadPosition({ x: 0, y: 9000 }, false);
  left.tick();
  left.window.location.pathname = "/world";
  left.root.scrollHeight = 16482;
  left.tick();
  assert.equal(left.scrolls.length, 0);
});

test("a dossier lands on its full layout, then lets it go", () => {
  const ui = load({ pathname: "/riders/saga" });
  ui.root.scrollHeight = 20000;
  ui.restoreReloadPosition({ x: 0, y: 6000 }, true);
  ui.tick();
  assert.equal(ui.scrolls[0].restoring, "true", "held in full while the offset lands");
  assert.equal(ui.root.dataset.routeRestoring, "true");
  ui.tick();
  assert.equal(ui.root.dataset.routeRestoring, undefined);
});

test("a reload is a history arrival: no fresh-entry reset, and the restore is wired", () => {
  assert.match(
    gate,
    /useElementScrollRestoration\(\{\s*getElement: \(\) => \(typeof window === "undefined" \? undefined : window\),\s*\}\)/,
  );
  assert.match(gate, /const \[reloadTarget\] = useState\(\(\) => reloadPosition\(savedWindow\)\);/);
  assert.match(
    gate,
    /const reloaded = previousPathname\.current === null && reloadArrival\.current;/,
  );
  assert.match(
    gate,
    /if \(reloaded\) historyTraversal\.current = true;\s*const fromHistory = historyTraversal\.current;/,
  );
  assert.match(
    gate,
    /if \(!reloadTarget\) return;\s*return restoreReloadPosition\(reloadTarget, DETAIL_ROUTE\.test\(window\.location\.pathname\)\);/,
  );
});
