import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DREAM_READER_STORAGE_KEY,
  mountDreamReader,
  mountDreamReadingVisibility,
  parseDreamReaderHash,
  validateDreamReaderState,
} from "../src/lib/dream-reader-state.js";
import { mountDreamChapterNavigation } from "../src/lib/dream-chapter-navigation.js";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";

const saved = {
  version: 1,
  size: "large",
  spacing: "comfortable",
  bookmark: { caseNo: "5", paragraph: 4 },
};

function visibilitySetup({ width = 320, supported = true } = {}) {
  const attributes = new Map();
  const rootListeners = new Map();
  const docListeners = new Map();
  const windowListeners = new Map();
  const mediaListeners = new Map();
  const viewportListeners = new Map();
  const observers = [];
  const navObservers = [];
  let navBottom = 120;
  const fold = { open: false };
  const paragraph = { closest: () => fold };
  const html = {
    getAttribute: (key) => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
  };
  const document = {
    documentElement: html,
    hidden: false,
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: navBottom }) }),
    addEventListener: (key, callback) => docListeners.set(key, callback),
    removeEventListener: (key) => docListeners.delete(key),
  };
  const root = {
    ownerDocument: document,
    contains: (node) => node === paragraph,
    querySelectorAll: () => [paragraph],
    addEventListener: (key, callback) => rootListeners.set(key, callback),
    removeEventListener: (key) => rootListeners.delete(key),
  };
  const media = {
    matches: width <= 760,
    addEventListener: (key, callback) => mediaListeners.set(key, callback),
    removeEventListener: (key) => mediaListeners.delete(key),
  };
  const environment = {
    innerWidth: width,
    innerHeight: 640,
    matchMedia: () => media,
    addEventListener: (key, callback) => windowListeners.set(key, callback),
    removeEventListener: (key) => windowListeners.delete(key),
    visualViewport: {
      addEventListener: (key, callback) => viewportListeners.set(key, callback),
      removeEventListener: (key) => viewportListeners.delete(key),
    },
    IntersectionObserver: supported
      ? class {
          constructor(callback, options) {
            this.callback = callback;
            this.options = options;
            this.observed = [];
            observers.push(this);
          }
          observe(node) {
            this.observed.push(node);
          }
          disconnect() {
            this.disconnected = true;
          }
        }
      : undefined,
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        navObservers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  };
  const emit = (visible, height = 24, observer = observers.at(-1)) =>
    observer.callback([
      {
        target: paragraph,
        isIntersecting: visible,
        intersectionRect: { width: 180, height },
      },
    ]);
  return {
    attributes,
    root,
    document,
    environment,
    media,
    fold,
    paragraph,
    emit,
    observers,
    navObservers,
    rootListeners,
    docListeners,
    windowListeners,
    mediaListeners,
    viewportListeners,
    setNavBottom: (value) => {
      navBottom = value;
    },
  };
}

test("small-screen Zeus clearance follows real open-paragraph intersections below the fixed act bar", () => {
  const h = visibilitySetup();
  const dispose = mountDreamReadingVisibility(h.root, h.environment);
  assert.equal(h.observers[0].options.rootMargin, "-120px 0px 0px 0px");
  assert.deepEqual(h.observers[0].observed, [h.paragraph]);
  assert.equal(h.attributes.size, 0);
  h.emit(true);
  assert.equal(h.attributes.size, 0, "a closed fold cannot hide the control");
  h.fold.open = true;
  h.rootListeners.get("toggle")({ target: { matches: () => true } });
  h.emit(true, 0);
  assert.equal(h.attributes.size, 0, "zero-area intersection is not readable content");
  h.emit(true);
  assert.deepEqual([...h.attributes], [["data-dream-reading-active", "true"]]);
  h.emit(false);
  assert.equal(h.attributes.size, 0, "leaving the paragraph restores the control immediately");
  h.emit(true);
  h.fold.open = false;
  h.rootListeners.get("toggle")({ target: { matches: () => true } });
  assert.equal(
    h.attributes.size,
    0,
    "native fold close restores before the next observer delivery",
  );
  dispose();
});

