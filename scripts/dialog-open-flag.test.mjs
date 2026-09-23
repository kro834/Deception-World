import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { watchOpenDialogs } from "../src/lib/dialog-open-flag.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// A document with just enough DOM for the flag: dialogs that can be opened,
// an <html> attribute set, and a MutationObserver the test delivers to.
function fakeDocument() {
  const attributes = new Set();
  const dialogs = new Set();
  const observers = [];
  let queries = 0;
  const element = (nodeName, children = []) => ({
    nodeType: 1,
    nodeName,
    querySelector: (selector) =>
      selector === "dialog"
        ? (children.find((child) => child.nodeName === "DIALOG") ?? null)
        : null,
  });
  const doc = {
    documentElement: {
      hasAttribute: (name) => attributes.has(name),
      toggleAttribute: (name, force) => (force ? attributes.add(name) : attributes.delete(name)),
      removeAttribute: (name) => attributes.delete(name),
    },
    body: { nodeType: 1, nodeName: "BODY" },
    querySelector(selector) {
      assert.equal(selector, "dialog[open]");
      queries += 1;
      return [...dialogs].find((dialog) => dialog.open) ?? null;
    },
  };
  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
      this.connected = true;
    }
    disconnect() {
      this.connected = false;
    }
  };
  const deliver = (...records) => {
    for (const observer of observers) if (observer.connected) observer.callback(records);
  };
  return {
    doc,
    deliver,
    observers,
    open: () => attributes.has("data-dialog-open"),
    queries: () => queries,
    dialog(open = false) {
      const dialog = { ...element("DIALOG"), open };
      dialogs.add(dialog);
      return dialog;
    },
    remove: (dialog) => dialogs.delete(dialog),
    element,
  };
}

test("the flag follows showModal, close, insertion and removal", () => {
  const page = fakeDocument();
  const dispose = watchOpenDialogs(page.doc);
  const [observer] = page.observers;
  assert.equal(observer.target, page.doc.body);
  assert.deepEqual(observer.options, {
    attributes: true,
    attributeFilter: ["open"],
    childList: true,
    subtree: true,
  });
  assert.equal(page.open(), false);

  const dialog = page.dialog();
  dialog.open = true; // showModal()
  page.deliver({ type: "attributes", attributeName: "open", addedNodes: [], removedNodes: [] });
  assert.equal(page.open(), true);
  dialog.open = false; // close()
  page.deliver({ type: "attributes", attributeName: "open", addedNodes: [], removedNodes: [] });
  assert.equal(page.open(), false);

  // React mounts a subtree holding an open dialog, then unmounts it.
  const mounted = page.dialog(true);
  const wrapper = page.element("DIV", [mounted]);
  page.deliver({ type: "childList", addedNodes: [wrapper], removedNodes: [] });
  assert.equal(page.open(), true);
  page.remove(mounted);
  page.deliver({ type: "childList", addedNodes: [], removedNodes: [wrapper] });
  assert.equal(page.open(), false);

  dispose();
  assert.equal(observer.connected, false);
});

test("an already open dialog is flagged at install, and unrelated DOM churn is ignored", () => {
  const page = fakeDocument();
  page.dialog(true);
  const dispose = watchOpenDialogs(page.doc);
  assert.equal(page.open(), true);
  const before = page.queries();
  // A poster tick, a React commit and a lazy <link>: no dialog in them.
  page.deliver(
    { type: "childList", addedNodes: [page.element("IMG")], removedNodes: [] },
    { type: "childList", addedNodes: [{ nodeType: 3, nodeName: "#text" }], removedNodes: [] },
    { type: "childList", addedNodes: [page.element("LINK")], removedNodes: [page.element("DIV")] },
  );
  assert.equal(page.queries(), before);
  assert.equal(page.open(), true);
  dispose();
  assert.equal(page.open(), false);
});

test("the flag is set in the observer's microtask, never deferred to a frame", () => {
  const source = read("src/lib/dialog-open-flag.js");
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ""), /requestAnimationFrame|setTimeout/);
  assert.match(source, /new MutationObserver\(/);
});

test("the root layout installs the flag once for every route", () => {
  const root = read("src/routes/__root.tsx");
  assert.match(root, /import \{ watchOpenDialogs \} from "@\/lib\/dialog-open-flag\.js";/);
  assert.match(root, /useEffect\(\(\) => watchOpenDialogs\(\), \[\]\);/);
  assert.match(root, /<AppGuards \/>\s*<DialogOpenFlag \/>/);
});
