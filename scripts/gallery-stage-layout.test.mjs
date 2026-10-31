import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const page = readFileSync(
  new URL("../src/components/gallery/gallery-page.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../src/styles-gallery-artwork-stage.css", import.meta.url),
  "utf8",
);
const file = ts.createSourceFile(
  "gallery.tsx",
  page,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const elements = [];
const visit = (node) => {
  if (ts.isJsxElement(node)) elements.push(node);
  ts.forEachChild(node, visit);
};
visit(file);
const attrs = (node) => node.openingElement.attributes.getText(file);

test("title and save feedback reserve separate scrollable slots even when their text is absent", () => {
  const caption = elements.find(
    (node) =>
      node.openingElement.tagName.getText(file) === "figcaption" &&
      /表示中の作品番号とタイトル/.test(attrs(node)),
  );
  const feedback = elements.find((node) => /className="gallery-stage-feedback"/.test(attrs(node)));
  assert.ok(caption);
  assert.ok(feedback);
  assert.ok(
    ts.isJsxElement(feedback.parent),
    "feedback wrapper is unconditional JSX, not a conditional branch",
  );
  for (const slot of [caption, feedback]) assert.match(attrs(slot), /tabIndex=\{0\}/);
  assert.match(
    caption.getText(file),
    /<span>\{titles\[featured.id\]\}<\/span>/,
    "the complete title stays available",
  );
  assert.match(feedback.getText(file), /featureMessage &&/);
  assert.match(feedback.getText(file), /featureError &&/);
  assert.match(feedback.getText(file), /role="status"/);
  assert.match(feedback.getText(file), /role="alert"/);
  for (const [selector, height] of [
    [".gallery-feature figcaption", 84],
    [".gallery-stage-feedback", 54],
  ]) {
    const rule = css.match(
      new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]+)\\}"),
    )?.[1];
    assert.ok(rule, selector);
    for (const prop of ["height", "min-height", "max-height"])
      assert.match(rule, new RegExp(`(?:^|[;\\s])${prop}: ${height}px;`));
    assert.match(rule, /box-sizing: border-box/);
    assert.match(rule, /overflow: auto/);
  }
  assert.doesNotMatch(
    css,
    /artwork-stage__information\s*\{[^}]*height:/,
    "whole information column does not add a nested scroll viewport",
  );
});
