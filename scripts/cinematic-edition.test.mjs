import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cinematic skin follows each feature's own stylesheet", async () => {
  const head = await read("src/lib/world-head.ts");
  assert.match(
    head,
    /WORLD_STYLESHEET_LINKS[^=]*=\s*\[\s*\.\.\.WORLD_CORE_STYLESHEET_LINKS,\s*CINEMATIC_STYLESHEET_LINK/,
  );
  for (const route of ["dream-chapter", "rexonance-saga", "extreme-saga"]) {
    const source = await read(`src/routes/${route}.tsx`);
    const links = source.slice(source.search(/(?:stylesheetLinks|links):\s*\[/));
    assert.ok(
      links.indexOf("CINEMATIC_STYLESHEET_LINK") > links.lastIndexOf('rel: "stylesheet"'),
      route,
    );
  }
});

test("cinematic design leaves touch rail geometry and motion lifecycle intact", async () => {
  const css = await read("src/styles-cinematic-edition.css");
  assert.doesNotMatch(
    css,
    /touch-action:|overscroll-behavior:|\.rider-tabs|\.liquid-selection-lens|animation:.*infinite/,
  );
  assert.match(css, /\.story-layout \.story-heading h2\s*\{\s*color: #17202a/);
  assert.match(css, /\.dream-page \.dream-dossier-copy/);
  assert.doesNotMatch(css, /\.dream-dossier \.dream-dossier-copy/);
  assert.match(css, /pointer-events: none/);
});
