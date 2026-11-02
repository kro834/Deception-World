import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  BUTTON_STYLE_SCRIPT,
  BUTTON_STYLE_STORAGE_KEY,
  getButtonStyleServerSnapshot,
  normalizeButtonStyle,
} from "../src/lib/button-style.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function runEarly(stored, { denied = false, env = {} } = {}) {
  const attrs = new Map();
  const root = {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
  };
  const localStorage = {
    getItem: (k) => {
      if (denied) throw new Error("denied");
      return k === "dw-button-style" ? stored : null;
    },
  };
  const window = { localStorage, ...(env.window ?? {}) };
  vm.runInNewContext(BUTTON_STYLE_SCRIPT, {
    document: { documentElement: root },
    window,
    ...(env.globals ?? {}),
  });
  return attrs;
}

/* An engine for the head script's lens decision. */
function engine({ brands = true, url = true, clearer = false } = {}) {
  const CSS = { supports: (p, v) => p === "backdrop-filter" && (url || !/url\(/.test(v)) };
  const matchMedia = (q) => ({ matches: clearer && /reduced-transparency: reduce/.test(q) });
  return {
    window: { CSS, matchMedia },
    globals: { CSS, navigator: brands ? { userAgentData: { brands: [] } } : {} },
  };
}

test("the head script decides the lens before the first paint, with the defs' checks", () => {
  const lens = (stored, opts) => runEarly(stored, { env: engine(opts) }).has("data-liquid-lens");
  assert.equal(lens("liquid"), true);
  // WebKit and Gecko: no userAgentData, or no url() in backdrop-filter.
  assert.equal(lens("liquid", { brands: false }), false);
  assert.equal(lens("liquid", { url: false }), false);
  // Reduced transparency keeps the blur-only glass, as the defs' effect does.
  assert.equal(lens("liquid", { clearer: true }), false);
  // The option off: no lens, no style.
  assert.equal(lens(null), false);
  assert.equal(runEarly("liquid", { env: engine() }).get("data-button-style"), "liquid");
  // The economy guard stays the sheet's: every lens rule wants :not(economy).
  const defs = read("src/components/liquid-glass-defs.tsx");
  assert.match(defs, /if \(lensSupported\(window\) && !clearer\) root\.setAttribute\(LIQUID_LENS_ATTRIBUTE/);
  assert.match(defs, /matchMedia\?\.\("\(prefers-reduced-transparency: reduce\)"\)/);
});

test("the key and values are pinned", () => {
  assert.equal(BUTTON_STYLE_STORAGE_KEY, "dw-button-style");
  assert.equal(normalizeButtonStyle("liquid"), "liquid");
  for (const v of [null, undefined, "default", "1", "Liquid"]) {
    assert.equal(normalizeButtonStyle(v), "default");
  }
  assert.equal(getButtonStyleServerSnapshot(), "default");
});

test("the early head script sets data-button-style only for liquid, and never throws", () => {
  assert.equal(runEarly("liquid").get("data-button-style"), "liquid");
  assert.equal(runEarly("default").has("data-button-style"), false);
  assert.equal(runEarly(null).has("data-button-style"), false);
  assert.equal(runEarly("liquid", { denied: true }).has("data-button-style"), false);
});

test("the root route runs the script in the head scripts", () => {
  const root = read("src/routes/__root.tsx");
  assert.match(root, /scripts:\s*\[[\s\S]*?\{ children: BUTTON_STYLE_SCRIPT \}/);
});

test("storage access is guarded and tabs sync through the storage event", () => {
  const src = read("src/lib/button-style.js");
  assert.match(src, /dataset\.buttonStyle = "liquid"/);
  assert.match(src, /delete document\.documentElement\.dataset\.buttonStyle/);
  assert.match(src, /addEventListener\("storage"/);
  const accesses = src.match(/localStorage\.(get|set|remove)Item/g).length;
  const tries = src.match(/\btry\s*\{/g).length;
  assert.ok(tries >= 3 && accesses >= 3);
});

test("the side menu row is a real switch in the SYSTEM group's focus scope", () => {
  const toggle = read("src/components/button-style-toggle.tsx");
  assert.match(toggle, /type="button"/);
  assert.match(toggle, /role="switch"/);
  assert.match(toggle, /aria-checked=\{on\}/);
  assert.match(toggle, /ボタン：リキッドグラス/);
  const chrome = read("src/components/world/world-chrome.tsx");
  const links = chrome.slice(chrome.indexOf("<p>SYSTEM</p>"));
  assert.ok(links.indexOf("<ButtonStyleToggle />") > links.indexOf("<IpadMenuToggle />"));
  assert.ok(links.indexOf("<ButtonStyleToggle />") < links.indexOf('<GuardedLink to="/"'));
});

test("the switch reuses the Zeus toggle styling for its checked state", () => {
  for (const file of ["src/styles.css", "src/styles-chrome-elevation.css"]) {
    assert.match(
      read(file),
      /side-panel-zeus-toggle:is\(\[aria-pressed="true"\], \[aria-checked="true"\]\)/,
    );
  }
});
