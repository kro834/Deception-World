import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/tap-through-guard.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function mount() {
  const handlers = new Map();
  let now = 0;
  let expire;
  class Element {
    constructor(armed = false) {
      this.armed = armed;
    }
    closest(selector) {
      assert.equal(
        selector,
        'button.ciel-button:is([data-secret-armed="true"], [data-navigating="true"]), dialog.ciel-inferno[open] button.ciel-inferno-close',
      );
      return [true, "busy", "close"].includes(this.armed) ? this : null;
    }
  }
  class MouseEvent {
    constructor(type, detail, trusted = true) {
      Object.assign(this, { type, detail, isTrusted: trusted, prevented: false, stopped: false });
    }
    preventDefault() {
      this.prevented = true;
    }
    stopPropagation() {
      this.stopped = true;
    }
  }
  const exports = {};
  runInNewContext(code, {
    exports,
    MouseEvent,
    Element,
    performance: { now: () => now },
    window: {
      addEventListener: (type, handler) => handlers.set(type, handler),
      removeEventListener: (type) => handlers.delete(type),
      setTimeout: (handler) => {
        expire = handler;
      },
    },
  });
  exports.guardTapThrough();
  return {
    handlers,
    MouseEvent,
    Element,
    expire: () => expire(),
    advance: () => {
      now = 451;
    },
  };
}

test("keyboard/assistive activation is allowed during a touch-through guard", () => {
  const ui = mount();
  const event = new ui.MouseEvent("click", 0);
  ui.handlers.get("click")(event);
  assert.equal(event.prevented, false);
  assert.equal(event.stopped, false);
});

test("trusted pointer compatibility input is still swallowed", () => {
  const ui = mount();
  for (const type of ["pointerdown", "mousedown", "click"]) {
    const event = new ui.MouseEvent(type, 1);
    ui.handlers.get(type)(event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
  }
});

test("only the armed or busy Ciel control can receive a deliberate rapid burst through the guard", () => {
  const ui = mount();
  for (const armed of [false, true, "busy"]) {
    for (const type of ["pointerdown", "mousedown", "click"]) {
      const event = new ui.MouseEvent(type, 1);
      event.target = new ui.Element(armed);
      ui.handlers.get(type)(event);
      assert.equal(event.prevented, !armed);
      assert.equal(event.stopped, !armed);
    }
  }
});

test("the busy Ciel hit area cannot lapse when the short burst timer expires before navigation", () => {
  const css = readFileSync(new URL("../src/styles-chrome-elevation.css", import.meta.url), "utf8");
  assert.match(
    css,
    /\.ciel-button\[data-navigating="true"\] \.zeus-button-secret-hit\s*\{\s*pointer-events: auto;/,
  );
  assert.doesNotMatch(
    css,
    /\.ciel-button\[data-secret-armed="true"\]\[data-navigating="true"\] \.zeus-button-secret-hit/,
  );
});

test("only the flame-stop control is exempt; obsolete return controls and the page remain guarded", () => {
  const ui = mount();
  for (const kind of ["close", "return", "backdrop", "underlying-link"]) {
    const event = new ui.MouseEvent("click", 1);
    event.target = new ui.Element(kind);
    ui.handlers.get("click")(event);
    assert.equal(event.prevented, kind !== "close");
    assert.equal(event.stopped, event.prevented);
  }
});

test("synthetic input, expired guards and their listeners remain safe", () => {
  const ui = mount();
  const synthetic = new ui.MouseEvent("click", 1, false);
  ui.handlers.get("click")(synthetic);
  assert.equal(synthetic.prevented, false);
  ui.advance();
  const expired = new ui.MouseEvent("click", 1);
  ui.handlers.get("click")(expired);
  assert.equal(expired.prevented, false);
  ui.expire();
  assert.equal(ui.handlers.size, 0);
});
