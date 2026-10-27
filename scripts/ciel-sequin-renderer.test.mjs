import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as THREE from "three";
import * as physics from "../src/lib/ciel-sequin-physics.ts";
import * as shaders from "../src/lib/ciel-sequin-shaders.ts";
import { guardCielSequinTouch } from "../src/lib/ciel-sequin-touch-guard.ts";
const {
  sampleSequinSpring,
  sequinGrid,
  sequinImageRect,
  brushSequinGrid,
  sequinStrokeTarget,
  SEQUIN_SPRING,
} = physics;
const source = readFileSync(new URL("../src/lib/ciel-sequin-renderer.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("GPU spring overshoots then settles; a mid-flight reversal starts with continuous angle and velocity", () => {
  const out = new Float64Array(2);
  let high = 0;
  for (let t = 0; t < 1.8; t += 0.005) {
    sampleSequinSpring(0, 0, Math.PI, t, out);
    high = Math.max(high, out[0]);
    assert.ok(Number.isFinite(out[0]));
  }
  assert.ok(high > Math.PI + 0.2);
  sampleSequinSpring(0, 0, Math.PI, 0.11, out);
  const [angle, velocity] = out;
  sampleSequinSpring(angle, velocity, 0, 0, out);
  assert.ok(Math.abs(out[0] - angle) < 1e-12);
  assert.ok(Math.abs(out[1] - velocity) < 1e-12);
  sampleSequinSpring(angle, velocity, 0, SEQUIN_SPRING.settle, out);
  assert.deepEqual([...out], [0, 0]);
  assert.match(shaders.CIEL_SEQUIN_VERTEX, /exp\(-d\*t\).*a\*cos\(w\*t\)/);
  assert.match(shaders.CIEL_SEQUIN_FRAGMENT, /gl_FrontFacing\?front:back/);
  assert.match(shaders.CIEL_SEQUIN_FRAGMENT, /uv=\(vWorld.xy-uImageRect.xy\)\/uImageRect.zw/);
});

test("bounded grids, swept strokes and opposite directions work at phone, tablet and desktop widths", () => {
  for (const [w, h] of [
    [320, 740],
    [834, 1194],
    [1194, 834],
    [1440, 900],
    [3840, 2160],
  ])
    for (const coarse of [true, false]) {
      const g = sequinGrid(w, h, coarse);
      assert.ok(g.count <= (coarse ? 6200 : 14000));
      assert.ok(g.cols * g.pitch >= w && g.rows * g.pitch >= h);
      const hits = new Set();
      brushSequinGrid(g, 10, h / 2, w - 10, h / 2, 30, (i) => hits.add(i));
      assert.ok(hits.size > g.cols);
      for (const i of hits) {
        const y = (Math.floor(i / g.cols) + 0.5) * g.pitch;
        assert.ok(Math.abs(y - h / 2) < 30);
      }
    }
  assert.equal(sequinStrokeTarget(5, 0), Math.PI);
  assert.equal(sequinStrokeTarget(-5, 0), 0);
  assert.equal(sequinStrokeTarget(0, -5), Math.PI);
  assert.equal(sequinStrokeTarget(0, 5), 0);
});

test("cover fills the viewport with an upper focal point; contain includes the entire unmirrored source", () => {
  for (const [w, h] of [
    [320, 740],
    [834, 1194],
    [1194, 834],
    [1440, 900],
  ]) {
    const cover = sequinImageRect(w, h, 768, 1024, "cover");
    assert.ok(cover.width >= w && cover.height >= h);
    const face = cover.y + cover.height * 0.42;
    assert.ok(face >= 0 && face <= h);
    const all = sequinImageRect(w, h, 768, 1024, "contain");
    assert.ok(all.x >= 0 && all.y >= 0);
    assert.ok(all.width <= w + 1e-8 && all.height <= h + 1e-8);
    assert.equal((all.x + all.width - all.x) / all.width, 1);
  }
});

