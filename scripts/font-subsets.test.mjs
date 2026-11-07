import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { FACES, isKanji, planChunks } from "./build-font-subsets.mjs";

// Owner (2026-11-06,「サイト全体が重いので軽くして」): the Japanese faces are
// served as subsets of the site's own characters (scripts/build-font-subsets.mjs).
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const faces = (css) => [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((match) => match[1]);
const codepoints = (range) =>
  range.split(",").flatMap((part) => {
    const [a, b] = part.trim().replace(/^U\+/i, "").split("-").map((hex) => parseInt(hex, 16));
    return b === undefined ? [a] : Array.from({ length: b - a + 1 }, (_, i) => a + i);
  });

test("each subset sheet names files that exist, with the descriptors of the faces they stand in for", () => {
  let total = 0;
  for (const sheet of ["core", "display", "dream"]) {
    const css = read(`src/styles-font-subsets-${sheet}.css`);
    const blocks = faces(css);
    const expected = FACES.filter((face) => face.sheet === sheet);
    assert.ok(blocks.length >= expected.length * 2, sheet);
    for (const block of blocks) {
      const family = block.match(/font-family: '([^']+)'/)[1];
      const weight = block.match(/font-weight: ([^;]+);/)[1];
      const face = expected.find((f) => f.family === family && f.weight === weight);
      assert.ok(face, `${sheet}: ${family} ${weight} is one of the faces to cut`);
      assert.match(block, /font-style: normal;/);
      assert.match(block, /font-display: swap;/);
      const overrides = [...block.matchAll(/ {2}((?:ascent|descent|line-gap)-override: [^;]+);/g)].map((m) => m[1]);
      assert.deepEqual(overrides, face.overrides ?? [], `${family} ${weight}: same overrides as the Google face`);
      const src = block.match(/src: url\((\/fonts\/subsets\/[\w.-]+\.woff2)\) format\('woff2'\);/)?.[1];
      assert.ok(src, block);
      const file = new URL(`../public${src}`, import.meta.url);
      assert.ok(existsSync(file), src);
      total += statSync(file).size;
      assert.ok(codepoints(block.match(/unicode-range: ([^;]+);/)[1]).length > 0);
    }
  }
  // Every file in the folder is referenced (a regeneration removes the old ones).
  const named = ["core", "display", "dream"].map((s) => read(`src/styles-font-subsets-${s}.css`)).join("");
  for (const file of readdirSync(new URL("../public/fonts/subsets/", import.meta.url)))
    assert.ok(named.includes(`/fonts/subsets/${file}`), `${file} is referenced`);
  // Budget: all chunks of all faces (a page loads only the chunks it sets).
  assert.ok(total < 5_000_000, `subsets total ${total} bytes`);
});

test("Zen Kaku's subsets keep the display sheet's metric overrides; Noto keeps none", () => {
  const display = faces(read("src/styles-site-display-fonts.css"));
  const zen = FACES.filter((face) => face.family === "Zen Kaku Gothic New");
  for (const block of display)
    for (const line of zen[0].overrides) assert.ok(block.includes(`${line};`), line);
  assert.equal(FACES.find((face) => face.family === "Noto Sans JP").overrides, undefined);
});

test("the Noto subsets cover every ASCII, kana and CJK punctuation character, so Latin and kana never mix fonts", () => {
  const css = read("src/styles-font-subsets-core.css");
  const first = faces(css)[0];
  const covered = new Set(codepoints(first.match(/unicode-range: ([^;]+);/)[1]));
  for (let c = 0x20; c <= 0x7e; c++) assert.ok(covered.has(c), c.toString(16));
  for (let c = 0x3041; c <= 0x3096; c++) assert.ok(covered.has(c), c.toString(16));
  for (let c = 0x30a1; c <= 0x30fa; c++) assert.ok(covered.has(c), c.toString(16));
  for (let c = 0x3001; c <= 0x3011; c++) assert.ok(covered.has(c), c.toString(16));
});

test("each subset sheet is linked after the Google sheet of the same faces (later faces are tried first)", () => {
  const root = read("src/routes/__root.tsx");
  const at = (needle) => {
    const index = root.indexOf(needle);
    assert.ok(index > 0, needle);
    return index;
  };
  const core = at('{ rel: "stylesheet", href: fontSubsetsCoreCss }');
  assert.ok(at("...siteFontLinks(") < core);
  assert.ok(at('[{ rel: "stylesheet", href: siteMetricFacesCss }]') < core);
  assert.ok(core < at('[{ rel: "stylesheet", href: fontSubsetsDisplayCss }]'));
  // The title's font group (Google's faces) is emitted at SITE_CORE_FONTS_URL's place, before.
  assert.match(root, /\{ href: openingFontsCss, members: \[SITE_CORE_FONTS_URL, DOSSIER_HUD_FONTS_URL\] \}/);
  // The display subsets only where the display faces exist (not on the title).
  assert.match(root, /=== "\/"\)\s*\?\s*\[\]\s*:\s*\[\{ rel: "stylesheet", href: fontSubsetsDisplayCss \}\]/);
  const dream = read("src/routes/dream-chapter.tsx");
  const google = dream.indexOf('{ rel: "stylesheet", href: DREAM_FONTS_URL }');
  const subsets = dream.indexOf('{ rel: "stylesheet", href: fontSubsetsDreamCssUrl }');
  assert.ok(google > 0 && subsets > google);
});

