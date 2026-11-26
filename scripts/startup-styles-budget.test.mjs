import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as fonts from "../src/lib/site-fonts.ts";
import { compactStylesheetGroups } from "../src/lib/compact-stylesheet-groups.ts";
import * as buttonStyle from "../src/lib/button-style.js";

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
    if (name === "@/lib/button-style.js") return buttonStyle;
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
  // Owner (2026-11-22): the ring system (円環 composition, bouncing springs)
  // and the shared chrome that wears it, right after the motion layer.
  "../styles-ring.css?url",
  "../styles-ring-chrome.css?url",
  // Owner (2026-10-30): 未来的でダイナミックな色合い — the future spectrum's colour and surfaces, after the kit.
  "../styles-future-spectrum.css?url",
  // 2026-11-26: one header grammar over every bar, after the spectrum (not on the title).
  "../styles-chrome-unify.css?url",
  // Owner (2026-11-20): the optional liquid glass's three sheets (about 160 KB,
  // every rule scoped to html[data-button-style="liquid"]) are no longer linked
  // on every page. Their place in the cascade is still here, after the spectrum
  // and before the faces: the head script links them there only while the
  // option is on (pinned below).
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
    // The title's dashboard header is styled in its own sheet.
    .filter((href) => href !== "../styles-chrome-unify.css?url")
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
  // 2026-11-22: 18 before; the two ring sheets ride inside the interface bundle.
  assert.equal(actual.length, expected.length - 20);
  // Owner (2026-11-20): 8 before; the three glass sheets load only with the option on.
  assert.equal(actual.filter((href) => href.startsWith("../")).length, 5);
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

// Owner (2026-11-20): the liquid glass loads only while its option is on.
const GLASS_SHEETS = [
  "../styles-liquid-glass.css?url",
  "../styles-liquid-glass-controls.css?url",
  "../styles-liquid-glass-surfaces.css?url",
];
const glassScript = (routeId) =>
  Array.from(exports.Route.head({ matches: [{ routeId }] }).scripts)
    .map((script) => script.children)
    .filter((children) => children?.includes(buttonStyle.LIQUID_GLASS_SHEETS_GLOBAL));

/* A head for the loader: stylesheet links in order, and the calls it makes. */
function runGlassScript(children, hrefs, { liquid }) {
  const links = hrefs.map((href) => ({ href, sheet: {}, getAttribute: () => href }));
  const made = [];
  const head = {
    insertBefore(node, before) {
      links.splice(before ? links.indexOf(before) : links.length, 0, node);
    },
  };
  for (const link of links) link.parentNode = head;
  const window = { setTimeout: () => 0 };
  runInNewContext(children, {
    window,
    document: {
      head,
      documentElement: { getAttribute: () => (liquid ? "liquid" : null) },
      querySelectorAll: () => links.filter((link) => !made.includes(link)),
      createElement: () => {
        const attributes = {};
        const listeners = {};
        const node = {
          sheet: null,
          attributes,
          setAttribute: (name, value) => (attributes[name] = value),
          getAttribute: (name) => (name === "href" ? node.href : attributes[name]),
          addEventListener: (type, listener) => (listeners[type] = listener),
          load() {
            node.sheet = {};
            listeners.load?.();
          },
        };
        made.push(node);
        return node;
      },
    },
  });
  return { links, made, load: window[buttonStyle.LIQUID_GLASS_SHEETS_GLOBAL] };
}

test("no page links the liquid glass sheets until the option is on", () => {
  for (const route of ["/", "/world", "/gallery", "/rexonance-saga", "/characters/ciel"]) {
    assert.ok(styles(route).every((href) => !href.includes("liquid-glass")), route);
    const scripts = glassScript(route);
    assert.equal(scripts.length, 1, route);
    // The same script on every route, so a navigation never runs it again.
    assert.equal(scripts[0], glassScript("/world")[0]);
    const head = Array.from(exports.Route.head({ matches: [{ routeId: route }] }).scripts);
    const at = (text) => head.findIndex((script) => script.children === text);
    assert.ok(at(scripts[0]) > at(buttonStyle.BUTTON_STYLE_SCRIPT), "after the style is decided");
  }
});

test("with the option on the glass sheets take their old place in the cascade, in order", () => {
  for (const route of ["/", "/world", "/gallery"]) {
    const [children] = glassScript(route);
    const hrefs = styles(route);
    const off = runGlassScript(children, hrefs, { liquid: false });
    assert.equal(off.made.length, 0, "off: nothing is requested");
    assert.equal(typeof off.load, "function");
    const on = runGlassScript(children, hrefs, { liquid: true });
    assert.deepEqual(on.made.map((link) => link.href), GLASS_SHEETS);
    for (const link of on.made) {
      assert.equal(link.rel, "stylesheet");
      assert.equal(link.attributes.blocking, "render", "the first paint waits for the glass");
    }
    const order = on.links.map((link) => link.href);
    const first = order.indexOf(GLASS_SHEETS[0]);
    assert.deepEqual(order.slice(first, first + 3), GLASS_SHEETS);
    // After the spectrum and the header grammar (the interface bundle on the
    // title), before the faces.
    assert.equal(
      order[first - 1],
      route === "/" ? "../styles-opening-interface.css?url" : "../styles-chrome-unify.css?url",
    );
    if (route !== "/") assert.equal(order[first - 2], "../styles-future-spectrum.css?url");
    assert.equal(order[first + 3], "../styles-opening-fonts.css?url");
    assert.deepEqual(order.filter((href) => !href.includes("liquid-glass")), hrefs);
  }
});

test("the switch links the sheets once and turns the glass on only when all three have loaded", () => {
  const [children] = glassScript("/world");
  const page = runGlassScript(children, styles("/world"), { liquid: false });
  let done = 0;
  page.load(() => (done += 1));
  assert.equal(page.made.length, 3);
  assert.equal(done, 0);
  page.made[0].load();
  page.made[1].load();
  assert.equal(done, 0);
  page.made[2].load();
  assert.equal(done, 1);
  // A second switch reuses the loaded sheets and answers at once.
  page.load(() => (done += 1));
  assert.equal(page.made.length, 3);
  assert.equal(done, 2);
  const source = read("src/lib/button-style.js");
  assert.match(source, /load\(\(\) => \{\s*settled = true;\s*turnOn\(\);/);
  assert.match(source, /if \(wantedButtonStyle !== "liquid"\) return;/);
});
