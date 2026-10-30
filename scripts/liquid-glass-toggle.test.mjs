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

function runEarly(stored, { denied = false } = {}) {
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
  vm.runInNewContext(BUTTON_STYLE_SCRIPT, {
    document: { documentElement: root },
    window: { localStorage },
  });
  return attrs;
}

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
