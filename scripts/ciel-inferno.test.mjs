import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  CIEL_INFERNO_GAP_MS,
  CIEL_INFERNO_TAPS,
  CIEL_INFERNO_WINDOW_MS,
  createCielInfernoTrigger,
} from "../src/lib/ciel-inferno-trigger.ts";

const file = (path) => new URL(`../${path}`, import.meta.url);
const bytes = (path) => readFileSync(file(path));
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("the secret artwork is exactly the supplied composition, resized only with private metadata removed", async () => {
  const manifest = JSON.parse(bytes("public/ciel-inferno-20261019/artwork-manifest.json"));
  const reference = bytes(manifest.source.path);
  assert.equal(digest(reference), manifest.source.sha256);
  const source = await sharp(reference).metadata();
  assert.equal(source.width, source.height);
  assert.ok(source.width >= 1080);
  assert.deepEqual(
    manifest.assets.map((asset) => asset.width),
    [216, 720, 1080],
  );
  for (const asset of manifest.assets) {
    const image = bytes(`public${asset.path}`);
    const metadata = await sharp(image).metadata();
    assert.equal(digest(image), asset.sha256);
    assert.equal(image.length, asset.bytes);
    assert.deepEqual(
      [metadata.format, metadata.width, metadata.height],
      ["webp", asset.width, asset.width],
    );
    for (const key of ["exif", "xmp", "iptc"]) assert.equal(metadata[key], undefined);
    const expected = await sharp(reference)
      .resize(asset.width, asset.width, { fit: "inside", kernel: "lanczos3" })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toBuffer();
    assert.deepEqual(image, expected, `${asset.width}: no crop, repaint or composition change`);
  }
});

test("the pressure jet is a bounded, transparent, animated Blender volume with reproducible source identity", async () => {
  const manifest = JSON.parse(bytes("public/ciel-inferno-20261019/jet-manifest.json"));
  const image = bytes(`public${manifest.asset.path}`);
  assert.equal(image.length, manifest.asset.bytes);
  assert.equal(digest(image), manifest.asset.sha256);
  assert.ok(image.length <= 600_000);
  const metadata = await sharp(image).metadata();
  assert.deepEqual(
    [metadata.format, metadata.width, metadata.height, metadata.channels],
    ["webp", 2048, 512, 4],
  );
  assert.deepEqual(
    [
      manifest.atlas.columns,
      manifest.atlas.rows,
      manifest.atlas.frames,
      manifest.atlas.frameWidth,
      manifest.atlas.frameHeight,
    ],
    [8, 4, 32, 256, 128],
  );
  assert.deepEqual(manifest.atlas.sourceAnchor, [8, 64]);
  assert.equal(manifest.atlas.direction, "right");
  assert.equal(manifest.render.renderer, "Cycles CPU");
  assert.equal(manifest.render.enclosureNormals, "outward");
  assert.ok(manifest.render.signedVolumeMin > 0);
  assert.equal(manifest.render.loopGeometryMaxDelta, 0);
  assert.equal(manifest.render.loopCheckRendered, true);
  assert.equal(manifest.loopPixelCheck.differentChannels, 0);
  assert.equal(manifest.loopPixelCheck.maxChannelDelta, 0);
  for (const source of manifest.sources)
    assert.equal(digest(bytes(source.path)), source.sha256, source.path);
  const { data } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const frames = new Set(),
    levels = new Set();
  for (let frame = 0; frame < 32; frame++) {
    const pixels = [];
    let occupied = 0;
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 256; x++) {
        const i = (((frame >> 3) * 128 + y) * 2048 + (frame % 8) * 256 + x) * 4;
        const pixel = data.subarray(i, i + 4);
        pixels.push(...pixel);
        levels.add(pixel[3]);
        if (pixel[3] > 8) occupied++;
        if (x < 8 || x >= 248)
          assert.ok(pixel[3] <= 8, `frame ${frame}: soft inlet/outlet, no tile cut`);
      }
    }
    assert.ok(
      occupied > 500 && occupied < 256 * 128 * 0.85,
      `frame ${frame}: substantial flow with transparent margins`,
    );
    frames.add(digest(Buffer.from(pixels)));
  }
  assert.ok(frames.size >= 28);
  assert.ok(levels.size >= 64);
});

