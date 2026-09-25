import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CIEL_PORTRAIT, cielPortrait } from "../src/lib/thumbnail-images.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("/characters/ciel is a World route with its own sheet after the World's", async () => {
  const route = await read("src/routes/characters/ciel.tsx");
  assert.match(route, /createFileRoute\("\/characters\/ciel"\)/);
  assert.match(route, /component: CielPage/);
  assert.match(route, /import cielCssUrl from "@\/styles-ciel\.css\?url";/);
  assert.match(
    route,
    /stylesheetLinks: \[\.\.\.WORLD_STYLESHEET_LINKS, \{ rel: "stylesheet", href: cielCssUrl \}\]/,
  );
  assert.match(route, /title: "シエル｜人物資料｜Deception World"/);
  const tree = await read("src/routeTree.gen.ts");
  assert.match(tree, /'\/characters\/ciel': typeof CharactersCielRoute/);
});

test("his page keeps 月城悠真's record from the eight riders, without マキャベル", async () => {
  const page = stripComments(await read("src/components/world/ciel-page.tsx"));
  assert.match(page, /RIDER_DOSSIERS\.find\(\(rider\) => rider\.id === "saga"\)/);
  for (const field of ["quotes", "facts", "sections", "civilian", "special", "forms"]) {
    assert.match(page, new RegExp(`SAGA\\.${field}\\b`), field);
  }
  assert.doesNotMatch(page, /nightmare|マキャベル|MACHIAVEL/i);
  // Headed by his name and his illustration.
  assert.match(page, /<small>CIEL<\/small>/);
  assert.match(page, /alt="シエルのキャラクタービジュアル"/);
  assert.match(page, /\{\.\.\.cielPortrait\(\)\}/);
  // It returns to RE DIVE's 六詠, and pages through it.
  assert.match(page, /returnHash=\{RE_DIVE_HASH\}/);
  assert.match(page, /const RE_DIVE_HASH = "re-dive";/);
  assert.match(page, /items=\{RE_DIVE_RIKUEI_NAV\}/);
  const nav = await read("src/components/world/dossier-nav.tsx");
  const list = nav.slice(nav.indexOf("export const RE_DIVE_RIKUEI_NAV"));
  const order = [
    ...list.slice(0, list.indexOf("];")).matchAll(/id: "([IV]+)"|RIKUEI_NAV\[(\d)\]/g),
  ].map(([, id, index]) => id ?? ["I", "II", "III", "IV", "V", "VI"][Number(index)]);
  assert.deepEqual(order, ["I", "II", "III", "IV", "V", "VI"]);
  assert.match(list, /href: "\/characters\/ciel"/);
  assert.match(nav, /const returnHash = listHash \?\? pathHash;/);
});

test("his colours are emerald green and light blue", async () => {
  const page = await read("src/components/world/ciel-page.tsx");
  const emerald = page.match(/const CIEL_EMERALD = "(#[0-9a-f]{6})";/)?.[1];
  const aqua = page.match(/const CIEL_AQUA = "(#[0-9a-f]{6})";/)?.[1];
  assert.ok(emerald && aqua);
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [er, eg, eb] = rgb(emerald);
  assert.ok(eg > er * 3 && eg > eb, "emerald is green-led");
  const [ar, ag, ab] = rgb(aqua);
  assert.ok(ab > ag && ag > ar && ar > 100, "light blue is a pale blue");
  assert.match(page, /\["--manager-accent" as string\]: CIEL_EMERALD/);
  assert.match(page, /\["--manager-accent-soft" as string\]: CIEL_AQUA/);
  const css = stripComments(await read("src/styles-ciel.css"));
  assert.match(css, new RegExp(`--ciel-emerald: ${emerald};`));
  assert.match(css, new RegExp(`--ciel-aqua: ${aqua};`));
  // Every rule stays on his page.
  for (const [, selector] of css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) {
    if (/^\s*(from|to|\d)/.test(selector)) continue;
    for (const part of selector.split(",")) {
      assert.match(part, /main\.manager-page\.ciel-dossier-page/, part.trim());
    }
  }
  // Nothing moves.
  assert.doesNotMatch(css, /animation|transition/);
});

test("his portrait is right-sized from the supplied illustration", () => {
  const publicFile = (path) => new URL(`../public${path}`, import.meta.url);
  assert.ok(statSync(publicFile(CIEL_PORTRAIT.source)).size > 0);
  let previous = 0;
  for (const variant of CIEL_PORTRAIT.variants) {
    const bytes = readFileSync(publicFile(variant.path));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", variant.path);
    assert.ok(bytes.length > previous, variant.path);
    assert.ok(bytes.length <= 240_000, `${variant.path} weight`);
    previous = bytes.length;
  }
  assert.equal(
    cielPortrait().srcSet,
    "/ciel-illustration-20260924-640.webp 640w, /ciel-illustration-20260924-960.webp 960w",
  );
});

test("opening his page plays his own cut-in, in his colours", async () => {
  const gate = await read("src/components/load-gate.tsx");
  assert.match(gate, /"\/characters\/ciel": "ciel",/);
  assert.match(gate, /ciel: \{ cover: 560, reveal: 760 \}/);
  assert.match(gate, /variant === "ciel"\) return "シエル"/);
  assert.match(gate, /className="rider-cutin-stage ciel-cutin-stage"/);
  const css = await read("src/styles-world/22.css");
  const block = css.slice(css.indexOf("/* CIEL"));
  assert.match(block, /rgba\(28, 207, 157/);
  assert.match(block, /rgba\(134, 217, 255/);
  // Compositor properties only.
  for (const [, frames] of block.matchAll(/@keyframes \w+ \{([\s\S]*?)\n\}/g)) {
    for (const [, property] of frames.matchAll(/([a-z-]+):/g)) {
      assert.ok(["opacity", "transform"].includes(property), property);
    }
  }
  // Reduced motion: the shared cut-in rule stops every animation.
  assert.match(css, /\.rider-route-cutin \.rider-cutin-stage \*[\s\S]*?animation: none !important/);
});

test("the BEFORE label reads on pale photographs", async () => {
  const css = await read("src/styles-world/16.css");
  const rule = css.match(/\.rider-archive-civilian-visual > span \{([^}]+)\}/)?.[1] ?? "";
  assert.match(rule, /background: rgba\(3, 5, 8, 0\.68\)/);
  assert.match(rule, /font-size: 10px/);
});
