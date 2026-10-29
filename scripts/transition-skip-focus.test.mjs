import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createTransitionDecorationClock } from "../src/lib/transition-decoration-clock.ts";

const source = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile(
  "load-gate.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let skip, pendingFocus;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "skipDecoration")
    skip = node.initializer.arguments[0];
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(tree) === "useLayoutEffect" &&
    node.arguments[0]?.getText(tree).includes("pendingStatusRef.current?.focus")
  )
    pendingFocus = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(skip && pendingFocus);
const code = ts.transpileModule(
  `globalThis.skip = ${skip.getText(tree)}; globalThis.focusPending = ${pendingFocus.getText(tree)};`,
  {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
function fixture({ focusedSkip = false, ready = false } = {}) {
  const focused = [];
  const clock = createTransitionDecorationClock({ setTimeout, clearTimeout });
  const context = {
    decoration: { current: clock },
    document: {
      activeElement: { closest: () => (focusedSkip ? {} : null) },
      documentElement: { removeAttribute() {} },
    },
    skipFocusRequested: { current: false },
    skipDestinationReady: { current: ready },
    skipDestinationHash: { current: "record" },
    farFromSkip: { current: null },
    rexonanceCoverCancel: { current: null },
    setDecorationSkipped: (value) => {
      context.decorationSkipped = value;
    },
    setDocumentLoading() {},
    focusRouteDestination: (hash) => focused.push(["destination", hash]),
    pendingStatusRef: {
      current: { focus: (options) => focused.push(["pending", options.preventScroll]) },
    },
    decorationSkipped: false,
    destinationPending: !ready,
  };
  vm.runInNewContext(code, context);
  return { context, clock, focused };
}

test("a focused disappearing skip moves to pending status without scrolling", () => {
  const { context, clock, focused } = fixture({ focusedSkip: true });
  context.skip();
  context.focusPending();
  assert.equal(clock.skipped, true);
  assert.deepEqual(focused, [["pending", true]]);
});

test("a focused skip during reveal focuses the ready destination, preserving its hash", () => {
  const { context, focused } = fixture({ focusedSkip: true, ready: true });
  context.skip();
  context.focusPending();
  assert.deepEqual(focused, [["destination", "record"]]);
});

for (const ready of [false, true]) {
  test(`Escape from a surviving page control preserves its focus when ready=${ready}`, () => {
    const { context, focused } = fixture({ ready });
    context.skip();
    context.focusPending();
    assert.deepEqual(focused, []);
    assert.equal(context.skipFocusRequested.current, false);
  });
}
