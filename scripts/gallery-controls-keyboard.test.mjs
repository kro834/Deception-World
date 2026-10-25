import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadComponent(path) {
  const exports = {};
  const refs = [];
  const react = {
    ...require("react"),
    useId: () => "gallery-controls-test",
    useRef: (current) => {
      const ref = { current };
      refs.push(ref);
      return ref;
    },
  };
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (name === "react") return react;
        if (name === "./gallery-viewer-state")
          return require("../src/components/gallery/gallery-viewer-state.ts");
        return require(name);
      },
    },
  );
  return { exports, refs };
}

function findElement(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
}

function keyEvent(key, extra = {}) {
  return {
    key,
    nativeEvent: {},
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    ...extra,
  };
}

test("Escape clears ordinary search once and preserves IME text during composition", () => {
  const { exports } = loadComponent("src/components/gallery/gallery-search-controls.tsx");
  const changes = [];
  const tree = exports.GallerySearchControls({
    query: "青 金",
    onQueryChange: (query) => changes.push(query),
  });
  const input = findElement(tree, (element) => element.type === "input");
  input.props.onCompositionStart();
  const composing = keyEvent("Escape");
  input.props.onKeyDown(composing);
  assert.deepEqual(changes, []);
  assert.equal(composing.prevented, false);
  input.props.onCompositionEnd();
  for (const nativeEvent of [{ isComposing: true }, { keyCode: 229 }]) {
    input.props.onKeyDown(keyEvent("Escape", { nativeEvent }));
  }
  assert.deepEqual(changes, []);
  const escape = keyEvent("Escape");
  input.props.onKeyDown(escape);
  assert.deepEqual(changes, [""]);
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);
});

test("clearing search returns focus without scrolling, while other keys preserve the query", () => {
  const { exports, refs } = loadComponent("src/components/gallery/gallery-search-controls.tsx");
  const changes = [];
  const focusOptions = [];
  const tree = exports.GallerySearchControls({
    query: "080–089",
    onQueryChange: (query) => changes.push(query),
  });
  refs[0].current = { focus: (options) => focusOptions.push(options) };
  const input = findElement(tree, (element) => element.type === "input");
  input.props.onKeyDown(keyEvent("Enter"));
  assert.deepEqual(changes, []);
  const clear = findElement(tree, (element) => element.type === "button");
  clear.props.onClick();
  assert.deepEqual(changes, [""]);
  assert.equal(focusOptions.length, 1);
  assert.equal(focusOptions[0].preventScroll, true);
});

test("display radios preserve native arrows and support Home/End without leaking to the viewer", () => {
  const { exports } = loadComponent("src/components/gallery/gallery-display-settings.tsx");
  for (const tree of [
    exports.GalleryBackgroundControl({ value: "ink", onChange() {} }),
    exports.GalleryDisplaySettings({
      value: { density: "standard", background: "ink" },
      onChange() {},
      onReset() {},
    }),
  ]) {
    const field = findElement(tree, (element) => element.type === "fieldset");
    const calls = [];
    const choices = [0, 1, 2].map((index) => ({
      focus: (options) => calls.push(["focus", index, options.preventScroll]),
      click: () => calls.push(["click", index]),
      closest: () => null,
    }));
    const target = { tagName: "INPUT", type: "radio" };
    const currentTarget = { querySelectorAll: () => choices };
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
      const event = keyEvent(key, { target, currentTarget });
      field.props.onKeyDown(event);
      assert.equal(event.stopped, true);
      assert.equal(event.prevented, false, "native radio navigation must remain active");
    }
    for (const [key, index] of [
      ["Home", 0],
      ["End", 2],
    ]) {
      const event = keyEvent(key, { target, currentTarget });
      field.props.onKeyDown(event);
      assert.equal(event.stopped, true);
      assert.equal(event.prevented, true);
      assert.deepEqual(calls.splice(0), [
        ["focus", index, true],
        ["click", index],
      ]);
    }
    const escape = keyEvent("Escape", { target, currentTarget });
    field.props.onKeyDown(escape);
    assert.equal(escape.stopped, false, "Escape must still close the viewer");
    assert.equal(escape.prevented, false);
  }
});