test("Zeus clearance clears on desktop, updates nav clipping and resumes after size changes", () => {
  const h = visibilitySetup({ width: 1024 });
  h.fold.open = true;
  const dispose = mountDreamReadingVisibility(h.root, h.environment);
  assert.equal(h.observers.length, 0, "wide screens never hide Zeus");
  h.media.matches = true;
  h.mediaListeners.get("change")();
  h.emit(true);
  assert.equal(h.attributes.size, 1);
  h.setNavBottom(164);
  h.navObservers[0].callback();
  assert.equal(h.observers.at(-1).options.rootMargin, "-164px 0px 0px 0px");
  h.emit(true);
  h.media.matches = false;
  h.mediaListeners.get("change")();
  assert.equal(h.attributes.size, 0);
  assert.equal(h.observers.at(-1).disconnected, true);
  dispose();
});

test("hidden pages, history departure and route cleanup restore Zeus and reject stale intersections", () => {
  const h = visibilitySetup();
  h.fold.open = true;
  const dispose = mountDreamReadingVisibility(h.root, h.environment);
  h.emit(true);
  const old = h.observers[0];
  h.document.hidden = true;
  h.docListeners.get("visibilitychange")();
  h.emit(true, 24, old);
  assert.equal(h.attributes.size, 0);
  h.document.hidden = false;
  h.docListeners.get("visibilitychange")();
  h.emit(true);
  assert.equal(h.attributes.size, 1);
  h.windowListeners.get("pagehide")();
  assert.equal(h.attributes.size, 0);
  h.windowListeners.get("pageshow")();
  h.emit(true);
  assert.equal(h.attributes.size, 1);
  dispose();
  h.emit(true);
  assert.equal(h.attributes.size, 0);
  assert.equal(
    h.rootListeners.size +
      h.docListeners.size +
      h.windowListeners.size +
      h.mediaListeners.size +
      h.viewportListeners.size,
    0,
  );
  assert.ok(h.observers.every((observer) => observer.disconnected));
  assert.ok(h.navObservers.every((observer) => observer.disconnected));
});

test("without IntersectionObserver the floating control stays available and no reader flag survives", () => {
  const h = visibilitySetup({ supported: false });
  h.attributes.set("data-dream-reading-active", "true");
  const dispose = mountDreamReadingVisibility(h.root, h.environment);
  assert.equal(h.attributes.size, 0);
  assert.equal(h.windowListeners.size + h.rootListeners.size + h.docListeners.size, 0);
  dispose();
});

function setup(value = null, denied = false) {
  const listeners = new Map();
  const docListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const writes = [];
  const attributes = new Map();
  const dialogAttributes = new Map();
  const fold = { open: true, dataset: { caseNo: "5" } };
  const paragraphs = [1, 2, 3, 4, 5, 6].map((no) => ({
    id: `dream-case-5-paragraph-${no}`,
    rect: { top: (no - 1) * 240 - 620, bottom: no * 240 - 620 },
    getBoundingClientRect() {
      return this.rect;
    },
    closest: () => fold,
    matches: (selector) => selector === "[data-dream-reading-paragraph]",
    focus() {},
  }));
  const doc = {
    hidden: false,
    documentElement: {
      getAttribute: (name) => dialogAttributes.get(name) ?? null,
      setAttribute: (name, value) => dialogAttributes.set(name, value),
      removeAttribute: (name) => dialogAttributes.delete(name),
    },
    querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 120 }) }),
    getElementById: (id) => paragraphs.find((p) => p.id === id),
    addEventListener: (name, listener) => docListeners.set(name, listener),
    removeEventListener: (name) => docListeners.delete(name),
  };
  const root = {
    ownerDocument: doc,
    querySelectorAll: () => paragraphs,
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  };
  const env = {
    innerHeight: 800,
    location: { hash: "#dream-case-5-paragraph-4" },
    localStorage: {
      getItem: () => {
        if (denied) throw Error("denied");
        return value;
      },
      setItem: (key, item) => {
        if (denied) throw Error("denied");
        writes.push([key, JSON.parse(item)]);
      },
    },
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name) => listeners.delete(name),
    setTimeout: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const states = [];
  const controller = mountDreamReader(root, DREAM_CASES, (s) => states.push(s), env);
  const fire = (name, data = {}) =>
    (listeners.get(name) ?? docListeners.get(name))?.({
      type: name,
      target: { closest: () => null },
      ...data,
    });
  const flush = () => {
    for (const [id, callback] of [...timers]) {
      timers.delete(id);
      callback();
    }
  };
  return {
    root,
    doc,
    env,
    fold,
    paragraphs,
    attributes,
    dialogAttributes,
    controller,
    fire,
    flush,
    writes,
    states,
    listeners,
    docListeners,
    timers,
  };
}

