import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const styles = read("src/styles-dynamic-gui.css");
const helper = read("src/lib/dynamic-gui.js");
const root = read("src/routes/__root.tsx");

test("the root links the kit last and mounts its helper", () => {
  assert.match(root, /import \{ watchDynamicGui \} from "@\/lib\/dynamic-gui\.js";/);
  assert.match(root, /useEffect\(\(\) => watchDynamicGui\(\), \[\]\);/);
  assert.match(root, /<InquiryNavigation \/>\s*<DynamicGui \/>/);
  assert.match(
    root,
    /\{ rel: "stylesheet", href: commandChromeCss \},\s*(?:\/\/[^\n]*\n\s*)?\{ rel: "stylesheet", href: dynamicGuiCss \},/,
  );
});

test("the kit documents its classes at the top of the sheet", () => {
  const head = styles.slice(0, styles.indexOf(":root"));
  for (const name of [
    ".dg-reveal",
    ".dg-stagger",
    ".dg-control",
    ".dg-focus",
    ".dg-numeral",
    ".dg-rule",
    ".dg-rail",
    ".dg-dialog",
    ".dg-lit",
    ".dg-ticker",
  ])
    assert.ok(head.includes(name), name);
});

test("every animation and transition is gated on reduced motion, and motion on economy", () => {
  // Split the sheet into top-level blocks; every `animation:` outside a
  // @keyframes must be inside a no-preference media block and name the
  // economy gate on its selector.
  const noPref = /@media[^{]*prefers-reduced-motion: no-preference[^{]*\{/g;
  const motionLines = [...styles.matchAll(/^\s*animation(?:-name)?:/gm)];
  assert.ok(motionLines.length >= 10, String(motionLines.length));
  const blocks = [];
  for (const match of styles.matchAll(noPref)) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (depth && index < styles.length) {
      if (styles[index] === "{") depth += 1;
      else if (styles[index] === "}") depth -= 1;
      index += 1;
    }
    blocks.push([match.index, index]);
  }
  const keyframes = [...styles.matchAll(/@keyframes [^{]+\{/g)].map((m) => {
    let depth = 1;
    let index = m.index + m[0].length;
    while (depth && index < styles.length) {
      if (styles[index] === "{") depth += 1;
      else if (styles[index] === "}") depth -= 1;
      index += 1;
    }
    return [m.index, index];
  });
  const inside = (ranges, at) => ranges.some(([a, b]) => at >= a && at < b);
  for (const line of motionLines) {
    if (inside(keyframes, line.index)) continue;
    assert.ok(inside(blocks, line.index), styles.slice(line.index, line.index + 60));
  }
  // The economy gate on every animated selector.
  for (const rule of styles.matchAll(/([^{}@]+?)\s*\{[^{}]*?\banimation(?:-name)?:/g)) {
    if (/^\s*(?:from|to|\d+%)/.test(rule[1])) continue;
    assert.match(rule[1], /data-world-effects="economy"/, rule[1].trim());
  }
  // The scroll-driven rail stays off while a dialog has locked the body.
  assert.match(styles, /:not\(\[data-dialog-open\]\)\s+\.dg-rail:not\(\.dg-rail-static\)::before/);
});

test("the resting state is visible: reveals are held only once the helper is ready", () => {
  for (const match of styles.matchAll(/([^{}]+)\{[^{}]*visibility: hidden/g))
    assert.match(match[1], /html\[data-dg-ready\][^{]*\.dg-reveal:not\(\[data-dg-seen\]\)/);
  assert.match(helper, /const READY = "data-dg-ready";/);
  assert.match(helper, /root\.setAttribute\(READY, ""\)/);
  assert.match(helper, /IntersectionObserver/);
  assert.match(helper, /removeAttribute\(READY\)/);
  assert.doesNotMatch(helper.replace(/^\/\/.*$/gm, ""), /preventDefault/);
});

test("hover answers only a mouse", () => {
  for (const match of styles.matchAll(/\.dg-control[^{}]*:hover/g)) {
    const before = styles.slice(0, match.index);
    const open = before.lastIndexOf("@media (hover: hover) and (pointer: fine)");
    assert.ok(open >= 0, match[0]);
  }
});
