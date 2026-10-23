import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { IPAD_STANDALONE_VIEWPORT_SCRIPT } from "../src/lib/ipad-standalone-viewport.js";

function run(
  userAgent,
  maxTouchPoints,
  standalone,
  displayMode = false,
  preference = null,
  initialContents = [
    "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
  ],
) {
  let viewports = initialContents.map((content) => ({ content }));
  const attributes = {};
  let onHeadChange;
  let viewportWrites = 0;
  const viewportNodes = () =>
    viewports.map((viewport) => ({
      getAttribute: () => viewport.content,
      setAttribute: (_, value) => {
        viewport.content = value;
        viewportWrites += 1;
      },
    }));
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
      querySelectorAll: (selector) => (selector === 'meta[name="viewport"]' ? viewportNodes() : []),
      documentElement: {
        setAttribute: (key, value) => {
          attributes[key] = value;
        },
      },
    },
  });
  return {
    get content() {
      return viewports[0]?.content;
    },
    get contents() {
      return viewports.map((viewport) => viewport.content);
    },
    attributes,
    get viewportWrites() {
      return viewportWrites;
    },
    navigate: (next = "width=device-width, viewport-fit=cover", added = []) => {
      if (Array.isArray(next)) {
        viewports = next.map((content) => ({ content }));
      } else {
        if (viewports.length) viewports[0].content = next;
        else viewports.push({ content: next });
        viewports.push(...added.map((content) => ({ content })));
      }
      onHeadChange?.();
      return viewports.map((viewport) => viewport.content);
    },
    observeAgain: () => {
      onHeadChange?.();
      return viewports.map((viewport) => viewport.content);
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
    assert.match(result.navigate()[0], /viewport-fit=contain/);
  }
  assert.match(run("Macintosh", 5, undefined, true).content, /viewport-fit=contain/);
});

test("ordinary iPad tabs reserve the same native area, including desktop-mode UA", () => {
  for (const ua of ["iPad OS 26", "Macintosh Intel Mac OS X"]) {
    const result = run(ua, 5, false);
    assert.match(result.content, /viewport-fit=contain/);
    assert.equal(result.attributes["data-ipad-viewport"], "contained");
    assert.equal(result.attributes["data-ipad-standalone-viewport"], undefined);
    assert.match(result.navigate()[0], /viewport-fit=contain/);
    assert.match(result.navigate("width=device-width")[0], /viewport-fit=contain/);
    assert.match(
      result.navigate("width=device-width, viewport-fit=auto")[0],
      /viewport-fit=contain/,
    );
    assert.equal(
      result.navigate("width=device-width, viewport-fit=contain")[0],
      "width=device-width, viewport-fit=contain",
    );
  }
});

test("all viewport metadata is contained initially and after router replacement without repeat writes", () => {
  const result = run("Macintosh Intel Mac OS X", 5, false, false, null, [
    "width=device-width, initial-scale=1, viewport-fit=cover",
    "width=device-width, initial-scale=1, viewport-fit=contain",
  ]);
  assert.equal(result.contents.length, 2);
  assert.match(result.contents[0], /viewport-fit=contain/);
  assert.match(result.contents[1], /viewport-fit=contain/);
  const initialWrites = result.viewportWrites;
  assert.equal(initialWrites, 1);

  const navigated = result.navigate("width=device-width, initial-scale=1, viewport-fit=cover", [
    "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
  ]);
  assert.equal(navigated.length, 3);
  assert.ok(navigated.every((content) => /viewport-fit=contain/.test(content)));
  const navigationWrites = result.viewportWrites;
  assert.equal(navigationWrites, initialWrites + 2);
  assert.deepEqual(result.observeAgain(), navigated);
  assert.equal(result.viewportWrites, navigationWrites);
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
