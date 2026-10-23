import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ASSEMBLY_BEATS, mountRexonanceAssembly, planAssembly } from "../src/lib/rexonance-resonance.js";
import { releaseBodyFlame } from "../src/lib/rexonance-flame.js";
import {
  FAR_FROM_SUIT_ATLAS,
  FAR_FROM_SUIT_DRIVER,
  FAR_FROM_SUIT_FIGURE,
  FAR_FROM_SUIT_FORMS,
  FAR_FROM_SUIT_MARKS,
  FAR_FROM_SUIT_PIECES,
  FAR_FROM_SUIT_REACTOR_GLOW,
  FAR_FROM_SUIT_SIZE,
  FAR_FROM_SUIT_TILE,
} from "../src/lib/far-from-suit.ts";
import { farFromUltraSrc } from "../src/lib/far-from-ultra-art.ts";
import {
  FAR_FROM_WIREFRAME_FORMS,
  FAR_FROM_WIREFRAME_PLATES,
  FAR_FROM_WIREFRAME_SOURCE,
} from "../src/lib/far-from-wireframe.ts";
import {
  WIRE_UNIT,
  checkWireMesh,
  decodeWireMesh,
  encodeWireMesh,
  triangulateWireMesh,
  wireSuitFingerprint,
} from "../src/lib/far-from-wireframe-mesh.ts";
import { FAR_FROM_WIRE_TIMING, prepareFarFromWireframe } from "../src/lib/far-from-wireframe-layer.ts";
import { FAR_FROM_FORM_CHAIN, farFromAssemblyConfig } from "../src/lib/far-from-assembly-engine.ts";

/* FAR FROM SAGA — the armour generated as a wireframe (owner, 2026-10-23:
   「また、ファーフロムはワイヤーフレーム風の生成方式を採るように。」). The
   meshes are made from the suit by scripts/build-far-from-wireframe.mjs
   (src/lib/far-from-wireframe.ts) and drawn by far-from-wireframe-layer.ts
   through the engine's `generation` option. These pin: the meshes are the
   current suit's (re-run the build when the suit is cut again), every mesh
   conforms to its outline, the construction keeps the scene's beats (nothing
   before its call, the helmet whole before the eyes), the draw passes are
   allocation-free, closed-form and bounded, and Rexonance keeps its swarm. */

const REBUILD = "node scripts/build-far-from-wireframe.mjs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const publicFile = (src) => fileURLToPath(new URL(`../public${src}`, import.meta.url));
const hashFile = (src) => createHash("sha256").update(readFileSync(publicFile(src))).digest("hex").slice(0, 16);
const layerSource = read("src/lib/far-from-wireframe-layer.ts");
const resonance = read("src/lib/rexonance-resonance.js");
const FORM_SOURCES = {
  standard: FAR_FROM_SUIT_FIGURE,
  high: FAR_FROM_SUIT_FORMS.high,
  xhigh: FAR_FROM_SUIT_FORMS.xhigh,
  max: FAR_FROM_SUIT_FORMS.max,
  "ultra-body": farFromUltraSrc("body", 768),
  ultra: farFromUltraSrc("interface", 768),
};
const pieces = FAR_FROM_SUIT_PIECES.map((piece) => ({
  ...piece,
  preset: FAR_FROM_SUIT_DRIVER.includes(piece.id),
}));

test("the wireframe was made from this suit (after the suit is cut again: re-run the build)", () => {
  assert.equal(
    FAR_FROM_WIREFRAME_SOURCE.pieces,
    wireSuitFingerprint(FAR_FROM_SUIT_PIECES),
    `the suit's plates changed since the wireframe was built: run ${REBUILD}`,
  );
  assert.equal(
    FAR_FROM_WIREFRAME_SOURCE.atlas,
    hashFile(FAR_FROM_SUIT_ATLAS.src),
    `the plates' atlas changed: run ${REBUILD}`,
  );
  for (const [key, src] of Object.entries(FORM_SOURCES))
    assert.equal(FAR_FROM_WIREFRAME_SOURCE.forms[key], hashFile(src), `${key} changed: run ${REBUILD}`);
  // The build reads the suit's modules and assets, never polygons of its own.
  const build = read("scripts/build-far-from-wireframe.mjs");
  assert.match(build, /importTs\("src\/lib\/far-from-suit\.ts"\)/);
  assert.match(build, /FAR_FROM_SUIT_ATLAS/);
  assert.match(build, /--check/);
});

