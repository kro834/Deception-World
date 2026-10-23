import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as data from "../src/components/gallery-tours/tour-data.ts";
import * as progress from "../src/components/gallery-tours/tour-progress.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/components/gallery-tours/tours-page.tsx", import.meta.url),
  "utf8",
);

function mount() {
  const effects = [];
  const refs = [];
  const updates = [];
  const listeners = new Map();
  const storage = { getItem: () => null, setItem() {} };
  let blocked = false;
  const window = {
    get localStorage() {
      if (blocked) throw new Error("Denied");
      return storage;
    },
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => {
      if (listeners.get(name) === handler) listeners.delete(name);
    },
  };
  let state = 0;
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      window,
      require(name) {
        if (name === "react")
          return {
            useState: (value) => {
              const index = state++;
              return [value, (next) => updates.push([index, next])];
            },
            useRef: (value) => {
              const ref = { current: value };
              refs.push(ref);
              return ref;
            },
            useEffect: (effect) => effects.push(effect),
            useCallback: (callback) => callback,
          };
        if (name === "./tour-data") return data;
        if (name === "./tour-progress") return progress;
        if (name === "@/components/world/use-world-mode") return { useWorldMode() {} };
        if (name === "react/jsx-runtime") return require(name);
        return new Proxy({}, { get: (_, key) => key });
      },
    },
  );
  const tour = data.GALLERY_TOURS[0];
  const tree = exports.GalleryToursPage({
    tourId: tour.id,
    workId: tour.stops[0].artworkId,
    onSelect() {},
    onExit() {},
  });
  const effect = effects.find((item) => String(item).includes('addEventListener("storage"'));
  assert.ok(effect);
  return {
    effect,
    refs,
    updates,
    storage,
    listeners,
    tree,
    tour,
    block: (value) => {
      blocked = value;
    },
  };
}

test("storage recovery clears the unavailable message and cleanup removes the listener", () => {
  const view = mount();
  view.block(true);
  const cleanup = view.effect();
  assert.match(view.updates.at(-1)[1], /保存できません/);
  view.block(false);
  const saved = { [view.tour.id]: { workId: view.tour.stops[1].artworkId, updatedAt: 1 } };
  view.storage.getItem = () => JSON.stringify(saved);
  view.listeners.get("storage")({ key: progress.TOUR_PROGRESS_KEY, storageArea: view.storage });
  assert.deepEqual(view.updates.at(-2), [1, saved]);
  assert.deepEqual(view.updates.at(-1), [2, ""]);
  cleanup();
  assert.equal(view.listeners.has("storage"), false);
});

test("storage sync ignores other keys and storage areas and contains throwing getters", () => {
  const view = mount();
  view.effect();
  const sync = view.listeners.get("storage");
  const count = view.updates.length;
  sync({ key: progress.TOUR_PROGRESS_KEY, storageArea: {} });
  view.block(true);
  sync({
    key: "another-key",
    get storageArea() {
      return assert.fail("unrelated event");
    },
  });
  assert.equal(view.updates.length, count);
  assert.doesNotThrow(() => sync({ key: null, storageArea: view.storage }));
  assert.match(view.updates.at(-1)[1], /保存できません/);
  assert.doesNotThrow(() =>
    sync({
      key: progress.TOUR_PROGRESS_KEY,
      get storageArea() {
        throw new Error("Denied");
      },
    }),
  );
});

test("late artwork notification cannot overwrite a different active position", () => {
  const view = mount();
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  };
  visit(view.tree);
  assert.equal(nodes.find((node) => node.type === "main")?.props.id, "main");
  const theatre = nodes.find((node) => node.type === "GalleryTourTheatre");
  const position = view.refs.find((ref) => ref.current?.tourId === view.tour.id);
  position.current = { tourId: view.tour.id, workId: view.tour.stops[1].artworkId };
  theatre.props.onArtworkReady(view.tour.stops[0].artworkId);
  assert.equal(view.updates.length, 0);
  position.current = { tourId: data.GALLERY_TOURS[1].id, workId: view.tour.stops[0].artworkId };
  theatre.props.onArtworkReady(view.tour.stops[0].artworkId);
  assert.equal(view.updates.length, 0);
});

test("the last saved artwork remains resumable and offers a separate restart action", () => {
  const entranceSource = readFileSync(
    new URL("../src/components/gallery-tours/tour-entrance.tsx", import.meta.url),
    "utf8",
  );
  const exports = {};
  runInNewContext(
    ts.transpileModule(entranceSource, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require: (name) => (name === "./tour-data" ? data : require(name)),
    },
  );
  const tour = data.GALLERY_TOURS[0];
  const last = tour.stops.at(-1).artworkId;
  const starts = [];
  const tree = exports.GalleryTourEntrance({
    progress: { [tour.id]: { workId: last, updatedAt: 1 } },
    onStart: (...args) => starts.push(args),
    onReset() {},
  });
  const nodes = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  };
  visit(tree);
  const resume = nodes.find(
    (node) => node.props?.["aria-label"] === `最後の作品をもう一度：${tour.title}`,
  );
  const restart = nodes.find(
    (node) => node.props?.["aria-label"] === `${tour.title}を最初から巡る`,
  );
  assert.ok(resume);
  assert.ok(restart);
  resume.props.onClick();
  restart.props.onClick();
  assert.deepEqual(starts, [[tour.id, last], [tour.id]]);
});

test("manual sharing stays natively editable and each failed retry resets the canonical URL", () => {
  const href = "https://example.test/gallery-tours?tour=starlight&work=g05";
  const values = ["", { href, attempt: 1 }, false];
  const updates = [];
  const refs = [];
  let state = 0;
  const exports = {};
  runInNewContext(
    ts.transpileModule(`${source}\nexport { TourShareLink };`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      URL,
      window: { location: { origin: "https://example.test" } },
      navigator: { clipboard: undefined },
      require(name) {
        if (name === "react")
          return {
            useState: () => {
              const index = state++;
              return [values[index], (next) => updates.push([index, next])];
            },
            useRef: (value) => {
              const ref = { current: value };
              refs.push(ref);
              return ref;
            },
            useEffect() {},
          };
        if (name === "react/jsx-runtime") return require(name);
        return {};
      },
    },
  );
  const tree = exports.TourShareLink({ tourId: "starlight", workId: "g05" });
  const input = tree.props.children.find((node) => node.type === "input");
  assert.equal(input.props.type, "url");
  assert.equal(input.props.readOnly, undefined);
  assert.equal(input.props.value, undefined);
  assert.equal(input.props.defaultValue, href);
  assert.equal(input.key, "1");
  let selected = false;
  input.props.onFocus({ currentTarget: { select: () => (selected = true) } });
  assert.equal(selected, true);

  // A synchronous clipboard failure is batched by React, so clearing the field alone
  // need not unmount it. A new key must restore the canonical URL after manual edits.
  refs.at(-1).current = 1;
  const button = tree.props.children.find((node) => node.type === "button");
  button.props.onClick();
  const fallback = updates.findLast(([index, value]) => index === 1 && value !== null)[1];
  assert.equal(fallback.href, href);
  assert.equal(fallback.attempt, 2);
  assert.equal(refs[2].current, false);
});