test("the secret requires ten deliberate taps with bounded gaps and a bounded total window", () => {
  assert.equal(CIEL_INFERNO_TAPS, 10);
  assert.equal(CIEL_INFERNO_GAP_MS, 550);
  assert.equal(CIEL_INFERNO_WINDOW_MS, 4000);
  const trigger = createCielInfernoTrigger();
  for (let i = 1; i <= 10; i++) {
    assert.deepEqual(trigger.tap((i - 1) * 200), {
      count: i,
      primed: i >= 3,
      triggered: i === 10,
    });
  }
});

test("the third tap primes, while the first and second stay ordinary activations", () => {
  const trigger = createCielInfernoTrigger();
  assert.deepEqual(trigger.tap(1000), { count: 1, primed: false, triggered: false });
  assert.deepEqual(trigger.tap(1100), { count: 2, primed: false, triggered: false });
  assert.deepEqual(trigger.tap(1200), { count: 3, primed: true, triggered: false });
  for (let i = 4; i <= 9; i++) {
    const result = trigger.tap(900 + i * 100);
    assert.equal(result.count, i);
    assert.equal(result.triggered, false, `tap ${i} must not open the effect`);
  }
});

test("the tenth fires once and later taps remain locked until an explicit reset", () => {
  const trigger = createCielInfernoTrigger();
  for (let i = 0; i < 9; i++) assert.equal(trigger.tap(i * 100).triggered, false);
  assert.equal(trigger.tap(900).triggered, true);
  for (const at of [901, 1000, 5000, 100_000, NaN, Infinity]) {
    assert.deepEqual(trigger.tap(at), { count: 10, primed: false, triggered: false });
  }
  trigger.reset();
  assert.deepEqual(trigger.tap(100_001), { count: 1, primed: false, triggered: false });
});

test("a gap of exactly 550 ms is allowed, but 551 ms starts a new burst", () => {
  for (const gap of [550, 551]) {
    const trigger = createCielInfernoTrigger();
    trigger.tap(10_000);
    const result = trigger.tap(10_000 + gap);
    assert.equal(result.count, gap === 550 ? 2 : 1);
    assert.equal(result.primed, false);
    assert.equal(result.triggered, false);
  }
});

test("a ten-tap burst spanning exactly four seconds is valid", () => {
  const trigger = createCielInfernoTrigger();
  const times = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 3750, 4000];
  const results = times.map((time) => trigger.tap(time));
  assert.equal(results[8].triggered, false);
  assert.deepEqual(results[9], { count: 10, primed: true, triggered: true });
});

test("small gaps cannot extend the burst beyond four seconds", () => {
  const trigger = createCielInfernoTrigger();
  for (let i = 0; i < 9; i++) assert.equal(trigger.tap(i * 500).triggered, false);
  assert.deepEqual(trigger.tap(4500), { count: 1, primed: false, triggered: false });
  for (let i = 1; i < 9; i++) assert.equal(trigger.tap(4500 + i * 200).triggered, false);
  assert.equal(trigger.tap(6300).triggered, true);
});

test("a backwards clock restarts safely instead of inheriting an older burst", () => {
  const trigger = createCielInfernoTrigger();
  trigger.tap(1000);
  trigger.tap(1100);
  trigger.tap(1200);
  assert.deepEqual(trigger.tap(900), { count: 1, primed: false, triggered: false });
  assert.deepEqual(trigger.tap(1000), { count: 2, primed: false, triggered: false });
});

for (const invalid of [NaN, Infinity, -Infinity, -1]) {
  test(`invalid timestamp ${String(invalid)} cannot prime or trigger an unfinished burst`, () => {
    const trigger = createCielInfernoTrigger();
    for (let i = 0; i < 9; i++) trigger.tap(1000 + i * 100);
    assert.deepEqual(trigger.tap(invalid), { count: 0, primed: false, triggered: false });
    assert.deepEqual(trigger.tap(2000), { count: 1, primed: false, triggered: false });
  });
}

