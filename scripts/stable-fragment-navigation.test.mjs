import assert from "node:assert/strict";
import test from "node:test";
import {
  holdFragmentPath,
  mountStableFragmentNavigation,
} from "../src/lib/stable-fragment-navigation.js";

function setup() {
  const listeners = new Map();
  const timers = new Map();
  let serial = 0;
  const events = {
    addEventListener: (name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener: (name, listener) => {
      listeners.get(name)?.delete(listener);
      if (!listeners.get(name)?.size) listeners.delete(name);
    },
  };
  const environment = {
    ...events,
    setTimeout: (callback, delay) => {
      timers.set(++serial, { callback, delay });
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const sections = [0, 1, 2].map((order) => ({
    order,
    style: {
      contentVisibility: order === 0 ? "auto" : "",
      removeProperty() {
        this.contentVisibility = "";
      },
    },
    contains: () => false,
    compareDocumentPosition(target) {
      return order < target.order ? 4 : 2;
    },
  }));
  let reads = 0;
  let revisits = 0;
  sections[1].scrollIntoView = (options) => {
    assert.deepEqual(options, { block: "start", behavior: "auto" });
    revisits++;
  };
  sections[1].getBoundingClientRect = () => {
    reads++;
    return {};
  };
  let click;
  const root = {
    ownerDocument: { getElementById: (id) => (id === "cases" ? sections[1] : null) },
    contains: () => true,
    querySelectorAll: () => sections,
    addEventListener: (_, callback) => {
      click = callback;
    },
    removeEventListener: () => {
      click = null;
    },
  };
  const cleanup = mountStableFragmentNavigation(root, environment);
  const event = (options = {}, href = "#cases") =>
    click({
      button: 0,
      target: { closest: () => ({ getAttribute: () => href }) },
      preventDefault: () => assert.fail("native hash, scrolling and history must be retained"),
      ...options,
    });
  return {
    root,
    cleanup,
    event,
    sections,
    listeners,
    timers,
    reads: () => reads,
    environment,
    revisits: () => revisits,
    emit(name) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener();
    },
    flush(maxDelay = Infinity) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay > maxDelay || !timers.has(id)) continue;
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

function addAnimationFrames(h) {
  const frames = new Map();
  let serial = 0;
  h.environment.requestAnimationFrame = (callback) => {
    frames.set(++serial, callback);
    return serial;
  };
  h.environment.cancelAnimationFrame = (id) => frames.delete(id);
  return {
    frames,
    flush() {
      for (const [id, callback] of [...frames]) {
        if (!frames.has(id)) continue;
        frames.delete(id);
        callback();
      }
    },
  };
}

test("native fragment navigation measures only the path to its destination once", () => {
  const h = setup();
  h.event();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  assert.equal(h.reads(), 1);
  for (let i = 0; i < 90; i++) h.emit("scroll");
  assert.equal(h.reads(), 1, "no layout read during scrolling");
  h.flush();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("revisiting the current fragment works without changing history", () => {
  const h = setup();
  h.environment.location = { hash: "#cases" };
  let prevented = 0;
  h.event({ preventDefault: () => prevented++ });
  assert.equal(h.revisits(), 1);
  assert.equal(prevented, 1, "do not let WebKit's default action cancel the revisit");
  h.environment.location.hash = "#characters";
  h.event();
  assert.equal(h.revisits(), 1, "new fragments keep the browser's default navigation");
  h.cleanup();
});

test("a current-fragment revisit waits one frame while holding the materialized path", () => {
  const h = setup();
  const animation = addAnimationFrames(h);
  h.environment.location = { hash: "#cases" };
  let prevented = 0;
  h.event({ preventDefault: () => prevented++ });
  assert.equal(prevented, 1);
  assert.equal(h.revisits(), 0);
  assert.equal(animation.frames.size, 1);
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  animation.flush();
  assert.equal(h.revisits(), 1);
  assert.equal(h.environment.location.hash, "#cases", "the revisit does not change history");
  assert.equal(animation.frames.size, 0);
  h.flush();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("unmount cancels a pending revisit and releases every temporary hold", () => {
  const h = setup();
  const animation = addAnimationFrames(h);
  h.environment.location = { hash: "#cases" };
  h.event({ preventDefault() {} });
  h.cleanup();
  assert.equal(animation.frames.size, 0);
  animation.flush();
  assert.equal(h.revisits(), 0);
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test("a newer valid navigation replaces a pending revisit without replacing native navigation", () => {
  const h = setup();
  const animation = addAnimationFrames(h);
  h.environment.location = { hash: "#cases" };
  h.event({ preventDefault() {} });
  h.environment.location.hash = "#characters";
  h.event();
  assert.equal(animation.frames.size, 0);
  animation.flush();
  assert.equal(h.revisits(), 0, "the old revisit must not override the newer native jump");
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  h.flush();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("a pending revisit checks that its fragment is still current before scrolling", () => {
  const h = setup();
  const animation = addAnimationFrames(h);
  h.environment.location = { hash: "#cases" };
  h.event({ preventDefault() {} });
  h.environment.location.hash = "#characters";
  animation.flush();
  assert.equal(h.revisits(), 0);
  assert.equal(animation.frames.size, 0);
  h.cleanup();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test("overlapping click and search arrivals restore the original styles in either release order", () => {
  for (const reverse of [false, true]) {
    const h = setup();
    const releases = [
      holdFragmentPath(h.root, h.sections[1], h.environment),
      holdFragmentPath(h.root, h.sections[1], h.environment),
    ];
    if (reverse) releases.reverse();
    releases[0]();
    releases[0]();
    assert.deepEqual(
      h.sections.map((s) => s.style.contentVisibility),
      ["visible", "visible", ""],
    );
    releases[1]();
    assert.deepEqual(
      h.sections.map((s) => s.style.contentVisibility),
      ["auto", "", ""],
    );
    assert.equal(h.timers.size, 0);
    h.cleanup();
  }
});

test("unmounting a native path leaves the search path held until its own release", () => {
  const h = setup();
  h.event();
  const releaseSearch = holdFragmentPath(h.root, h.sections[1], h.environment);
  h.cleanup();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  releaseSearch();
  h.flush();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.timers.size, 0);
});

test("modified, cancelled, unknown and malformed fragment clicks leave layout alone", () => {
  const h = setup();
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { defaultPrevented: true },
    { button: 1 },
  ])
    h.event(options);
  h.event({}, "#missing");
  h.event({}, "#%E0");
  assert.equal(h.reads(), 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("wheel, repeated fragment clicks and unmount release all temporary styles", () => {
  for (const interrupt of ["wheel", "unmount"]) {
    const h = setup();
    h.event();
    h.event();
    assert.equal(h.timers.size, 2, "a second click replaces the first session");
    if (interrupt === "unmount") h.cleanup();
    else h.emit(interrupt);
    assert.deepEqual(
      h.sections.map((s) => s.style.contentVisibility),
      ["auto", "", ""],
    );
    assert.equal(h.timers.size, 0);
    assert.equal(h.listeners.size, 0);
    h.cleanup();
  }
});

test("a tap holds the path through timer expiry and releases only after bubbling click", () => {
  const h = setup();
  h.event();
  h.emit("click");
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
    "the same click that creates a hold must not end it",
  );
  h.emit("pointerdown");
  h.emit("scroll");
  h.flush(240);
  h.flush(3000);
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  h.emit("pointerup");
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  h.emit("click");
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("pointercancel releases the path, including during a long press", () => {
  const h = setup();
  h.event();
  h.emit("pointerdown");
  h.flush(3000);
  h.emit("pointercancel");
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("blur and pagehide release a pointer whose up or cancel never arrived", () => {
  for (const end of ["blur", "pagehide"]) {
    const h = setup();
    h.event();
    h.emit("pointerdown");
    h.flush(3000);
    assert.deepEqual(
      h.sections.map((s) => s.style.contentVisibility),
      ["visible", "visible", ""],
    );
    h.emit(end);
    assert.deepEqual(
      h.sections.map((s) => s.style.contentVisibility),
      ["auto", "", ""],
    );
    assert.equal(h.listeners.size, 0);
    assert.equal(h.timers.size, 0);
    h.cleanup();
  }
});

test("a drag without a click releases after a bounded post-pointerup fallback", () => {
  const h = setup();
  h.event();
  h.emit("pointerdown");
  h.emit("pointerup");
  h.flush(240);
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  h.flush(600);
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test("unmount releases immediately during a press and preserves another owner's hold", () => {
  const h = setup();
  h.event();
  const releaseOther = holdFragmentPath(h.root, h.sections[1], h.environment);
  h.emit("pointerdown");
  h.cleanup();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["visible", "visible", ""],
  );
  releaseOther();
  assert.deepEqual(
    h.sections.map((s) => s.style.contentVisibility),
    ["auto", "", ""],
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
});
