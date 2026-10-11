import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  claimSideMenuEarlyInput,
  installSideMenuEarlyInput,
  isSideMenuEarlyInputValid,
  SIDE_MENU_EARLY_INPUT_SCRIPT,
} from "../src/lib/side-menu-early-input.js";

const menuSource = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(menuSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const openInputEvent = "deception-world:side-menu-open-input";

function fixture() {
  const listeners = new Map();
  const win = {
    document: { hidden: false },
    location: { pathname: "/world", href: "https://example.test/world" },
    addEventListener(type, listener, capture = false) {
      const entries = listeners.get(type) ?? [];
      entries.push({ listener, capture });
      listeners.set(type, entries);
    },
    removeEventListener(type, listener, capture = false) {
      const entries = listeners.get(type) ?? [];
      listeners.set(
        type,
        entries.filter((entry) => entry.listener !== listener || entry.capture !== capture),
      );
    },
    dispatchEvent(event) {
      for (const { listener } of [...(listeners.get(event.type) ?? [])]) {
        listener(event);
        if (event.immediateStopped) break;
      }
      return !event.defaultPrevented;
    },
  };
  const button = () => ({
    tagName: "BUTTON",
    isConnected: true,
    disabled: false,
    blocked: false,
    trigger: true,
    blurs: 0,
    matches(selector) {
      assert.equal(selector, ".side-panel-trigger");
      return this.trigger;
    },
    closest(selector) {
      return selector === ".side-panel-trigger"
        ? this.trigger
          ? this
          : null
        : this.blocked
          ? {}
          : null;
    },
    blur() {
      this.blurs++;
    },
  });
  const opener = button();
  const nativeClick = (overrides = {}) => {
    const event = {
      type: "click",
      isTrusted: true,
      button: 0,
      detail: 1,
      target: { closest: () => opener },
      defaultPrevented: false,
      immediateStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.immediateStopped = true;
      },
      ...overrides,
    };
    win.dispatchEvent(event);
    return event;
  };
  return { win, listeners, opener, button, nativeClick };
}

