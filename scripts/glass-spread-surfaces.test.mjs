// Liquid glass on the surfaces and chrome (owner, 2026-10-31:
// 「リキッドグラスを横スライダーなど様々なところに波及させて」). Pins the
// sheet's scope (the glass option only), that it paints and never moves or
// sizes a box, the touch budget, and its fallbacks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/styles-liquid-glass-surfaces.css");
const root = read("src/routes/__root.tsx");
const defs = read("src/components/liquid-glass-defs.tsx");
const lib = read("src/lib/liquid-glass.ts");

const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
const flat = (text) => text.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");

/** Every style rule with the at-rule preludes it sits in. */
function rules(text) {
  const out = [];
  const stack = [];
  let buffer = "";
  for (const ch of text) {
    if (ch === "{") {
      stack.push({ prelude: buffer.trim(), start: out.length });
      buffer = "";
    } else if (ch === "}") {
      const open = stack.pop();
      if (open && !open.prelude.startsWith("@") && open.prelude) {
        out.push({
          selector: flat(open.prelude),
          body: buffer,
          at: stack.map((s) => flat(s.prelude)).filter((p) => p.startsWith("@")),
        });
      }
      buffer = "";
    } else buffer += ch;
  }
  return out;
}
const all = rules(clean);
const block = (name) => {
  const match = css.match(new RegExp(`/\\* lgs:${name} \\*/([\\s\\S]*?)/\\* /lgs:${name} \\*/`));
  assert.ok(match, `lgs:${name} list`);
  return match[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
};

test("every rule waits for the glass option", () => {
  assert.ok(all.length > 15);
  for (const { selector } of all) {
    for (const part of selector.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /^html\[data-button-style="liquid"\]/, part);
    }
  }
});

test("the sheet paints only: nothing moves, sizes, animates or scales a box", () => {
  for (const { selector, body } of all) {
    assert.doesNotMatch(
      body,
      /(^|[;\s])(transition|animation|transform|translate|scale|rotate|width|height|min-width|min-height|padding[a-z-]*|margin[a-z-]*|inset|top|left|right|bottom|position|display|visibility)\s*:/,
      selector,
    );
  }
  assert.doesNotMatch(clean, /@keyframes/);
  // Ciel's hold ring (the aura's ::before) is the drag's; untouched.
  assert.doesNotMatch(clean, /zeus-button-aura::before/);
});

test("the shells, panels and wells keep their backing and sample nothing", () => {
  const surfaces = [...block("frames"), ...block("panels"), ...block("wells"), ".manager-facts"];
  for (const { selector, body } of all) {
    if (!surfaces.some((s) => selector.includes(s))) continue;
    if (/backdrop-filter/.test(body)) assert.match(body, /backdrop-filter: none/, selector);
    if (/background-color/.test(body) && !/Canvas/.test(body)) {
      // only the fact plate gets a backing, and it is solid
      assert.match(selector, /manager-facts/);
      assert.match(body, /background-color: rgb\(8 15 27\)/);
    }
    assert.doesNotMatch(body, /(^|[;\s])background\s*:/, selector);
  }
});

test("only the bars go translucent, on a mouse or trackpad, never on the compact chrome", () => {
  const bars = block("bars");
  assert.deepEqual(bars, [
    ".topbar",
    ".manager-topbar",
    ".gallery-topbar",
    ".search-topbar",
    ".library-topbar",
    ".command-deck-header",
    ".side-panel-head",
  ]);
  for (const { selector, body, at } of all) {
    if (!/backdrop-filter:\s*(?!none)/.test(body) || /toast/.test(selector)) continue;
    assert.ok(
      at.includes("@media (hover: hover) and (pointer: fine)"),
      `backdrop sampling outside the fine-pointer budget: ${selector}`,
    );
    assert.match(selector, /:not\(\[data-ipad-menu="compact"\]\)/);
    assert.match(selector, /:not\(\[data-phone-landscape-menu="true"\]\)/);
    assert.match(selector, /:not\(\[data-lg-touch\]\)/);
    assert.match(body, /brightness\(var\(--lgs-dim\)\)/, "the blur under words is darkened");
  }
  const translucent = all.find((r) => /--lgs-bar-a\)/.test(r.body));
  assert.ok(translucent && translucent.at.includes("@media (hover: hover) and (pointer: fine)"));
});

