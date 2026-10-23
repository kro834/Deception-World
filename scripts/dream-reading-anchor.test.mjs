import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/dream-chapter/dream-reading-room.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "room.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const capture = ast.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "captureReadingAnchor",
);
assert.ok(capture, "the reader captures a line only when its typography changes");
const code = ts.transpileModule(capture.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  let reads = 0;
  const text = { nodeType: 3, textContent: "文".repeat(100), length: 100 };
  const paragraphs = [
    { getBoundingClientRect: () => ({ bottom: 150 }) },
    {
      getBoundingClientRect: () => ({ bottom: 360 }),
      childNodes: [{ nodeType: 1, textContent: "02" }, text],
    },
  ];
  const scroller = {
    scrollTop: 300,
    scrollHeight: 2000,
    clientHeight: 600,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => paragraphs,
  };
  const document = {
    createRange() {
      let offset = 0;
      return {
        setStart(node, next) {
          assert.equal(node, text, "the decorative folio cannot become the text anchor");
          offset = next;
        },
        setEnd() {},
        getBoundingClientRect() {
          reads += 1;
          const top = 160 + Math.floor(offset / 10) * 20;
          return { top, bottom: top + 20 };
        },
      };
    },
  };
  const captureAnchor = runInNewContext(`${code}\ncaptureReadingAnchor`, {
    document,
    Node: { TEXT_NODE: 3 },
  });
  return { captureAnchor, scroller, text, paragraphs, reads: () => reads };
}

test("reader anchors the first character on the reading line, not an earlier paragraph or folio", () => {
  const f = fixture();
  const anchor = f.captureAnchor(f.scroller);
  assert.equal(anchor.text, f.text);
  assert.equal(anchor.offset, 10);
  assert.equal(anchor.top, 80);
  assert.ok(f.reads() <= 9, "binary search avoids reading every character's layout");
});

test("reader start and absent viewports need no layout measurement", () => {
  const f = fixture();
  assert.equal(f.captureAnchor(null), null);
  f.scroller.scrollTop = 0;
  assert.equal(f.captureAnchor(f.scroller), null);
  assert.equal(f.reads(), 0);
});

test("reader captures the end explicitly so shorter and taller type both remain at the foot", () => {
  const f = fixture();
  f.scroller.scrollTop = 1399;
  const anchor = f.captureAnchor(f.scroller);
  assert.equal(anchor.end, true);
  assert.equal(f.reads(), 0);
});

test("reader tolerates an empty or non-text paragraph without making an invalid range", () => {
  const f = fixture();
  f.paragraphs[1].childNodes = [{ nodeType: 1, textContent: "02" }];
  assert.equal(f.captureAnchor(f.scroller), null);
  assert.equal(f.reads(), 0);
});

test("reader typography reflows synchronously despite global reduced-motion transitions", () => {
  const css = readFileSync(
    new URL("../src/components/dream-chapter/dream-reading-room.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.dream-reading-paper > \[data-room-paragraph\]\s*\{[^}]*transition: none !important;/,
  );
  assert.match(css, /\.dream-reading-scroll\s*\{[^}]*overflow-anchor: none;/);
});
