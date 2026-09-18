import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const exports = {};
const source = readFileSync(
  new URL("../src/components/world/dossier-reader.tsx", import.meta.url),
  "utf8",
);
runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  { exports, require: createRequire(import.meta.url) },
);

test("contents render Japanese titles and original metadata with native chapter anchors", () => {
  const markup = renderToStaticMarkup(
    React.createElement(exports.DossierContents, {
      sections: [{ no: "01", title: "人物の記録。", kicker: "CHARACTER / PROFILE" }],
    }),
  );
  assert.match(markup, /href="#character-section-01"/);
  assert.match(markup, /人物の記録。/);
  assert.match(markup, /CHARACTER \/ PROFILE/);
});

test("reader never advertises optional sections that are absent", () => {
  const basic = renderToStaticMarkup(
    React.createElement(exports.DossierReader, { name: "ゼウス" }),
  );
  assert.match(basic, /href="#dossier-profile"/);
  assert.match(basic, /href="#dossier-index"/);
  assert.doesNotMatch(basic, /href="#(?:form-records|identity-records)"/);
  const full = renderToStaticMarkup(
    React.createElement(exports.DossierReader, { name: "シエル", identity: true, forms: true }),
  );
  assert.match(full, /href="#form-records"/);
  assert.match(full, /href="#identity-records"/);
});

test("names are escaped as text, not rendered as markup", () => {
  const markup = renderToStaticMarkup(
    React.createElement(exports.DossierReader, { name: "<script>alert(1)</script>" }),
  );
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});

test("the bespoke Lejas dossier offers the same reading anchors as other managers", () => {
  const lejas = readFileSync(
    new URL("../src/components/world/lejas-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(lejas, /<DossierReader name="レジャス" forms\s*\/>/);
  for (const id of ["dossier-profile", "dossier-index", "form-records"]) {
    assert.equal(lejas.split(`id="${id}"`).length - 1, 1, `unique target: ${id}`);
  }
  assert.match(lejas, /className="dossier-read-link" href="#dossier-index"/);
  assert.match(lejas, /<DossierContents/);
  assert.match(lejas, /<header className="dossier-identity">[\s\S]*?<h1>/);
  assert.doesNotMatch(lejas, /className="manager-section-nav"/);
});

function mountReaderPosition() {
  const module = {};
  const selections = [];
  const observers = [];
  const listeners = new Map();
  const frames = new Map();
  const root = { scrollPaddingTop: "0px" };
  const sections = ["dossier-profile", "dossier-index", "form-records"].map((id, index) => ({
    id,
    top: index * 1000,
    scrollMarginTop: "160px",
    getBoundingClientRect() {
      return { top: this.top };
    },
  }));
  let cleanup;
  let frameId = 0;
  const window = {
    innerHeight: 768,
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports: module,
      require: (name) =>
        name === "react"
          ? {
              useState: () => ["dossier-profile", (id) => selections.push(id)],
              useEffect: (effect) => {
                cleanup = effect();
              },
            }
          : createRequire(import.meta.url)(name),
      document: {
        documentElement: root,
        getElementById: (id) => sections.find((section) => section.id === id) ?? null,
      },
      window,
      getComputedStyle: (element) => element,
      IntersectionObserver: class {
        constructor(callback, options) {
          this.callback = callback;
          this.options = options;
          this.targets = [];
          observers.push(this);
        }
        observe(element) {
          this.targets.push(element);
        }
        disconnect() {
          this.disconnected = true;
        }
      },
    },
  );
  module.DossierReader({ name: "テスト", forms: true });
  assert.equal(observers.length, 0, "waits for parent route effects before reading CSS");
  root.scrollPaddingTop = "96px"; // The parent useWorldMode effect has now run.
  const [[initialFrame, initialize]] = frames;
  frames.delete(initialFrame);
  initialize();
  return { sections, selections, observers, listeners, frames, window, cleanup: () => cleanup() };
}

test("reader position uses native header offsets rather than a viewport percentage", () => {
  const reader = mountReaderPosition();
  assert.equal(reader.observers[0].options.rootMargin, "-258px 0px -509px 0px");
  assert.equal(reader.selections.at(-1), "dossier-profile");
  reader.sections[0].top = -1000;
  reader.sections[1].top = 256;
  reader.observers[0].callback([]);
  assert.equal(reader.selections.at(-1), "dossier-index");
  reader.sections[1].top = -1000;
  reader.sections[2].top = 258.7; // First intersects the 258..259px band mid-scroll.
  reader.observers[0].callback([]);
  assert.equal(reader.selections.at(-1), "form-records");
  reader.cleanup();
});

test("reader resolves all sections in document order even with partial observer updates", () => {
  const reader = mountReaderPosition();
  reader.sections[0].top = -2000;
  reader.sections[1].top = -800;
  reader.sections[2].top = 259.7; // Fresh geometry may differ from the observer's entry.
  reader.observers[0].callback([{ target: reader.sections[2], isIntersecting: true }]);
  reader.observers[0].callback([{ target: reader.sections[1], isIntersecting: true }]);
  assert.equal(reader.selections.at(-1), "form-records");
  reader.sections[2].top = 300; // scrolling back into the gap above the form
  reader.observers[0].callback([{ target: reader.sections[2], isIntersecting: false }]);
  assert.equal(reader.selections.at(-1), "dossier-index");
  reader.cleanup();
});

test("reader remeasures on rotation and disposes pending work on unmount", () => {
  const reader = mountReaderPosition();
  reader.window.innerHeight = 844;
  reader.sections.forEach((section) => {
    section.scrollMarginTop = "148px";
  });
  reader.listeners.get("resize")();
  reader.listeners.get("resize")();
  assert.equal(reader.frames.size, 1, "coalesces resize events");
  const [[id, callback]] = reader.frames;
  reader.frames.delete(id);
  callback();
  assert.equal(reader.observers[0].disconnected, true);
  assert.equal(reader.observers[1].options.rootMargin, "-246px 0px -597px 0px");
  reader.listeners.get("resize")();
  reader.cleanup();
  assert.equal(reader.observers[1].disconnected, true);
  assert.equal(reader.listeners.size, 0);
  assert.equal(reader.frames.size, 0);
});
