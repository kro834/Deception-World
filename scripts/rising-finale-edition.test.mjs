import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The finale brush-up (2026-09-29): the RISING gate as a closing act, the end
// still's frame and control deck, the burnt 六詠 box in RE DIVE and the 404
// record plate. These pins keep the new presentation safe: still paint or
// finite, gated motion; a 12px floor; forced colours; silent ornaments.

const read = async (path) =>
  (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
// Comments stripped, and prettier's line breaks inside ( ... ) undone.
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

const fontSizes = (css) =>
  [...css.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));

const COMPOSITOR = [
  "opacity",
  "translate",
  "scale",
  "rotate",
  "transform",
  "clip-path",
  "visibility",
];

function assertMotionSafe(css, file, { economy }) {
  assert.doesNotMatch(css, /infinite/, `${file}: nothing loops`);
  for (const rule of rules(css)) {
    if (rule.keyframes) {
      for (const [, property] of rule.body.matchAll(/([a-z-]+)\s*:/g)) {
        assert.ok(
          COMPOSITOR.includes(property),
          `${file} @keyframes ${rule.keyframes}: ${property}`,
        );
      }
      continue;
    }
    if (!/(^|;|\s)animation\s*:/.test(rule.body) || /animation\s*:\s*none/.test(rule.body))
      continue;
    // The RE DIVE landing's dialog fade belongs to the transition (a closing
    // fade the flash audit covers; reduced motion closes at once instead).
    if (/\[data-leaving\]/.test(rule.selector)) continue;
    assert.ok(
      rule.context.some((at) => at.includes("prefers-reduced-motion: no-preference")),
      `${file}: ${rule.selector} animates outside the reduced-motion gate`,
    );
    if (economy) {
      assert.match(
        rule.selector,
        /html:not\(\[data-world-effects="economy"\]\)/,
        `${file}: ${rule.selector} animates on economy renderers`,
      );
    }
  }
}

