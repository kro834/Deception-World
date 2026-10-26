import assert from "node:assert/strict";
import test from "node:test";
import { watchSideMenuSwipeLifecycle } from "../src/lib/side-menu-swipe-lifecycle.js";

function fixture() {
  const win = new EventTarget();
  const doc = new EventTarget();
  win.innerWidth = 834;
  doc.hidden = false;
  let held = true;
  let offset = 65;
  let cancellations = 0;
  const stop = watchSideMenuSwipeLifecycle(
    () => {
      held = false;
      offset = 0;
      cancellations++;
    },
    win,
    doc,
  );
  return { win, doc, stop, state: () => ({ held, offset, cancellations }) };
}

test("a captured menu swipe is cancelled on rotation and split-width changes without pointercancel", () => {
  for (const width of [1194, 507, 390]) {
    const f = fixture();
    f.win.innerWidth = width;
    f.win.dispatchEvent(new Event("resize"));
    assert.deepEqual(f.state(), { held: false, offset: 0, cancellations: 1 });
    // A trailing resize from the same rotation must not cancel a new gesture.
    f.win.dispatchEvent(new Event("resize"));
    assert.equal(f.state().cancellations, 1);
    f.stop();
  }
});

test("toolbar-only height changes preserve the swipe but orientation signals cancel it", () => {
  const f = fixture();
  f.win.innerHeight = 950;
  f.win.dispatchEvent(new Event("resize"));
  assert.deepEqual(f.state(), { held: true, offset: 65, cancellations: 0 });
  f.win.dispatchEvent(new Event("orientationchange"));
  assert.equal(f.state().offset, 0);
  f.stop();
});

test("leaving the app cancels a held swipe and teardown removes every listener", () => {
  for (const type of ["blur", "pagehide", "visibilitychange"]) {
    const f = fixture();
    if (type === "visibilitychange") {
      f.doc.dispatchEvent(new Event(type));
      assert.equal(f.state().cancellations, 0);
      f.doc.hidden = true;
      f.doc.dispatchEvent(new Event(type));
    } else f.win.dispatchEvent(new Event(type));
    assert.equal(f.state().cancellations, 1);
    f.stop();
    const stopped = f.state().cancellations;
    f.win.innerWidth = 390;
    for (const event of ["resize", "orientationchange", "blur", "pagehide"]) {
      f.win.dispatchEvent(new Event(event));
    }
    f.doc.dispatchEvent(new Event("visibilitychange"));
    assert.equal(f.state().cancellations, stopped);
  }
});
