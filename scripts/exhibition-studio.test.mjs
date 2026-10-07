import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as three from "three";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compiled = (path) =>
  ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;

function load(path, dependencies = {}, globals = {}) {
  const context = vm.createContext({
    exports: {},
    console,
    AbortController,
    DOMException,
    Uint8Array,
    require: (name) =>
      Object.hasOwn(dependencies, name)
        ? dependencies[name]
        : name === "three"
          ? three
          : require(name),
    ...globals,
  });
  vm.runInContext(compiled(path), context, { filename: path });
  return context.exports;
}

const geometry = load("src/lib/exhibition-studio-geometry.ts");
const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const imageSizes = [
  [1536, 1024],
  [1024, 1536],
  [900, 900],
  [4000, 500],
  [500, 4000],
];

test("Cycles production assets and reviewed scene match their generator and unchanged source bytes", () => {
  const hash = (path) =>
    createHash("sha256")
      .update(readFileSync(new URL(`../${path}`, import.meta.url)))
      .digest("hex");
  const runtime = JSON.parse(read("public/exhibition-studio/manifest.json"));
  const review = JSON.parse(read("design/exhibition-studio-v3/manifest.json"));
  assert.equal(runtime.generatorSha256, hash(runtime.generator));
  assert.equal(review.generatorSha256, hash(review.generator));
  assert.equal(runtime.engine, "CYCLES");
  assert.equal(runtime.sourceArtworkUnchanged, true);
  assert.equal(runtime.probe.artworkBakedIntoEnvironment, false);
  assert.ok(runtime.probe.excludedObjects.includes("Original_artwork_on_archival_print"));
  assert.ok(runtime.probe.maximumLinearRadiance > 1);
  assert.equal(runtime.probe.sha256, hash(`public/exhibition-studio/${runtime.probe.file}`));
  for (const [name, asset] of Object.entries(runtime.maps)) {
    assert.equal(asset.sha256, hash(`public/exhibition-studio/${name}`));
    assert.equal(asset.colorSpace, "linear");
  }
  assert.equal(review.sourceArtwork.sha256Before, review.sourceArtwork.sha256After);
  assert.equal(review.sourceArtwork.sha256After, hash(review.sourceArtwork.path));
  for (const output of [...Object.values(review.outputs), review.blend]) {
    assert.equal(output.sha256, hash(`design/exhibition-studio-v3/${output.file}`));
  }
});

test("the immersive room only accepts known artwork IDs, never a supplied texture URL", () => {
  const { Route } = load("src/routes/exhibition.tsx", {
    "@tanstack/react-router": { createFileRoute: () => (config) => config, Link() {} },
    "@/components/gallery/gallery-data": { GALLERY_ARTWORKS: [{ id: "g19" }, { id: "g80" }] },
    "@/components/ultra/exhibition-studio": { ExhibitionStudio() {} },
    "@/lib/use-ultra-artwork-ready": { useUltraArtworkReady() {} },
    "@/lib/world-head": { createWorldHead: (head) => head, WORLD_CORE_STYLESHEET_LINKS: [] },
    "@/styles-exhibition-studio.css?url": "studio.css",
  });
  assert.equal(Route.validateSearch({ work: "g19" }).work, "g19");
  assert.equal(Route.validateSearch({ work: "g80" }).work, "g80");
  for (const work of [
    undefined,
    "unknown",
    "https://example.com/secret.png",
    "../../secret",
    ["g19"],
  ]) {
    assert.equal(Route.validateSearch({ work }).work, undefined);
  }
});

