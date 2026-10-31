import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(
    new URL("../src/components/artwork-stage/artwork-stage.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const art = (id) => ({ id, src: `/${id}.webp`, width: 600, height: 900, alt: id });
function harness({ reduced = false, economy = false, media } = {}) {
  const state = [],
    effects = [],
    timers = new Map(),
    listeners = new Set();
  let index = 0,
    dirty = false,
    sequence = 0,
    props = { artwork: art("a"), variant: "home", media },
    tree;
  const query = {
    matches: reduced,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const exports = {},
    jsx = (type, props) => ({ type, props });
  runInNewContext(code, {
    exports,
    document: { documentElement: { dataset: economy ? { worldEffects: "economy" } : {} } },
    window: {
      matchMedia: () => query,
      setTimeout: (fn, ms) => {
        const id = ++sequence;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    require: (name) =>
      name === "react/jsx-runtime"
        ? { jsx, jsxs: jsx }
        : {
            useState(initial) {
              const at = index++;
              if (!(at in state)) state[at] = initial;
              return [
                state[at],
                (value) => {
                  const next = typeof value === "function" ? value(state[at]) : value;
                  if (next !== state[at]) {
                    state[at] = next;
                    dirty = true;
                  }
                },
              ];
            },
            useRef(initial) {
              const at = index++;
              if (!(at in state)) state[at] = { current: initial };
              return state[at];
            },
            useEffect(fn, deps) {
              const at = index++;
              const previous = effects[at];
              if (!previous || deps.some((value, i) => value !== previous.deps[i]))
                effects[at] = { fn, deps, pending: true, cleanup: previous?.cleanup };
            },
          },
  });
  const nodes = (node) =>
    !node || typeof node !== "object"
      ? []
      : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const dom = new Map();
  function render() {
    let attempts = 0;
    do {
      if (++attempts > 20) throw new Error("render did not settle");
      dirty = false;
      index = 0;
      tree = exports.ArtworkStage(props);
      if (dirty) continue;
      for (const node of nodes(tree))
        if (node.props?.ref) {
          const key = node.props.className + props.artwork.id;
          if (!dom.has(key))
            dom.set(key, { querySelector: () => ({ complete: false, naturalWidth: 0 }) });
          node.props.ref.current = dom.get(key);
        }
      for (const effect of effects)
        if (effect?.pending) {
          effect.pending = false;
          effect.cleanup?.();
          effect.cleanup = effect.fn();
        }
    } while (dirty);
    return tree;
  }
  render();
  const capture = () => {
    const node = nodes(tree).find((node) => node.props?.onLoadCapture);
    const target = node?.props.ref.current;
    return {
      load: () => {
        node?.props.onLoadCapture({ currentTarget: target });
        render();
      },
      error: () => {
        node?.props.onErrorCapture({ currentTarget: target });
        render();
      },
    };
  };
  return {
    capture,
    load() {
      capture().load();
    },
    error() {
      capture().error();
    },
    waiting: () => tree.props["data-waiting"],
    failed: () => tree.props["data-failed"],
    alerts: () => nodes(tree).filter((node) => node.props?.role === "alert").length,
    render,
    select(id) {
      props = { ...props, artwork: art(id) };
      return render();
    },
    images: () =>
      nodes(tree)
        .filter((node) => node.type === "img")
        .map((node) => node.props.src),
    timers,
    finish() {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach(({ fn }) => fn());
      render();
    },
    reduce() {
      query.matches = true;
      listeners.forEach((fn) => fn());
      render();
    },
    dispose() {
      effects.forEach((effect) => effect?.cleanup?.());
    },
    listeners,
  };
}

test("slow loading retains the last visible artwork until successful load, then exits in 560ms", () => {
  const stage = harness();
  stage.load();
  stage.select("b");
  assert.deepEqual(stage.images(), ["/a.webp", "/b.webp"]);
  assert.equal(stage.waiting(), true);
  assert.equal(stage.timers.size, 0);
  stage.finish();
  assert.deepEqual(stage.images(), ["/a.webp", "/b.webp"]);
  stage.load();
  assert.equal(stage.waiting(), false);
  assert.equal([...stage.timers.values()][0].ms, 560);
  stage.finish();
  assert.deepEqual(stage.images(), ["/b.webp"]);
});
test("rapid pending selections retain the last loaded image and ignore stale load and error events", () => {
  const stage = harness();
  stage.load();
  stage.select("b");
  const stale = stage.capture();
  stage.select("c");
  assert.deepEqual(stage.images(), ["/a.webp", "/c.webp"]);
  stale.load();
  stale.error();
  assert.equal(stage.waiting(), true);
  assert.equal(stage.failed(), false);
  assert.equal(stage.timers.size, 0);
  stage.load();
  const timer = [...stage.timers.keys()][0];
  const staleCompletion = stage.timers.get(timer).fn;
  stage.select("d");
  staleCompletion();
  stage.render();
  assert.equal(stage.timers.has(timer), false);
  assert.deepEqual(stage.images(), ["/c.webp", "/d.webp"]);
  stage.load();
  stage.finish();
  assert.deepEqual(stage.images(), ["/d.webp"]);
  stage.dispose();
  assert.equal(stage.listeners.size, 0);
});
test("failed images keep the last visible artwork with an alert and never start an exit timer", () => {
  const stage = harness();
  stage.load();
  stage.select("b");
  stage.error();
  assert.equal(stage.alerts(), 1);
  assert.equal(stage.failed(), true);
  assert.deepEqual(stage.images(), ["/a.webp"]);
  stage.finish();
  assert.deepEqual(stage.images(), ["/a.webp"]);
  stage.select("c");
  stage.load();
  stage.finish();
  assert.deepEqual(stage.images(), ["/c.webp"]);
  assert.equal(stage.alerts(), 0);
});
test("reduced motion preserves slow-loading fallback then swaps immediately without timers", () => {
  const stage = harness({ reduced: true });
  stage.load();
  stage.select("b");
  assert.deepEqual(stage.images(), ["/a.webp", "/b.webp"]);
  stage.load();
  assert.deepEqual(stage.images(), ["/b.webp"]);
  assert.equal(stage.timers.size, 0);
  const active = harness();
  active.load();
  active.select("b");
  active.load();
  active.reduce();
  assert.deepEqual(active.images(), ["/b.webp"]);
  assert.equal(active.timers.size, 0);
});
test("economy waits for load then exits briefly; unmount and caller-owned media cancel work", () => {
  const stage = harness({ economy: true });
  stage.load();
  stage.select("b");
  assert.equal(stage.timers.size, 0);
  stage.load();
  assert.equal([...stage.timers.values()][0].ms, 180);
  stage.dispose();
  assert.equal(stage.timers.size, 0);
  const custom = harness({ media: { type: "img", props: { src: "/owned.webp" } } });
  custom.select("b");
  assert.deepEqual(custom.images(), ["/owned.webp"]);
  assert.equal(custom.waiting(), false);
});
