import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { IPAD_STANDALONE_VIEWPORT_SCRIPT } from "../src/lib/ipad-standalone-viewport.js";

function run(userAgent, maxTouchPoints, standalone, displayMode = false, preference = null) {
  let content =
    "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content";
  const attributes = {};
  let onHeadChange;
  vm.runInNewContext(IPAD_STANDALONE_VIEWPORT_SCRIPT, {
    window: {
      navigator: { userAgent, maxTouchPoints, standalone },
      get localStorage() {
        if (preference === "denied") throw new Error("Storage denied");
        return { getItem: () => preference };
      },
      matchMedia: () => ({ matches: displayMode }),
      MutationObserver: class {
        constructor(callback) {
          onHeadChange = callback;
        }
        observe() {}
      },
    },
    document: {
      querySelector: () => ({
        getAttribute: () => content,
        setAttribute: (_, value) => {
          content = value;
        },
      }),
      documentElement: {
        setAttribute: (key, value) => {
          attributes[key] = value;
        },
      },
    },
  });
  return {
    content,
    attributes,
    navigate: (next = "width=device-width, viewport-fit=cover") => {
      content = next;
      onHeadChange?.();
      return content;
    },
  };
}

test("installed iPad reserves the status area, including desktop-mode UA", () => {
  for (const ua of ["iPad OS 26", "Macintosh Intel Mac OS X"]) {
    const result = run(ua, 5, true);
    assert.match(result.content, /viewport-fit=contain/);
    assert.match(result.content, /interactive-widget=resizes-content/);
    assert.equal(result.attributes["data-ipad-standalone-viewport"], "contained");
    assert.equal(result.attributes["data-ipad-viewport"], "contained");
    assert.equal(result.attributes["data-ipad-menu"], "compact");
    assert.match(result.navigate(), /viewport-fit=contain/);
  }
  assert.match(run("Macintosh", 5, undefined, true).content, /viewport-fit=contain/);
});

test("ordinary iPad tabs reserve the same native area, including desktop-mode UA", () => {
  for (const ua of ["iPad OS 26", "Macintosh Intel Mac OS X"]) {
    const result = run(ua, 5, false);
    assert.match(result.content, /viewport-fit=contain/);
    assert.equal(result.attributes["data-ipad-viewport"], "contained");
    assert.equal(result.attributes["data-ipad-standalone-viewport"], undefined);
    assert.match(result.navigate(), /viewport-fit=contain/);
    assert.match(result.navigate("width=device-width"), /viewport-fit=contain/);
    assert.match(result.navigate("width=device-width, viewport-fit=auto"), /viewport-fit=contain/);
    assert.equal(
      result.navigate("width=device-width, viewport-fit=contain"),
      "width=device-width, viewport-fit=contain",
    );
  }
});

test("iPhone, Mac and Android retain the existing viewport", () => {
  for (const profile of [
    ["iPhone", 5, true],
    ["Macintosh", 0, true],
    ["Android", 5, true],
  ]) {
    const result = run(...profile);
    assert.match(result.content, /viewport-fit=cover/);
    assert.equal(result.attributes["data-ipad-menu"], undefined);
  }
});

test("the prepaint compact default preserves explicit OFF and tolerates denied storage", () => {
  for (const value of [null, "1", "invalid", "denied"]) {
    const result = run("Macintosh", 5, true, false, value);
    assert.equal(result.attributes["data-ipad-menu"], "compact");
    assert.equal(result.attributes["data-ipad-menu-preference"], "on");
  }
  const disabled = run("iPad", 5, true, false, "0");
  assert.equal(disabled.attributes["data-ipad-menu"], undefined);
  assert.equal(disabled.attributes["data-ipad-menu-preference"], "off");
});

test("the correction runs in the shared head before route hydration", () => {
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(root, /scripts:\s*\[\s*\{ children: IPAD_STANDALONE_VIEWPORT_SCRIPT \}/);
});
