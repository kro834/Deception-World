import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/world/world-chrome.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function mount({ open = true, announcementOpen = false } = {}) {
  const effects = [],
    subscribers = new Set(),
    changes = [],
    stateChanges = [];
  let stateIndex = 0;
  const win = new EventTarget();
  win.sessionStorage = { getItem: () => null };
  win.requestAnimationFrame = () => 1;
  win.cancelAnimationFrame = () => {};
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
    window: win,
    require(name) {
      if (name === "react")
        return {
          useRef: (current) => ({ current }),
          useEffect: (callback) => effects.push(callback),
          useLayoutEffect: (callback) => effects.push(callback),
          useState: (initial) => {
            const index = stateIndex++;
            return [
              index === 0 ? announcementOpen : initial,
              (value) => stateChanges.push({ index, value }),
            ];
          },
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@tanstack/react-router")
        return {
          useRouter: () => router,
          useRouterState: () => "/world",
        };
      if (name === "./dossier-nav") return { RIDER_NAV: [] };
      return {};
    },
  });
  exports.SideMenuLayer({ open, onOpenChange: (value) => changes.push(value) });
  const cleanups = effects.map((callback) => callback()).filter(Boolean);
  return {
    history: (type) => subscribers.forEach((callback) => callback({ action: { type } })),
    changes,
    stateChanges,
    subscribers,
    unmount: () => cleanups.forEach((callback) => callback()),
  };
}

for (const action of ["BACK", "FORWARD", "GO"]) {
  test(`${action} closes an open menu even when hash history keeps the page mounted`, () => {
    const ui = mount();
    ui.history(action);
    assert.deepEqual(ui.changes, [false]);
    assert.ok(ui.stateChanges.some(({ index, value }) => index === 0 && value === false));
    assert.ok(ui.stateChanges.some(({ index, value }) => index === 1 && value === null));
    ui.unmount();
    assert.equal(ui.subscribers.size, 0);
  });
}

test("history also dismisses a nested announcement instead of retaining a modal on the restored page", () => {
  const ui = mount({ open: false, announcementOpen: true });
  ui.history("BACK");
  assert.ok(ui.stateChanges.some(({ index, value }) => index === 0 && value === false));
  ui.unmount();
});

test("ordinary pushed/replaced entries do not close the menu before its own link handler", () => {
  const ui = mount();
  ui.history("PUSH");
  ui.history("REPLACE");
  assert.deepEqual(ui.changes, []);
  ui.unmount();
});

test("closed transient UI leaves no history subscriber behind", () => {
  const ui = mount({ open: false });
  assert.equal(ui.subscribers.size, 0);
  ui.unmount();
});
