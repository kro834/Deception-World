import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = (name, state = undefined) => {
  const exports = {};
  const source = read(`src/components/rexonance-saga/${name}.tsx`);
  const control = { state };
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Event,
      requestAnimationFrame() {},
      require(name) {
        if (name === "react")
          return {
            ...React,
            memo: (value) => value,
            useEffect() {},
            useState: (initial) => [
              control.state ?? initial,
              (value) => {
                control.state = value;
              },
            ],
          };
        if (name === "@/lib/rexonance-images") return { rexonanceImage: () => ({}) };
        return require(name);
      },
    },
  );
  return { ...exports, control };
};
const elements = (tree) => {
  if (!React.isValidElement(tree)) return [];
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)];
};

test("comparison cards create images only while open and retain the existing form control", () => {
  const { RexonanceFormComparison } = component("rexonance-form-comparison");
  const forms = ["standard", "max", "ultra"].map((key) => ({
    key,
    label: key,
    code: key.toUpperCase(),
    image: `/${key}.webp`,
    alt: key,
    title: `${key} title`,
    points: ["一つの特性"],
    accent: "#63e2ff",
  }));
  const chosen = [];
  const props = { forms, selected: "max", onChoose: (key) => chosen.push(key) };
  const closed = RexonanceFormComparison(props);
  assert.equal(closed.type, "details", "native disclosure retains keyboard support");
  assert.equal(elements(closed).filter((node) => node.type === "img").length, 0);
  assert.doesNotMatch(renderToStaticMarkup(closed), /<img|standard\.webp|max\.webp|ultra\.webp/);
  closed.props.onToggle({ currentTarget: { open: true } });
  const opened = RexonanceFormComparison(props);
  const images = elements(opened).filter((node) => node.type === "img");
  assert.deepEqual(
    images.map((node) => node.props.src),
    forms.map((form) => form.image),
  );
  assert.ok(images.every((node) => node.props.loading === "lazy"));
  const buttons = elements(opened).filter((node) => node.type === "button");
  assert.deepEqual(
    buttons.map((node) => node.props["aria-pressed"]),
    [false, true, false],
  );
  assert.ok(buttons.every((node) => node.props["aria-controls"] === "rxs-stage-panel"));
  buttons[2].props.onClick({ detail: 1 });
  assert.equal(buttons[1].props.children, "maxを表示中");
  assert.deepEqual(chosen, ["ultra"]);
  opened.props.onToggle({ currentTarget: { open: false } });
  assert.equal(
    elements(RexonanceFormComparison(props)).filter((node) => node.type === "img").length,
    0,
  );
});

const pageSource = ts.createSourceFile(
  "rexonance-saga.tsx",
  read("src/components/rexonance-saga/rexonance-saga.tsx"),
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX,
);
const nodes = (root, predicate) => {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
};
const attribute = (element, name) => {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  const value = opening.attributes.properties.find(
    (entry) => ts.isJsxAttribute(entry) && entry.name.getText() === name,
  );
  return value?.initializer && ts.isStringLiteral(value.initializer)
    ? value.initializer.text
    : null;
};

test("assembly instructions and retry remain outside the decorative hidden runway", () => {
  const guideNode = nodes(
    pageSource,
    (node) =>
      ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "RexonanceAssemblyGuide",
  )[0];
  assert.ok(guideNode && ts.isJsxFragment(guideNode.parent));
  const siblings = guideNode.parent.children.filter(
    (node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node),
  );
  assert.equal(siblings[0], guideNode);
  assert.equal(attribute(siblings[1], "className"), "rzn-suitup");
  assert.equal(attribute(siblings[1], "aria-hidden"), "true");
  assert.equal(siblings[2].tagName.getText(), "RexonanceAssemblyReplay");
  const events = [];
  const { RexonanceAssemblyGuide } = component("rexonance-assembly-guide", "error");
  const guide = RexonanceAssemblyGuide({
    runwayRef: { current: { dispatchEvent: (event) => events.push(event.type) } },
  });
  const html = renderToStaticMarkup(guide);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /aria-hidden="true"/);
  elements(guide)
    .find((node) => node.type === "button")
    .props.onClick();
  assert.deepEqual(events, ["rexonance:assembly-retry"]);
});

test("desktop grid follows guide, assembly, replay, forms and system in reading order", () => {
  const sheet = postcss.parse(read("src/styles-rexonance-editorial.css"));
  const sequence = [
    ".rxs-assembly-heading",
    ".rzn-suitup",
    ".rxs-assembly-footer",
    "#stages",
    "#system",
    ".rxs-footer",
  ];
  const rows = sequence.map((selector) => {
    let row = null;
    sheet.walkRules((rule) => {
      if (!rule.selector.replace(/\s+/g, " ").endsWith(`> ${selector}`)) return;
      if (rule.parent.type !== "atrule" || rule.parent.params !== "(min-width: 1100px)") return;
      rule.walkDecls("grid-row", (declaration) => {
        row = Number(declaration.value);
      });
    });
    assert.ok(Number.isInteger(row), `${selector}: explicit desktop grid row`);
    return row;
  });
  rows.slice(1).forEach((row, index) => assert.equal(row, rows[index] + 1));
});

test("the five chapter links remain native anchors with one real destination each", () => {
  const { RexonanceChapterMap } = component("rexonance-editorial");
  const links = elements(RexonanceChapterMap()).filter((node) => node.type === "a");
  const expected = ["performance", "p14", "assembly", "stages", "system"];
  assert.deepEqual(
    links.map((node) => node.props.href),
    expected.map((id) => `#${id}`),
  );
  assert.ok(
    links.every((node) => node.props.onClick === undefined),
    "browser owns anchor navigation",
  );
  const sources = [
    pageSource,
    ts.createSourceFile(
      "guide.tsx",
      read("src/components/rexonance-saga/rexonance-assembly-guide.tsx"),
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TSX,
    ),
  ];
  for (const id of expected) {
    const destinations = sources.flatMap((source) =>
      nodes(
        source,
        (node) =>
          (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
          attribute(node, "id") === id,
      ),
    );
    assert.equal(destinations.length, 1, `#${id}: unique real destination`);
  }
});
