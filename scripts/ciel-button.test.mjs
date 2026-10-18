import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import { stripJpegPrivateMetadata } from "./build-ciel-button.mjs";
import * as infernoTrigger from "../src/lib/ciel-inferno-trigger.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the published source has no private metadata and JPEG scan bytes are untouched", async () => {
  const marker = (id, data) => Buffer.concat([Buffer.from([255, id, 0, data.length + 2]), data]);
  const icc = marker(0xe2, Buffer.from("ICC"));
  const scan = Buffer.from([255, 218, 0, 2, 10, 255, 225, 20, 255, 217]);
  const input = Buffer.concat([
    Buffer.from([255, 216]),
    marker(0xe1, Buffer.from("EXIF/XMP")),
    icc,
    marker(0xed, Buffer.from("IPTC")),
    marker(0xfe, Buffer.from("private comment")),
    scan,
  ]);
  assert.deepEqual(
    stripJpegPrivateMetadata(input),
    Buffer.concat([Buffer.from([255, 216]), icc, scan]),
  );
  const metadata = await sharp(
    new URL("../public/ciel-button-20261018.jpeg", import.meta.url).pathname,
  ).metadata();
  for (const key of ["exif", "xmp", "iptc"]) assert.equal(metadata[key], undefined, key);
});
const compile = (path) =>
  ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

