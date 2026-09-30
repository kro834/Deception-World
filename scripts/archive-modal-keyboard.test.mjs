import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRealmArchiveMotion } from "./build-realm-archive-motion.mjs";

const master = readFileSync(
  new URL("../archives/saga-form-archive-standalone.html", import.meta.url),
  "utf8",
);
const keydownListener = master.match(
  / {2}document\.addEventListener\('keydown', event => \{[\s\S]*?\n {2}\}\);/,
)?.[0];
assert.ok(keydownListener, "archive keyboard listener exists");

test("the generated Realm controller keeps the same modal keyboard guard", () => {
  assert.ok(createRealmArchiveMotion(master).includes(keydownListener));
});

function keyboardHarness({ lightboxOpen = false, sheetIsOpen = false } = {}) {
  const calls = [];
  let listener;
  const context = vm.createContext({
    document: {
      addEventListener(_name, callback) {
        listener = callback;
      },
      activeElement: null,
    },
    lightbox: { hasAttribute: () => lightboxOpen },
    sheetOpen: sheetIsOpen,
    closeSelectorSheet: () => calls.push("close-sheet"),
    openSelectorSheet: () => calls.push("open-sheet"),
    selector: { querySelectorAll: () => [] },
    searchInput: { focus: () => calls.push("focus-search") },
    reducedMotion: { matches: true },
    window: {
      matchMedia: () => ({ matches: true }),
      setTimeout: (callback) => callback(),
    },
    HTMLInputElement: class {},
    HTMLTextAreaElement: class {},
    HTMLSelectElement: class {},
  });
  vm.runInContext(keydownListener, context);
  return {
    calls,
    press(key) {
      let prevented = false;
      listener({
        key,
        target: {},
        preventDefault: () => {
          prevented = true;
        },
      });
      return prevented;
    },
  };
}

test("an enlarged archive image owns search, Tab, and Escape keys", () => {
  for (const sheetIsOpen of [false, true]) {
    const harness = keyboardHarness({ lightboxOpen: true, sheetIsOpen });
    for (const key of ["/", "Tab", "Escape"]) {
      assert.equal(harness.press(key), false, `${key} stays with the visible modal`);
    }
    assert.deepEqual(harness.calls, []);
  }
});

test("search and selector Escape keep working when no image modal is open", () => {
  const search = keyboardHarness();
  assert.equal(search.press("/"), true);
  assert.deepEqual(search.calls, ["open-sheet", "focus-search"]);

  const sheet = keyboardHarness({ sheetIsOpen: true });
  assert.equal(sheet.press("Escape"), true);
  assert.deepEqual(sheet.calls, ["close-sheet"]);
});
