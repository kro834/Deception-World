import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(new URL("../src/components/world/other-artwork-card.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function mountDialog() {
  const module = {};
  runInNewContext(compiled, {
    exports: module,
    document: { body: {} },
    require: (name) => {
      if (name === "react") {
        return {
          useRef: (current) => ({ current }),
          useState: () => [true, () => {}],
          useEffect() {},
        };
      }
      if (name === "react-dom") return { createPortal: (element) => element };
      if (name === "react/jsx-runtime") {
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      }
      if (name === "./ui-vector-icon") return { UiVectorIcon: () => null };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const element = module.OtherArtworkCard({ artwork: module.OTHER_ARTWORK[0] });
  const dialog = element.props.children[1];
  let closed = 0;
  const node = { close: () => closed++ };
  dialog.props.ref.current = node;
  const event = (x, y, target = node, extra = {}) => ({
    target,
    currentTarget: node,
    isPrimary: true,
    button: 0,
    pointerId: 7,
    clientX: x,
    clientY: y,
    ...extra,
  });
  return {
    press: (x, y, target, extra) => dialog.props.onPointerDownCapture(event(x, y, target, extra)),
    move: (x, y) => dialog.props.onPointerMoveCapture(event(x, y)),
    click: (x, y, target) => dialog.props.onClick(event(x, y, target)),
    cancel: () => dialog.props.onPointerCancelCapture(),
    closed: () => closed,
  };
}

test("a deliberate backdrop tap closes once and consumes its press", () => {
  const ui = mountDialog();
  ui.press(4, 100);
  ui.click(5, 101);
  ui.click(5, 101);
  assert.equal(ui.closed(), 1);
});

test("dragging from artwork into the gutter cannot close the viewer", () => {
  const ui = mountDialog();
  ui.press(640, 250, {});
  ui.move(4, 250);
  ui.click(4, 250);
  assert.equal(ui.closed(), 0);
});

test("a backdrop drag remains a drag even when released at its starting point", () => {
  const ui = mountDialog();
  ui.press(4, 100);
  ui.move(4, 200);
  ui.move(4, 100);
  ui.click(4, 100);
  assert.equal(ui.closed(), 0);
});

test("a cancelled or non-primary press never dismisses the dialog", () => {
  const ui = mountDialog();
  ui.press(4, 100);
  ui.cancel();
  ui.click(4, 100);
  ui.press(4, 100, undefined, { isPrimary: false });
  ui.click(4, 100);
  assert.equal(ui.closed(), 0);
  ui.press(4, 100);
  ui.click(4, 100);
  assert.equal(ui.closed(), 1, "a later deliberate tap still closes");
});
