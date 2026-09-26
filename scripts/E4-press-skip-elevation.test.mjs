import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { watchPresses } from "../src/lib/press-feedback.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const root = read("src/routes/__root.tsx");
const styles = read("src/styles-press-feedback.css");
const rules = styles.replace(/\/\*[\s\S]*?\*\//g, "");
const press = read("src/lib/press-feedback.js");
const pressCode = press.replace(/^\s*\/\/.*$/gm, "");
const skip = read("src/components/skip-link.tsx");

// Just enough DOM for the watcher: elements that answer closest() for the
// pressable and skip lists, capturing listeners on the document, and a clock
// and timers the test advances by hand.
function fakePage() {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const listeners = new Map();
  const rootAttributes = new Set();
  const realPerformance = globalThis.performance;
  const hadElement = "Element" in globalThis;
  const RealElement = globalThis.Element;
  class Element {
    constructor({ pressable = true, skipped = false } = {}) {
      this.attributes = new Map();
      this.pressable = pressable;
      this.skipped = skipped;
    }
    closest(selector) {
      if (selector.includes("a[href]")) return this.pressable ? this : null;
      if (selector.includes(".liquid-swipe-tabs")) return this.skipped ? this : null;
      throw new Error(`unexpected selector ${selector}`);
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
  }
  globalThis.Element = Element;
  globalThis.performance = { now: () => now };
  const view = {
    setTimeout(run, ms) {
      const id = nextTimer++;
      timers.set(id, { run, at: now + ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(type, run) {
      listeners.set(`window:${type}`, run);
    },
    removeEventListener(type) {
      listeners.delete(`window:${type}`);
    },
  };
  const doc = {
    defaultView: view,
    documentElement: {
      setAttribute: (name) => rootAttributes.add(name),
      removeAttribute: (name) => rootAttributes.delete(name),
    },
    addEventListener(type, run, options) {
      listeners.set(type, { run, options });
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const advance = (ms) => {
    const until = now + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= until);
      if (due.length === 0) break;
      due.sort((a, b) => a[1].at - b[1].at);
      const [id, timer] = due[0];
      timers.delete(id);
      now = timer.at;
      timer.run();
    }
    now = until;
  };
  const fire = (type, event = {}) => listeners.get(type)?.run(event);
  const pointer = (type, target, { x = 0, y = 0, kind = "touch", id = 1, button = 0 } = {}) =>
    fire(type, {
      type,
      target,
      isPrimary: true,
      button,
      pointerId: id,
      pointerType: kind,
      clientX: x,
      clientY: y,
    });
  return {
    doc,
    listeners,
    rootAttributes,
    Element,
    advance,
    fire,
    pointer,
    restore() {
      globalThis.performance = realPerformance;
      if (hadElement) globalThis.Element = RealElement;
      else delete globalThis.Element;
    },
  };
}

test("a touch press is marked at once, held for a quick tap and settled on the house timing", () => {
  const page = fakePage();
  try {
    const dispose = watchPresses(page.doc);
    assert.ok(page.rootAttributes.has("data-press-ready"));
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "scroll"]) {
      assert.deepEqual(page.listeners.get(type).options, { capture: true, passive: true }, type);
    }
    const card = new page.Element();
    page.pointer("pointerdown", card);
    assert.equal(card.getAttribute("data-press"), "touch");
    page.advance(40);
    page.pointer("pointerup", card);
    // A 40 ms tap still shows the press for 150 ms in all.
    assert.equal(card.getAttribute("data-press"), "touch");
    page.advance(109);
    assert.equal(card.getAttribute("data-press"), "touch");
    page.advance(1);
    assert.equal(card.getAttribute("data-press"), "out");
    page.advance(340);
    assert.equal(card.getAttribute("data-press"), null);

    const button = new page.Element();
    page.pointer("pointerdown", button, { kind: "mouse" });
    assert.equal(button.getAttribute("data-press"), "in");
    dispose();
    assert.equal(button.getAttribute("data-press"), "out");
    assert.ok(!page.rootAttributes.has("data-press-ready"));
    assert.equal(page.listeners.size, 0);
  } finally {
    page.restore();
  }
});

test("a swipe, a scroll or a cancel releases at once, so a card never dips under a scroll", () => {
  const page = fakePage();
  try {
    watchPresses(page.doc);
    const card = new page.Element();
    page.pointer("pointerdown", card, { x: 100, y: 400 });
    page.pointer("pointermove", card, { x: 104, y: 394 });
    assert.equal(card.getAttribute("data-press"), "touch", "inside the 8 px slop");
    page.pointer("pointermove", card, { x: 104, y: 391 });
    assert.equal(card.getAttribute("data-press"), "out", "past the slop, before the 45 ms delay");

    const other = new page.Element();
    page.pointer("pointerdown", other);
    page.fire("scroll");
    assert.equal(other.getAttribute("data-press"), "out");

    const third = new page.Element();
    page.pointer("pointerdown", third);
    page.pointer("pointercancel", third);
    assert.equal(third.getAttribute("data-press"), "out");
  } finally {
    page.restore();
  }
});

test("two quick taps on different controls both settle", () => {
  const page = fakePage();
  try {
    watchPresses(page.doc);
    const first = new page.Element();
    const second = new page.Element();
    page.pointer("pointerdown", first);
    page.advance(40);
    page.pointer("pointerup", first);
    page.advance(40);
    page.pointer("pointerdown", second, { id: 2 });
    page.advance(40);
    page.pointer("pointerup", second, { id: 2 });
    page.advance(1000);
    assert.equal(first.getAttribute("data-press"), null);
    assert.equal(second.getAttribute("data-press"), null);
  } finally {
    page.restore();
  }
});

test("gesture owners, non-controls and secondary buttons are left alone", () => {
  const page = fakePage();
  try {
    watchPresses(page.doc);
    const railTab = new page.Element({ skipped: true });
    page.pointer("pointerdown", railTab);
    assert.equal(railTab.getAttribute("data-press"), null);
    const prose = new page.Element({ pressable: false });
    page.pointer("pointerdown", prose);
    assert.equal(prose.getAttribute("data-press"), null);
    const card = new page.Element();
    page.pointer("pointerdown", card, { kind: "mouse", button: 2 });
    assert.equal(card.getAttribute("data-press"), null);
  } finally {
    page.restore();
  }
  // The eight-riders rail (long-press select, vertical swipe scroll), HOLD +
  // SLIDE and the Zeus button own their gestures.
  assert.match(
    press,
    /const SKIP =\s*'\.liquid-swipe-tabs, \.ios-slide-open, \.zeus-button, \[data-press-skip\], \[aria-disabled="true"\]';/,
  );
  assert.doesNotMatch(pressCode, /preventDefault|getBoundingClientRect|\.style\./);
});

test("the root mounts the watcher and links its sheet after the pickup sheet", () => {
  assert.match(root, /import \{ watchPresses \} from "@\/lib\/press-feedback\.js";/);
  assert.match(root, /useEffect\(\(\) => watchPresses\(\), \[\]\);/);
  assert.match(root, /<AppGuards \/>\s*<DialogOpenFlag \/>\s*<PressFeedback \/>\s*<Outlet \/>/);
  assert.match(
    root,
    /\{ rel: "stylesheet", href: pickupVisibilityCss \},\s*\{ rel: "stylesheet", href: pressFeedbackCss \},/,
  );
});

test("the press moves only scale and filter, gated on script, reduced motion and economy", () => {
  // Every press rule waits for the watcher.
  let gated = 0;
  for (const [, selector] of rules.matchAll(/(?:^|[{}])\s*([^{}@]+?)\s*\{/g)) {
    if (/^(?::root|\.dw-skip-link)/.test(selector)) continue;
    gated += 1;
    assert.match(
      selector,
      /html\[data-(?:world-effects="economy"\]\[data-)?press-ready\]/,
      selector,
    );
  }
  assert.ok(gated >= 15, String(gated));
  // Scale only under no-preference; reduced motion keeps the light.
  const scales = [...styles.matchAll(/\n\s*scale:/g)].length;
  const gatedScales = [
    ...styles.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{[^@]*?\n\s*scale:/g),
  ].length;
  assert.equal(scales, 3);
  assert.equal(gatedScales, 3);
  // The two timing rules outweigh a later route sheet's transition shorthand
  // of equal weight (styles-world/28.css on the menu rows), so every control
  // keeps scale and filter in its list and the 45 ms touch hold-back.
  assert.match(
    styles,
    /html\[data-press-ready\] body \[data-press\]\[data-press\] \{\s*transition-property:\s*scale, filter,/,
  );
  assert.match(
    styles,
    /html\[data-press-ready\] body \[data-press\]\[data-press="touch"\] \{\s*transition-delay: 45ms;/,
  );
  assert.match(
    styles,
    /html\[data-world-effects="economy"\]\[data-press-ready\][^{]*\{\s*filter: none;/,
  );
  // Nothing loops, nothing blurs.
  assert.doesNotMatch(styles, /@keyframes|animation|infinite|backdrop-filter|blur\(/);
  for (const [, value] of styles.matchAll(/\n\s*filter:\s*([^;]+);/g)) {
    assert.match(value, /^(?:none|brightness\(.+\))$/, value);
  }
  // RISING THE WORLD's rise owns its scale; the press only lights its sheen.
  assert.match(styles, /:not\(\.rw-gate-button, \.episode-card-select\)/);
});

test("each control sinks once, by its own measure", () => {
  // Menu rows keep their width, so their dividers stay in line; they light
  // and take the ice plate over the film edition's resting fill.
  assert.match(
    rules,
    /html\[data-press-ready\] \.side-panel-links :is\(a, button\.side-panel-link-button\) \{\s*--dw-press-scale: 1;\s*\}/,
  );
  assert.match(
    rules,
    /html\[data-press-ready\]\s+body\s+\.side-panel-links\s+:is\(a, button\.side-panel-link-button\):is\(\[data-press="in"\], \[data-press="touch"\]\) \{\s*background-color: rgb\(126 231 255 \/ 0\.1\);/,
  );
  // Legacy :active transforms would multiply with the press scale.
  assert.match(
    rules,
    /html\[data-press-ready\] :is\(\.episode-pickup-plus, \.cine-btn\)\[data-press\]:active \{\s*transform: none;\s*\}/,
  );
  // The brand and the two return chips sink like icons only where their
  // words are hidden: the sigil alone, the arrow alone.
  const icons = rules.match(/:is\(\s*\.side-panel-trigger,[^)]*\)\s*\{\s*--dw-press-scale: 0\.92;/);
  assert.ok(icons, "icon list");
  assert.doesNotMatch(icons[0], /\.brand|\.manager-back|\.dream-back-link/);
  assert.match(
    rules,
    /@media \(max-width: 560px\) \{\s*html\[data-press-ready\] \.brand \{\s*--dw-press-scale: 0\.92;/,
  );
  assert.match(
    rules,
    /@media \(max-width: 520px\) \{\s*html\[data-press-ready\] \.dream-back-link \{\s*--dw-press-scale: 0\.92;/,
  );
  assert.match(
    rules,
    /@media \(max-width: 359px\) \{\s*html\[data-press-ready\] \.manager-back \{\s*--dw-press-scale: 0\.92;/,
  );
  // The Dante archive sits in the RIKUEI grid and presses like its neighbours.
  const cards = rules.match(/:is\(\s*\.signal,[^{]*\)\s*\{\s*--dw-press-scale: 0\.982;/);
  assert.ok(cards, "large-card list");
  assert.match(cards[0], /\.dante-archive,/);
  // Dream's act tabs are full-bleed cells like the menu rows: they keep their
  // width, and their plate is the dividers' gold, not the ice.
  assert.match(
    rules,
    /html\[data-press-ready\] \.dream-chapter-nav a \{\s*--dw-press-scale: 1;\s*\}/,
  );
  assert.match(
    rules,
    /html\[data-press-ready\] body \.dream-chapter-nav a:is\(\[data-press="in"\], \[data-press="touch"\]\) \{\s*background-color: rgb\(200 164 92 \/ 0\.12\);/,
  );
  const ice = rules.match(/:is\(\s*\.topbar nav a,[^)]*\)/);
  assert.ok(ice, "ice-plate list");
  assert.doesNotMatch(ice[0], /\.dream-chapter-nav/);
  // Only the portraits on white paper shade; the poster thumbnails sit on
  // the dark stage and light like every other control.
  assert.match(
    rules,
    /html\[data-press-ready\] :is\(\.dream-character-grid button, \.dream-dolminence-grid button\) \{\s*--dw-press-light: 0\.93;/,
  );
  assert.doesNotMatch(rules, /\.dream-poster-thumbnails/);
  // A closed Dream CASE moves as a whole record with its gilt frames; its
  // header only lights, and an open record is never scaled.
  assert.match(
    rules,
    /html\[data-press-ready\] \.dream-story-case > summary \{\s*--dw-press-scale: 1;/,
  );
  assert.match(
    rules,
    /\.dream-story-case:not\(\[open\]\):has\(> summary:is\(\[data-press="in"\], \[data-press="touch"\]\)\) \{\s*scale: 0\.982;/,
  );
  // RISING's overlay controls keep the audit's own sink and pressed fill.
  assert.match(
    rules,
    /html\[data-press-ready\] \.site-shell :is\(\.rw-controls button, \.rw-close, \.rw-redive-button\) \{\s*--dw-press-scale: 0\.97;\s*--dw-press-light: 1;/,
  );
});

test("the skip link is the first stop on every route but the opening, and lands on the heading", () => {
  assert.match(root, /import \{ SkipLink \} from "@\/components\/skip-link";/);
  assert.match(root, /<body className="antialiased">\s*<SkipLink \/>\s*<ContentProtection \/>/);
  assert.match(skip, /if \(pathname === "\/"\) return null;/);
  assert.match(skip, />\s*本文へスキップ\s*</);
  assert.match(skip, /document\.querySelectorAll<HTMLElement>\("main h1"\)/);
  assert.match(skip, /target\.dataset\.routeFocus = "true";/);
  assert.match(skip, /target\.focus\(\{ preventScroll: true \}\);/);

  const link = styles.slice(styles.indexOf("\n.dw-skip-link {"));
  const linkLayer = Number(link.match(/^\.dw-skip-link \{[^}]*?z-index: (\d+);/m)?.[1]);
  const handoffLayer = Number(
    read("src/styles-route-transitions.css").match(
      /\[data-opening-handoff-root\] \{[^}]*?z-index: (\d+);/,
    )?.[1],
  );
  assert.equal(linkLayer, 2147483000);
  assert.ok(linkLayer < handoffLayer, `under the opening handoff (${handoffLayer})`);
  assert.match(
    link,
    /\.dw-skip-link \{[^}]*opacity: 0;[^}]*transform: translateY\(calc\(-100% - 28px\)\);/,
  );
  assert.match(
    link,
    /\.dw-skip-link:focus,\s*\.dw-skip-link:focus-visible \{[^}]*opacity: 1;[^}]*transform: none;/,
  );
  // It slides only when motion is welcome, and only on the compositor.
  assert.match(
    link,
    /@media \(prefers-reduced-motion: no-preference\) \{\s*\.dw-skip-link \{\s*transition:\s*transform [^,;]+,\s*opacity [^,;]+;/,
  );
  assert.match(link, /content: "↓" \/ "";/);
});
