import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = (name) =>
  ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const renderer = compiled("command-deck-renderer"),
  projection = compiled("command-deck-html-canvas");
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

function environment({
  gpu,
  twoD = true,
  drawable = false,
  reduced = false,
  saveData = false,
} = {}) {
  let next = 1;
  const frames = new Map(),
    timers = new Map(),
    allNodes = [],
    observers = [];
  const target = () => ({
    listeners: new Map(),
    addEventListener(name, fn) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) {
      this.listeners.get(name)?.delete(fn);
    },
    emit(name) {
      for (const fn of [...(this.listeners.get(name) ?? [])]) fn();
    },
  });
  const media = Object.assign(target(), { matches: reduced });
  const connection = Object.assign(target(), { saveData });
  const win = Object.assign(target(), {
    navigator: { gpu, connection },
    devicePixelRatio: 3,
    matchMedia: () => media,
    requestAnimationFrame(fn) {
      const id = next++;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(fn, ms) {
      const id = next++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  });
  const context = {
    draws: 0,
    htmlDraws: 0,
    clearRect() {
      this.draws++;
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    arc() {},
    save() {},
    restore() {},
    setTransform() {},
    ...(drawable
      ? {
          drawElementImage() {
            this.htmlDraws++;
          },
        }
      : {}),
  };
  const gpuContext = {
    configure() {},
    unconfigure() {},
    getCurrentTexture() {
      return {
        createView() {
          return {};
        },
      };
    },
  };
  const doc = Object.assign(target(), {
    hidden: false,
    defaultView: win,
    createElement(tag) {
      const node = Object.assign(target(), {
        tag,
        ownerDocument: doc,
        style: {},
        dataset: {},
        attrs: {},
        children: [],
        parent: null,
        width: 300,
        height: 150,
        setAttribute(name, value) {
          this.attrs[name] = value;
          if (name === "content" && drawable) this.content = value;
        },
        append(...nodes) {
          for (const n of nodes) {
            n.parent = this;
            this.children.push(n);
          }
        },
        remove() {
          if (this.parent) this.parent.children = this.parent.children.filter((n) => n !== this);
          this.parent = null;
        },
        getBoundingClientRect() {
          return { width: 1200, height: 800 };
        },
        getContext(kind) {
          return kind === "2d" ? (twoD ? context : null) : gpuContext;
        },
        ...(drawable
          ? {
              requestPaint() {
                this.emit("paint");
              },
            }
          : {}),
      });
      allNodes.push(node);
      return node;
    },
  });
  const host = doc.createElement("div");
  class Observer {
    constructor(fn) {
      this.fn = fn;
      this.disconnected = false;
      observers.push(this);
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  const load = (code) => {
    const exports = {};
    runInNewContext(code, { exports, ResizeObserver: Observer, IntersectionObserver: Observer });
    return exports;
  };
  return {
    host,
    win,
    doc,
    media,
    connection,
    context,
    frames,
    timers,
    observers,
    allNodes,
    mount: load(renderer).mountCommandDeckRenderer,
    mountHtml: load(projection).mountCommandDeckHtmlCanvas,
    step(time = 1000) {
      const pending = [...frames.values()];
      frames.clear();
      for (const fn of pending) fn(time);
    },
    expire() {
      const pending = [...timers.values()];
      timers.clear();
      for (const timer of pending) timer.fn();
    },
    countListeners() {
      return [win, doc, media, connection, ...allNodes].reduce(
        (sum, t) => sum + [...t.listeners.values()].reduce((n, s) => n + s.size, 0),
        0,
      );
    },
  };
}

function fakeGpu({ adapter = "ready", pipeline = "ready", deviceWait } = {}) {
  const lost = deferred();
  const state = { destroyed: 0, buffersDestroyed: 0, submits: 0, requested: 0 };
  let errorHandler;
  const device = {
    lost: lost.promise,
    destroy() {
      state.destroyed++;
    },
    addEventListener(_type, fn) {
      errorHandler = fn;
    },
    removeEventListener() {
      errorHandler = null;
    },
    queue: {
      writeBuffer() {},
      submit() {
        state.submits++;
      },
    },
    createBuffer() {
      return {
        destroy() {
          state.buffersDestroyed++;
        },
      };
    },
    createShaderModule() {
      return {};
    },
    async createRenderPipelineAsync() {
      if (pipeline === "reject") throw Error("shader failed");
      if (pipeline === "pending") return new Promise(() => {});
      return {
        getBindGroupLayout() {
          return {};
        },
      };
    },
    createBindGroup() {
      return {};
    },
    createCommandEncoder() {
      return {
        beginRenderPass() {
          return { setPipeline() {}, setBindGroup() {}, draw() {}, end() {} };
        },
        finish() {
          return {};
        },
      };
    },
  };
  return {
    state,
    device,
    lost,
    error: () => errorHandler?.(),
    api: {
      async requestAdapter() {
        state.requested++;
        if (adapter === "reject") throw Error("denied");
        if (adapter === "null") return null;
        return { requestDevice: () => deviceWait?.promise ?? Promise.resolve(device) };
      },
      getPreferredCanvasFormat() {
        return "bgra8unorm";
      },
    },
  };
}

test("no WebGPU or no canvas keeps the DOM intact, caps resolution and releases observers", async () => {
  const env = environment();
  const original = env.doc.createElement("a");
  env.host.append(original);
  const control = env.mount(env.host);
  await flush();
  env.step();
  assert.equal(env.host.dataset.renderer, "2d");
  assert.equal(original.parent, env.host);
  const canvas = env.host.children.find((n) => n.tag === "canvas");
  assert.ok(canvas.width * canvas.height < 1_505_000);
  assert.equal(canvas.attrs["aria-hidden"], "true");
  control.dispose();
  control.dispose();
  control.setScene(1);
  control.pulse();
  assert.equal(env.host.children.length, 1);
  assert.equal(env.frames.size, 0);
  assert.equal(env.countListeners(), 0);
  assert.ok(env.observers.every((o) => o.disconnected));
  const unsupported = environment({ twoD: false });
  unsupported.mount(unsupported.host);
  assert.equal(unsupported.host.dataset.renderer, "static");
  assert.equal(unsupported.host.children.length, 0);
});

test("adapter denial and shader rejection retain the already usable 2D surface", async () => {
  for (const scenario of [{ adapter: "null" }, { adapter: "reject" }, { pipeline: "reject" }]) {
    const gpu = fakeGpu(scenario),
      env = environment({ gpu: gpu.api });
    const control = env.mount(env.host);
    assert.equal(env.host.dataset.renderer, "2d");
    await flush();
    assert.equal(env.host.dataset.renderer, "2d");
    assert.equal(env.host.children.length, 1);
    if (scenario.pipeline) assert.equal(gpu.state.destroyed, 1);
    control.dispose();
  }
});

test("WebGPU is reported only after submission and device loss or error restores one 2D canvas", async () => {
  for (const error of [false, true]) {
    const gpu = fakeGpu(),
      env = environment({ gpu: gpu.api });
    const control = env.mount(env.host);
    await flush();
    assert.equal(env.host.dataset.renderer, "webgpu");
    assert.ok(gpu.state.submits > 0);
    if (error) gpu.error();
    else gpu.lost.resolve({ reason: "unknown" });
    await flush();
    assert.equal(env.host.dataset.renderer, "2d");
    assert.equal(env.host.children.length, 1);
    assert.equal(gpu.state.destroyed, 1);
    assert.equal(gpu.state.buffersDestroyed, 1);
    assert.equal(env.frames.size, 1);
    control.dispose();
  }
});

test("GPU deadline cleans a pending pipeline; late device resolution after dispose never attaches", async () => {
  const gpu = fakeGpu({ pipeline: "pending" }),
    env = environment({ gpu: gpu.api });
  const control = env.mount(env.host);
  await flush();
  env.expire();
  assert.equal(gpu.state.destroyed, 1);
  assert.equal(gpu.state.buffersDestroyed, 1);
  assert.equal(env.host.dataset.renderer, "2d");
  control.dispose();
  const late = deferred(),
    lateGpu = fakeGpu({ deviceWait: late }),
    lateEnv = environment({ gpu: lateGpu.api });
  const lateControl = lateEnv.mount(lateEnv.host);
  await flush();
  lateControl.dispose();
  late.resolve(lateGpu.device);
  await flush();
  assert.equal(lateGpu.state.destroyed, 1);
  assert.equal(lateEnv.host.children.length, 0);
  assert.equal(lateEnv.frames.size, 0);
  assert.equal(lateEnv.timers.size, 0);
});

test("pause, background and intersection suspend frames; reduced motion keeps a still", async () => {
  const env = environment(),
    control = env.mount(env.host);
  await flush();
  env.step();
  assert.equal(env.frames.size, 1);
  control.setPaused(true);
  assert.equal(env.frames.size, 0);
  control.setPaused(false);
  assert.equal(env.frames.size, 1);
  env.doc.hidden = true;
  env.doc.emit("visibilitychange");
  assert.equal(env.frames.size, 0);
  env.doc.hidden = false;
  env.doc.emit("visibilitychange");
  assert.equal(env.frames.size, 1);
  env.observers[1].fn([{ isIntersecting: false }]);
  assert.equal(env.frames.size, 0);
  control.dispose();
  for (const flag of [{ reduced: true }]) {
    const gpu = fakeGpu(),
      still = environment({ ...flag, gpu: gpu.api });
    const c = still.mount(still.host);
    await flush();
    still.step();
    assert.equal(still.frames.size, 0);
    assert.equal(gpu.state.requested, 0);
    c.pulse();
    assert.equal(still.frames.size, 0);
    c.dispose();
  }
  const saving = environment({ saveData: true, gpu: fakeGpu().api });
  saving.mount(saving.host);
  await flush();
  assert.ok(saving.frames.size > 0, "Save-Data does not downgrade a requested renderer");
});

test("HTML projection requires the new drawable API and marks capability only after real draw", () => {
  const unsupported = environment(),
    noop = unsupported.mountHtml(unsupported.host, { title: "World" });
  assert.equal(unsupported.host.children.length, 0);
  noop.dispose();
  const env = environment({ drawable: true }),
    control = env.mountHtml(env.host, { title: "World" });
  assert.equal(env.host.dataset.htmlCanvas, undefined);
  env.step();
  assert.equal(env.context.htmlDraws, 1);
  assert.equal(env.host.dataset.htmlCanvas, "drawable");
  const canvas = env.host.children[0];
  assert.equal(canvas.attrs.content, "drawable");
  assert.equal(canvas.children[0].attrs.drawable, "");
  control.setPaused(true);
  control.update({ title: "Dream" });
  env.step();
  assert.equal(env.context.htmlDraws, 1);
  control.setPaused(false);
  env.step();
  assert.equal(env.context.htmlDraws, 2);
  control.dispose();
  assert.equal(env.host.children.length, 0);
  assert.equal(env.countListeners(), 0);
  assert.equal(env.frames.size, 0);
});

test("HTML draw failure and missing paint event remove only the decorative projection", () => {
  for (const missingPaint of [false, true]) {
    const env = environment({ drawable: true });
    if (missingPaint) {
      const create = env.doc.createElement;
      env.doc.createElement = (tag) => {
        const node = create(tag);
        if (tag === "canvas") node.requestPaint = () => {};
        return node;
      };
    } else
      env.context.drawElementImage = () => {
        throw Error("unsupported drawable");
      };
    const link = env.doc.createElement("a");
    env.host.append(link);
    env.mountHtml(env.host, { title: "World" });
    env.step();
    env.expire();
    assert.equal(env.host.children.length, 1);
    assert.equal(env.host.children[0], link);
    assert.equal(env.host.dataset.htmlCanvas, undefined);
    assert.equal(env.frames.size, 0);
    assert.equal(env.countListeners(), 0);
  }
});