test("the subsets are cached like /assets/ (hashed names)", () => {
  const config = read("vite.config.ts");
  assert.match(config, /"\/fonts\/subsets\/\*\*": \{\s*headers: \{ "cache-control": "public, max-age=31536000, immutable" \}/);
  for (const file of readdirSync(new URL("../public/fonts/subsets/", import.meta.url)))
    assert.match(file, /^[a-z0-9-]+\.\d+\.[0-9a-f]{10}\.woff2$/);
});

test("the chunk plan: non-kanji first, the title's kanji next, then kanji in fixed-size groups", () => {
  const routes = { "/": { "Noto Sans JP": "世界A" }, "/w": { "Noto Sans JP": "世界人物一覧騎士" } };
  const chunks = planChunks(new Set("あ亜"), routes, "Noto Sans JP", 3);
  assert.ok(chunks[0].includes("A") && chunks[0].includes("あ") && chunks[0].every((ch) => !isKanji(ch)));
  assert.deepEqual(chunks[1], ["世", "界"].sort());
  assert.deepEqual(chunks.slice(2).flat().sort(), [..."人物一覧騎士亜"].sort());
  assert.ok(chunks.slice(2).every((chunk) => chunk.length <= 3));
  // Kanji the routes set come before those only the sources contain.
  assert.ok(!chunks[2].includes("亜"));
});

test("report: site characters the subsets miss (they fall back to Google's slices)", () => {
  const covered = new Set(
    ["core", "display"].flatMap((sheet) =>
      faces(read(`src/styles-font-subsets-${sheet}.css`)).flatMap((block) => codepoints(block.match(/unicode-range: ([^;]+);/)[1])),
    ),
  );
  const missing = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:tsx?|json)$/.test(entry.name))
        for (const ch of readFileSync(path, "utf8")) if (isKanji(ch) && !covered.has(ch.codePointAt(0))) missing.add(ch);
    }
  };
  walk(new URL("../src/", import.meta.url));
  // Not a failure: new copy still renders (from Google). Rerun the build script when this grows.
  if (missing.size) console.log(`font subsets: ${missing.size} kanji in src/ not in the subsets: ${[...missing].join("")}`);
  assert.ok(true);
});

test("the Google snapshots never overlap the subsets (Chromium would fetch both while one loads)", async () => {
  const { rangeCodepoints, SNAPSHOTS } = await import("./build-font-subsets.mjs");
  for (const snapshot of SNAPSHOTS) {
    const covered = new Map();
    for (const sheet of ["core", "display"])
      for (const block of faces(read(`src/styles-font-subsets-${sheet}.css`))) {
        if (!block.includes(`'${snapshot.family}'`)) continue;
        const weight = block.match(/font-weight: ([^;]+);/)[1];
        if (!covered.has(weight)) covered.set(weight, new Set());
        for (const c of rangeCodepoints(block.match(/unicode-range: ([^;]+);/)[1])) covered.get(weight).add(c);
      }
    assert.ok(covered.size > 0, snapshot.family);
    for (const block of faces(read(snapshot.file))) {
      if (!block.includes(`'${snapshot.family}'`)) continue;
      const set = covered.get(block.match(/font-weight: ([^;]+);/)[1]);
      const overlap = rangeCodepoints(block.match(/unicode-range: ([^;]+);/)[1]).filter((c) => set?.has(c));
      assert.deepEqual(overlap, [], `${snapshot.file}: ${snapshot.family}`);
    }
  }
  // Every route reads the core faces from that snapshot, never the remote Noto sheet.
  const root = read("src/routes/__root.tsx");
  assert.match(root, /link\.href === SITE_CORE_FONTS_URL &&\s*!matches\.some\(\(match\) => \(match\.routeId as string\) === "\/"\)\s*\? \{ \.\.\.link, href: openingFontsCss \}/);
});

test("formatRange round-trips with rangeCodepoints", async () => {
  const { rangeCodepoints, formatRange } = await import("./build-font-subsets.mjs");
  const points = [0x20, 0x21, 0x22, 0x3042, 0x4e00, 0x4e01, 0x20b9f];
  assert.equal(formatRange(points), "U+20-22, U+3042, U+4e00-4e01, U+20b9f");
  assert.deepEqual(rangeCodepoints(formatRange(points)), points);
});
