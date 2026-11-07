import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as fonts from "../src/lib/site-fonts.ts";
import { compactStylesheetGroups } from "../src/lib/compact-stylesheet-groups.ts";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const source = read("src/routes/__root.tsx").replaceAll("import.meta.env", "({})");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
runInNewContext(code, {
  exports,
  require(name) {
    if (name === "@tanstack/react-router") return { createRootRoute: (config) => config };
    if (name === "@/lib/site-fonts") return fonts;
    if (name === "@/lib/compact-stylesheet-groups") return { compactStylesheetGroups };
    if (name === "@/lib/world-head") return { DOSSIER_HUD_FONTS_URL: "hud-fonts" };
    if (name === "@/lib/viewport-chrome") return { getViewportChromeColor: () => "#000" };
    if (name.endsWith("?url")) return { default: name };
    return {};
  },
});
const styles = (routeId) =>
  Array.from(exports.Route.head({ matches: [{ routeId }] }).links)
    .filter((link) => link.rel === "stylesheet")
    .map((link) => link.href);

const original = [
  "../styles-android-performance.css?url",
  "../styles-ios18-performance.css?url",
  "../styles-ios27-enhancements.css?url",
  "../styles-pickup-stability.css?url",
  "../styles.css?url",
  "../styles-route-transitions.css?url",
  "../styles-frosted-controls.css?url",
  "../styles-future-interface.css?url",
  "../styles-name-words.css?url",
  "../styles-pickup-visibility.css?url",
  "../styles-press-feedback.css?url",
  "../styles-chrome-elevation.css?url",
  "../styles-transition-cinema.css?url",
  "../styles-rexonance-calls.css?url",
  // Owner (2026-10-22): FAR FROM's entry call plays in the transition screen
  // too, so its differences ride beside the call sheet on every page.
  "../styles-far-from-entry.css?url",
  // Owner (2026-10-23): ILLUSIONCULUM's entry plays in the transition screen too.
  "../styles-illusionculum-entry.css?url",
  "../styles-viewport-chrome.css?url",
  "@/styles-inquiry-navigation.css?url",
  "../styles-stage.css?url",
  "../styles-stage-shell.css?url",
  // Owner (2026-10-16): the new key visual's pink light trails, site-wide except the title.
  "../styles-saga-streamline.css?url",
  "@/styles-interaction-choreography.css?url",
  // The requested Astra site-wide chrome uses one static, scoped sheet.
  "../styles-site-astra.css?url",
  // The requested dashboard shares its metal panels with the existing chrome.
  "../styles-command-chrome.css?url",
  // Owner (2026-10-26): the dynamic GUI kit (.dg-*) on every page, last.
  "../styles-dynamic-gui.css?url",
  // Owner (2026-10-30): the future-motion layer (springs, scan arrivals, cascades) after the kit.
  "../styles-fx-motion.css?url",
  // Owner (2026-10-30): 未来的でダイナミックな色合い — the future spectrum's colour and surfaces, after the kit.
  "../styles-future-spectrum.css?url",
  // Owner (2026-10-30): the buttons' optional liquid glass, scoped to
  // html[data-button-style="liquid"], the last sheet.
  "../styles-liquid-glass.css?url",
  // Owner (2026-10-31): the glass spread to the selection controls, same scope.
  "../styles-liquid-glass-controls.css?url",
  // Owner (2026-10-31): the same glass on the surfaces and chrome, scoped the same way.
  "../styles-liquid-glass-surfaces.css?url",
  fonts.SITE_CORE_FONTS_URL,
  // Zen Kaku Gothic New: the Google sheet served from this origin with metric overrides.
  "../styles-site-display-fonts.css?url",
  "hud-fonts",
  // Metric-corrected twins of the faces above, last so they outrank them.
  "../styles-site-metric-faces.css?url",
  // Owner (2026-11-06): Noto Sans JP and Zen Kaku cut to the site's characters,
  // after the Google faces so they are tried first (font-subsets.test.mjs).
  "../styles-font-subsets-core.css?url",
  "../styles-font-subsets-display.css?url",
  // Optical centring nudges (layout only), the last sheet on every page but the title.
  "../styles-control-optics.css?url",
];

