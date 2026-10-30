import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  advancePhoneLandscapeMenu,
  isPhoneLandscapeMenuDevice,
  watchPhoneLandscapeMenu,
} from "../src/lib/phone-landscape-menu.js";

const initial = () => ({ hidden: false, lastY: 0, travel: 0, direction: 0 });

test("only an iPhone with a coarse short landscape viewport is eligible", () => {
  assert.equal(isPhoneLandscapeMenuDevice("Mozilla iPhone", true, 844, 390), true);
  for (const input of [
    ["iPad", true, 1024, 768],
    ["Macintosh", true, 1024, 500],
    ["Android", true, 844, 390],
    ["iPhone", false, 844, 390],
    ["iPhone", true, 390, 844],
    ["iPhone", true, 900, 600],
    ["iPhone", true, NaN, 390],
    ["iPhone", true, 844, 0],
  ])
    assert.equal(isPhoneLandscapeMenuDevice(...input), false, String(input));
});

test("chrome hides only after its full height and sufficient downward intent", () => {
  let state = advancePhoneLandscapeMenu(initial(), 70, 100);
  assert.equal(state.hidden, false);
  state = advancePhoneLandscapeMenu(state, 100, 100);
  assert.equal(state.hidden, true);
  state = advancePhoneLandscapeMenu(state, 95, 100);
  assert.equal(state.hidden, true);
  state = advancePhoneLandscapeMenu(state, 89, 100);
  assert.equal(state.hidden, true);
  state = advancePhoneLandscapeMenu(state, 88, 100);
  assert.equal(state.hidden, true, "one-pixel jitter does not count as an event");
  state = advancePhoneLandscapeMenu(state, 87, 100);
  assert.equal(state.hidden, false, "12px upward intention restores chrome");
});

test("subpixel jitter, lock, invalid offsets and rubber-band overscroll cannot flicker chrome", () => {
  let state = { hidden: true, lastY: 300, travel: 0, direction: 0 };
  for (const y of [300.5, 299.3, 300.2, 299.8])
    assert.equal(advancePhoneLandscapeMenu(state, y, 80), state);
  assert.equal(advancePhoneLandscapeMenu(state, 0, 80, true), state);
  assert.equal(advancePhoneLandscapeMenu(state, NaN, 80), state);
  state = advancePhoneLandscapeMenu(state, -70, 80);
  assert.deepEqual(state, initial());
});

test("rapid reversal requires fresh intention, and does not reuse the opposite direction's distance", () => {
  let state = { hidden: true, lastY: 500, travel: 400, direction: 1 };
  state = advancePhoneLandscapeMenu(state, 495, 80);
  assert.equal(state.hidden, true);
  assert.equal(state.travel, 5);
  state = advancePhoneLandscapeMenu(state, 510, 80);
  state = advancePhoneLandscapeMenu(state, 499, 80);
  assert.equal(state.hidden, true);
  state = advancePhoneLandscapeMenu(state, 497, 80);
  assert.equal(state.hidden, false);
});

