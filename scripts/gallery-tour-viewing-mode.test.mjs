import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as data from "../src/components/gallery-tours/tour-data.ts";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/components/gallery-tours/tour-theatre.tsx", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function mount({ index = 0, ready = true, playing = false, nextTour = true } = {}) {
  const tour = data.GALLERY_TOURS[0];
  const state = [];
  const changes = [];
  const exports = {};
  let cursor = 0;
  let nextTours = 0;
  let exits = 0;
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "./tour-data") return data;
      if (name !== "react") return require(name);
      return {
        useCallback: (callback) => callback,
        useEffect() {},
        useRef: (value) => ({ current: value }),
        useState(initial) {
          const current = cursor++;
          if (!(current in state)) {
            state[current] =
              current === 0 && ready
                ? { id: tour.stops[index].artworkId, status: "ready" }
                : current === 1
                  ? playing
                  : initial;
          }
          return [
            state[current],
            (value) => {
              state[current] = typeof value === "function" ? value(state[current]) : value;
            },
          ];
        },
      };
    },
  });
  function render() {
    cursor = 0;
    const tree = exports.GalleryTourTheatre({
      tour,
      index,
      onIndexChange: (value) => changes.push(value),
      onExit: () => exits++,
      nextTour: nextTour ? data.GALLERY_TOURS[1] : undefined,
      onNextTour: nextTour ? () => nextTours++ : undefined,
    });
    const nodes = [];
    function visit(node) {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(visit);
      nodes.push(node);
      visit(node.props?.children);
    }
    visit(tree);
    return {
      tree,
      nodes,
      find: (className) =>
        nodes.find((node) => node.props?.className?.split(" ").includes(className)),
    };
  }
  return { render, state, changes, nextTours: () => nextTours, exits: () => exits };
}

test("work selection starts open, can be hidden, and manual browsing stops autoplay", () => {
  const view = mount({ playing: true });
  let rendered = view.render();
  const toggle = rendered.find("gallery-tour-selection-toggle");
  assert.equal(toggle.props["aria-expanded"], true);
  assert.equal(toggle.props["aria-controls"], rendered.find("gallery-tour-filmstrip").props.id);
  assert.equal(rendered.find("gallery-tour-filmstrip").props.hidden, false);
  toggle.props.onClick();
  rendered = view.render();
  assert.equal(rendered.find("gallery-tour-selection-toggle").props["aria-expanded"], false);
  assert.equal(rendered.find("gallery-tour-filmstrip").props.hidden, true);
  assert.equal(view.state[1], false);
  assert.deepEqual(view.changes, []);
});

test("focused viewing preserves autoplay intent and exposes its own explicit stop control", () => {
  const view = mount({ playing: true });
  view.render().find("gallery-tour-focus-toggle").props.onClick();
  let rendered = view.render();
  assert.equal(rendered.tree.props["data-focused"], true);
  assert.equal(rendered.find("gallery-tour-reading-column").props.hidden, true);
  assert.equal(rendered.find("gallery-tour-filmstrip").props.hidden, true);
  assert.equal(rendered.find("gallery-tour-focused-play").props["aria-pressed"], true);
  assert.equal(view.state[1], true);
  rendered.find("gallery-tour-focused-play").props.onClick();
  rendered = view.render();
  assert.equal(rendered.find("gallery-tour-focused-play").props["aria-pressed"], false);
  assert.equal(view.state[1], false);
});

test("focused viewing can reopen work selection or return with Escape without changing artwork", () => {
  const view = mount();
  view.render().find("gallery-tour-focus-toggle").props.onClick();
  view.render().find("gallery-tour-selection-toggle").props.onClick();
  let rendered = view.render();
  assert.equal(rendered.tree.props["data-focused"], undefined);
  assert.equal(rendered.find("gallery-tour-filmstrip").props.hidden, false);
  rendered.find("gallery-tour-focus-toggle").props.onClick();
  const event = {
    key: "Escape",
    preventDefault() {
      this.prevented = true;
    },
  };
  view.render().tree.props.onKeyDown(event);
  rendered = view.render();
  assert.equal(event.prevented, true);
  assert.equal(rendered.find("gallery-tour-reading-column").props.hidden, false);
  assert.deepEqual(view.changes, []);
});

test("the next tour is offered only after the final artwork is ready and requires a click", () => {
  const index = data.GALLERY_TOURS[0].stops.length - 1;
  assert.equal(mount({ index, ready: false }).render().find("gallery-tour-ending"), undefined);
  assert.equal(mount({ index: 0 }).render().find("gallery-tour-ending"), undefined);
  const view = mount({ index, playing: true });
  view.render().find("gallery-tour-focus-toggle").props.onClick();
  const rendered = view.render();
  assert.ok(rendered.find("gallery-tour-ending"));
  assert.equal(view.nextTours(), 0);
  rendered.find("gallery-tour-next-tour").props.onClick();
  assert.equal(view.nextTours(), 1);
  assert.equal(view.state[1], false);
  assert.deepEqual(view.changes, []);
  const fallback = mount({ index, nextTour: false });
  fallback.render().find("gallery-tour-ending-exit").props.onClick();
  assert.equal(fallback.exits(), 1);
});
