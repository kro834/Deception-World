import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mountExtremeMotion, mountExtremeNavReserve } from "../src/lib/extreme-motion.js";

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    },
    removeEventListener(name, callback) {
      listeners.get(name)?.delete(callback);
      if (!listeners.get(name)?.size) listeners.delete(name);
    },
    emit(name) {
      [...(listeners.get(name) || [])].forEach((callback) => callback());
    },
  };
}

function setup({ reduced = false, native = false, eligible = true } = {}) {
  const frames = new Map();
  const mutations = [];
  const resizes = [];
  const values = new Map();
  const priorities = new Map();
  const writes = [];
  const ready = [];
  let serial = 0;
  let reads = 0;
  let navHeight = 72.2;
  const reducedMotion = { ...eventTarget(), matches: reduced };
  const coarsePointer = { ...eventTarget(), matches: false };
  const connection = { ...eventTarget(), saveData: false, effectiveType: "4g" };
  const document = {
    ...eventTarget(),
    hidden: false,
    documentElement: { dataset: { worldEffects: "full", ios27Enhanced: String(native) } },
  };
  const environment = {
    ...eventTarget(),
    navigator: {
      userAgent: "Macintosh; Intel Mac OS X 10_15_7 Version/27.0 Safari/605.1.15",
      maxTouchPoints: eligible ? 5 : 0,
      connection,
    },
    innerHeight: 1000,
    scrollY: 500,
    visualViewport: { ...eventTarget(), height: 1000 },
    matchMedia: (query) => (query.includes("reduced-motion") ? reducedMotion : coarsePointer),
    requestAnimationFrame(callback) {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        mutations.push(this);
      }
      observe(target, options) {
        this.options = options;
      }
      disconnect() {
        this.disconnected = true;
      }
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        resizes.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  };
  const style = {
    getPropertyValue: (name) => values.get(name) || "",
    getPropertyPriority: (name) => priorities.get(name) || "",
    setProperty(name, value, priority = "") {
      values.set(name, value);
      priorities.set(name, priority);
      writes.push([name, value]);
    },
    removeProperty(name) {
      values.delete(name);
      priorities.delete(name);
    },
  };
  const page = {
    ownerDocument: document,
    style,
    querySelector: () => ({ getBoundingClientRect: () => ({ height: (++reads, navHeight) }) }),
  };
  return {
    environment,
    document,
    page,
    reducedMotion,
    coarsePointer,
    connection,
    frames,
    mutations,
    resizes,
    ready,
    writes,
    values,
    reads: () => reads,
    setHeight: (height) => {
      navHeight = height;
    },
    mount: () => mountExtremeMotion(page, (value) => ready.push(value), environment),
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    },
    mutate() {
      mutations
        .filter((observer) => !observer.disconnected)
        .forEach((observer) => observer.callback());
    },
  };
}

test("Extreme scroll fallback batches bursts and ignores saturated progress", () => {
  const h = setup();
  const cleanup = h.mount();
  assert.deepEqual(h.ready, [true]);
  assert.equal(h.values.get("--rxs-hero-progress"), "0.500");
  h.environment.scrollY = 700;
  for (let i = 0; i < 30; i++) h.environment.emit("scroll");
  h.environment.visualViewport.emit("resize");
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.values.get("--rxs-hero-progress"), "0.700");
  const writes = h.writes.length;
  h.environment.emit("scroll");
  h.flush();
  assert.equal(h.writes.length, writes);
  cleanup();
});

test("reduced motion ON cancels queued work and OFF resumes the current position", () => {
  const h = setup();
  const cleanup = h.mount();
  h.environment.emit("scroll");
  h.reducedMotion.matches = true;
  h.reducedMotion.emit("change");
  assert.deepEqual(h.ready, [true, false]);
  assert.equal(h.frames.size, 0);
  assert.equal(h.environment.listeners.has("scroll"), false);
  assert.equal(h.environment.visualViewport.listeners.has("resize"), false);
  assert.equal(h.values.has("--rxs-hero-progress"), false);
  h.environment.scrollY = 800;
  h.reducedMotion.matches = false;
  h.reducedMotion.emit("change");
  assert.deepEqual(h.ready, [true, false, true]);
  assert.equal(h.values.get("--rxs-hero-progress"), "0.800");
  assert.equal(h.environment.listeners.get("scroll").size, 1);
  cleanup();
});

test("an initially reduced page can enable motion without remounting", () => {
  const h = setup({ reduced: true });
  const cleanup = h.mount();
  assert.deepEqual(h.ready, [false]);
  assert.equal(h.environment.listeners.has("scroll"), false);
  h.reducedMotion.matches = false;
  h.reducedMotion.emit("change");
  assert.deepEqual(h.ready, [false, true]);
  assert.equal(h.environment.listeners.get("scroll").size, 1);
  cleanup();
});