// Run the real provider callbacks and its real cancelable waits. Rendering is
// checked separately in the browser; these tests control otherwise rare races.
function mount() {
  const tree = ts.createSourceFile(
    "zeus-button.tsx",
    read("src/components/zeus-button.tsx"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const provider = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === "ZeusButtonProvider",
  );
  const callbackNames = [];
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(tree) === "useCallback"
    )
      callbackNames.push(node.name.getText(tree));
    ts.forEachChild(node, visit);
  };
  visit(provider);
  const effects = [],
    callbacks = [],
    states = [],
    writes = [],
    frames = new Map(),
    timers = new Map(),
    pending = [],
    storageWrites = [];
  let serial = 0,
    time = 0;
  const win = new EventTarget(),
    doc = new EventTarget();
  Object.assign(win, {
    requestAnimationFrame: (fn) => {
      frames.set(++serial, fn);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (fn, ms) => {
      timers.set(++serial, { fn, ms });
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
    localStorage: {
      getItem: () => null,
      setItem: (...args) => storageWrites.push(args),
    },
  });
  Object.assign(doc, {
    hidden: false,
    body: {},
    createElement: () => ({}),
    querySelectorAll: () => [],
    querySelector: () => null,
  });
  const common = {
    window: win,
    document: doc,
    AbortController,
    CustomEvent,
    performance: { now: () => time },
  };
  const waits = {};
  runInNewContext(compile("src/lib/floating-button-wait.ts"), { ...common, exports: waits });
  const exports = {};
  runInNewContext(compile("src/components/zeus-button.tsx"), {
    ...common,
    exports,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    require(name) {
      if (name === "react")
        return {
          createContext: () => ({ Provider: "provider" }),
          useCallback: (fn) => {
            callbacks.push(fn);
            return fn;
          },
          useRef: (current) => ({ current }),
          useMemo: (fn) => fn(),
          useState: (initial) => {
            const id = states.length;
            states.push(initial);
            return [
              initial,
              (value) => {
                states[id] = value;
                writes.push({ id, value });
              },
            ];
          },
          useEffect: (fn) => effects.push(fn),
        };
      if (name === "react/jsx-runtime")
        return {
          jsx: (type, props) => ({ type, props }),
          jsxs: (type, props) => ({ type, props }),
        };
      if (name === "@tanstack/react-router") return { useRouterState: () => "/library" };
      if (name === "@/components/load-gate")
        return {
          useLoadGate: () => ({
            go: (options) =>
              new Promise((resolve, reject) => pending.push({ options, resolve, reject })),
          }),
        };
      if (name === "@/lib/floating-button-wait") return waits;
      if (name === "@/lib/ciel-inferno-trigger") return infernoTrigger;
      return {};
    },
  });
  exports.ZeusButtonProvider({ children: null });
  const cleanups = effects.map((fn) => fn());
  const navigate = callbacks.find((fn) => fn.constructor.name === "AsyncFunction");
  assert.ok(navigate);
  return {
    win,
    doc,
    states,
    writes,
    frames,
    timers,
    pending,
    waits,
    navigate,
    storageWrites,
    callback(name) {
      const index = callbackNames.indexOf(name);
      assert.ok(index >= 0, `real provider callback ${name} exists`);
      return callbacks[index];
    },
    advanceTime(ms) {
      time += ms;
    },
    flushFrames() {
      for (const [id, fn] of [...frames]) {
        frames.delete(id);
        fn();
      }
    },
    flushTimers() {
      for (const [id, { fn, ms }] of [...timers]) {
        timers.delete(id);
        time += ms;
        fn();
      }
    },
    unmount() {
      for (const fn of cleanups) fn?.();
    },
  };
}
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const start = async (h) => {
  const done = h.navigate();
  h.flushFrames();
  await tick();
  return { done };
};

const triggerSecret = (h) => {
  for (let i = 0; i < 10; i++) {
    h.callback("tapSecret")({ x: 0.95, y: 0.82 });
    h.advanceTime(100);
  }
};

test("committing the scene clears its import deadline and retains the burned document until reload", async () => {
  const h = mount();
  triggerSecret(h);
  const origin = h.states[7];
  assert.ok(origin && origin.x === 0.95);
  assert.deepEqual(
    [...h.timers.values()].map(({ ms }) => ms),
    [12000],
  );
  h.callback("commitSecret")();
  assert.equal(h.timers.size, 0, "a committed scene cannot be uncovered by the import deadline");
  h.callback("closeSecret")();
  h.doc.hidden = true;
  h.doc.dispatchEvent(new Event("visibilitychange"));
  h.win.dispatchEvent(new Event("pagehide"));
  h.flushTimers();
  assert.equal(h.states[7], origin, "Escape and lifecycle cancellation cannot remove the scene");
  h.doc.hidden = false;
  await h.navigate();
  assert.equal(h.frames.size, 0, "burned state cannot start ordinary navigation");
  assert.equal(h.pending.length, 0);
  assert.equal(h.storageWrites.length, 0, "the scene never persists a burned flag");
  h.unmount();
  await tick();
});

test("an uncommitted import can still be cancelled without persisting a burned flag", async () => {
  const h = mount();
  triggerSecret(h);
  h.callback("closeSecret")();
  assert.equal(h.states[7], null);
  assert.equal(h.states[6], false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.storageWrites.length, 0);
  h.unmount();
  await tick();
});

test("Ciel branding uses the supplied illustration in both states and preserves personal preferences", () => {
  const source = read("src/components/zeus-button.tsx");
  assert.match(source, /<b>シエルボタン<\/b>/);
  const tree = ts.createSourceFile(
    "zeus-button.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const labels = [];
  const visit = (node) => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(tree) === "aria-label" &&
      node.initializer?.getText(tree).includes("シエルボタン")
    )
      labels.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.equal(labels.length, 1, "the Ciel control has one authoritative accessible label");
  const label = labels[0].initializer.expression;
  assert.ok(ts.isConditionalExpression(label));
  assert.equal(label.condition.getText(tree), "secretAwakening");
  assert.equal(label.whenTrue.text, "シエルボタン。演出を終了");
  assert.equal(label.whenFalse.text, "シエルボタン。押すとトップへ戻り、長押しすると移動できます");
  assert.equal((source.match(/src="\/ciel-button-20261018-360.webp"/g) ?? []).length, 2);
  assert.doesNotMatch(source, /ゼウスボタン|src="\/zeus-button/);
  assert.match(source, /deception-world:zeus-button-enabled/);
  assert.match(source, /deception-world:zeus-button-position/);
});

test("a frame or bounded fallback starts the return once; repeated activation is ignored", async () => {
  for (const flush of ["flushFrames", "flushTimers"]) {
    const h = mount();
    const first = h.navigate();
    await h.navigate();
    h[flush]();
    await tick();
    assert.equal(h.pending.length, 1);
    assert.equal(h.pending[0].options.to, "/world");
    assert.equal(h.pending[0].options.hash, "top");
    assert.equal(h.frames.size, 0);
    h.pending[0].resolve();
    await tick();
    h.flushTimers();
    await first;
    assert.equal(h.states[4], false);
    assert.equal(h.states[5], false);
    assert.equal(h.timers.size, 0);
    h.unmount();
  }
});

test("hiding before the first paint releases waits and never starts navigation", async () => {
  const h = mount();
  const done = h.navigate();
  h.doc.hidden = true;
  h.doc.dispatchEvent(new Event("visibilitychange"));
  await done;
  assert.equal(h.pending.length, 0);
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.states[4], false);
  assert.equal(h.states[5], false);
  await h.navigate();
  assert.equal(h.frames.size, 0, "a hidden document cannot start a new operation");
  h.unmount();
});

for (const event of ["pagehide", "visibilitychange"]) {
  test(`${event} releases the busy state; an old completion cannot clear the next operation`, async () => {
    const h = mount();
    const first = await start(h);
    if (event === "visibilitychange") h.doc.hidden = true;
    (event === "pagehide" ? h.win : h.doc).dispatchEvent(new Event(event));
    assert.equal(h.states[4], false);
    h.doc.hidden = false;
    const second = await start(h);
    assert.equal(h.pending.length, 2);
    h.pending[0].resolve();
    await first.done;
    assert.equal(h.states[4], true);
    assert.equal(h.states[5], true);
    h.pending[1].resolve();
    await tick();
    h.flushTimers();
    await second.done;
    assert.equal(h.states[4], false);
    assert.equal(h.states[5], false);
    h.unmount();
  });
}

test("a rejected route promise is handled and leaves the button reusable", async () => {
  const h = mount();
  const first = await start(h);
  h.pending[0].reject(new Error("route preparation failed"));
  await tick();
  h.flushTimers();
  await first.done;
  assert.equal(h.states[4], false);
  const second = await start(h);
  assert.equal(h.pending.length, 2);
  h.pending[1].resolve();
  await tick();
  h.flushTimers();
  await second.done;
  h.unmount();
});

test("hiding during the minimum image display never cancels an unrelated route", async () => {
  const h = mount();
  let cancellations = 0;
  h.doc.addEventListener("deception-world:cancel-route-transition", () => cancellations++);
  const first = await start(h);
  assert.equal(cancellations, 1, "the requested return cancels preceding transient UI");
  h.pending[0].resolve();
  await tick();
  assert.ok(h.timers.size > 0, "the compact image is still finishing its minimum display");
  h.doc.hidden = true;
  h.doc.dispatchEvent(new Event("visibilitychange"));
  await first.done;
  assert.equal(cancellations, 1, "the completed route no longer owns global cancellation");
  assert.equal(h.states[4], false);
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test("unmount aborts visual waits and late route completion never writes component state", async () => {
  const h = mount();
  const first = await start(h);
  h.unmount();
  const count = h.writes.length;
  h.pending[0].resolve();
  await first.done;
  assert.equal(h.writes.length, count);
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  h.win.dispatchEvent(new Event("pagehide"));
  h.doc.hidden = true;
  h.doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.writes.length, count, "lifecycle listeners are removed on unmount");
});
