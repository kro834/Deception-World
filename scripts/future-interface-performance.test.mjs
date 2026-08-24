import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("adaptive futuristic interface layer is last in the world cascade", async () => {
  const index = await read("src/styles-world.css");
  assert.match(index, /@import "\.\/styles-world\/24\.css";\s*@import "\.\/styles-world\/25\.css";/);
});

test("modern interface layer includes mobile and economy rendering fallbacks", async () => {
  const css = await read("src/styles-world/25.css");
  assert.match(css, /data-world-effects="economy"/);
  assert.match(css, /data-world-page-visible="false"/);
  assert.match(css, /@media \(max-width: 840px\), \(pointer: coarse\)/);
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
});

test("pointer lighting coalesces work and pauses with the page", async () => {
  const pointer = await read("src/components/world/use-liquid-pointer-light.ts");
  const mode = await read("src/components/world/use-world-mode.ts");
  assert.match(pointer, /if \(!active && pointerId === null\) return/);
  assert.match(pointer, /visibilitychange/);
  assert.match(pointer, /requestAnimationFrame\(flush\)/);
  assert.match(mode, /worldEffects/);
  assert.match(mode, /worldPageVisible/);
});