test("every plate but the driver's has a conforming mesh of its own shape", () => {
  const ids = FAR_FROM_SUIT_PIECES.filter((p) => !FAR_FROM_SUIT_DRIVER.includes(p.id)).map((p) => p.id);
  assert.deepEqual(Object.keys(FAR_FROM_WIREFRAME_PLATES).sort(), [...ids].sort());
  for (const piece of FAR_FROM_SUIT_PIECES) {
    if (FAR_FROM_SUIT_DRIVER.includes(piece.id)) continue;
    const mesh = decodeWireMesh(FAR_FROM_WIREFRAME_PLATES[piece.id]);
    assert.ok(mesh, piece.id);
    const triangles = triangulateWireMesh(mesh);
    const check = checkWireMesh(mesh, triangles);
    assert.equal(check.folded, 0, piece.id);
    assert.equal(check.missing, 0, `${piece.id}: every outline segment an edge`);
    assert.equal(check.open, 0, `${piece.id}: every inner edge shared`);
    assert.ok(Math.abs(check.cover - 1) < 1e-3, `${piece.id} cover ${check.cover}`);
    assert.ok(check.triangles >= 4 && mesh.outline >= 3, piece.id);
    for (let i = 0; i < mesh.xs.length; i += 1) {
      const x = mesh.xs[i] / WIRE_UNIT;
      const y = mesh.ys[i] / WIRE_UNIT;
      assert.ok(
        x >= piece.x - 3 && y >= piece.y - 3 && x <= piece.x + piece.w + 3 && y <= piece.y + piece.h + 3,
        `${piece.id} vertex in its box`,
      );
    }
  }
});

test("each form of the chain (and ミドル) has a conforming mesh over its figure", () => {
  assert.deepEqual(Object.keys(FAR_FROM_WIREFRAME_FORMS).sort(), ["standard", ...FAR_FROM_FORM_CHAIN].sort());
  for (const [key, text] of Object.entries(FAR_FROM_WIREFRAME_FORMS)) {
    const mesh = decodeWireMesh(text);
    const check = checkWireMesh(mesh, triangulateWireMesh(mesh));
    assert.equal(check.folded + check.missing + check.open, 0, key);
    assert.ok(Math.abs(check.cover - 1) < 1e-3, key);
    assert.ok(check.triangles > 300, key);
  }
});

test("the encoding round-trips", () => {
  const loops = [
    [
      [0, 0],
      [40, 0],
      [40, 40],
      [0, 40],
    ],
  ];
  const interior = [[20, 21]];
  const mesh = decodeWireMesh(Buffer.from(encodeWireMesh(loops, interior)).toString("base64"));
  assert.deepEqual([...mesh.xs], [0, 40, 40, 0, 20]);
  assert.deepEqual([...mesh.ys], [0, 0, 40, 40, 21]);
  assert.equal(mesh.outline, 4);
  assert.equal(triangulateWireMesh(mesh).length / 3, 4);
  assert.equal(decodeWireMesh("!!"), null);
});

const recorder = (log) =>
  new Proxy(
    {},
    {
      get: (_, key) => (...args) => {
        log?.push(`${String(key)}(${args.map((v) => (typeof v === "number" ? v.toFixed(3) : typeof v)).join(",")})`);
      },
      set: (_, key, value) => {
        log?.push(`${String(key)}=${typeof value === "number" ? value.toFixed(3) : value}`);
        return true;
      },
    },
  );
