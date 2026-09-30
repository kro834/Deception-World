import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../public/archive-scroll-stability.js", import.meta.url),
  "utf8",
);
const clipboardSetup = source.slice(0, source.indexOf("  const rootSelector")) + "})();";

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
      super({ type: "search", ...properties });
    }
  }
  class HTMLTextAreaElement extends HTMLElement {}
  const listeners = new Map();
  vm.runInNewContext(clipboardSetup, {
    HTMLElement,
    HTMLInputElement,
    HTMLTextAreaElement,
    document: {
      documentElement: { dataset: { embeddedArchive: "true" } },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
    },
  });
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
  };
}

test("archive inputs preserve clipboard editing and text context menus", () => {
  const ui = harness();
  for (const target of [ui.input(), ui.textarea(), ui.editable()]) {
    for (const type of ["copy", "cut", "paste", "contextmenu"]) {
      assert.equal(ui.fire(type, target).prevented, false, `${type} edits the user's input`);
    }
    for (const properties of [
      { key: "v", metaKey: true },
      { key: "c", ctrlKey: true },
      { key: "x", metaKey: true },
      { key: "Insert", shiftKey: true },
    ]) {
      assert.deepEqual(ui.fire("keydown", target, properties), {
        prevented: false,
        stopped: false,
      });
    }
  }
});

test("displayed archive content remains protected outside editable fields", () => {
  const ui = harness();
  for (const target of [
    ui.body,
    ui.input({ readOnly: true }),
    ui.input({ disabled: true }),
    ui.input({ disabledByFieldset: true }),
    ui.input({ type: "radio" }),
    ui.textarea({ disabledByFieldset: true }),
  ]) {
    for (const type of ["copy", "cut", "paste", "contextmenu", "dragstart"]) {
      assert.equal(ui.fire(type, target).prevented, true);
    }
    assert.deepEqual(ui.fire("keydown", target, { key: "c", metaKey: true }), {
      prevented: true,
      stopped: true,
    });
  }
});
