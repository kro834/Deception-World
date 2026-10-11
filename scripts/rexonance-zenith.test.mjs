import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ASSEMBLY_BEATS,
  ASSEMBLY_PARTS,
  mountRexonanceAssembly,
  planAssembly,
} from "../src/lib/rexonance-resonance.js";
import {
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
} from "../src/lib/rexonance-suit.ts";

/* 2026-10-11 rx15: Rexonance, ZENITH — the suit-up on the page
   (src/styles-rexonance-zenith.css, mountRexonanceAssembly and
   planAssembly in src/lib/rexonance-resonance.js). The owner asked for the
   suit-up to feel like nanomachines, cut very fine and attached in turn,
   and for the special site to take a big step with it: between 02 and 03
   the reader plays the published call with the scroll and the armour
   assembles out of nanite tiles; the held stage reads out 01 and 02; 03
   is a fitted form viewer with a nanite sweep; the end card stands the
   finished suit behind the last line. These pin where the layer loads,
   its scope, its motion discipline, the pinned runway as a layout of the
   persistent preferences only, forced colours, the 12px floor, that the
   scene reads only the suit module fields every revision keeps, and the
   engine's plan and lifecycle. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(read("src/styles-rexonance-zenith.css"));
const route = read("src/routes/rexonance-saga.tsx");
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function parse(text) {
  const rules = [];
  const keyframes = new Map();
  const stack = [];
  let prelude = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < text.length && depth > 0; end += 1) {
          if (text[end] === "{") depth += 1;
          if (text[end] === "}") depth -= 1;
        }
        keyframes.set(frames[1], text.slice(index + 1, end - 1));
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = text.indexOf("}", index);
      rules.push({ selector: head, body: flat(text.slice(index + 1, end)), context: [...stack] });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return { rules, keyframes };
}

const splitTopLevel = (value, separator = ",") => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};
const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();

const sheet = parse(css);
const REDUCED = /prefers-reduced-motion:\s*no-preference/;
const SUPPORTS =
  /^@supports \(animation-timeline: view\(\)\) and \(animation-range: entry 0% entry 100%\)$/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.rxs-rexonance-page/;
const moves = (body) => {
  const animation = declaration(body, "animation") ?? declaration(body, "animation-name");
  return Boolean(animation) && animation !== "none";
};
const timed = (body) => {
  const timeline = declaration(body, "animation-timeline");
  return Boolean(timeline) && !/^(?:auto|none)$/.test(timeline);
};

test("the ZENITH sheet loads after RESONANCE, before the cinematic sheet, on its route only", () => {
  assert.match(route, /import rexonanceZenithCssUrl from "@\/styles-rexonance-zenith\.css\?url"/);
  const links = route.slice(route.search(/links:\s*\[/));
  const resonance = links.indexOf("href: rexonanceResonanceCssUrl");
  const zenith = links.indexOf("href: rexonanceZenithCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(resonance > 0 && resonance < zenith && zenith < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-zenith/, path);
  }
});

test("every rule is scoped to the Rexonance page and leaves the bar, the menu and the calls alone", () => {
  assert.ok(sheet.rules.length > 60, String(sheet.rules.length));
  for (const { selector } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^html(?:\[data-family="special"\])(?::not\(\[[^\]]+\]\)| ?:not\(\s*\[[^\]]+\]\s*\))* body \.rxs-page\.rxs-page\.rxs-rexonance-page\b/,
        part,
      );
      assert.doesNotMatch(
        part,
        /\.exs-|\.fst-|\.rxs-local-nav|\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate/,
        part,
      );
    }
  }
});

test("keyframes are this sheet's own, move only opacity and transforms, and never loop", () => {
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count|!important/);
  assert.ok(sheet.keyframes.size >= 6, String(sheet.keyframes.size));
  for (const [name, body] of sheet.keyframes) {
    assert.match(name, /^rzn-/, name);
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate"].includes(property),
        `${name}: ${property}`,
      );
    }
  }
  assert.doesNotMatch(css, /mix-blend-mode|backdrop-filter|blur\(/);
  assert.doesNotMatch(css, /(?<![\w-])filter\s*:/);
});

const scrollLinked = ({ body, context }) =>
  timed(body) || (moves(body) && context.some((at) => SUPPORTS.test(at)));

test("scroll-linked motion rides named timelines behind the full gate", () => {
  const scroll = sheet.rules.filter(scrollLinked);
  assert.ok(scroll.length >= 8, String(scroll.length));
  for (const { selector, body, context } of scroll) {
    assert.ok(
      context.some((at) => SUPPORTS.test(at)),
      selector,
    );
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    for (const timeline of splitTopLevel(declaration(body, "animation-timeline") ?? "")) {
      assert.match(timeline, /^--[\w-]+$/, `${selector}: ${timeline}`);
    }
    const names = splitTopLevel(declaration(body, "animation") ?? "").map(
      (layer) => splitTopLevel(layer, " ")[0],
    );
    for (const name of names) {
      const frames = sheet.keyframes.get(name);
      if (frames) assert.doesNotMatch(frames, /clip-path|color|background/, name);
    }
  }
  // Timelines are declared under the persistent flags only.
  for (const { selector, body, context } of sheet.rules) {
    if (!/view-timeline|timeline-scope/.test(body)) continue;
    assert.ok(
      context.some((at) => SUPPORTS.test(at)),
      selector,
    );
    assert.doesNotMatch(selector, /data-side-menu-open|data-dialog-open|data-loading/);
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
  }
  // The page's timeline-scope belongs to RESONANCE: ZENITH never redeclares
  // it (a second list would replace the first).
  assert.doesNotMatch(css, /timeline-scope/);
});

test("time-based motion is gated, keyed to the transient form flag, finite and quick", () => {
  let checked = 0;
  for (const rule of sheet.rules) {
    const { selector, body, context } = rule;
    if (scrollLinked(rule) || !moves(body)) continue;
    checked += 1;
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, FULL_GATE, part);
      assert.match(part, /\[data-rsn-form\]/, part);
    }
    for (const layer of splitTopLevel(declaration(body, "animation") ?? "")) {
      const [duration = 0] = [...layer.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
      assert.ok(duration > 0 && duration <= 1200, `${selector}: ${layer}`);
    }
  }
  assert.ok(checked >= 2, String(checked));
  // The mesh's diagonal stagger stays inside the transformation's window.
  const mesh = sheet.rules.find(
    ({ selector }) => /\.rzn-mesh > i$/.test(selector) && /data-rsn-form/.test(selector),
  );
  assert.match(mesh.body, /var\(--rzn-d, 0\) \* 34ms/);
  assert.match(page, /length: 12/);
});

test("transitions answer the engine's flags on the compositor, gated", () => {
  const transitions = sheet.rules.filter(({ body }) =>
    /(?:^|;)\s*transition(?:-[\w-]+)?\s*:/.test(body),
  );
  assert.ok(transitions.length >= 1);
  for (const { selector, body, context } of transitions) {
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    for (const layer of splitTopLevel(declaration(body, "transition"))) {
      assert.match(layer, /^(?:opacity|translate|scale) \d+ms /, `${selector}: ${layer}`);
    }
  }
});

test("the pinned runway is a layout of the persistent preferences, never of the menu or dialogs", () => {
  const sticky = sheet.rules.filter(({ body }) => /position: sticky/.test(body));
  assert.equal(sticky.length, 1);
  const runway = sheet.rules.filter(
    ({ selector, body }) => /> \.rzn-suitup$/.test(selector) && /height: max\(/.test(body),
  );
  assert.equal(runway.length, 2);
  for (const { selector, context } of [...sticky, ...runway]) {
    assert.ok(
      context.some((at) => REDUCED.test(at) && /forced-colors: none/.test(at)),
      selector,
    );
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
    assert.doesNotMatch(
      selector,
      /data-side-menu-open|data-dialog-open|data-loading|data-motion-ready|data-rzn/,
    );
  }
});

test("text keeps its 12px floor; generated text is silent; forced colours drop the ornaments", () => {
  for (const [, value] of css.matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
    for (const [, px] of value.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px/g)) {
      // Line heights and clamp maxima are larger; the minimum is the floor.
      assert.ok(Number(px) >= 12, value);
    }
  }
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.match(value.trim(), /^(?:""|counter\([^)]*\) \/ "")$/, value);
  }
  const forced = sheet.rules
    .filter(({ context }) => context.some((at) => /forced-colors:\s*active/.test(at)))
    .map(({ selector, body }) => `${selector} { ${body} }`)
    .join("\n");
  for (const ornament of [
    ".rzn-canvas",
    ".rzn-light",
    ".rzn-floor",
    ".rzn-rail",
    ".rzn-callouts",
    ".rzn-mesh",
    ".rzn-form-code",
  ]) {
    assert.ok(forced.includes(ornament), ornament);
  }
});

test("the scene is decorative and reads only the suit fields every revision keeps", () => {
  assert.match(page, /<div\s+ref=\{runwayRef\}\s+className="rzn-suitup"\s+aria-hidden="true"/);
  assert.match(
    page,
    /REXONANCE_SUIT_PIECES\.map\(\(\{ id, group, x, y, w, h, seat \}\) => \(\{\s*id,\s*group,\s*x,\s*y,\s*w,\s*h,\s*seat,\s*\}\)\)/,
  );
  // No sprite, atlas or tile field of a piece is read by the page.
  assert.doesNotMatch(page, /piece\.(?:src|float|ax|ay|tiles|dir)\b/);
  assert.match(
    page,
    /useEffect\(\(\) => mountRexonanceAssembly\(runwayRef\.current, SUIT_UP\), \[\]\);/,
  );
  // The call is the published one, in its order.
  assert.match(page, /const SUIT_UP_LINES = REXONANCE_CALLS\.map/);
  // The new ornaments are hidden from assistive technology.
  for (const ornament of ["rzn-mesh", "rzn-form-code", "rzn-end-figure"]) {
    assert.match(
      page,
      new RegExp(`className="${ornament}"[^>]*aria-hidden="true"|className="${ornament}"\\s+src=`),
      ornament,
    );
  }
  assert.match(page, /<span className="rzn-callouts">/);
  assert.match(
    page,
    /<div className="rxs-hero-visual" aria-hidden="true">[\s\S]*?<span className="rzn-callouts">/,
  );
});

/* ---------------- the plan ---------------- */
const realPieces = REXONANCE_SUIT_PIECES.map(({ id, group, x, y, w, h, seat }) => ({
  id,
  group,
  x,
  y,
  w,
  h,
  seat,
}));
// A finer list, as the suit rebuild cuts it: every piece split in four,
// with a group this layer has never seen.
const finerPieces = realPieces.flatMap((piece) =>
  [0, 1].flatMap((row) =>
    [0, 1].map((column) => ({
      id: `${piece.id}-${row}${column}`,
      group: piece.group === "chest" && piece.id.startsWith("shoulder") ? "shoulders" : piece.group,
      x: piece.x + (column * piece.w) / 2,
      y: piece.y + (row * piece.h) / 2,
      w: piece.w / 2,
      h: piece.h / 2,
      seat: piece.seat,
    })),
  ),
);

