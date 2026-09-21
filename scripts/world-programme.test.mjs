import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("programme design is delivered only by the World route", async () => {
  const route = await read("src/routes/world.tsx");
  const shared = await read("src/lib/world-head.ts");
  assert.match(route, /styles-world-programme\.css\?url/);
  assert.match(route, /styles-world-programme-sections\.css\?url/);
  assert.match(route, /stylesheetLinks:\s*\[\s*\.\.\.WORLD_STYLESHEET_LINKS/);
  assert.doesNotMatch(shared, /worldProgramme/);
});

test("programme is a static visual layer, not another gesture or animation system", async () => {
  for (const file of [
    "src/styles-world-programme.css",
    "src/styles-world-programme-sections.css",
  ]) {
    const css = await read(file);
    assert.doesNotMatch(
      css,
      /touch-action:|overscroll-behavior:|scroll-snap-|animation:|@keyframes|url\(/,
    );
    assert.doesNotMatch(css, /backdrop-filter:\s*(?!none)[a-z]+\(/);
    assert.match(css, /\.site-shell\.film-edition/);
    assert.match(css, /focus-visible/);
  }
});

test("phone programme exposes entrance before artwork without hiding the poster controls", async () => {
  const css = await read("src/styles-world-programme.css");
  assert.match(css, /grid-template-areas:\s*"identity"\s*"copy"\s*"visual"/);
  assert.match(css, /min-height: 56px/);
  assert.doesNotMatch(css, /poster-controls[^}]*display:\s*none/);
});
