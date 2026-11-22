// The ring system (owner, 2026-11-22: 円環型の構成と弾んだアニメーション;
// 「展開時は弾む様なアニメーションにして」). Guards the contract every ring
// sheet shares, so the phase-2 page sheets (src/styles-ring-*.css) inherit it:
// springs are the helper's own curves, motion is gated, nothing loops, only
// compositor properties move, and the suit-up engines are never selected.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  RING_SPRINGS,
  ringSpringLinear,
  ringSpringPosition,
  ringSpringStep,
} from "../src/lib/ring-motion.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const foundation = read("src/styles-ring.css");
const helper = read("src/lib/ring-motion.js");
const root = read("src/routes/__root.tsx");
const sheets = readdirSync(new URL("../src/", import.meta.url))
  .filter((name) => /^styles-ring(?:-[a-z0-9-]+)?\.css$/.test(name))
  .map((name) => `src/${name}`);

const blocksOf = (css, pattern) =>
  [...css.matchAll(pattern)].map((match) => {
    let depth = 1;
    let index = match.index + match[0].length;
    while (depth && index < css.length) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    return [match.index, index];
  });
const inside = (ranges, at) => ranges.some(([a, b]) => at >= a && at < b);
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

test("the sheet's spring curves are the helper's presets, sampled", () => {
  const names = { soft: "soft", spring: "", bounce: "bounce", elastic: "elastic", snap: "snap" };
  for (const [preset, suffix] of Object.entries(names)) {
    const { css, ms } = ringSpringLinear(RING_SPRINGS[preset]);
    const token = suffix ? `--ring-spring-${suffix}` : "--ring-spring";
    assert.ok(foundation.includes(`${token}: ${css};`), token);
    const dur = suffix ? `--ring-dur-${suffix}` : "--ring-dur-spring";
    assert.ok(foundation.includes(`${dur}: ${ms}ms;`), dur);
  }
  // Every curve has a cubic fallback for engines without linear().
  assert.match(foundation, /@supports \(transition-timing-function: linear\(0, 1\)\)/);
  assert.equal((foundation.match(/--ring-spring[a-z-]*: cubic-bezier\(/g) ?? []).length, 5);
});

test("the presets overshoot as documented and the expansion spring bounces", () => {
  const peak = (spring) => {
    let max = 0;
    for (let t = 0; t < 2; t += 1 / 240) max = Math.max(max, ringSpringPosition(spring, t));
    return max - 1;
  };
  assert.ok(peak(RING_SPRINGS.soft) < 0.02);
  assert.ok(peak(RING_SPRINGS.spring) > 0.05 && peak(RING_SPRINGS.spring) < 0.12);
  assert.ok(peak(RING_SPRINGS.bounce) > 0.16 && peak(RING_SPRINGS.bounce) < 0.26);
  assert.ok(peak(RING_SPRINGS.elastic) > 0.3 && peak(RING_SPRINGS.elastic) < 0.4);
  assert.ok(peak(RING_SPRINGS.snap) < 0.01);
  // The integrator settles on its target and survives a dropped frame.
  const state = { x: 0, v: 0 };
  for (let i = 0; i < 240; i += 1) ringSpringStep(state, 1, RING_SPRINGS.bounce, i === 5 ? 0.4 : 1 / 60);
  assert.ok(Math.abs(state.x - 1) < 0.01, String(state.x));
});

test("the root links the ring sheets and mounts the helper", () => {
  assert.match(root, /import \{ watchRingMotion \} from "@\/lib\/ring-motion\.js";/);
  assert.match(root, /useEffect\(\(\) => watchRingMotion\(\), \[\]\);/);
  assert.match(
    root,
    /\{ rel: "stylesheet", href: fxMotionCss \},\s*(?:\/\/[^\n]*\n\s*)*\{ rel: "stylesheet", href: ringCss \},\s*\{ rel: "stylesheet", href: ringChromeCss \},/,
  );
  const bundle = read("src/styles-opening-interface.css");
  assert.match(bundle, /styles-fx-motion\.css";\n@import "\.\/styles-ring\.css";\n@import "\.\/styles-ring-chrome\.css";/);
});

test("every ring sheet gates its motion on reduced motion and economy, and never loops", () => {
  assert.ok(sheets.length >= 4, sheets.join());
  for (const file of sheets) {
    const css = strip(read(file));
    const noPref = blocksOf(css, /@media[^{]*prefers-reduced-motion: no-preference[^{]*\{/g);
    const keyframes = blocksOf(css, /@keyframes [^{]+\{/g);
    for (const line of css.matchAll(/^\s*(?:animation|transition)(?:-[a-z-]+)?:/gm)) {
      if (inside(keyframes, line.index)) continue;
      assert.ok(inside(noPref, line.index), `${file}: ${css.slice(line.index, line.index + 70).trim()}`);
    }
    // Leaf rules only ([^{}] on both sides), so the scan stays linear.
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(?:^|[\s;])(?:animation|transition)(?:-[a-z-]+)?:/.test(rule[2])) continue;
      if (/^\s*(?:from|to|\d+%)/.test(rule[1])) continue;
      assert.match(rule[1], /data-world-effects="economy"/, `${file}: ${rule[1].trim()}`);
    }
    assert.doesNotMatch(css, /\binfinite\b/, file);
  }
});

test("ring keyframes move compositor properties only, and no sheet blurs", () => {
  const allowed = new Set(["opacity", "scale", "translate", "rotate"]);
  for (const file of sheets) {
    const css = strip(read(file));
    for (const [a, b] of blocksOf(css, /@keyframes [^{]+\{/g)) {
      for (const prop of css.slice(a, b).matchAll(/^\s*([a-z-]+):/gm)) {
        assert.ok(allowed.has(prop[1]), `${file}: keyframe animates ${prop[1]}`);
      }
    }
    assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur/, file);
    // No flash: nothing here animates brightness or paints a white field.
    assert.doesNotMatch(css, /brightness\(|invert\(/, file);
  }
});

test("the suit-up engines and their covers are never selected", () => {
  for (const file of sheets) {
    const css = strip(read(file));
    assert.doesNotMatch(css, /\.(?:rxs|exs|ffs|ils|mus)-/, file);
    for (const rule of css.matchAll(/([^{}]*\.load-gate[^{}]*)\{/g)) {
      assert.match(rule[1], /:not\(\.rider-route-dive\)/, `${file}: ${rule[1].trim()}`);
    }
  }
});

test("the expansion rule is opt-in, springs with overshoot and leaves nothing at rest", () => {
  const css = strip(foundation);
  const rule = css.match(/\.ring-expand:is\(([\s\S]*?)\)\s*\{([\s\S]*?)\}/);
  assert.ok(rule);
  for (const state of ["[open]", '[data-open="true"]', '[data-state="open"]', ".is-open"])
    assert.ok(rule[1].includes(state), state);
  assert.match(rule[2], /animation: ring-expand-in var\(--ring-dur-bounce\) var\(--ring-spring-bounce\) backwards;/);
  // No bare [open] / dialog rule: a surface must ask for the bounce.
  assert.doesNotMatch(css, /(?:^|[\s,])(?:dialog)?\[open\]\s*\{/m);
  assert.doesNotMatch(css, /animation:[^;]*\b(?:forwards|both)\b/);
  assert.doesNotMatch(css, /will-change/);
});

test("the helper never blocks input and writes only the ring's own properties", () => {
  const code = helper.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /preventDefault|stopPropagation/);
  assert.match(code, /passive: true/);
  assert.match(code, /prefers-reduced-motion: reduce/);
  assert.match(code, /data-world-effects/);
  const writes = [...code.matchAll(/style\.setProperty\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(writes)].sort(), ["--ring-kick", "--ring-p"]);
  // The scroll bounce moves opted-in elements, never the document.
  assert.doesNotMatch(code, /(?:body|root|documentElement)\.style/);
});