test("physical print dimensions preserve every source aspect, with consistent metre-scale mount materials", () => {
  for (const [width, height] of imageSizes) {
    const d = geometry.getExhibitionDimensions(width, height);
    near(d.printWidth / d.printHeight, width / height);
    near(Math.max(d.printWidth, d.printHeight), 1.65);
    near(d.innerWidth - d.printWidth, d.matBorder * 2);
    near(d.innerHeight - d.printHeight, d.matBorder * 2);
    near(d.outerWidth - d.innerWidth, d.railWidth * 2);
    near(d.outerHeight - d.innerHeight, d.railWidth * 2);
    assert.ok(d.frameDepth > d.glassThickness && d.wallGap > 0);
    assert.ok(d.frameBevel > 0 && d.frameBevel < d.railWidth);
  }
  for (const [width, height] of [
    [0, 100],
    [100, 0],
    [-1, 100],
    [NaN, 2],
    [2, Infinity],
  ]) {
    assert.throws(
      () => geometry.getExhibitionDimensions(width, height),
      /positive artwork dimensions/,
    );
  }
});

test("frame rails have true extruded depth and keep all original image corners unobstructed", () => {
  const material = new three.MeshBasicMaterial({ side: three.DoubleSide });
  for (const [width, height] of imageSizes) {
    const d = geometry.getExhibitionDimensions(width, height);
    const rails = geometry.createMiteredFrameGeometry(d);
    assert.equal(rails.length, 4);
    const meshes = rails.map((rail) => {
      rail.computeBoundingBox();
      near(rail.boundingBox.max.z - rail.boundingBox.min.z, d.frameDepth);
      assert.ok(
        rail.getAttribute("position").count > 24,
        "a bevelled solid, not one flat rectangle",
      );
      const mesh = new three.Mesh(rail, material);
      mesh.updateMatrixWorld();
      return mesh;
    });
    for (const x of [-d.printWidth / 2, 0, d.printWidth / 2]) {
      for (const y of [-d.printHeight / 2, 0, d.printHeight / 2]) {
        const ray = new three.Raycaster(new three.Vector3(x, y, 1), new three.Vector3(0, 0, -1));
        assert.equal(
          ray.intersectObjects(meshes).length,
          0,
          "rails must not cover any print corner/edge/centre",
        );
      }
    }
    const railRay = new three.Raycaster(
      new three.Vector3(0, (d.innerHeight + d.outerHeight) / 4, 1),
      new three.Vector3(0, 0, -1),
    );
    assert.ok(railRay.intersectObjects(meshes).length > 0, "the top rail is real geometry");
    rails.forEach((rail) => rail.dispose());
  }
  material.dispose();
});

test("cotton mount contains a genuine aperture, including a clearance around the entire original", () => {
  const material = new three.MeshBasicMaterial({ side: three.DoubleSide });
  for (const [width, height] of imageSizes) {
    const d = geometry.getExhibitionDimensions(width, height);
    const mat = geometry.createCottonMatGeometry(d);
    const mesh = new three.Mesh(mat, material);
    mesh.updateMatrixWorld();
    for (const x of [-d.printWidth / 2, 0, d.printWidth / 2]) {
      for (const y of [-d.printHeight / 2, 0, d.printHeight / 2]) {
        const ray = new three.Raycaster(new three.Vector3(x, y, 1), new three.Vector3(0, 0, -1));
        assert.equal(ray.intersectObject(mesh).length, 0, "bevel must not intrude onto print");
      }
    }
    const border = new three.Raycaster(
      new three.Vector3(0, (d.printHeight + d.innerHeight) / 4, 1),
      new three.Vector3(0, 0, -1),
    );
    assert.ok(border.intersectObject(mesh).length > 0);
    mat.dispose();
  }
  material.dispose();
});

test("pure camera fit retains complete portrait, panoramic, square and landscape mounts from both angles", () => {
  for (const [width, height] of imageSizes) {
    const d = geometry.getExhibitionDimensions(width, height);
    for (const [vw, vh] of [
      [400, 800],
      [800, 600],
      [1600, 400],
      [600, 600],
    ]) {
      for (const view of ["front", "oblique", "room"]) {
        const fit = geometry.getExhibitionCamera(d, vw, vh, view);
        const camera = new three.PerspectiveCamera(fit.fov, fit.aspect, 0.025, 40);
        camera.position.fromArray(fit.position);
        camera.lookAt(new three.Vector3(...fit.target));
        camera.updateMatrixWorld();
        for (const x of [-d.outerWidth / 2, d.outerWidth / 2]) {
          for (const y of [
            d.centreHeight - d.outerHeight / 2,
            d.centreHeight + d.outerHeight / 2,
          ]) {
            for (const z of [d.wallGap, d.wallGap + d.frameDepth]) {
              const projected = new three.Vector3(x, y, z).project(camera);
              assert.ok(
                Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1,
                `${width}×${height}: ${view} fits ${vw}×${vh}`,
              );
            }
          }
        }
      }
    }
  }
});

