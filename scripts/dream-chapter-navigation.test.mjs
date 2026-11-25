import assert from "node:assert/strict";
import test from "node:test";
import { mountDreamChapterNavigation } from "../src/lib/dream-chapter-navigation.js";

function setup(hash = "#cases") {
  const rootListeners = new Map();
  const historyListeners = new Map();
  const frames = new Map();
  let frameId = 0;
  let focus = 0;
  const landings = [];
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
  const chronicle = { ...chapters[3], id: "dream-chronicle-case-3", dataset: {}, open: false };
  const note = { closest: () => null, matches: () => false, focus: () => focus++ };
  const targets = Object.fromEntries(chapters.map((chapter, no) => [`dream-case-${no}`, chapter]));
  targets["dream-chronicle-case-3"] = chronicle;
  targets["dream-case-note-3"] = note;
  targets["dream-case-note-5"] = { ...note };
  targets["dream-chronicle-case-5"] = { ...chronicle, id: "dream-chronicle-case-5" };
  targets["dream-chapter-index"] = note;
  targets["dream-chronicle-event-25"] = {
    closest: () => chronicle,
    matches: (selector) => selector === ".dream-chronicle-item",
    focus: () => focus++,
  };
  for (const [id, target] of Object.entries(targets)) {
    target.scrollIntoView = (options) => {
      assert.deepEqual(options, { block: "start", behavior: "instant" });
      assert.ok(target.closest("details")?.open, "open before aligning the destination");
      landings.push(id);
    };
  }
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
    innerHeight: 740,
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
          closest: () => null,
        }),
      },
      preventDefault: () => assert.fail("native navigation must retain history and scroll"),
      ...options,
    });
  return {
    chapters,
    landings,
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

test("a precise chronicle event opens its parent case and retains native fragment focus", () => {
  const h = setup("#dream-chronicle-event-25");
  assert.equal(h.chronicle.open, true);
  assert.deepEqual(h.state(), { current: "3", open: [] });
  h.click("#dream-chronicle-event-25", { detail: 0 });
  h.flush();
  assert.equal(h.focus(), 1);
  h.cleanup();
});

test("closing the URL chapter remains a native close and does not reopen it", () => {
  const h = setup("#dream-case-2");
  h.chapters[2].open = false;
  h.rootListeners.get("toggle")({ target: { matches: () => true } });
  assert.deepEqual(h.state(), { current: "2", open: [] });
  assert.equal(h.chapters[2].open, false);
  h.historyListeners.get("hashchange")();
  assert.equal(
    h.chapters[2].open,
    false,
    "late duplicate history events cannot undo a native close",
  );
  h.cleanup();
});

test("late native fragment focus is repaired without stealing the next keyboard action", () => {
  const h = setup();
  h.click("#dream-chronicle-case-3", { detail: 0 });
  h.environment.location.hash = "#dream-chronicle-case-3";
  h.flush();
  h.historyListeners.get("hashchange")();
  h.flush();
  assert.equal(h.focus(), 2, "the target receives focus after native fragment navigation settles");
  h.rootListeners.get("keydown")();
  h.historyListeners.get("hashchange")();
  h.flush();
  assert.equal(h.focus(), 2, "Tab/Space/Enter belongs to the reader, not a delayed focus callback");
  h.cleanup();
});

test("focusing the next link cancels the previous frame before Enter can be stolen", () => {
  const h = setup();
  h.click("#dream-case-note-3", { detail: 0 });
  h.environment.location.hash = "#dream-case-note-3";
  h.rootListeners.get("focusin")({ target: { tagName: "A" } });
  h.flush();
  h.historyListeners.get("hashchange")();
  h.flush();
  assert.equal(h.focus(), 0, "the new link keeps focus through the old hashchange");
  h.click("#dream-chronicle-case-3", { detail: 0 });
  assert.equal(h.chronicle.open, true);
  h.cleanup();
});

test("a delayed hashchange after a keyboard return does not undo the next native close", () => {
  const h = setup("#dream-chronicle-case-3");
  h.click("#dream-case-3", { detail: 0 });
  h.environment.location.hash = "#dream-case-3";
  h.flush();
  h.chapters[3].open = false;
  h.rootListeners.get("toggle")({ target: { matches: () => true } });
  h.historyListeners.get("popstate")();
  h.historyListeners.get("hashchange")();
  assert.equal(h.chapters[3].open, false);
  assert.deepEqual(h.state(), { current: "3", open: [] });
  h.environment.location.hash = "#dream-case-2";
  h.historyListeners.get("popstate")();
  assert.equal(h.chapters[2].open, true, "a genuinely new history target still opens");
  h.click("#dream-case-3", { detail: 0 });
  assert.equal(h.chapters[3].open, true, "an explicit revisit still opens the chapter");
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

test("cold event links and history restore a closed case before aligning and focusing it", () => {
  const event = "#dream-chronicle-event-25";
  const fold = "#dream-chronicle-case-3";
  const h = setup(event);
  h.flush();
  assert.deepEqual(h.landings, [event.slice(1)]);
  assert.equal(h.focus(), 1);
  for (const hash of [fold, event]) {
    h.chronicle.open = false;
    h.environment.location.hash = hash;
    h.historyListeners.get("popstate")();
    h.historyListeners.get("hashchange")();
    h.flush();
    assert.equal(h.landings.at(-1), hash.slice(1));
    assert.ok(h.chronicle.open);
  }
  assert.equal(h.landings.length, 3);
  assert.equal(h.focus(), 3);
  h.environment.location.hash = fold;
  h.historyListeners.get("popstate")();
  h.historyListeners.get("wheel")();
  h.flush();
  assert.equal(h.landings.length, 3, "a new reading gesture cancels a pending history landing");
  h.cleanup();
});

test("Back from a record returns focus to the search result, Forward to its case", () => {
  const origin = "#dream-record-explorer";
  const hash = "#dream-chronicle-event-25";
  const h = setup(origin);
  let returnedFocus = 0;
  let returnedScroll = 0;
  let resultTop = 1000;
  const link = {
    isLink: true,
    closest: (selector) => (selector === "details" ? null : link),
    matches: () => false,
    hasAttribute: () => false,
    getAttribute: () => hash,
    focus: () => returnedFocus++,
    getBoundingClientRect: () => ({ top: resultTop, bottom: resultTop + 44 }),
    scrollIntoView: () => returnedScroll++,
  };
  h.click(hash, { target: { closest: () => link }, detail: 0 });
  h.environment.location.hash = hash;
  h.historyListeners.get("hashchange")();
  h.flush();
  h.environment.location.hash = origin;
  h.historyListeners.get("popstate")();
  h.flush();
  assert.equal(returnedFocus, 1);
  assert.equal(returnedScroll, 1);
  h.chronicle.open = false;
  h.environment.location.hash = hash;
  h.historyListeners.get("popstate")();
  h.flush();
  assert.deepEqual(h.landings, [hash.slice(1)]);
  resultTop = 340;
  h.environment.location.hash = origin;
  h.historyListeners.get("popstate")();
  h.flush();
  assert.equal(returnedFocus, 2);
  assert.equal(returnedScroll, 1, "a visible result keeps its restored viewport position");
  h.cleanup();
});

const note5 = "#dream-case-note-5";
const chronicle5 = "#dream-chronicle-case-5";

function visit(h, hash, key) {
  h.environment.location.hash = hash;
  h.environment.navigation = { currentEntry: { key } };
  h.historyListeners.get("popstate")();
  h.historyListeners.get("hashchange")();
}

function followCrossLink(h, href, key, sourceClass = ".dream-reader-backlinks") {
  const link = {
    isLink: true,
    focused: 0,
    top: 347,
    closest: (selector) => (selector.split(", ").includes(sourceClass) ? link : null),
    matches: () => false,
    hasAttribute: () => false,
    getAttribute: () => href,
    getBoundingClientRect: () => ({ top: link.top, bottom: link.top + 44, height: 44 }),
    focus: (options) => {
      assert.deepEqual(options, { preventScroll: true });
      link.focused++;
    },
    scrollIntoView: () => assert.fail("Back must keep the restored reading position"),
  };
  h.click(href, { target: { closest: () => link }, detail: 0 });
  visit(h, href, key);
  h.flush();
  return link;
}

test("Case 5 reciprocal links restore the exact opener on each Back and the destination on Forward", () => {
  const h = setup(note5);
  visit(h, note5, "first-note");
  const eventsLink = followCrossLink(h, chronicle5, "chronicle");
  const noteLink = followCrossLink(h, note5, "second-note");

  visit(h, chronicle5, "chronicle");
  h.flush();
  assert.equal(noteLink.focused, 1);
  visit(h, note5, "first-note");
  h.flush();
  assert.equal(eventsLink.focused, 1);
  assert.deepEqual(h.landings, []);

  visit(h, chronicle5, "chronicle");
  h.flush();
  assert.deepEqual(h.landings, [chronicle5.slice(1)]);
  const focusBeforeForward = h.focus();
  visit(h, note5, "second-note");
  h.flush();
  assert.equal(h.focus(), focusBeforeForward + 1, "Forward focuses the destination note");
  assert.equal(eventsLink.focused, 1, "a later visit to the same hash is a distinct entry");
  h.cleanup();
});

test("Back puts the synopsis link back at its reading position if native scrolling leaves it offscreen", () => {
  const h = setup(note5);
  visit(h, note5, "note");
  const link = followCrossLink(h, chronicle5, "chronicle");
  h.environment.scrollBy = (options) => {
    assert.deepEqual(options, { top: -13234, behavior: "instant" });
    link.top -= options.top;
  };
  link.top = -12887;
  visit(h, note5, "note");
  h.flush();
  assert.equal(link.top, 347);
  assert.equal(link.focused, 1);
  h.cleanup();
});

test("jumping between two visits to the same synopsis keeps Back and Forward in history order", () => {
  const h = setup(note5);
  visit(h, note5, "first-note");
  const eventsLink = followCrossLink(h, chronicle5, "chronicle");
  const noteLink = followCrossLink(h, note5, "second-note");

  visit(h, note5, "first-note");
  h.flush();
  assert.equal(eventsLink.focused, 1);
  visit(h, chronicle5, "chronicle");
  h.flush();
  assert.deepEqual(h.landings, [chronicle5.slice(1)]);
  assert.equal(noteLink.focused, 0, "Forward to the chronicle cannot restore its outgoing link");

  visit(h, note5, "first-note");
  h.flush();
  assert.equal(eventsLink.focused, 2);
  const focusBeforeSkip = h.focus();
  visit(h, note5, "second-note");
  h.flush();
  assert.equal(h.focus(), focusBeforeSkip + 1, "Forward two entries focuses the second visit");
  assert.equal(eventsLink.focused, 2);
  h.cleanup();
});

test("a missing or repurposed opener never aligns the old chronicle on Back", () => {
  for (const changeLink of [
    (link) => {
      link.isLink = false;
    },
    (link) => {
      link.getAttribute = () => "#dream-case-1";
    },
  ]) {
    const h = setup(chronicle5);
    visit(h, chronicle5, "chronicle");
    const link = followCrossLink(h, note5, "note");
    visit(h, chronicle5, "chronicle");
    changeLink(link); // React can update the source after popstate and before the focus frame.
    h.flush();
    assert.equal(link.focused, 0);
    assert.deepEqual(h.landings, []);
    h.cleanup();
  }
});

test("a new reading gesture cancels the pending return to a synopsis cross-link", () => {
  for (const gesture of ["keydown", "pointerdown", "focusin", "wheel"]) {
    const h = setup("#dream-case-5");
    const link = followCrossLink(h, note5, "note", ".dream-reader-related");
    visit(h, "#dream-case-5", "chapter");
    const listener = h.rootListeners.get(gesture) ?? h.historyListeners.get(gesture);
    listener({ target: { tagName: "A" } });
    h.historyListeners.get("hashchange")();
    h.flush();
    assert.equal(link.focused, 0, gesture);
    assert.deepEqual(h.landings, []);
    h.cleanup();
  }
});
