import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const annex = read("src/components/world/world-annex.tsx");
const hook = annex.slice(
  annex.indexOf("function useMeasuredGlossaryCards()"),
  annex.indexOf("export function Glossary()"),
);
const js = ts.transpileModule(hook, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount({ supported = true } = {}) {
  let cleanup;
  const cards = Array.from({ length: 2 }, () => ({
    dataset: {},
    style: {
      values: {},
      setProperty(k, v) {
        this.values[k] = v;
      },
      removeProperty(k) {
        delete this.values[k];
      },
    },
  }));
  const root = { children: cards };
  const ios = [],
    ros = [];
  class IO {
    constructor(fn) {
      this.fn = fn;
      ios.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  class RO {
    constructor(fn) {
      this.fn = fn;
      ros.push(this);
    }
    observe() {}
    disconnect() {}
  }
  const fonts = new EventTarget();
  fonts.status = "loaded";
  const columns = new EventTarget();
  columns.matches = false;
  const result = new Function(
    "useRef",
    "useEffect",
    "IntersectionObserver",
    "ResizeObserver",
    "CSS",
    "window",
    "document",
    "getComputedStyle",
    js + "\nreturn useMeasuredGlossaryCards();",
  )(
    () => ({ current: root }),
    (fn) => {
      cleanup = fn();
    },
    IO,
    RO,
    { supports: () => supported },
    { matchMedia: () => columns },
    { fonts },
    () => ({
      paddingTop: "10px",
      paddingBottom: "10px",
      borderTopWidth: "1px",
      borderBottomWidth: "1px",
    }),
  );
  return {
    cards,
    ios,
    ros,
    fonts,
    columns,
    result,
    cleanup,
    reveal: (card = cards[0], visible = true) =>
      ios
        .at(-1)
        .fn([{ target: card, isIntersecting: visible, boundingClientRect: { height: 120 } }]),
  };
}

test("fresh and unsupported cards keep natural layout, and only an actually visible measured content box is cached", () => {
  const state = mount();
  assert.ok(state.cards.every((card) => !card.dataset.readingMeasured));
  state.reveal(state.cards[0], false);
  assert.ok(!state.cards[0].dataset.readingMeasured);
  state.reveal();
  assert.equal(
    state.cards[0].style.values["--reading-block-size"],
    "98px",
    "padding and borders are excluded",
  );
  assert.equal(state.cards[0].dataset.readingMeasured, "true");
  assert.ok(!state.cards[1].dataset.readingMeasured);
  state.cleanup();
  assert.ok(!state.cards[0].dataset.readingMeasured);
  const unsupported = mount({ supported: false });
  assert.equal(unsupported.ios.length, 0);
  assert.equal(unsupported.ros.length, 0);
});

test("width, font and column changes discard measured heights, including callbacks from a retired observer", () => {
  const state = mount();
  state.reveal();
  const stale = state.ios[0];
  state.ros[0].fn([{ contentRect: { width: 320 } }]);
  assert.ok(!state.cards[0].dataset.readingMeasured);
  stale.fn([{ target: state.cards[0], isIntersecting: true, boundingClientRect: { height: 120 } }]);
  assert.ok(!state.cards[0].dataset.readingMeasured);
  state.reveal();
  state.fonts.status = "loading";
  state.fonts.dispatchEvent(new Event("loading"));
  assert.ok(!state.cards[0].dataset.readingMeasured);
  state.fonts.status = "loaded";
  state.fonts.dispatchEvent(new Event("loadingdone"));
  state.reveal();
  assert.equal(state.cards[0].dataset.readingMeasured, "true");
  state.columns.matches = true;
  state.columns.dispatchEvent(new Event("change"));
  assert.ok(!state.cards[0].dataset.readingMeasured);
  state.cleanup();
});

test("only measured single-column static terms defer rendering, while hashes, focus, print and unsupported CSS retain normal layout", () => {
  const css = read("src/styles-world-common.css");
  assert.match(
    css,
    /@supports \(content-visibility: auto\) and \(contain-intrinsic-block-size: auto 1px\)/,
  );
  assert.match(css, /@media screen and \(max-width: 1099px\)/);
  assert.match(css, /html:not\(\[data-route-restoring\]\):not\(:has\(:target\)\)/);
  assert.match(css, /\.wa-glossary\s*> div\[data-reading-measured="true"\]:not\(:focus-within\)/);
  assert.match(css, /contain-intrinsic-block-size: auto var\(--reading-block-size\)/);
  assert.equal([...css.matchAll(/content-visibility:\s*auto;/g)].length, 1);
  assert.match(annex, /<dl ref=\{register\} className="wa-glossary">/);
});
