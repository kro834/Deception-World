import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRealmArchiveMotion } from "./build-realm-archive-motion.mjs";

/* The form archive keeps the reader's form and compared pair in the page URL
   (?form=…&compare=a.b). The sandboxed frame receives them in its #fragment
   (public/archive-state-bridge.js) and reports each later choice back. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/routes/form-archive.tsx");
const bridge = read("public/archive-state-bridge.js");
const saga = read("archives/saga-form-archive-standalone.html");
const build = read("scripts/build-embedded-archives.mjs");

test("the route validates form and pair ids and keeps them in its own URL", () => {
  assert.match(route, /const ARCHIVE_FORM_ID = \/\^\[a-z0-9-\]\{1,40\}\$\/;/);
  assert.match(
    route,
    /const ARCHIVE_COMPARE_PAIR = \/\^\[a-z0-9-\]\{1,40\}\\\.\[a-z0-9-\]\{1,40\}\$\/;/,
  );
  assert.match(
    route,
    /form: archiveFormId\(search\.form\),\s*compare: archiveComparePair\(search\.compare\),/,
  );
  // The frame's src is fixed per frame: a later choice never reloads it.
  assert.match(route, /src=\{`\$\{archiveDocument\}\$\{archiveFrameHash\(frameState\)\}`\}/);
  assert.doesNotMatch(route, /src=\{`\$\{archiveDocument\}\$\{archiveFrameHash\(\{/);
  // Reports replace this entry, as the archive switch does (b770d11).
  const keep = route.slice(
    route.indexOf("const keepArchiveState"),
    route.indexOf('window.addEventListener("message", keepArchiveState)'),
  );
  assert.match(keep, /data\?\.type !== ARCHIVE_STATE_MESSAGE/);
  assert.match(keep, /event\.source === null \|\| event\.source !== frame\.contentWindow/);
  assert.match(keep, /data\.kind !== activeTransitionRef\.current\.archive/);
  assert.match(keep, /replace: true,\s*resetScroll: false/);
  assert.match(route, /window\.removeEventListener\("message", keepArchiveState\)/);
  // The other archive's ids are not this one's.
  assert.match(
    route,
    /archive: next === "realm" \? next : undefined,\s*form: undefined,\s*compare: undefined,/,
  );
  // History traversal to another record reopens the frame; its own reports do not.
  assert.match(route, /if \(!loaded \|\| reportsInFlightRef\.current > 0\) return;/);
  assert.match(route, /requestedForm !== known\.form \|\| requestedCompare !== known\.compare/);
});

test("both embedded archives load the state bridge once, before the controllers", () => {
  assert.match(
    build,
    /stateBridgeScript = '<script src="\/archive-state-bridge\.js\?v=[\w-]+" defer><\/script>'/,
  );
  for (const kind of ["saga", "realm"]) {
    const html = read(`public/${kind}-form-archive-embedded.html`);
    assert.equal(html.match(/archive-state-bridge\.js\?v=[\w-]+/g)?.length, 1, kind);
    const head = html.slice(0, html.indexOf("</head>"));
    assert.match(head, /archive-state-bridge\.js/, `${kind} loads the bridge in its head`);
  }
});

test("the form controller opens on the requested form and reports choices", () => {
  for (const [name, controller] of [
    ["saga", saga],
    ["realm", createRealmArchiveMotion(saga)],
  ]) {
    assert.match(
      controller,
      /const requestedIndex = items\.findIndex\(item => item\.formId === document\.documentElement\.dataset\.archiveRequestedForm\);/,
      name,
    );
    assert.match(
      controller,
      /let openingIndex = requestedIndex >= 0 \? requestedIndex : defaultIndex;/,
    );
    assert.match(controller, /const isDefault = index === openingIndex;/);
    assert.match(controller, /let selectedIndex = openingIndex;/);
    assert.match(controller, /selectedIndex = index;\n {4}reportSelection\(index\);/);
    assert.match(controller, /new CustomEvent\('archive:formchange'/);
    // Only inside the page does a back-forward return keep the reported form.
    assert.match(controller, /if \(window\.parent !== window\) openingIndex = index;/);
    // The Realm normalization rewrites "saga-"; the protocol must survive it.
    assert.doesNotMatch(controller, /realm--saga-archive:formchange|archive-state-realm/);
  }
});

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.dataset = {};
    this.listeners = new Map();
    this.events = [];
  }
  addEventListener(type, callback) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), callback]);
  }
  dispatchEvent(event) {
    this.events.push(event.type);
    for (const callback of this.listeners.get(event.type) ?? []) callback(event);
    return true;
  }
  getAttribute(name) {
    return this.attributes?.[name] ?? null;
  }
}
class FakeInput extends FakeElement {
  checked = false;
}
class FakeSelect extends FakeElement {
  constructor(id, values, initial) {
    super(id);
    this.options = values.map((value) => ({ value, defaultSelected: value === initial }));
    this.value = initial;
  }
}

function bridgeHarness({
  hash = "",
  kind = "saga",
  prefix = "",
  embedded = true,
  selected = "multi",
} = {}) {
  const ids = ["multi", "last-multi", "rock", "vertex"];
  const elements = new Map();
  const compare = new FakeElement(`${prefix}saga-form-compare-ios`);
  elements.set(compare.id, compare);
  for (const side of ["a", "b"]) {
    const select = new FakeSelect(
      `${prefix}saga-compare-select-${side}`,
      ids,
      side === "a" ? ids[0] : ids[1],
    );
    elements.set(select.id, select);
    for (const id of ids) {
      const radio = new FakeInput(`${prefix}saga-compare-${side}-${id}`);
      elements.set(radio.id, radio);
    }
  }
  const chips = ids.map((id) => {
    const chip = new FakeElement();
    chip.dataset.formId = id;
    chip.attributes = { "aria-checked": String(id === selected) };
    return chip;
  });
  const document = new FakeElement();
  document.readyState = "complete";
  document.documentElement = { dataset: { archiveKind: kind } };
  document.getElementById = (id) => elements.get(id) ?? null;
  document.querySelector = (selector) =>
    selector === '[id$="saga-form-compare-ios"]' ? compare : null;
  document.querySelectorAll = () => chips;
  const posted = [];
  const timers = [];
  const window = {
    location: { hash },
    setTimeout: (callback) => timers.push(callback) && timers.length,
    clearTimeout: () => {},
    requestAnimationFrame: (callback) => timers.push(callback),
  };
  window.parent = embedded ? { postMessage: (message) => posted.push(message) } : window;
  const context = vm.createContext({
    window,
    document,
    URLSearchParams,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    HTMLSelectElement: FakeSelect,
    HTMLInputElement: FakeInput,
  });
  vm.runInContext(bridge, context);
  const flush = () => {
    while (timers.length) timers.shift()();
  };
  return { document, elements, compare, posted, flush, chips };
}

test("the bridge hands a requested form and pair to the archive before it starts", () => {
  const { document, elements, posted, flush } = bridgeHarness({
    hash: "#form=vertex&compare=rock.vertex",
    selected: "vertex",
  });
  assert.equal(document.documentElement.dataset.archiveRequestedForm, "vertex");
  assert.equal(elements.get("saga-compare-a-rock").checked, true);
  assert.equal(elements.get("saga-compare-b-vertex").checked, true);
  assert.equal(elements.get("saga-compare-select-a").value, "rock");
  assert.equal(elements.get("saga-compare-select-b").value, "vertex");
  // The Realm controller follows the native select through its change event.
  assert.deepEqual(elements.get("saga-compare-select-b").events, ["change"]);
  flush();
  assert.deepEqual(posted, [], "a request the archive honoured needs no correction");
});

test("unknown ids and default pairs are dropped from the page URL", () => {
  for (const hash of ["#form=bogus&compare=rock.nothing", "#form=..%2F&compare=multi.last-multi"]) {
    const { document, elements, posted, flush } = bridgeHarness({ hash });
    assert.equal(
      document.documentElement.dataset.archiveRequestedForm,
      hash.includes("bogus") ? "bogus" : undefined,
    );
    assert.equal(elements.get("saga-compare-select-a").value, "multi");
    flush();
    assert.deepEqual(
      posted.map(({ type, kind, form, compare }) => ({ type, kind, form, compare })),
      [{ type: "deception-world:archive-state", kind: "saga", form: null, compare: null }],
    );
  }
});

test("later choices are reported to the page with the archive kind", () => {
  const { document, elements, compare, posted, flush } = bridgeHarness({
    kind: "realm",
    prefix: "realm--",
  });
  flush();
  assert.deepEqual(posted, []);
  document.dispatchEvent({
    type: "archive:formchange",
    detail: { formId: "vertex", isDefault: false },
  });
  flush();
  elements.get("realm--saga-compare-select-b").value = "rock";
  compare.dispatchEvent({ type: "change" });
  flush();
  document.dispatchEvent({
    type: "archive:formchange",
    detail: { formId: "multi", isDefault: true },
  });
  flush();
  assert.deepEqual(
    posted.map(({ kind, form, compare: pair }) => ({ kind, form, pair })),
    [
      { kind: "realm", form: "vertex", pair: null },
      { kind: "realm", form: "vertex", pair: "multi.rock" },
      { kind: "realm", form: null, pair: "multi.rock" },
    ],
  );
});

test("a standalone archive reads a fragment but never posts", () => {
  const { document, posted, flush } = bridgeHarness({ hash: "#form=rock", embedded: false });
  assert.equal(document.documentElement.dataset.archiveRequestedForm, "rock");
  flush();
  assert.deepEqual(posted, []);
});
