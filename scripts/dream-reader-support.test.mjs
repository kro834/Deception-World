import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DREAM_READER_STORAGE_KEY,
  mountDreamReader,
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

function setup(value = null, denied = false) {
  const listeners = new Map();
  const docListeners = new Map();
  const timers = new Map();
  let timerId = 0;
  const writes = [];
  const attributes = new Map();
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
  for (const bookmark of [
    null,
    {},
    { caseNo: "0", paragraph: 4 },
    { caseNo: "5", paragraph: 7 },
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
    component.indexOf("<DreamReaderSupport />") < component.indexOf('id="dream-chapter-index"'),
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
