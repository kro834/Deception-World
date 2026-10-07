import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  galleryAdjacentId,
  galleryLayoutTop,
  galleryRevealDelta,
  gallerySwipeStep,
  galleryViewerSequence,
  readGalleryViewerRecord,
  settleGalleryViewerReturn,
} from "../src/components/gallery/gallery-viewer-state.ts";

test("keyboard focus reveals only a clipped control within its settings viewport", () => {
  const viewport = { top: 43, bottom: 367 };
  assert.equal(galleryRevealDelta({ top: 366, bottom: 410 }, viewport), 43);
  assert.equal(galleryRevealDelta({ top: 10, bottom: 54 }, viewport), -33);
  assert.equal(galleryRevealDelta({ top: 200, bottom: 244 }, viewport), 0);
});

test("return anchor uses document layout rather than entrance animation or frozen body offsets", () => {
  const body = { offsetTop: 0, offsetParent: null };
  const page = { offsetTop: 78, offsetParent: body };
  const card = { offsetTop: 9600, offsetParent: page };
  const link = { offsetTop: 2, offsetParent: card, ownerDocument: { body } };
  assert.equal(galleryLayoutTop(link), 9680);
  body.offsetTop = -9500;
  assert.equal(galleryLayoutTop(link), 9680);
  card.offsetTop += 420;
  assert.equal(galleryLayoutTop(link), 10100);
});

test("viewer keeps a filtered/reversed sequence without mutating discovery or changing categories", () => {
  const all = ["a", "b", "c"].map((id) => ({ id }));
  const filtered = [all[2], all[0]];
  const session = galleryViewerSequence(all, filtered, all[0]);
  assert.deepEqual(session, filtered);
  assert.notEqual(session, filtered);
  assert.equal(
    galleryAdjacentId(
      session.map((work) => work.id),
      "a",
      1,
    ),
    "c",
  );
  assert.equal(
    galleryAdjacentId(
      session.map((work) => work.id),
      "c",
      -1,
    ),
    "a",
  );
  assert.deepEqual(galleryViewerSequence(all, filtered, all[1]), all);
  assert.deepEqual(filtered, [all[2], all[0]]);
  assert.equal(galleryAdjacentId([], "a", 1), null);
  assert.equal(galleryAdjacentId(["a"], "a", -1), null);
  assert.equal(galleryAdjacentId(["a", "b"], "missing", -1), null);
});

test("Back/Forward records validate all fields and tolerate old boolean entries safely", () => {
  const record = { id: "b", ids: ["a", "b", "b"], position: { top: 8240.5, left: 0 } };
  assert.deepEqual(readGalleryViewerRecord(record), { ...record, ids: ["a", "b"] });
  for (const value of [
    true,
    null,
    {},
    { ...record, id: "gone" },
    { ...record, ids: [1] },
    { ...record, position: { top: NaN, left: 0 } },
    { ...record, position: { top: -1, left: 0 } },
    { ...record, ids: Array(1001).fill("b") },
  ]) {
    assert.equal(readGalleryViewerRecord(value), null);
  }
});

test("horizontal swipes move one work; vertical, slow, diagonal and browser-edge gestures do not", () => {
  const start = { x: 200, y: 350, at: 1000 };
  assert.equal(gallerySwipeStep(start, { x: 80, y: 360, at: 1300 }, 390), 1);
  assert.equal(gallerySwipeStep(start, { x: 310, y: 350, at: 1300 }, 390), -1);
  assert.equal(gallerySwipeStep(start, { x: 205, y: 510, at: 1300 }, 390), 0);
  assert.equal(gallerySwipeStep(start, { x: 80, y: 470, at: 1300 }, 390), 0);
  assert.equal(gallerySwipeStep(start, { x: 80, y: 350, at: 1900 }, 390), 0);
  assert.equal(gallerySwipeStep({ ...start, x: 10 }, { x: 200, y: 350, at: 1300 }, 390), 0);
  assert.equal(gallerySwipeStep(start, { x: 170, y: 350, at: 1300 }, 390), 0);
});

function returnHarness() {
  const log = [];
  let rendered;
  let timeout;
  const finish = settleGalleryViewerReturn({
    subscribeRendered(done) {
      log.push("subscribe");
      rendered = done;
      return () => log.push("unsubscribe");
    },
    schedule(done) {
      log.push("schedule");
      timeout = done;
      return () => log.push("cancel");
    },
    leaveEntry() {
      log.push("back");
    },
    finish() {
      log.push("release");
    },
  });
  return { log, finish, rendered: () => rendered(), timeout: () => timeout() };
}

test("close observes the router before Back, retains the lock, and releases exactly once", () => {
  const harness = returnHarness();
  assert.deepEqual(harness.log, ["subscribe", "schedule", "back"]);
  harness.rendered();
  assert.deepEqual(harness.log, [
    "subscribe",
    "schedule",
    "back",
    "unsubscribe",
    "cancel",
    "release",
  ]);
  harness.timeout();
  harness.finish();
  assert.equal(harness.log.filter((item) => item === "release").length, 1);
});

test("fallback and reopening/unmount cancel old restoration before a new session owns the page", () => {
  for (const action of ["timeout", "finish"]) {
    const harness = returnHarness();
    harness[action]();
    harness.rendered();
    assert.equal(harness.log.filter((item) => item === "release").length, 1);
  }
});

test("gallery uses the shared server-rendered viewport cover outside its paint clip", () => {
  const css = readFileSync(new URL("../src/styles-gallery.css", import.meta.url), "utf8");
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  const page = readFileSync(
    new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    root,
    /<body[^>]*>\s*<SkipLink \/>\s*<ContentProtection \/>\s*\{chrome && <div className="viewport-chrome-cover" aria-hidden="true" \/>\}/,
  );
  assert.doesNotMatch(page, /createPortal|gallery-statusbar-cover/);
  const header = css.match(/\.gallery-topbar \{[\s\S]*?\n\}/)[0];
  assert.match(header, /background: #171614;/);
  assert.match(header, /backdrop-filter: none;/);
});

test("short viewers reclaim the site's generic footer padding and keep collapsed tools on one row", () => {
  const css = readFileSync(new URL("../src/styles-gallery.css", import.meta.url), "utf8");
  const footer = [...css.matchAll(/\.gallery-viewer-footer \{([\s\S]*?)\n\}/g)]
    .map((match) => match[1])
    .find((rule) => rule.includes("min-height: 58px"));
  assert.match(footer, /padding: 14px 0 0;/);
  assert.match(footer, /background: transparent;/);
  assert.match(css, /\.gallery-viewer-tools:not\(\[open\]\) \{\s*flex-basis: auto;/);
});