for (const [name, pieces] of [
  ["the module's pieces", realPieces],
  ["a finer list with a new group", finerPieces],
  [
    "an unknown group",
    realPieces.map((piece) => ({
      ...piece,
      group: piece.group === "legs" ? "greaves" : piece.group,
    })),
  ],
]) {
  test(`the plan lands every tile in the call's order (${name})`, () => {
    const plan = planAssembly({
      size: REXONANCE_SUIT_SIZE,
      pieces,
      core: REXONANCE_SUIT_MARKS.core,
      tile: 12,
    });
    const cells =
      Math.ceil(REXONANCE_SUIT_SIZE.width / 12) * Math.ceil(REXONANCE_SUIT_SIZE.height / 12);
    assert.equal(plan.tiles.length, cells);
    for (let index = 1; index < plan.tiles.length; index += 1) {
      assert.ok(plan.tiles[index].t1 >= plan.tiles[index - 1].t1);
    }
    for (const tile of plan.tiles) {
      assert.ok(tile.m < tile.t0 && tile.t0 < tile.t1, JSON.stringify(tile));
      assert.ok(tile.t1 <= ASSEMBLY_BEATS.clamp + 1e-9);
      assert.ok(tile.t0 >= ASSEMBLY_BEATS.deus[0]);
      if (tile.beat === 5) assert.equal(tile.t1, ASSEMBLY_BEATS.clamp);
    }
    // Legs, arms, chest, waist land on the four DEUS！ in turn; the tail
    // and ribbons on REXONANCE！; the helmet clamps last.
    const done = plan.partDone;
    assert.equal(done.length, ASSEMBLY_PARTS.length);
    for (let beat = 1; beat < done.length; beat += 1)
      assert.ok(done[beat] > done[beat - 1], String(done));
    assert.ok(done[3] <= ASSEMBLY_BEATS.deus[1] + 1e-9);
  });
}

