import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const styles = read("src/styles-fx-motion.css");
const helper = read("src/lib/fx-motion.js");
const root = read("src/routes/__root.tsx");

const blocksOf = (pattern) =>
  [...styles.matchAll(pattern)].map((match) => {
    let depth = 1;
    let index = match.index + match[0].length;
    while (depth && index < styles.length) {
      if (styles[index] === "{") depth += 1;
      else if (styles[index] === "}") depth -= 1;
      index += 1;
    }
    return [match.index, index];
  });

test("the root links the layer after the dynamic GUI kit and mounts its helper", () => {
  assert.match(root, /import \{ watchFxMotion \} from "@\/lib\/fx-motion\.js";/);
  assert.match(root, /useEffect\(\(\) => watchFxMotion\(\), \[\]\);/);
  assert.match(
    root,
    /\{ rel: "stylesheet", href: dynamicGuiCss \},\s*(?:\/\/[^\n]*\n\s*)?\{ rel: "stylesheet", href: fxMotionCss \},/,
  );
});

test("every animation and transition is gated on reduced motion and economy", () => {
  const noPref = blocksOf(/@media[^{]*prefers-reduced-motion: no-preference[^{]*\{/g);
  const keyframes = blocksOf(/@keyframes [^{]+\{/g);
  const inside = (ranges, at) => ranges.some(([a, b]) => at >= a && at < b);
  const lines = [...styles.matchAll(/^\s*(?:animation|transition)(?:-[a-z-]+)?:/gm)];
  assert.ok(lines.length >= 8, String(lines.length));
  for (const line of lines) {
    if (inside(keyframes, line.index)) continue;
    assert.ok(inside(noPref, line.index), styles.slice(line.index, line.index + 80));
  }
  for (const rule of styles.matchAll(/([^{}@]+?)\s*\{[^{}]*?\b(?:animation|transition)(?:-[a-z-]+)?:/g)) {
    if (/^\s*(?:from|to|\d+%)/.test(rule[1])) continue;
    assert.match(rule[1], /data-world-effects="economy"/, rule[1].trim());
  }
  assert.doesNotMatch(styles, /infinite/);
});

test("the special sites keep their own staging", () => {
  // The scan arrival is the only rule on a shared reveal class; it skips them.
  assert.match(styles, /:not\(\[data-family="special"\]\)[\s\S]*?\.dg-reveal\[data-dg-seen\]/);
  assert.doesNotMatch(styles, /\.(?:rxs|exs|fst|ffs|ils|mus)-/);
});

test("the helper answers a mouse only, with motion allowed, and never blocks input", () => {
  assert.match(helper, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(helper, /prefers-reduced-motion: reduce/);
  assert.match(helper, /data-world-effects/);
  assert.match(helper, /event\.pointerType !== "mouse"/);
  assert.match(helper, /passive: true/);
  assert.doesNotMatch(helper.replace(/^\/\/.*$/gm, ""), /preventDefault/);
  // Only transform and two custom properties are written per frame.
  const writes = [...helper.matchAll(/style\.setProperty\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(writes)].sort(), ["--fx-px", "--fx-py", "transform", "transition-property"]);
});
