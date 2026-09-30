import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/content-protection.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function harness() {
  class HTMLElement {
    constructor(properties = {}) {
      Object.assign(this, properties);
    }
    matches() {
      return Boolean(this.disabled || this.disabledByFieldset);
    }
  }
  class HTMLInputElement extends HTMLElement {
    constructor(properties = {}) {
      super({ type: "text", ...properties });
    }
  }
  class HTMLTextAreaElement extends HTMLElement {}
  const listeners = new Map();
  let cleanup;
  const module = {};
  runInNewContext(compiled, {
    exports: module,
    HTMLElement,
    HTMLInputElement,
    HTMLTextAreaElement,
    document: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type, listener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      },
    },
    require: (name) => {
      assert.equal(name, "react");
      return { useEffect: (effect) => (cleanup = effect()) };
    },
  });
  module.ContentProtection();
  return {
    input: (properties) => new HTMLInputElement(properties),
    textarea: (properties) => new HTMLTextAreaElement(properties),
    editable: () => new HTMLElement({ isContentEditable: true }),
    body: new HTMLElement(),
    fire(type, target, properties = {}) {
      let prevented = false;
      let stopped = false;
      listeners.get(type)({
        type,
        target,
        ...properties,
        preventDefault() {
          prevented = true;
        },
        stopPropagation() {
          stopped = true;
        },
      });
      return { prevented, stopped };
    },
    cleanup: () => cleanup(),
    listeners,
  };
}

test("editable text fields preserve clipboard operations, shortcuts and context menus", () => {
  const ui = harness();
  for (const target of [
    ...["text", "search", "email", "url", "tel", "password", "number"].map((type) =>
      ui.input({ type }),
    ),
    ui.textarea(),
    ui.editable(),
  ]) {
    for (const type of ["copy", "cut", "paste", "contextmenu"]) {
      assert.equal(ui.fire(type, target).prevented, false);
    }
    for (const properties of [
      { key: "v", metaKey: true },
      { key: "C", ctrlKey: true },
      { key: "x", metaKey: true },
      { key: "Insert", shiftKey: true },
      { key: "Insert", ctrlKey: true },
    ]) {
      assert.deepEqual(ui.fire("keydown", target, properties), {
        prevented: false,
        stopped: false,
      });
    }
    assert.equal(ui.fire("dragstart", target).prevented, true);
  }
});

test("displayed, read-only, disabled and non-text controls retain content protection", () => {
  const ui = harness();
  for (const target of [
    ui.body,
    null,
    ui.input({ readOnly: true }),
    ui.input({ disabled: true }),
    ui.input({ disabledByFieldset: true }),
    ui.input({ type: "radio" }),
    ui.input({ type: "range" }),
    ui.textarea({ readOnly: true }),
    ui.textarea({ disabledByFieldset: true }),
  ]) {
    for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart"]) {
      assert.equal(ui.fire(type, target).prevented, true);
    }
    assert.deepEqual(ui.fire("keydown", target, { key: "c", metaKey: true }), {
      prevented: true,
      stopped: true,
    });
    assert.equal(ui.fire("keydown", target, { key: "a" }).prevented, false);
  }
});

test("unmount removes every clipboard and keyboard capture listener", () => {
  const ui = harness();
  assert.equal(ui.listeners.size, 6);
  ui.cleanup();
  assert.equal(ui.listeners.size, 0);
});
