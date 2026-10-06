import assert from "node:assert/strict";
import test from "node:test";
import { mountDreamChapterNavigation } from "../src/lib/dream-chapter-navigation.js";

function setup(hash = "#cases") {
  const rootListeners = new Map();
  const historyListeners = new Map();
  const frames = new Map();
  let frameId = 0;
  let focus = 0;
  const chapters = Array.from({ length: 6 }, (_, no) => ({
    dataset: { caseNo: String(no) },
    open: false,
    closest() {
      return this;
    },
    matches: (selector) => selector === "details",
    querySelector: () => ({
      focus: (options) => {
        assert.deepEqual(options, { preventScroll: true });
        focus++;
      },
    }),
  }));
  const chronicle = { ...chapters[3], dataset: {}, open: false };
  const note = { closest: () => null, matches: () => false, focus: () => focus++ };
  const targets = Object.fromEntries(chapters.map((chapter, no) => [`dream-case-${no}`, chapter]));
  targets["dream-chronicle-case-3"] = chronicle;
  targets["dream-case-note-3"] = note;
  targets["dream-chapter-index"] = note;
  const root = {
    ownerDocument: { getElementById: (id) => targets[id] },
    contains: (target) => Object.values(targets).includes(target) || target?.isLink,
    querySelectorAll: () => chapters.filter((chapter) => chapter.open),
    addEventListener: (name, listener, capture) => {
      assert.equal(capture, true);
      rootListeners.set(name, listener);
    },
    removeEventListener: (name) => rootListeners.delete(name),
  };
  const environment = {
    location: { hash },
    addEventListener: (name, listener) => historyListeners.set(name, listener),
    removeEventListener: (name) => historyListeners.delete(name),
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  let latest;
  const cleanup = mountDreamChapterNavigation(
    root,
    (value) => {
      latest = value;
    },
    environment,
  );
  const click = (href, options = {}) =>
    rootListeners.get("click")({
      button: 0,
      detail: 1,
      target: {
        closest: () => ({
          isLink: true,
          target: options.target ?? "",
          hasAttribute: () => false,
          getAttribute: () => href,
        }),
      },
      preventDefault: () => assert.fail("native navigation must retain history and scroll"),
      ...options,
    });
  return {
    chapters,
    chronicle,
    environment,
    rootListeners,
    historyListeners,
    cleanup,
    click,
    state: () => latest,
    focus: () => focus,
    flush: () => {
      [...frames.values()].forEach((callback) => callback());
      frames.clear();
    },
    frames,
  };
}

test("initial, native click and history targets open one fold without closing others", () => {
  const h = setup("#dream-case-2");
  assert.deepEqual(h.state(), { current: "2", open: ["2"] });
  h.click("#dream-case-4");
  assert.equal(h.chapters[2].open, true);
  assert.equal(h.chapters[4].open, true);
  h.environment.location.hash = "#dream-chronicle-case-3";
  h.historyListeners.get("hashchange")();
  assert.equal(h.chronicle.open, true);
  assert.deepEqual(h.state(), { current: "3", open: ["2", "4"] });
  h.environment.location.hash = "#dream-case-note-3";
  h.historyListeners.get("popstate")();
  assert.equal(h.state().current, "3");
  h.environment.location.hash = "#cases";
  h.historyListeners.get("popstate")();
  assert.equal(h.state().current, null);
  h.cleanup();
});

test("closing the URL chapter remains a native close and does not reopen it", () => {
  const h = setup("#dream-case-2");
  h.chapters[2].open = false;
  h.rootListeners.get("toggle")({ target: { matches: () => true } });
  assert.deepEqual(h.state(), { current: "2", open: [] });
  assert.equal(h.chapters[2].open, false);
  h.cleanup();
});

test("modified and new-tab clicks leave the current reader alone", () => {
  const h = setup();
  for (const options of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { shiftKey: true },
    { button: 1 },
    { defaultPrevented: true },
    { target: "_blank" },
  ])
    h.click("#dream-case-4", options);
  h.click("#dream-case-9");
  h.click("#dream-case-%E0");
  assert.deepEqual(h.state(), { current: null, open: [] });
  assert.equal(h.chapters[4].open, false);
  h.cleanup();
});

test("keyboard links move focus without scrolling; cleanup cancels pending focus", () => {
  const h = setup();
  h.click("#dream-case-4", { detail: 0 });
  h.environment.location.hash = "#dream-case-4";
  h.historyListeners.get("hashchange")();
  h.flush();
  assert.equal(h.focus(), 1);
  h.click("#dream-case-3", { detail: 0 });
  h.click("#dream-case-4");
  h.flush();
  assert.equal(h.focus(), 1, "a later pointer jump cancels the earlier keyboard focus");
  h.click("#dream-case-3", { detail: 0 });
  h.environment.location.hash = "#cases";
  h.historyListeners.get("popstate")();
  h.flush();
  assert.equal(h.focus(), 1, "history owns focus after traversal");
  h.click("#dream-case-3", { detail: 0 });
  h.cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.rootListeners.size, 0);
  assert.equal(h.historyListeners.size, 0);
});

test("the chapter index receives keyboard focus, clears current location and cleans up", () => {
  const h = setup("#dream-case-2");
  h.click("#dream-chapter-index", { detail: 0 });
  assert.deepEqual(h.state(), { current: null, open: ["2"] });
  h.environment.location.hash = "#dream-chapter-index";
  h.historyListeners.get("hashchange")();
  h.flush();
  assert.equal(h.focus(), 1, "index focus is explicit rather than browser-dependent");
  h.click("#dream-chapter-index", { detail: 0 });
  h.cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.rootListeners.size, 0);
  assert.equal(h.historyListeners.size, 0);
});
