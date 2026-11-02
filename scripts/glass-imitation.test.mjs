// The liquid glass as an imitation of the platform material (owner,
// 2026-11-02: 「リキッドグラスの外観を徹底検索し、完全に模倣する様に」).
// Pins what the research found and the sheet now does: the press swells and
// lights from the finger, the backdrop estimate (light/dark flip, busy), the
// switch and slider thumbs (white at rest, a clear lens when touched), the
// rail's droplet stretch, the hold's flex, materialize, and the accessibility
// fallbacks (Reduce Transparency frostier, Increase Contrast black/white with
// a border, Reduce Motion with no elastic motion).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const glass = read("src/styles-liquid-glass.css");
const controls = read("src/styles-liquid-glass-controls.css");
const toneSource = read("src/lib/liquid-glass-tone.ts");
const pointerSource = read("src/lib/liquid-glass.ts");
const holdSource = read("src/lib/liquid-glass-hold.ts");
const defs = read("src/components/liquid-glass-defs.tsx");
const boot = read("src/lib/liquid/boot.js");
const clean = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

async function loadTone() {
  const code = ts
    .transpileModule(toneSource, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/^import .*liquid-glass.*$/m, "const LIQUID_GLASS_TARGETS = [];");
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}

/** Every rule (selector + body), comments stripped, at-rules flattened. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean(css)))) out.push({ selector: match[1].trim(), body: match[2] });
  return out;
}

test("the backdrop estimate: luminance, hysteresis and parsing", async () => {
  const lib = await loadTone();
  assert.ok(Math.abs(lib.luminance(255, 255, 255) - 1) < 1e-9);
  assert.equal(lib.luminance(0, 0, 0), 0);
  // Near the threshold the tone holds (no flicker as the backdrop shifts).
  assert.equal(lib.toneFor(0.5, "dark"), "dark");
  assert.equal(lib.toneFor(0.5, "light"), "light");
  assert.equal(lib.toneFor(0.7, "dark"), "light");
  assert.equal(lib.toneFor(0.3, "light"), "dark");
  assert.deepEqual(lib.parseRgb("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(lib.parseRgb("rgb(10 20 30 / 40%)"), { r: 10, g: 20, b: 30, a: 0.4 });
  assert.equal(lib.parseRgb("transparent"), null);
});

test("the backdrop estimate is cheap: once per control in view, again only when a pinned bar's page rests", () => {
  // Started with the option, undone with it.
  assert.match(defs, /const stopTone = watchLiquidTone\(document\);/);
  assert.match(defs, /stopTone\(\);/);
  // Measured on first sight and resize (ResizeObserver), a few per frame.
  assert.match(toneSource, /new view\.ResizeObserver/);
  assert.match(toneSource, /const PER_FRAME = 6;/);
  // The scroll listener only arms a timer: nothing is read while it moves.
  const scrolled = toneSource.slice(toneSource.indexOf("const scrolled = "), toneSource.indexOf("const loaded = "));
  assert.doesNotMatch(scrolled, /getBoundingClientRect|getComputedStyle|elementsFromPoint/);
  assert.match(scrolled, /setTimeout\(rest, SCROLL_REST_MS\)/);
  // Only the pinned (fixed or sticky) controls on screen look again after a
  // scroll, with those just coming into view.
  assert.match(toneSource, /if \(entry\.pinned && entry\.near\) enqueue\(el\);/);
  assert.match(toneSource, /for \(const el of nearing\) enqueue\(el\);/);
  // Every attribute it wrote is removed when the option goes off.
  assert.match(toneSource, /el\.removeAttribute\(TONE_ATTRIBUTE\);\s*el\.removeAttribute\(BUSY_ATTRIBUTE\);/);
  assert.match(toneSource, /for \(const el of \[\.\.\.tracked\.keys\(\)\]\) detach\(el\);/);
});

test("the sheet adapts: busy deepens the veil and shadow, a light backdrop flips the glass", () => {
  const busy = rules(glass).find(({ selector }) => /\[data-lg-busy\]/.test(selector));
  assert.ok(busy, "busy rule");
  assert.match(busy.selector, /^html\[data-button-style="liquid"\]/);
  assert.match(busy.body, /--lg-fill-alpha: 0\.56;/);
  assert.match(busy.body, /--lg-shadow-a: 0\.52;/);
  const light = rules(glass).find(({ selector }) => /^html[^{]*\[data-lg-tone="light"\]:not\(\.zeus-button\)/.test(selector));
  assert.ok(light, "light rule");
  assert.match(light.body, /--lg-fill: rgb\(250 251 253 \/ 0\.58\);/);
  assert.match(light.body, /color: rgb\(18 22 28\) !important;/);
  assert.match(light.body, /--lg-shadow-a: 0\.18;/);
  // The material reads the shadow strength and the regular veil.
  assert.match(glass, /0 6px 18px -6px rgb\(0 0 0 \/ var\(--lg-shadow-a\)\) !important;/);
  assert.match(glass, /--lg-fill-alpha: 0\.3;/);
  assert.match(glass, /@property --lg-shadow-a \{\s*syntax: "<number>";\s*inherits: false;/);
});

test("the press swells and lights from the finger, and the light spreads", () => {
  // The registered spread eases from a pool at the finger to the whole glass.
  assert.match(glass, /@property --lg-spread \{\s*syntax: "<number>";\s*inherits: false;\s*initial-value: 0;/);
  assert.match(glass, /radial-gradient\(\s*calc\(36% \+ 150% \* var\(--lg-spread\)\) calc\(52% \+ 190% \* var\(--lg-spread\)\) at var\(--lg-px\)/);
  const pressed = rules(glass).find(({ selector, body }) => /\[data-press="touch"\]/.test(selector) && /--lg-spread: 1;/.test(body));
  assert.ok(pressed, "pressed rule");
  assert.match(pressed.body, /--lg-glow: 0\.07;/);
  // The spread takes its own, slower curve while the press is in.
  assert.match(glass, /var\(--dw-dur-press\), 0\.42s;/);
  assert.match(glass, /--lg-tint-a, --lg-spread;/);
  // A touch sets the light's place once, at pointerdown, from one box read.
  const down = pointerSource.slice(pointerSource.indexOf("const down = (event: PointerEvent)"), pointerSource.indexOf("const up = () =>"));
  assert.equal((down.match(/getBoundingClientRect/g) ?? []).length, 1);
  assert.match(down, /setProperty\("--lg-px"/);
  assert.match(pointerSource, /untouch = view\.setTimeout\(clearTouch, 900\)/);
  // The touched light gathers at the edge (the label keeps its contrast).
  assert.match(glass, /inset 0 0 14px -3px rgb\(255 255 255 \/ calc\(max\(0, var\(--lg-rim\) - 0\.7\) \* 0\.9\)\)/);
});

test("the hold flexes toward the finger on the same spring", () => {
  assert.match(holdSource, /const PROPS = \["--lg-hold-s", "--lg-dx", "--lg-dy"\] as const;/);
  const follow = holdSource.slice(holdSource.indexOf("const follow = "), holdSource.indexOf("const startHold = "));
  assert.match(follow, /if \(p\.kind === "swell"\) \{\s*p\.target\.style\.setProperty\("--lg-dx", dx\);/);
  const flex = /scale: calc\(var\(--lg-hold-s, 1\) \* \(1 \+ 0\.07 \* max\(var\(--lg-dx, 0\), -1 \* var\(--lg-dx, 0\)\)\)\)/g;
  // The control and its light flex alike.
  assert.equal((controls.match(flex) ?? []).length, 2);
});

test("switch and slider thumbs: an opaque white capsule at rest, a clear lens when touched", () => {
  const c = clean(controls);
  // The switch's knob: wider than tall, white by --lg-knob, travel 30px (--lg-knob-x).
  const knob = c.match(/\.side-panel-zeus-toggle\s*> i\s*u:not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\) \{([^}]*)\}/)[1];
  assert.match(knob, /width: 34px;\s*height: 22px;/);
  assert.match(knob, /--lg-knob: 1;/);
  assert.match(knob, /calc\(0\.06 \+ var\(--lg-knob\) \* 0\.9\)/);
  assert.match(c, /\.side-panel-zeus-toggle:is\(\[aria-pressed="true"\], \[aria-checked="true"\]\)\s*> i\s*u[^{]*\{\s*--lg-knob-x: 30px;/);
  assert.match(c, /\.side-panel-zeus-toggle:is\(:active, \[data-press="in"\], \[data-press="touch"\], \[data-lg-hold="on"\]\)\s*> i\s*u[^{]*\{\s*--lg-knob: 0;/);
  assert.match(c, /scale: 1\.42 1\.5;/);
  // Held, the track stays put: the knob is the lens.
  assert.match(c, /\.side-panel-zeus-toggle\[data-lg-hold="on"\]\s*> i[^{]*\{\s*scale: 1;/);
  // The range thumbs: white at rest, the white drained while touched or held.
  assert.equal((c.match(/linear-gradient\(rgb\(255 255 255 \/ calc\(var\(--lg-knob\) \* 0\.95\)\)/g) ?? []).length, 2);
  assert.equal((c.match(/\[type="range"\]:is\(:active, \[data-lg-hold="on"\]\)/g) ?? []).length, 2);
  // The slide-to-open thumb: opaque, so it samples no backdrop.
  const thumb = clean(glass).match(/\.ios-slide-open\s*\.ios-slide-open-thumb:not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\) \{([^}]*)\}/)[1];
  assert.match(thumb, /linear-gradient\(rgb\(255 255 255 \/ 0\.97\), rgb\(240 243 246 \/ 0\.97\)\) !important;/);
  assert.match(thumb, /backdrop-filter: none !important;/);
});

test("the rail's droplet stretches along a fast drag and rests as a neutral capsule", () => {
  assert.match(boot, /lens\.style\.setProperty\('--liquid-lens-vx', clamp\(vx \/ 1\.6, -1, 1\)\.toFixed\(2\)\);/);
  assert.match(boot, /stretch\(0, 0\);\s*reset\(\);/);
  const stretch = boot.slice(boot.indexOf("const stretch = "), boot.indexOf("const process = "));
  assert.doesNotMatch(stretch, /getBoundingClientRect|getComputedStyle/);
  // Rest: a light neutral capsule; held: the clear lens with its fringes.
  assert.match(controls, /rgb\(255 255 255 \/ 0\.1\) !important;/);
  assert.match(controls, /inset 1\.6px 1\.4px 0 0 rgb\(255 166 120 \/ 0\.36\)/);
});

test("materialize: the glass lenses in with its dialog, only under full motion", () => {
  assert.match(glass, /@property --lg-mat \{\s*syntax: "<number>";\s*inherits: false;\s*initial-value: 1;/);
  assert.match(glass, /@keyframes lg-materialize \{\s*0% \{\s*opacity: 0;\s*scale: 0\.78;\s*--lg-mat: 0;/);
  const media = glass.slice(glass.indexOf("@keyframes lg-materialize"));
  const block = media.slice(media.indexOf("@media (prefers-reduced-motion: no-preference)"));
  assert.match(block, /^@media \(prefers-reduced-motion: no-preference\) \{\s*html\[data-button-style="liquid"\]:not\(\[data-world-effects="economy"\]\)/);
  // Backwards only: once in, the press owns `scale`.
  assert.match(block, /animation: lg-materialize var\(--lg-spring-ms\) var\(--lg-spring\) 0\.08s backwards;/);
  // The blur and the lift rise with it.
  assert.match(glass, /blur\(calc\(var\(--lg-blur\) \* var\(--lg-mat\)\)\)/);
  assert.match(glass, /rgb\(255 255 255 \/ calc\(var\(--lg-sheen\) \* var\(--lg-mat\)\)\)/);
});

test("accessibility: frostier under reduced transparency, black and white with a border under increased contrast", () => {
  assert.match(glass, /@media \(prefers-reduced-transparency: reduce\) \{\s*html\[data-button-style="liquid"\] \{\s*--lg-blur: 14px;\s*--lg-fill-alpha: 0\.84;/);
  const more = glass.slice(glass.indexOf("@media (prefers-contrast: more)"));
  assert.ok(more.length > 100, "an increased-contrast block");
  assert.match(more, /--lg-fill: rgb\(0 0 0 \/ 0\.9\);/);
  assert.match(more, /--lg-rim-map: none;/);
  assert.match(more, /outline: 1\.5px solid rgb\(255 255 255 \/ 0\.92\);/);
  assert.match(more, /--lg-fill: rgb\(255 255 255 \/ 0\.94\);\s*color: rgb\(0 0 0\) !important;/);
  for (const { selector } of rules(more.slice(0, more.indexOf("\n}\n") + 3)))
    if (selector && !selector.startsWith("@")) assert.match(selector, /html\[data-button-style="liquid"\]/, selector);
});

test("art that hit testing skips still counts as busy, and a press never thins a veil", () => {
  // /world's poster is pointer-events: none under its buttons: the estimate
  // looks for a stack node's own media child over the point.
  assert.match(toneSource, /function mediaUnder\(node: Element, el: HTMLElement, x: number, y: number\)/);
  assert.match(toneSource, /pointerEvents === "none"\) return media;/);
  assert.match(toneSource, /const hit = mediaUnder\(node, el, x, y\) \?\? node;/);
  // The press deepens the veil from its rest (busy, Tinted), by an addend.
  assert.match(glass, /--lg-fill: rgb\(12 18 26 \/ calc\(var\(--lg-fill-alpha\) \+ var\(--lg-veil-add, 0\)\)\);/);
  assert.match(glass, /--lg-rim: 1;\s*--lg-veil-add: 0\.06;\s*\}/);
  assert.doesNotMatch(glass, /--lg-fill-alpha: 0\.36;/);
  // Tinted: busy deeper still, and the bar chips keep less lift under their words.
  assert.match(glass, /\[data-glass-variant="tinted"\]\s*body\s*\[data-lg-busy\][^{]*\{\s*--lg-fill-alpha: 0\.76;/);
  assert.match(
    glass,
    /\[data-glass-variant="tinted"\]\s*body\s*:is\(\.topbar nav a, \.rxs-local-nav nav a, \.command-deck-header-nav a\) \{\s*--lg-fill-alpha: 0\.74;\s*--lg-sheen: 0\.015;\s*--lg-tint-a: 0\.035;/,
  );
});

/* A small page for the backdrop estimate: one shared IntersectionObserver,
   timers and frames on a clock, controls with boxes in page coordinates
   over an <img> whose colour the test sets. */
