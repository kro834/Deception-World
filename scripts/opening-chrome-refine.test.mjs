import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The opening and chrome brush-up (2026-10-01): the list URLs one segment up
// from every file land on the World's lists; the opening's end frame puts the
// deck in a break of the frame's rule, stands it on a still projection floor
// on portrait screens, and commits the intro lines to a readable hold; the
// side menu fades rows under its head and gives SPECIAL / STORIES one rhythm
// on phones; /download's retry link is a 44px control; the 404 way back holds
// one line at 320; the Form Archive's loading cover is opaque. These pins
// keep that presentation safe: redirects without text, gated finite motion,
// a 12px floor, forced colours, hit areas and silent ornaments.

const read = async (path) =>
  (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const readCss = async (path) =>
  stripComments(await read(path))
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");

// Every style rule as { selector, body, context } (context: the at-rules it sits in).
function rules(css) {
  const out = [];
  const walk = (text, context) => {
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf("{", index);
      if (open === -1) break;
      const head = text.slice(index, open).replace(/\s+/g, " ").trim();
      let depth = 1;
      let close = open + 1;
      while (depth > 0 && close < text.length) {
        if (text[close] === "{") depth += 1;
        else if (text[close] === "}") depth -= 1;
        close += 1;
      }
      const body = text.slice(open + 1, close - 1);
      if (head.startsWith("@keyframes")) out.push({ keyframes: head.slice(11).trim(), body });
      else if (head.startsWith("@")) walk(body, [...context, head]);
      else out.push({ selector: head, body, context });
      index = close;
    }
  };
  walk(css, []);
  return out;
}

const OWNED = [
  "src/styles-opening-elevation.css",
  "src/styles-chrome-elevation.css",
  "src/styles-download.css",
  "src/styles-not-found.css",
  "src/styles-form-archive.css",
];

const COMPOSITOR = /^(opacity|transform|translate|scale|rotate|clip-path|visibility)$/;

test("the list URLs redirect to the World's lists, with no text of their own", async () => {
  const routes = [
    ["riders", "riders-return"],
    ["managers", "manager-archive"],
    ["characters", "manager-archive-other"],
  ];
  const tree = await read("src/routeTree.gen.ts");
  for (const [segment, hash] of routes) {
    const source = await read(`src/routes/${segment}/index.tsx`);
    assert.match(source, new RegExp(`createFileRoute\\("/${segment}/"\\)`));
    // A server-side redirect: a cold load never paints a blank root frame.
    assert.match(
      source,
      new RegExp(
        `beforeLoad: \\(\\) => \\{\\s*throw redirect\\(\\{ to: "/world", hash: "${hash}", replace: true \\}\\);`,
      ),
    );
    assert.doesNotMatch(source, /component:|head:|<[A-Za-z]/, `${segment}: no page, no head`);
    assert.doesNotMatch(
      stripComments(source).replace(/\/\/.*$/gm, ""),
      /[぀-ヿ一-鿿]/,
      `${segment}: no copy`,
    );
    assert.ok(tree.includes(`'./routes/${segment}/index'`), `${segment}: in the route tree`);
  }
  // The same hashes the dossier list return uses.
  const nav = await read("src/components/world/dossier-nav.tsx");
  for (const [, hash] of routes) assert.ok(nav.includes(`"${hash}"`), hash);
});

test("owned sheets: nothing loops, and every text is 12px or larger", async () => {
  for (const path of OWNED) {
    const css = await readCss(path);
    assert.doesNotMatch(css, /infinite/, `${path}: nothing loops`);
    for (const [, size] of css.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(size) >= 12, `${path}: ${size}px text`);
    }
  }
});