test("versioned storage validates current chapter and paragraph bounds without inventing completion", () => {
  assert.deepEqual(validateDreamReaderState(saved, DREAM_CASES), {
    size: "large",
    spacing: "comfortable",
    bookmark: saved.bookmark,
  });
  const latestParagraph = { caseNo: "5", paragraph: 13 };
  assert.deepEqual(
    validateDreamReaderState({ ...saved, bookmark: latestParagraph }, DREAM_CASES).bookmark,
    latestParagraph,
    "the updated CASE 5 ending remains bookmarkable",
  );
  for (const bookmark of [
    null,
    {},
    { caseNo: "0", paragraph: 4 },
    { caseNo: "5", paragraph: 14 },
    { caseNo: "6", paragraph: 1 },
    { caseNo: "5", paragraph: "4" },
    { caseNo: "5", paragraph: -1 },
  ]) {
    assert.equal(validateDreamReaderState({ ...saved, bookmark }, DREAM_CASES).bookmark, null);
  }
  assert.deepEqual(validateDreamReaderState({ ...saved, version: 2 }, DREAM_CASES), {
    size: "standard",
    spacing: "standard",
    bookmark: null,
  });
  assert.equal(parseDreamReaderHash("#dream-case-5-paragraph-4").paragraph, 4);
  for (const hash of [
    "#dream-case-5",
    "#dream-case-6-paragraph-1",
    "#dream-case-0-paragraph-0",
    "#dream-case-0-paragraph-01",
    "#dream-case-5-paragraph-%34",
    "#dream-case-5-paragraph-1000",
  ])
    assert.equal(parseDreamReaderHash(hash), null);
  assert.equal(DREAM_CASES[0].paragraphs.length, 3);
});

test("restoring settings and native fragment arrivals never scroll, open or overwrite a bookmark", () => {
  const h = setup(JSON.stringify(saved));
  assert.equal(h.attributes.get("data-dream-reader-size"), "large");
  assert.equal(h.attributes.get("data-dream-reader-spacing"), "comfortable");
  assert.equal(h.writes.length, 0);
  h.fire("scroll");
  h.flush();
  h.fire("hashchange");
  h.fire("scroll");
  h.flush();
  h.fire("popstate");
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.states.at(-1).bookmark, saved.bookmark);
  h.controller.dispose();
});

test("a deliberate settled scroll saves only an actually visible open paragraph and avoids redundant state updates", () => {
  const h = setup();
  h.fire("wheel", { isTrusted: true });
  h.fire("scroll");
  h.flush();
  assert.deepEqual(h.states.at(-1).bookmark, { caseNo: "5", paragraph: 5 });
  assert.equal(h.writes[0][0], DREAM_READER_STORAGE_KEY);
  assert.equal(h.writes[0][1].version, 1);
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 1, "same visible paragraph never rerenders the reader control");
  h.fold.open = false;
  h.paragraphs[0].rect = { top: 150, bottom: 500 };
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 1, "closed paragraphs cannot become the reading position");
  h.controller.dispose();
});