function fixture({ ua = "iPhone", landscape = true, dream = false, motion = false } = {}) {
  const elements = () => {
    const attrs = new Map();
    return {
      attrs,
      style: {
        overflow: "",
        position: "",
        setProperty(k, v, priority = "") {
          this[k] = v;
          this[`${k}-priority`] = priority;
        },
        getPropertyValue(k) {
          return this[k] || "";
        },
        getPropertyPriority(k) {
          return this[`${k}-priority`] || "";
        },
        removeProperty(k) {
          delete this[k];
        },
      },
      setAttribute: (k, v) => attrs.set(k, v),
      removeAttribute: (k) => attrs.delete(k),
      getAttribute: (k) => attrs.get(k) ?? null,
      hasAttribute: (k) => attrs.has(k),
      isConnected: true,
    };
  };
  const root = elements();
  const body = elements();
  const header = elements();
  const host = elements();
  host.parentElement = header;
  let reads = 0;
  Object.defineProperty(header, "offsetHeight", {
    get: () => {
      reads++;
      return 64;
    },
  });
  header.classList = { contains: (name) => dream && name === "dream-site-header" };
  const nav = { ...elements(), offsetHeight: 44 };
  const trigger = {
    ...elements(),
    parentElement: host,
    closest: (selector) => (selector === "header" ? header : null),
  };
  const shell = elements();
  trigger.querySelector = () => (motion ? shell : null);
  if (motion)
    trigger.getBoundingClientRect = () =>
      root.getAttribute("data-phone-landscape-hidden") === "true"
        ? { left: 772, top: 314, width: 60, height: 60 }
        : { left: 730, top: 8, width: 90, height: 48 };
  const timers = new Map();
  const reducedMotion = { matches: false, addEventListener() {}, removeEventListener() {} };
  const frames = new Map();
  const events = new Map();
  const docEvents = new Map();
  const observers = [];
  let counter = 0;
  let resized;
  const media = { matches: landscape, addEventListener() {}, removeEventListener() {} };
  const doc = {
    documentElement: root,
    body,
    hidden: false,
    querySelectorAll: () => (trigger.isConnected ? [trigger] : []),
    querySelector: () => nav,
    addEventListener: (key, fn) => docEvents.set(key, fn),
    removeEventListener: (key) => docEvents.delete(key),
  };
  const win = {
    navigator: { userAgent: ua },
    innerWidth: 844,
    innerHeight: 390,
    scrollY: 0,
    matchMedia: (query) =>
      query.includes("reduced-motion")
        ? reducedMotion
        : query.includes("forced-colors")
          ? { matches: false }
          : media,
    setTimeout: (fn) => {
      timers.set(++counter, fn);
      return counter;
    },
    clearTimeout: (id) => timers.delete(id),
    getComputedStyle: () => ({ position: "fixed" }),
    requestAnimationFrame(fn) {
      frames.set(++counter, fn);
      return counter;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    addEventListener: (key, fn) => events.set(key, fn),
    removeEventListener: (key) => events.delete(key),
    MutationObserver: class {
      constructor(fn) {
        observers.push(fn);
      }
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(fn) {
        resized = fn;
      }
      observe() {}
      disconnect() {}
    },
  };
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  return {
    win,
    shell,
    timers,
    reducedMotion,
    doc,
    root,
    header,
    host,
    trigger,
    nav,
    media,
    frames,
    events,
    docEvents,
    flush,
    emit: (key) => events.get(key)?.(),
    lockChanged: () => observers[0](),
    resized: () => resized(),
    get reads() {
      return reads;
    },
    scroll(y) {
      win.scrollY = y;
      events.get("scroll")?.();
      flush();
    },
  };
}

test("the controller retains the one menu button and only measures on layout changes", () => {
  const f = fixture();
  const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
  assert.equal(f.root.getAttribute("data-phone-landscape-menu"), "true");
  assert.equal(f.header.hasAttribute("data-phone-landscape-header"), true);
  assert.equal(f.trigger.hasAttribute("data-phone-landscape-trigger"), true);
  const reads = f.reads;
  f.scroll(100);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
  f.scroll(500);
  f.scroll(498);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
  f.scroll(484);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
  assert.equal(f.reads, reads, "normal scrolling does not read layout");
  assert.equal(f.win.scrollY, 484);
  dispose();
  assert.equal(f.events.size, 0);
  assert.equal(f.docEvents.size, 0);
  assert.equal(f.header.hasAttribute("data-phone-landscape-header"), false);
  assert.equal(f.host.hasAttribute("data-phone-landscape-host"), false);
});

test("Dream's separate navigation row participates in the exit distance", () => {
  const f = fixture({ dream: true });
  const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
  assert.equal(f.root.style["--phone-landscape-chrome-height"], "108px");
  assert.equal(f.nav.hasAttribute("data-phone-landscape-nav"), true);
  f.scroll(100);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
  f.scroll(120);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
  dispose();
  assert.equal(f.nav.hasAttribute("data-phone-landscape-nav"), false);
});

test("modal, menu and loading locks cannot fake an upward scroll on fixed-body restoration", () => {
  for (const attr of ["data-dialog-open", "data-side-menu-open", "data-loading"]) {
    const f = fixture();
    const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
    f.scroll(300);
    f.root.setAttribute(attr, "true");
    f.doc.body.style.position = "fixed";
    f.lockChanged();
    f.scroll(0);
    assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
    f.root.removeAttribute(attr);
    f.doc.body.style.position = "";
    f.win.scrollY = 300;
    f.lockChanged();
    f.emit("scroll");
    f.flush();
    assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
    f.scroll(288);
    assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
    dispose();
  }
});

test("portrait rotation removes every mode marker; landscape returns with a clean direction baseline", () => {
  const f = fixture();
  const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
  f.scroll(300);
  f.win.innerWidth = 390;
  f.win.innerHeight = 844;
  f.media.matches = false;
  f.emit("resize");
  f.flush();
  assert.equal(f.root.hasAttribute("data-phone-landscape-menu"), false);
  assert.equal(f.trigger.hasAttribute("data-phone-landscape-trigger"), false);
  f.win.innerWidth = 844;
  f.win.innerHeight = 390;
  f.media.matches = true;
  f.emit("resize");
  f.flush();
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
  f.scroll(301);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
  dispose();
});

test("same-orientation viewport resize preserves hidden state without false scroll intent", () => {
  const f = fixture();
  const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
  f.scroll(500);
  f.win.innerHeight = 320;
  f.win.scrollY = 400;
  f.emit("resize");
  f.emit("scroll");
  f.flush();
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
  f.scroll(388);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
  dispose();
});

test("route refresh exposes destination navigation and resets the direction accumulator", () => {
  const f = fixture();
  const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
  f.scroll(500);
  f.emit("dw-phone-landscape-menu-refresh");
  f.flush();
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
  f.scroll(505);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "false");
  f.scroll(516);
  assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
  dispose();
});

