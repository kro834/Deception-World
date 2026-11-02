// The liquid glass's long press (owner, 2026-11-01: 「リキッドグラス長押し時の
// ボタンの大型化や光の拡散効果を実装して」). Pins its scope (the glass option
// only), that a quick tap keeps the shared press while only a hold swells
// (to iOS 26's size, and lifted out of a clipping ancestor rather than
// capped), that the draggables' boxes are lit but never scaled or resized
// while the switch sliders swell a decorative layer with a sheen, that one
// overlay carries the light, and the fallbacks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const controls = read("src/styles-liquid-glass-controls.css");
const defs = read("src/components/liquid-glass-defs.tsx");
const glassSource = read("src/lib/liquid-glass.ts");
const holdSource = read("src/lib/liquid-glass-hold.ts");
const section = controls.slice(controls.indexOf("8. The hold"));

const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const dataUrl = (code) => "data:text/javascript;base64," + Buffer.from(code).toString("base64");

async function loadHold() {
  const glass = dataUrl(transpile(glassSource));
  const code = transpile(holdSource).replace(/from "\.\/liquid-glass"/, `from "${glass}"`);
  return import(dataUrl(code));
}

/** Every rule (selector + body), comments stripped, at-rule wrappers flattened. */
function rules(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(clean))) {
    const selector = match[1].trim().replace(/^@media[^{]*$/, "");
    out.push({ selector, body: match[2] });
  }
  return out;
}