test("a reading-room dialog blocks pending and new page captures, then ordinary reading resumes", () => {
  const h = setup(JSON.stringify(saved));
  h.fire("wheel", { isTrusted: true });
  assert.equal(h.timers.size, 1, "page scroll schedules a capture before opening the room");
  h.paragraphs[0].rect = { top: 150, bottom: 650 };
  h.dialogAttributes.set("data-dream-dialog-open", "true");
  h.flush();
  assert.equal(h.writes.length, 0, "a pending capture must recheck the dialog state");
  assert.deepEqual(h.states.at(-1).bookmark, saved.bookmark);

  h.fire("wheel", { isTrusted: true });
  h.fire("keydown", { key: "PageDown", isTrusted: true });
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 0, "wheel and key events inside the room cannot save page text");
  assert.equal(h.timers.size, 0);

  h.dialogAttributes.delete("data-dream-dialog-open");
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 0, "closing the room does not itself count as reading intent");
  h.fire("wheel", { isTrusted: true });
  h.fire("scroll");
  h.flush();
  assert.deepEqual(h.states.at(-1).bookmark, { caseNo: "5", paragraph: 1 });
  assert.equal(h.writes.length, 1);
  h.controller.dispose();
});

test("closing an untouched reading room by pointer protects the bookmark from restored page scroll", () => {
  const h = setup(JSON.stringify(saved));
  h.fire("wheel", { isTrusted: true });
  h.paragraphs[0].rect = { top: 150, bottom: 650 };
  h.dialogAttributes.set("data-dream-dialog-open", "true");
  h.flush();
  assert.equal(h.writes.length, 0, "the room blocks the page's pending capture");

  // No wheel, keyboard or save action occurs in the room. Document capture
  // sees its close button before the dialog releases the frozen page scroll.
  h.fire("click", {
    button: 0,
    isTrusted: true,
    target: { closest: (selector) => (selector === ".dream-reading-room" ? {} : null) },
  });
  h.dialogAttributes.delete("data-dream-dialog-open");
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 0, "restoring page scroll cannot reuse pre-room reading intent");
  assert.deepEqual(h.states.at(-1).bookmark, saved.bookmark);

  h.fire("wheel", { isTrusted: true });
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 1, "the next deliberate reading operation saves normally");
  assert.deepEqual(h.states.at(-1).bookmark, { caseNo: "5", paragraph: 1 });
  h.controller.dispose();
});

test("resume and other fragment jumps protect the stored target through intermediate scroll positions", () => {
  const h = setup(JSON.stringify(saved));
  h.fire("wheel", { isTrusted: true });
  h.fire("click", {
    button: 0,
    target: { closest: () => ({ target: "", hasAttribute: () => false }) },
  });
  h.paragraphs[0].rect = { top: 150, bottom: 650 };
  h.fire("scroll");
  h.flush();
  h.fire("hashchange");
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.states.at(-1).bookmark, saved.bookmark);
  h.fire("touchmove", { isTrusted: true });
  h.flush();
  assert.deepEqual(
    h.states.at(-1).bookmark,
    { caseNo: "5", paragraph: 1 },
    "fresh reader movement can choose a new position",
  );
  h.controller.dispose();
});

test("comfort changes and bookmark clearing persist independently and suppress layout-induced captures", () => {
  const h = setup(JSON.stringify(saved));
  h.fire("wheel", { isTrusted: true });
  h.controller.setSize("standard");
  h.controller.setSpacing("standard");
  h.fire("scroll");
  h.flush();
  assert.equal(h.writes.length, 2);
  assert.deepEqual(h.writes.at(-1)[1].bookmark, saved.bookmark);
  h.controller.clearBookmark();
  h.fire("scroll");
  h.flush();
  assert.equal(h.states.at(-1).bookmark, null);
  assert.equal(h.writes.at(-1)[1].bookmark, null);
  assert.equal(h.writes.at(-1)[1].size, "standard");
  h.controller.dispose();
  assert.equal(h.attributes.size, 0);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.docListeners.size, 0);
  assert.equal(h.timers.size, 0);
});