test("the opening's new motion is finite, compositor-only and gated twice", async () => {
  const css = await readCss("src/styles-opening-elevation.css");
  const all = rules(css);
  const frames = Object.fromEntries(
    all.filter((rule) => rule.keyframes).map((rule) => [rule.keyframes, rule.body]),
  );
  for (const name of ["op-editorial-in", "op-editorial-out", "op-bracket-yield", "op-tick-in"]) {
    assert.ok(frames[name], name);
    for (const [, property] of frames[name].matchAll(/([a-z-]+)\s*:/g)) {
      assert.match(property, COMPOSITOR, `${name} animates ${property}`);
    }
    const users = all.filter(
      (rule) =>
        rule.selector && new RegExp(`animation(?:-name)?:[^;]*\\b${name}\\b`).test(rule.body),
    );
    assert.ok(users.length > 0, `${name} is used`);
    for (const rule of users) {
      assert.ok(
        rule.context.some((query) => query.includes("prefers-reduced-motion: no-preference")),
        `${name}: reduced motion gate`,
      );
      assert.match(
        rule.selector,
        /^html:not\(\[data-world-effects="economy"\]\) /,
        `${name}: economy gate`,
      );
    }
  }
  // The intro lines keep the base sequence's beat: only the names change.
  const hold = all.find(
    (rule) =>
      rule.selector?.includes(".cine-editorial-kicker") && /op-editorial-in/.test(rule.body),
  );
  assert.match(hold.body, /^\s*animation-name: op-editorial-in, op-editorial-out;\s*$/);
  assert.match(frames["op-editorial-in"], /100% \{\s*opacity: 0\.88;/);
  assert.match(frames["op-editorial-out"], /from \{\s*opacity: 0\.88;/);
  // The scan pass keeps its sweep and its rest: only its paint and height change.
  const scan = all.find((rule) => rule.selector === ".cine-scanline");
  assert.doesNotMatch(scan.body, /animation|display|transform/);
  assert.match(scan.body, /height: 6vh;/);
  assert.match(scan.body, /rgb\(122 232 255 \/ 0\.1\)\)/);
});

test("the deck stands in a break of the frame's rule, cut from its own sizing", async () => {
  const css = await readCss("src/styles-opening-elevation.css");
  assert.match(
    css,
    /--op-deck-w: calc\(var\(--op-cta-a\) \+ var\(--op-deck-gap\) \+ var\(--op-cta-b\)\);/,
  );
  assert.match(css, /--op-break: calc\(var\(--op-deck-w\) \/ 2 \+ 12px\);/);
  assert.match(
    css,
    /\.cine-editorial-frame > \.cine-editorial-frame-bottom \{[^}]*mask-image: linear-gradient\(90deg,\s*#000 calc\(50% - var\(--op-break\)\),\s*transparent 0 calc\(50% \+ var\(--op-break\)\),\s*#000 0\);/,
  );
  // The plates hold the token widths where they are not flex-sized.
  assert.match(
    css,
    /@media \(min-width: 701px\), \(orientation: landscape\) \{\s*\.cine-btn-primary \{\s*min-width: var\(--op-cta-a\);\s*\}\s*\.cine-btn-secondary \{\s*min-width: var\(--op-cta-b\);/,
  );
  // SKIP and the cue clear the corner brackets.
  assert.match(
    css,
    /\.cine-skip \{\s*right: calc\(var\(--cine-inset-x\) \+ var\(--op-arm-clear\)\);/,
  );
  assert.match(
    css,
    /\.cine-cue \{\s*left: calc\(var\(--cine-inset-x\) \+ var\(--op-arm-clear\)\);/,
  );
  // The floor is the horizon pseudo, extended; still paint, no new layer.
  const floor = rules(css).find(
    (rule) =>
      rule.selector === ".cine-editorial::after" &&
      rule.context.some((query) => query.includes("min-width: 361px")),
  );
  assert.ok(floor, "portrait floor");
  assert.doesNotMatch(floor.body, /animation|transition/);
  assert.match(floor.body, /repeating-conic-gradient\(/);
});

test("the opening under forced colours: a black scene, plated caption, ruled bars", async () => {
  const css = await readCss("src/styles-opening-elevation.css");
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  // A black scene, not Canvas: the logo is unadjusted light art and washed
  // out on a light Canvas (fixer review 2). The caption keeps its plates.
  assert.match(
    forced,
    /\.cine-stage,\s*\.cine-camera \{\s*forced-color-adjust: none;\s*background: #000;/,
  );
  assert.doesNotMatch(forced, /\.cine-title-caption span \{\s*background: none;/);
  assert.match(forced, /\.cine-letterbox\.top \{\s*border-bottom: 1px solid CanvasText;/);
  assert.match(forced, /\.cine-letterbox\.bottom \{\s*border-top: 1px solid CanvasText;/);
  assert.match(forced, /\.cine-editorial::before,\s*\.cine-editorial::after,/);
});

test("the side menu: a silent fade under the head, one rhythm on phones", async () => {
  const css = await readCss("src/styles-chrome-elevation.css");
  const fade = css.match(/html body #site-side-panel > \.side-panel-head::before \{([^}]*)\}/)[1];
  assert.match(fade, /content: "";/);
  assert.match(fade, /pointer-events: none;/);
  assert.match(fade, /top: 100%;/);
  const height = Number(fade.match(/height: (\d+)px;/)[1]);
  assert.ok(height >= 24, `the fade covers a row's line box (${height}px)`);
  // Forced colours: the opaque Canvas head, no soft edge. The Zeus pins read
  // the last forced block, so the fade joins it rather than adding another.
  const forced = css.slice(css.lastIndexOf("@media (forced-colors: active)"));
  assert.match(
    forced,
    /html body #site-side-panel > \.side-panel-head::before,[^{]*\{\s*display: none;/,
  );
  // SPECIAL and STORIES are the second and third groups after the head.
  // Structural, never :has(): a type subject after :has() in this sheet
  // (it loads on every page) made Chrome restyle every span on /world at
  // each poster swap and tab switch (fixer review 2: 3-10ms -> 30-37ms).
  const group =
    "html body #site-side-panel > .side-panel-head + .side-panel-group + .side-panel-group";
  const row = ".side-panel-links :is(a, button.side-panel-link-button) > span";
  assert.ok(
    css
      .replace(/\s+/g, " ")
      .includes(
        `@media (max-width: 430px) { ${group} ${row}, ${group} + .side-panel-group ${row} { flex-basis: 100%;`,
      ),
  );
  assert.doesNotMatch(css, /:has\(/);
});

test("/download's retry link is a 44px control; the 404 way back holds one line", async () => {
  const download = await readCss("src/styles-download.css");
  const alt = download.match(/\n\.export-page-alt \{([^}]*)\}/)[1];
  assert.match(alt, /display: inline-flex;/);
  assert.match(alt, /min-height: 44px;/);
  assert.match(alt, /padding-inline: 12px;/);
  const notFound = await readCss("src/styles-not-found.css");
  for (const rule of rules(notFound)) {
    if (!rule.selector) continue;
    for (const part of rule.selector.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /\.app-not-found\.app-not-found/, part);
    }
  }
  assert.match(
    notFound,
    /@media \(max-width: 389px\) \{\s*\.app-not-found\.app-not-found > a \{\s*letter-spacing: 0\.06em;/,
  );
  assert.match(
    notFound,
    /@media \(max-width: 374px\) \{\s*\.app-not-found\.app-not-found > a \{\s*grid-column: plate-start \/ plate-end;/,
  );
});

test("the Form Archive's loading cover is opaque until the archive is ready", async () => {
  const css = await readCss("src/styles-form-archive.css");
  const cover = css.match(/\.form-archive-page > \.form-archive-frame-status \{([^}]*)\}/)[1];
  assert.match(cover, /var\(--fa-ink\);/);
  assert.doesNotMatch(cover, /rgb\(4 8 15 \/ 9\d%\)/);
});
