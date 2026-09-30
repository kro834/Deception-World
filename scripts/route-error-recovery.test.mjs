import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsx from "react/jsx-runtime";

const source = readFileSync(new URL("../src/lib/error-component.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles-load-error.css", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function mount() {
  let reloads = 0;
  const exports = {};
  runInNewContext(code, {
    exports,
    window: { location: { reload: () => reloads++ } },
    require: (name) => {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "lucide-react") return { TriangleAlert: () => null };
      if (name === "@tanstack/react-router") return { Link: "a" };
      return { default: "/load-error.css" };
    },
  });
  return { component: exports.AppErrorComponent, reloads: () => reloads };
}

function find(element, type) {
  if (!element || typeof element !== "object") return null;
  if (element.type === type) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, type);
    if (found) return found;
  }
  return null;
}

test("failed routes provide Japanese recovery without displaying internal error details", () => {
  const { component } = mount();
  const html = renderToStaticMarkup(component({ error: new Error("private module URL") }));
  assert.match(html, /ページを読み込めませんでした/);
  assert.match(html, /ページを再読み込み/);
  assert.match(html, /href="\/world"/);
  assert.doesNotMatch(html, /private module URL|Something went wrong/);
  assert.match(html, /aria-labelledby="load-error-heading"/);
});

test("retry creates a fresh document instead of reusing a rejected module promise", () => {
  const ui = mount();
  const tree = ui.component();
  const button = find(tree, "button");
  assert.equal(button.props.type, "button");
  button.props.onClick();
  assert.equal(ui.reloads(), 1);
  assert.equal(find(tree, "a").props.href, "/world");
});

test("the recovery sheet is isolated, static and has visible 48px controls", () => {
  assert.match(source, /href=\{loadErrorCss\}/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /:focus-visible[\s\S]*?outline: 3px solid/);
  assert.doesNotMatch(css, /@keyframes|animation:|backdrop-filter:/);
});
