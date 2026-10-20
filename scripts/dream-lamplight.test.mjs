import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* Lamplight: the Dream programme read by lamplight
   (src/styles-dream-lamplight.css). Linked after the stage sheet and
   before the cinematic skin, on Dream only. Paint and type: no words,
   no motion, no images, nothing under 12px, no !important. */

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
  return [...parts, selector.slice(start)].map((part) => part.trim()).filter(Boolean);
};

const css = stripComments(await read("src/styles-dream-lamplight.css"));

test("lamplight loads after the stage sheet and before the cinematic skin, on Dream only", async () => {
  const route = await read("src/routes/dream-chapter.tsx");
  assert.match(route, /import dreamLamplightCssUrl from "@\/styles-dream-lamplight\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const stage = links.indexOf('{ rel: "stylesheet", href: stageDreamCssUrl }');
  const lamp = links.indexOf('{ rel: "stylesheet", href: dreamLamplightCssUrl }');
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(stage > 0 && lamp > stage && cinematic > lamp, `${stage} ${lamp} ${cinematic}`);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /dream-lamplight|dreamLamplight/, path);
  }
});

test("every rule stays on the dream page, with no words, motion, images or tiny type", () => {
  let count = 0;
  for (const [, selector] of css.matchAll(/(?:^|[{};])\s*([^{}@;]+)\{/g)) {
    for (const part of splitSelector(selector)) {
      count += 1;
      assert.match(part, /^html\[data-family="dream"\]\s+main\.dream-page\.dream-page\b/, part);
    }
  }
  assert.ok(count > 20, String(count));
  assert.doesNotMatch(css, /@keyframes|animation\s*:|backdrop-filter|!important|url\(|content\s*:/);
  assert.doesNotMatch(css, /dream-site-header|dream-chapter-nav|dream-poster-current|dream-poster-rail/);
  for (const [, size] of css.matchAll(/font-size:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(size) >= 12, size);
  }
  for (const [, min] of css.matchAll(/font-size:\s*clamp\((\d+(?:\.\d+)?)px/g)) {
    assert.ok(Number(min) >= 12, min);
  }
});
