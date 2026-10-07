import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/lib/ultra-artwork-target.js", import.meta.url), "utf8");

function emitter(extra = {}) {
  const listeners = new Map();
  return Object.assign(
    {
      listeners,
      addEventListener(name, callback, options) {
        const capture = typeof options === "boolean" ? options : !!options?.capture;
        if (!listeners.has(name)) listeners.set(name, new Map());
        listeners.get(name).set(callback, capture);
      },
      removeEventListener(name, callback, options) {
        const capture = typeof options === "boolean" ? options : !!options?.capture;
        if (listeners.get(name)?.get(callback) === capture) listeners.get(name).delete(callback);
      },
      emit(name) {
        for (const callback of [...(listeners.get(name)?.keys() || [])]) callback({ type: name });
      },
      listenerCount() {
        return [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0);
      },
    },
    extra,
  );
}

function fixture({ intersection = true } = {}) {
  const observers = { mutation: [], resize: [], intersection: [] };
  const observerType = (type) =>
    class {
      constructor(callback) {
        this.callback = callback;
        this.observed = [];
        this.disconnected = false;
        observers[type].push(this);
      }
      observe(target, options) {
        this.observed.push({ target, options });
      }
      disconnect() {
        this.disconnected = true;
      }
      emit(entries = []) {
        if (!this.disconnected) this.callback(entries);
      }
    };
  const hosts = new Map();
  const readySelector = '[data-ultra-artwork-ready="true"]';
  const doc = emitter({
    body: {},
    querySelector(selector) {
      const gated = selector.includes(readySelector);
      const host = hosts.get(selector.replace(readySelector, "")) || null;
      return gated && host?.getAttribute("data-ultra-artwork-ready") !== "true" ? null : host;
    },
  });
  const frames = new Map();
  const cancelled = [];
  let nextFrame = 0;
  const win = emitter({
    innerWidth: 900,
    innerHeight: 700,
    visualViewport: emitter(),
    requestAnimationFrame(callback) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) {
      cancelled.push(id);
      frames.delete(id);
    },
  });
  const context = vm.createContext({
    document: doc,
    window: win,
    MutationObserver: observerType("mutation"),
    ResizeObserver: observerType("resize"),
    ...(intersection ? { IntersectionObserver: observerType("intersection") } : {}),
  });
  vm.runInContext(
    `${source.replace(/^export /gm, "")}\nthis.api={measureUltraArtwork,watchUltraArtworkTarget,watchUltraArtworkGeometry};`,
    context,
  );
  const hostAttrs = new Map([["data-ultra-artwork-ready", "true"]]);
  const host = emitter({
    isConnected: true,
    getAttribute: (name) => hostAttrs.get(name) || null,
    contains: (node) => node === image,
    querySelector: () => image,
    closest: () => null,
  });
  const attrs = new Map([["src", "/art.webp"]]);
  let rect = { left: 30, top: 40, width: 300, height: 400, right: 330, bottom: 440 };
  let busy = false;
  const image = emitter({
    isConnected: true,
    complete: true,
    naturalWidth: 900,
    naturalHeight: 1200,
    offsetWidth: 300,
    offsetHeight: 400,
    offsetLeft: 7,
    offsetTop: 9,
    offsetParent: host,
    currentSrc: "/art.webp",
    getAttribute: (name) => attrs.get(name) || null,
    closest: () => (busy ? host : null),
    getBoundingClientRect: () => rect,
  });
  const target = { host, image, source: "/art.webp||/art.webp", revision: 1 };
  return {
    ...context.api,
    observers,
    hosts,
    doc,
    win,
    host,
    hostAttrs,
    image,
    target,
    attrs,
    frames,
    cancelled,
    setRect(next) {
      rect = next;
    },
    setBusy(next) {
      busy = next;
    },
    flushFrames() {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(16));
    },
    intersect(value) {
      observers.intersection.at(-1).emit([{ target: image, isIntersecting: value }]);
    },
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test("SSR artwork is not a portal target until its route hydration-ready marker becomes true", () => {
  for (const selector of [
    ".gallery-feature-open",
    ".dream-poster-current",
    ".poster-stage .poster-frame",
  ]) {
    const f = fixture();
    f.hostAttrs.delete("data-ultra-artwork-ready");
    f.hosts.set(selector, f.host);
    const seen = [];
    const stop = f.watchUltraArtworkTarget((value) => seen.push(value), f.doc);
    assert.equal(seen.length, 0, `${selector}: SSR host must not receive a portal`);
    assert.ok(
      f.observers.mutation[0].observed[0].options.attributeFilter.includes(
        "data-ultra-artwork-ready",
      ),
      "route readiness changes must trigger discovery",
    );
    f.hostAttrs.set("data-ultra-artwork-ready", "false");
    f.observers.mutation[0].emit();
    assert.equal(seen.length, 0, "only the explicit true marker permits attachment");
    f.hostAttrs.set("data-ultra-artwork-ready", "true");
    f.observers.mutation[0].emit();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].host, f.host);
    assert.equal(seen[0].revision, 1);
    f.hostAttrs.delete("data-ultra-artwork-ready");
    f.observers.mutation[0].emit();
    assert.equal(seen.at(-1), null);
    f.hostAttrs.set("data-ultra-artwork-ready", "true");
    f.observers.mutation[0].emit();
    assert.equal(seen.at(-1).revision, 2);
    stop();
  }
});

