import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRealmArchiveMotion } from "./build-realm-archive-motion.mjs";

const master = readFileSync(
  new URL("../archives/saga-form-archive-standalone.html", import.meta.url),
  "utf8",
);
const listenerSource = master.slice(
  master.indexOf("  let lightboxBackdropPress = null;"),
  master.indexOf("  root.querySelectorAll('.table-responsive')"),
);

function harness() {
  const listeners = new Map();
  let closes = 0;
  const lightbox = { addEventListener: (name, listener) => listeners.set(name, listener) };
  vm.runInNewContext(listenerSource, {
    lightbox,
    closeLightbox: () => {
      closes += 1;
    },
  });
  return {
    fire(type, properties = {}) {
      listeners.get(type)({
        target: lightbox,
        isPrimary: true,
        button: 0,
        pointerId: 1,
        clientX: 4,
        clientY: 100,
        ...properties,
      });
    },
    closes: () => closes,
  };
}

test("Realm receives the same backdrop pointer guard as Saga", () => {
  assert.ok(createRealmArchiveMotion(master).includes(listenerSource));
});

test("only a stationary primary backdrop press dismisses the archive lightbox", () => {
  const ui = harness();
  ui.fire("pointerdown");
  ui.fire("click", { clientX: 8 });
  assert.equal(ui.closes(), 1);
  ui.fire("click");
  assert.equal(ui.closes(), 1, "a second click cannot reuse the previous press");
});

test("artwork drags, returning gutter drags, canceled and secondary pointers stay open", () => {
  const ui = harness();
  ui.fire("pointerdown", { target: {}, clientX: 120 });
  ui.fire("click");
  ui.fire("pointerdown");
  ui.fire("pointermove", { clientY: 200 });
  ui.fire("pointermove");
  ui.fire("click");
  ui.fire("pointerdown");
  ui.fire("pointercancel");
  ui.fire("click");
  ui.fire("pointerdown", { isPrimary: false });
  ui.fire("click");
  assert.equal(ui.closes(), 0);
});