// Execute the actual Trigger rather than a second implementation of its
// handoff. Layout/passive effects and microtasks are separately driven so a
// test cannot silently wait for press-ready and hide the original race.
function triggerFixture(f, props = {}) {
  const refs = [],
    microtasks = [],
    changes = [];
  let cursor = 0,
    layouts = [],
    passives = [],
    cleanups = [];
  const exports = {};
  runInNewContext(compiled, {
    exports,
    window: f.win,
    CustomEvent: class {
      constructor(type, { detail }) {
        this.type = type;
        this.detail = detail;
      }
    },
    queueMicrotask: (run) => microtasks.push(run),
    require(name) {
      if (name === "react")
        return {
          useRef(initial) {
            return (refs[cursor++] ??= { current: initial });
          },
          useLayoutEffect: (run) => layouts.push(run),
          useEffect: (run) => passives.push(run),
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@/lib/side-menu-early-input.js")
        return {
          claimSideMenuEarlyInput: (opener) => claimSideMenuEarlyInput(opener, f.win),
          isSideMenuEarlyInputValid: (input) => isSideMenuEarlyInputValid(input, f.win),
        };
      return {};
    },
  });
  const onOpenChange = (value) => changes.push(value);
  let node;
  const render = (overrides = {}) => {
    cursor = 0;
    layouts = [];
    passives = [];
    node = exports.SideMenuTrigger({ onOpenChange, ...props, ...overrides });
    node.props.ref.current = f.opener;
    return node;
  };
  render();
  return {
    changes,
    microtasks,
    render,
    layout() {
      layouts.forEach((run) => run());
    },
    passive() {
      cleanups = passives.map((run) => run()).filter(Boolean);
    },
    cleanup() {
      cleanups.forEach((run) => run());
      cleanups = [];
    },
    flush() {
      while (microtasks.length) microtasks.shift()();
    },
    click(detail = 1) {
      node.props.onClick({ detail, currentTarget: f.opener });
    },
    get node() {
      return node;
    },
  };
}

test("SSR head bootstrap is self-contained, idempotent, and inert without a window", () => {
  assert.equal(installSideMenuEarlyInput(), null);
  assert.equal(claimSideMenuEarlyInput(null), null);
  assert.equal(isSideMenuEarlyInputValid(null), false);
  const f = fixture();
  runInNewContext(SIDE_MENU_EARLY_INPUT_SCRIPT, { window: f.win });
  const owner = f.win.__dwSideMenuEarlyInput;
  runInNewContext(SIDE_MENU_EARLY_INPUT_SCRIPT, { window: f.win });
  assert.equal(f.win.__dwSideMenuEarlyInput, owner);
  assert.equal(f.listeners.get("click").length, 1);
  assert.equal(f.listeners.get("popstate").length, 1);
  assert.equal(f.listeners.get("pagehide").length, 1);
  owner.claim(f.opener);
  runInNewContext(SIDE_MENU_EARLY_INPUT_SCRIPT, { window: f.win });
  assert.ok([...f.listeners.values()].every((entries) => entries.length === 0));
});

test("native activation before hydration is consumed before React capture and opens once after effects", () => {
  const f = fixture();
  installSideMenuEarlyInput(f.win);
  let replayed = 0;
  const reactCapture = () => replayed++;
  f.win.addEventListener("click", reactCapture, true);
  const event = f.nativeClick();
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.immediateStopped, true);
  assert.equal(replayed, 0);
  const ui = triggerFixture(f);
  ui.layout();
  assert.deepEqual(ui.changes, []);
  ui.passive();
  assert.deepEqual(ui.changes, []);
  const details = [];
  // Layer occurs later in JSX on most routes: its passive listener must be
  // registered before Trigger's queued delivery, not its layout claim.
  f.win.addEventListener(openInputEvent, (event) => details.push(event.detail));
  ui.flush();
  assert.deepEqual(ui.changes, [true]);
  assert.equal(details.length, 1);
  assert.equal(details[0].keyboard, false);
  assert.equal(details[0].opener, f.opener);
  assert.equal(f.opener.blurs, 1);
  assert.equal(f.listeners.get("popstate").length, 0);
  assert.equal(f.listeners.get("pagehide").length, 0);
  const readyClick = f.nativeClick();
  assert.equal(readyClick.defaultPrevented, false);
  assert.equal(replayed, 1);
  ui.click();
  ui.flush();
  assert.deepEqual(ui.changes, [true, true]);
});

test("multiple early native clicks retain only the first activation and keyboard metadata", () => {
  const f = fixture();
  installSideMenuEarlyInput(f.win);
  f.nativeClick({ detail: 0 });
  f.nativeClick();
  f.nativeClick();
  const ui = triggerFixture(f);
  const details = [];
  ui.layout();
  ui.passive();
  f.win.addEventListener(openInputEvent, (event) => details.push(event.detail));
  ui.flush();
  assert.deepEqual(ui.changes, [true]);
  assert.equal(details.length, 1);
  assert.equal(details[0].keyboard, true);
  assert.equal(f.opener.blurs, 0);
});

test("normal ready click wins over a claimed but not yet delivered early activation", () => {
  const f = fixture();
  installSideMenuEarlyInput(f.win);
  f.nativeClick({ detail: 0 });
  const ui = triggerFixture(f);
  const details = [];
  ui.layout();
  ui.passive();
  f.win.addEventListener(openInputEvent, (event) => details.push(event.detail));
  ui.click();
  ui.flush();
  assert.deepEqual(ui.changes, [true]);
  assert.equal(details.length, 1);
  assert.equal(details[0].keyboard, false);
  assert.equal(f.opener.blurs, 1);
});

