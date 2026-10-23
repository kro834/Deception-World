import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as data from "../src/components/gallery-tours/tour-data.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL("../src/components/gallery-tours/tour-theatre.tsx", import.meta.url),
  "utf8",
);

function mount(index, suspended = false, ready = false, playing = false) {
  const effects = [];
  const changes = [];
  const refs = [];
  const requests = [];
  const updates = [];
  const timers = [];
  let stateIndex = 0;
  const tour = data.GALLERY_TOURS[0];
  const exports = {};
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports,
      require(name) {
        if (name === "./tour-data") return data;
        if (name === "react")
          return {
            useCallback: (callback) => callback,
            useEffect: (effect) => effects.push(effect),
            useRef(value) {
              const ref = { current: value };
              refs.push(ref);
              return ref;
            },
            useState(value) {
              const current = stateIndex++;
              return [
                current === 0 && ready
                  ? { id: tour.stops[index].artworkId, status: "ready" }
                  : current === 1
                    ? playing
                    : value,
                (next) => updates.push([current, next]),
              ];
            },
          };
        return require(name);
      },
      navigator: {},
      document: { visibilityState: "visible" },
      window: {
        setTimeout(callback) {
          timers.push(callback);
          return timers.length;
        },
        clearTimeout() {},
      },
      Image: class {
        set src(value) {
          requests.push(value);
        }
      },
    },
  );
  const tree = exports.GalleryTourTheatre({
    tour,
    index,
    suspended,
    onIndexChange: (next) => changes.push(next),
    onExit() {},
  });
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  return { nodes, changes, refs, effects, requests, updates, timers, tour };
}

function key(key, extra = {}) {
  return {
    key,
    preventDefault() {
      this.prevented = true;
    },
    ...extra,
  };
}

test("filmstrip provides one Tab stop and arrows move selection and focus together", () => {
  const view = mount(2);
  const thumbs = view.nodes.filter((node) => node.props?.className === "gallery-tour-thumbnail");
  assert.deepEqual(
    thumbs.map((node) => node.props.tabIndex),
    thumbs.map((_, index) => (index === 2 ? 0 : -1)),
  );
  const focused = [];
  view.refs[0].current = {
    querySelectorAll: () => thumbs.map((_, index) => ({ focus: () => focused.push(index) })),
  };
  for (const [pressed, expected] of [
    ["ArrowLeft", 1],
    ["ArrowRight", 3],
    ["Home", 0],
    ["End", thumbs.length - 1],
  ]) {
    const event = key(pressed);
    thumbs[2].props.onKeyDown(event);
    assert.equal(event.prevented, true);
    assert.equal(view.changes.at(-1), expected);
    assert.equal(focused.at(-1), expected);
  }
  const modified = key("ArrowRight", { ctrlKey: true });
  thumbs[2].props.onKeyDown(modified);
  assert.equal(modified.prevented, undefined);
});

test("stage Home and End navigate without intercepting nested retry controls", () => {
  const view = mount(2);
  const stage = view.nodes.find((node) => node.props?.id === "gallery-tour-stage");
  const target = {};
  for (const [pressed, expected] of [
    ["Home", 0],
    ["End", view.tour.stops.length - 1],
  ]) {
    stage.props.onKeyDown(key(pressed, { target, currentTarget: target }));
    assert.equal(view.changes.at(-1), expected);
  }
  const nested = key("Home", { target: {}, currentTarget: target });
  stage.props.onKeyDown(nested);
  assert.equal(nested.prevented, undefined);
});

test("repeated boundary keys retain focus and stop playback without navigating past the tour", () => {
  for (const [index, pressed] of [
    [0, "ArrowLeft"],
    [data.GALLERY_TOURS[0].stops.length - 1, "ArrowRight"],
  ]) {
    const view = mount(index, false, true, true);
    const thumbs = view.nodes.filter((node) => node.props?.className === "gallery-tour-thumbnail");
    const focused = [];
    view.refs[0].current = {
      querySelectorAll: () => thumbs.map((_, item) => ({ focus: () => focused.push(item) })),
    };
    const event = key(pressed, { repeat: true });
    thumbs[index].props.onKeyDown(event);
    assert.equal(event.prevented, true);
    assert.deepEqual(view.changes, []);
    assert.deepEqual(focused, [index]);
    assert.ok(view.updates.some(([state, next]) => state === 1 && next === false));
  }
});

test("manual thumbnail movement stops playback even before the URL selection commits", () => {
  const view = mount(2, false, true, true);
  const thumb = view.nodes.find(
    (node) => node.props?.className === "gallery-tour-thumbnail" && node.props.tabIndex === 0,
  );
  thumb.props.onKeyDown(key("ArrowRight", { repeat: true }));
  assert.deepEqual(view.changes, [3]);
  assert.ok(view.updates.some(([state, next]) => state === 1 && next === false));
});

test("adjacent full images are requested only while the theatre is visible and unsuspended", () => {
  for (const suspended of [false, true]) {
    const view = mount(2, suspended, true);
    const prefetch = view.effects.find((effect) => String(effect).includes("new Image"));
    assert.ok(prefetch);
    prefetch();
    assert.equal(view.requests.length, suspended ? 0 : 1);
    if (!suspended)
      assert.equal(view.requests[0], data.getTourArtwork(view.tour.stops[3].artworkId).full);
  }
});

test("opening a menu stops playback and closing it does not restart a stopped tour", () => {
  const open = mount(2, true, true, true);
  open.effects.find((effect) => String(effect).includes("window.setTimeout"))();
  assert.equal(open.timers.length, 0);
  open.effects.find((effect) => String(effect).includes("!suspended || !playing"))();
  assert.ok(open.updates.some(([state, next]) => state === 1 && next === false));
  const closed = mount(2, false, true, false);
  closed.effects.find((effect) => String(effect).includes("window.setTimeout"))();
  assert.equal(closed.timers.length, 0);
});

test("automatic playback advances one stop and finishes the last artwork without looping", () => {
  const middle = mount(2, false, true, true);
  middle.effects.find((effect) => String(effect).includes("window.setTimeout"))();
  middle.timers[0]();
  assert.deepEqual(middle.changes, [3]);
  const last = mount(middle.tour.stops.length - 1, false, true, true);
  last.effects.find((effect) => String(effect).includes("window.setTimeout"))();
  last.timers[0]();
  assert.deepEqual(last.changes, []);
  assert.ok(last.updates.some(([state, next]) => state === 1 && next === false));
  assert.ok(last.updates.some(([state, next]) => state === 3 && next === true));
});

test("image failure stops playback and a successful retry does not restart it", () => {
  const view = mount(2, false, true, true);
  const frame = view.nodes.find((node) => node.type?.name === "TourArtwork");
  frame.props.onStatus("error");
  assert.ok(view.updates.some(([state, next]) => state === 1 && next === false));
  view.updates.length = 0;
  frame.props.onStatus("loading");
  frame.props.onStatus("ready");
  assert.equal(view.updates.filter(([state]) => state === 1).length, 0);
  assert.equal(view.updates.at(-1)[1].status, "ready");
});
