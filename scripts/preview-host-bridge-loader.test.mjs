import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = (name) => readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");

function fixture({
  parentIsSelf = false,
  referrer = "https://grok.com/",
  ancestorOrigin,
  hostname = "deception-world.vercel.app",
} = {}) {
  const win = new EventTarget();
  const reports = [];
  const navigations = [];
  const traversals = [];
  const history = {
    state: {},
    length: 1,
    pushState(state) {
      this.state = state;
    },
    replaceState(state) {
      this.state = state;
    },
    go(delta) {
      traversals.push(delta);
    },
  };
  const push = history.pushState;
  const replace = history.replaceState;
  const parent = parentIsSelf
    ? win
    : { postMessage: (data, origin) => reports.push({ data, origin }) };
  const location = {
    ancestorOrigins: ancestorOrigin ? [ancestorOrigin] : [],
    hostname,
    origin: `https://${hostname}`,
    href: `https://${hostname}/`,
    pathname: "/",
    search: "",
    hash: "",
  };
  Object.assign(win, { parent, history, location });
  const context = { window: win, document: { referrer }, location, URL, queueMicrotask };
  const modules = new Map();
  const loadModule = (name) => {
    if (modules.has(name)) return modules.get(name);
    const module = { exports: {} };
    const code = ts.transpileModule(source(name), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(code, {
      ...context,
      exports: module.exports,
      module,
      require: (id) =>
        id.startsWith("./") ? loadModule(id.slice(2).replace(/\.ts$/, "")) : require(id),
    });
    modules.set(name, module.exports);
    return module.exports;
  };
  let loads = 0;
  let resolveLoad, rejectLoad;
  const loaded = new Promise((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });
  const loader = loadModule("preview-host-bridge-loader");
  return {
    win,
    reports,
    navigations,
    traversals,
    history,
    push,
    replace,
    loads: () => loads,
    mount: () =>
      loader.loadPreviewHostBridge(
        {
          navigate: (path) => navigations.push(path),
          routeTree: { fullPath: "/", children: [{ fullPath: "/world" }] },
        },
        () => {
          loads++;
          return loaded;
        },
      ),
    resolve: () => resolveLoad(loadModule("preview-host-bridge")),
    reject: () => rejectLoad(new Error("chunk unavailable")),
    message(data, { origin = new URL(referrer || ancestorOrigin).origin, source = parent } = {}) {
      const event = new Event("message");
      Object.defineProperties(event, {
        data: { value: data },
        origin: { value: origin },
        source: { value: source },
      });
      win.dispatchEvent(event);
    },
  };
}

const message = (type, fields = {}) => ({
  channel: "grok-preview-bridge",
  version: 1,
  type,
  ...fields,
});
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

test("public top-level pages and unaccepted frames never request the preview validator", async () => {
  for (const settings of [
    { parentIsSelf: true },
    { referrer: "https://outside.example/" },
    { referrer: "" },
  ]) {
    const ui = fixture(settings);
    const dispose = ui.mount();
    await flush();
    assert.equal(ui.loads(), 0);
    assert.equal(ui.history.pushState, ui.push);
    dispose();
  }
});

test("accepted preview origins retain referrer, ancestor and sandbox matching", async () => {
  for (const settings of [
    {},
    { referrer: "", ancestorOrigin: "http://localhost:8080" },
    { referrer: "https://preview-host.example/", hostname: "app.grok-sandbox.com" },
    { referrer: "https://grok.example.test/", hostname: "app.preview.example.test" },
  ]) {
    const ui = fixture(settings);
    const dispose = ui.mount();
    await flush();
    assert.equal(ui.loads(), 1);
    ui.resolve();
    await flush();
    assert.equal(ui.reports.at(-1)?.data.type, "ready");
    dispose();
    assert.notEqual(ui.history.pushState, ui.push, "the original installer restores bound methods");
  }
});

test("early handshake, navigation and history commands reach the unchanged validated bridge once", async () => {
  const ui = fixture();
  const dispose = ui.mount();
  ui.message(message("hello"));
  ui.message(message("navigate", { path: "/world#top" }));
  ui.message(message("history", { delta: 1 }));
  ui.resolve();
  await flush();
  assert.deepEqual(ui.navigations, ["/world#top"]);
  assert.deepEqual(ui.traversals, [1]);
  assert.equal(ui.reports.filter(({ data }) => data.type === "ready").length, 2);
  assert.deepEqual(Array.from(ui.reports.find(({ data }) => data.type === "routes").data.paths), [
    "/",
    "/world",
  ]);
  const count = ui.reports.length;
  dispose();
  ui.message(message("navigate", { path: "/gallery" }));
  ui.win.dispatchEvent(new Event("hashchange"));
  assert.equal(ui.reports.length, count);
  assert.deepEqual(ui.navigations, ["/world#top"]);
});

test("queued messages keep source, origin, protocol, safe-path and history-root restrictions", async () => {
  const ui = fixture();
  const dispose = ui.mount();
  ui.message(message("navigate", { path: "/foreign-origin" }), {
    origin: "https://outside.example",
  });
  ui.message(message("navigate", { path: "/foreign-source" }), { source: {} });
  ui.message(message("navigate", { channel: "other-channel", path: "/other-channel" }));
  ui.message(message("navigate", { version: 2, path: "/other-version" }));
  ui.message(message("navigate", { path: "//outside.example/" }));
  ui.message(message("navigate", { path: "/\\outside.example/" }));
  ui.message(message("navigate", { path: 42 }));
  ui.message(message("history", { delta: 20 }));
  ui.message(message("history", { delta: -1 }));
  ui.resolve();
  await flush();
  assert.deepEqual(ui.navigations, []);
  assert.deepEqual(ui.traversals, []);
  dispose();
});

test("unmount before chunk arrival cannot install a late history patch or replay commands", async () => {
  const ui = fixture();
  const dispose = ui.mount();
  ui.message(message("navigate", { path: "/world" }));
  dispose();
  ui.resolve();
  await flush();
  assert.equal(ui.history.pushState, ui.push);
  assert.equal(ui.history.replaceState, ui.replace);
  assert.deepEqual(ui.reports, []);
  assert.deepEqual(ui.navigations, []);
});

test("StrictMode cleanup and remount install only the current bridge and replay once", async () => {
  const ui = fixture();
  ui.mount()();
  const dispose = ui.mount();
  ui.message(message("navigate", { path: "/world" }));
  ui.resolve();
  await flush();
  assert.equal(ui.reports.filter(({ data }) => data.type === "ready").length, 1);
  assert.deepEqual(ui.navigations, ["/world"]);
  dispose();
});

test("failed chunk requests leave normal navigation untouched and dispose pending listeners", async () => {
  const ui = fixture();
  const dispose = ui.mount();
  ui.message(message("navigate", { path: "/world" }));
  ui.reject();
  await flush();
  assert.equal(ui.history.pushState, ui.push);
  assert.deepEqual(ui.navigations, []);
  assert.deepEqual(ui.reports, []);
  dispose();
});
