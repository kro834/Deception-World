import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/ciel-sequin.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

function mount({ failure = false, reduced = false, economy = false } = {}) {
  class Target extends EventTarget {
    listeners = new Set();
    addEventListener(type, fn, options) {
      super.addEventListener(type, fn, options);
      this.listeners.add(fn);
    }
    removeEventListener(type, fn, options) {
      super.removeEventListener(type, fn, options);
      this.listeners.delete(fn);
    }
  }
  const document = new Target(),
    window = new Target(),
    media = new Target(),
    connection = new Target();
  const observers = [],
    resizeObservers = [],
    effects = [],
    refs = [],
    states = [],
    instances = [];
  let ref = 0,
    state = 0,
    effect = 0,
    imports = 0,
    tree;
  const head = {
    children: [],
    append(node) {
      this.children.push(node);
    },
  };
  Object.assign(document, {
    documentElement: { dataset: { worldEffects: economy ? "economy" : "full" } },
    head,
    hidden: false,
    createElement() {
      return {
        remove() {
          head.children = head.children.filter((node) => node !== this);
        },
      };
    },
  });
  media.matches = reduced;
  window.visualViewport = new Target();
  const module = {
    createCielSequinRenderer(options) {
      if (failure) throw new Error("GPU setup unavailable");
      const instance = {
        options,
        sizes: [],
        pauses: [],
        faces: [],
        fits: [],
        disposals: 0,
        resize(...size) {
          this.sizes.push(size);
        },
        setPaused(value) {
          this.pauses.push(value);
        },
        setFace(value) {
          this.faces.push(value);
        },
        setImageFit(value) {
          this.fits.push(value);
        },
        dispose() {
          this.disposals++;
        },
      };
      instances.push(instance);
      return instance;
    },
  };
  const jsx = (type, props) => {
    if (props.ref && !props.ref.current)
      props.ref.current = {
        getBoundingClientRect: () => ({ width: 834, height: 1194 }),
      };
    return { type, props };
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    document,
    window,
    navigator: { connection },
    innerWidth: 834,
    matchMedia: (query) => (query.includes("pointer:") ? { matches: false } : media),
    ResizeObserver: class {
      constructor(fn) {
        this.fn = fn;
        resizeObservers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
    MutationObserver: class {
      constructor(fn) {
        this.fn = fn;
        observers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
    require(name) {
      if (name === "react")
        return {
          useRef(current) {
            return (refs[ref++] ||= { current });
          },
          useState(initial) {
            const i = state++;
            if (!(i in states)) states[i] = initial;
            return [
              states[i],
              (next) => {
                states[i] = next;
              },
            ];
          },
          useId: () => "sequin-test",
          useEffect(fn) {
            if (!effects[effect++]) effects.push({ fn });
          },
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/ciel-sequin-renderer") {
        imports++;
        return module;
      }
      if (name.endsWith(".css?url")) return { default: "sequin.css" };
      throw new Error(name);
    },
  });
  const render = () => {
    ref = state = effect = 0;
    tree = exports.default();
    return tree;
  };
  const nodes = (type, node = tree) => {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => nodes(type, child));
    return [
      ...(node.type === type ? [node] : []),
      ...(node.props?.children === undefined ? [] : nodes(type, node.props.children)),
    ];
  };
  render();
  effects.forEach((item) => {
    item.cleanup = item.fn();
  });
  return {
    document,
    window,
    media,
    connection,
    instances,
    observers,
    resizeObservers,
    nodes,
    render,
    get tree() {
      return tree;
    },
    get imports() {
      return imports;
    },
    async ready() {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      render();
    },
    click(label) {
      nodes("button")
        .find((button) => button.props.children === label)
        .props.onClick();
      render();
    },
    dispose() {
      effects.forEach((item) => item.cleanup?.());
    },
  };
}

test("the modal surface starts on the front at cover fit, with keyboard controls reaching both faces and full image", async () => {
  const host = mount();
  assert.equal(host.instances.length, 0, "module creation is deferred beyond component render");
  await host.ready();
  const renderer = host.instances[0];
  assert.deepEqual(renderer.faces, ["front"]);
  assert.deepEqual(renderer.fits, ["cover"]);
  assert.deepEqual(renderer.sizes[0], [834, 1194]);
  host.click("絵を見る");
  assert.equal(renderer.faces.at(-1), "back");
  host.click("表に戻す");
  assert.equal(renderer.faces.at(-1), "front");
  host.click("画像全体");
  assert.equal(renderer.fits.at(-1), "contain");
  assert.equal(host.tree.props["data-image-fit"], "contain");
  host.click("画面いっぱい");
  assert.equal(renderer.fits.at(-1), "cover");
  host.dispose();
});

test("hidden and departing documents pause, return resumes, and disposal removes every external listener", async () => {
  const host = mount();
  await host.ready();
  const renderer = host.instances[0];
  host.document.hidden = true;
  host.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(renderer.pauses.at(-1), true);
  host.document.hidden = false;
  host.window.dispatchEvent(new Event("pagehide"));
  assert.equal(renderer.pauses.at(-1), true);
  host.window.dispatchEvent(new Event("pageshow"));
  assert.equal(renderer.pauses.at(-1), false);
  host.dispose();
  assert.equal(renderer.disposals, 1);
  for (const target of [
    host.document,
    host.window,
    host.media,
    host.connection,
    host.window.visualViewport,
  ])
    assert.equal(target.listeners.size, 0);
  assert.equal(host.document.head.children.length, 0);
  assert.ok(host.observers.every((item) => item.disconnected));
  assert.ok(host.resizeObservers.every((item) => item.disconnected));
});

test("preference changes replace the renderer once and retain the chosen face and fit", async () => {
  const host = mount();
  await host.ready();
  host.click("絵を見る");
  host.click("画像全体");
  host.document.documentElement.dataset.worldEffects = "economy";
  host.observers[0].fn();
  await host.ready();
  assert.equal(host.instances[0].disposals, 1);
  const replacement = host.instances[1];
  assert.equal(replacement.options.economy, true);
  assert.equal(replacement.options.imageUrl, "/ciel-sequin-20261028/ciel-768.webp");
  assert.deepEqual(replacement.faces, ["back"]);
  assert.deepEqual(replacement.fits, ["contain"]);
  host.observers[0].fn();
  await host.ready();
  assert.equal(host.instances.length, 2, "unchanged preferences do not reconstruct");
  host.dispose();
});

test("reduced motion remains operable, and unavailable GPU/module retains an ordinary accessible image", async () => {
  const reduced = mount({ reduced: true });
  await reduced.ready();
  assert.equal(reduced.instances[0].options.reducedMotion, true);
  reduced.click("絵を見る");
  assert.equal(reduced.instances[0].faces.at(-1), "back");
  reduced.dispose();
  const host = mount({ failure: true });
  await host.ready();
  assert.equal(host.tree.props["data-renderer"], "unavailable");
  host.click("絵を見る");
  const image = host.nodes("img")[0];
  assert.equal(image.props.hidden, false);
  assert.equal(image.props.alt, "眠っているシエル");
  host.click("画像全体");
  assert.equal(host.nodes("img")[0].props.style.objectFit, "contain");
  host.click("表に戻す");
  assert.equal(host.nodes("img")[0].props.hidden, true);
  host.dispose();
});

test("unmount before the deferred import resolves cannot create a renderer or publish a late state", async () => {
  const host = mount();
  host.dispose();
  await host.ready();
  assert.equal(host.instances.length, 0);
  assert.equal(host.document.head.children.length, 0);
});

test("controls used before renderer readiness are retained even when creation fails", async () => {
  for (const failure of [false, true]) {
    const host = mount({ failure });
    host.click("絵を見る");
    host.click("画像全体");
    await host.ready();
    if (failure) {
      const image = host.nodes("img")[0];
      assert.equal(image.props.hidden, false);
      assert.equal(image.props.style.objectFit, "contain");
    } else {
      assert.deepEqual(host.instances[0].faces, ["back"]);
      assert.deepEqual(host.instances[0].fits, ["contain"]);
      host.instances[0].options.onState("fallback");
      host.render();
      host.click("画面いっぱい");
      assert.equal(host.instances[0].fits.at(-1), "cover", "paint fallback shares fit controls");
    }
    host.dispose();
  }
});
