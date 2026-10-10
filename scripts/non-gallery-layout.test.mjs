import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) =>
  readFile(new URL(`../src/styles-stage-${name}.css`, import.meta.url), "utf8");
const compact = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

test("phone library and search cards share readable rows through 439px", async () => {
  const css = compact(await read("library"));
  assert.match(css, /@media \(max-width: 439px\) \{[^}]*--dxl-cols: 1;/);
  assert.match(
    css,
    /@media \(max-width: 439px\)[\s\S]*?grid-template-columns: 96px minmax\(0, 1fr\);/,
  );
  assert.match(css, /@media \(min-width: 440px\) and \(max-width: 559px\)/);
  assert.match(css, /@media \(min-width: 440px\) \{ @container dxl-card/);
  assert.doesNotMatch(css, /@media \(min-width: 360px\)/);
  assert.match(css, /--dxl-room: calc\(var\(--dxl-col-w\) - 116px\);/);
  assert.match(
    css,
    /\.search-result-title \{ --dxl-title: 16px; --dxl-room: calc\(var\(--dxl-col-w\) - 116px\);/,
  );
  assert.match(css, /\.search-result-snippet \{ font-size: 14px; line-height: 1\.8;/);
});

test("the World index has individual chapter tiles and narrow screens stack the file code", async () => {
  const css = compact(await read("world"));
  assert.match(css, /> \.wa-contents ol \{ gap: 8px; border: 0;/);
  assert.match(css, /> \.wa-contents ol a \{[^}]*min-height: 64px;[^}]*border: 1px solid/);
  assert.match(
    css,
    /@media \(max-width: 560px\) \{[^}]*> \.wa-contents ol a \{ grid-template-columns: minmax\(0, 1fr\);/,
  );
  assert.match(css, /> \.story-copy > p \{ max-width: 40em;[^}]*clamp\(16px, 1\.2vw, 17px\)/);
});

test("dossier contents pair only when the tablet reading lane is wide enough", async () => {
  const css = compact(await read("dossier"));
  assert.match(
    css,
    /\.dossier-contents a \{[^}]*min-height: 64px;[^}]*padding: 12px;[^}]*border: 1px solid var\(--sd-line\);/,
  );
  assert.match(
    css,
    /@media \(min-width: 761px\) and \(max-width: 1099px\) \{[^}]*\.dossier-contents \{ grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 270px\), 1fr\)\);/,
  );
  assert.match(css, /\.manager-copy-body \{[^}]*max-width: 40em;/);
  assert.match(css, /\.manager-copy-body p \{[^}]*font: 400 16px\/1\.95 var\(--sd-body\);/);
  assert.match(css, /\.manager-copy-heading h2 \{[^}]*text-wrap: balance;/);
});

test("Dream act cards stay cinematic but leave room for the scene on phones", async () => {
  const css = compact(await read("dream"));
  assert.match(
    css,
    /@media \(max-width: 760px\) \{[^}]*> \.dream-section > \.dream-section-heading \{ min-height: clamp\(248px, 30svh, 300px\); margin-bottom: 24px; padding-block: 28px;/,
  );
  assert.match(css, /> \.dream-contents a \{[^}]*min-height: 48px;/);
  // This refinement must not replace the console's full-image geometry.
  assert.doesNotMatch(css, /\.dream-poster-stage > figure > img \{[^}]*object-fit: cover;/);
});

test("Final Stage prose keeps a readable measure and only affects its own route", async () => {
  const css = compact(await read("final-stage"));
  assert.match(
    css,
    /html\[data-family="special"\] body \.rxs-page\.rxs-page\.fst-page > #story \.fst-story-copy p \{ max-width: 38em;[^}]*clamp\(16px, 1\.25vw, 17px\) \/ 2/,
  );
  assert.doesNotMatch(css, /\.exs-page|\.rxs-page:not\(|data-family="gallery"/);
});
