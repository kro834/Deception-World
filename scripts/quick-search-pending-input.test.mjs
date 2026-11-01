import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isQuickSearchShortcut } from "../src/components/search/quick-search-shortcut.ts";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/search/quick-search-host.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

// Run the real host's keyboard listener while its lazy child has not painted.
function hostFixture() {
  const states = [],
    refs = [],
    dependencies = [],
    effects = [];
  const listeners = new Map();
  let stateIndex = 0,
    refIndex = 0,
    effectIndex = 0;
  let pathname = "/world",
    dialogOpen = false,
    tree;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name),
    },
    document: { querySelector: () => (dialogOpen ? {} : null) },
    require(name) {
      if (name === "react")
        return {
          lazy: () => "QuickSearchDialog",
          Suspense: "Suspense",
          useState(initial) {
            const index = stateIndex++;
            if (!(index in states)) states[index] = initial;
            return [
              states[index],
              (value) => {
                states[index] = value;
              },
            ];
          },
          useRef: (current) => (refs[refIndex++] ??= { current }),
          useEffect(callback, deps) {
            const index = effectIndex++;
            if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) {
              dependencies[index] = deps;
              effects.push(callback);
            }
          },
        };
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
      if (name === "@tanstack/react-router") return { useRouterState: () => pathname };
      if (name === "./quick-search-events") return { QUICK_SEARCH_OPEN_EVENT: "dw:quick-search" };
      if (name === "./quick-search-shortcut")
        return {
          isQuickSearchShortcut,
          isTypingTarget: () => false,
          quickSearchBlocked: () => false,
        };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const render = () => {
    stateIndex = refIndex = effectIndex = 0;
    tree = exports.QuickSearchHost();
    while (effects.length) effects.shift()();
    return tree?.props.children.props;
  };
  render();
  return {
    props: render,
    key(key, overrides = {}) {
      let prevented = false;
      listeners.get("keydown")({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        defaultPrevented: false,
        preventDefault() {
          prevented = true;
        },
        ...overrides,
      });
      render();
      return prevented;
    },
    route(next) {
      pathname = next;
      render();
    },
    painted() {
      dialogOpen = true;
    },
    close() {
      render().onClose();
      dialogOpen = false;
      render();
    },
  };
}

test("pending search text honors Backspace including an empty buffer", () => {
  const host = hostFixture();
  host.key("/");
  for (const key of ["a", "b", "c", "Backspace"]) assert.equal(host.key(key), true);
  assert.equal(host.props().seed, "ab");
  for (let i = 0; i < 3; i++) host.key("Backspace");
  assert.equal(host.props().seed, "");
  assert.equal(host.props().open, true);
});

test("Escape cancels a pending open and leaves later page keys alone", () => {
  const host = hostFixture();
  host.key("/");
  host.key("a");
  assert.equal(host.key("Escape"), true);
  assert.equal(host.props().open, false);
  assert.equal(host.props().seed, "");
  assert.equal(host.key("b"), false);
  host.key("/");
  host.key("c");
  assert.equal(host.props().seed, "c");
  assert.equal(host.props().open, true);
});

test("composition, modified keys and already-handled keys do not edit the pending text", () => {
  const host = hostFixture();
  host.key("/");
  host.key("a");
  for (const overrides of [
    { isComposing: true },
    { keyCode: 229 },
    { ctrlKey: true },
    { defaultPrevented: true },
  ]) {
    assert.equal(host.key("Backspace", overrides), false);
    assert.equal(host.key("Escape", overrides), false);
  }
  assert.equal(host.props().seed, "a");
  assert.equal(host.props().open, true);
});

test("closing an unseeded dialog or changing routes ends pending key capture", () => {
  const closed = hostFixture();
  closed.key("/");
  closed.painted();
  closed.close();
  assert.equal(closed.key("a"), false);
  assert.equal(closed.props().seed, "");
  const routed = hostFixture();
  routed.key("/");
  routed.key("a");
  routed.route("/library");
  assert.equal(routed.key("b"), false);
  assert.equal(routed.props().open, false);
  assert.equal(routed.props().seed, "");
});
