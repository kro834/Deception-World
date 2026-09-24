import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { RISING_FLASHBACK } from "../src/components/world/rising-art.ts";
import {
  RISING_FLASHBACK_OPACITY,
  RISING_FLASHBACK_WINDOW,
  RISING_TIMING,
  risingFlashbackSlot,
} from "../src/components/world/rising-timing.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the flashback's eleven scenes are delivered small", () => {
  assert.equal(RISING_FLASHBACK.length, 11);
  let total = 0;
  for (const src of RISING_FLASHBACK) {
    const bytes = readFileSync(new URL(`../public${src}`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", src);
    assert.ok(bytes.length <= 140_000, `${src} weight`);
    total += statSync(new URL(`../public${src}`, import.meta.url)).size;
  }
  assert.ok(total <= 900_000, `all scenes: ${total} B`);
});

test("it plays from the press until before the print has burned away, a scene every 0.4 s at most", () => {
  for (const tier of ["webgl", "css"]) {
    const [start, end] = RISING_FLASHBACK_WINDOW[tier];
    const timing = RISING_TIMING[tier];
    assert.ok(start >= 0 && end < timing.burnEnd, tier);
    const count = RISING_FLASHBACK.length;
    const first = risingFlashbackSlot(tier, 0, count);
    const last = risingFlashbackSlot(tier, count - 1, count);
    assert.ok(Math.abs(first.from - start) < 1e-9 && Math.abs(last.to - end) < 1e-9, tier);
    // A scene comes up every step, never more often than every 0.4 s.
    assert.ok(first.step >= 0.4, `${tier} step ${first.step}`);
    // Cross-fades: each scene overlaps the next.
    for (let index = 1; index < count; index += 1) {
      const slot = risingFlashbackSlot(tier, index, count);
      assert.ok(slot.from < risingFlashbackSlot(tier, index - 1, count).to);
    }
  }
  assert.ok(RISING_FLASHBACK_OPACITY < 1);
});

test("the scenes sit between the fire and the title, warmed on approach, hidden under reduced motion", () => {
  const component = read("src/components/world/rising-world.tsx");
  assert.match(
    component,
    /className="rw-gl"[\s\S]*?className="rw-flashback"[\s\S]*?className="rw-title-scrim"/,
  );
  assert.match(
    component,
    /<img key=\{src\} src=\{src\} alt="" loading="lazy" decoding="async" \/>/,
  );
  assert.match(component, /const prewarm = \(\) => \{\s*warmFlashback\(\);/);
  const engine = read("src/components/world/rising-sequence.ts");
  assert.match(engine, /flashTier !== "reduced" && flashback/);
  const css = read("src/styles-world-rising.css");
  assert.match(css, /\.rw-flashback \{[^}]*z-index: 2;/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{\s*\.site-shell\.film-edition\.mirage-edition \.rw-flashback \{\s*display: none;/,
  );
});
