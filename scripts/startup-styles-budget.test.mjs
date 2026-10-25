import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as fonts from "../src/lib/site-fonts.ts";

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
  fonts.SITE_CORE_FONTS_URL,
  fonts.SITE_DISPLAY_FONTS_URL,
  "hud-fonts",
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
    assert.deepEqual(styles(route), original, route);
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
    .filter((href) => href !== fonts.SITE_DISPLAY_FONTS_URL)
    .filter((href) => href !== "../styles-saga-streamline.css?url")
    .filter((href) => href !== "@/styles-interaction-choreography.css?url")
    .map((href) =>
      href === "../styles-stage-shell.css?url" ? "../styles-opening-shell.css?url" : href,
    );
  assert.deepEqual(styles("/"), expected);
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