test("the plan is deterministic and reads coverage from the sample", () => {
  const cols = Math.ceil(REXONANCE_SUIT_SIZE.width / 16);
  const rows = Math.ceil(REXONANCE_SUIT_SIZE.height / 16);
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let index = 0; index < cols * rows; index += 1)
    data[index * 4 + 3] = index % 3 === 0 ? 255 : 0;
  const a = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces: realPieces,
    core: REXONANCE_SUIT_MARKS.core,
    tile: 16,
    sample: { data },
  });
  const b = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces: realPieces,
    core: REXONANCE_SUIT_MARKS.core,
    tile: 16,
    sample: { data },
  });
  assert.equal(a.tiles.length, Math.ceil((cols * rows) / 3));
  assert.deepEqual(a.tiles.slice(0, 20), b.tiles.slice(0, 20));
});

/* ---------------- the engine, in a minimal environment ---------------- */
function environment({ reduced = false, economy = false, forced = false } = {}) {
  const listeners = new Map();
  const target = (name) => ({
    addEventListener(type, callback) {
      listeners.set(`${name}:${type}`, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(`${name}:${type}`) === callback) listeners.delete(`${name}:${type}`);
    },
  });
  const element = (extra = {}) => {
    const attributes = new Map();
    return {
      attributes,
      dataset: new Proxy(
        {},
        {
          get: (_, key) =>
            attributes.get(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
          set: (_, key, value) => {
            attributes.set(
              `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
              String(value),
            );
            return true;
          },
          deleteProperty: (_, key) =>
            attributes.delete(
              `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
            ),
        },
      ),
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: (name) => attributes.delete(name),
      hasAttribute: (name) => attributes.has(name),
      getAttribute: (name) => attributes.get(name) ?? null,
      textContent: "",
      ...extra,
    };
  };
  const html = element();
  if (economy) html.setAttribute("data-world-effects", "economy");
  const calls = [];
  const context2d = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "createRadialGradient"
          ? () => ({ addColorStop() {} })
          : key === "getImageData"
            ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) })
            : (...args) => calls.push([key, args.length]),
      set: () => true,
    },
  );
  const makeCanvas = () => ({
    width: 0,
    height: 0,
    clientWidth: 1440,
    clientHeight: 837,
    getContext: () => context2d,
  });
  const document = {
    documentElement: html,
    hidden: false,
    createElement: () => makeCanvas(),
    ...target("document"),
  };
  const canvas = makeCanvas();
  const frameBox = element({ offsetHeight: 837 });
  const lines = [0, 1, 2, 3, 4].map(() => element({ querySelectorAll: () => [element()] }));
  const parts = ASSEMBLY_PARTS.map(() => element());
  const percent = element({ textContent: "100" });
  const counter = element({ textContent: "ONLINE" });
  let top = 900;
  const runway = element({
    ownerDocument: document,
    offsetHeight: 2700,
    getBoundingClientRect: () => ({ top, height: 2700 }),
    querySelector: (selector) =>
      ({
        "canvas.rzn-canvas": canvas,
        ".rzn-frame": frameBox,
        ".rzn-percent": percent,
        ".rzn-count": counter,
      })[selector] ?? null,
    querySelectorAll: (selector) =>
      selector === ".rzn-line" ? lines : selector === ".rzn-part" ? parts : [],
  });
  const observers = [];
  class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(node) {
      this.node = node;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  // Like the browser's, the first notice comes after layout (here, a task).
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      setTimeout(() => !this.disconnected && this.callback([]), 0);
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class Image {
    set src(value) {
      this._src = value;
      queueMicrotask(() => this.onload?.());
    }
    decode() {
      return Promise.resolve();
    }
  }
  let frameId = 0;
  const frames = new Map();
  const env = {
    ...target("window"),
    navigator: {},
    devicePixelRatio: 2,
    matchMedia: (query) => ({
      matches: query.includes("reduce")
        ? reduced
        : query.includes("forced-colors")
          ? forced
          : false,
      ...target(`media ${query}`),
    }),
    getComputedStyle: () => ({ top: "63px", getPropertyValue: () => "" }),
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    IntersectionObserver,
    MutationObserver,
    ResizeObserver,
    Image,
  };
  const flush = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(0);
    }
  };
  const scrollTo = (progress) => {
    top = 63 - progress * (2700 - 837);
    listeners.get("window:scroll")?.();
    flush();
  };
  return {
    env,
    runway,
    canvas,
    html,
    observers,
    listeners,
    frames,
    flush,
    scrollTo,
    percent,
    counter,
    lines,
    parts,
    calls,
  };
}

