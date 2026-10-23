import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
import { RELATED_SECTIONS } from "../src/components/world/related-data.ts";
import { YOAKE_MAMORI_SECTIONS } from "../src/components/world/yoake-mamori-data.ts";
import { VARG_SECTIONS } from "../src/components/world/varg-data.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const module = {};
let search = {};
const guardedCalls = [];
runInNewContext(
  ts.transpileModule(read("src/components/world/character-reading-tools.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  {
    exports: module,
    require: (name) => {
      if (name === "@tanstack/react-router") {
        return { useRouterState: ({ select }) => select({ location: { search } }) };
      }
      if (name === "@/components/load-gate") {
        return {
          GuardedLink: ({ to, hash, search: origin, assets, children }) => {
            guardedCalls.push({ to, hash, origin, assets });
            const query = origin ? `?${new URLSearchParams(origin)}` : "";
            return React.createElement(
              "a",
              { href: to + query + (hash ? `#${hash}` : "") },
              children,
            );
          },
        };
      }
      if (name === "@/lib/dossier-origin") {
        return require("../src/lib/dossier-origin.ts");
      }
      if (name === "./dossier-reader") return { PhrasedText: ({ text }) => text };
      return require(name);
    },
  },
);
const renderChapter = (props) =>
  renderToStaticMarkup(React.createElement(module.CharacterChapterTools, props));
const renderRecords = (records) =>
  renderToStaticMarkup(React.createElement(module.CharacterRelatedRecords, { records }));

test("published chapter ordering and next titles drive native continuation links", () => {
  for (const sections of [
    RELATED_SECTIONS.terra,
    RELATED_SECTIONS.luna,
    YOAKE_MAMORI_SECTIONS,
    VARG_SECTIONS,
  ]) {
    for (let index = 0; index < sections.length; index += 1) {
      const markup = renderChapter({ sections, currentNo: sections[index].no });
      assert.match(markup, /href="#dossier-index"/);
      if (index > 0)
        assert.ok(markup.includes(`href="#character-section-${sections[index - 1].no}"`));
      else assert.doesNotMatch(markup, /前の章/);
      if (index + 1 < sections.length) {
        assert.ok(markup.includes(`href="#character-section-${sections[index + 1].no}"`));
        assert.ok(markup.includes(sections[index + 1].title));
      } else assert.doesNotMatch(markup, /次の章/);
    }
  }
});

test("only the final chapter offers a supplied follow-up and unknown chapters are absent", () => {
  const sections = RELATED_SECTIONS.terra;
  const continuation = { href: "#form-records", title: "レルム アースフォーム" };
  assert.doesNotMatch(
    renderChapter({ sections, currentNo: sections[0].no, continuation }),
    /#form-records/,
  );
  const final = renderChapter({ sections, currentNo: sections.at(-1).no, continuation });
  assert.match(final, /href="#form-records"/);
  assert.match(final, /レルム アースフォーム/);
  assert.equal(renderChapter({ sections, currentNo: "missing", continuation }), "");
});

test("related dossier links forward only the validated cast origin while fragment links stay native", () => {
  const records = [
    {
      to: "/managers/shuza",
      assets: ["/manager-shuza.jpeg"],
      title: "シュザ",
      context: "性格と闘い方の章に登場する人物の資料",
    },
    { href: "#form-records", title: "変身記録", context: "この資料の続きを読む" },
  ];
  for (const from of [undefined, "cast-roster", "https://example.com"]) {
    search = { from };
    guardedCalls.length = 0;
    const markup = renderRecords(records);
    assert.ok(
      markup.includes(
        from === "cast-roster"
          ? 'href="/managers/shuza?from=cast-roster"'
          : 'href="/managers/shuza"',
      ),
    );
    assert.match(markup, /href="#form-records"/);
    assert.equal(guardedCalls.length, 1);
    assert.deepEqual(guardedCalls[0].assets, records[0].assets);
  }
  assert.equal(renderRecords([]), "");
});

test("tools do not reinterpret chapter text as HTML", () => {
  const markup = renderChapter({
    sections: [
      { no: "01", title: "前" },
      { no: "02", title: "<script>bad</script>" },
    ],
    currentNo: "01",
  });
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});

test("special-site records retain their exact section destination and cast origin", () => {
  search = { from: "cast-roster" };
  guardedCalls.length = 0;
  const markup = renderRecords([
    {
      to: "/final-stage",
      hash: "far-from-saga",
      assets: [],
      title: "ファーフロムサーガ",
      context: "特設サイトへ",
    },
  ]);
  assert.match(markup, /href="\/final-stage\?from=cast-roster#far-from-saga"/);
  assert.equal(guardedCalls[0].hash, "far-from-saga");
});

test("the five character routes opt in without modifying shared dossier navigation", () => {
  for (const name of ["ciel", "dante", "luna", "terra", "yoake-mamori"]) {
    const route = read(`src/routes/characters/${name}.tsx`);
    assert.match(route, /styles-character-reading-tools\.css\?url/);
    assert.match(route, /href: characterReadingCssUrl/);
  }
  const ciel = read("src/components/world/ciel-page.tsx");
  assert.doesNotMatch(ciel, /<DossierNav/);
  for (const page of ["ciel", "dante", "related", "yoake-mamori"]) {
    const source = read(`src/components/world/${page}-page.tsx`);
    assert.match(source, /<DossierContents/);
    assert.match(source, /<DossierReader/);
    assert.match(source, /<CharacterChapterTools/);
    assert.match(source, /<CharacterRelatedRecords/);
  }
});

// These selectors contain only types, classes, :not(class) and state pseudo-classes.
// Count :not's argument, not the function itself, according to CSS specificity.
const selectorWeight = (selector) => {
  const expanded = selector.replace(/:not\(([^()]*)\)/g, "$1");
  const ids = (expanded.match(/#[\w-]+/g) ?? []).length;
  const classes = (expanded.match(/\.[\w-]+|:[\w-]+/g) ?? []).length;
  const types = (expanded.match(/(?:^|\s|[>+~])([a-z][\w-]*)/g) ?? []).length;
  return ids * 1_000_000 + classes * 1_000 + types;
};

function chapterStyleRules(source) {
  const rules = [];
  postcss.parse(source).walkRules((rule) => {
    for (const selector of rule.selectors) {
      const normalized = selector.replace(/\s+/g, " ").trim();
      if (!normalized.includes(".character-chapter-tools") || !/ a(?::[\w-]+)?$/.test(normalized))
        continue;
      const media = rule.parent.type === "atrule" ? rule.parent.params : "";
      const declarations = Object.fromEntries(
        rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]),
      );
      rules.push({ selector: normalized, media, declarations });
    }
  });
  return rules;
}

test("chapter controls outrank the paper edition's link and focus rules inside reading plates", () => {
  const rules = chapterStyleRules(read("src/styles-character-reading-tools.css"));
  const paper = read("src/styles-dossier-reading.css");
  const legacyLink = "main.manager-page.manager-page:not(.is-sovereign) .manager-copy-section a";
  assert.ok(paper.replace(/\s+/g, " ").includes(legacyLink));
  const normal = rules.find(
    (rule) => !rule.media && rule.declarations["text-decoration"] === "none",
  );
  const shortcut = rules.find(
    (rule) => !rule.media && rule.selector.includes(".character-chapter-shortcuts"),
  );
  const focus = rules.find((rule) => !rule.media && rule.selector.endsWith(":focus-visible"));
  const hover = rules.find(
    (rule) => rule.media.includes("hover: hover") && rule.selector.endsWith(":hover"),
  );
  assert.ok(selectorWeight(normal.selector) >= selectorWeight(legacyLink));
  assert.equal(normal.declarations.color, "var(--sd-text, #eef4fa)");
  assert.equal(shortcut.declarations.color, "var(--sd-text-2, #bac8d6)");
  assert.ok(selectorWeight(shortcut.selector) >= selectorWeight(normal.selector));
  assert.ok(selectorWeight(focus.selector) >= selectorWeight(`${legacyLink}:focus-visible`));
  assert.equal(
    focus.declarations.outline,
    "2px solid var(--sd-accent, var(--manager-accent, #86d9ff))",
  );
  assert.ok(selectorWeight(hover.selector) >= selectorWeight(shortcut.selector));
});

test("forced colours override ordinary, shortcut, hovered and focused chapter links", () => {
  const rules = chapterStyleRules(read("src/styles-character-reading-tools.css"));
  const normalColorRules = rules.filter(
    (rule) => !rule.media.includes("forced-colors") && rule.declarations.color,
  );
  for (const ordinary of normalColorRules) {
    const forced = rules.find(
      (rule) =>
        rule.media.includes("forced-colors") &&
        rule.selector === ordinary.selector &&
        rule.declarations.color === "LinkText",
    );
    assert.ok(forced, `forced-colour override for ${ordinary.selector}`);
    assert.ok(selectorWeight(forced.selector) >= selectorWeight(ordinary.selector));
    assert.ok(rules.indexOf(forced) > rules.indexOf(ordinary));
  }
  const forcedFocus = rules.find(
    (rule) =>
      rule.media.includes("forced-colors") && rule.declarations["outline-color"] === "Highlight",
  );
  assert.ok(
    selectorWeight(forcedFocus.selector) >=
      selectorWeight(
        "main.manager-page.manager-page:not(.is-sovereign) .manager-copy-section a:focus-visible",
      ),
  );
});
