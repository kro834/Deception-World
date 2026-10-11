import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../public/archive-zeus-bridge.js", import.meta.url), "utf8");

function mountBridge() {
  let serial = 0,
    layoutReads = 0,
    walks = 0;
  const timers = new Map(),
    reports = [],
    visibilityChecks = [];
  const rect = { left: 18, top: 120, right: 180, bottom: 144, width: 162, height: 24 };
  const visible = {
    parentElement: null,
    checkVisibility(options) {
      visibilityChecks.push(options);
      return true;
    },
    getBoundingClientRect() {
      layoutReads++;
      return rect;
    },
  };
  const skipped = {
    parentElement: null,
    // The native API returns true for skipped content-visibility:auto
    // content unless callers explicitly request the additional check.
    checkVisibility(options) {
      visibilityChecks.push(options);
      return options?.contentVisibilityAuto !== true;
    },
    getBoundingClientRect() {
      throw new Error("A content-visibility:auto skipped record was laid out");
    },
  };
  const closed = {
    parentElement: null,
    checkVisibility(options) {
      visibilityChecks.push(options);
      return false;
    },
    getBoundingClientRect() {
      throw new Error("A closed record was laid out");
    },
  };
  const doc = new EventTarget(),
    win = new EventTarget();
  Object.assign(doc, {
    hidden: false,
    readyState: "complete",
    scrollingElement: { scrollTop: 0, scrollHeight: 2000 },
    querySelectorAll(selector) {
      if (selector.startsWith("h1,")) return [closed, skipped, visible];
      if (selector.startsWith(".mobile-dock")) return [closed, skipped];
      return [];
    },
    createRange: () => ({ selectNodeContents() {}, getClientRects: () => [rect] }),
    createTreeWalker() {
      walks++;
      let seen = false;
      return {
        nextNode: () =>
          seen ? null : ((seen = true), { nodeValue: "SAGA", parentElement: visible }),
      };
    },
  });
  Object.assign(win, {
    parent: { postMessage: (report) => reports.push(report) },
    innerWidth: 390,
    innerHeight: 844,
    getComputedStyle: () => ({ visibility: "visible", opacity: "1", fontSize: "16px" }),
    setTimeout(fn) {
      timers.set(++serial, fn);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  runInNewContext(source, { window: win, document: doc, NodeFilter: { SHOW_TEXT: 4 } });
  return {
    win,
    doc,
    timers,
    reports,
    visibilityChecks,
    reads: () => layoutReads,
    walks: () => walks,
    flush() {
      for (const [id, fn] of [...timers]) {
        timers.delete(id);
        fn();
      }
    },
  };
}

test("the archive bridge never lays out closed or content-visibility-skipped records", () => {
  const ui = mountBridge();
  ui.flush();
  assert.equal(ui.reports.length, 1);
  assert.equal(ui.walks(), 1, "only the visible title's text is measured");
  assert.deepEqual(Array.from(ui.reports[0].words[0]), [18, 120, 180, 144]);
  assert.equal(ui.reports[0].controls.length, 0);
});

test("the bridge requests contentVisibilityAuto before title, text and control geometry", () => {
  const ui = mountBridge();
  ui.flush();
  assert.equal(ui.visibilityChecks.length, 6);
  assert.ok(
    ui.visibilityChecks.every((options) => options?.contentVisibilityAuto === true),
    "native checkVisibility defaults this option to false",
  );
});

test("a burst of archive scrolls still reports once after settling", () => {
  const ui = mountBridge();
  ui.flush();
  const reads = ui.reads();
  for (let i = 0; i < 100; i++) ui.win.dispatchEvent(new Event("scroll"));
  assert.equal(ui.timers.size, 1);
  assert.equal(ui.reads(), reads, "scroll events perform no synchronous geometry reads");
  ui.flush();
  assert.equal(ui.reports.length, 2);
  assert.equal(
    ui.reports[1].reason,
    "scroll",
    "a scroll still releases a manually dropped position",
  );
});

test("the suspended bridge avoids geometry work, then refreshes on foreground return", () => {
  const ui = mountBridge();
  ui.doc.hidden = true;
  ui.flush();
  assert.equal(ui.reads(), 0);
  assert.equal(ui.reports.length, 0);
  ui.doc.hidden = false;
  ui.doc.dispatchEvent(new Event("visibilitychange"));
  ui.flush();
  assert.equal(ui.reports.length, 1);
  assert.equal(ui.reports[0].reason, "change");
});

test("a BFCache pageshow sends a fresh placement report without waiting for another tap", () => {
  const ui = mountBridge();
  ui.flush();
  ui.win.dispatchEvent(new Event("pageshow"));
  ui.flush();
  assert.equal(ui.reports.length, 2);
  assert.equal(ui.reports[1].reason, "load");
});
