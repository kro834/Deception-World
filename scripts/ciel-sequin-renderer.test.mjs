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
  assert.match(shaders.CIEL_SEQUIN_FRAGMENT, /vFace\s*<\s*-\.5/);
  assert.match(shaders.CIEL_SEQUIN_FRAGMENT, /uv=\(vWorld.xy-uImageRect.xy\)\/uImageRect.zw/);
});

test("closed back caps keep a continuous unrelit photo, while metal uses real normals and optional studio reflection", () => {
  assert.match(shaders.CIEL_SEQUIN_VERTEX, /attribute float aFace/);
  assert.match(shaders.CIEL_SEQUIN_VERTEX, /vFace=aFace/);
  const fragment = shaders.CIEL_SEQUIN_FRAGMENT;
  const photo = fragment.slice(
    fragment.indexOf("if(vFace<-.5)"),
    fragment.indexOf("vec3 n=normalize(vNormal)"),
  );
  assert.match(photo, /uv=\(vWorld.xy-uImageRect.xy\)\/uImageRect.zw/);
  assert.match(photo, /gl_FragColor=vec4\(photo,1\.\)/);
  assert.match(photo, /return;/);
  assert.doesNotMatch(photo, /diffuse|specular|fresnel|vLocal|pinDistance/);
  assert.doesNotMatch(fragment, /gl_FrontFacing\?front:back|n\+vec3\(vLocal/);
  assert.match(fragment, /if\(!gl_FrontFacing\)n=-n/);
  assert.match(fragment, /mix\(fallback,texture2D\(uStudio,uv,2\.\)\.rgb,uStudioReady\)/);
  assert.match(fragment, /fwidth\(groove\)/, "subpixel brushing fades instead of aliasing");
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
      assert.ok((g.cols - 1) * g.pitch >= w && (g.rows - 1) * g.rowPitch >= h);
      assert.ok(g.pitch >= (coarse ? 16 : 14));
      const hits = new Set();
      brushSequinGrid(g, 10, h / 2, w - 10, h / 2, 30, (i) => hits.add(i));
      assert.ok(hits.size > 0);
      const hitX = [...hits].map((i) => physics.sequinGridCenter(g, i, new Float64Array(2))[0]);
      assert.ok(
        Math.min(...hitX) <= g.pitch + 30 && Math.max(...hitX) >= w - g.pitch - 30,
        "swept capsule reaches the full stroke even on sparse huge-screen grids",
      );
      for (const i of hits) {
        const y = physics.sequinGridCenter(g, i, new Float64Array(2))[1];
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
    stats = { draws: 0, disposed: 0, lost: 0, images: 0, ellipses: [] };
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
              if (key === "ellipse") stats.ellipses.push(_args);
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
  const created = { gpu: null, image: null, images: [] };
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
      created.images.push(this);
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
    images: created.images,
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

test("pressed discs are watertight, outward-facing and truly bevelled within the indexed vertex budget", () => {
  for (const coarse of [false, true]) {
    const h = harness({ coarse });
    h.tick(0);
    const geometry = h.gpu.mesh.geometry,
      position = geometry.getAttribute("position"),
      normal = geometry.getAttribute("normal"),
      face = geometry.getAttribute("aFace"),
      wall = geometry.getAttribute("aWall");
    const index = geometry.index.array,
      edges = new Map();
    const point = (i) => new THREE.Vector3().fromBufferAttribute(position, i);
    const key = (i) =>
      point(i)
        .toArray()
        .map((value) => value.toFixed(6))
        .join(",");
    let volume = 0,
      bevel = 0;
    for (let i = 0; i < index.length; i += 3) {
      const ids = Array.from(index.slice(i, i + 3)),
        [a, b, c] = ids.map(point);
      const cross = b.clone().sub(a).cross(c.clone().sub(a));
      assert.ok(cross.length() > 1e-8, "no collapsed triangles");
      const averageNormal = ids.reduce(
        (sum, id) => sum.add(new THREE.Vector3().fromBufferAttribute(normal, id)),
        new THREE.Vector3(),
      );
      assert.ok(cross.dot(averageNormal) > 0, "winding agrees with outward normals");
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let j = 0; j < 3; j++) {
        const edge = [key(ids[j]), key(ids[(j + 1) % 3])].sort().join("/");
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
      assert.ok(
        ids.every((id) => face.getX(id) === face.getX(ids[0])),
        "physical face identity is constant per triangle",
      );
    }
    assert.ok(volume > 0.15, "the disc encloses actual thickness");
    const front = Array.from({ length: position.count }, (_, i) => i).filter(
      (i) => face.getX(i) === 1,
    );
    assert.ok(
      position.getZ(front[0]) < position.getZ(front[1]),
      "front centre is physically recessed inside its lip",
    );
    assert.ok(
      [...edges.values()].every((uses) => uses === 2),
      "every welded edge has exactly two incident triangles",
    );
    for (let i = 0; i < position.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(normal, i);
      assert.ok(Math.abs(n.length() - 1) < 1e-6);
      if (wall.getX(i) === 1 && Math.abs(n.z) > 0.05 && Math.abs(n.z) < 0.95) bevel++;
    }
    assert.ok(bevel >= (coarse ? 16 : 24) * 2, "rounded rim has genuine sloped geometry normals");
    assert.ok(position.count <= (coarse ? 130 : 194));
    assert.equal(index.length / 3, coarse ? 192 : 288);
    assert.equal(h.canvas.dataset.sequinDrawCalls, "1");
    h.api.dispose();
  }
});

test("hex packing has staggered equal neighbours and gap-free back-cap coverage through every viewport edge", () => {
  const center = new Float64Array(2);
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [834, 1194],
    [1194, 834],
    [1440, 900],
    [3840, 2160],
  ]) {
    for (const coarse of [true, false]) {
      const grid = physics.sequinGrid(width, height, coarse);
      const a = [...physics.sequinGridCenter(grid, grid.cols + 1, center)];
      const b = [...physics.sequinGridCenter(grid, 1, center)];
      assert.ok(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) - grid.pitch) < 1e-8);
      assert.ok(Math.abs(a[0] - b[0] - grid.pitch * 0.5) < 1e-8);
      const photoRadius =
        grid.pitch * physics.SEQUIN_RADIUS_RATIO * 0.94 * Math.cos(Math.PI / (coarse ? 16 : 24));
      for (let x = 0; x <= 50; x++)
        for (let y = 0; y <= 50; y++) {
          const px = (x * width) / 50,
            py = (y * height) / 50;
          const index = physics.sequinGridIndexAt(grid, px, py);
          physics.sequinGridCenter(grid, index, center);
          assert.ok(
            Math.hypot(center[0] - px, center[1] - py) <= photoRadius + 1e-7,
            `${width}x${height}: back cap covers ${px},${py}`,
          );
        }
      for (let i = 0; i < grid.count; i += 17) {
        physics.sequinGridCenter(grid, i, center);
        assert.equal(physics.sequinGridIndexAt(grid, center[0], center[1]), i);
        const hits = [];
        physics.brushSequinGrid(
          grid,
          center[0],
          center[1],
          center[0],
          center[1],
          grid.pitch * 0.1,
          (id) => hits.push(id),
        );
        assert.deepEqual(hits, [i], "brush hit-test uses the actual staggered centre");
      }
    }
  }
});

