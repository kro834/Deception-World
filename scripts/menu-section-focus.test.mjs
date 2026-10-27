import assert from "node:assert/strict";
import test from "node:test";
import { focusMenuSectionAfterNavigation } from "../src/lib/menu-section-focus.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function fixture({ existingTabindex = false, reject = false } = {}) {
  const doc = new EventTarget();
  doc.documentElement = { dataset: { sideMenuOpen: "true" } };
  const win = new EventTarget();
  win.location = { pathname: "/search", hash: "#search-title" };
  let serial = 0,
    frames = new Map(),
    listener,
    navigations = 0,
    resolveNavigation;
  const target = new EventTarget();
  const attrs = new Map(existingTabindex ? [["tabindex", "0"]] : []);
  target.isConnected = true;
  target.matches = () => attrs.has("tabindex");
  target.closest = () => (doc.documentElement.dataset.sideMenuOpen === "true" ? {} : null);
  target.setAttribute = (name, value) => attrs.set(name, value);
  target.removeAttribute = (name) => attrs.delete(name);
  target.focus = (options) => {
    doc.activeElement = target;
    target.focusOptions = options;
  };
  doc.getElementById = (id) => (id === "record-results-heading" ? target : null);
  win.requestAnimationFrame = (callback) => {
    frames.set(++serial, callback);
    return serial;
  };
  win.cancelAnimationFrame = (id) => frames.delete(id);
  const cancel = focusMenuSectionAfterNavigation({
    pathname: "/search",
    id: "record-results-heading",
    doc,
    win,
    watchNavigation(callback) {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
    navigate() {
      navigations++;
      if (reject) throw new Error("navigation cancelled");
      win.location.hash = "#record-results-heading";
      listener?.("/search", "record-results-heading");
      return new Promise((resolve) => {
        resolveNavigation = resolve;
      });
    },
  });
  return {
    doc,
    win,
    target,
    attrs,
    cancel,
    navigations: () => navigations,
    frameCount: () => frames.size,
    watchCount: () => Number(Boolean(listener)),
    navigateElsewhere: (path, hash) => listener?.(path, hash),
    finish: async () => {
      await flush();
      resolveNavigation?.();
      await flush();
    },
    unlock: () => {
      delete doc.documentElement.dataset.sideMenuOpen;
    },
    frame: () => {
      const pending = [...frames.values()];
      frames = new Map();
      pending.forEach((callback) => callback());
    },
  };
}

test("keyboard focus waits for navigation and menu release without changing the landing scroll", async () => {
  const f = fixture();
  await f.finish();
  f.frame();
  assert.equal(f.doc.activeElement, undefined);
  assert.equal(f.frameCount(), 1);
  f.unlock();
  f.frame();
  assert.equal(f.doc.activeElement, f.target);
  assert.equal(f.target.focusOptions.preventScroll, true);
  assert.equal(f.attrs.get("tabindex"), "-1");
  assert.equal(f.watchCount(), 0);
  f.target.dispatchEvent(new Event("blur"));
  assert.equal(f.attrs.has("tabindex"), false);
  f.attrs.set("tabindex", "0");
  f.cancel();
  assert.equal(f.attrs.get("tabindex"), "0", "later focusability is not removed by old cleanup");
});

test("existing target tabindex stays intact through blur and cancellation", async () => {
  const f = fixture({ existingTabindex: true });
  await f.finish();
  f.unlock();
  f.frame();
  f.target.dispatchEvent(new Event("blur"));
  f.cancel();
  assert.equal(f.attrs.get("tabindex"), "0");
});

for (const event of ["pointerdown", "keydown", "wheel"]) {
  test(`later ${event} cancels pending keyboard focus`, async () => {
    const f = fixture();
    await flush();
    f.doc.dispatchEvent(new Event(event));
    await f.finish();
    f.unlock();
    f.frame();
    assert.equal(f.doc.activeElement, undefined);
    assert.equal(f.frameCount(), 0);
    assert.equal(f.watchCount(), 0);
  });
}

test("another route, Back and unmount each cancel pending focus", async () => {
  for (const cancel of [
    (f) => f.navigateElsewhere("/library", "my-library"),
    (f) => f.win.dispatchEvent(new Event("popstate")),
    (f) => f.cancel(),
  ]) {
    const f = fixture();
    await flush();
    cancel(f);
    await f.finish();
    f.unlock();
    f.frame();
    assert.equal(f.doc.activeElement, undefined);
    assert.equal(f.watchCount(), 0);
  }
});

test("failed navigation, missing target and malformed destination leave no focus job", async () => {
  const failed = fixture({ reject: true });
  await flush();
  assert.equal(failed.watchCount(), 0);
  for (const mutate of [
    (f) => {
      f.target.isConnected = false;
    },
    (f) => {
      f.win.location.hash = "#%broken";
    },
    (f) => {
      f.win.location.pathname = "/library";
    },
  ]) {
    const f = fixture();
    await f.finish();
    f.unlock();
    mutate(f);
    f.frame();
    assert.equal(f.doc.activeElement, undefined);
    assert.equal(f.frameCount(), 0);
    assert.equal(f.watchCount(), 0);
  }
});

test("an unreleased menu has a finite retry budget and never steals focus", async () => {
  const f = fixture();
  await f.finish();
  for (let i = 0; i < 15; i++) f.frame();
  assert.equal(f.frameCount(), 0);
  assert.equal(f.watchCount(), 0);
  assert.equal(f.doc.activeElement, undefined);
});
