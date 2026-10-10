import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* STAGE (rx10): the special sites as three trailers. A shared grammar
   (src/styles-stage-special.css) and one scene sheet per site, linked
   after each route's own skins and before the cinematic sheet, scoped to
   the special family, silent generated text, nothing under 12px, motion
   only behind reduced motion, economy rendering and the open menu,
   dialogs and load gate. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const splitSelector = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") depth -= 1;
    else if (selector[i] === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, selector.slice(start)].map((part) => part.trim());
};

const SHEETS = {
  special: "src/styles-stage-special.css",
  rexonance: "src/styles-stage-rexonance.css",
  extreme: "src/styles-stage-extreme.css",
  finalStage: "src/styles-stage-final-stage.css",
};

const ROUTES = [
  ["src/routes/rexonance-saga.tsx", "rexonanceArmourCssUrl", "stageRexonanceCssUrl"],
  ["src/routes/extreme-saga.tsx", "extremeOverdriveCssUrl", "stageExtremeCssUrl"],
  ["src/routes/final-stage.tsx", "finalStageLamplightCssUrl", "stageFinalStageCssUrl"],
];

test("each special route links the shared grammar, then its scenes, after its own skins and before the cinematic sheet", async () => {
  for (const [path, lastSkin, scenes] of ROUTES) {
    const route = await read(path);
    const links = route.slice(route.search(/links:\s*\[/));
    const skin = links.indexOf(`href: ${lastSkin}`);
    const shared = links.indexOf("href: stageSpecialCssUrl");
    const own = links.indexOf(`href: ${scenes}`);
    const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
    assert.ok(skin > 0 && skin < shared && shared < own && own < cinematic, path);
    assert.equal(links.lastIndexOf('rel: "stylesheet"') < cinematic, true, path);
  }
  for (const path of ["src/lib/world-head.ts", "src/routes/__root.tsx", "src/routes/world.tsx"]) {
    assert.doesNotMatch(
      await read(path),
      /styles-stage-(special|rexonance|extreme|final-stage)/,
      path,
    );
  }
});

test("every rule is scoped to the special family", async () => {
  for (const path of Object.values(SHEETS)) {
    const css = stripComments(await read(path)).replace(
      /@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g,
      "",
    );
    let count = 0;
    for (const [, selector] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
      for (const part of splitSelector(selector)) {
        count += 1;
        assert.ok(part.startsWith('html[data-family="special"]'), `${path}: ${part}`);
      }
    }
    assert.ok(count > 20, `${path}: ${count}`);
  }
});

test("the scene sheets never restyle the local nav, the side menu or the entry calls", async () => {
  for (const path of Object.values(SHEETS)) {
    const css = stripComments(await read(path));
    assert.doesNotMatch(
      css,
      /\.rxs-local-nav|\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate/,
      path,
    );
  }
});

test("generated text is silent, nothing is under 12px, and there is no blur", async () => {
  for (const path of Object.values(SHEETS)) {
    const css = stripComments(await read(path));
    for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
      assert.ok(
        /^(?:""|none|(?:(?:"[^"]*"|counter\([^)]*\))\s*)+\/\s*"")$/.test(value.trim()),
        `${path}: ${value}`,
      );
    }
    assert.doesNotMatch(css, /backdrop-filter|blur\(/, path);
    for (const [, size] of css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(size) >= 12, `${path}: ${size}`);
    }
    for (const [, min] of css.matchAll(
      /font(?:-size)?:\s*(?:\d{3}\s+)?clamp\((\d+(?:\.\d+)?)px/g,
    )) {
      assert.ok(Number(min) >= 12, `${path}: ${min}`);
    }
  }
});

test("motion is transform and opacity only, finite, and fully gated", async () => {
  for (const path of Object.values(SHEETS)) {
    const css = stripComments(await read(path));
    assert.ok(!/infinite|transition\s*:(?!\s*none)/.test(css), `${path}: a loop or a transition`);
    for (const [, name, body] of css.matchAll(
      /@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g,
    )) {
      assert.ok(name.startsWith("dxs-"), `${path}: ${name}`);
      for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
        assert.ok(["opacity", "transform"].includes(property), `${path} ${name}: ${property}`);
      }
    }
    for (const [index] of [...css.matchAll(/animation:\s*(?!none)[^;]+;/g)].map((m) => [m.index])) {
      const before = css.slice(0, index);
      const rule = before.slice(before.lastIndexOf("}") + 1);
      assert.match(
        rule,
        /:not\(\[data-world-effects="economy"\]\)/,
        `${path}: ${rule.trim().slice(0, 80)}`,
      );
      assert.match(rule, /:not\(\[data-side-menu-open\]\)/, path);
      assert.match(rule, /:not\(\s*\[data-loading\]\s*\)/, path);
      assert.match(rule, /:not\(\[data-dialog-open\]\)/, path);
      const opened = before.lastIndexOf("@media (prefers-reduced-motion: no-preference)");
      assert.ok(
        opened > before.lastIndexOf("@keyframes"),
        `${path}: motion outside the reduced-motion gate`,
      );
    }
  }
});

test("the pinned ids, entry calls and rails keep their elements", async () => {
  const rx = await read("src/components/rexonance-saga/rexonance-saga.tsx");
  const ex = await read("src/components/extreme-saga/extreme-saga.tsx");
  const fs = await read("src/components/final-stage/final-stage.tsx");
  for (const source of [rx, ex]) {
    for (const id of ["top", "performance", "p14", "stages", "system"]) {
      assert.match(source, new RegExp(`id="${id}"`));
    }
    assert.match(source, /className="rxs-stage-tabs liquid-swipe-tabs/);
  }
  for (const id of ["top", "story", "characters", "riders"])
    assert.match(fs, new RegExp(`id="${id}"`));
  assert.match(fs, /id="far-from-saga"/);
  assert.match(fs, /id="realm-royal"/);
  assert.match(fs, /className="form-pickup-plus fst-pickup-plus"/);
  assert.match(rx, /<RexonanceCallSequence/);
});