test("GPU centres and interactive fallback circles share the same packing, while resize retains local painted regions", () => {
  const h = harness({ coarse: true });
  h.tick(0);
  const original = physics.sequinGrid(320, 740, true);
  const center = new Float64Array(2),
    gpuCenters = h.gpu.mesh.geometry.getAttribute("aCenter");
  for (let i = 0; i < original.count; i++) {
    physics.sequinGridCenter(original, i, center);
    assert.ok(Math.abs(gpuCenters.getX(i) - center[0]) < 1e-4);
    assert.ok(Math.abs(gpuCenters.getY(i) - (740 - center[1])) < 1e-4);
  }
  assert.equal(
    h.gpu.mesh.material.uniforms.uRadius.value,
    original.pitch * physics.SEQUIN_RADIUS_RATIO,
  );
  h.pointer("pointerdown", 10, 240, { type: "touch" });
  h.pointer("pointermove", 190, 240, { type: "touch" });
  h.tick(100);
  const oldTargets = h.gpu.mesh.geometry.getAttribute("aMotion").array.slice();
  h.api.resize(834, 1194);
  h.tick(120);
  const resized = physics.sequinGrid(834, 1194, true),
    targets = h.gpu.mesh.geometry.getAttribute("aMotion").array;
  for (let i = 0; i < resized.count; i += 13) {
    physics.sequinGridCenter(resized, i, center);
    const old = physics.sequinGridIndexAt(
      original,
      (center[0] / 834) * 320,
      (center[1] / 1194) * 740,
    );
    assert.equal(targets[i * 4 + 2], oldTargets[old * 4 + 2]);
  }
  h.api.dispose();
  const fallback = harness({ coarse: true, reducedMotion: true });
  fallback.tick(0);
  assert.equal(fallback.stats.ellipses.length, original.count);
  for (let i = 0; i < original.count; i += 7) {
    physics.sequinGridCenter(original, i, center);
    const [x, y, rx, ry] = fallback.stats.ellipses[i];
    assert.deepEqual(
      [x, y, rx, ry],
      [
        center[0],
        center[1],
        original.pitch * physics.SEQUIN_RADIUS_RATIO,
        original.pitch * physics.SEQUIN_RADIUS_RATIO,
      ],
    );
  }
  fallback.api.setFace("back");
  fallback.load();
  fallback.tick(30);
  assert.equal(fallback.fallback.dataset.sequinBack, fallback.fallback.dataset.sequinCount);
  assert.equal(fallback.stats.images, 1, "full back paints the entire original image once");
  fallback.api.dispose();
});

