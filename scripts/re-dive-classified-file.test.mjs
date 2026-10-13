import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RE_DIVE_CLASSIFIED_REPORT as report } from "../src/components/world/re-dive-classified-report.ts";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("the owner's complete classified report is stored verbatim, without identifying the subject", () => {
  // Owner (2026-10-14): preserve this submitted draft exactly; update only for an authorized text revision.
  assert.equal(
    createHash("sha256").update(report.text).digest("hex"),
    "cf8b32a1c99a2e8d50d9718a849f7f1f934d2a1eef3085864598c0655c361ffa",
  );
  assert.equal(report.text.length, 4360);
  assert.equal(report.text.split("\n\n").length, 108);
  assert.equal(report.author, "フェイブル");
  assert.ok(report.text.startsWith("DECEPTION WORLD\n\n" + report.title));
  assert.ok(report.text.endsWith("現時点で、本人へ伝えるべき情報ではない。\n\n───フェイブル"));
  assert.doesNotMatch(report.text, /月城悠真|シエル|対象個体：/);
});

test("classified body is activated only on opening and rendered as plain text", async () => {
  const section = await read("src/components/world/re-dive-section.tsx");
  const viewer = await read("src/components/world/re-dive-file-dialog.tsx");
  assert.match(section, /\{fileOpen \? \(?\s*<ReDiveFileDialog/);
  assert.match(viewer, /text\.split\("\\n\\n"\)/);
  assert.match(viewer, /\{paragraph\}/);
  assert.doesNotMatch(viewer, /dangerouslySetInnerHTML|setInterval|requestAnimationFrame/);
  assert.match(viewer, /aria-labelledby="rd-file-title"/);
  assert.match(viewer, /aria-describedby="rd-file-caption"/);
  assert.match(viewer, /className="rd-file-reader"[\s\S]*?tabIndex=\{0\}/);
});

test("native file modal synchronously locks scrolling and releases it on close and unmount", async () => {
  const viewer = await read("src/components/world/re-dive-file-dialog.tsx");
  assert.match(
    viewer,
    /useLayoutEffect\(\(\) => \{[\s\S]*?dialog\.showModal\(\);\s*releaseRef\.current = acquireViewportScrollLock\(\{ freezeBody: true \}\)/,
  );
  assert.match(viewer, /closeRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(
    viewer,
    /return \(\) => \{\s*dismissedRef\.current = true;\s*dialog\.close\(\);\s*releaseRef\.current\?\.\(\);/,
  );
  assert.match(viewer, /if \(dismissedRef\.current\) return;/);
  assert.match(viewer, /useDialogHistoryDismiss\(dialogRef, dismissForNavigation\)/);
  assert.match(viewer, /addEventListener\("pagehide", dismissForNavigation\)/);
  assert.match(viewer, /removeEventListener\("pagehide", dismissForNavigation\)/);
  assert.match(viewer, /dismissForNavigation = useCallback\(\(\) => dismiss\(false\)/);
  assert.match(viewer, /viewportRef\.current\.width !== window\.innerWidth/);
  assert.match(viewer, /opener\.closest<HTMLElement>\("\.re-dive-section"\)\?\.scrollIntoView/);
  assert.match(viewer, /opener\.focus\(\{ preventScroll: true \}\)/);
});

test("file controls support Escape and cyclic keyboard focus without touch-through", async () => {
  const viewer = await read("src/components/world/re-dive-file-dialog.tsx");
  assert.match(viewer, /onCancel=\{\(event\) => \{\s*event\.preventDefault\(\);\s*dismiss\(\);/);
  assert.match(viewer, /event\.shiftKey && event\.target === closeRef\.current/);
  assert.match(viewer, /!event\.shiftKey && event\.target === returnRef\.current/);
  assert.equal((viewer.match(/if \(event\.detail > 0\) guardTapThrough\(\);/g) ?? []).length, 2);
});

test("classified file styling preserves line breaks, legible text and forced-colour controls", async () => {
  const css = await read("src/styles-world-re-dive.css");
  assert.match(css, /\.rd-file-reader > :is\(p, h3\) \{[^}]*white-space: pre-wrap;/);
  assert.match(
    css,
    /\.rd-file-reader \{[^}]*overflow: auto;[^}]*overscroll-behavior: contain;[^}]*font-size: 16px;/,
  );
  assert.match(css, /\.rd-file-close \{[^}]*min-height: 44px;/);
  assert.match(css, /#re-dive-file-dialog \.zeus-button \{\s*display: none;/);
  assert.match(
    css,
    /\.rd-file-dialog\[open\] \{[^}]*grid-template-rows: auto minmax\(0, 1fr\) auto;/,
  );
  assert.match(
    css,
    /@media \(forced-colors: active\) \{[\s\S]*\.rd-file-close \{\s*border-color: ButtonText;/,
  );
  assert.match(css, /\.rd-file-reader:focus-visible \{\s*outline-color: Highlight;/);
});
