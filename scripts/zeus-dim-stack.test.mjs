// Owner (2026-11-26): the Zeus button dims while it rests over body text, and
// on an iPad it stacks in one column with the floating compact menu launcher.
// Placement and paint only: the tap-through guard, rail lock and archive
// bridge are untouched.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const zeus = read("src/components/zeus-button.tsx");
const elevation = read("src/styles-chrome-elevation.css");

test("the button reads whether its resting spot covers body text, once per placement", () => {
  assert.match(zeus, /const ZEUS_PROSE_SELECTOR =\s*"\.dw-prose, \[data-prose\], p, li, dd, blockquote, figcaption";/);
  assert.match(zeus, /function readOverProse\(button: HTMLElement, box: ZeusRect\): boolean \{/);
  // Inside the placement's move, from the spot it rests on.
  const move = zeus.slice(zeus.indexOf("const move = () => {"), zeus.indexOf("const travel = Math.hypot("));
  assert.match(move, /const overProse = readOverProse\(button, \{/);
  assert.match(move, /button\.dataset\.overText = "true"/);
  assert.match(move, /delete button\.dataset\.overText/);
});

test("over body text it dims, and is whole while it is used or handed off", () => {
  const rule = elevation.slice(elevation.indexOf('.zeus-button[data-over-text="true"]'));
  const selector = rule.slice(0, rule.indexOf("{"));
  for (const state of [
    "[data-relocating]",
    '[data-dragging="true"]',
    '[data-pressing="true"]',
    '[data-holding="true"]',
    '[data-navigating="true"]',
    '[data-menu-open="true"]',
    '[data-parked="true"]',
    ":focus-visible",
    ":hover",
  ]) {
    assert.ok(selector.replace(/\s+/g, "").includes(`:not(${state.replace(/\s+/g, "")})`), state);
  }
  assert.match(rule, /\{\s*opacity: 0\.58;\s*\}/);
});

test("on an iPad it stacks over the floating launcher: same 60px, 12px above, centred", () => {
  assert.match(zeus, /const ZEUS_STACK_GAP = 12;/);
  assert.match(zeus, /function readCompactLauncher\(\): ZeusRect \| null \{/);
  assert.match(
    zeus,
    /clampZeusCenter\(\s*\(launcher\.left \+ launcher\.right\) \/ 2,\s*launcher\.top - ZEUS_STACK_GAP - rect\.height \/ 2,\s*bounds,\s*\)/,
  );
  // Second in line: the spot it was headed for still wins when it is clear.
  assert.match(zeus, /if \(near\) \{\s*candidates\.splice\(\s*1,\s*0,/);
  assert.match(
    elevation,
    /html:root\[data-ipad-viewport="contained"\]\[data-ipad-menu="compact"\]\[data-ipad-menu-scrolled="true"\]\s*body\s*\.zeus-button \{\s*--zeus-button-size: 60px;\s*\}/,
  );
});
