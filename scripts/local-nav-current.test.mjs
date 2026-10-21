import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = ts.transpileModule(read("src/lib/local-nav-current.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({
  available = true,
  hrefs = ["#performance", "#p14", "#stages", "#system"],
  height = 900,
  ids = ["performance", "p14", "stages", "system"],
  through = {},
} = {}) {
  const targets = new Map(ids.map((id) => [id, { id }]));
  const links = hrefs.map((href) => {
    const attributes = new Map([["href", href]]);
    if (through[href]) attributes.set("data-local-nav-through", through[href]);
    return {
      attributes,
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
    };
  });
  const observers = [];
  class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = new Set();
      observers.push(this);
    }
    observe(target) {
      this.observed.add(target);
    }
    disconnect() {
      this.observed.clear();
      this.disconnected = true;
    }
  }
  const frames = new Map();
  const listeners = new Set();
  let frameId = 0;
  const root = { clientHeight: height };
  const window = {
    innerHeight: height,
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    addEventListener(type, callback, options) {
      assert.equal(type, "resize");
      assert.equal(options.passive, true);
      listeners.add(callback);
    },
    removeEventListener(type, callback) {
      assert.equal(type, "resize");
      assert.equal(listeners.delete(callback), true);
    },
  };
  const context = {
    exports: {},
    window,
    document: { documentElement: root, getElementById: (id) => targets.get(id) ?? null },
    IntersectionObserver: available ? IntersectionObserver : undefined,
  };
  runInNewContext(code, context);
  const nav = {
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href^="#"]');
      return links;
    },
  };
  return {
    links,
    targets,
    observers,
    root,
    frames,
    listeners,
    nav,
    mount: context.exports.mountLocalNavCurrent,
    current: () =>
      links
        .filter((link) => link.getAttribute("aria-current") === "location")
        .map((link) => link.getAttribute("href")),
    cross(entries) {
      observers.at(-1).callback(
        entries.map(([id, isIntersecting]) => ({
          target: targets.get(id),
          isIntersecting,
        })),
      );
    },
    resize(nextHeight) {
      root.clientHeight = nextHeight;
      for (const callback of listeners) callback();
    },
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
  };
}

test("the chapter crossing the middle receives one semantic and visual current marker", () => {
  const ui = harness();
  const cleanup = ui.mount(ui.nav);
  assert.deepEqual([...ui.observers[0].observed], [...ui.targets.values()]);
  assert.equal(ui.observers[0].options.rootMargin, "-450px 0px -441px 0px");
  assert.equal(ui.observers[0].options.threshold, 0);
  ui.cross([["performance", true]]);
  assert.deepEqual(ui.current(), ["#performance"]);
  ui.cross([
    ["p14", true],
    ["performance", false],
  ]);
  assert.deepEqual(ui.current(), ["#p14"]);
  ui.cross([
    ["p14", false],
    ["system", true],
  ]);
  assert.deepEqual(ui.current(), ["#system"], "a jump uses the section in view, not a stale hash");
  ui.cross([
    ["system", false],
    ["performance", true],
  ]);
  assert.deepEqual(ui.current(), ["#performance"], "backward scrolling updates the same marker");
  cleanup();
});

test("overlap resolves in chapter order and leaving all sections clears the old marker", () => {
  const ui = harness();
  const cleanup = ui.mount(ui.nav);
  ui.cross([
    ["p14", true],
    ["performance", true],
  ]);
  assert.deepEqual(ui.current(), ["#p14"]);
  ui.cross([["p14", false]]);
  assert.deepEqual(ui.current(), ["#performance"]);
  ui.cross([["performance", false]]);
  assert.deepEqual(ui.current(), []);
  cleanup();
});

// rx19 (2026-10-22): Rexonance's bar lists the suit-up (03), whose heading is
// followed by its decorative runway and the replay row; the chapter spans all three.
test("a chapter can span the elements it names, in bar order, without extra observers or links", () => {
  const ui = harness({
    hrefs: ["#performance", "#p14", "#assembly", "#stages", "#system"],
    ids: ["performance", "p14", "assembly", "assembly-runway", "assembly-replay", "stages", "system"],
    through: { "#assembly": "assembly-runway  assembly-replay missing p14" },
  });
  const cleanup = ui.mount(ui.nav);
  assert.deepEqual(
    [...ui.observers[0].observed].map((target) => target.id),
    ["performance", "p14", "assembly", "assembly-runway", "assembly-replay", "stages", "system"],
    "named parts are observed once each; a missing id or another chapter's section is ignored",
  );
  ui.cross([["assembly", true]]);
  assert.deepEqual(ui.current(), ["#assembly"]);
  ui.cross([
    ["assembly", false],
    ["assembly-runway", true],
  ]);
  assert.deepEqual(ui.current(), ["#assembly"], "the runway keeps the suit-up chapter lit");
  ui.cross([
    ["assembly-runway", false],
    ["assembly-replay", true],
    ["stages", true],
  ]);
  assert.deepEqual(ui.current(), ["#stages"], "the next chapter still wins an overlap");
  ui.cross([["stages", false]]);
  assert.deepEqual(ui.current(), ["#assembly"]);
  ui.cross([
    ["assembly-replay", false],
    ["p14", true],
  ]);
  assert.deepEqual(ui.current(), ["#p14"], "p14 keeps its own link despite being named");
  cleanup();
  assert.deepEqual(ui.current(), []);
});