test("reset is idempotent and cancels every partial tap count", () => {
  for (let count = 0; count <= 10; count++) {
    const trigger = createCielInfernoTrigger();
    for (let i = 0; i < count; i++) trigger.tap(i * 100);
    trigger.reset();
    trigger.reset();
    assert.deepEqual(
      trigger.tap(1200),
      { count: 1, primed: false, triggered: false },
      `reset after ${count}`,
    );
  }
});

test("separate provider instances do not share counters, locks or persistence", () => {
  const a = createCielInfernoTrigger();
  const b = createCielInfernoTrigger();
  for (let i = 0; i < 9; i++) a.tap(i * 100);
  assert.deepEqual(b.tap(900), { count: 1, primed: false, triggered: false });
  assert.equal(a.tap(900).triggered, true);
  b.reset();
  assert.deepEqual(a.tap(1000), { count: 10, primed: false, triggered: false });
  assert.deepEqual(createCielInfernoTrigger().tap(0), {
    count: 1,
    primed: false,
    triggered: false,
  });
});

// Execute the actual component effects with a tiny host, rather than matching
// source text. Browser QA independently checks native top-layer and black pixels.
function mountInferno({ calm = false, nativeFailure = false, styleReady = true } = {}) {
  let clock = 0,
    serial = 0,
    commits = 0,
    renders = 0,
    disposals = 0,
    dirty = false;
  const timers = new Map(),
    frames = new Map(),
    observers = [],
    refs = [],
    states = [],
    effects = [];
  const storageWrites = [];
  let refIndex = 0,
    stateIndex = 0,
    effectIndex = 0;
  const fragment = Symbol("fragment");
  class Style {
    values = new Map();
    setProperty(name, value, priority = "") {
      this.values.set(name, [value, priority]);
    }
    getPropertyValue(name) {
      return this.values.get(name)?.[0] || "";
    }
    getPropertyPriority(name) {
      return this.values.get(name)?.[1] || "";
    }
    removeProperty(name) {
      this.values.delete(name);
    }
    get length() {
      return this.values.size;
    }
  }
  class Host extends EventTarget {
    constructor(tag = "div") {
      super();
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attrs = new Map();
      this.dataset = {};
      this.style = new Style();
      this.className = "";
      this.inert = false;
      this.isConnected = true;
    }
    get classList() {
      return { contains: (name) => this.className.split(/\s+/).includes(name) };
    }
    get open() {
      return this.attrs.has("open");
    }
    setAttribute(name, value) {
      this.attrs.set(name, value);
      if (name === "open")
        for (const observer of observers)
          if (observer.target === this) queueMicrotask(() => observer.callback([]));
    }
    getAttribute(name) {
      return this.attrs.get(name) ?? null;
    }
    removeAttribute(name) {
      this.attrs.delete(name);
      if (name === "open")
        for (const observer of observers)
          if (observer.target === this) queueMicrotask(() => observer.callback([]));
    }
    hasAttribute(name) {
      return name === "style" ? Boolean(this.style.length) : this.attrs.has(name);
    }
    append(child) {
      this.children.push(child);
      child.parent = this;
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((child) => child !== this);
      this.isConnected = false;
    }
    contains(child) {
      return child === this || this.children.some((node) => node.contains(child));
    }
    focus() {
      doc.activeElement = this;
    }
    showModal() {
      if (nativeFailure) throw new Error("native unavailable");
      this.setAttribute("open", "");
    }
    close() {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    }
  }
  const html = new Host("html"),
    body = new Host("body"),
    head = new Host("head"),
    app = new Host("main");
  body.append(app);
  html.dataset.worldEffects = "full";
  const doc = new EventTarget();
  Object.assign(doc, {
    documentElement: html,
    body,
    head,
    hidden: false,
    activeElement: body,
    createElement(tag) {
      const node = new Host(tag);
      if (tag === "link" && styleReady) node.sheet = {};
      return node;
    },
  });
  const win = new EventTarget(),
    media = new EventTarget(),
    connection = new EventTarget();
  media.matches = calm;
  const timeout = (fn, ms) => {
    timers.set(++serial, { fn, at: clock + ms });
    return serial;
  };
  const clear = (id) => timers.delete(id);
  const raf = (fn) => {
    frames.set(++serial, fn);
    return serial;
  };
  const storage = { setItem: (...args) => storageWrites.push(args) };
  Object.assign(win, {
    innerWidth: 1024,
    innerHeight: 768,
    setTimeout: timeout,
    clearTimeout: clear,
    requestAnimationFrame: raf,
    cancelAnimationFrame: (id) => frames.delete(id),
    visualViewport: new EventTarget(),
    localStorage: storage,
    sessionStorage: storage,
  });
  let rendererOptions;
  const renderer = {
    backend: "webgl2",
    resize() {},
    render() {
      renders++;
    },
    dispose() {
      disposals++;
    },
  };
  const jsx = (type, props) => ({ type, props });
  const compiled = ts.transpileModule(bytes("src/components/ciel-inferno.tsx").toString(), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    document: doc,
    window: win,
    navigator: { connection },
    HTMLElement: Host,
    Node: Host,
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        this.target = target;
      }
      disconnect() {
        this.target = null;
      }
    },
    performance: { now: () => clock },
    innerWidth: 1024,
    innerHeight: 768,
    matchMedia: (query) => (query.includes("pointer:") ? { matches: false } : media),
    requestAnimationFrame: raf,
    cancelAnimationFrame: (id) => frames.delete(id),
    clearTimeout: clear,
    queueMicrotask,
    Event,
    require(name) {
      if (name === "react")
        return {
          useRef(current) {
            const id = refIndex++;
            return (refs[id] ||= { current });
          },
          useState(initial) {
            const id = stateIndex++;
            if (!(id in states)) states[id] = initial;
            return [
              states[id],
              (value) => {
                states[id] = value;
                dirty = true;
              },
            ];
          },
          useId: () => "inferno-test",
          useEffect(fn, deps) {
            const id = effectIndex++,
              previous = effects[id];
            if (!previous || deps.some((value, i) => value !== previous.deps[i]))
              effects[id] = { fn, deps, pending: true, cleanup: previous?.cleanup };
          },
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: fragment };
      if (name === "react-dom") return { createPortal: (tree) => tree };
      if (name === "@/lib/ciel-inferno-renderer")
        return {
          CIEL_INFERNO_DURATION: 9200,
          createCielInfernoRenderer(options) {
            rendererOptions = options;
            return renderer;
          },
        };
      if (name.endsWith(".css?url")) return { default: "inferno-test.css" };
      throw new Error(`Unexpected component import ${name}`);
    },
  });
  let props = { origin: { x: 0.8, y: 0.7 }, onCommit: () => commits++, routeKey: "/world" };
  let modal;
  const build = (tree) => {
    if (tree == null || typeof tree === "boolean" || typeof tree === "string") return [];
    if (Array.isArray(tree)) return tree.flatMap(build);
    if (tree.type === fragment) return build(tree.props.children);
    const node = tree.props.ref?.current || new Host(tree.type);
    if (tree.props.ref) tree.props.ref.current = node;
    node.className = tree.props.className || "";
    for (const [name, value] of Object.entries(tree.props)) {
      if (name.startsWith("data-"))
        node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    Object.assign(node.style, tree.props.style);
    node.children = build(tree.props.children);
    for (const child of node.children) child.parent = node;
    return [node];
  };
  const render = () => {
    refIndex = stateIndex = effectIndex = 0;
    dirty = false;
    modal = build(exports.default(props))[0];
    body.children = [app, modal];
    modal.parent = body;
    for (const effect of effects)
      if (effect.pending) {
        effect.pending = false;
        effect.cleanup = effect.fn();
      }
    if (dirty) render();
  };
  const descendants = (node) => [node, ...node.children.flatMap(descendants)];
  render();
  return {
    doc,
    win,
    app,
    html,
    body,
    media,
    storageWrites,
    timers,
    frames,
    get modal() {
      return modal;
    },
    get commits() {
      return commits;
    },
    get disposals() {
      return disposals;
    },
    get renders() {
      return renders;
    },
    get rendererOptions() {
      return rendererOptions;
    },
    nodes: (tag) => descendants(modal).filter((node) => node.tagName === tag.toUpperCase()),
    flush() {
      if (dirty) render();
    },
    async settleMicrotasks() {
      await Promise.resolve();
      await Promise.resolve();
      if (dirty) render();
    },
    advance(ms) {
      clock += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= clock && timers.delete(id)) timer.fn();
      if (dirty) render();
    },
    route(routeKey) {
      props = { ...props, routeKey };
      render();
    },
    dispose() {
      for (const effect of effects) effect.cleanup?.();
    },
  };
}

