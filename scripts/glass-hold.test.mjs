// The liquid glass's long press (owner, 2026-11-01: 「リキッドグラス長押し時の
// ボタンの大型化や光の拡散効果を実装して」). Pins its scope (the glass option
// only), that a quick tap keeps the shared press while only a hold swells,
// that the draggables are lit but never scaled or resized, that one overlay
// carries the light, and the fallbacks.
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
function world({ cls = ".primary-action", width = 120, height = 44 } = {}) {
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
      querySelector: () => null,
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
    matches: (sel) => sel.split(",").some((part) => part.trim() === cls),
  });
  target.parentElement = body;
  const doc = {};
  for (const el of [body, html, target]) el.ownerDocument = doc;
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
    getComputedStyle: () => {
      reads.style += 1;
      return {
        scale: "none",
        borderRadius: "999px",
        zIndex: "auto",
        position: "static",
        display: "flex",
        overflowX: "visible",
        overflowY: "visible",
        contain: "none",
        backgroundColor: "rgba(0, 0, 0, 0)",
        getPropertyValue: (k) => (k === "--lg-tint" ? "122 232 255" : ""),
      };
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
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
  return { doc, target, fire, advance, reads, appended, listeners };
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
  w.advance(HOLD_MS + 20);
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

test("the draggables are lit, never scaled", async () => {
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
  const keyframes = section.slice(section.indexOf("@keyframes lg-hold-ripple"));
  const frames = keyframes.slice(0, keyframes.indexOf("\n}\n"));
  assert.doesNotMatch(frames.replace(/scale|opacity/g, ""), /[a-z-]+\s*:/);
});

test("the fallbacks: reduced motion, economy, reduced transparency, forced colours", () => {
  const swell = section.indexOf("@media (prefers-reduced-motion: no-preference)");
  const firstScale = section.indexOf("scale: var(--lg-hold-s");
  assert.ok(swell > 0 && swell < firstScale, "the swell waits for no-preference");
  const block = section.slice(swell, section.indexOf("/* Held, the glass is lit"));
  for (const { selector } of rules(block))
    if (selector) assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/, selector);
  const reduce = section.slice(section.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduce, /scale: 1 !important/);
  assert.match(reduce, /\.lg-hold-ripple\) \{\s*display: none;/);
  assert.match(
    section,
    /\[data-world-effects="economy"\] \.lg-hold :is\(\.lg-hold-halo, \.lg-hold-ripple, \.lg-hold-rim\) \{\s*display: none;/,
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
  assert.match(down, /setTimeout\(startHold, HOLD_MS\)/);
});
