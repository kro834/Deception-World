import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { syncRexonanceRouteCover } from "../src/lib/rexonance-route-cover.js";

const loadGateSource = readFileSync(
  new URL("../src/components/load-gate.tsx", import.meta.url),
  "utf8",
);
const sagaSource = readFileSync(
  new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url),
  "utf8",
);

test("LoadGate wrapper preserves the true-valued global flag and synchronizes the page marker", () => {
  const attributes = new Map();
  const root = {
    hasAttribute: (name) => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  };
  const pageAttributes = new Set();
  const page = {
    ownerDocument: { documentElement: root },
    toggleAttribute(name, enabled) {
      if (enabled) pageAttributes.add(name);
      else pageAttributes.delete(name);
    },
  };
  const document = {
    documentElement: root,
    querySelector: (selector) => (selector === "main.rxs-page.rxs-rexonance-page" ? page : null),
  };
  const match = loadGateSource.match(
    /const setDocumentLoading = useCallback\(\(loading: boolean\) => \{([\s\S]*?)\n {2}\}, \[\]\);/,
  );
  assert.ok(match, "LoadGate's document-loading wrapper stays available to this regression pin");
  const decoration = { current: null };
  const setDocumentLoading = new Function(
    "document",
    "syncRexonanceRouteCover",
    "decoration",
    `return (loading) => {${match[1]}}`,
  )(document, syncRexonanceRouteCover, decoration);

  setDocumentLoading(true);
  assert.equal(root.hasAttribute("data-loading"), true);
  assert.equal(attributes.get("data-loading"), "true");
  assert.equal(pageAttributes.has("data-route-covered"), true);

  const pageRef = { current: null };
  const refMatch = sagaSource.match(
    /const setPageRef = useCallback\(\(page: HTMLElement \| null\) => \{([\s\S]*?)\n {2}\}, \[\]\);/,
  );
  assert.ok(refMatch, "Rexonance's callback ref synchronizes its local marker on commit");
  const setPageRef = new Function(
    "pageRef",
    "syncRexonanceRouteCover",
    `return (page) => {${refMatch[1]}}`,
  )(pageRef, syncRexonanceRouteCover);
  assert.doesNotThrow(() => setPageRef(null));
  assert.equal(pageRef.current, null);
  setPageRef(page);
  assert.equal(pageRef.current, page);
  assert.equal(pageAttributes.has("data-route-covered"), true);

  setDocumentLoading(false);
  assert.equal(root.hasAttribute("data-loading"), false);
  assert.equal(pageAttributes.has("data-route-covered"), false);

  // Once decoration is skipped, later decorative state updates cannot relock
  // the current document or mark the destination's suit as covered again.
  decoration.current = { skipped: true };
  setDocumentLoading(true);
  assert.equal(root.hasAttribute("data-loading"), false);
  assert.equal(pageAttributes.has("data-route-covered"), false);
  setDocumentLoading(false);
  assert.equal(root.hasAttribute("data-loading"), false);
});

test("Rexonance mirrors the global cover state locally at commit and transition sync points", () => {
  const attributes = new Set();
  const root = {
    hasAttribute: (name) => attributes.has(name),
  };
  const pageAttributes = new Set();
  const page = {
    ownerDocument: { documentElement: root },
    toggleAttribute(name, enabled) {
      if (enabled) pageAttributes.add(name);
      else pageAttributes.delete(name);
    },
  };

  syncRexonanceRouteCover(page);
  assert.equal(pageAttributes.has("data-route-covered"), false);
  assert.doesNotThrow(() => syncRexonanceRouteCover(null, root));
  attributes.add("data-loading");
  syncRexonanceRouteCover(page);
  assert.equal(pageAttributes.has("data-route-covered"), true);
  attributes.delete("data-loading");
  syncRexonanceRouteCover(page);
  assert.equal(pageAttributes.has("data-route-covered"), false);
});