test("the lens bends the bars' ends only in Chromium and never in economy", () => {
  const lensed = all.filter((r) => /url\(#/.test(r.body));
  assert.ok(lensed.length >= 1);
  for (const { selector, body } of lensed) {
    assert.match(body, /url\(#dw-liquid-lens-bar\)/);
    assert.match(selector, /\[data-liquid-lens\]/);
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
    assert.doesNotMatch(selector, /dialog|panel|facts|toast/);
  }
  assert.match(defs, /<Lens id="dw-liquid-lens-bar" map=\{LENS_MAP_BAR\}/);
  assert.match(lib, /export const LENS_MAP_BAR = displacementMap\(/);
});

test("economy drops the chromatic rim, the bezel and the halo", () => {
  const economy = all.filter(
    (r) => r.selector.includes('[data-world-effects="economy"]') && !r.at.length,
  );
  const tokens = economy.find((r) => /--lgs-frame/.test(r.body));
  assert.ok(tokens);
  assert.doesNotMatch(tokens.body, /255 92 168|72 206 255/);
  assert.doesNotMatch(tokens.body, /0 0 0 6px/);
  const plate = economy.find((r) => r.selector.includes("manager-facts"));
  assert.ok(plate);
  assert.doesNotMatch(plate.body, /255 92 168|72 206 255/);
});

test("reduced transparency is near-solid; old engines too", () => {
  const reduced = all.find((r) => r.at.includes("@media (prefers-reduced-transparency: reduce)"));
  assert.match(reduced.body, /--lgs-bar-a: 0\.9[5-9]/);
  assert.match(reduced.body, /--lgs-blur: 0px/);
  assert.match(reduced.body, /--lgs-dim: 1/);
  const old = all.find((r) => r.at.some((a) => a.startsWith("@supports not")));
  assert.match(old.body, /--lgs-bar-a: 0\.9[5-9]/);
});

test("forced colours: system colours on every glassed surface, nothing painted", () => {
  const forced = all.filter((r) => r.at.includes("@media (forced-colors: active)"));
  const surfaces = forced.find((r) => /Canvas !important/.test(r.body));
  assert.ok(surfaces);
  for (const name of [...block("bars"), ...block("frames"), ...block("panels"), ...block("wells")])
    assert.ok(surfaces.selector.includes(name), name);
  for (const name of [".manager-facts", ".toast", ".opening-notice"])
    assert.ok(surfaces.selector.includes(name));
  assert.match(surfaces.body, /box-shadow: none !important/);
  assert.match(surfaces.body, /backdrop-filter: none !important/);
  const zeus = forced.find((r) => r.selector.includes(".zeus-button"));
  assert.match(zeus.body, /box-shadow: none !important/);
  // The compact launcher's glass waits for a non-forced screen.
  const compact = all.find(
    (r) => r.body.includes("lgs:compact") || /data-phone-landscape-trigger/.test(r.selector),
  );
  assert.ok(compact.at.includes("@media not (forced-colors: active)"));
});

test("reduced motion: there is no motion to reduce (no swell, no spring)", () => {
  assert.doesNotMatch(clean, /--lg-spring|linear\(|cubic-bezier|@keyframes/);
});

test("the SCP notice keeps its slip: only a painted pane around it", () => {
  const notice = all.filter((r) => r.selector.includes(".opening-notice") && !r.at.length);
  assert.equal(notice.length, 1);
  assert.deepEqual(
    notice[0].body
      .split(";")
      .map((d) => d.split(":")[0].trim())
      .filter(Boolean),
    ["box-shadow"],
  );
});

test("the root links the surfaces sheet right after the buttons' sheet", () => {
  assert.match(
    root,
    /\{ rel: "stylesheet", href: liquidGlassCss \},\s*(?:\/\/[^\n]*\n\s*)*\{ rel: "stylesheet", href: liquidGlassSurfacesCss \},/,
  );
});