function assertBurned(host) {
  assert.equal(host.modal.open, true);
  assert.equal(host.modal.dataset.phase, "burned");
  assert.equal(host.modal.dataset.ready, "true");
  assert.equal(host.modal.dataset.renderer, "stopped");
  assert.equal(host.modal.style.background, "#000");
  for (const tag of ["canvas", "img", "button"]) assert.equal(host.nodes(tag).length, 0, tag);
  assert.equal(host.frames.size, 0);
  assert.equal(host.timers.size, 0);
  assert.equal(host.app.inert, true);
  assert.deepEqual(host.storageWrites, []);
}

test("the actual component naturally becomes a GPU-free burned shell and does not expire after fourteen seconds", () => {
  const host = mountInferno();
  assert.equal(host.commits, 1);
  assert.equal(host.nodes("canvas").length, 2);
  host.advance(9200);
  assertBurned(host);
  assert.equal(host.disposals, 1);
  host.advance(14000);
  assertBurned(host);
  assert.equal(host.commits, 1);
  assert.equal(host.disposals, 1);
});

test("Escape, external close, visibility, pageshow and same-document routes cannot restore a committed burn", async () => {
  const host = mountInferno();
  const cancel = new Event("cancel", { cancelable: true });
  host.modal.dispatchEvent(cancel);
  host.flush();
  assert.equal(cancel.defaultPrevented, true);
  assertBurned(host);
  host.modal.close();
  await host.settleMicrotasks();
  assertBurned(host);
  host.doc.hidden = true;
  host.doc.dispatchEvent(new Event("visibilitychange"));
  host.doc.hidden = false;
  host.doc.dispatchEvent(new Event("visibilitychange"));
  for (const type of ["pageshow", "popstate", "hashchange"])
    host.win.dispatchEvent(new Event(type));
  host.route("/library");
  await host.settleMicrotasks();
  assertBurned(host);
  assert.equal(host.disposals, 1);
});

for (const fault of ["renderer", "styles", "native-dialog"]) {
  test(`${fault} failure commits a persistent black surface instead of restoring the page`, () => {
    const host = mountInferno({
      nativeFailure: fault === "native-dialog",
      styleReady: fault !== "styles",
    });
    if (fault === "renderer") host.rendererOptions.onFailure();
    if (fault === "styles") host.doc.head.children[0].onerror();
    host.flush();
    assertBurned(host);
  });
}

test("calm rendering burns without creating a renderer, while only a fresh component/document starts unburned", () => {
  const host = mountInferno({ calm: true });
  assert.equal(host.rendererOptions, undefined);
  host.advance(1900);
  assertBurned(host);
  assert.equal(host.disposals, 0);
  const fresh = mountInferno({ calm: true });
  assert.equal(fresh.modal.dataset.phase, "awaken");
  assert.equal(fresh.nodes("canvas").length, 2);
  assert.equal(fresh.commits, 1);
});