test("reduced motion, economy and forced colours keep the still and leave nothing behind", async () => {
  for (const options of [{ reduced: true }, { economy: true }, { forced: true }]) {
    const t = environment(options);
    const dispose = mountRexonanceAssembly(
      t.runway,
      {
        figure: "/f.webp",
        undersuit: "/u.webp",
        size: REXONANCE_SUIT_SIZE,
        pieces: realPieces,
        core: REXONANCE_SUIT_MARKS.core,
        visor: REXONANCE_SUIT_MARKS.visor,
        glow: [],
      },
      t.env,
    );
    t.observers[0].callback([{ isIntersecting: true }]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(t.runway.dataset.rznState, undefined, JSON.stringify(options));
    assert.equal(t.canvas.width, 0);
    dispose();
    assert.equal([...t.listeners.keys()].length, 0, [...t.listeners.keys()].join());
    assert.equal(t.frames.size, 0);
  }
});

test("near the view it goes live, scrubs with the scroll, writes the HUD on change, and cleans up", async () => {
  const t = environment();
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      figure: "/f.webp",
      undersuit: "/u.webp",
      size: REXONANCE_SUIT_SIZE,
      pieces: realPieces,
      core: REXONANCE_SUIT_MARKS.core,
      visor: REXONANCE_SUIT_MARKS.visor,
      glow: [],
    },
    t.env,
  );
  // Not near yet: nothing is fetched or drawn.
  assert.equal(t.runway.dataset.rznState, undefined);
  t.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(t.runway.dataset.rznState, "loading");
  // The cut runs in steps (sample, plan, weld canvas), each its own task.
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(t.runway.dataset.rznState, "live");
  // The backing store is sized in the first frame, after its layout read.
  assert.equal(t.canvas.width, 0);
  t.scrollTo(0);
  assert.ok(t.canvas.width > 0 && t.canvas.width * t.canvas.height <= 2_600_000 * 1.01);
  assert.equal(t.percent.textContent, "000");
  assert.equal(t.runway.dataset.rznLine, "0");
  t.scrollTo(0.4);
  assert.equal(t.runway.dataset.rznLine, "2");
  assert.ok(t.parts[0].hasAttribute("data-on"));
  assert.ok(!t.parts[5].hasAttribute("data-on"));
  t.scrollTo(1);
  assert.equal(t.percent.textContent, "100");
  assert.ok(t.parts.every((part) => part.hasAttribute("data-on")));
  assert.ok(t.runway.hasAttribute("data-rzn-complete"));
  // Back to the start: the welds come off again.
  t.scrollTo(0.1);
  assert.match(t.counter.textContent, /^0 \/ /);
  // An unchanged position draws nothing.
  const before = t.calls.length;
  t.scrollTo(0.1);
  assert.equal(t.calls.length, before);
  // Hidden: no frame is queued.
  t.env.document = undefined;
  dispose();
  assert.equal(t.runway.dataset.rznState, undefined);
  assert.equal(t.percent.textContent, "100");
  assert.equal(t.counter.textContent, "ONLINE");
  assert.equal(t.canvas.width, 0);
  assert.equal([...t.listeners.keys()].length, 0, [...t.listeners.keys()].join());
  assert.equal(t.frames.size, 0);
  assert.ok(t.observers.every((observer) => observer.disconnected));
});