function runtimeFixture({
  sourceFailure = false,
  mapFailure = false,
  decodeDeferred = false,
  renderFailure = false,
  devicePixelRatio = 3,
  quality = "cinema",
} = {}) {
  const calls = {
    fetch: [],
    render: 0,
    dispose: 0,
    contextLoss: 0,
    targetDispose: 0,
    closed: 0,
    errors: [],
  };
  const frames = new Map();
  const statuses = [];
  const canvas = new EventTarget();
  const listeners = new Map();
  canvas.addEventListener = (name, fn) => listeners.set(name, fn);
  canvas.removeEventListener = (name, fn) => {
    if (listeners.get(name) === fn) listeners.delete(name);
  };
  let rect = { width: 800, height: 600 };
  canvas.getBoundingClientRect = () => rect;
  let lastScene;
  let lastCamera;
  let resolveDecode;
  const pendingDecode = new Promise((resolve) => {
    resolveDecode = resolve;
  });
  let frameId = 0;
  class Renderer {
    shadowMap = {};
    capabilities = { getMaxAnisotropy: () => 16 };
    info = { memory: { geometries: 0, textures: 0 } };
    setPixelRatio() {}
    setSize() {}
    render(scene, camera) {
      if (renderFailure) throw new Error("fixture draw failed");
      calls.render++;
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      lastScene = scene;
      lastCamera = camera;
    }
    dispose() {
      calls.dispose++;
    }
    forceContextLoss() {
      calls.contextLoss++;
    }
  }
  const api = load(
    "src/lib/exhibition-studio-renderer.ts",
    {
      three: {
        ...three,
        WebGLRenderer: Renderer,
        PMREMGenerator: class {
          fromScene() {
            return {
              texture: new three.Texture(),
              dispose() {
                calls.targetDispose++;
              },
            };
          }
          fromEquirectangular() {
            return {
              texture: new three.Texture(),
              dispose() {
                calls.targetDispose++;
              },
            };
          }
          dispose() {}
        },
      },
      "./exhibition-studio-geometry": geometry,
      "three/examples/jsm/environments/RoomEnvironment.js": {
        RoomEnvironment: class {
          dispose() {}
        },
      },
      "three/examples/jsm/lights/RectAreaLightUniformsLib.js": {
        RectAreaLightUniformsLib: { init() {} },
      },
      "three/examples/jsm/loaders/HDRLoader.js": {
        HDRLoader: class {
          createDataTexture() {
            return new three.Texture();
          }
        },
      },
    },
    {
      console: { error: (...args) => calls.errors.push(args) },
      window: { devicePixelRatio },
      requestAnimationFrame(fn) {
        frames.set(++frameId, fn);
        return frameId;
      },
      cancelAnimationFrame(id) {
        frames.delete(id);
      },
      async fetch(url, options) {
        calls.fetch.push({ url, options });
        return {
          ok: !(url === "/unchanged-original.webp" ? sourceFailure : mapFailure),
          status: 404,
          blob: async () => ({ url }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      },
      async createImageBitmap(blob) {
        if (decodeDeferred && blob.url === "/unchanged-original.webp") await pendingDecode;
        return {
          width: 1536,
          height: 1024,
          close() {
            calls.closed++;
          },
        };
      },
    },
  );
  return {
    calls,
    frames,
    statuses,
    listeners,
    canvas,
    resolveDecode,
    scene: () => lastScene,
    camera: () => lastCamera,
    setRect(next) {
      rect = next;
    },
    flushFrames() {
      const next = [...frames.values()];
      frames.clear();
      next.forEach((fn) => fn());
    },
    create(signal) {
      return api.createExhibitionStudio(canvas, {
        artworkUrl: "/unchanged-original.webp",
        artworkWidth: 100,
        artworkHeight: 100,
        quality,
        signal,
        onStatus: (status) => statuses.push(status),
      });
    },
  };
}

test("renderer uses the unchanged decoded source with full UVs, real wall contact, glass and physical lighting", async () => {
  const f = runtimeFixture();
  const renderer = await f.create();
  assert.deepEqual(f.statuses, ["loading", "ready"]);
  const scene = f.scene();
  const print = scene.getObjectByName("uncropped-original-artwork-print");
  near(print.geometry.parameters.width / print.geometry.parameters.height, 1.5);
  assert.equal(
    print.material.toneMapped,
    false,
    "source artwork is not re-graded through scene tone mapping",
  );
  assert.equal(print.material.map.colorSpace, three.SRGBColorSpace);
  const uvs = print.geometry.getAttribute("uv");
  assert.deepEqual([...new Set(uvs.array)].sort(), [0, 1]);
  const getZ = (name) => scene.getObjectByName(name).getWorldPosition(new three.Vector3()).z;
  assert.ok(getZ("lime-plaster-wall") < getZ("archival-backing-board"));
  assert.ok(getZ("archival-backing-board") < getZ("uncropped-original-artwork-print"));
  assert.ok(
    getZ("uncropped-original-artwork-print") < getZ("separate-low-reflection-museum-glass"),
  );
  assert.ok(scene.getObjectByName("honed-stone-floor"));
  assert.ok(scene.getObjectByName("ceiling-lighting-track"));
  const all = [];
  scene.traverse((object) => all.push(object));
  assert.ok(all.some((object) => object.isDirectionalLight && object.castShadow));
  assert.ok(all.some((object) => object.isRectAreaLight));
  assert.equal(all.filter((object) => object.name === "hidden-wall-spacer").length, 4);
  assert.equal(f.calls.fetch[0].url, "/unchanged-original.webp");
  assert.equal(
    renderer.getDiagnostics().artworkAspect,
    1.5,
    "decoded image dimensions override stale caller metadata",
  );
  assert.equal(renderer.getDiagnostics().environment, "blender-studio-hdr");
  renderer.dispose();
});

test("glass supersampling preserves fine artwork on 1x screens while bounding GPU allocations", async () => {
  for (const [quality, expectedRatio, budget] of [
    ["high", 2, 8_000_000],
    ["cinema", 3, 16_000_000],
  ]) {
    const f = runtimeFixture({ devicePixelRatio: 1, quality });
    const renderer = await f.create();
    assert.equal(renderer.getDiagnostics().pixelRatio, expectedRatio);
    f.setRect({ width: 4000, height: 3000 });
    renderer.resize();
    const info = renderer.getDiagnostics();
    assert.ok(info.width * info.height * info.pixelRatio ** 2 <= budget + 1);
    renderer.dispose();
  }
});

test("all camera angles keep all outer frame corners within portrait, square and landscape viewports", async () => {
  const f = runtimeFixture();
  const renderer = await f.create();
  const d = renderer.getDiagnostics().frame;
  for (const rect of [
    { width: 800, height: 600 },
    { width: 400, height: 800 },
    { width: 1600, height: 400 },
    { width: 600, height: 600 },
  ]) {
    f.setRect(rect);
    renderer.resize();
    for (const view of ["front", "oblique", "room"]) {
      renderer.setView(view);
      f.flushFrames();
      for (const x of [-d.outerWidth / 2, d.outerWidth / 2]) {
        for (const y of [d.centreHeight - d.outerHeight / 2, d.centreHeight + d.outerHeight / 2]) {
          for (const z of [d.wallGap, d.wallGap + d.frameDepth]) {
            const projected = new three.Vector3(x, y, z).project(f.camera());
            assert.ok(
              Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1,
              `${view}: full frame fits ${rect.width}×${rect.height}`,
            );
          }
        }
      }
    }
  }
  renderer.dispose();
});

test("on-demand renderer coalesces changes, pauses, restores context and releases each allocation once", async () => {
  const f = runtimeFixture();
  const renderer = await f.create();
  assert.equal(f.calls.render, 1);
  assert.equal(f.frames.size, 0, "no idle render loop");
  renderer.setView("oblique");
  renderer.resize();
  renderer.resume();
  assert.equal(f.frames.size, 1);
  renderer.pause();
  assert.equal(f.frames.size, 0);
  renderer.resize();
  assert.equal(f.frames.size, 0, "offscreen resize does not schedule drawing");
  renderer.resume();
  f.flushFrames();
  assert.equal(f.calls.render, 2);
  assert.equal(f.frames.size, 0);
  let prevented = false;
  f.listeners.get("webglcontextlost")({
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(f.statuses.at(-1), "context-lost");
  renderer.resume();
  assert.equal(f.frames.size, 0);
  f.listeners.get("webglcontextrestored")();
  f.flushFrames();
  assert.equal(f.statuses.at(-1), "ready");
  renderer.dispose();
  renderer.dispose();
  renderer.resize();
  renderer.resume();
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.calls.dispose, 1);
  assert.equal(f.calls.contextLoss, 1);
  assert.equal(
    f.calls.targetDispose,
    2,
    "context restoration replaces and disposes the earlier PMREM target",
  );
  assert.equal(f.calls.closed, f.calls.fetch.filter(({ url }) => !url.endsWith(".hdr")).length);
});

test("late image decode after abort is closed, never rendered, and never reports readiness", async () => {
  const f = runtimeFixture({ decodeDeferred: true });
  const controller = new AbortController();
  const pending = f.create(controller.signal);
  await Promise.resolve();
  controller.abort();
  f.resolveDecode();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(f.calls.closed, 1);
  assert.equal(f.calls.render, 0);
  assert.equal(f.calls.dispose, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.statuses.includes("ready"), false);
});

test("optional material map failures remain usable; source or draw failures clean up for original-image fallback", async () => {
  const optional = runtimeFixture({ mapFailure: true });
  const rendered = await optional.create();
  assert.equal(optional.statuses.at(-1), "ready");
  assert.equal(rendered.getDiagnostics().environment, "room-fallback");
  rendered.dispose();
  for (const options of [{ sourceFailure: true }, { renderFailure: true }]) {
    const f = runtimeFixture(options);
    await assert.rejects(f.create());
    assert.equal(f.statuses.includes("ready"), false);
    assert.equal(f.statuses.at(-1), "error");
    assert.equal(f.calls.dispose, 1);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.frames.size, 0);
  }
});

test("SSR and disabled/accessibility/unready states preserve original link without loading Three or reading browser globals", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  for (const state of [
    { enabled: false, motionAllowed: false },
    { enabled: true, motionAllowed: false },
    { enabled: true, motionAllowed: true, unready: true },
  ]) {
    const module = load("src/components/ultra/exhibition-studio.tsx", {
      "@/lib/ultra-mode.js": {
        subscribeUltraMode() {},
        getUltraModeSnapshot: () => state,
        getUltraModeServerSnapshot: () => state,
      },
      "@/lib/ultra-quality.js": {
        subscribeUltraQuality() {},
        getUltraQualitySnapshot: () => ({ quality: "high" }),
        getUltraQualityServerSnapshot: () => ({ quality: "high" }),
      },
      "@/lib/ultra-mode-visibility.js": {
        isUltraSceneBlocked: () => false,
        watchUltraSceneVisibility() {},
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(
        module.ExhibitionStudio,
        {
          artworkUrl: "/unchanged-original.webp",
          artworkWidth: 1536,
          artworkHeight: 1024,
          artworkReady: !state.unready,
        },
        React.createElement("a", { href: "/unchanged-original.webp" }, "原画を拡大"),
      ),
    );
    assert.equal(html, '<a href="/unchanged-original.webp">原画を拡大</a>');
  }
});

const flushPromises = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

function componentFixture({ deferAllocation = false, failAllocation = false } = {}) {
  let cursor = 0;
  let blocked = false;
  let tree;
  let visibility;
  let resolveAllocation;
  const deferred = new Promise((resolve) => {
    resolveAllocation = resolve;
  });
  const state = [];
  const refs = [];
  const effects = [];
  const pending = new Set();
  const observations = [];
  const calls = {
    imported: 0,
    allocated: 0,
    pause: 0,
    resume: 0,
    dispose: 0,
    resize: 0,
    stopVisibility: 0,
    views: [],
  };
  const renderer = {
    pause() {
      calls.pause++;
    },
    resume() {
      calls.resume++;
    },
    dispose() {
      calls.dispose++;
    },
    resize() {
      calls.resize++;
    },
    setView(view) {
      calls.views.push(view);
    },
    getDiagnostics() {
      return { environment: "blender-studio-hdr" };
    },
  };
  const host = { dataset: {} };
  const canvas = {};
  let allocatedOptions;
  const jsx = (type, props) => ({ type, props });
  const react = {
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [
        state[index],
        (value) => {
          state[index] = typeof value === "function" ? value(state[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (refs[index] ||= { current: initial });
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!effects[index] || deps.some((value, offset) => effects[index].deps[offset] !== value)) {
        effects[index] = { callback, deps, cleanup: effects[index]?.cleanup };
        pending.add(index);
      }
    },
  };
  const observer = () =>
    class {
      disconnected = false;
      constructor(callback) {
        this.callback = callback;
        observations.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    };
  const module = load(
    "src/components/ultra/exhibition-studio.tsx",
    {
      react,
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@/lib/ultra-mode.js": {
        subscribeUltraMode() {},
        getUltraModeSnapshot: () => ({ enabled: true, motionAllowed: true }),
        getUltraModeServerSnapshot() {},
      },
      "@/lib/ultra-quality.js": {
        subscribeUltraQuality() {},
        getUltraQualitySnapshot: () => ({ quality: "high" }),
        getUltraQualityServerSnapshot() {},
      },
      "@/lib/ultra-mode-visibility.js": {
        isUltraSceneBlocked: () => blocked,
        watchUltraSceneVisibility(callback) {
          visibility = callback;
          return () => {
            calls.stopVisibility++;
          };
        },
      },
      "@/lib/exhibition-studio-renderer": {
        async createExhibitionStudio(_canvas, options) {
          calls.imported++;
          calls.allocated++;
          allocatedOptions = options;
          if (deferAllocation) await deferred;
          if (failAllocation) throw new Error("fixture allocation failed");
          options.onStatus("ready");
          return renderer;
        },
      },
    },
    { document: {}, ResizeObserver: observer(), IntersectionObserver: observer() },
  );
  const walk = (node, visit) => {
    if (!node || typeof node !== "object") return;
    visit(node);
    const children = node.props?.children;
    (Array.isArray(children) ? children : [children]).forEach((child) => walk(child, visit));
  };
  const render = () => {
    const outer = module.ExhibitionStudio({
      artworkUrl: "/original.webp",
      artworkWidth: 100,
      artworkHeight: 200,
      artworkReady: true,
      children: "original-link",
    });
    cursor = 0;
    tree = outer.type(outer.props);
    walk(tree, (node) => {
      if (node.props?.ref) node.props.ref.current = node.type === "canvas" ? canvas : host;
    });
    for (const index of pending) {
      effects[index].cleanup?.();
      effects[index].cleanup = effects[index].callback();
    }
    pending.clear();
    return tree;
  };
  render();
  return {
    calls,
    observations,
    render,
    resolveAllocation,
    get options() {
      return allocatedOptions;
    },
    intersect(value) {
      observations[1].callback([{ isIntersecting: value }]);
    },
    setBlocked(value) {
      blocked = value;
      visibility();
    },
    button(label) {
      let found;
      walk(tree, (node) => {
        if (node.type === "button" && node.props.children === label) found = node;
      });
      assert.ok(found, `button ${label}`);
      return found;
    },
    stage() {
      let found;
      walk(tree, (node) => {
        if (node.props?.className === "exhibition-studio-stage") found = node;
      });
      return found;
    },
    cleanup() {
      effects.forEach((effect) => effect?.cleanup?.());
    },
  };
}

test("wrapper allocates only when visible, pauses for original/sidebar mode and preserves independent camera controls", async () => {
  const f = componentFixture();
  await flushPromises();
  assert.equal(f.calls.allocated, 0);
  f.intersect(true);
  f.intersect(true);
  await flushPromises();
  assert.equal(f.calls.allocated, 1);
  f.render();
  assert.equal(f.stage().props["data-studio-ready"], "true");
  f.button("斜めから").props.onClick();
  assert.deepEqual(f.calls.views, ["front", "oblique"]);
  f.button("原画表示").props.onClick();
  f.render();
  assert.equal(f.stage().props["data-studio-ready"], "false");
  assert.ok(f.calls.pause > 0);
  f.button("展示空間に戻す").props.onClick();
  f.render();
  assert.equal(f.stage().props["data-studio-ready"], "true");
  const count = f.calls.pause;
  f.setBlocked(true);
  assert.equal(f.calls.pause, count + 1);
  f.setBlocked(false);
  assert.equal(f.calls.allocated, 1);
  f.cleanup();
  assert.equal(f.options.signal.aborted, true);
  assert.equal(f.calls.dispose, 1);
  assert.equal(f.calls.stopVisibility, 1);
  assert.ok(f.observations.every((entry) => entry.disconnected));
});

test("wrapper disposes late allocations after route unmount and retains original on allocation errors", async () => {
  const late = componentFixture({ deferAllocation: true });
  late.intersect(true);
  await flushPromises();
  late.cleanup();
  assert.equal(late.options.signal.aborted, true);
  late.resolveAllocation();
  await flushPromises();
  assert.equal(late.calls.dispose, 1);
  assert.equal(late.calls.resume, 0);
  const failed = componentFixture({ failAllocation: true });
  failed.intersect(true);
  await flushPromises();
  failed.render();
  assert.equal(failed.stage().props["data-studio-ready"], "false");
  assert.equal(failed.button("斜めから").props.disabled, true);
  failed.intersect(true);
  await flushPromises();
  assert.equal(
    failed.calls.allocated,
    1,
    "failed context must not retry endlessly on visibility events",
  );
  failed.cleanup();
});

test("component retains fallback and route cleanup contracts while the heavyweight module stays lazy", () => {
  const source = read("src/components/ultra/exhibition-studio.tsx");
  assert.match(source, /import\("@\/lib\/exhibition-studio-renderer"\)/);
  assert.doesNotMatch(
    source,
    /import\s+(?!type\b)[^;]*\bfrom\s+["'][^"']*(?:three|exhibition-studio-renderer)["']/,
  );
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /resize\.disconnect\(\)/);
  assert.match(source, /intersection\.disconnect\(\)/);
  assert.match(source, /stopVisibility\(\)/);
  assert.match(source, /candidate\.dispose\(\)/);
  assert.match(source, /rendererRef\.current\?\.dispose\(\)/);
  assert.match(source, /className="exhibition-studio-original">\{children\}/);
  const css = read("src/styles-exhibition-studio.css");
  assert.match(css, /\.exhibition-studio-original img\s*\{[^}]*object-fit:\s*contain/);
  assert.match(
    css,
    /\[data-studio-ready="true"\][^{]*\.exhibition-studio-original img\s*\{[^}]*opacity:\s*0/,
  );
});

// Geometry/lifecycle tests deliberately do not certify visual photorealism. That
// requires inspection of both actual rendered angles and the deployed browser.
