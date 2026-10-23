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

let focusPanelInitializer;
function findFocusPanel(node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === "focusPanel" &&
    node.initializer &&
    ts.isArrowFunction(node.initializer)
  ) {
    focusPanelInitializer = node.initializer;
  }
  ts.forEachChild(node, findFocusPanel);
}
findFocusPanel(tree);
assert.ok(focusPanelInitializer, "focusPanel arrow initializer is present");

const compiledFocusPanel = ts.transpileModule(
  `globalThis.focusPanel = ${focusPanelInitializer.getText(tree)};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function fixture({
  panelVisibility = "visible",
  closeVisibility = "visible",
  restoreFocus = true,
} = {}) {
  const frames = new Map();
  const focusCalls = [];
  const queriedSelectors = [];
  const styleReads = [];
  let nextFrameId = 1;
  const closeButton = {
    visibility: closeVisibility,
    focus: (options) => focusCalls.push({ target: "close", options }),
  };
  const panel = {
    visibility: panelVisibility,
    focus: (options) => focusCalls.push({ target: "panel", options }),
    querySelector: (selector) => {
      queriedSelectors.push(selector);
      return selector === ".side-panel-close" ? closeButton : null;
    },
  };
  const context = {
    window: {
      getComputedStyle: (element) => {
        styleReads.push(element);
        return { visibility: element.visibility };
      },
      requestAnimationFrame: (callback) => {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id) => frames.delete(id),
    },
    panel,
    sideMenuRestoreFocusRef: { current: restoreFocus },
    focusFrame: 0,
  };
  vm.runInNewContext(compiledFocusPanel, context);
  return {
    ...context,
    closeButton,
    frames,
    focusCalls,
    queriedSelectors,
    styleReads,
    runNextFrame() {
      const entry = frames.entries().next().value;
      if (!entry) return false;
      const [id, callback] = entry;
      frames.delete(id);
      callback(16);
      return true;
    },
    invoke: () => vm.runInNewContext("focusPanel()", context),
  };
}

test("visible panel waits a frame while its close control is hidden", () => {
  const state = fixture({ panelVisibility: "visible", closeVisibility: "hidden" });
  state.invoke();
  assert.equal(state.focusCalls.length, 0);
  assert.equal(state.frames.size, 1);
  assert.deepEqual(state.queriedSelectors, [".side-panel-close"]);
});

test("the next frame focuses the revealed close control with preventScroll", () => {
  const state = fixture({ panelVisibility: "visible", closeVisibility: "hidden" });
  state.invoke();
  state.closeButton.visibility = "visible";
  assert.equal(state.runNextFrame(), true);
  assert.equal(state.focusCalls.length, 1);
  assert.equal(state.focusCalls[0].target, "close");
  assert.equal(state.focusCalls[0].options.preventScroll, true);
  assert.equal(state.frames.size, 0);
});

test("a hidden panel continues waiting before selecting a focus target", () => {
  const state = fixture({ panelVisibility: "hidden", closeVisibility: "visible" });
  state.invoke();
  assert.equal(state.focusCalls.length, 0);
  assert.equal(state.frames.size, 1);
  assert.deepEqual(state.queriedSelectors, []);
});

test("pointer mode focuses the visible panel itself", () => {
  const state = fixture({
    panelVisibility: "visible",
    closeVisibility: "hidden",
    restoreFocus: false,
  });
  state.invoke();
  assert.equal(state.focusCalls.length, 1);
  assert.equal(state.focusCalls[0].target, "panel");
  assert.equal(state.focusCalls[0].options.preventScroll, true);
  assert.deepEqual(state.queriedSelectors, []);
});

test("the menu effect cancels its pending animation frame during cleanup", () => {
  assert.match(source, /window\.cancelAnimationFrame\(focusFrame\);/);
});
