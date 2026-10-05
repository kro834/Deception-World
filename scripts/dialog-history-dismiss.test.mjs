import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/components/world/use-dialog-history-dismiss.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;

function mount(open = true) {
  const effects = [],
    subscribers = new Set(),
    refs = [];
  const events = [];
  let index = 0;
  class Element {
    blur() {
      events.push("blur");
    }
  }
  const router = {
    history: {
      subscribe(callback) {
        subscribers.add(callback);
        return () => subscribers.delete(callback);
      },
    },
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    HTMLElement: Element,
    document: { activeElement: new Element() },
    require(name) {
      if (name === "react")
        return {
          useRef: (current) => (refs[index++] ??= { current }),
          useEffect: (callback) => effects.push(callback),
        };
      if (name === "@tanstack/react-router") return { useRouter: () => router };
      throw new Error(name);
    },
  });
  const dialog = { current: { open } };
  const render = (dismiss) => {
    index = 0;
    effects.length = 0;
    exports.useDialogHistoryDismiss(dialog, dismiss);
  };
  render(() => {
    events.push("dismiss");
    dialog.current.open = false;
  });
  const cleanups = effects.map((effect) => effect()).filter(Boolean);
  return {
    events,
    subscribers,
    dialog,
    history: (type) => subscribers.forEach((callback) => callback({ action: { type } })),
    update: () => {
      render(() => {
        events.push("latest dismiss");
        dialog.current.open = false;
      });
      effects[0](); // React reruns the callback-ref effect, not stable subscriptions.
    },
    unmount: () => cleanups.forEach((cleanup) => cleanup()),
  };
}

for (const action of ["BACK", "FORWARD", "GO"]) {
  test(`${action} dismisses the open viewer before clearing departure focus`, () => {
    const ui = mount();
    ui.history(action);
    assert.deepEqual(ui.events, ["dismiss", "blur"]);
    ui.history(action);
    assert.equal(ui.events.length, 2, "closed records do not dismiss twice");
    ui.unmount();
    assert.equal(ui.subscribers.size, 0);
  });
}

test("ordinary pushes, replacements and closed records retain their current focus", () => {
  const ui = mount();
  ui.history("PUSH");
  ui.history("REPLACE");
  assert.deepEqual(ui.events, []);
  ui.dialog.current.open = false;
  ui.history("BACK");
  assert.deepEqual(ui.events, []);
  ui.dialog.current = null;
  ui.history("FORWARD");
  assert.deepEqual(ui.events, []);
  ui.unmount();
});

test("history uses the latest viewer cleanup and releases its subscriber on unmount", () => {
  const ui = mount();
  ui.update();
  ui.history("BACK");
  assert.deepEqual(ui.events, ["latest dismiss", "blur"]);
  ui.unmount();
  ui.dialog.current.open = true;
  ui.history("BACK");
  assert.equal(ui.events.length, 2);
});