test("the gate's stage is still paint: only the three discovery rises move", async () => {
  const css = await readCss("src/styles-world-rising.css");
  const gate = css.slice(0, css.indexOf(".mirage-edition .rw-dialog {"));
  for (const rule of rules(gate)) {
    if (!rule.selector || !/animation\s*:/.test(rule.body)) continue;
    if (/animation\s*:\s*none/.test(rule.body)) continue;
    assert.match(
      rule.selector,
      /\.rw-gate-(button|horizon|rule)$/,
      `${rule.selector} moves; the lock frame, floor and boundary stay still`,
    );
  }
  // No 3D layer (the hero's Tron floor is too heavy for Android tiles).
  assert.doesNotMatch(gate, /perspective|rotateX|rotate3d/);
  // The button, its frame and the fuse share one box.
  assert.match(gate, /\.rw-gate-frame \{[^}]*grid-area: 1 \/ 1;/);
  assert.match(gate, /\.rw-gate-button \{[^}]*grid-area: 1 \/ 1;/);
  assert.match(gate, /\.rw-gate-rule \{[^}]*height: calc\(50% - 1px - var\(--rw-frame-h\) \/ 2/);
});

test("plates draw their rim and their focus ring along the cut corners", async () => {
  const rising = await readCss("src/styles-world-rising.css");
  const reDive = await readCss("src/styles-world-re-dive.css");
  for (const [file, css, plate, focus] of [
    ["rising", rising, /\.rw-gate-button \{[^}]*/, /\.rw-gate-button:focus-visible \{[^}]*/],
    [
      "rising",
      rising,
      /:is\(\.rw-controls button, \.rw-close\) \{[^}]*/,
      /:is\(\.rw-controls button, \.rw-close\):focus-visible \{[^}]*/,
    ],
    ["re-dive", reDive, /\.rw-redive-button \{[^}]*/, /\.rw-redive-button:focus-visible \{[^}]*/],
  ]) {
    const base = css.match(plate)[0];
    assert.match(base, /clip-path: var\(--rw-chamfer\);/, `${file}: chamfered`);
    for (const corner of ["to bottom right", "to top left"]) {
      assert.match(
        base,
        new RegExp(
          `linear-gradient\\(${corner},\\s*transparent calc\\(50% - 1px\\),\\s*var\\(--rw-rim\\)`,
        ),
        `${file}: the rim along the ${corner} cut`,
      );
    }
    const ring = css.match(focus)[0];
    assert.match(ring, /outline: 2px solid transparent;/, `${file}: forced-colours ring`);
    assert.match(ring, /--rw-rim: #fff0b5;/, `${file}: the warm ring follows the cuts`);
    assert.match(ring, /--rw-rim-w: 3px;/);
  }
  // A position on the shared plate rule would pull CLOSE out of its corner.
  const shared = rising.match(/:is\(\.rw-controls button, \.rw-close\) \{[^}]*/)[0];
  assert.doesNotMatch(shared, /(^|\s)position:/);
  assert.match(rising, /\.rw-close \{[^}]*position: absolute;/);
});

test("the end still's frame is still paint, shown with RE DIVE…? and gone with it", async () => {
  const component = await read("src/components/world/rising-world.tsx");
  assert.match(component, /<span className="rw-gate-frame" aria-hidden="true" \/>/);
  assert.match(
    component,
    /<span className="rw-end-frame" aria-hidden="true" \/>\s*<div ref=\{controlsRef\}/,
  );
  const rising = await readCss("src/styles-world-rising.css");
  assert.match(rising, /\.rw-end-frame \{[^}]*opacity: 0;[^}]*pointer-events: none;/);
  assert.match(rising, /\.rw-dialog:has\(\.rw-redive-button\) \.rw-end-frame \{\s*opacity: 1;/);
  const frame = rules(rising).filter((rule) => rule.selector?.includes("rw-end-frame"));
  assert.ok(frame.length >= 2);
  for (const rule of frame) assert.doesNotMatch(rule.body, /animation/);
  const reDive = await readCss("src/styles-world-re-dive.css");
  assert.match(
    reDive,
    /\.rw-dialog\[data-redive\]\s*:is\(\.rw-controls, \.rw-close, \.rw-redive-button, \.rw-end-frame\) \{\s*opacity: 0;/,
  );
});

test("the rising and RE DIVE sheets: finite, gated, 12px and forced colours", async () => {
  const rising = await readCss("src/styles-world-rising.css");
  const reDive = await readCss("src/styles-world-re-dive.css");
  // The gate's rise is deliberately not gated on economy (DESIGN.md); every
  // animation there still sits behind reduced motion.
  assertMotionSafe(rising, "rising", { economy: false });
  assertMotionSafe(reDive, "re-dive", { economy: true });
  for (const [file, css] of [
    ["rising", rising],
    ["re-dive", reDive],
  ]) {
    for (const size of fontSizes(css)) assert.ok(size >= 12, `${file}: ${size}px text`);
  }
  const forcedRising = rising.slice(rising.indexOf("@media (forced-colors: active)"));
  assert.match(
    forcedRising,
    /:is\(\.rw-gate-horizon, \.rw-gate-rule, \.rw-gate-frame, \.rw-end-frame\) \{\s*display: none;/,
  );
  assert.match(
    forcedRising,
    /\.rw-replay::after \{\s*forced-color-adjust: none;\s*color: ButtonText;/,
  );
  const forcedReDive = reDive.slice(reDive.indexOf("@media (forced-colors: active)"));
  assert.match(forcedReDive, /border: 1px solid CanvasText;/);
  assert.match(forcedReDive, /\.signal > span \{\s*-webkit-text-stroke: 0;/);
});

test("the burnt 六詠 box keeps the archive's order and words; I is the hero", async () => {
  const section = await read("src/components/world/re-dive-section.tsx");
  const css = await readCss("src/styles-world-re-dive.css");
  // Visual order follows the DOM (I, II, III, IV, V, VI): no reordering.
  assert.doesNotMatch(css, /(^|[;{\s])order\s*:/);
  const placed = rules(css).filter((rule) => /grid-(column|row)\s*:/.test(rule.body ?? ""));
  for (const rule of placed) {
    assert.match(
      rule.selector,
      /\.ciel-signal|is-vacant|:last-child|re-dive-tab|threat-copy|signal-array$|app-|\.signal > i$|> :is\(span, i, b\)$|\.signal\.is-vacant > i$/,
      `${rule.selector} is placed out of order`,
    );
  }
  assert.match(
    css,
    /\.signal-array > \.signal\.ciel-signal \{\s*grid-column: 1 \/ 3;\s*grid-row: 1 \/ 3;/,
  );
  assert.match(css, /grid-template-columns: minmax\(0, 2fr\) repeat\(5, minmax\(0, 1fr\)\);/);
  // The column and the archive panel step aside only in RE DIVE.
  assert.match(
    css,
    /:is\(\.re-dive-section \.signal-column, \.re-dive-archive \.manager-archive-panel\) \{\s*display: contents;/,
  );
  // The markup is the archive's: no class or word was added to the section.
  assert.doesNotMatch(section, /re-dive-plate|re-dive-seal|re-dive-hero/);
});

test("the 404 record plate: its own sheet, linked only where it renders", async () => {
  const component = await read("src/lib/error-component.tsx");
  const root = await read("src/routes/__root.tsx");
  assert.match(component, /import notFoundCss from "@\/styles-not-found\.css\?url";/);
  assert.match(
    component,
    /<link rel="stylesheet" href=\{notFoundCss\} precedence="default" \/>/,
    "hoisted by React into <head>",
  );
  assert.doesNotMatch(root, /not-found/, "no route but the 404 loads the sheet");
  assert.match(component, /<i className="app-not-found-plate" aria-hidden="true" \/>/);
  // The words, unchanged and in order.
  const words = [
    '<span aria-hidden="true">404 / LOST RECORD</span>',
    "<p>DECEPTION WORLD</p>",
    "<h1>記録が見つかりません。</h1>",
    "<p>指定された資料は存在しないか、まだ公開されていません。</p>",
    '<Link to="/world">WORLD ARCHIVEへ戻る</Link>',
  ];
  let at = 0;
  for (const word of words) {
    const next = component.indexOf(word, at);
    assert.ok(next > at, word);
    at = next;
  }
  const css = await readCss("src/styles-not-found.css");
  assertMotionSafe(css, "not-found", { economy: true });
  for (const size of fontSizes(css)) assert.ok(size >= 12, `not-found: ${size}px text`);
  // Generated text is the silent watermark only.
  const contents = [...css.matchAll(/(?<![-\w])content:\s*([^;]+);/g)].map((match) =>
    match[1].trim(),
  );
  for (const content of contents) assert.match(content, /^""$|^"404" \/ ""$/, content);
  // Every selector outranks the fallback in styles.css, whatever the order.
  for (const rule of rules(css)) {
    if (!rule.selector) continue;
    for (const part of rule.selector.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /\.app-not-found\.app-not-found/, part);
    }
  }
  // The way back shows its ring: no clip-path on it (it would clip the outline).
  const link = css.match(/\.app-not-found\.app-not-found > a \{[^}]*/)[0];
  assert.doesNotMatch(link, /clip-path/);
  assert.match(css, /> a:focus-visible \{\s*outline: 2px solid #fff0b5;/);
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /background: Canvas;/);
  assert.match(forced, /> a \{\s*border: 1px solid LinkText;/);
});