function tonePage() {
  let now = 0;
  let scrollY = 0;
  const timers = new Map();
  let nextId = 1;
  const reads = new Map();
  const listeners = new Map();
  // A write dirties style; the next layout read pays a whole-page pass.
  const style = { dirty: false, passes: 0 };
  class HTMLImageElement {}
  class HTMLVideoElement {}
  class HTMLCanvasElement {}
  const ios = [];
  const mos = [];
  const observed = new Set();
  class IntersectionObserver {
    constructor(fn, options) {
      this.fn = fn;
      this.options = options;
      this.disconnected = false;
      ios.push(this);
    }
    observe(el) {
      observed.add(el);
    }
    unobserve(el) {
      observed.delete(el);
    }
    disconnect() {
      this.disconnected = true;
      observed.clear();
    }
  }
  class MutationObserver {
    constructor(fn) {
      this.fn = fn;
      mos.push(this);
    }
    observe(_node, options) {
      this.options = options;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  const view = {
    innerWidth: 400,
    innerHeight: 800,
    HTMLImageElement,
    HTMLVideoElement,
    HTMLCanvasElement,
    IntersectionObserver,
    MutationObserver,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => view.setTimeout(fn, 16),
    cancelAnimationFrame: (id) => timers.delete(id),
    getComputedStyle: () => ({
      position: "static",
      pointerEvents: "auto",
      backgroundImage: "none",
      backgroundColor: "rgba(0, 0, 0, 0)",
      opacity: "1",
    }),
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const attrsOf = () => {
    const attrs = new Map();
    return {
      attrs,
      setAttribute: (k, v) => {
        style.dirty = true;
        attrs.set(k, String(v));
      },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => {
        style.dirty = true;
        attrs.delete(k);
      },
      toggleAttribute: (k, on) => {
        style.dirty = true;
        if (on) attrs.set(k, "");
        else attrs.delete(k);
      },
    };
  };
  // The art: a picture filling the page's width from `top`, `height` tall.
  const art = Object.assign(new HTMLImageElement(), {
    localName: "img",
    nodeType: 1,
    complete: true,
    naturalWidth: 400,
    naturalHeight: 400,
    colour: [20, 20, 24],
    top: 0,
    height: 0,
    closest: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({
      left: 0,
      right: 400,
      top: art.top - scrollY,
      bottom: art.top + art.height - scrollY,
      width: 400,
      height: art.height,
    }),
  });
  const control = (name, pageTop) => {
    const el = {
      name,
      pageTop,
      isConnected: true,
      parentElement: null,
      ...attrsOf(),
      contains: (node) => node === el,
      closest: () => null,
      querySelectorAll: () => [],
      getBoundingClientRect: () => {
        if (style.dirty) {
          style.passes += 1;
          style.dirty = false;
        }
        reads.set(name, (reads.get(name) ?? 0) + 1);
        const top = el.pageTop - scrollY;
        return { left: 20, right: 140, top, bottom: top + 44, width: 120, height: 44 };
      },
    };
    return el;
  };
  const controls = [];
  const body = { localName: "body", closest: () => null, querySelectorAll: () => [] };
  const doc = {
    defaultView: view,
    body,
    querySelectorAll: () => controls,
    createElement: () => ({
      getContext: () => ({
        clearRect: () => {},
        drawImage: () => {},
        getImageData: () => ({ data: [...art.colour, 255] }),
      }),
    }),
    elementsFromPoint: (_x, y) => {
      const pageY = y + scrollY;
      const under = pageY >= art.top && pageY <= art.top + art.height ? [art] : [];
      const over = controls.filter((c) => pageY >= c.pageTop && pageY <= c.pageTop + 44);
      return [...over, ...under, body];
    },
    addEventListener: (type, fn) => listeners.set("doc:" + type, fn),
    removeEventListener: (type) => listeners.delete("doc:" + type),
  };
  body.ownerDocument = doc;
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  // The browser's IntersectionObserver: which controls are within the
  // screen grown by the margin (the test passes the margin's reach).
  const intersect = (reach) => {
    const entries = [...observed].map((el) => {
      const top = el.pageTop - scrollY;
      return { target: el, isIntersecting: top + 44 >= -reach && top <= view.innerHeight + reach };
    });
    ios[0].fn(entries);
  };
  return {
    view,
    doc,
    art,
    controls,
    control,
    reads,
    style,
    listeners,
    timers,
    advance,
    intersect,
    io: () => ios[0],
    mo: () => mos[0],
    observed,
    scrollTo: (y) => {
      scrollY = y;
    },
  };
}

test("a control below the fold is read as it comes into view, and is busy over art", async () => {
  const lib = await loadTone();
  const page = tonePage();
  // A chip on the art 2000px down (the screen is 800px tall), and one on screen.
  page.art.top = 1800;
  page.art.height = 600;
  const below = page.control("below", 2100);
  const top = page.control("top", 100);
  page.controls.push(below, top);
  const stop = lib.watchLiquidTone(page.doc);
  assert.equal(page.observed.size, 0, "the first look waits for the page");
  page.advance(1);
  // One shared observer, reaching ahead of the screen.
  assert.equal(page.observed.size, 2);
  assert.match(page.io().options.rootMargin, /^\d+% 0px$/);
  const reach = 0.4 * 800;
  page.intersect(reach);
  page.advance(100);
  assert.equal(top.hasAttribute("data-lg-busy"), false);
  assert.equal(below.hasAttribute("data-lg-busy"), false, "off screen: not read");
  assert.equal(page.reads.get("below") ?? 0, 0, "far below: not even measured");

  // The finger scrolls: the chip nears the screen (within the margin) …
  page.scrollTo(1100);
  page.intersect(reach);
  page.advance(100);
  assert.equal(below.hasAttribute("data-lg-busy"), false, "near but not on screen yet");
  // … then comes on. The scroll handler reads nothing; its timer does.
  page.scrollTo(1700);
  const before = page.reads.get("below") ?? 0;
  page.listeners.get("scroll")();
  assert.equal(page.reads.get("below") ?? 0, before, "no layout read in the scroll handler");
  page.advance(lib.SCROLL_PEEK_MS + 20);
  assert.equal(below.hasAttribute("data-lg-busy"), true, "busy over the art once on screen");

  // Read once: later scrolls do not read it again while it stays in view.
  const once = page.reads.get("below");
  page.listeners.get("scroll")();
  page.advance(lib.SCROLL_REST_MS + 40);
  assert.equal(page.reads.get("below"), once);

  // It leaves and comes back: read again (the page may have changed).
  page.scrollTo(0);
  page.intersect(reach);
  page.art.colour = [250, 250, 250];
  page.scrollTo(1700);
  page.intersect(reach);
  page.advance(40);
  assert.equal(below.getAttribute("data-lg-tone"), "light");

  stop();
  assert.equal(page.io().disconnected, true, "the observer goes with the option");
  assert.equal(below.hasAttribute("data-lg-busy"), false);
  assert.equal(below.getAttribute("data-lg-tone"), null);
  assert.equal(page.timers.size, 0, "no timer left behind");
  assert.equal(page.listeners.size, 0, "no listener left behind");
});

test("the poster switching re-reads the controls over it, and only those", async () => {
  const lib = await loadTone();
  const page = tonePage();
  page.art.top = 0;
  page.art.height = 500;
  page.art.colour = [10, 12, 18];
  const onArt = page.control("onArt", 400);
  const plain = page.control("plain", 600);
  page.controls.push(onArt, plain);
  const stop = lib.watchLiquidTone(page.doc);
  page.advance(1);
  page.intersect(320);
  page.advance(100);
  assert.equal(onArt.hasAttribute("data-lg-busy"), true);
  assert.equal(onArt.getAttribute("data-lg-tone"), null, "dark poster: dark glass");
  assert.equal(plain.hasAttribute("data-lg-busy"), false);
  // Pictures and their sources are watched as well as the tree.
  assert.deepEqual(page.mo().options.attributeFilter, ["src", "srcset"]);

  // The poster switches to a light one: React swaps the <img>.
  page.art.colour = [245, 240, 236];
  const plainReads = page.reads.get("plain");
  page.mo().fn([{ type: "childList", addedNodes: [page.art], removedNodes: [] }]);
  page.advance(lib.ART_SETTLE_MS - 10);
  assert.equal(onArt.getAttribute("data-lg-tone"), null, "waits for the art to settle");
  page.advance(40);
  assert.equal(onArt.getAttribute("data-lg-tone"), "light", "re-read after the switch");
  assert.equal(page.reads.get("plain"), plainReads, "a control over no art is not re-read");

  // A source swapped in place, and a late load, count too.
  page.art.colour = [8, 8, 10];
  page.mo().fn([{ type: "attributes", attributeName: "src", addedNodes: [], removedNodes: [] }]);
  page.advance(lib.ART_SETTLE_MS + 40);
  assert.equal(onArt.getAttribute("data-lg-tone"), null);
  page.art.colour = [245, 240, 236];
  page.listeners.get("doc:load")({ target: page.art });
  page.advance(lib.ART_SETTLE_MS + 40);
  assert.equal(onArt.getAttribute("data-lg-tone"), "light");
  stop();
  assert.equal(page.timers.size, 0);
});

test("the estimate stays cheap: no per-frame work, no reads in handlers", () => {
  // One observer for every control, created once.
  assert.equal(toneSource.match(/new view\.IntersectionObserver\(/g).length, 1);
  assert.match(toneSource, /export const NEAR_MARGIN = "40% 0px";/);
  // The observer's callback, the scroll handler and the art handler arm work; they read nothing.
  const near = toneSource.slice(toneSource.indexOf("const near ="), toneSource.indexOf("function detach("));
  const handlers = toneSource.slice(toneSource.indexOf("const artChanged = "), toneSource.indexOf("const options = "));
  for (const part of [near, handlers])
    assert.doesNotMatch(part, /getBoundingClientRect|getComputedStyle|elementsFromPoint/);
  // No frame loop: an idle moment (or a task after the next frame, where
  // there is no requestIdleCallback) drains a queue, a few at a time.
  assert.equal(toneSource.match(/requestAnimationFrame\(/g).length, 1);
  assert.match(toneSource, /if \(queue\.size\) schedule\(\);/);
  assert.match(toneSource, /idleId = view!\.requestIdleCallback\(drain, \{ timeout: IDLE_TIMEOUT_MS \}\);/);
  assert.match(toneSource, /post = view!\.setTimeout\(drain, 0\);/);
  assert.match(toneSource, /if \(idleId\) view\.cancelIdleCallback\(idleId\);/);
  // Everything goes with the option.
  assert.match(toneSource, /near\?\.disconnect\(\);/);
  assert.match(toneSource, /if \(peekTimer\) view\.clearTimeout\(peekTimer\);/);
  assert.match(toneSource, /if \(artTimer\) view\.clearTimeout\(artTimer\);/);
});

test("a frame's estimates read together, then write together: one style pass, not one per control", async () => {
  const lib = await loadTone();
  const page = tonePage();
  page.art.top = 0;
  page.art.height = 800;
  page.art.colour = [245, 240, 236];
  for (let i = 0; i < 5; i++) page.controls.push(page.control(`c${i}`, 60 + i * 120));
  const stop = lib.watchLiquidTone(page.doc);
  page.advance(1);
  page.intersect(320);
  page.style.passes = 0;
  page.style.dirty = true; // the page's own pending style
  page.advance(20);
  for (const el of page.controls) {
    assert.equal(el.hasAttribute("data-lg-busy"), true);
    assert.equal(el.getAttribute("data-lg-tone"), "light");
  }
  assert.equal(page.style.passes, 1, "one pass for the frame's five controls");
  // Unchanged results write nothing (no style invalidated by a re-read).
  page.style.dirty = false;
  page.mo().fn([{ type: "childList", addedNodes: [page.art], removedNodes: [] }]);
  page.advance(lib.ART_SETTLE_MS + 40);
  assert.equal(page.style.dirty, false, "a re-read with the same answer writes nothing");
  stop();
});

test("the controls' glass batches its measuring: reads, then writes, per frame and per scan", () => {
  const controls = read("src/lib/liquid-glass-controls.ts");
  const flush = controls.slice(controls.indexOf("function flush() {"), controls.indexOf("function markCurrent("));
  const order = [
    "pick.option = selectedOption(pick.segment.el)",
    "markCurrent(pick.segment, pick.option)",
    "pick.at = readSegment(",
    "railList.map(readRail)",
    "pick.probe?.remove()",
    "writeSegment(pick.segment, pick.option, pick.at)",
    "writeRail(rail, railBoxes[i])",
  ].map((needle) => flush.indexOf(needle));
  assert.ok(order.every((at) => at > 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "read, write, read, write");
  // The read helpers write nothing; the write helpers read no layout.
  const body = (name, next) => controls.slice(controls.indexOf(`function ${name}(`), controls.indexOf(`function ${next}(`));
  for (const reader of [body("readSegment", "writeSegment"), body("readRail", "writeRail")])
    assert.doesNotMatch(reader, /setAttribute|setProperty|removeAttribute|toggleAttribute|appendChild/);
  for (const writer of [body("writeSegment", "inspectSegment"), body("writeRail", "watchEdges")])
    assert.doesNotMatch(writer, /getBoundingClientRect|getComputedStyle|offset(Left|Top|Width|Height)|scrollWidth|clientWidth/);
  // A scan reads every new group and rail before it writes any.
  const scan = controls.slice(controls.indexOf("function scan() {"), controls.indexOf("const tree = new view.MutationObserver"));
  assert.ok(scan.indexOf("map(inspectRail)") < scan.indexOf("attachSegment(found)"));
  assert.ok(scan.indexOf("attachRail(found)") < scan.indexOf("watchEdges(rail)"));
  // A group taken on is measured with the next frame's batch, not on the spot.
  assert.match(body("attachSegment", "settle"), /queue\(el\);/);
  assert.doesNotMatch(body("attachSegment", "settle"), /getBoundingClientRect|readSegment/);
});

test("with requestIdleCallback the estimate runs in idle time, and stops with the option", async () => {
  const lib = await loadTone();
  const page = tonePage();
  const idle = [];
  page.view.requestIdleCallback = (fn, options) => {
    idle.push(options);
    return page.view.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 8 }), 30);
  };
  page.view.cancelIdleCallback = (id) => page.view.clearTimeout(id);
  page.art.top = 0;
  page.art.height = 800;
  const chip = page.control("chip", 300);
  page.controls.push(chip);
  const stop = lib.watchLiquidTone(page.doc);
  assert.equal(idle.length, 1, "the first look is an idle callback");
  assert.equal(idle[0].timeout, lib.IDLE_TIMEOUT_MS);
  page.advance(31);
  page.intersect(320);
  assert.equal(chip.hasAttribute("data-lg-busy"), false, "not read in the observer's callback");
  page.advance(31);
  assert.equal(chip.hasAttribute("data-lg-busy"), true);
  page.mo().fn([{ type: "childList", addedNodes: [page.art], removedNodes: [] }]);
  page.advance(lib.ART_SETTLE_MS + 1);
  stop();
  assert.equal(page.timers.size, 0, "the pending idle read is cancelled");
});
