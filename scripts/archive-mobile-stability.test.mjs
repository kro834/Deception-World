import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/routes/form-archive.tsx", import.meta.url), "utf8");
const mobileStyles = readFileSync(new URL("../public/archive-mobile-stability.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const embeddedArchives = [
  new URL("../public/saga-form-archive-embedded.html", import.meta.url),
  new URL("../public/realm-form-archive-embedded.html", import.meta.url),
];

test("the app uses memory-safe embedded archives and recreates the iframe when switching", () => {
  assert.match(route, /\/saga-form-archive-embedded\.html/);
  assert.match(route, /\/realm-form-archive-embedded\.html/);
  assert.match(route, /<iframe\s+key=\{archive\}/);
  assert.doesNotMatch(route, /-standalone\.html/);
  assert.match(route, /if \(!loaded \|\| next === archive\) return/);
});

test("embedded archives externalize base64 images and load the mobile stability layer", () => {
  for (const file of embeddedArchives) {
    assert.ok(existsSync(file), `${file.pathname} should exist`);
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /data:image\//);
    assert.match(html, /data-embedded-archive="true"/);
    assert.match(html, /archive-mobile-stability\.css/);
    assert.ok(statSync(file).size < 1_000_000, `${file.pathname} should stay below 1 MB`);

    for (const match of html.matchAll(/\/archive-media\/([^"')\s]+)/g)) {
      assert.ok(
        existsSync(new URL(`../public/archive-media/${match[1]}`, import.meta.url)),
        `archive media ${match[1]} should exist`,
      );
    }
  }
});

test("coarse-pointer devices trim continuous GPU effects without removing interactions", () => {
  assert.match(mobileStyles, /@media \(any-pointer: coarse\)/);
  assert.match(mobileStyles, /content-visibility: auto/);
  assert.match(mobileStyles, /\.v6s-fx-orbit/);
  assert.match(mobileStyles, /\.archive-nav \{\s*transform: none !important/);
  assert.doesNotMatch(mobileStyles, /translateY\(64px\)/);
  assert.doesNotMatch(mobileStyles, /pointer-events:\s*none/);
});

test("production builds regenerate embedded archives from their standalone sources", () => {
  assert.equal(packageJson.scripts["archive:embed"], "node scripts/build-embedded-archives.mjs");
  assert.equal(packageJson.scripts.prebuild, "npm run archive:embed");
});