test("brush fringe starts after the centre, while a moving reversal remains continuous", () => {
  assert.equal(physics.sequinBrushDelay(1), 0);
  assert.ok(physics.sequinBrushDelay(0.1) > physics.sequinBrushDelay(0.8));
  assert.ok(physics.sequinBrushDelay(-1) <= 0.065);
  const h = harness({ coarse: true });
  h.tick(0);
  h.pointer("pointerdown", 20, 300, { type: "touch" });
  h.pointer("pointermove", 250, 300, { type: "touch" });
  const motion = h.gpu.mesh.geometry.getAttribute("aMotion").array;
  const delays = [];
  for (let i = 0; i < motion.length; i += 4) if (motion[i + 2] > 1) delays.push(motion[i + 3]);
  assert.ok(Math.max(...delays) - Math.min(...delays) > 0.02);
  assert.ok(Math.max(...delays) <= 0.065);
  h.tick(130);
  const before = motion.slice();
  h.pointer("pointermove", 25, 300, { type: "touch" });
  let reversals = 0;
  for (let i = 0; i < motion.length; i += 4)
    if (before[i + 2] > 1 && motion[i + 2] === 0) {
      const sample = physics.sampleSequinSpring(
        before[i],
        before[i + 1],
        before[i + 2],
        0.13 - before[i + 3],
        new Float64Array(2),
      );
      assert.ok(Math.abs(motion[i] - sample[0]) < 1e-5);
      assert.ok(motion[i + 3] <= 0.130001, "active plates do not freeze behind a new brush delay");
      reversals++;
    }
  assert.ok(reversals > 0);
  h.tick(2200);
  assert.equal(h.queue.size, 0);
  h.api.dispose();
});

test("pointer lighting follows smoothly, keeps one RAF, and stops after settling", () => {
  const h = harness();
  h.tick(0);
  const light = h.gpu.mesh.material.uniforms.uLight.value,
    initial = light.clone();
  h.pointer("pointerdown", 310, 20, { type: "touch" });
  assert.ok(light.equals(initial), "an input event changes the target, not the displayed light");
  h.tick(16);
  const target = new THREE.Vector3(310, 720, 180);
  assert.ok(light.distanceTo(target) < initial.distanceTo(target));
  assert.ok(
    light.distanceTo(initial) < initial.distanceTo(target),
    "the first frame only moves part way",
  );
  assert.equal(h.queue.size, 1);
  h.tick(800);
  assert.equal(h.queue.size, 0);
  assert.ok(light.equals(target));
  h.api.dispose();
});

test("Blender studio reflection loads independently, wakes the surface, and releases on fallback or disposal", () => {
  const h = harness();
  h.tick(0);
  const studio = h.images.find((image) => image.src === "/ciel-sequin-studio-20261028/studio.webp");
  assert.ok(studio);
  assert.equal(h.images.length, 2);
  const uniforms = h.gpu.mesh.material.uniforms;
  assert.equal(uniforms.uStudioReady.value, 0);
  studio.onerror();
  assert.equal(uniforms.uStudioReady.value, 0);
  assert.equal(
    h.canvas.dataset.sequinState,
    "webgl",
    "optional map failure leaves procedural rendering usable",
  );
  studio.onload();
  assert.equal(uniforms.uStudioReady.value, 1);
  assert.equal(h.queue.size, 1);
  const texture = uniforms.uStudio.value;
  let releases = 0;
  texture.addEventListener("dispose", () => releases++);
  h.canvas.listeners.get("webglcontextlost")({ preventDefault() {} });
  assert.equal(releases, 1);
  assert.equal(uniforms.uStudioReady.value, 0);
  assert.equal(studio.onload, null);
  assert.equal(studio.onerror, null);
  assert.equal(h.fallback.dataset.sequinState, "fallback");
  h.api.dispose();
  for (const settings of [{ reducedMotion: true }, { economy: true }, { webgl: false }]) {
    const fallback = harness(settings);
    assert.equal(fallback.images.length, 1, "lightweight surfaces do not fetch the reflection map");
    fallback.api.dispose();
  }
  const early = harness(),
    lateLoad = early.images[0].onload;
  early.api.dispose();
  lateLoad();
  assert.equal(early.queue.size, 0);
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
