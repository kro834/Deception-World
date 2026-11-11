import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mountRexonanceAssembly } from "../src/lib/rexonance-resonance.js";
import { releaseBodyFlame } from "../src/lib/rexonance-flame.js";
import {
  FAR_FROM_SUIT_ATLAS,
  FAR_FROM_SUIT_DRIVER,
  FAR_FROM_SUIT_FIGURE,
  FAR_FROM_SUIT_FORMS,
  FAR_FROM_SUIT_PIECES,
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
import { FAR_FROM_FORM_CHAIN, farFromAssemblyConfig } from "../src/lib/far-from-assembly-engine.ts";

/* FAR FROM SAGA — the armour generated as a wireframe (owner, 2026-10-23:
   「また、ファーフロムはワイヤーフレーム風の生成方式を採るように。」). The
   meshes are made from the suit by scripts/build-far-from-wireframe.mjs
   (src/lib/far-from-wireframe.ts). Since 2026-11-11 the scroll's armour
   grows as a nanite skin whose cells are triangles (nanite-skin.ts, through
   the engine's `generation` option); the entry's fallback still draws the
   plates' meshes. These pin: the meshes are the
   current suit's (re-run the build when the suit is cut again), every mesh
   conforms to its outline, the construction keeps the scene's beats (nothing
   before its call, the helmet whole before the eyes), the draw passes are
   allocation-free, closed-form and bounded, and Rexonance keeps its swarm. */

const REBUILD = "node scripts/build-far-from-wireframe.mjs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const publicFile = (src) => fileURLToPath(new URL(`../public${src}`, import.meta.url));
const hashFile = (src) => createHash("sha256").update(readFileSync(publicFile(src))).digest("hex").slice(0, 16);
const resonance = read("src/lib/rexonance-resonance.js");
const FORM_SOURCES = {
  standard: FAR_FROM_SUIT_FIGURE,
  high: FAR_FROM_SUIT_FORMS.high,
  xhigh: FAR_FROM_SUIT_FORMS.xhigh,
  max: FAR_FROM_SUIT_FORMS.max,
  "ultra-body": farFromUltraSrc("body", 768),
  ultra: farFromUltraSrc("interface", 768),
};

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

test("the engine takes a page's generation; Rexonance has none and keeps its swarm and field", () => {
  assert.match(resonance, /const armourGeneration = config\.generation \?\? null;/);
  assert.match(resonance, /const replaceArmour = Boolean\(armourGeneration && !armourGeneration\.overlay\);/);
  assert.match(
    resonance,
    /replaceArmour\n\s+\? null\n\s+: boundedImage\(\n\s+importWithRetry\(\(\) => import\("\.\/rexonance-assembly-nanites\.js"\)/,
  );
  assert.match(resonance, /if \(wire && replaceArmour && seal < 1\) \{/);
  assert.match(resonance, /if \(wire && !replaceArmour\)\n\s+wire\.form\(/);
  // Owner (2026-10-23): ILLUSIONCULUM's opt-in formChange shares the call.
  assert.match(resonance, /!\(replaceArmour \? wire : formChange\)\?\.form\(/);
  const rexonance = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.doesNotMatch(rexonance, /generation/);
  // Owner (2026-11-11): the armour grows as a nanite skin, in place of the
  // swarm's build (nanite-skin.ts); its cells are the wireframe's triangles.
  assert.equal(farFromAssemblyConfig().nanites, undefined);
  assert.equal(farFromAssemblyConfig().generation.overlay, false);
  assert.match(read("src/lib/far-from-skin-style.ts"), /triangles: true/);
});

test("a live mount prepares the nanite skin and draws the armour with the scroll", async () => {
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
            : key === "createRadialGradient" || key === "createLinearGradient"
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
    // Owner (2026-11-11): the skin builds the armour; the swarm's module and
    // its kits are never fetched.
    assert.ok(!sources.some((src) => /nanites/.test(src)), sources.join(" "));
    const draws = (list) =>
      list.filter((call) => call.target === canvas && call.method === "drawImage").length;
    // The liquid, the art, the lines and the light: a handful of draws.
    assert.ok(draws(scroll(0.3)) >= 4, "the armour is drawn by .3");
    assert.ok(draws(scroll(0.5)) >= 4);
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

// Owner (2026-11-03): 「スクロール変身アニメーションは、もとの体がガタガタしないタイプにもどして。」
// The scroll suit-up is back to the pre-round-2 steady build: no camera moves
// the scene's canvases and no outline is thrown in from an exploded pose.
test("round 3: the scroll suit-up holds the body still (no camera, no thrown outlines)", () => {
  const accents = readFileSync(new URL("../src/lib/far-from-assembly-accents.ts", import.meta.url), "utf8");
  assert.doesNotMatch(accents, /farFromCamera|\.style\.transform/);
  assert.ok(!existsSync(new URL("../src/lib/far-from-wireframe-layer.ts", import.meta.url)));
  assert.doesNotMatch(
    readFileSync(new URL("../src/lib/nanite-skin.ts", import.meta.url), "utf8"),
    /\.style\.transform/,
  );
  assert.ok(!existsSync(new URL("../src/lib/far-from-suitup-camera.ts", import.meta.url)));
});
