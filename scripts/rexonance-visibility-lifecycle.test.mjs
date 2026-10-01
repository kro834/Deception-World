import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url),
  "utf8",
);
const parsed = ts.createSourceFile("rexonance-saga.tsx", source, ts.ScriptTarget.Latest, true);
let visibilityEffect;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(parsed) === "useEffect" &&
    node.arguments[0]?.getText(parsed).includes("const updateVisibility =")
  ) {
    assert.equal(visibilityEffect, undefined, "the page has one visibility owner");
    visibilityEffect = node.arguments[0].getText(parsed);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.ok(visibilityEffect, "test the actual page visibility effect, not a duplicate helper");
const code = ts.transpileModule(`(${visibilityEffect})()`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ hidden = false, observerSupport = true } = {}) {
  const document = new EventTarget();
  document.hidden = hidden;
  const window = new EventTarget();
  const media = new EventTarget();
  media.matches = false;
  window.matchMedia = () => media;
  const states = [];
  const revealed = new Set();
  const reveal = { classList: { add: (name) => revealed.add(name) } };
  const page = { dataset: {}, querySelectorAll: () => [reveal] };
  const observers = [];
  class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = new Set();
      observers.push(this);
    }
    observe(node) {
      this.observed.add(node);
    }
    unobserve(node) {
      this.observed.delete(node);
    }
    disconnect() {
      this.observed.clear();
    }
  }
  if (observerSupport) window.IntersectionObserver = IntersectionObserver;
  const cleanup = runInNewContext(code, {
    document,
    window,
    navigator: {},
    pageRef: { current: page },
    setMotionReady: (value) => states.push(value),
    IntersectionObserver,
  });
  return {
    document,
    window,
    page,
    media,
    states,
    revealed,
    observer: observers[0],
    cleanup,
    visibility(value) {
      document.hidden = value;
      document.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

for (const hidden of [false, true]) {
  test(`Rexonance mount synchronizes ${hidden ? "background" : "foreground"} visibility immediately`, () => {
    const ui = mount({ hidden });
    assert.equal(ui.page.dataset.motionPaused, String(hidden));
    assert.deepEqual(ui.states, [true]);
    ui.visibility(!hidden);
    assert.equal(ui.page.dataset.motionPaused, String(!hidden));
    ui.visibility(hidden);
    assert.equal(ui.page.dataset.motionPaused, String(hidden));
    ui.cleanup();
  });
}

for (const order of ["pageshow-first", "visibility-first"]) {
  test(`a restored Rexonance page resumes for ${order} event ordering`, () => {
    const ui = mount();
    ui.window.dispatchEvent(new Event("pagehide"));
    ui.visibility(true);
    assert.equal(ui.page.dataset.motionPaused, "true");
    // BFCache preserves the mounted effect. The Page Visibility update is
    // responsible for resuming CSS, regardless of pageshow's relative order.
    if (order === "pageshow-first") ui.window.dispatchEvent(new Event("pageshow"));
    ui.visibility(false);
    if (order === "visibility-first") ui.window.dispatchEvent(new Event("pageshow"));
    assert.equal(ui.page.dataset.motionPaused, "false");
    ui.cleanup();
  });
}

test("visibility resumption works without IntersectionObserver", () => {
  const ui = mount({ hidden: true, observerSupport: false });
  assert.equal(ui.revealed.has("is-visible"), true);
  ui.visibility(false);
  assert.equal(ui.page.dataset.motionPaused, "false");
  ui.cleanup();
});

test("visibility resumption remains independent of a live reduced-motion preference", () => {
  const ui = mount({ hidden: true });
  ui.media.matches = true;
  ui.media.dispatchEvent(new Event("change"));
  ui.visibility(false);
  assert.equal(ui.states.at(-1), false);
  assert.equal(ui.page.dataset.motionPaused, "false");
  ui.media.matches = false;
  ui.media.dispatchEvent(new Event("change"));
  assert.equal(ui.states.at(-1), true);
  ui.cleanup();
});

test("unmount removes visibility and preference handlers and disconnects the observer", () => {
  const ui = mount();
  ui.cleanup();
  ui.visibility(true);
  ui.media.matches = true;
  ui.media.dispatchEvent(new Event("change"));
  assert.equal(ui.page.dataset.motionPaused, "false", "the disposed page is no longer mutated");
  assert.deepEqual(ui.states, [true]);
  assert.equal(ui.observer.observed.size, 0);
});