test("synthetic scroll intent, controls, hidden pages and cancelled timers cannot save a false position", () => {
  const h = setup();
  h.fire("wheel", { isTrusted: false });
  h.fire("scroll");
  h.flush();
  h.fire("keydown", { key: " ", target: { closest: () => ({ tagName: "BUTTON" }) } });
  h.flush();
  assert.equal(h.writes.length, 0);
  h.fire("keydown", { key: "PageDown", isTrusted: true });
  h.doc.hidden = true;
  h.fire("visibilitychange");
  h.flush();
  assert.equal(h.writes.length, 0);
  h.doc.hidden = false;
  h.fire("wheel", { isTrusted: true });
  h.fire("pagehide");
  h.flush();
  assert.equal(h.writes.length, 0);
  h.fire("wheel", { isTrusted: true });
  h.controller.dispose();
  h.flush();
  assert.equal(h.writes.length, 0);
});

test("malformed and denied storage preserve usable settings without crashing or auto-restoring navigation", () => {
  const malformed = setup("{broken");
  assert.equal(malformed.states[0].size, "standard");
  malformed.controller.setSize("large");
  assert.equal(malformed.writes[0][1].size, "large");
  malformed.controller.dispose();
  const denied = setup(null, true);
  assert.equal(denied.states[0].available, false);
  denied.controller.setSize("large");
  denied.controller.setSpacing("comfortable");
  assert.equal(denied.attributes.get("data-dream-reader-size"), "large");
  assert.equal(denied.states.at(-1).spacing, "comfortable");
  denied.controller.dispose();
});

test("paragraph native links open their chapter and use the existing keyboard focus contract", () => {
  const h = setup();
  h.fold.open = false;
  const rootListeners = new Map();
  const frames = new Map();
  let focused = 0;
  const paragraph = h.paragraphs[3];
  paragraph.focus = (options) => {
    assert.deepEqual(options, { preventScroll: true });
    focused++;
  };
  const root = {
    ...h.root,
    contains: (node) => node === paragraph || node === h.fold || node.isLink,
    querySelectorAll: () => (h.fold.open ? [h.fold] : []),
    addEventListener: (name, listener) => rootListeners.set(name, listener),
    removeEventListener: (name) => rootListeners.delete(name),
  };
  h.env.location.hash = "#dream-case-5-paragraph-4";
  h.env.requestAnimationFrame = (cb) => {
    frames.set(1, cb);
    return 1;
  };
  h.env.cancelAnimationFrame = (id) => frames.delete(id);
  let location;
  const cleanup = mountDreamChapterNavigation(
    root,
    (state) => {
      location = state;
    },
    h.env,
  );
  assert.equal(h.fold.open, true);
  assert.equal(location.current, "5");
  rootListeners.get("click")({
    button: 0,
    detail: 0,
    target: {
      closest: () => ({
        isLink: true,
        target: "",
        hasAttribute: () => false,
        getAttribute: () => "#dream-case-5-paragraph-4",
      }),
    },
  });
  frames.get(1)();
  assert.equal(focused, 1);
  cleanup();
  h.controller.dispose();
});

test("reader support stays outside the chapter index focus path and preferences target only synopsis paragraphs", () => {
  const component = readFileSync(
    new URL("../src/components/dream-chapter/dream-story-navigation.tsx", import.meta.url),
    "utf8",
  );
  const css = readFileSync(new URL("../src/styles-dream-reader.css", import.meta.url), "utf8");
  assert.ok(
    component.indexOf("<DreamReaderSupport onChange={setReader} />") <
      component.indexOf('id="dream-chapter-index"'),
  );
  assert.match(
    component,
    /href=\{`#dream-case-\$\{savedCase.no\}-paragraph-\$\{reader.bookmark.paragraph\}`\}/,
  );
  assert.match(css, /min-height: 44px/);
  assert.match(
    css,
    /data-dream-reader-size="large"[^]*?\.dream-story-case-body\s*>\s*\[data-dream-reading-paragraph\]/,
  );
  assert.match(css, /data-dream-reader-spacing="comfortable"[^]*?line-height: 2\.3/);
  assert.doesNotMatch(css, /position:\s*(?:fixed|sticky)/);
});
