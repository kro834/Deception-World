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