const fakeDocument = { createElement: () => ({ width: 0, height: 0, getContext: () => recorder(null) }) };
const prepare = (coarse = false) => {
  const plan = planAssembly({
    size: FAR_FROM_SUIT_SIZE,
    pieces,
    core: FAR_FROM_SUIT_MARKS.core,
    visor: FAR_FROM_SUIT_MARKS.visor,
    maskTile: FAR_FROM_SUIT_TILE,
    tile: coarse ? 15 : 12,
  });
  const steps = prepareFarFromWireframe({
    document: fakeDocument,
    size: FAR_FROM_SUIT_SIZE,
    pieces,
    plan,
    core: FAR_FROM_SUIT_MARKS.core,
    visor: FAR_FROM_SUIT_MARKS.visor,
    coarse,
    reactorGlow: FAR_FROM_SUIT_REACTOR_GLOW,
    unlit: {},
    gold: {},
    forms: ["standard", ...FAR_FROM_FORM_CHAIN],
  });
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
};
const layer = prepare();

test("the construction keeps the scene's beats: nothing before its call, scans after the fill, the helmet whole before the eyes", () => {
  assert.equal(layer.plates.length, FAR_FROM_SUIT_PIECES.length - FAR_FROM_SUIT_DRIVER.length);
  const B = ASSEMBLY_BEATS;
  const start = (beat) =>
    beat <= 3 ? B.deus[0] + (beat * (B.deus[1] - B.deus[0])) / 4 : beat === 4 ? B.rexonance[0] : B.rexonance[0] + 0.06;
  for (const plate of layer.plates) {
    assert.ok(plate.first >= start(plate.beat) - 1e-6, `${plate.id} not before its call`);
    assert.ok(plate.fillEnd < B.seal[0], `${plate.id} filled before the seal`);
    // The muffler (neck wrap and streamers) is ribbed; nothing else is.
    assert.equal(plate.rt.length > 0, /^(collar|ribbon-)/.test(plate.id), plate.id);
  }
  for (const group of layer.groups) {
    const last = Math.max(...group.plates.map((k) => layer.plates[k].fillEnd));
    assert.ok(group.from >= last - 1e-6, "a group is scanned once filled");
    assert.ok(group.to < B.seal[0], "every scan before the seal");
  }
  const helm = layer.groups.find((group) => group.mode === 2);
  assert.ok(helm.to < B.pixels[0], "the helmet is scanned whole before the eyes fill");
  assert.ok(FAR_FROM_WIRE_TIMING.glow <= 0.01);
});