function harness({ webgl = true, coarse = false, reducedMotion = false, economy = false } = {}) {
  let now = 0,
    id = 0;
  const queue = new Map(),
    states = [],
    stats = { draws: 0, disposed: 0, lost: 0, images: 0 };
  const surface = () => ({
    dataset: {},
    style: {},
    hidden: false,
    width: 320,
    height: 740,
    clientWidth: 320,
    clientHeight: 740,
    listeners: new Map(),
    addEventListener(name, fn) {
      this.listeners.set(name, fn);
    },
    removeEventListener(name) {
      this.listeners.delete(name);
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight };
    },
    setPointerCapture() {},
    getContext() {
      return context2d;
    },
  });
  const context2d = new Proxy(
    {},
    {
      get(target, key) {
        return key in target
          ? target[key]
          : (..._args) => {
              if (key === "drawImage") stats.images++;
            };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  const canvas = surface(),
    fallback = surface(),
    document = {
      hidden: false,
      listeners: new Map(),
      addEventListener(name, fn) {
        this.listeners.set(name, fn);
      },
      removeEventListener(name) {
        this.listeners.delete(name);
      },
    };
  const created = { gpu: null, image: null };
  class Renderer {
    constructor() {
      if (!webgl) throw new Error("no GL");
      this.debug = {};
      created.gpu = this;
    }
    getContext() {
      return { isContextLost: () => false };
    }
    setClearColor() {}
    setPixelRatio(value) {
      this.ratio = value;
    }
    setSize(w, h) {
      this.width = w;
      this.height = h;
    }
    render(scene) {
      stats.draws++;
      this.mesh = scene.children[0];
    }
    dispose() {
      stats.disposed++;
    }
    forceContextLoss() {
      stats.lost++;
    }
  }
  class Image {
    constructor() {
      created.image = this;
      this.naturalWidth = 768;
      this.naturalHeight = 1024;
    }
    removeAttribute() {}
  }
  const runtime = {
    exports: {},
    document,
    Image,
    devicePixelRatio: 3,
    performance: { now: () => now },
    requestAnimationFrame(fn) {
      queue.set(++id, fn);
      return id;
    },
    cancelAnimationFrame(key) {
      queue.delete(key);
    },
    require(name) {
      if (name === "three") return { ...THREE, WebGLRenderer: Renderer };
      if (name.includes("physics")) return physics;
      if (name.includes("shaders")) return shaders;
      throw Error(name);
    },
  };
  runInNewContext(compiled, runtime);
  const api = runtime.exports.createCielSequinRenderer({
    canvas,
    fallback,
    imageUrl: "/test.webp",
    coarse,
    reducedMotion,
    economy,
    onState: (s) => states.push(s),
  });
  return {
    remount(settings) {
      return runtime.exports.createCielSequinRenderer({
        canvas,
        fallback,
        imageUrl: "/test.webp",
        ...settings,
      });
    },
    api,
    canvas,
    fallback,
    document,
    queue,
    states,
    stats,
    get gpu() {
      return created.gpu;
    },
    tick(ms) {
      now = ms;
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((fn) => fn(now));
    },
    load() {
      created.image.onload();
    },
    pointer(name, x, y, { target = canvas, type = "mouse", pointerId = 1 } = {}) {
      target.listeners.get(name)?.({
        currentTarget: target,
        clientX: x,
        clientY: y,
        pointerId,
        pointerType: type,
        button: 0,
        preventDefault() {},
      });
    },
  };
}

test("one instanced draw, local strokes, repeated retargets and complete reversal remain bounded", () => {
  const h = harness();
  h.load();
  h.tick(0);
  assert.equal(h.gpu.mesh.geometry.type, "InstancedBufferGeometry");
  assert.equal(h.canvas.dataset.sequinDrawCalls, "1");
  assert.equal(h.canvas.dataset.sequinBack, "0");
  h.pointer("pointerdown", 30, 330);
  h.pointer("pointermove", 240, 330);
  h.tick(20);
  const count = Number(h.canvas.dataset.sequinCount),
    first = Number(h.canvas.dataset.sequinBack);
  assert.ok(first > 0 && first < count / 3);
  h.pointer("pointermove", 260, 330);
  h.tick(40);
  assert.ok(Number(h.canvas.dataset.sequinBack) <= count);
  h.api.setFace("back");
  h.tick(50);
  assert.equal(Number(h.canvas.dataset.sequinBack), count);
  h.api.setFace("back");
  h.tick(60);
  assert.equal(Number(h.canvas.dataset.sequinBack), count);
  const motion = h.gpu.mesh.geometry.getAttribute("aMotion").array.slice();
  h.tick(200);
  assert.deepEqual(
    h.gpu.mesh.geometry.getAttribute("aMotion").array,
    motion,
    "GPU alone advances angles; no per-frame instance writes",
  );
  h.api.setFace("front");
  h.tick(250);
  assert.equal(h.canvas.dataset.sequinBack, "0");
  h.tick(2100);
  assert.equal(h.queue.size, 0, "settled render loop sleeps");
  h.api.dispose();
  assert.equal(h.stats.disposed, 1);
});

test("fine mouse hover brushes, leaving the canvas prevents a bridge across controls, touch requires contact", () => {
  const h = harness();
  h.tick(0);
  h.pointer("pointermove", 20, 200);
  assert.equal(h.canvas.dataset.sequinBack, "0");
  h.pointer("pointermove", 150, 200);
  assert.ok(Number(h.canvas.dataset.sequinBack) > 0);
  const before = h.canvas.dataset.sequinBack;
  h.pointer("pointerleave", 150, 200);
  h.pointer("pointermove", 300, 600);
  assert.equal(h.canvas.dataset.sequinBack, before);
  h.api.dispose();
  const touch = harness({ coarse: true });
  touch.tick(0);
  touch.pointer("pointermove", 20, 100, { type: "touch" });
  touch.pointer("pointermove", 290, 100, { type: "touch" });
  assert.equal(touch.canvas.dataset.sequinBack, "0");
  touch.api.dispose();
});

test("resize retains the revealed face; pause freezes the GPU clock and disposal removes every listener", () => {
  const h = harness();
  h.load();
  h.tick(0);
  h.api.setFace("back");
  h.tick(100);
  h.api.setPaused(true);
  assert.equal(h.queue.size, 0);
  h.tick(5100);
  h.api.setPaused(false);
  h.tick(5110);
  assert.ok(h.gpu.mesh.material.uniforms.uTime.value < 0.2);
  h.api.resize(834, 1194);
  h.tick(5120);
  assert.equal(h.canvas.dataset.sequinBack, h.canvas.dataset.sequinCount);
  h.api.setImageFit("contain");
  h.tick(5130);
  const rect = h.gpu.mesh.material.uniforms.uImageRect.value;
  assert.ok(rect.x >= 0 && rect.y >= 0);
  h.api.dispose();
  h.api.dispose();
  assert.equal(h.queue.size, 0);
  assert.equal(h.canvas.listeners.size, 0);
  assert.equal(h.fallback.listeners.size, 0);
  assert.equal(h.document.listeners.size, 0);
});

test("context loss preserves painted cells in interactive 2D; reduced/economy/GL-failure remain usable", () => {
  const h = harness();
  h.load();
  h.tick(0);
  h.api.setFace("back");
  const back = h.canvas.dataset.sequinBack;
  h.canvas.listeners.get("webglcontextlost")({ preventDefault() {} });
  h.tick(50);
  assert.equal(h.canvas.hidden, true);
  assert.equal(h.fallback.hidden, false);
  assert.equal(h.fallback.dataset.sequinBack, back);
  assert.ok(h.stats.images > 0);
  h.api.setFace("front");
  h.tick(60);
  assert.equal(h.fallback.dataset.sequinBack, "0");
  h.api.dispose();
  for (const settings of [{ reducedMotion: true }, { economy: true }, { webgl: false }]) {
    const f = harness(settings);
    f.load();
    f.tick(0);
    assert.equal(f.fallback.dataset.sequinState, "fallback");
    f.pointer("pointerdown", 30, 300, { target: f.fallback, type: "touch" });
    f.pointer("pointermove", 250, 300, { target: f.fallback, type: "touch" });
    f.tick(10);
    assert.ok(Number(f.fallback.dataset.sequinBack) > 0);
    assert.equal(f.queue.size, 0);
    f.api.dispose();
  }
});

test("full to calm to full can reuse the same canvas without deliberate context loss", () => {
  const h = harness();
  h.tick(0);
  h.api.dispose();
  for (let i = 0; i < 3; i++) {
    const calm = h.remount({ reducedMotion: true });
    h.tick(100 + i * 100);
    assert.equal(h.fallback.dataset.sequinState, "fallback");
    calm.dispose();
    const full = h.remount({});
    h.tick(150 + i * 100);
    assert.equal(h.canvas.dataset.sequinState, "webgl");
    assert.equal(h.canvas.hidden, false);
    full.dispose();
  }
  assert.equal(h.stats.lost, 0);
  assert.equal(h.canvas.listeners.size, 0);
  assert.equal(h.queue.size, 0);
});

test("edge touch cancellation leaves delivered touch pointers painting in GPU and calm fallback modes", () => {
  for (const settings of [
    { coarse: true },
    { coarse: true, reducedMotion: true },
    { coarse: true, webgl: false },
  ]) {
    const h = harness(settings);
    h.load();
    h.tick(0);
    const surface = settings.reducedMotion || settings.webgl === false ? h.fallback : h.canvas;
    surface.ownerDocument = { defaultView: { innerWidth: 320 } };
    const release = guardCielSequinTouch(surface);
    const sample = (type, x) => {
      let prevented = false;
      surface.listeners.get(type)({
        touches: [{ identifier: 1, clientX: x }],
        cancelable: true,
        preventDefault() {
          prevented = true;
        },
      });
      assert.equal(prevented, true);
    };
    sample("touchstart", 2);
    h.pointer("pointerdown", 2, 300, { target: surface, type: "touch" });
    sample("touchmove", 250);
    h.pointer("pointermove", 250, 300, { target: surface, type: "touch" });
    h.tick(30);
    assert.ok(
      Number(surface.dataset.sequinBack) > 0,
      "delivered touch Pointer Events still reveal local cells",
    );
    release();
    h.api.dispose();
    assert.equal(surface.listeners.size, 0);
  }
});