/* A small DOM and clock: enough for the module's listeners, timers and writes. */
function world({ cls = ".primary-action", width = 120, height = 44, clipped = false, clock = false } = {}) {
  let now = 0;
  const timers = new Map();
  let nextId = 1;
  const reads = { rect: 0, style: 0 };
  const listeners = new Map();
  const makeStyle = () => {
    const props = new Map();
    return {
      props,
      setProperty: (k, v) => props.set(k, String(v)),
      removeProperty: (k) => props.delete(k),
      getPropertyValue: (k) => props.get(k) ?? "",
    };
  };
  const makeEl = (name, extra = {}) => {
    const attrs = new Map();
    const el = {
      localName: name,
      className: "",
      isConnected: true,
      hidden: false,
      children: [],
      parentNode: null,
      parentElement: null,
      style: makeStyle(),
      offsetWidth: 0,
      offsetHeight: 0,
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => attrs.delete(k),
      toggleAttribute: (k, on) => (on ? attrs.set(k, "") : attrs.delete(k)),
      attrs,
      append: (...nodes) => nodes.forEach((n) => el.appendChild(n)),
      appendChild: (n) => {
        n.parentNode = el;
        el.children.push(n);
        appended.push(n);
        return n;
      },
      remove: () => {
        el.parentNode = null;
      },
      insertBefore: (n) => el.appendChild(n),
      querySelector: () => null,
      querySelectorAll: () => [],
      cloneNode: () => {
        const copy = makeEl(name);
        copies.push(copy);
        return copy;
      },
      getBoundingClientRect: () => {
        reads.rect += 1;
        return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
      },
      closest: () => null,
      matches: () => false,
      ...extra,
    };
    return el;
  };
  const appended = [];
  const copies = [];
  const body = makeEl("body");
  const html = makeEl("html");
  const target = makeEl("button", {
    offsetWidth: width,
    offsetHeight: height,
    getBoundingClientRect: () => {
      reads.rect += 1;
      return { left: 100, top: 200, right: 100 + width, bottom: 200 + height, width, height };
    },
    closest: (sel) => (sel.includes(cls) && !sel.startsWith("dialog") ? target : null),
    contains: (node) => node === target,
    matches: (sel) => sel.split(",").some((part) => part.trim() === cls),
  });
  target.parentElement = body;
  // A scrolling rail around the control, 5px of room on every side.
  const rail = makeEl("div", {
    clipping: true,
    clientLeft: 0,
    clientTop: 0,
    clientWidth: width + 10,
    clientHeight: height + 10,
    getBoundingClientRect: () => {
      reads.rect += 1;
      return { left: 95, top: 195, right: 105 + width, bottom: 205 + height, width: width + 10, height: height + 10 };
    },
  });
  if (clipped) {
    target.parentElement = rail;
    rail.parentElement = body;
  }
  const doc = {};
  for (const el of [body, html, target, rail]) el.ownerDocument = doc;
  class Element {}
  Object.setPrototypeOf(target, Element.prototype);
  const view = {
    Element,
    innerWidth: 400,
    innerHeight: 800,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (fn) => view.setTimeout(fn, 16),
    cancelAnimationFrame: (id) => timers.delete(id),
    getComputedStyle: (el) => {
      reads.style += 1;
      return {
        scale: "none",
        borderRadius: "999px",
        zIndex: "auto",
        position: "static",
        display: "flex",
        content: "none",
        overflowX: el?.clipping ? "auto" : "visible",
        overflowY: el?.clipping ? "hidden" : "visible",
        contain: "none",
        backgroundColor: "rgba(0, 0, 0, 0)",
        getPropertyValue: (k) => (k === "--lg-tint" ? "122 232 255" : ""),
      };
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  // The page's clock (event.timeStamp and performance.now share it).
  if (clock) view.performance = { now: () => now };
  Object.assign(doc, {
    defaultView: view,
    body,
    documentElement: html,
    createElement: (name) => makeEl(name),
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  });
  const fire = (type, init = {}) =>
    listeners.get(type)?.({
      isPrimary: true,
      button: 0,
      pointerId: 1,
      pointerType: "touch",
      clientX: 130,
      clientY: 220,
      target,
      preventDefault() {
        this.prevented = true;
      },
      ...init,
    });
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
  // The main thread blocked: time passes, no timer or frame runs.
  const stall = (ms) => {
    now += ms;
  };
  return { doc, target, fire, advance, stall, now: () => now, reads, appended, listeners, copies };
}

test("the hold starts only with the glass option, from the glass defs", () => {
  const effect = defs.slice(defs.indexOf("if (!on) return;"));
  assert.match(effect, /const stopHold = watchLiquidHold\(document\);/);
  assert.match(effect, /stopHold\(\);/);
  assert.ok(
    defs.indexOf("if (!on) return;") < defs.indexOf("watchLiquidHold(document)"),
    "started after the option check",
  );
});

test("every hold rule waits for html[data-button-style=liquid]", () => {
  let count = 0;
  for (const { selector } of rules(section)) {
    if (!selector || /^(from|to|\d+%)$/.test(selector)) continue;
    for (const part of selector.split(/,(?![^(]*\))/)) {
      assert.match(part.trim(), /^html\[data-button-style="liquid"\]/, part);
      count += 1;
    }
  }
  assert.ok(count > 20, `${count} selectors`);
});

test("a quick tap keeps the shared press: no swell, no light, no measuring", async () => {
  const { watchLiquidHold, HOLD_MS } = await loadHold();
  assert.ok(HOLD_MS >= 180 && HOLD_MS <= 250, `hold ${HOLD_MS}ms`);
  const w = world();
  const stop = watchLiquidHold(w.doc);
  w.fire("pointerdown");
  w.advance(HOLD_MS - 60);
  w.fire("pointerup");
  w.advance(1000);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  assert.equal(w.target.style.getPropertyValue("--lg-hold-s"), "");
  assert.equal(w.appended.length, 0, "no overlay for a tap");
  assert.equal(w.reads.rect, 0, "a tap reads no layout");
  stop();
});

test("a tap whose pointerup arrives late (after the timer) is still a tap", async () => {
  const { watchLiquidHold, HOLD_MS } = await loadHold();
  const w = world();
  const stop = watchLiquidHold(w.doc);
  // The browser stamped the pointerup 16 ms after the pointerdown but handed
  // it over only after the hold timer had run (QA: about 390 ms late).
  w.fire("pointerdown", { type: "pointerdown", timeStamp: 1000 });
  w.advance(HOLD_MS + 20);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  w.fire("pointerup", { type: "pointerup", timeStamp: 1016 });
  assert.equal(w.target.getAttribute("data-lg-hold"), null, "no release spring for a tap");
  assert.equal(w.target.style.getPropertyValue("--lg-hold-s"), "");
  const overlay = w.appended.find((n) => n.className === "lg-hold");
  assert.equal(overlay.hidden, true);
  // A pointerup that queued behind the timer, before the next frame: the
  // hold never starts at all.
  w.fire("pointerdown", { type: "pointerdown", timeStamp: 3000 });
  w.advance(HOLD_MS + 4);
  w.fire("pointerup", { type: "pointerup", timeStamp: 3016 });
  w.advance(100);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  assert.equal(overlay.hidden, true);
  // A real hold, stamped past HOLD_MS, still springs back.
  w.fire("pointerdown", { type: "pointerdown", timeStamp: 5000 });
  w.advance(HOLD_MS + 20);
  w.fire("pointerup", { type: "pointerup", timeStamp: 5000 + HOLD_MS + 40 });
  assert.equal(w.target.getAttribute("data-lg-hold"), "out");
  stop();
});

test("the hold's light keeps a label's contrast: no strong white wash", () => {
  const bloom = section.match(/\.lg-hold-bloom \{\s*background: radial-gradient\(([^;]+)\);/);
  assert.ok(bloom, "bloom gradient");
  // The glow is the glass's tint, never white.
  assert.doesNotMatch(bloom[1], /rgb\(255 255 255/);
  for (const [, alpha] of bloom[1].matchAll(/\/ ([\d.]+)\)/g))
    assert.ok(Number(alpha) <= 0.2, `bloom stop alpha ${alpha}`);
  // The highlight's white core is small and no stronger than a quarter.
  const spec = section.match(/\.lg-hold-spec \{\s*background:\s*([^;]+);/);
  assert.ok(spec, "specular gradient");
  for (const [, alpha] of spec[1].matchAll(/rgb\(255 255 255 \/ ([\d.]+)\)/g))
    assert.ok(Number(alpha) <= 0.25, `specular stop alpha ${alpha}`);
  assert.match(spec[1], /rgb\(255 255 255 \/ 0\) 20%/, "the core ends within a fifth of its box");
  // The control's own light is not animated a second time by the hold.
  assert.doesNotMatch(section.replace(/\/\*[\s\S]*?\*\//g, ""), /--lg-glow:\s*[\d.]+;/);
});

test("a container that takes the finger (a swipe to close) ends the hold", async () => {
  const { watchLiquidHold, HOLD_MS, RELEASE_MS } = await loadHold();
  const w = world();
  const stop = watchLiquidHold(w.doc);
  w.fire("pointerdown");
  w.advance(HOLD_MS + 40);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  // The control capturing its own pointer (Ciel's drag) keeps the hold.
  w.fire("gotpointercapture", { target: w.target });
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  // The side menu's panel capturing it to swipe: the light lets go.
  w.fire("gotpointercapture", { target: w.doc.body });
  assert.equal(w.target.getAttribute("data-lg-hold"), "out");
  w.advance(RELEASE_MS + 10);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  stop();
});

test("a finger that travels before the hold is a scroll, not a hold", async () => {
  const { watchLiquidHold, HOLD_MS, HOLD_SLOP_PX } = await loadHold();
  const w = world();
  const stop = watchLiquidHold(w.doc);
  w.fire("pointerdown");
  w.fire("pointermove", { clientY: 220 + HOLD_SLOP_PX + 2 });
  w.advance(HOLD_MS * 2);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  stop();
});

test("a hold swells the control, lights one overlay, follows the finger and springs back", async () => {
  const { watchLiquidHold, HOLD_MS, RELEASE_MS, SWELL_SMALL, SWELL_LARGE } = await loadHold();
  const w = world();
  const stop = watchLiquidHold(w.doc);
  w.fire("pointerdown");
  // The timer arms the hold, which starts on the next frame; the overlay
  // lights a frame after that.
  w.advance(HOLD_MS + 40);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  assert.equal(w.target.getAttribute("data-lg-hold-kind"), "swell");
  const s = Number(w.target.style.getPropertyValue("--lg-hold-s"));
  assert.ok(s >= SWELL_LARGE && s <= SWELL_SMALL, `swell ${s}`);
  const overlays = w.appended.filter((n) => n.className === "lg-hold");
  assert.equal(overlays.length, 1);
  const overlay = overlays[0];
  assert.equal(overlay.getAttribute("data-state"), "on");
  // A move while held writes the light's position and reads nothing.
  const reads = { ...w.reads };
  const before = overlay.style.getPropertyValue("--lg-tx");
  w.fire("pointermove", { clientX: 150 });
  assert.notEqual(overlay.style.getPropertyValue("--lg-tx"), before);
  assert.deepEqual(w.reads, reads, "no layout or style read on a move");
  // Release: out, then cleared.
  w.fire("pointerup");
  assert.equal(w.target.getAttribute("data-lg-hold"), "out");
  assert.equal(overlay.getAttribute("data-state"), "out");
  w.advance(RELEASE_MS + 10);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  assert.equal(w.target.style.getPropertyValue("--lg-hold-s"), "");
  assert.equal(overlay.hidden, true);
  // A second hold reuses the same overlay: at most one diffusion layer.
  w.fire("pointerdown");
  w.advance(HOLD_MS + 20);
  assert.equal(w.appended.filter((n) => n.className === "lg-hold").length, 1);
  stop();
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  assert.equal(w.listeners.size, 0, "every listener removed");
});

test("the swell is larger for an icon than for a card, and never past a clip", async () => {
  const { swellFor, fitScale, SWELL_SMALL, SWELL_LARGE } = await loadHold();
  assert.equal(swellFor(40, 40), SWELL_SMALL);
  assert.equal(swellFor(320, 120), SWELL_LARGE);
  assert.ok(swellFor(120, 44) < SWELL_SMALL && swellFor(120, 44) > SWELL_LARGE);
  const box = { left: 0, top: 10, right: 100, bottom: 50 };
  assert.equal(fitScale(box, { left: -100, top: -100, right: 200, bottom: 200 }, 50, 30) > 2, true);
  // Two px of room above and below a 40px box: no growth.
  assert.equal(fitScale(box, { left: -100, top: 10, right: 200, bottom: 50 }, 50, 30), 1);
});

test("the swell is iOS 26's size: icons 1.42, pills about 1.28, cards 1.15, large cards 1.12", async () => {
  const { swellFor, SWELL_SMALL, SWELL_LARGE } = await loadHold();
  assert.equal(SWELL_SMALL, 1.42);
  assert.equal(SWELL_LARGE, 1.12);
  assert.equal(swellFor(44, 44), 1.42);
  assert.ok(Math.abs(swellFor(96, 44) - 1.28) < 1e-9);
  assert.ok(Math.abs(swellFor(200, 120) - 1.15) < 1e-9);
  assert.equal(swellFor(360, 330), 1.12);
  // Never shrinks as a box grows.
  let last = Infinity;
  for (let d = 20; d < 500; d += 7) {
    const s = swellFor(d, 30);
    assert.ok(s <= last + 1e-9, `${d}px`);
    last = s;
  }
});

test("a clipped control is lifted, not capped: a copy swells in the overlay", async () => {
  const { watchLiquidHold, HOLD_MS, RELEASE_MS, swellFor } = await loadHold();
  const w = world({ clipped: true });
  const stop = watchLiquidHold(w.doc);
  w.fire("pointerdown");
  w.advance(HOLD_MS + 40);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  assert.equal(w.target.getAttribute("data-lg-hold-lift"), "", "lifted");
  // The control itself stays at rest (it keeps the finger and the click).
  assert.equal(w.target.style.getPropertyValue("--lg-hold-s"), "1");
  const overlay = w.appended.find((n) => n.className === "lg-hold");
  const copy = overlay.children.find((n) => n.getAttribute("class")?.includes("lg-hold-lift"));
  assert.ok(copy, "the copy is in the overlay");
  assert.match(copy.getAttribute("class"), /\blg-lens-target\b/, "the refraction hook");
  assert.equal(copy.getAttribute("aria-hidden"), "true");
  assert.equal(copy.getAttribute("inert"), "");
  // The full swell, not the 5px rail's cap.
  const s = Number(copy.style.getPropertyValue("scale"));
  assert.ok(Math.abs(s - swellFor(120, 44)) < 0.002, `copy swell ${s}`);
  assert.equal(overlay.style.getPropertyValue("--lg-hold-s"), s.toFixed(3));
  w.fire("pointerup");
  assert.equal(copy.style.getPropertyValue("scale"), "1", "springs back");
  w.advance(RELEASE_MS + 10);
  assert.equal(w.target.getAttribute("data-lg-hold-lift"), null);
  assert.equal(copy.parentNode, null, "the copy is removed");
  stop();
});

test("the draggables' boxes are lit, never scaled", async () => {
  const { watchLiquidHold, HOLD_MS, HOLD_LIGHT_ONLY, HOLD_SWELL } = await loadHold();
  for (const draggable of [".zeus-button", ".ios-slide-open"]) {
    assert.ok(HOLD_LIGHT_ONLY.includes(draggable));
    assert.ok(!HOLD_SWELL.includes(draggable), draggable);
  }
  assert.ok(HOLD_LIGHT_ONLY.some((s) => s.includes('input[type="range"]')));
  for (const cls of [".zeus-button", ".ios-slide-open"]) {
    const w = world({ cls });
    const stop = watchLiquidHold(w.doc);
    w.fire("pointerdown");
    w.advance(HOLD_MS + 20);
    assert.equal(w.target.getAttribute("data-lg-hold-kind"), "light", cls);
    assert.equal(Number(w.target.style.getPropertyValue("--lg-hold-s")), 1, cls);
    assert.equal(w.target.getAttribute("data-lg-hold-raise"), null);
    stop();
  }
  // In the sheet, every scale on a held control excludes them, and nothing
  // in the hold's rules sets transform or a size on a control.
  for (const { selector, body } of rules(section)) {
    if (/\.lg-hold/.test(selector)) continue;
    assert.doesNotMatch(
      body,
      /(^|[\s;])(transform|width|height|inset|margin|padding)\s*:/,
      selector,
    );
    if (!/\bscale\s*:\s*var\(--lg-hold-s/.test(body)) continue;
    for (const part of selector.split(/,(?![^(]*\))/)) {
      const p = part.trim();
      if (/\.side-panel-zeus-toggle\[data-lg-hold="on"\]\s*>\s*i/.test(p)) continue;
      assert.match(p, /\[data-lg-hold-kind="swell"\]/, p);
      assert.match(p, /:not\(\.zeus-button, \.ios-slide-open, input\)/, p);
    }
  }
});

test("the light moves only scale, translate and opacity, and samples nothing", () => {
  assert.doesNotMatch(section, /backdrop-filter/);
  for (const { selector, body } of rules(section)) {
    if (!/\.lg-hold/.test(selector)) continue;
    const transition = body.match(/transition:\s*([^;]+);/)?.[1];
    if (transition)
      for (const item of transition.split(/,(?![^(]*\))/))
        assert.match(item.trim(), /^(scale|translate|opacity)\s/, `${selector}: ${item}`);
  }
  // No keyframes: every layer eases between states.
  assert.doesNotMatch(section, /@keyframes/);
});

test("the hold is the finger as a light over curved glass: highlight, reflection, Fresnel rim, caustic", () => {
  // The overlay's layers, in order: the glow, the reflection band, the
  // specular highlight, the rim.
  assert.match(holdSource, /\["lg-hold-bloom", "lg-hold-band", "lg-hold-spec", "lg-hold-rim"\]/);
  // The finger's bearing and reach, from the direction the script writes.
  assert.match(section, /--lg-ang: atan2\(var\(--lg-dx, 0\), calc\(-1 \* var\(--lg-dy, 0\)\)\);/);
  assert.match(section, /--lg-reach: min\(1, hypot\(var\(--lg-dx, 0\), var\(--lg-dy, 0\)\)\);/);
  // The highlight sits between the finger and the apex, a little above.
  const spec = section.match(/\.lg-hold-spec \{[^}]*translate:\s*([^;]+);/);
  assert.ok(spec, "specular placement");
  assert.match(spec[1], /var\(--lg-cx\) \+ \(var\(--lg-tx\) - var\(--lg-cx\)\) \* 0\.56/);
  assert.match(spec[1], /\(var\(--lg-ty\) - var\(--lg-cy\)\) \* 0\.3 - var\(--lg-hold-h\) \* 0\.36/);
  // The reflection drifts against the finger.
  const band = section.match(/\.lg-hold-band \{[^}]*translate:\s*([^;]+);/);
  assert.match(band[1], /\(var\(--lg-tx\) - var\(--lg-cx\)\) \* -0\.45/);
  // The rim's lobe turns toward the finger and grows toward the edge, with
  // a warm and a cool fringe a pixel apart.
  const rim = section.match(/\.lg-hold-rim \{([^}]*)\}/);
  assert.match(rim[1], /conic-gradient\(\s*from calc\(var\(--lg-ang\) - 180deg\)/);
  assert.match(rim[1], /opacity: calc\(0\.5 \+ 0\.5 \* var\(--lg-reach, 0\)\);/);
  assert.match(rim[1], /rgb\(255 120 150 \/ 0\.3\)/);
  assert.match(rim[1], /rgb\(120 200 255 \/ 0\.34\)/);
  // The caustic pools on the far side, below.
  const halo = section.match(/\.lg-hold-halo \{\s*box-shadow:\s*([^;]+);/);
  assert.match(halo[1], /calc\(var\(--lg-dx, 0\) \* -10px\) calc\(var\(--lg-dy, 0\) \* -8px \+ 10px\)/);
  // The light clips to the control's outline, corner family included.
  assert.match(holdSource, /setProperty\("--lg-hold-cs", bare \? "round" : style\.getPropertyValue\("corner-shape"\) \|\| "round"\)/);
  assert.match(section, /corner-shape: var\(--lg-hold-cs, round\);/);
  // Released, every layer relaxes to the rest light.
  for (const layer of ["lg-hold-band", "lg-hold-spec", "lg-hold-rim"])
    assert.match(section, new RegExp(`\\[data-state="out"\\] \\.${layer} \\{[^}]*opacity: 0;`), layer);
});

test("the fallbacks: reduced motion, economy, reduced transparency, forced colours", () => {
  const swell = section.indexOf("@media (prefers-reduced-motion: no-preference)");
  const firstScale = section.indexOf("scale: calc(var(--lg-hold-s");
  assert.ok(swell > 0 && swell < firstScale, "the swell waits for no-preference");
  const block = section.slice(swell, section.indexOf("/* Held, the glass keeps"));
  for (const { selector } of rules(block))
    if (selector) assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/, selector);
  const reduce = section.slice(section.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduce, /scale: 1 !important/);
  assert.match(reduce, /\.lg-hold-band, \.lg-hold-spec\) \{\s*display: none;/);
  assert.match(
    section,
    /\[data-world-effects="economy"\] \.lg-hold :is\(\.lg-hold-halo, \.lg-hold-band, \.lg-hold-spec, \.lg-hold-rim\) \{\s*display: none;/,
  );
  assert.match(
    section,
    /@media \(prefers-reduced-transparency: reduce\) \{\s*html\[data-button-style="liquid"\] \.lg-hold \{\s*opacity: 0\.5;/,
  );
  const forced = section.slice(section.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.lg-hold \{\s*display: none !important;/);
  assert.match(forced, /scale: none !important/);
});

test("the module reads layout only when a hold starts, never on a move", () => {
  const move = holdSource.slice(
    holdSource.indexOf("const move = (event: PointerEvent)"),
    holdSource.indexOf("const up = (event: PointerEvent)"),
  );
  const follow = holdSource.slice(
    holdSource.indexOf("const follow = "),
    holdSource.indexOf("const startHold = "),
  );
  for (const part of [move, follow])
    assert.doesNotMatch(
      part,
      /getBoundingClientRect|getComputedStyle|offset(Left|Top|Width|Height)|client(Width|Height)/,
    );
  const down = holdSource.slice(
    holdSource.indexOf("const down = (event: PointerEvent)"),
    holdSource.indexOf("const move = (event: PointerEvent)"),
  );
  assert.doesNotMatch(down, /getBoundingClientRect|getComputedStyle/);
  assert.match(down, /setTimeout\(arm, Math\.max\(0, HOLD_MS - since\(stamp\)\)\)/);
});

/* The switch sliders (owner, 2026-11-01: 「六詠や犬の切り替えスライダー長押し時
   などに光沢とともに拡大する様にして」, then 「拡大も小さすぎます」): each swells
   a decorative layer no drag measures, with a sheen, and only on glass. */
test("the switch sliders swell with a sheen: the rails' lens, the slide lens, the thumbs, the pill", () => {
  const glassSheet = read("src/styles-liquid-glass.css");
  const boot = read("src/lib/liquid/boot.js");
  const rail = read("src/components/world/liquid-rail.tsx");
  const slide = read("src/components/world/slide-open-control.tsx");
  const clean = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  const c = clean(controls);
  // The tab rails (the 六詠 / 犬 rail and the rest): the held surface scales
  // by the lens's own size, 1.5x across and 1.6x up and down at most.
  const held = c.match(
    /\.liquid-swipe-tabs\[data-liquid-held="true"\]\s*>\s*\.liquid-selection-lens\s*>\s*\.liquid-selection-surface[^{]*\{([^}]*)\}/,
  );
  assert.ok(held, "held rail surface rule");
  assert.match(held[1], /scale: calc\(\s*\(1 \+ min\(0\.5, 44 \/ var\(--liquid-lens-wn, 88\)\)\) \*/);
  assert.match(held[1], /calc\(\s*\(1 \+ min\(0\.6, 34 \/ var\(--liquid-lens-hn, 56\)\)\) \*/);
  // Stretched along a fast drag, thinner across it (boot.js's velocity).
  assert.match(held[1], /1 \+ 0\.2 \* max\(var\(--liquid-lens-vx, 0\), -1 \* var\(--liquid-lens-vx, 0\)\)/);
  assert.match(held[1], /translate: var\(--liquid-lens-dx, 0px\) var\(--liquid-lens-dy, 0px\)/);
  assert.doesNotMatch(held[1], /(^|[\s;])(transform|width|height|left|top)\s*:/);
  // The 六詠 rail's 82 x 66 lens grows by half or more both ways.
  const sx = 1 + Math.min(0.5, 44 / 82);
  const sy = 1 + Math.min(0.6, 34 / 66);
  assert.ok(sx >= 1.5 && sy >= 1.5, `${sx} ${sy}`);
  assert.match(c, /@keyframes lg-rail-sheen/);
  assert.match(c, /liquid-selection-surface[^{]*::after \{\s*opacity: 1;\s*animation: lg-rail-sheen/);
  // Only under full motion, never in economy.
  const swell = controls.indexOf("(1 + min(0.5, 44 / var(--liquid-lens-wn");
  const media = controls.lastIndexOf("@media (prefers-reduced-motion: no-preference)", swell);
  assert.ok(media > 0 && controls.slice(media, swell).split("@media").length === 2);
  assert.match(controls.slice(media, swell), /:not\(\[data-world-effects="economy"\]\)/);
  // boot.js writes the size and the nudge, and reads the room once per press.
  assert.match(boot, /setProperty\('--liquid-lens-wn'/);
  assert.match(boot, /setProperty\('--liquid-lens-dx'/);
  assert.match(boot, /room: glassOn\(\) \? roomAround\(rect\) : null/);
  const nudge = boot.slice(boot.indexOf("const nudgeLens"), boot.indexOf("const settle ="));
  assert.doesNotMatch(nudge, /getBoundingClientRect|getComputedStyle/, "no layout read per move");
  // The slide-to-open lens: 1.6, the track a ring of light, never the box.
  assert.match(clean(glassSheet), /\.ios-slide-open\[data-lens="on"\]\s*\.ios-slide-open-lens-body[^{]*\{\s*opacity: 1;\s*scale: 1\.6;/);
  assert.match(clean(glassSheet), /\.ios-slide-open\[data-lens="on"\]:not\(#lg-glass\)[^{]*\{\s*box-shadow:[^}]*0 0 0 3px/);
  // The range thumbs: 1.75 by 1.65 while held.
  assert.equal((c.match(/transform: scale\(1\.75, 1\.65\)/g) ?? []).length, 2);
  // The dog selector's pill (a segment group) swells with its held option.
  assert.match(c, /:has\(> \[data-lg-seg-current\]\[data-lg-hold="on"\]\)[^{]*::before[^{]*\{\s*transform: translateX\(calc\(var\(--lg-seg-w, 0px\) \* \(1 - var\(--lg-hold-pill-s, 1\)\) \/ 2\)\)\s*scale\(var\(--lg-hold-pill-s, 1\)\)/);
  assert.match(holdSource, /pillOf\(target\)\?\.style\.setProperty\(PILL_S/);
  // The hooks the refraction attaches to.
  assert.match(rail, /className="liquid-selection-surface lg-lens-target"/);
  assert.match(slide, /className="ios-slide-open-lens-body lg-lens-target"/);
  // Every new rule waits for the glass option.
  for (const sheet of [controls, glassSheet])
    for (const { selector } of rules(sheet)) {
      if (!/lg-rail-sheen|liquid-lens-|lg-hold-pill-s|data-lens="on"\]:not/.test(selector)) continue;
      for (const part of selector.split(/,(?![^(]*\))/))
        assert.match(part.trim(), /^html\[data-button-style="liquid"\]/, part);
    }
});

test("glass off: the rails, the slide lens and the hold leave no trace", () => {
  // Nothing outside the glass sheets reads the rails' new properties.
  const boot = read("src/lib/liquid/boot.js");
  assert.match(boot, /const glassOn = \(\) => document\.documentElement\?\.getAttribute\?\.\('data-button-style'\) === 'liquid'/);
  for (const prop of ["--liquid-lens-wn", "--liquid-lens-dx", "--lg-hold-pill-s", "lg-lens-target"]) {
    for (const file of ["src/styles.css", "src/styles-frosted-controls.css", "src/styles-world/12.css", "src/styles-world/13.css"])
      assert.ok(!read(file).includes(prop), `${prop} in ${file}`);
  }
});

test("a held label over art keeps 6:1: a deeper veil, the glare held at half", async () => {
  const { watchLiquidHold, HOLD_MS } = await loadHold();
  for (const [busy, text, marked] of [
    [true, "SHUFFLE POSTER", true],
    [true, " ", false],
    [false, "自動切替", false],
  ]) {
    const w = world();
    w.target.textContent = text;
    if (busy) w.target.setAttribute("data-lg-busy", "");
    const stop = watchLiquidHold(w.doc);
    w.fire("pointerdown");
    w.advance(HOLD_MS + 40);
    const overlay = w.appended.find((n) => n.className === "lg-hold");
    assert.equal(overlay.hasAttribute("data-busy-label"), marked, `${busy} ${text}`);
    stop();
  }
  assert.match(section, /\.lg-hold\[data-busy-label\] \{\s*--lg-hold-glare: 0\.5;/);
  assert.match(section, /\.lg-hold\[data-state="on"\] \.lg-hold-bloom \{[^}]*opacity: var\(--lg-hold-glare, 1\);/);
  assert.match(section, /\.lg-hold\[data-state="on"\] \.lg-hold-spec \{[^}]*opacity: var\(--lg-hold-glare, 1\);/);
  assert.match(
    section,
    /\[data-lg-hold="on"\]\[data-lg-hold-kind="swell"\]:not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\):not\(#lg-glass\) \{\s*--lg-veil-add: 0\.16;/,
  );
});

test("a crowded swell floats over its neighbours, and drops back on release", async () => {
  const { watchLiquidHold, HOLD_MS, RELEASE_MS } = await loadHold();
  // The tab rows and the bar keep the big swell (owner, 2026-11-01): the
  // held chip is raised (z-index) over the chips beside it, iOS's way.
  const w = world({ width: 87, height: 44 });
  const stop = watchLiquidHold(w.doc);
  w.fire("pointerdown");
  w.advance(HOLD_MS + 40);
  assert.equal(w.target.getAttribute("data-lg-hold-raise"), "");
  assert.ok(Number(w.target.style.getPropertyValue("--lg-hold-s")) > 1.28);
  w.fire("pointerup", { timeStamp: 1000 });
  w.advance(RELEASE_MS + 20);
  assert.equal(w.target.getAttribute("data-lg-hold-raise"), null);
  stop();
  assert.match(section, /\[data-lg-hold-raise\]:is\(\[data-lg-hold="on"\], \[data-lg-hold="out"\]\)[^{]*\{\s*z-index: 4;/);
});

test("the compact launchers are lit when held, never scaled", async () => {
  const { HOLD_LIGHT_ONLY } = await loadHold();
  assert.ok(
    HOLD_LIGHT_ONLY.includes(
      ':is([data-ipad-menu="compact"], [data-phone-landscape-menu="true"]) .side-panel-trigger',
    ),
  );
});

test("a hold is timed from the finger: a late pointerdown or a late timer starts it at once", async () => {
  const { watchLiquidHold, HOLD_MS, HOLD_LATE_MS } = await loadHold();
  assert.ok(HOLD_LATE_MS > 0 && HOLD_LATE_MS <= 64, `late ${HOLD_LATE_MS}ms`);
  const w = world({ clock: true });
  const stop = watchLiquidHold(w.doc);
  w.advance(5000);

  // The page's first layout held the thread: the pointerdown is handed over
  // 1.3 s after the finger came down, the finger still on the glass. The
  // hold starts with the next task, not HOLD_MS and a frame later.
  w.fire("pointerdown", { type: "pointerdown", timeStamp: w.now() - 1300 });
  assert.equal(w.target.getAttribute("data-lg-hold"), null, "nothing in the handler itself");
  w.advance(0);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  w.fire("pointerup", { type: "pointerup", timeStamp: w.now() });
  assert.equal(w.target.getAttribute("data-lg-hold"), "out");
  w.advance(1000);

  // The timer itself runs late (the thread blocked after the pointerdown):
  // the hold starts as it fires, without waiting for another frame.
  const down = w.now();
  w.fire("pointerdown", { type: "pointerdown", timeStamp: down });
  w.stall(1400);
  w.advance(0);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  w.fire("pointerup", { type: "pointerup", timeStamp: down + 1500 });
  w.advance(1000);

  // On time, it still waits for the next frame (queued input first).
  const ontime = w.now();
  w.fire("pointerdown", { type: "pointerdown", timeStamp: ontime });
  w.advance(HOLD_MS);
  assert.equal(w.target.getAttribute("data-lg-hold"), null, "armed, not yet started");
  w.advance(20);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  w.fire("pointerup", { type: "pointerup", timeStamp: w.now() });
  w.advance(1000);

  // A pointerdown handed over late arms only what is left of HOLD_MS.
  const part = w.now();
  w.fire("pointerdown", { type: "pointerdown", timeStamp: part - 150 });
  w.advance(HOLD_MS - 150 - 1);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  w.advance(1 + 20);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  w.fire("pointerup", { type: "pointerup", timeStamp: w.now() });
  w.advance(1000);
  stop();
});

test("late or not, a tap is never a hold: a pointerup under HOLD_MS never lights", async () => {
  const { watchLiquidHold, HOLD_MS } = await loadHold();
  const w = world({ clock: true });
  const stop = watchLiquidHold(w.doc);
  w.advance(5000);
  // Both handed over together, 1.3 s late: the pointerup ends it first.
  const t = w.now() - 1300;
  w.fire("pointerdown", { type: "pointerdown", timeStamp: t });
  w.fire("pointerup", { type: "pointerup", timeStamp: t + 60 });
  w.advance(1000);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  assert.equal(w.appended.length, 0, "no overlay for a tap");
  // The hold started at once (the pointerup still queued behind it): the
  // pointerup stamped under HOLD_MS puts the light away before a frame.
  const t2 = w.now() - 1300;
  w.fire("pointerdown", { type: "pointerdown", timeStamp: t2 });
  w.advance(0);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on");
  w.fire("pointerup", { type: "pointerup", timeStamp: t2 + HOLD_MS - 20 });
  assert.equal(w.target.getAttribute("data-lg-hold"), null, "no release spring for a tap");
  const overlay = w.appended.find((n) => n.className === "lg-hold");
  assert.equal(overlay.hidden, true);
  // A clock that disagrees (a stamp from the future, or none) falls back to
  // the timer alone.
  w.advance(1000);
  w.fire("pointerdown", { type: "pointerdown", timeStamp: w.now() + 5000 });
  w.advance(HOLD_MS - 1);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  w.fire("pointerup", { type: "pointerup", timeStamp: w.now() + 5000 + HOLD_MS - 1 });
  stop();
});

test("the hold's pointer listeners stay passive and cheap", () => {
  assert.match(holdSource, /doc\.addEventListener\("pointerdown", down, passive\);/);
  assert.match(holdSource, /const passive = \{ capture: true, passive: true \} as const;/);
  const down = holdSource.slice(holdSource.indexOf("const down = (event: PointerEvent) => {"), holdSource.indexOf("const move = (event: PointerEvent) => {"));
  assert.doesNotMatch(down, /getBoundingClientRect|getComputedStyle|offsetWidth|requestAnimationFrame/);
  assert.match(down, /view\.setTimeout\(arm, Math\.max\(0, HOLD_MS - since\(stamp\)\)\)/);
});

test("a hold whose frame is held back by a long render starts HOLD_LATE_MS after the timer", async () => {
  const { watchLiquidHold, HOLD_MS, HOLD_LATE_MS } = await loadHold();
  const w = world({ clock: true });
  const view = w.doc.defaultView;
  const frames = [];
  const raf = view.requestAnimationFrame;
  // No frame comes while the page renders (the frame's callbacks are held).
  view.requestAnimationFrame = (fn) => {
    frames.push(fn);
    return 9999 + frames.length;
  };
  const stop = watchLiquidHold(w.doc);
  w.advance(5000);
  w.fire("pointerdown", { type: "pointerdown", timeStamp: w.now() });
  w.advance(HOLD_MS + HOLD_LATE_MS - 1);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  w.advance(1);
  assert.equal(w.target.getAttribute("data-lg-hold"), "on", "started without the frame");
  view.requestAnimationFrame = raf;
  // A tap in the same conditions never lights.
  w.fire("pointerup", { type: "pointerup", timeStamp: w.now() });
  w.advance(1000);
  view.requestAnimationFrame = (fn) => {
    frames.push(fn);
    return 1;
  };
  const t = w.now();
  w.fire("pointerdown", { type: "pointerdown", timeStamp: t });
  w.advance(HOLD_MS - 20);
  w.fire("pointerup", { type: "pointerup", timeStamp: t + HOLD_MS - 20 });
  w.advance(1000);
  assert.equal(w.target.getAttribute("data-lg-hold"), null);
  stop();
});
