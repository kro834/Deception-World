import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const tree = ts.createSourceFile(
  "world-chrome.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let jump;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "jumpAtlasGroup")
    jump = node.initializer;
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(jump, "the atlas jump is present");
const compiled = ts.transpileModule(`globalThis.jumpAtlasGroup = ${jump.getText(tree)};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function fixture({ missing = false, empty = false, height = 740, controlOffset = 70 } = {}) {
  const focusCalls = [];
  const panel = {
    scrollTop: 100,
    getBoundingClientRect: () => ({ bottom: height }),
    querySelector(selector) {
      if (selector === ".side-panel-head")
        return { getBoundingClientRect: () => ({ bottom: 140 }) };
      return missing ? null : target;
    },
  };
  const control = {
    getBoundingClientRect: () => ({ bottom: 500 + controlOffset - panel.scrollTop }),
    focus: (options) => focusCalls.push(options),
  };
  const target = {
    getBoundingClientRect: () => ({ top: 500 - panel.scrollTop }),
    querySelector: () => (empty ? null : control),
  };
  const context = { panelRef: { current: panel }, SIDE_MENU_GROUP_CLEARANCE_PX: 36 };
  vm.runInNewContext(compiled, context);
  return {
    panel,
    control,
    target,
    focusCalls,
    jump: (keyboard) => context.jumpAtlasGroup("sections", keyboard),
  };
}

test("pointer atlas jump scrolls only its dialog and keeps focus untouched", () => {
  const state = fixture();
  state.jump(false);
  assert.equal(state.target.getBoundingClientRect().top, 176);
  assert.equal(state.focusCalls.length, 0);
});

test("keyboard atlas jump focuses the destination without scrolling its document", () => {
  const state = fixture();
  state.jump(true);
  assert.equal(state.focusCalls.length, 1);
  assert.equal(state.focusCalls[0].preventScroll, true);
  assert.ok(state.control.getBoundingClientRect().bottom < 740);
});

test("a short landscape viewport reveals the link below the scene before moving focus", () => {
  const state = fixture({ height: 300, controlOffset: 276 });
  state.jump(true);
  assert.equal(state.control.getBoundingClientRect().bottom, 284);
  assert.equal(state.focusCalls.length, 1);
});

test("a missing context group does not scroll or move focus", () => {
  const state = fixture({ missing: true });
  state.jump(true);
  assert.equal(state.panel.scrollTop, 100);
  assert.equal(state.focusCalls.length, 0);
});

test("a temporarily empty group can be reached without inventing a focus target", () => {
  const state = fixture({ empty: true });
  state.jump(true);
  assert.equal(state.target.getBoundingClientRect().top, 176);
  assert.equal(state.focusCalls.length, 0);
});

test("every atlas layout reserves named areas for the common groups on every page", () => {
  const css = readFileSync(new URL("../src/styles-command-chrome.css", import.meta.url), "utf8");
  const commonAreas = ["find", "sec", "spe", "sto", "rid", "rik", "rel", "unm", "inf", "sys"];
  const layouts = [...css.matchAll(/grid-template-areas:\s*([^;]+);/g)];
  assert.ok(layouts.length >= 3, "phone, tablet and desktop layouts are covered");
  for (const [, layout] of layouts) {
    const areas = new Set(layout.replaceAll('"', "").split(/\s+/));
    for (const area of commonAreas) {
      assert.ok(
        areas.has(area),
        `${area} needs an explicit track in ${layout}; otherwise CSS Grid creates implicit tracks`,
      );
    }
  }
  assert.doesNotMatch(css, /:not\(\[data-file-menu="true"\]\)[^{]*\{[^}]*grid-template-areas:/);
});

test("the atlas keeps its full-width shell without enabling a panel-wide pointer effect", () => {
  const shell = readFileSync(new URL("../src/styles-stage-shell.css", import.meta.url), "utf8");
  const layout = shell.match(
    /#site-side-panel\.side-panel\[data-command-atlas\]\s*\{([^}]+)\}/,
  )?.[1];
  assert.ok(layout, "geometry must be attached to the menu marker, not an optional effect");
  for (const declaration of [
    /left: 0;/,
    /right: 0;/,
    /width: auto;/,
    /max-width: none;/,
    /display: grid;/,
  ]) {
    assert.match(layout, declaration);
  }
  let panel;
  function findPanel(node) {
    if (
      ts.isJsxOpeningElement(node) &&
      node.tagName.getText(tree) === "aside" &&
      node.attributes.properties.some(
        (attribute) =>
          attribute.name?.getText(tree) === "id" &&
          attribute.initializer?.getText(tree) === '"site-side-panel"',
      )
    )
      panel = node;
    ts.forEachChild(node, findPanel);
  }
  findPanel(tree);
  assert.ok(panel);
  const attributes = panel.attributes.properties.map((attribute) => attribute.name?.getText(tree));
  assert.ok(attributes.includes("data-command-atlas"));
  assert.ok(
    !attributes.includes("data-liquid-pointer"),
    "the full panel does not own a pointer effect",
  );
});
