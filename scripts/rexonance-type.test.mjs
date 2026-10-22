import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { brotliDecompressSync } from "node:zlib";
import { rexonanceTypeCopy, rexonanceTypeGlyphs } from "./rexonance-type-copy.mjs";

/* 2026-10-21 rx21: Rexonance, TYPE — the special site's type system
   (src/styles-rexonance-type-20261021.css, public/fonts/rexonance-mincho-*).
   The owner asked for the Rexonance site's fonts, motion and everything else
   to be brushed up a great deal. The Japanese titles and ledes are set in a
   self-hosted Mincho (Shippori Mincho B1, OFL) subset to the glyphs the page
   prints, in two files a weight: a first-screen file, preloaded, and the
   rest. The Latin faces stay forged and etched, every kicker speaks with one
   tracking, every figure is tabular, and the owner's colours are tokens.
   These pin the route-only delivery (the sheet last, the first-screen
   subsets preloaded), the files (each holds exactly the glyphs the copy
   needs — scripts/rexonance-type-copy.mjs reads it from the components — in
   a byte budget, under the OFL), the faces (the first-screen faces declared
   last so they are tried first, swap, metric-matched local fallbacks), the
   scope and the specificity floor, that the sheet never animates and never
   changes the owner's copy, the 12px floor, and the roles. Every assertion
   here: owner request 2026-10-21: TYPE (rx21). */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bytes = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(read("src/styles-rexonance-type-20261021.css"));
const route = read("src/routes/rexonance-saga.tsx");

const FILES = {
  "display-first": "/fonts/rexonance-mincho-display-first-20261021.woff2",
  display: "/fonts/rexonance-mincho-display-20261021.woff2",
  "text-first": "/fonts/rexonance-mincho-text-first-20261021.woff2",
  text: "/fonts/rexonance-mincho-text-20261021.woff2",
};
const SCOPE =
  /^html\[data-family="special"\] body \.rxs-page\.rxs-page\.rxs-rexonance-page:not\(#rxt\):not\(#rxt\)(?![\w-])/;

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function parse(text) {
  const rules = [];
  const keyframes = new Map();
  const faces = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames || head === "@font-face") {
        let depth = 1;
        let end = index + 1;
        for (; end < text.length && depth > 0; end += 1) {
          if (text[end] === "{") depth += 1;
          if (text[end] === "}") depth -= 1;
        }
        const body = text.slice(index + 1, end - 1);
        if (frames) keyframes.set(frames[1], body);
        else faces.push(flat(body));
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = text.indexOf("}", index);
      rules.push({ selector: head, body: flat(text.slice(index + 1, end)), context: [...stack] });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return { rules, keyframes, faces };
}

const splitTopLevel = (value, separator = ",") => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};
const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();
const sheet = parse(css);

/* ---------- a WOFF2 cmap reader (the subsets are pinned to the copy) ---------- */
const KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

function woff2Tables(file) {
  assert.equal(file.subarray(0, 4).toString("latin1"), "wOF2");
  const numTables = file.readUInt16BE(12);
  const totalCompressedSize = file.readUInt32BE(20);
  let offset = 48;
  const base128 = () => {
    let value = 0;
    for (let index = 0; index < 5; index += 1) {
      const byte = file[offset];
      offset += 1;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("UIntBase128 overflow");
  };
  const entries = [];
  for (let index = 0; index < numTables; index += 1) {
    const flags = file[offset];
    offset += 1;
    let tag = KNOWN_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 0x3f) {
      tag = file.subarray(offset, offset + 4).toString("latin1");
      offset += 4;
    }
    const transform = flags >> 6;
    const origLength = base128();
    const transformed = tag === "glyf" || tag === "loca" ? transform === 0 : transform !== 0;
    const length = transformed ? base128() : origLength;
    entries.push({ tag, length });
  }
  const data = brotliDecompressSync(file.subarray(offset, offset + totalCompressedSize));
  const tables = new Map();
  let start = 0;
  for (const { tag, length } of entries) {
    tables.set(tag, data.subarray(start, start + length));
    start += length;
  }
  return tables;
}