test("hydration without early input removes bootstrap listeners and keeps normal keyboard handling", () => {
  const f = fixture();
  installSideMenuEarlyInput(f.win);
  const ui = triggerFixture(f);
  const details = [];
  ui.layout();
  ui.passive();
  f.win.addEventListener(openInputEvent, (event) => details.push(event.detail));
  ui.flush();
  assert.deepEqual(ui.changes, []);
  assert.equal(f.listeners.get("click").length, 0);
  ui.click(0);
  assert.deepEqual(ui.changes, [true]);
  assert.equal(details[0].keyboard, true);
  assert.equal(f.opener.blurs, 0);
  assert.equal(ui.node.props["aria-label"], "メニューを開く");
  assert.equal(ui.node.props["aria-controls"], "site-side-panel");
  assert.equal(ui.node.props["data-liquid-pointer"], "true");
});

test("StrictMode layout and passive replay retain the packet and deliver it exactly once", () => {
  const f = fixture();
  installSideMenuEarlyInput(f.win);
  f.nativeClick({ detail: 0 });
  const ui = triggerFixture(f);
  ui.layout();
  ui.passive();
  ui.cleanup();
  // Same DOM/ref state, effect setup-cleanup-setup. Do not flush the first
  // microtask before cleanup: that would miss React's actual replay race.
  ui.layout();
  ui.passive();
  const details = [];
  f.win.addEventListener(openInputEvent, (event) => details.push(event.detail));
  assert.equal(ui.microtasks.length, 2);
  ui.flush();
  assert.deepEqual(ui.changes, [true]);
  assert.equal(details.length, 1);
  assert.equal(details[0].keyboard, true);
  assert.equal(f.opener.blurs, 0);
  ui.cleanup();
  ui.flush();
  assert.deepEqual(ui.changes, [true]);
});

test("unmount cancels claimed delivery without a late open or retained global listeners", () => {
  const f = fixture();
  installSideMenuEarlyInput(f.win);
  f.nativeClick();
  const ui = triggerFixture(f);
  ui.layout();
  ui.passive();
  ui.cleanup();
  f.opener.isConnected = false;
  ui.flush();
  assert.deepEqual(ui.changes, []);
  assert.equal(f.opener.blurs, 0);
  assert.ok([...f.listeners.values()].every((entries) => entries.length === 0));
});

test("changed callback cancels its first delivery and the new owner opens once", () => {
  const f = fixture();
  installSideMenuEarlyInput(f.win);
  f.nativeClick();
  const ui = triggerFixture(f);
  ui.layout();
  ui.passive();
  ui.cleanup();
  const replacements = [];
  ui.render({ onOpenChange: (value) => replacements.push(value) });
  ui.layout();
  ui.passive();
  ui.flush();
  assert.deepEqual(ui.changes, []);
  assert.deepEqual(replacements, [true]);
});

for (const [name, overrides] of [
  ["programmatic", { isTrusted: false }],
  ["right button", { button: 2 }],
  ["already prevented", { defaultPrevented: true }],
  ...["altKey", "ctrlKey", "metaKey", "shiftKey"].map((key) => [key, { [key]: true }]),
  ["outside trigger", { target: { closest: () => null } }],
]) {
  test(`${name} does not create an early menu packet or consume the event`, () => {
    const f = fixture();
    const owner = installSideMenuEarlyInput(f.win);
    const event = f.nativeClick(overrides);
    assert.equal(event.immediateStopped, false);
    assert.equal(owner.claim(f.opener), null);
  });
}

for (const [name, invalidate] of [
  ["disconnected", (f) => (f.opener.isConnected = false)],
  ["disabled", (f) => (f.opener.disabled = true)],
  ["inert/hidden/aria-disabled ancestor", (f) => (f.opener.blocked = true)],
  ["wrong element type", (f) => (f.opener.tagName = "DIV")],
  ["removed trigger class", (f) => (f.opener.trigger = false)],
  ["hidden document", (f) => (f.win.document.hidden = true)],
]) {
  test(`${name} trigger is not captured before hydration`, () => {
    const f = fixture();
    const owner = installSideMenuEarlyInput(f.win);
    invalidate(f);
    const event = f.nativeClick();
    assert.equal(event.defaultPrevented, false);
    assert.equal(owner.claim(f.opener), null);
  });
}

