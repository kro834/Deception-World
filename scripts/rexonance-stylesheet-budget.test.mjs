/* The render-blocking stylesheet budget of /rexonance-saga (2026-10-22 sweep
   F06). The route linked 49 local render-blocking stylesheets: the root's
   20, the World core's 4, its own 23 edition sheets (saga through KINETIC),
   the cinematic skin and one hoisted component sheet. Its 23 edition sheets
   are now one file, src/styles-rexonance-route.css: ordered @import lines
   that Vite inlines at build time (as src/styles-world.css), linked where
   the first of them was. The order of the imports is the order the links
   had, so the cascade is unchanged. Proof, on production builds: in one
   page held at one frozen moment, the 23 built sheets were swapped in place
   for the one built sheet and back; every element's computed style (every
   property, ::before/::after included) and full-page captures were
   identical, at 390 touch and 1440 (plain, menu open, reduced motion,
   under the entry cover, and settled after a client navigation from
   /world, whose own copy of styles-motion-edition React keeps ahead of the
   route's sheets) and 1024 touch, and in the other direction on the branch
   build. (The minifier drops 25 rules of the joined file that a later rule
   with the same selector fully overrides; none of them could apply.)

   Measured on production builds: 49 -> 27 local stylesheets, 1,353,023 ->
   1,349,056 bytes (gzip 245,420 -> 232,179); the one sheet is 484.5 KB
   (65.5 KB gzip). These tests pin the count, the order and a byte budget
   of the CSS those links deliver.

   Not done: a special-family subset of src/styles-world.css (the plan's
   step 2). Which of its rules can match on this page depends on states the
   page's scripts set (the menu, the dialogs, the covers, economy and
   Save-Data, the iPad modes), and dropping one that does would change a
   pixel somewhere; it needs that proof across every state first. */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { gzipSync } from "node:zlib";
import test from "node:test";
import ts from "typescript";
import * as fonts from "../src/lib/site-fonts.ts";
import { REXONANCE_SITE_ARTWORK } from "../src/lib/rexonance-site-artwork.ts";

const ROOT = new URL("../", import.meta.url);
const read = (file) => readFileSync(new URL(file, ROOT), "utf8");
const AGGREGATOR = "src/styles-rexonance-route.css";

/** Runs a TypeScript module's code with the given import stubs. */
const evaluate = (file, stubs) => {
  const source = read(file).replaceAll("import.meta.env", "({})");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    require(name) {
      if (name.endsWith("?url")) return { default: name };
      if (name in stubs) return stubs[name];
      return {};
    },
  });
  return exports;
};

const worldHead = evaluate("src/lib/world-head.ts", {});
const root = evaluate("src/routes/__root.tsx", {
  "@tanstack/react-router": { createRootRoute: (config) => config },
  "@/lib/site-fonts": fonts,
  "@/lib/world-head": worldHead,
  "@/lib/viewport-chrome": { getViewportChromeColor: () => "#000" },
});
const route = evaluate("src/routes/rexonance-saga.tsx", {
  "@tanstack/react-router": { createFileRoute: () => (config) => config },
  "@/lib/world-head": worldHead,
  "@/lib/rexonance-images": { rexonanceImage: () => ({}) },
  "@/lib/rexonance-site-artwork": { REXONANCE_SITE_ARTWORK },
  "@/lib/rexonance-layout-gate.js": { syncRexonanceLayoutGate() {} },
});

const sheetsOf = (head) =>
  Array.from(head.links)
    .filter((link) => link.rel === "stylesheet")
    .map((link) => link.href);
const rootSheets = sheetsOf(root.Route.head({ matches: [{ routeId: "/rexonance-saga" }] }));
const routeSheets = sheetsOf(route.Route.head());
// React hoists every <link rel="stylesheet"> once per href: the route's copy
// of a sheet the root already links (the HUD subset) adds nothing.
const linked = [...new Set([...rootSheets, ...routeSheets])];
// Sheets a component on this page hoists into the head itself.
const HOISTED = ["src/components/world/external-cinema-link.css?url"];

/** A `?url` import specifier to its file under src/. */
const fileOf = (href) => {
  const path = href.replace(/\?url$/, "");
  if (path.startsWith("@/")) return `src/${path.slice(2)}`;
  if (path.startsWith("../")) return `src/${path.slice(3)}`;
  if (path.startsWith("src/")) return path;
  throw new Error(`unknown stylesheet specifier ${href}`);
};
const local = [...linked.filter((href) => href.endsWith("?url")), ...HOISTED];
const external = linked.filter((href) => !href.endsWith("?url"));

/** The CSS a sheet delivers: its relative @imports inlined (as Vite does),
 * comments and runs of white space removed — a stand-in for the minified
 * bytes. (Tailwind's own import in the root sheet is generated from usage
 * and is not counted.) */
const deliver = (file, seen = new Set()) => {
  assert.ok(!seen.has(file), `${file} imported twice`);
  seen.add(file);
  const dir = file.slice(0, file.lastIndexOf("/") + 1);
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@import\s+["'](\.{1,2}\/[^"']+)["'];/g, (_, path) =>
      deliver(new URL(path, new URL(dir, "file:///")).pathname.slice(1), seen),
    )
    .replace(/\s+/g, " ")
    .trim();
};