test("layout-space measurement includes nested offsets and borders, with a 12px external gutter", () => {
  const f = fixture();
  const outer = {
    offsetLeft: 13,
    offsetTop: 17,
    clientLeft: 2,
    clientTop: 3,
    offsetParent: f.host,
  };
  const inner = { offsetLeft: 19, offsetTop: 23, clientLeft: 4, clientTop: 5, offsetParent: outer };
  f.image.offsetParent = inner;
  f.setRect({ left: 800, top: -90, width: 600, height: 800, right: 1400, bottom: 710 });
  assert.deepEqual(plain(f.measureUltraArtwork(f.target)), {
    left: 33,
    top: 45,
    width: 324,
    height: 424,
  });
});

test("loading, broken, zero-size, detached, and reparented images have no geometry", () => {
  for (const mutate of [
    (f) => {
      f.image.complete = false;
    },
    (f) => {
      f.image.naturalWidth = 0;
    },
    (f) => {
      f.image.naturalHeight = 0;
    },
    (f) => {
      f.image.offsetWidth = 0;
    },
    (f) => {
      f.image.offsetHeight = 0;
    },
    (f) => {
      f.image.isConnected = false;
    },
    (f) => {
      f.host.isConnected = false;
    },
    (f) => {
      f.host.contains = () => false;
    },
    (f) => {
      f.image.offsetParent = null;
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(f.measureUltraArtwork(f.target), null);
  }
});

test("stale source identities cannot keep a frame active while React selects the replacement", () => {
  for (const mutate of [
    (f) => f.attrs.set("src", "/replacement.webp"),
    (f) => f.attrs.set("srcset", "/replacement.webp 2x"),
    (f) => {
      f.image.currentSrc = "/replacement.webp";
    },
  ]) {
    const f = fixture();
    const seen = [];
    const stop = f.watchUltraArtworkGeometry(f.target, (value) => seen.push(value), f.doc, f.win);
    f.intersect(true);
    assert.equal(seen.at(-1).visible, true);
    mutate(f);
    f.observers.mutation[0].emit();
    assert.equal(f.measureUltraArtwork(f.target), null);
    assert.equal(seen.at(-1).visible, false);
    stop();
  }
});

test("discovery follows gallery, Dream, World priority and ignores unchanged identity", () => {
  const f = fixture();
  const world = { ...f.host };
  const dream = { ...f.host };
  f.hosts.set(".poster-stage .poster-frame", world);
  f.hosts.set(".dream-poster-current", dream);
  f.hosts.set(".gallery-feature-open", f.host);
  const seen = [];
  const stop = f.watchUltraArtworkTarget((value) => seen.push(value), f.doc);
  assert.equal(seen[0].host, f.host);
  f.observers.mutation[0].emit();
  assert.equal(seen.length, 1);
  f.hosts.delete(".gallery-feature-open");
  f.observers.mutation[0].emit();
  assert.equal(seen.at(-1).host, dream);
  f.hosts.delete(".dream-poster-current");
  f.observers.mutation[0].emit();
  assert.equal(seen.at(-1).host, world);
  f.hosts.clear();
  f.observers.mutation[0].emit();
  assert.equal(seen.at(-1), null);
  stop();
  assert.equal(f.doc.listenerCount(), 0);
});

test("DOM replacement, srcset and responsive currentSrc each receive a new renderer key", () => {
  const f = fixture();
  f.hosts.set(".dream-poster-current", f.host);
  const seen = [];
  const stop = f.watchUltraArtworkTarget((value) => seen.push(value), f.doc);
  f.attrs.set("srcset", "/large.webp 2x");
  f.observers.mutation[0].emit();
  f.image.currentSrc = "/large.webp";
  f.doc.emit("load");
  const replacement = { ...f.image };
  f.host.querySelector = () => replacement;
  f.observers.mutation[0].emit();
  assert.deepEqual(
    seen.map((value) => value.revision),
    [1, 2, 3, 4],
  );
  assert.equal(seen.at(-1).image, replacement);
  stop();
  f.doc.emit("load");
  f.observers.mutation[0].emit();
  assert.equal(seen.length, 4);
});

test("intersection starts blocked, then permits entry and tracks offscreen/reentry", () => {
  const f = fixture();
  const seen = [];
  const stop = f.watchUltraArtworkGeometry(f.target, (value) => seen.push(value), f.doc, f.win);
  assert.equal(seen.at(-1).visible, false);
  f.intersect(true);
  assert.equal(seen.at(-1).visible, true);
  f.setRect({ left: 30, top: -500, width: 300, height: 400, right: 330, bottom: -100 });
  f.doc.emit("scroll");
  f.flushFrames();
  assert.equal(seen.at(-1).visible, false);
  f.setRect({ left: 30, top: 40, width: 300, height: 400, right: 330, bottom: 440 });
  f.intersect(false);
  assert.equal(seen.at(-1).visible, false);
  f.intersect(true);
  assert.equal(seen.at(-1).visible, true);
  stop();
});

test("busy shuffle pauses and loading completion/animation end reevaluate geometry", () => {
  const f = fixture();
  const stage = {};
  f.host.closest = () => stage;
  const seen = [];
  const stop = f.watchUltraArtworkGeometry(f.target, (value) => seen.push(value), f.doc, f.win);
  f.intersect(true);
  f.setBusy(true);
  f.observers.mutation[0].emit();
  assert.equal(seen.at(-1).visible, false);
  assert.ok(f.observers.mutation[0].observed.some((item) => item.target === stage));
  f.setBusy(false);
  f.image.complete = false;
  f.host.emit("animationend");
  assert.equal(seen.at(-1).geometry, null);
  f.image.complete = true;
  f.image.emit("load");
  assert.equal(seen.at(-1).visible, true);
  f.image.isConnected = false;
  f.observers.mutation[0].emit();
  assert.equal(seen.at(-1).visible, false);
  stop();
});

test("scroll, resize and visual viewport events coalesce and cleanup releases every observer/listener", () => {
  const f = fixture();
  const seen = [];
  const stop = f.watchUltraArtworkGeometry(f.target, (value) => seen.push(value), f.doc, f.win);
  f.doc.emit("scroll");
  f.win.emit("resize");
  f.win.visualViewport.emit("resize");
  f.win.visualViewport.emit("scroll");
  assert.equal(f.frames.size, 1);
  stop();
  assert.equal(f.frames.size, 0);
  for (const target of [f.doc, f.win, f.win.visualViewport, f.host, f.image])
    assert.equal(target.listenerCount(), 0);
  for (const group of Object.values(f.observers))
    for (const observer of group) assert.equal(observer.disconnected, true);
  const count = seen.length;
  f.flushFrames();
  assert.equal(seen.length, count);
});

test("synchronous observer updates do not orphan a pending scroll RAF during cleanup", () => {
  const f = fixture();
  const stop = f.watchUltraArtworkGeometry(f.target, () => {}, f.doc, f.win);
  f.doc.emit("scroll");
  f.observers.resize[0].emit();
  f.doc.emit("scroll");
  assert.ok(f.frames.size <= 1, "a synchronous resize must not lose the scheduled RAF handle");
  stop();
  assert.equal(f.frames.size, 0, "cleanup must cancel all scheduled geometry callbacks");
});

test("without IntersectionObserver the measured viewport still gates activation", () => {
  const f = fixture({ intersection: false });
  const seen = [];
  const stop = f.watchUltraArtworkGeometry(f.target, (value) => seen.push(value), f.doc, f.win);
  assert.equal(seen.at(-1).visible, true);
  f.setRect({ left: 950, top: 0, width: 300, height: 400, right: 1250, bottom: 400 });
  f.win.emit("resize");
  f.flushFrames();
  assert.equal(seen.at(-1).visible, false);
  stop();
});