test("iPad and other devices have no markers, measurements, timers or scroll frames", () => {
  for (const ua of ["iPad", "Macintosh", "Android"]) {
    const f = fixture({ ua });
    const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
    f.scroll(500);
    assert.equal(f.root.attrs.size, 0);
    assert.equal(f.reads, 0);
    assert.equal(f.frames.size, 0);
    dispose();
  }
});

test("CSS keeps a 60px native target, safe-area edges and a motion-free reduced variant", () => {
  const css = readFileSync(
    new URL("../src/styles-phone-landscape-menu.css", import.meta.url),
    "utf8",
  );
  const controller = readFileSync(
    new URL("../src/lib/phone-landscape-menu.js", import.meta.url),
    "utf8",
  );
  assert.match(css, /width: 60px !important/);
  assert.match(css, /height: 60px !important/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition: none !important/);
  assert.match(css, /outline: 2px solid/);
  assert.doesNotMatch(
    controller,
    /scrollTo\(|preventDefault\(|localStorage|style\.overflow\s*=(?!=)/,
  );
  assert.doesNotMatch(css, /overflow:\s*(?:hidden|auto)|touch-action:\s*none/);
});

test("identity transforms cannot trap fixed launchers, and portrait restores original inline priorities", () => {
  const f = fixture();
  f.header.style.setProperty("transform", "translateZ(0)", "important");
  f.host.style.setProperty("scale", "1");
  const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
  for (const element of [f.header, f.host]) {
    assert.equal(element.style.getPropertyValue("transform"), "none");
    assert.equal(element.style.getPropertyPriority("transform"), "important");
    assert.equal(element.style.getPropertyValue("scale"), "none");
  }
  f.scroll(500);
  f.media.matches = false;
  f.win.innerHeight = 844;
  f.win.innerWidth = 390;
  f.emit("resize");
  f.flush();
  assert.equal(f.header.style.getPropertyValue("transform"), "translateZ(0)");
  assert.equal(f.header.style.getPropertyPriority("transform"), "important");
  assert.equal(f.host.style.getPropertyValue("scale"), "1");
  assert.equal(f.host.style.getPropertyPriority("scale"), "");
  assert.equal(f.host.style.getPropertyValue("transform"), "");
  dispose();
});

test("phone flight reverses in place and cleans its paint on rotation, route and lock", () => {
  for (const cleanup of ["rotation", "route", "lock", "economy", "dispose"]) {
    const f = fixture({ motion: true });
    f.shell.style.setProperty("opacity", "0.3");
    const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
    f.scroll(300);
    assert.equal(f.root.getAttribute("data-phone-landscape-motion"), "converge");
    f.flush();
    const movingTransform = f.shell.style.transform;
    f.scroll(288);
    assert.equal(f.root.getAttribute("data-phone-landscape-motion"), "expand");
    const displacement = Number(f.shell.style.transform.match(/translate3d\([^,]+, ([^p]+)px/)[1]);
    assert.ok(
      displacement > 0 && displacement < 306,
      "reversal continues from the intermediate world position instead of restarting at the floating endpoint",
    );
    assert.notEqual(
      f.shell.style.transform,
      movingTransform,
      "host offset follows the restored header",
    );
    if (cleanup === "rotation") {
      f.media.matches = false;
      f.emit("resize");
    }
    if (cleanup === "route") f.emit("dw-phone-landscape-menu-refresh");
    if (cleanup === "lock") {
      f.root.setAttribute("data-dialog-open", "true");
      f.lockChanged();
    }
    if (cleanup === "economy") {
      f.root.setAttribute("data-world-effects", "economy");
      f.lockChanged();
    }
    if (cleanup === "dispose") dispose();
    f.flush();
    assert.equal(f.root.hasAttribute("data-phone-landscape-motion"), false, cleanup);
    assert.equal(f.timers.size, 0, cleanup);
    assert.equal(f.shell.style.opacity, "0.3", cleanup);
    dispose();
  }
});

test("reduced motion and economy keep the native target without scheduling flight", () => {
  for (const reduced of [true, false]) {
    const f = fixture({ motion: true });
    f.reducedMotion.matches = reduced;
    if (!reduced) f.root.setAttribute("data-world-effects", "economy");
    const dispose = watchPhoneLandscapeMenu(f.win, f.doc);
    f.scroll(300);
    assert.equal(f.root.getAttribute("data-phone-landscape-hidden"), "true");
    assert.equal(f.root.hasAttribute("data-phone-landscape-motion"), false);
    assert.equal(f.timers.size, 0);
    dispose();
  }
});