test("fine-pointer iPadOS27 follows the installed native mode in both directions", () => {
  const h = setup();
  const cleanup = h.mount();
  h.environment.emit("scroll");
  h.document.documentElement.dataset.ios27Enhanced = "true";
  h.mutate();
  assert.equal(h.frames.size, 0);
  assert.equal(h.environment.listeners.has("scroll"), false);
  assert.equal(h.values.has("--rxs-hero-progress"), false);
  assert.deepEqual(h.ready, [true], "native CSS remains motion-ready");
  h.document.documentElement.dataset.ios27Enhanced = "false";
  h.mutate();
  assert.equal(h.environment.listeners.get("scroll").size, 1);
  assert.equal(h.values.get("--rxs-hero-progress"), "0.500");
  cleanup();
  const initiallyNative = setup({ native: true });
  const stop = initiallyNative.mount();
  assert.equal(initiallyNative.environment.listeners.has("scroll"), false);
  stop();
});

test("desktop Safari27 is not misclassified as a touch iPad", () => {
  const h = setup({ native: true, eligible: false });
  const cleanup = h.mount();
  assert.equal(h.environment.listeners.has("scroll"), true);
  assert.deepEqual(h.mutations[0].options.attributeFilter, ["data-world-effects"]);
  cleanup();
});

test("economy, network and pointer gates stop unnecessary fallback work", () => {
  const h = setup();
  const cleanup = h.mount();
  h.document.documentElement.dataset.worldEffects = "economy";
  h.mutate();
  assert.equal(h.ready.at(-1), false);
  assert.equal(h.environment.listeners.has("scroll"), false);
  h.document.documentElement.dataset.worldEffects = "full";
  h.mutate();
  h.connection.saveData = true;
  h.connection.emit("change");
  assert.equal(h.ready.at(-1), false);
  h.connection.saveData = false;
  h.connection.emit("change");
  assert.equal(h.ready.at(-1), true);
  h.coarsePointer.matches = true;
  h.coarsePointer.emit("change");
  assert.equal(h.environment.listeners.has("scroll"), false);
  assert.equal(h.ready.at(-1), true, "coarse input only disables parallax");
  h.coarsePointer.matches = false;
  h.coarsePointer.emit("change");
  assert.equal(h.environment.listeners.get("scroll").size, 1);
  cleanup();
});

test("visibility and bfcache suspend pending frames, then recover without duplicate listeners", () => {
  const h = setup();
  const cleanup = h.mount();
  h.environment.emit("scroll");
  h.document.hidden = true;
  h.document.emit("visibilitychange");
  assert.equal(h.frames.size, 0);
  assert.equal(h.environment.listeners.has("scroll"), false);
  h.document.hidden = false;
  h.document.emit("visibilitychange");
  h.environment.emit("pagehide");
  assert.equal(h.environment.listeners.has("scroll"), false);
  h.environment.emit("pageshow");
  h.environment.emit("pageshow");
  assert.equal(h.environment.listeners.get("scroll").size, 1);
  cleanup();
});

test("unmount releases all listeners, observers and frames, restoring prior style priority", () => {
  const h = setup();
  h.page.style.setProperty("--rxs-hero-progress", "0.125", "important");
  const cleanup = h.mount();
  h.environment.emit("scroll");
  cleanup();
  cleanup();
  for (const target of [
    h.environment,
    h.document,
    h.environment.visualViewport,
    h.reducedMotion,
    h.coarsePointer,
    h.connection,
  ])
    assert.equal(target.listeners.size, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.mutations[0].disconnected, true);
  assert.equal(h.values.get("--rxs-hero-progress"), "0.125");
  assert.equal(h.page.style.getPropertyPriority("--rxs-hero-progress"), "important");
  const states = h.ready.length;
  h.mutations[0].callback();
  assert.equal(h.ready.length, states);
});

test("nav reserve measures once initially and once for simultaneous resize sources", () => {
  const h = setup();
  const cleanup = mountExtremeNavReserve(h.page, h.environment);
  assert.equal(h.reads(), 1);
  assert.equal(h.values.get("--rxs-local-nav-reserve"), "73px");
  h.setHeight(91.1);
  h.environment.emit("resize");
  h.environment.visualViewport.emit("resize");
  h.resizes[0].callback();
  assert.equal(h.frames.size, 1);
  assert.equal(h.reads(), 1);
  h.flush();
  assert.equal(h.reads(), 2);
  assert.equal(h.values.get("--rxs-local-nav-reserve"), "92px");
  h.environment.emit("resize");
  cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.resizes[0].disconnected, true);
  assert.equal(h.environment.listeners.size, 0);
  assert.equal(h.environment.visualViewport.listeners.size, 0);
  assert.equal(h.values.has("--rxs-local-nav-reserve"), false);
  h.resizes[0].callback();
  assert.equal(h.frames.size, 0);
});

test("Extreme mounts the tested lifecycle helpers without changing the comparison default", () => {
  const source = readFileSync(
    new URL("../src/components/extreme-saga/extreme-saga.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useEffect\(\(\) => mountExtremeNavReserve\(pageRef.current\), \[\]\)/);
  assert.match(
    source,
    /useEffect\(\(\) => mountExtremeMotion\(pageRef.current, setMotionReady\), \[\]\)/,
  );
  assert.match(
    source,
    /const \[baseline, setBaseline\] = useState<ExtremeBaseline>\("diluculum"\)/,
  );
});
