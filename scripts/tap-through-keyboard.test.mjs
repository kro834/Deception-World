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