test("only resolvable local section targets are observed, including encoded ids", () => {
  const ui = harness({ hrefs: ["#", "#missing", "#%XX", "#%70%31%34"] });
  const cleanup = ui.mount(ui.nav);
  assert.deepEqual([...ui.observers[0].observed], [ui.targets.get("p14")]);
  ui.cross([["p14", true]]);
  assert.deepEqual(ui.current(), ["#%70%31%34"]);
  cleanup();
});

test("five mounts each disconnect their observer and clear the old navigation marker", () => {
  const ui = harness();
  for (let iteration = 0; iteration < 5; iteration += 1) {
    const cleanup = ui.mount(ui.nav);
    ui.cross([["stages", true]]);
    assert.deepEqual(ui.current(), ["#stages"]);
    cleanup();
    assert.deepEqual(ui.current(), []);
    assert.ok(ui.observers.every((observer) => observer.disconnected));
    assert.ok(ui.observers.every((observer) => observer.observed.size === 0));
    assert.equal(ui.listeners.size, 0);
  }
});

test("the middle band is height-based in landscape and portrait, and resize bursts reconnect once", () => {
  const ui = harness({ height: 720 });
  const cleanup = ui.mount(ui.nav);
  const landscape = ui.observers[0];
  assert.equal(landscape.options.rootMargin, "-360px 0px -352px 0px");
  ui.cross([["performance", true]]);
  for (let count = 0; count < 8; count += 1) ui.resize(1280);
  assert.equal(ui.frames.size, 1);
  assert.equal(ui.observers.length, 1);
  ui.flush();
  assert.equal(ui.observers.length, 2);
  assert.equal(landscape.disconnected, true);
  assert.equal(ui.observers[1].options.rootMargin, "-640px 0px -627px 0px");
  assert.deepEqual(ui.current(), [], "the previous geometry cannot leave a stale light");
  ui.cross([["stages", true]]);
  landscape.callback([{ target: ui.targets.get("p14"), isIntersecting: true }]);
  assert.deepEqual(ui.current(), ["#stages"], "late entries from the old observer are ignored");
  ui.resize(1280);
  ui.flush();
  assert.equal(ui.observers.length, 2, "a width-only resize keeps the same height band");
  cleanup();
});

test("unmount cancels resize work and ignores late callbacks without relighting detached links", () => {
  const ui = harness();
  const cleanup = ui.mount(ui.nav);
  ui.cross([["system", true]]);
  ui.resize(500);
  const queuedResize = [...ui.frames.values()][0];
  cleanup();
  assert.equal(ui.frames.size, 0);
  assert.equal(ui.listeners.size, 0);
  assert.equal(ui.observers[0].observed.size, 0);
  queuedResize();
  ui.cross([["system", true]]);
  assert.equal(ui.observers.length, 1);
  assert.deepEqual(ui.current(), []);
});

test("missing nav, targets or observer support leave working links without allocating an observer", () => {
  for (const available of [true, false]) {
    const ui = harness({ available, hrefs: ["#missing"] });
    assert.doesNotThrow(ui.mount(null));
    assert.doesNotThrow(ui.mount(undefined));
    assert.doesNotThrow(ui.mount(ui.nav));
    assert.equal(ui.observers.length, 0);
  }
});

test("both saga pages mount the shared rx14 helper as an independently cleaned-up effect", () => {
  for (const name of ["rexonance", "extreme"]) {
    const source = read(`src/components/${name}-saga/${name}-saga.tsx`);
    assert.match(source, /import \{ mountLocalNavCurrent \} from "@\/lib\/local-nav-current"/);
    // Rexonance mounts it once its lower sections render (owner, 2026-10-11:
    // a covered arrival renders the hero first, so the call never stutters).
    assert.match(
      source,
      name === "rexonance"
        ? /mountLocalNavCurrent\(pageRef\.current\?\.querySelector\("\.rxs-local-nav nav"\)\)\s*: undefined,\s*\[lower\],/
        : /useEffect\(\(\) => mountLocalNavCurrent\(pageRef\.current\?\.querySelector\("\.rxs-local-nav nav"\)\), \[\]\)/,
    );
  }
  const css = read("src/styles-rexonance-saga.css");
  // Audit #23: lit in each bar's own language (the site-light line, as Final Stage's lamp line).
  const current =
    /\.rxs-page:is\(\.rxs-rexonance-page, \.exs-page\)\s*> header\.rxs-local-nav\s*nav\s*a\[aria-current="location"\]/
      .source;
  assert.match(css, new RegExp(`${current}\\s*\\{\\s*color: #fff;\\s*\\}`));
  // The non-colour mark: the bar's line, drawn out and 2px, under the chapter in view.
  assert.match(css, new RegExp(`${current}::after\\s*\\{\\s*height: 2px;\\s*scale: 1 1;\\s*\\}`));
  // Forced colours hide that painted line, so the name itself is underlined there.
  assert.match(
    css,
    new RegExp(
      `@media \\(forced-colors: active\\) \\{\\s*html\\[data-family="special"\\]\\s*body\\s*${current}\\s*\\{\\s*text-decoration: underline;`,
    ),
  );
  // The line grows in only where motion is allowed; otherwise it is simply there.
  const elevation = read("src/styles-showcase-elevation.css");
  assert.match(
    elevation,
    /@media \(prefers-reduced-motion: no-preference\) and \(hover: hover\) and \(pointer: fine\) \{[\s\S]*?html:not\(\[data-world-effects="economy"\]\) \.rxs-page\.rxs-page \.rxs-local-nav nav a::after \{\s*transition: scale 220ms/,
  );
  assert.match(elevation, /\.rxs-page\.rxs-page \.rxs-local-nav nav a::after \{[^}]*scale: 0 1;/);
});