test("the draw passes allocate nothing, set no transform and use no shadow or filter", () => {
  const from = layerSource.indexOf("/* -- draw passes: allocation-free from here -- */");
  const to = layerSource.indexOf("/* -- end of the draw passes -- */");
  assert.ok(from > 0 && to > from);
  const passes = layerSource.slice(from, to);
  assert.doesNotMatch(
    passes,
    /\bnew |\.map\(|\.filter\(|\.slice\(|\.concat\(|\[\]|Array\.from|\.push\(|\.setTransform\(|for \(const |\.forEach\(|shadow|filter =|create(Linear|Radial)Gradient|getImageData/,
  );
  // No red in the wire's light (photosensitivity): every colour is ice,
  // white or gold.
  for (const [, r, g, b] of layerSource.matchAll(/rgb\((\d+) (\d+) (\d+)\)/g)) {
    const [R, G, Bl] = [r, g, b].map(Number);
    assert.ok(!(R > 200 && G < 150 && Bl < 160), `rgb(${r} ${g} ${b})`);
  }
});

test("every frame is a function of the progress alone, forward or back", () => {
  const frame = (q) => {
    const log = [];
    layer.draw(recorder(log), q, false, 2.4, 2);
    return log.join("\n");
  };
  const qs = [0.2, 0.24, 0.29, 0.47, 0.72, 0.84];
  const forward = qs.map(frame);
  const backward = [...qs].reverse().map(frame).reverse();
  assert.deepEqual(forward, backward);
  assert.equal(frame(0.12), "globalCompositeOperation=source-over\nglobalAlpha=1.000\nglobalCompositeOperation=lighter\nlineCap=round\nlineJoin=round\nglobalCompositeOperation=source-over\nglobalAlpha=1.000", "nothing before the first call");
  const change = (u) => {
    const log = [];
    layer.form(recorder(log), {}, {}, "max", "ultra-body", u, "#f4fbff", false, 2.4, 2);
    return log.join("\n");
  };
  assert.deepEqual([0.2, 0.5, 0.8].map(change), [0.8, 0.5, 0.2].map(change).reverse());
});

test("the per-frame work is bounded (Android): batched strokes and fills, one clip per filling plate", () => {
  for (const coarse of [false, true]) {
    const scene = coarse ? prepare(true) : layer;
    let worst = { stroke: 0, fill: 0, clip: 0, drawImage: 0, lineTo: 0 };
    for (let q = 0.15; q <= 0.9; q += 0.005) {
      const counts = { stroke: 0, fill: 0, clip: 0, drawImage: 0, lineTo: 0 };
      const context = new Proxy(
        {},
        { get: (_, key) => () => key in counts && (counts[key] += 1), set: () => true },
      );
      scene.draw(context, q, false, 2.4, 2);
      for (const key of Object.keys(worst)) worst[key] = Math.max(worst[key], counts[key]);
    }
    assert.ok(worst.stroke <= 12, `strokes ${worst.stroke}`);
    assert.ok(worst.fill <= 10, `fills ${worst.fill}`);
    assert.ok(worst.clip <= 48, `clips ${worst.clip}`);
    assert.ok(worst.drawImage <= 96, `draws ${worst.drawImage}`);
    assert.ok(worst.lineTo <= (coarse ? 6000 : 9000), `lines ${worst.lineTo}`);
  }
});

test("the engine takes a page's generation; Rexonance has none and keeps its swarm and field", () => {
  assert.match(resonance, /const armourGeneration = config\.generation \?\? null;/);
  assert.match(resonance, /const replaceArmour = Boolean\(armourGeneration && !armourGeneration\.overlay\);/);
  assert.match(resonance, /replaceArmour\n\s+\? null\n\s+: boundedImage\(import\("\.\/rexonance-assembly-nanites\.js"\)/);
  assert.match(resonance, /if \(wire && replaceArmour && seal < 1\) \{/);
  assert.match(resonance, /if \(wire && !replaceArmour\)\n\s+wire\.form\(/);
  assert.match(resonance, /!wire\?\.form\(/);
  const rexonance = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.doesNotMatch(rexonance, /generation/);
  // Owner (2026-10-24): the nanite build stays, the wire is drawn over it.
  assert.equal(typeof farFromAssemblyConfig().nanites, "function");
  assert.equal(farFromAssemblyConfig().generation.overlay, true);
});

test("a live mount prepares the nanite build with the wireframe over it, drawn with the scroll", async () => {
  const listeners = new Map();
  const target = (name) => ({
    addEventListener: (type, callback) => listeners.set(`${name}:${type}`, callback),
    removeEventListener: (type) => listeners.delete(`${name}:${type}`),
  });
  const node = (extra = {}) => {
    const attrs = new Map();
    return {
      dataset: new Proxy(
        {},
        {
          get: (_, key) => attrs.get(key),
          set: (_, key, value) => (attrs.set(key, value), true),
          deleteProperty: (_, key) => (attrs.delete(key), true),
        },
      ),
      hasAttribute: (name) => attrs.has(name),
      setAttribute: (name, value) => attrs.set(name, value),
      removeAttribute: (name) => attrs.delete(name),
      style: { setProperty() {}, removeProperty() {} },
      ...extra,
    };
  };
  const calls = [];
  const makeCanvas = () => {
    const c = { width: 0, height: 0, clientWidth: 600, clientHeight: 900 };
    const context = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "getImageData" || key === "createImageData"
            ? (...args) => ({ data: new Uint8ClampedArray(args.at(-2) * args.at(-1) * 4).fill(255) })
            : key === "createRadialGradient"
              ? () => ({ addColorStop() {} })
              : (...args) => calls.push({ target: c, method: key, args }),
        set: () => true,
      },
    );
    // (No WebGL here: the shared fire takes its CPU path.)
    c.getContext = (type) => (/webgl/.test(String(type)) ? null : context);
    return c;
  };
  const document = { documentElement: node(), hidden: false, createElement: makeCanvas, ...target("document") };
  const canvas = makeCanvas();
  let progress = 0;
  const runway = node({
    ownerDocument: document,
    offsetHeight: 1800,
    getBoundingClientRect: () => ({ top: -progress * 1200 }),
    querySelector: (s) => (s === "canvas.rzn-canvas" ? canvas : s === ".rzn-frame" ? { offsetHeight: 600 } : null),
    querySelectorAll: () => [],
  });
  runway.dataset.form = "standard";
  const frames = new Map();
  const observers = [];
  const sources = [];
  let id = 0;
  const env = {
    ...target("window"),
    document,
    navigator: {},
    innerHeight: 600,
    matchMedia: (query) => ({ matches: false, ...target(query) }),
    getComputedStyle: () => ({ top: "0", getPropertyValue: () => "" }),
    requestAnimationFrame: (callback) => (frames.set(++id, callback), id),
    cancelAnimationFrame: (k) => frames.delete(k),
    requestIdleCallback: (callback) => setTimeout(() => callback({ timeRemaining: () => 20 }), 0),
    cancelIdleCallback: clearTimeout,
    setTimeout,
    clearTimeout,
    performance,
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe() {}
      disconnect() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback();
      }
      disconnect() {}
    },
    Image: class {
      set src(value) {
        sources.push(value);
        queueMicrotask(() => this.onload());
      }
    },
  };
  const settle = () => {
    calls.length = 0;
    for (let k = 0; k < 60 && frames.size; k += 1)
      for (const [key, callback] of [...frames]) {
        frames.delete(key);
        callback();
      }
    return [...calls];
  };
  const scroll = (value) => {
    progress = value;
    listeners.get("window:scroll")?.();
    return settle();
  };
  const dispose = mountRexonanceAssembly(runway, farFromAssemblyConfig(), env);
  try {
    observers[0].callback([{ isIntersecting: true }]);
    for (let i = 0; i < 4000 && runway.dataset.rznState !== "live"; i += 1)
      await new Promise((resolve) => setTimeout(resolve, 2));
    assert.equal(runway.dataset.rznState, "live");
    // Owner (2026-10-24): the nanite kits build the armour, the wire over it.
    assert.ok(sources.some((src) => /nanites/.test(src)), sources.join(" "));
    const wires = (list) =>
      list.filter((call) => call.target === canvas && call.method === "stroke").length;
    const before = wires(scroll(0.12));
    assert.ok(wires(scroll(0.3)) > before, "the legs' wire is drawn by .3");
    assert.equal(runway.dataset.rznPhase, "assemble");
    scroll(0.95);
    assert.equal(runway.dataset.rznPhase, "complete");
  } finally {
    dispose();
    // (The shared body fire keeps its surfaces while a page shows it.)
    releaseBodyFlame();
  }
});

test("the entry transition's plates have their own conforming meshes, made from its cut", async () => {
  const entry = await import("../src/lib/far-from-entry-suit.ts");
  const wireEntry = await import("../src/lib/far-from-wireframe-entry.ts");
  assert.equal(
    wireEntry.FAR_FROM_WIREFRAME_ENTRY_SOURCE.pieces,
    wireSuitFingerprint(entry.FAR_FROM_ENTRY_PIECES),
    `the entry's plates changed: run ${REBUILD}`,
  );
  assert.equal(
    wireEntry.FAR_FROM_WIREFRAME_ENTRY_SOURCE.atlas,
    hashFile(entry.FAR_FROM_ENTRY_ATLAS.src),
    `the entry's atlas changed: run ${REBUILD}`,
  );
  assert.deepEqual(
    Object.keys(wireEntry.FAR_FROM_WIREFRAME_ENTRY).sort(),
    entry.FAR_FROM_ENTRY_PIECES.map((piece) => piece.id).sort(),
  );
  for (const [id, text] of Object.entries(wireEntry.FAR_FROM_WIREFRAME_ENTRY)) {
    const mesh = decodeWireMesh(text);
    const check = checkWireMesh(mesh, triangulateWireMesh(mesh));
    assert.equal(check.folded + check.missing + check.open, 0, id);
  }
  // The entry engine draws the wire with the plates (no composite, batched).
  const engine = read("src/components/far-from-saga/far-from-entry-engine.ts");
  assert.match(engine, /const wire = wireOf\(p\);/);
  // Owner (2026-10-24): the nanites stream in along the wire.
  assert.match(engine, /A nanite mote, streaming in/);
});
