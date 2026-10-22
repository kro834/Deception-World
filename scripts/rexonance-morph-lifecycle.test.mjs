import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const page = readFileSync(
  new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(
  page.slice(page.indexOf("function FormMorph("), page.indexOf("const releaseControlFocus")) +
    "\nexports.FormMorph = FormMorph;",
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const flush = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};

function fixture({ forcedColors = false } = {}) {
  let serial = 0;
  const timers = new Map(),
    frames = new Map(),
    images = [],
    draws = [];
  const panel = { dataset: {} };
  const context = () => ({
    drawImage: (image) => draws.push(image),
    clearRect() {},
    setTransform() {},
  });
  const attributes = { src: "/max.webp", srcset: "/max-delivery.webp 640w", sizes: "40vw" };
  const img = {
    style: { visibility: "" },
    alt: "max art",
    offsetWidth: 400,
    offsetHeight: 600,
    offsetLeft: 0,
    offsetTop: 0,
    getAttribute: (key) => attributes[key] ?? null,
    removeAttribute: (key) => delete attributes[key],
    closest: () => panel,
  };
  for (const key of ["src", "srcset", "sizes"])
    Object.defineProperty(img, key, {
      get: () => attributes[key],
      set: (value) => {
        attributes[key] = value;
      },
    });
  const canvas = {
    style: {},
    width: 300,
    height: 150,
    parentElement: { querySelector: () => img },
    getContext: context,
  };
  class Image {
    constructor() {
      this.naturalWidth = 1086;
      this.naturalHeight = 1448;
      this.complete = false;
      images.push(this);
    }
    get currentSrc() {
      return this.srcset?.split(" ")[0] || this.src;
    }
    decode() {
      return Promise.resolve();
    }
    removeAttribute(key) {
      delete this[key];
    }
  }
  const win = {
    matchMedia: (query) => ({ matches: forcedColors && query === "(forced-colors: active)" }),
    setTimeout: (callback) => {
      timers.set(++serial, callback);
      return serial;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  let effect;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    Image,
    window: win,
    navigator: {},
    document: {
      documentElement: { dataset: {} },
      createElement: () => ({ width: 0, height: 0, getContext: context }),
    },
    useRef: () => ({ current: canvas }),
    useLayoutEffect: (callback) => (effect = callback),
    getComputedStyle: () => ({
      objectPosition: "50% 50%",
      objectFit: "contain",
      transform: "matrix(1, 0, 0, 1, 0, 3)",
      scale: "1",
      translate: "none",
      transformOrigin: "50% 50%",
    }),
    STAGES: Object.fromEntries(
      ["standard", "max", "ultra", "excelsior"].map((stage) => [
        stage,
        { image: `/${stage}.webp`, alt: `${stage} art` },
      ]),
    ),
    rexonanceImage: (src) => ({
      srcSet: `${src.replace(".webp", "-delivery.webp")} 640w`,
      sizes: "40vw",
    }),
    REXONANCE_FORM_FIGURES: {},
    MORPH_ORIGIN: [0.5, 0.4],
    FORM_CHANGE_MS: { max: 300, quick: 100, ultra: 300, extra: 100 },
    FORM_TONES: {},
    planOverwrite: () => ({}),
    sampleCells: () => null,
    drawOverwrite: (_context, _plan, from, to, u) => draws.push(u >= 1 ? to : from),
    releasePendingImage: (image) => {
      if (!image.complete) {
        image.onload = image.onerror = null;
        image.src = "";
      }
    },
    requestAnimationFrame: (callback) => {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    require: () => ({ jsx: (_type, props) => props }),
  });
  return {
    img,
    canvas,
    images,
    timers,
    frames,
    panel,
    draws,
    mount(from = "standard", to = "max") {
      exports.FormMorph({ from, to, delay: 0 });
      return effect();
    },
    async load(image) {
      image.complete = true;
      image.onload?.();
      await flush();
    },
    async loadAll() {
      for (const image of images) if (image.onload) await this.load(image);
    },
    async expire() {
      for (const callback of [...timers.values()]) callback();
      await flush();
    },
    frame(now) {
      const jobs = [...frames.values()];
      frames.clear();
      jobs.forEach((callback) => callback(now));
    },
  };
}

test("slow form preparation holds the old responsive picture until the first painted canvas", async () => {
  const f = fixture();
  const cleanup = f.mount();
  assert.equal(f.img.src, "/standard.webp");
  assert.equal(f.img.srcset, "/standard-delivery.webp 640w");
  assert.equal(f.img.sizes, "40vw");
  assert.equal(f.img.alt, "standard art");
  assert.equal(f.canvas.style.opacity, "0");
  await f.load(f.images[0]);
  assert.equal(f.img.src, "/standard.webp", "one ready image cannot reveal the new form");
  await f.loadAll();
  assert.ok(f.draws.length > 0, "old pixels exist before release");
  assert.equal(f.canvas.style.opacity, "1");
  assert.equal(f.img.style.visibility, "hidden");
  assert.equal(f.img.alt, "max art");
  assert.equal(f.canvas.style.transform, "matrix(1, 0, 0, 1, 0, 3)");
  assert.equal(f.img.src, "/max.webp");
  assert.equal(f.img.srcset, "/max-delivery.webp 640w");
  assert.equal(f.img.sizes, "40vw");
  f.frame(1000);
  f.frame(3000);
  assert.equal(f.canvas.style.opacity, "0");
  assert.equal(f.img.style.visibility, "");
  assert.equal(f.panel.dataset.morphStage, "max");
  cleanup();
  assert.equal(f.timers.size, 0);
});

for (const failure of ["throw", "reject", "absent"]) {
  test(`a loaded form with decode ${failure} still draws without an unhandled rejection`, async () => {
    const f = fixture(),
      cleanup = f.mount();
    for (const image of f.images)
      image.decode =
        failure === "absent"
          ? undefined
          : failure === "throw"
            ? () => {
                throw new Error("decoder failed");
              }
            : () => Promise.reject(new Error("decoder failed"));
    await f.loadAll();
    assert.equal(f.img.src, "/max.webp");
    assert.equal(f.canvas.style.opacity, "1");
    cleanup();
  });
}

for (const failure of ["network", "stalled-decode"]) {
  test(`${failure} keeps readable old art and releases every pending loader`, async () => {
    const f = fixture(),
      cleanup = f.mount();
    if (failure === "network") f.images[1].onerror();
    else {
      for (const image of f.images) image.decode = () => new Promise(() => {});
      await f.loadAll();
    }
    await f.expire();
    assert.equal(f.img.src, "/standard.webp");
    assert.equal(f.canvas.style.opacity, "0");
    assert.equal(f.timers.size, 0);
    for (const image of f.images) {
      assert.equal(image.onload, null);
      assert.equal(image.onerror, null);
      assert.equal(image.srcset, undefined);
    }
    cleanup();
  });
}

test("rapid retarget and a late old decode cannot hide or replace the latest prepared form", async () => {
  const f = fixture(),
    oldCleanup = f.mount();
  let release;
  f.images[1].decode = () => new Promise((resolve) => (release = resolve));
  await f.loadAll();
  oldCleanup();
  assert.equal(f.img.src, "/max.webp", "cleanup restores the captured React target");
  f.img.src = "/ultra.webp";
  f.img.srcset = "/ultra-delivery.webp 640w";
  const nextCleanup = f.mount("max", "ultra");
  assert.equal(f.img.src, "/standard.webp", "pending MAX was never the readable previous form");
  await f.loadAll();
  assert.equal(f.img.src, "/ultra.webp");
  assert.equal(f.canvas.style.opacity, "1");
  release();
  await flush();
  assert.equal(f.img.src, "/ultra.webp");
  assert.equal(f.canvas.style.opacity, "1");
  nextCleanup();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.img.src, "/ultra.webp");
  assert.equal(f.img.srcset, "/ultra-delivery.webp 640w");
});

test("unmount while decoding frees handlers and late rejection never resurrects a frame", async () => {
  const f = fixture(),
    cleanup = f.mount();
  let reject;
  f.images[0].decode = () => new Promise((_resolve, fail) => (reject = fail));
  await f.load(f.images[0]);
  cleanup();
  reject(new Error("late decoder failure"));
  await flush();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.canvas.style.opacity, "0");
  for (const image of f.images) assert.equal(image.onload, null);
});

test("returning to standard updates the remembered image without starting loaders", () => {
  const f = fixture();
  f.panel.dataset.morphStage = "max";
  f.img.src = "/standard.webp";
  f.mount("max", "standard");
  assert.equal(f.panel.dataset.morphStage, "standard");
  assert.equal(f.img.src, "/standard.webp");
  assert.equal(f.images.length, 0);
});

test("forced colors keeps the target picture visible while CSS suppresses the canvas", () => {
  const f = fixture({ forcedColors: true });
  f.mount();
  assert.equal(f.img.src, "/max.webp");
  assert.equal(f.img.style.visibility, "");
  assert.equal(f.images.length, 0);
});