for (const [name, invalidate] of [
  ["another pathname", (f) => (f.win.location.pathname = "/dream")],
  ["same pathname different hash", (f) => (f.win.location.href += "#cast")],
  ["disconnected", (f) => (f.opener.isConnected = false)],
  ["disabled", (f) => (f.opener.disabled = true)],
  ["inert/hidden/aria-disabled ancestor", (f) => (f.opener.blocked = true)],
  ["hidden document", (f) => (f.win.document.hidden = true)],
]) {
  test(`${name} after capture discards stale input at claim`, () => {
    const f = fixture();
    const owner = installSideMenuEarlyInput(f.win);
    f.nativeClick();
    invalidate(f);
    assert.equal(owner.claim(f.opener), null);
    assert.ok([...f.listeners.values()].every((entries) => entries.length === 0));
  });
  test(`${name} between layout claim and microtask cannot open another or inactive page`, () => {
    const f = fixture();
    installSideMenuEarlyInput(f.win);
    f.nativeClick();
    const ui = triggerFixture(f);
    ui.layout();
    ui.passive();
    invalidate(f);
    ui.flush();
    assert.deepEqual(ui.changes, []);
    assert.equal(f.opener.blurs, 0);
  });
}

test("a nonmatching hydration owner clears the pending DOM reference instead of retaining it", () => {
  const f = fixture();
  const owner = installSideMenuEarlyInput(f.win);
  f.nativeClick();
  assert.equal(owner.claim(f.button()), null);
  assert.equal(owner.claim(f.opener), null);
  assert.ok([...f.listeners.values()].every((entries) => entries.length === 0));
});

test("popstate clears an unclaimed activation even if history keeps the same pathname", () => {
  const f = fixture();
  const owner = installSideMenuEarlyInput(f.win);
  f.nativeClick();
  f.win.dispatchEvent({ type: "popstate" });
  assert.equal(owner.claim(f.opener), null);
});

test("pagehide releases capture and rejects both unclaimed and already claimed activations", () => {
  const f = fixture();
  const owner = installSideMenuEarlyInput(f.win);
  f.nativeClick();
  f.win.dispatchEvent({ type: "pagehide" });
  assert.equal(owner.claim(f.opener), null);
  assert.ok([...f.listeners.values()].every((entries) => entries.length === 0));
  const second = fixture();
  const secondOwner = installSideMenuEarlyInput(second.win);
  second.nativeClick();
  const packet = secondOwner.claim(second.opener);
  secondOwner.dispose();
  assert.equal(secondOwner.valid(packet), false);
});

test("valid input on a new route replaces an obsolete pre-hydration packet without queueing two", () => {
  const f = fixture();
  const owner = installSideMenuEarlyInput(f.win);
  f.nativeClick();
  f.win.location = { pathname: "/dream", href: "https://example.test/dream" };
  const next = f.button();
  f.nativeClick({ detail: 0, target: { closest: () => next } });
  const packet = owner.claim(next);
  assert.equal(packet.opener, next);
  assert.equal(packet.pathname, "/dream");
  assert.equal(packet.keyboard, true);
  assert.equal(owner.claim(next), null);
});

test("the bootstrap adds no timers, resource requests, storage, CSS, or layout reads", () => {
  const source = readFileSync(
    new URL("../src/lib/side-menu-early-input.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /\b(?:fetch|setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|AudioContext|getBoundingClientRect)\s*[.(]/,
  );
  assert.doesNotMatch(source, /\.style\s*[.=]|\.dataset\s*[.=]|createElement\s*\(/);
  const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
  assert.match(
    root,
    /import \{ SIDE_MENU_EARLY_INPUT_SCRIPT \} from "@\/lib\/side-menu-early-input\.js"/,
  );
  assert.match(root, /scripts:\s*\[[\s\S]*?\{ children: SIDE_MENU_EARLY_INPUT_SCRIPT \}/);
  assert.match(menuSource, /useLayoutEffect\([\s\S]*?claimSideMenuEarlyInput/);
  assert.match(menuSource, /useEffect\([\s\S]*?queueMicrotask\(/);
});