function woff2Codepoints(file) {
  const cmap = woff2Tables(file).get("cmap");
  assert.ok(cmap, "cmap");
  const points = new Set();
  const subtables = cmap.readUInt16BE(2);
  for (let index = 0; index < subtables; index += 1) {
    const record = 4 + index * 8;
    const at = cmap.readUInt32BE(record + 4);
    const format = cmap.readUInt16BE(at);
    if (format === 4) {
      const segCount = cmap.readUInt16BE(at + 6) / 2;
      const ends = at + 14;
      const starts = ends + segCount * 2 + 2;
      const deltas = starts + segCount * 2;
      const rangeOffsets = deltas + segCount * 2;
      for (let segment = 0; segment < segCount; segment += 1) {
        const end = cmap.readUInt16BE(ends + segment * 2);
        const first = cmap.readUInt16BE(starts + segment * 2);
        const delta = cmap.readInt16BE(deltas + segment * 2);
        const rangeOffset = cmap.readUInt16BE(rangeOffsets + segment * 2);
        if (first === 0xffff) continue;
        for (let code = first; code <= end; code += 1) {
          let glyph;
          if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
          else {
            const address = rangeOffsets + segment * 2 + rangeOffset + (code - first) * 2;
            glyph = cmap.readUInt16BE(address);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) points.add(code);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(at + 12);
      for (let group = 0; group < groups; group += 1) {
        const record = at + 16 + group * 12;
        const first = cmap.readUInt32BE(record);
        const last = cmap.readUInt32BE(record + 4);
        for (let code = first; code <= last; code += 1) points.add(code);
      }
    }
  }
  return points;
}

/** A unicode-range's code points ("U+3041-3096, U+4E00" …). */
const rangePoints = (range) => {
  const points = new Set();
  for (const part of splitTopLevel(range)) {
    const [, from, to] = part.match(/^U\+([0-9A-F]{4,6})(?:-([0-9A-F]{4,6}))?$/i) ?? [];
    assert.ok(from, part);
    for (let code = parseInt(from, 16); code <= parseInt(to ?? from, 16); code += 1)
      points.add(code);
  }
  return points;
};
const sorted = (points) => [...points].sort((a, b) => a - b);
const hex = (points) => sorted(points).map((point) => `U+${point.toString(16).toUpperCase()}`);

const copy = rexonanceTypeCopy();
const glyphs = rexonanceTypeGlyphs();
const remoteFaces = sheet.faces.filter((face) => /url\(/.test(face));
const faceFor = (name) => remoteFaces.find((face) => face.includes(`url("${FILES[name]}")`));

/* ---------------- part 1: route and files ---------------- */
test("the TYPE sheet loads last (before only the motion sheet) on the Rexonance route only, and only the first-screen subsets are preloaded", () => {
  // owner request 2026-10-21: TYPE (rx21)
  // The route's edition sheets are one stylesheet of ordered imports
  // (src/styles-rexonance-route.css, 2026-10-22 F06), linked before the
  // cinematic sheet: the import order is their cascade order.
  const names = [
    ...read("src/styles-rexonance-route.css").matchAll(/^@import "\.\/([\w-]+)\.css";$/gm),
  ].map((match) => match[1]);
  const links = route.slice(route.search(/links:\s*\[/));
  // The last of the page's own sheets; the cinematic skin follows every
  // feature's sheet (scripts/cinematic-edition.test.mjs), and the type rules
  // outrank its .rxs-page rules by specificity, not order.
  assert.ok(
    links.indexOf("href: rexonanceRouteCssUrl") > 0 &&
      links.indexOf("href: rexonanceRouteCssUrl") < links.indexOf("CINEMATIC_STYLESHEET_LINK"),
  );
  // Only the KINETIC motion sheet (no type rules of its own) may follow it.
  const TYPE = "styles-rexonance-type-20261021";
  const KINETIC = "styles-rexonance-motion-20261021";
  assert.ok(names.includes(TYPE));
  assert.deepEqual(
    names.slice(names.indexOf(TYPE) + 1),
    names.includes(KINETIC) ? [KINETIC] : [],
    "the last stylesheet but the motion sheet",
  );
  assert.ok(names.indexOf("styles-p14-calibration") < names.indexOf(TYPE));
  // After the layout edition's sheet: type dresses the marks layout places.
  assert.ok(names.indexOf("styles-rexonance-layout-20261021") >= 0);
  assert.ok(names.indexOf("styles-rexonance-layout-20261021") < names.indexOf(TYPE));
  for (const name of ["display-first", "text-first"]) {
    const preload = new RegExp(
      String.raw`\{\s*rel: "preload",\s*as: "font",\s*type: "font/woff2",\s*href: "${FILES[name].replace(/[./]/g, "\\$&")}",\s*crossOrigin: "anonymous",\s*\}`,
      "g",
    );
    assert.equal(route.match(preload)?.length, 1, name);
  }
  // The lower chapters' subsets load when a chapter needs them, never preloaded.
  assert.doesNotMatch(route, /rexonance-mincho-(?:display|text)-2026/);
  for (const path of [
    "src/lib/world-head.ts",
    "src/lib/site-fonts.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-type|rexonance-mincho/, path);
  }
  assert.ok(
    !existsSync(new URL("../src/components/rexonance-saga/rexonance-type.tsx", import.meta.url)),
    "type is styling only: no component",
  );
});

test("the copy each subset must hold is read from the components", () => {
  // owner request 2026-10-21: TYPE (rx21)
  // (Compared without the spaces a line break in the markup leaves.)
  const tight = (value) => value.replace(/\s+/g, "");
  // The first screen: the hero's line and the bar's name; its lede and cue.
  assert.equal(tight(copy["display-first"]), "究極が始まる。レクソナンスサーガ");
  assert.equal(tight(copy["text-first"]), "覚醒する、全てが最高峰で。まず、数字から。");
  // Every chapter's title, the plates', the forms', the guide's, the end line's
  // and the chapter map's labels are display copy …
  for (const phrase of [
    "これで、まだ標準。",
    "同じエーテルで、P1の9倍。",
    "装甲が、身体になる。",
    "まだ、次元は変わる。",
    "無限出力が、平常運転。",
    "神飾まで、武器になる。",
    "終焉の全出力を、一動作に。",
    "悠真自身が、終焉を制御する。",
    "i-2第二世代無限縮小製造プロセス",
    "演算は、系統ごとに。",
    "最大出力を支える、安定性。",
    "三つの形態を並べて比較",
    "理不尽すら殺して見せろ。",
    "演算基盤",
    "共鳴構造",
    "ヴィンクルム",
    "P2",
  ])
    assert.ok(tight(copy.display).includes(phrase), phrase);
  // … and every lede, the three baselines' names and the chapter map's lines text copy.
  for (const phrase of [
    "標準カタログ値の比較",
    "サーガと、標準値で比較。",
    "合計7%まで抑えます。",
    "第五の犬として完全覚醒した悠真が",
    "攻撃限界を拡張します。",
    "全演算と出力を60秒間、一動作へ集中します。",
    "自分のペースで。",
    "エクスプリーム",
  ])
    assert.ok(tight(copy.text).includes(phrase), phrase);
  // EXCELSIOR is withdrawn (its data stays): its copy is in no subset.
  assert.ok(!copy.display.includes("エクセルシア") && !copy.text.includes("フェイブル"));
});

test("each Mincho subset is a small woff2 under the OFL holding exactly the glyphs its copy needs", () => {
  // owner request 2026-10-21: TYPE (rx21)
  const budget = { "display-first": 8_000, display: 40_000, "text-first": 8_000, text: 52_000 };
  let total = 0;
  for (const [name, path] of Object.entries(FILES)) {
    const file = bytes(`public${path}`);
    assert.ok(file.length <= budget[name], `${name}: ${file.length} bytes`);
    total += file.length;
    const points = woff2Codepoints(file);
    const expected = new Set([...glyphs[name]].map((character) => character.codePointAt(0)));
    const missing = sorted(expected).filter((point) => !points.has(point));
    const extra = sorted(points).filter((point) => !expected.has(point));
    assert.deepEqual(
      hex(missing),
      [],
      `${name}: glyphs the copy needs but the file lacks (cut it again)`,
    );
    assert.deepEqual(hex(extra), [], `${name}: glyphs the file holds but no copy prints`);
    // Subsets, not the face (Shippori Mincho B1 carries some 16,000 glyphs);
    // the GPOS (palt) is kept, the hinting is not.
    const tables = woff2Tables(file);
    assert.ok(tables.has("GPOS"), `${name}: palt`);
    assert.ok(!tables.has("fpgm") && !tables.has("prep"), `${name}: unhinted`);
    assert.ok(tables.get("maxp").readUInt16BE(4) < 260, `${name}: glyph count`);
  }
  // The four files together, smaller than one undivided subset per weight was.
  assert.ok(total <= 90_000, `total ${total}`);
  // A weight's two files never hold the same character twice …
  for (const [first, rest] of [
    ["display-first", "display"],
    ["text-first", "text"],
  ])
    assert.deepEqual(
      [...glyphs[first]].filter(
        (character) => character !== " " && character !== "\u00a0" && glyphs[rest].has(character),
      ),
      [],
    );
  // … and between them hold every Japanese character of their copy.
  for (const [weight, names] of [
    ["display", ["display-first", "display"]],
    ["text", ["text-first", "text"]],
  ]) {
    const held = new Set(names.flatMap((name) => [...glyphs[name]]));
    const needed = [...`${copy[names[0]]}${copy[names[1]]}`].filter(
      (character) => character.codePointAt(0) >= 0x3000,
    );
    assert.deepEqual([...new Set(needed.filter((character) => !held.has(character)))], [], weight);
  }
  const notice = read("public/fonts/OFL.txt");
  for (const path of Object.values(FILES)) assert.ok(notice.includes(path.split("/").pop()), path);
  assert.match(notice, /Shippori Mincho/);
  assert.match(notice, /rexonance-mincho-OFL\.txt/);
  const license = read("public/fonts/rexonance-mincho-OFL.txt");
  assert.match(license, /Shippori Mincho Project Authors/);
  assert.match(license, /SIL Open Font License, Version 1\.1/);
  // The copyright statement (the line before the license) declares no Reserved Font Name.
  assert.doesNotMatch(
    license.slice(0, license.indexOf("This Font Software")),
    /Reserved Font Name/,
  );
});

/* ---------------- part 2: faces ---------------- */
test("the first-screen faces are declared last with their exact glyphs; all swap; the fallbacks are metric-matched", () => {
  // owner request 2026-10-21: TYPE (rx21)
  const local = sheet.faces.filter((face) => !/url\(/.test(face));
  assert.equal(remoteFaces.length, 4);
  assert.equal(local.length, 2);
  for (const face of sheet.faces) assert.match(face, /font-display: swap/, face);
  for (const [name, family, weight] of [
    ["display-first", "Rexonance Mincho", "800"],
    ["display", "Rexonance Mincho", "800"],
    ["text-first", "Rexonance Mincho Text", "500"],
    ["text", "Rexonance Mincho Text", "500"],
  ]) {
    const face = faceFor(name);
    assert.ok(face, name);
    assert.equal(declaration(face, "font-family"), `"${family}"`, name);
    assert.equal(declaration(face, "font-weight"), weight, name);
    assert.match(face, /format\("woff2"\)/);
    const range = rangePoints(declaration(face, "unicode-range"));
    if (name.endsWith("-first")) {
      // Exactly the file's own characters: any other glyph goes to the rest.
      assert.deepEqual(hex(range), hex(woff2Codepoints(bytes(`public${FILES[name]}`))), name);
    } else {
      for (const point of [0x20, 0x41, 0x31, 0x3001, 0x3042, 0x30a2, 0x4e00, 0x9fff, 0xff0f])
        assert.ok(range.has(point), `${name}: U+${point.toString(16)}`);
    }
  }
  // CSS Fonts: of two faces whose ranges overlap, the one declared last is
  // tried first, so the first screen's glyphs come from the preloaded files.
  assert.ok(
    remoteFaces.indexOf(faceFor("display")) < remoteFaces.indexOf(faceFor("display-first")),
  );
  assert.ok(remoteFaces.indexOf(faceFor("text")) < remoteFaces.indexOf(faceFor("text-first")));
  for (const face of local) {
    assert.match(face, /font-family: "Rexonance Mincho Fallback"/);
    for (const source of splitTopLevel(declaration(face, "src")))
      assert.match(source, /^local\("[^"]+"\)$/, source);
    assert.match(face, /size-adjust: 100%/);
    assert.match(face, /ascent-override: 116%/);
    assert.match(face, /descent-override: 28\.8%/);
    assert.match(face, /line-gap-override: 0%/);
  }
  // Same-origin only: no remote host, no Google Fonts request from the sheet.
  assert.doesNotMatch(css, /https?:\/\//);
  assert.doesNotMatch(css, /@import/);
});

/* ---------------- part 3: scope and discipline ---------------- */
test("every rule is scoped to the Rexonance page above the id-scoped sheets, and the sheet never animates", () => {
  // owner request 2026-10-21: TYPE (rx21)
  assert.ok(sheet.rules.length > 50, String(sheet.rules.length));
  for (const { selector, body } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(part, SCOPE, part);
      assert.doesNotMatch(
        part,
        /\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate|\.rzn-frame|\.rzn-canvas|\.rzn-still|\.rzn-light|\.rzn-nanites|\.rxs-p14-range|\.rxs-p14-ios|(?<![\w-])select\b|#top\b/,
        part,
      );
      for (const [id] of part.matchAll(/#[\w-]+/g))
        assert.ok(["#rxt", "#rxs-assembly-title"].includes(id), `${part}: ${id}`);
    }
    for (const [, property] of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)) {
      assert.doesNotMatch(
        property,
        /^(?:animation|transition|offset|view-timeline|scroll-timeline)/,
        `${selector}: ${property}`,
      );
      // Type only: no geometry (the layout and motion engineers own those).
      assert.doesNotMatch(
        property,
        /^(?:width|height|min-width|min-height|max-width|inset|top|left|right|bottom|padding|gap|display|position|transform|translate|scale|rotate|grid|flex|opacity|background)(?:-|$)/,
        `${selector}: ${property}`,
      );
    }
  }
  assert.equal(sheet.keyframes.size, 0);
  assert.doesNotMatch(css, /!important/);
  // The owner's copy renders as written: no transform of case or content.
  assert.doesNotMatch(css, /text-transform|content\s*:/);
  // The 12px floor.
  for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) {
    for (const [, px] of value.matchAll(/(\d+(?:\.\d+)?)px/g)) assert.ok(Number(px) >= 12, value);
  }
});

/* ---------------- part 4: the roles ---------------- */
test("tokens carry the owner's palette and the scale; titles are Mincho 800, ledes Mincho 500, kickers one tracking, figures tabular", () => {
  // owner request 2026-10-21: TYPE (rx21)
  const tokens = sheet.rules.find(
    ({ selector }) =>
      selector ===
      'html[data-family="special"] body .rxs-page.rxs-page.rxs-rexonance-page:not(#rxt):not(#rxt)',
  );
  assert.ok(tokens, "the token rule");
  assert.equal(declaration(tokens.body, "--rxt-pink"), "rgb(255 143 216)");
  assert.equal(declaration(tokens.body, "--rxt-ice"), "rgb(150 236 255)");
  assert.equal(declaration(tokens.body, "--rxt-gold"), "#f2d896");
  assert.equal(declaration(tokens.body, "--rxt-ink"), "#02050a");
  assert.match(
    declaration(tokens.body, "--rxt-mincho"),
    /^"Rexonance Mincho", "Rexonance Mincho Fallback"/,
  );
  assert.match(
    declaration(tokens.body, "--rxt-mincho-text"),
    /^"Rexonance Mincho Text", "Rexonance Mincho Fallback"/,
  );
  for (const step of [
    "--rxt-step--1",
    "--rxt-step-0",
    "--rxt-step-1",
    "--rxt-step-2",
    "--rxt-step-3",
    "--rxt-step-4",
    "--rxt-step-5",
    "--rxt-step-6",
  ])
    assert.ok(declaration(tokens.body, step), step);
  assert.equal(declaration(tokens.body, "--rxt-step--1"), "12px");
  assert.equal(declaration(tokens.body, "--rxt-track-kicker"), "0.3em");
  assert.match(declaration(tokens.body, "font-feature-settings"), /"palt" 1/);
  assert.equal(declaration(tokens.body, "line-break"), "strict");

  const rulesFor = (pattern) =>
    sheet.rules.filter(({ selector }) =>
      splitTopLevel(selector).some((part) => pattern.test(part)),
    );
  const family = (pattern) =>
    rulesFor(pattern)
      .filter(({ context }) => context.length === 0)
      .map(({ body }) => declaration(body, "font-family"))
      .filter(Boolean)
      .at(-1);
  const display = rulesFor(/\.rxs-hero h1$/).find(({ body }) => /font-family/.test(body));
  assert.ok(display, "the display rule");
  assert.equal(declaration(display.body, "font-family"), "var(--rxt-mincho)");
  assert.equal(declaration(display.body, "font-weight"), "800");
  assert.equal(
    declaration(
      rulesFor(/\.rxs-hero h1$/).find(({ body }) => /font-size/.test(body)).body,
      "font-size",
    ),
    "var(--rxt-step-6)",
  );
  // Every Japanese title is the display Mincho.
  for (const part of [
    /\.rxs-section-heading h2$/,
    /\.rxs-footer h2$/,
    /#rxs-assembly-title$/,
    /\.rxs-stage-panel > div > h3$/,
    /\.rxs-system-grid h3$/,
    /\.rxs-p14-copy h3$/,
    /\.rxs-p14-comparator > header h3$/,
    /\.rxs-processing-comparison > header > h3$/,
    /\.rxs-processing-comparison section > h4$/,
    /\.rxs-brand b$/,
    /\.rxe-form-comparison > summary > strong$/,
    /\.rxe-form-comparison h3$/,
    /\.rxe-form-status strong$/,
    /\.rxe-chapter-map a > span$/,
  ])
    assert.equal(family(part), "var(--rxt-mincho)", String(part));
  // Every chapter title shares one size, the suit-up's included.
  for (const part of [/\.rxs-section-heading h2$/, /#rxs-assembly-title$/])
    assert.ok(
      rulesFor(part).some(({ body }) => declaration(body, "font-size") === "var(--rxt-step-5)"),
      String(part),
    );
  for (const part of [
    /\.rxs-hero \.rxs-hero-lede$/,
    /\.rxs-section-heading > span$/,
    /\.rxs-stage-panel > div > p$/,
    /#rxs-assembly-title \+ p$/,
    /\.rxe-chapter-map a > em$/,
  ]) {
    assert.ok(
      rulesFor(part).some(
        ({ body }) =>
          declaration(body, "font-family") === "var(--rxt-mincho-text)" &&
          declaration(body, "font-weight") === "500",
      ),
      String(part),
    );
  }
  // The Latin name in the title stays forged.
  assert.ok(
    rulesFor(/\.rxs-hero h1 > span$/).some(
      ({ body }) => declaration(body, "font-family") === "var(--rxt-forge)",
    ),
  );
  // Kickers: etched, 0.3em, every chapter's and plate's and the suit-up's.
  const kickers = rulesFor(/\.rxs-section-heading > p$/).find(({ body }) =>
    /font-family/.test(body),
  );
  assert.equal(declaration(kickers.body, "font-family"), "var(--rxt-etch)");
  assert.equal(declaration(kickers.body, "letter-spacing"), "var(--rxt-track-kicker)");
  for (const part of [
    /\.rzn-kicker span$/,
    /\.rxs-system-grid article > header > small$/,
    /\.rxs-assembly-eyebrow$/,
    /\.rxe-chapter-map-heading > span$/,
    /\.rxs-processing-comparison > header > small$/,
    /\.rxe-form-comparison > summary > span:not\(\.rxe-comparison-codes\)$/,
  ])
    assert.ok(
      splitTopLevel(kickers.selector).some((candidate) => part.test(candidate)),
      String(part),
    );
  // Figures: tabular, lining, including the HUD readout and the lock-ons.
  const figures = rulesFor(/\.rzn-readout$/).find(({ body }) => /font-variant-numeric/.test(body));
  assert.match(declaration(figures.body, "font-variant-numeric"), /tabular-nums/);
  assert.match(declaration(figures.body, "font-variant-numeric"), /lining-nums/);
  for (const part of [
    /\.rxs-headline-metrics strong$/,
    /\.rxs-specs strong$/,
    /\.rxs-comparison-metrics strong$/,
    /\.rxs-p14-values strong$/,
    /\.rzn-callout b$/,
    /\.rxe-form-status-heading span \+ span$/,
  ])
    assert.ok(
      splitTopLevel(figures.selector).some((candidate) => part.test(candidate)),
      String(part),
    );
  // LAYOUT's marks are dressed here: the stage slate (etched line, forged
  // take number, gold role) and the comparison drawer's form codes.
  const slate = rulesFor(/\.rxs-hero-visual > \.rxl-stage-slate$/).find(({ body }) =>
    /font-family/.test(body),
  );
  assert.equal(declaration(slate.body, "font-family"), "var(--rxt-etch)");
  assert.equal(declaration(slate.body, "letter-spacing"), "var(--rxt-track-kicker)");
  const take = rulesFor(/\.rxl-stage-slate > b$/).find(({ body }) => /font-family/.test(body));
  assert.equal(declaration(take.body, "font-family"), "var(--rxt-forge)");
  assert.ok(
    rulesFor(/\.rxl-stage-slate > small$/).some(
      ({ body }) => declaration(body, "color") === "var(--rxt-gold)",
    ),
  );
  const codes = rulesFor(/\.rxe-comparison-codes > b$/).find(({ body }) =>
    /font-family/.test(body),
  );
  assert.equal(declaration(codes.body, "font-family"), "var(--rxt-etch)");
  assert.equal(declaration(codes.body, "color"), "var(--rxe-code-accent, var(--rxt-ice))");
  // Japanese ledes break at phrases where the browser can; never the narrow plates.
  const phrase = sheet.rules.find(
    ({ context, body }) =>
      context.includes("@supports (word-break: auto-phrase)") && /auto-phrase/.test(body),
  );
  assert.ok(phrase, "auto-phrase");
  assert.ok(
    splitTopLevel(phrase.selector).some((part) => /\.rxs-stage-panel > div > p$/.test(part)),
  );
  assert.ok(!splitTopLevel(phrase.selector).some((part) => /\.rxs-system-grid p$/.test(part)));
  // States: hover, keyboard focus and the press change the label's colour,
  // and every link the sheet sets shows an ice ring on keyboard focus.
  assert.ok(
    sheet.rules.some(
      ({ selector, body }) =>
        /:hover/.test(selector) &&
        /:focus-visible/.test(selector) &&
        /color: var\(--rxt-ice\)/.test(body),
    ),
  );
  assert.ok(sheet.rules.some(({ selector }) => /:active/.test(selector)));
  const ring = sheet.rules.find(
    ({ selector, body }) =>
      /:focus-visible/.test(selector) && /outline: 2px solid var\(--rxt-ice\)/.test(body),
  );
  for (const part of [
    /\.rxe-hero-primary:focus-visible$/,
    /\.rxs-footer > a:focus-visible$/,
    /\.rxs-local-nav nav a:focus-visible$/,
    /summary:focus-visible$/,
  ])
    assert.ok(
      splitTopLevel(ring.selector).some((candidate) => part.test(candidate)),
      String(part),
    );
  // Forced colours drop the title's shadow; more contrast lifts the tiers.
  assert.ok(
    sheet.rules.some(
      ({ context, body }) =>
        context.includes("@media (forced-colors: active)") && /text-shadow: none/.test(body),
    ),
  );
  assert.ok(
    sheet.rules.some(
      ({ context, body }) =>
        context.includes("@media (prefers-contrast: more)") && /--rxt-text-3/.test(body),
    ),
  );
});