test("non-opening pages keep every original shared stylesheet and its cascade order", () => {
  for (const route of [
    "/world",
    "/dream-chapter",
    "/gallery",
    "/rexonance-saga",
    "/extreme-saga",
    "/characters/ciel",
    "/search",
  ])
    assert.deepEqual(
      styles(route),
      // Owner (2026-11-06): the core Google faces come from the title's local
      // snapshot (Noto trimmed by the font subsets), in the same place.
      original.map((href) => (href === fonts.SITE_CORE_FONTS_URL ? "../styles-opening-fonts.css?url" : href)),
      route,
    );
});

test("opening removes only unused record UI CSS and preserves the same shell tokens", () => {
  // Owner (2026-10-14): faster startup only; Rexonance's complete head above is pinned unchanged.
  const omitted = new Set([
    "../styles-pickup-stability.css?url",
    "../styles-name-words.css?url",
    "../styles-pickup-visibility.css?url",
    "@/styles-inquiry-navigation.css?url",
  ]);
  const expected = original
    .filter((href) => !omitted.has(href))
    .filter((href) => href !== "../styles-site-display-fonts.css?url")
    // No display faces on the title, so no display subsets either.
    .filter((href) => href !== "../styles-font-subsets-display.css?url")
    // The opening merges the corrected faces in place of the remote sheets.
    .filter((href) => href !== "../styles-site-metric-faces.css?url")
    // The title's controls take their nudges inside the opening's own sheets.
    .filter((href) => href !== "../styles-control-optics.css?url")
    .filter((href) => href !== "../styles-saga-streamline.css?url")
    .filter((href) => href !== "@/styles-interaction-choreography.css?url")
    // Owner (2026-10-30): the future spectrum paints no title surface, so the title skips it.
    .filter((href) => href !== "../styles-future-spectrum.css?url")
    .map((href) =>
      href === "../styles-stage-shell.css?url" ? "../styles-opening-shell.css?url" : href,
    );
  const bundles = Object.fromEntries(["platform", "interface"].map((name) => [
    `../styles-opening-${name}.css?url`,
    Array.from(read(`src/styles-opening-${name}.css`).matchAll(/@import "\.\/(.*?)";/g),
      (match) => `../${match[1]}?url`),
  ]));
  bundles["../styles-opening-fonts.css?url"] = [fonts.SITE_CORE_FONTS_URL, "hud-fonts"];
  const actual = styles("/");
  assert.deepEqual(
    actual.flatMap((href) => bundles[href] ?? [href]),
    expected,
    "bundles expand to the complete unchanged title/dashboard cascade",
  );
  assert.equal(actual.length, expected.length - 18);
  assert.equal(actual.filter((href) => href.startsWith("../")).length, 8);
  const tokenBlock = (file) => read(file).match(/html\[data-family\] \{[\s\S]*?\n\}/)[0];
  assert.equal(
    tokenBlock("src/styles-opening-shell.css"),
    tokenBlock("src/styles-stage-shell.css"),
  );
  assert.ok(
    read("src/styles-opening-shell.css").length < read("src/styles-stage-shell.css").length * 0.03,
  );
  for (const file of [
    "src/styles-pickup-stability.css",
    "src/styles-pickup-visibility.css",
    "src/styles-name-words.css",
    "src/styles-inquiry-navigation.css",
  ])
    assert.doesNotMatch(read(file), /\.cine-|\.load-gate|--op-/);
});

test("opening bundles inline every rule in original order without runtime import waterfalls", async () => {
  const { preprocessCSS, resolveConfig } = await import("vite");
  const { fileURLToPath } = await import("node:url");
  const { glassSelectorBuckets } = await import("./glass-selector-buckets.mjs");
  const config = await resolveConfig({
    configFile: false,
    css: { postcss: { plugins: [glassSelectorBuckets()] } },
  }, "build");
  const transform = async (file) => (await preprocessCSS(
    read(file), fileURLToPath(new URL(`../${file}`, import.meta.url)), config,
  )).code;
  const normalize = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");
  for (const name of ["platform", "interface"]) {
    const file = `src/styles-opening-${name}.css`;
    const members = Array.from(read(file).matchAll(/@import "\.\/(.*?)";/g), (match) => `src/${match[1]}`);
    const bundled = await transform(file);
    const originals = await Promise.all(members.map(transform));
    assert.doesNotMatch(bundled, /@import\b/);
    assert.equal(normalize(bundled), normalize(originals.join("\n")), name);
    assert.ok(!members.includes("src/styles.css"), "Tailwind keeps its own compilation");
    assert.ok(members.every((path) => !path.includes("styles-liquid-glass")), "filename-sensitive glass transform keeps its original input");
  }
});