const ORDER = [
  "styles-rexonance-saga",
  "styles-rexonance-motion",
  "styles-saga-showcase",
  "styles-showcase-elevation",
  "styles-showcase-cinema",
  "styles-motion-edition",
  "styles-rexonance-polish",
  "styles-rexonance-edition",
  "styles-rexonance-instrument",
  "styles-rexonance-finish",
  "styles-rexonance-premiere",
  "styles-rexonance-couture",
  "styles-rexonance-armour",
  "styles-stage-special",
  "styles-stage-rexonance",
  "styles-rexonance-resonance",
  "styles-rexonance-zenith",
  "styles-rexonance-forge",
  "styles-rexonance-editorial",
  "styles-p14-calibration",
  "styles-rexonance-layout-20261021",
  "styles-rexonance-type-20261021",
  "styles-rexonance-motion-20261021",
];

test("the route's own edition sheets are one stylesheet of ordered imports, in their cascade order", () => {
  const source = read(AGGREGATOR);
  const body = source.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  const imports = [...body.matchAll(/^@import "\.\/([\w-]+)\.css";$/gm)].map((match) => match[1]);
  assert.deepEqual(imports, ORDER);
  // Nothing but the imports: no rule, no @layer, no media condition.
  assert.equal(body.split("\n").filter((line) => line.trim()).length, ORDER.length);
  for (const name of ORDER) {
    const sheet = read(`src/${name}.css`).replace(/\/\*[\s\S]*?\*\//g, "");
    // Flat: an import inside would land mid-cascade; a layer would reorder it.
    assert.doesNotMatch(sheet, /@import|@layer|@charset/, name);
  }
});

test("the route links the World core, then the one sheet, then the cinematic skin", () => {
  const core = worldHead.WORLD_CORE_STYLESHEET_LINKS.map((link) => link.href);
  assert.deepEqual(routeSheets, [
    ...core,
    "@/styles-rexonance-route.css?url",
    worldHead.DOSSIER_HUD_FONTS_URL,
    worldHead.CINEMATIC_STYLESHEET_LINK.href,
  ]);
  const file = read("src/routes/rexonance-saga.tsx");
  // One CSS import on the route: the edition sheets are never linked one by one again.
  assert.deepEqual(
    [...file.matchAll(/from "([^"]+\.css\?url)"/g)].map((match) => match[1]),
    ["@/styles-rexonance-route.css?url"],
  );
  // The one sheet is this route's only.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      const path = `${dir}${entry.name}`;
      if (entry.isDirectory()) walk(`${path}/`);
      else if (
        /\.(?:[jt]sx?|css)$/.test(entry.name) &&
        read(path).includes("styles-rexonance-route")
      )
        offenders.push(path);
    }
  };
  walk("src/");
  assert.deepEqual(offenders, ["src/routes/rexonance-saga.tsx"]);
});

test("render-blocking stylesheets on /rexonance-saga: 27 local (was 49), 3 remote", () => {
  for (const href of local) assert.ok(existsSync(new URL(fileOf(href), ROOT)), href);
  assert.match(
    read("src/components/world/external-cinema-link.tsx"),
    /<link rel="stylesheet" href=\{cinemaExitCss\} precedence="default" \/>/,
  );
  assert.equal(rootSheets.filter((href) => href.endsWith("?url")).length, 20, "the root's");
  assert.equal(routeSheets.filter((href) => href.endsWith("?url")).length, 6, "the route's own");
  assert.equal(local.length, 27, local.join("\n"));
  assert.deepEqual(
    external.sort(),
    [
      fonts.SITE_CORE_FONTS_URL,
      fonts.SITE_DISPLAY_FONTS_URL,
      worldHead.DOSSIER_HUD_FONTS_URL,
    ].sort(),
  );
});

test("the CSS those links deliver stays inside its byte budget", () => {
  const sizes = local.map((href) => {
    const css = deliver(fileOf(href));
    return { href, bytes: Buffer.byteLength(css), gzip: gzipSync(css, { level: 9 }).length };
  });
  const bytes = sizes.reduce((sum, size) => sum + size.bytes, 0);
  const gzip = sizes.reduce((sum, size) => sum + size.gzip, 0);
  const own = sizes.find((size) => size.href.includes("styles-rexonance-route"));
  // Budgets (2026-10-22): measured 1,519,689 / 240,183 bytes (gzip) in all
  // and 541,306 / 67,694 for the route's own sheet, with about 3 % headroom.
  // Growing past them is a decision: move rules out of the first paint's
  // path or raise the budget here with the reason.
  assert.ok(bytes <= 1_565_000, `all local sheets: ${bytes} bytes`);
  assert.ok(gzip <= 247_500, `all local sheets: ${gzip} bytes gzip`);
  assert.ok(own.bytes <= 557_500, `the route's sheet: ${own.bytes} bytes`);
  assert.ok(own.gzip <= 69_700, `the route's sheet: ${own.gzip} bytes gzip`);
  // Every sheet the one file imports is a real, non-empty file.
  for (const name of ORDER) assert.ok(statSync(new URL(`src/${name}.css`, ROOT)).size > 0, name);
});
