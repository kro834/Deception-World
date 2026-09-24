import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// Dossier routes (/managers/*, /riders/*): no perpetual main-thread repaint
// or layer that nobody can see.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const styleRules = (css) =>
  [...css.matchAll(/(?<=^|[{};])\s*([^{};@\s][^{};]*)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim().replace(/\s+/g, " "),
    body: match[2],
  }));

const allCss = async () => {
  const files = [
    ...(await readdir(new URL("../src/", import.meta.url)))
      .filter((name) => name.endsWith(".css"))
      .map((name) => `src/${name}`),
    ...(await readdir(new URL("../src/styles-world/", import.meta.url)))
      .filter((name) => name.endsWith(".css"))
      .map((name) => `src/styles-world/${name}`),
  ];
  return Promise.all(files.map(async (path) => ({ path, css: stripComments(await read(path)) })));
};

test("the manager glow ring is static: its rotation was invisible and kept a 58rem layer busy", async () => {
  for (const { path, css } of await allCss()) {
    assert.doesNotMatch(css, /@keyframes managerOrbit|managerOrbit/, path);
    for (const { selector, body } of styleRules(css)) {
      if (!/\.manager-glow(?![\w-])/.test(selector)) continue;
      assert.doesNotMatch(body, /animation(?:-[\w-]+)?:(?!\s*none)/, `${path}: ${selector}`);
    }
  }
  const ring = styleRules(stripComments(await read("src/styles-world/10.css"))).find(
    ({ selector }) => selector === ".manager-glow",
  );
  // Nothing else promotes it on its own: on Android a backface-visibility hint
  // alone kept it a 4512-5264px square layer (30-93 MB of tiles).
  for (const { path, css } of await allCss()) {
    for (const { selector, body } of styleRules(css)) {
      if (!/\.manager-glow(?![\w-])/.test(selector)) continue;
      assert.doesNotMatch(
        body,
        /(?:backface-visibility:\s*hidden|will-change:(?!\s*auto)|transform:|translate:|rotate:|scale:)/,
        `${path}: ${selector}`,
      );
    }
  }
  // The ring itself is kept: border and concentric spread shadows.
  assert.match(ring.body, /border-radius: 50%;/);
  assert.match(ring.body, /box-shadow:/);
});

test("on Android the sovereign seal arrives but does not pulse, and the title shine rests", async () => {
  const css = stripComments(await read("src/styles-world/20.css"));
  const rules = styleRules(css);
  // Every other renderer keeps both loops.
  const seal = rules.find(({ selector }) => selector === ".sovereign-apex-seal");
  assert.match(seal.body, /sovereignSealIn [^;]*both,\s*sovereignSealPulse [^;]*infinite;/);
  const title = rules.find(({ selector }) => selector === ".is-sovereign .manager-display-name");
  assert.match(title.body, /animation: sovereignTitleShine [^;]*infinite;/);

  const androidSeal = rules.find(
    ({ selector }) => selector === "html[data-android-renderer] .sovereign-apex-seal",
  );
  assert.match(androidSeal.body, /animation: sovereignSealIn [^;]*both;/);
  assert.doesNotMatch(androidSeal.body, /sovereignSealPulse|infinite/);
  const androidTitle = rules.find(
    ({ selector }) =>
      selector === "html[data-android-renderer] .is-sovereign .manager-display-name",
  );
  assert.match(androidTitle.body, /animation: none;/);
  // It rests on the gold end of the shine (its 50% frame), as under reduced motion.
  assert.match(androidTitle.body, /background-position: 0 50%;/);
  assert.match(css, /@keyframes sovereignTitleShine \{[^@]*50% \{\s*background-position: 0 50%;/);
});
