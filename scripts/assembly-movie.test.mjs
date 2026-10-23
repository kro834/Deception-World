import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MOVIE_DURATION_MS,
  MOVIE_PLAY_LABELS,
  MOVIE_SCROLL_KEYS,
  MOVIE_SCROLL_TOLERANCE,
  MOVIE_SEEK_STEPS,
  MOVIE_SHOW_AT,
  mountAssemblyMovie,
} from "../src/lib/assembly-movie.ts";

/* The auto transformation movie (owner, 2026-10-23: 「自動変身ムービーも速度
   調整機能付きでつけて。レクソナンスにもこの機能は実装。」): the control
   (rexonance-assembly-movie.tsx) on both runways, its controller
   (assembly-movie.ts) driving the page's scroll. These pin: the speeds, the
   pause on the reader's own input (wheel, touch, keys, a scroll of their
   own), the end on the final form, the still tiers, the markup's ARIA and
   plain Japanese, both pages' mounts, the lazy import, and the sheets. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const FRAME = 1000 / 60;

/* ---------------- a small DOM ---------------- */
function element(tag, attrs = {}) {
  const attributes = new Map();
  const listeners = new Map();
  const node = {
    tag,
    children: [],
    parent: null,
    textContent: "",
    disabled: false,
    tabIndex: 0,
    value: "0",
    focused: false,
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
        deleteProperty: (_, key) => {
          attributes.delete(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`);
          return true;
        },
        has: (_, key) =>
          attributes.has(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
      },
    ),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    hasAttribute: (name) => attributes.has(name),
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type) => listeners.delete(type),
    fire: (type, extra = {}) =>
      listeners.get(type)?.({
        type,
        target: node,
        currentTarget: node,
        preventDefault() {},
        ...extra,
      }),
    focus() {
      node.focused = true;
    },
    append(...nodes) {
      for (const child of nodes) {
        child.parent = node;
        node.children.push(child);
      }
      return node;
    },
    contains(other) {
      for (let at = other; at; at = at.parent) if (at === node) return true;
      return false;
    },
    all() {
      return node.children.flatMap((child) => [child, ...child.all()]);
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      return node.all().filter((child) => matches(child, selector));
    },
    listeners,
  };
  for (const [name, value] of Object.entries(attrs)) attributes.set(name, String(value));
  return node;
}
function matches(node, selector) {
  if (selector === ".rzn-frame") return node.getAttribute("class") === "rzn-frame";
  if (selector === ".rzn-movie-play") return node.getAttribute("class") === "rzn-movie-play";
  if (selector === ".rzn-movie-restart") return node.getAttribute("class") === "rzn-movie-restart";
  if (selector === '[role="radio"]') return node.getAttribute("role") === "radio";
  if (selector === ".rzn-movie-seek input") return node.tag === "input";
  throw new Error(`unexpected selector ${selector}`);
}

/** The control's markup as the component renders it, the runway, the window. */
function environment({ load = "ready", travel = 2400, pinTop = 62, top = 5000 } = {}) {
  const runway = element("div", { class: "rzn-suitup", "data-rzn-load": load });
  const frame = element("div", { class: "rzn-frame" });
  runway.append(frame);
  runway.offsetHeight = travel + 800;
  frame.offsetHeight = 800;
  let scrollY = 0;
  // The runway's top in the viewport follows the page's scroll.
  runway.getBoundingClientRect = () => ({ top: top - scrollY });
  const control = element("div", { class: "rzn-movie", "data-state": "idle" });
  const play = element("button", { class: "rzn-movie-play" });
  play.textContent = "再生";
  const restart = element("button", { class: "rzn-movie-restart" });
  const radios = [0.5, 1, 1.5, 2].map((speed) =>
    element("button", {
      role: "radio",
      "aria-checked": speed === 1 ? "true" : "false",
      "data-speed": speed,
    }),
  );
  const seek = element("input", { type: "range" });
  control.append(play, restart, ...radios, seek);
  const windowListeners = new Map();
  const documentListeners = new Map();
  const frames = new Map();
  let frameId = 0;
  const scrolls = [];
  const observers = [];
  const mutations = [];
  const html = { scrollHeight: 20000 };
  const document = {
    hidden: false,
    documentElement: html,
    addEventListener: (type, callback) => documentListeners.set(type, callback),
    removeEventListener: (type) => documentListeners.delete(type),
  };
  const env = {
    document,
    innerHeight: 900,
    get scrollY() {
      return scrollY;
    },
    scrollTo: ({ top: y, behavior }) => {
      assert.equal(behavior, "instant", "the movie's scroll is never smoothed by the page");
      scrollY = Math.max(0, Math.min(y, html.scrollHeight - 900));
      scrolls.push(y);
      // The browser's scroll event for it arrives with the next frame.
      pendingScroll = true;
    },
    getComputedStyle: () => ({ top: `${pinTop}px` }),
    requestAnimationFrame: (callback) => (frames.set(++frameId, callback), frameId),
    cancelAnimationFrame: (id) => frames.delete(id),
    addEventListener: (type, callback) => windowListeners.set(type, callback),
    removeEventListener: (type) => windowListeners.delete(type),
    IntersectionObserver: class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        observers.push(this);
      }
      observe(node) {
        this.target = node;
      }
      disconnect() {
        this.target = null;
      }
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        mutations.push(this);
      }
      observe(node, options) {
        this.target = node;
        this.options = options;
      }
      disconnect() {
        this.target = null;
      }
    },
  };
  let pendingScroll = false;
  let stamp = 1000;
  /** One display frame: the page's scroll event, then the animation frame. */
  const tick = (ms = FRAME) => {
    stamp += ms;
    if (pendingScroll) {
      pendingScroll = false;
      windowListeners.get("scroll")?.({ type: "scroll" });
    }
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(stamp);
    }
  };
  const progress = () => (pinTop - runway.getBoundingClientRect().top) / travel;
  const user = {
    wheel: () => windowListeners.get("wheel")?.({ type: "wheel", target: runway }),
    touch: (target = runway) => windowListeners.get("touchstart")?.({ type: "touchstart", target }),
    key: (key, target = runway) =>
      windowListeners.get("keydown")?.({ type: "keydown", key, target }),
    // The reader scrolls the page themselves (a scrollbar drag): the scroll
    // lands somewhere the movie did not put it.
    scroll: (y) => {
      // One scroll event for the position now (a browser coalesces).
      pendingScroll = false;
      scrollY = y;
      windowListeners.get("scroll")?.({ type: "scroll" });
    },
  };
  return {
    env,
    runway,
    frame,
    control,
    play,
    restart,
    radios,
    seek,
    frames,
    scrolls,
    observers,
    mutations,
    tick,
    progress,
    user,
    travel,
    top,
    pinTop,
    scrollY: () => scrollY,
    windowListeners,
    documentListeners,
    setLoad: (next) => {
      runway.dataset.rznLoad = next;
      for (const observer of mutations) observer.callback([]);
    },
  };
}

/* ---------------- the controller ---------------- */
test("再生 plays the suit-up from the runway's start to its end over the movie's length, scrolling the page under the frame, and ends on the final form", () => {
  const t = environment();
  const dispose = mountAssemblyMovie(t.control, t.runway, t.env);
  assert.equal(t.control.dataset.state, "idle");
  assert.equal(t.play.disabled, false, "ready: the control is live");
  assert.equal(t.control.dataset.load, "ready");
  t.play.fire("click");
  assert.equal(t.control.dataset.state, "playing");
  assert.equal(t.play.textContent, MOVIE_PLAY_LABELS.pause);
  // The first scroll puts the page at the runway's start (the frame's pin).
  assert.equal(t.scrolls[0], t.top - t.pinTop);
  // Sixty frames: a second of the movie, a 24th of the runway.
  for (let k = 0; k < 61; k += 1) t.tick();
  const after1s = t.progress();
  assert.ok(Math.abs(after1s - 1000 / MOVIE_DURATION_MS) < 0.002, `${after1s}`);
  // The frame stays pinned: the page scrolls by the runway's travel only.
  assert.ok(t.scrollY() >= t.top - t.pinTop && t.scrollY() <= t.top - t.pinTop + t.travel);
  // The seek follows.
  assert.equal(t.seek.value, String(Math.round(after1s * MOVIE_SEEK_STEPS)));
  assert.match(t.seek.getAttribute("aria-valuetext"), /^\d+%$/);
  // To the end: the movie stops on the finished suit, at the runway's end.
  for (let k = 0; k < 60 * 24 + 5 && t.control.dataset.state === "playing"; k += 1) t.tick();
  assert.equal(t.control.dataset.state, "ended");
  assert.equal(t.play.textContent, MOVIE_PLAY_LABELS.play);
  assert.ok(Math.abs(t.progress() - 1) < 1e-9, `ends on the final form (${t.progress()})`);
  assert.equal(t.frames.size, 0, "nothing runs after the end");
  // 再生 at the end plays again from the start.
  t.play.fire("click");
  assert.equal(t.control.dataset.state, "playing");
  t.tick();
  assert.ok(t.progress() < 0.01);
  dispose();
  assert.equal(t.frames.size, 0);
  assert.equal(t.windowListeners.size, 0, "every listener released");
  assert.equal(t.documentListeners.size, 0);
  assert.equal(t.control.dataset.state, "idle");
  assert.equal(t.control.dataset.shown, undefined);
});

test("the speeds: 0.5×, 1×, 1.5× and 2× scale the clock, a radio group with roving focus and arrow keys", () => {
  const t = environment();
  const dispose = mountAssemblyMovie(t.control, t.runway, t.env);
  assert.deepEqual(
    t.radios.map((radio) => radio.getAttribute("aria-checked")),
    ["false", "true", "false", "false"],
  );
  assert.deepEqual(
    t.radios.map((radio) => radio.tabIndex),
    [-1, 0, -1, -1],
    "only the chosen speed is in the tab order",
  );
  const measure = (speed) => {
    const index = [0.5, 1, 1.5, 2].indexOf(speed);
    t.radios[index].fire("click");
    assert.equal(t.radios[index].getAttribute("aria-checked"), "true");
    t.restart.fire("click");
    for (let k = 0; k < 61; k += 1) t.tick();
    const q = t.progress();
    t.play.fire("click"); // pause
    return q;
  };
  const base = 1000 / MOVIE_DURATION_MS;
  for (const speed of [0.5, 1, 1.5, 2]) {
    const q = measure(speed);
    assert.ok(Math.abs(q - base * speed) < 0.002, `${speed}×: ${q} vs ${base * speed}`);
  }
  // Arrow keys move the choice and the focus; Home and End reach the ends.
  t.radios[3].fire("keydown", { key: "ArrowRight" });
  assert.equal(t.radios[0].getAttribute("aria-checked"), "true", "wraps");
  assert.ok(t.radios[0].focused);
  t.radios[0].fire("keydown", { key: "ArrowLeft" });
  assert.equal(t.radios[3].getAttribute("aria-checked"), "true");
  t.radios[3].fire("keydown", { key: "Home" });
  assert.equal(t.radios[0].getAttribute("aria-checked"), "true");
  t.radios[0].fire("keydown", { key: "End" });
  assert.equal(t.radios[3].getAttribute("aria-checked"), "true");
  assert.deepEqual(
    t.radios.map((radio) => radio.tabIndex),
    [-1, -1, -1, 0],
  );
  // A speed changed mid-movie takes effect at once.
  t.radios[1].fire("click");
  t.restart.fire("click");
  for (let k = 0; k < 31; k += 1) t.tick();
  t.radios[3].fire("click");
  for (let k = 0; k < 30; k += 1) t.tick();
  assert.ok(Math.abs(t.progress() - base * (0.5 + 1)) < 0.002, `${t.progress()}`);
  dispose();
});

test("the reader's own input pauses the movie and hands the scroll back: wheel, touch, scroll keys, a scroll of their own", () => {
  for (const [name, act] of [
    ["wheel", (t) => t.user.wheel()],
    ["touch", (t) => t.user.touch()],
    ["ArrowDown", (t) => t.user.key("ArrowDown")],
    ["PageDown", (t) => t.user.key("PageDown")],
    ["Space", (t) => t.user.key(" ")],
    ["End", (t) => t.user.key("End")],
    ["scrollbar", (t) => (t.user.scroll(t.scrollY() + 300), t.user.scroll(t.scrollY() + 300))],
  ]) {
    const t = environment();
    const dispose = mountAssemblyMovie(t.control, t.runway, t.env);
    t.play.fire("click");
    for (let k = 0; k < 20; k += 1) t.tick();
    const y = t.scrollY();
    act(t);
    assert.equal(t.control.dataset.state, "paused", name);
    assert.equal(t.play.textContent, MOVIE_PLAY_LABELS.play, name);
    const scrolled = t.scrolls.length;
    for (let k = 0; k < 10; k += 1) t.tick();
    assert.equal(t.scrolls.length, scrolled, `${name}: the movie scrolls no more`);
    if (name !== "scrollbar") assert.equal(t.scrollY(), y, `${name}: the page stays where it was`);
    // 再生 continues from where the page stands now.
    t.play.fire("click");
    assert.equal(t.control.dataset.state, "playing");
    assert.ok(Math.abs(t.scrolls.at(-1) - t.scrollY()) <= MOVIE_SCROLL_TOLERANCE, name);
    dispose();
  }
  for (const key of ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "])
    assert.ok(MOVIE_SCROLL_KEYS.has(key), key);
});

test("input on the control itself is not a scroll: keys and touches inside it, and its own scrolls, keep the movie playing", () => {
  const t = environment();
  const dispose = mountAssemblyMovie(t.control, t.runway, t.env);
  t.play.fire("click");
  for (let k = 0; k < 20; k += 1) t.tick();
  t.user.key(" ", t.play);
  t.user.key("ArrowRight", t.radios[1]);
  t.user.touch(t.seek);
  assert.equal(t.control.dataset.state, "playing");
  // The movie's own scroll events (each frame's) are not the reader's, and
  // one stray scroll (a smooth scroll ending, a layout settling) is not either.
  for (let k = 0; k < 30; k += 1) t.tick();
  t.user.scroll(t.scrollY() + 40);
  t.tick();
  t.tick();
  assert.equal(t.control.dataset.state, "playing");
  // A seek mid-movie jumps the page and plays on from there.
  t.seek.value = String(MOVIE_SEEK_STEPS / 2);
  t.seek.fire("input");
  t.tick();
  assert.equal(t.control.dataset.state, "playing");
  assert.ok(Math.abs(t.progress() - 0.5) < 0.01, `${t.progress()}`);
  assert.equal(t.seek.getAttribute("aria-valuetext"), "50%");
  // 最初から: from the runway's start, playing.
  t.restart.fire("click");
  t.tick();
  assert.ok(t.progress() < 0.01);
  assert.equal(t.control.dataset.state, "playing");
  // A hidden page pauses.
  t.env.document.hidden = true;
  t.documentListeners.get("visibilitychange")();
  assert.equal(t.control.dataset.state, "paused");
  dispose();
});

test("the control shows while the frame is pinned, is disabled until the scene is ready, and the still tiers hide it", () => {
  const t = environment({ load: "waiting" });
  const dispose = mountAssemblyMovie(t.control, t.runway, t.env);
  assert.equal(t.play.disabled, true);
  assert.equal(t.restart.disabled, true);
  assert.equal(t.seek.disabled, true);
  assert.equal(t.control.dataset.load, "waiting");
  t.play.fire("click");
  assert.equal(t.control.dataset.state, "idle", "nothing plays before the scene is ready");
  assert.equal(t.scrolls.length, 0);
  // The frame comes into view: shown (and the seek reads the scroll).
  const [observer] = t.observers;
  assert.equal(observer.target, t.frame);
  assert.deepEqual(observer.options, { threshold: [MOVIE_SHOW_AT] });
  observer.callback([{ isIntersecting: true }]);
  assert.equal(t.control.dataset.shown, "true");
  observer.callback([{ isIntersecting: false }]);
  assert.equal(t.control.dataset.shown, undefined);
  observer.callback([{ isIntersecting: true }]);
  // The frame unpinned mid-movie: the movie's turn is over (the control
  // reads idle; on phones it returns to the page).
  t.setLoad("ready");
  t.play.fire("click");
  assert.equal(t.control.dataset.state, "playing");
  observer.callback([{ isIntersecting: false }]);
  assert.equal(t.control.dataset.state, "idle");
  assert.equal(t.play.textContent, MOVIE_PLAY_LABELS.play);
  assert.equal(t.frames.size, 0);
  observer.callback([{ isIntersecting: true }]);
  t.setLoad("waiting");
  // Ready: the control is live.
  t.setLoad("ready");
  assert.equal(t.play.disabled, false);
  t.play.fire("click");
  assert.equal(t.control.dataset.state, "playing");
  // Reduced motion (or economy, forced colours) takes the scene away mid-movie:
  // the control pauses and reads static — the sheets hide it.
  t.setLoad("static");
  assert.equal(t.control.dataset.state, "paused");
  assert.equal(t.control.dataset.load, "static");
  assert.equal(t.play.disabled, true);
  for (const sheet of ["src/styles-rexonance-editorial.css", "src/styles-far-from-suitup.css"]) {
    const css = read(sheet);
    assert.match(css, /\.rzn-movie\[data-load="static"\]/, sheet);
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-family="special"\] body \.rxs-page[^{]*\.rzn-movie \{\s*display: none;/,
      sheet,
    );
    assert.match(
      css,
      /@media \(forced-colors: active\) \{\s*html\[data-family="special"\] body \.rxs-page[^{]*\.rzn-movie \{\s*display: none;/,
      sheet,
    );
    assert.match(
      css,
      /\[data-world-effects="economy"\][^{]*\.rzn-movie \{\s*display: none;/,
      sheet,
    );
    assert.match(
      css,
      /\.rzn-movie\[data-shown\],[\s\S]*?\.rzn-movie:focus-within \{\s*visibility: visible;/,
      sheet,
    );
    assert.match(
      css,
      /\.rzn-movie :is\(button, input\):focus-visible \{\s*outline: 2px solid/,
      sheet,
    );
    assert.match(css, /\.rzn-movie \{[^}]*position: fixed;/, sheet);
    // Phones: in the page while idle, at the viewport's foot only while a
    // movie is on and the frame is pinned (the HUD's parts and read-out
    // stand at the frame's foot there).
    assert.match(
      css,
      /@media \(max-width: 639\.98px\) \{\s*html\[data-family="special"\] body \.rxs-page[^{]*\.rzn-movie \{\s*position: static;/,
      sheet,
    );
    assert.match(
      css,
      /\.rzn-movie\[data-shown\]:is\(\[data-state="playing"\], \[data-state="paused"\], \[data-state="ended"\]\) \{\s*position: fixed;/,
      sheet,
    );
  }
  dispose();
});

/* ---------------- the markup and the pages ---------------- */
test("the control's markup: a named group, 再生／一時停止 and 最初から, the speed as a radio group, the seek with a name", () => {
  const source = read("src/components/rexonance-saga/rexonance-assembly-movie.tsx");
  assert.match(
    source,
    /<div className="rzn-movie-dock">\s*<div\s+ref=\{ref\}\s+className="rzn-movie"/,
  );
  assert.match(source, /role="group"\s+aria-label="自動変身ムービー"/);
  assert.match(source, /className="rzn-movie-play" disabled>\s*再生\s*</);
  assert.match(source, /className="rzn-movie-restart" disabled>\s*最初から\s*</);
  assert.match(source, /role="radiogroup" aria-label="速度"/);
  assert.match(source, /role="radio"/);
  assert.match(source, /aria-checked=\{speed === ASSEMBLY_MOVIE_DEFAULT_SPEED\}/);
  assert.match(source, /tabIndex=\{speed === ASSEMBLY_MOVIE_DEFAULT_SPEED \? 0 : -1\}/);
  assert.match(source, /aria-label=\{`\$\{speed\}倍速`\}/);
  assert.match(source, /ASSEMBLY_MOVIE_SPEEDS = Object\.freeze\(\[0\.5, 1, 1\.5, 2\] as const\)/);
  assert.match(source, /<span className="rzn-movie-sr">位置<\/span>/);
  assert.match(source, /type="range"[\s\S]*?aria-valuetext="0%"/);
  assert.equal(MOVIE_PLAY_LABELS.play, "再生");
  assert.equal(MOVIE_PLAY_LABELS.pause, "一時停止");
  // No kanji form names anywhere in the control (the FAR FROM page names
  // forms in katakana only); the kicker is decorative.
  assert.doesNotMatch(source, /標準|最大|超|形態名/);
  assert.match(source, /className="rzn-movie-kicker" aria-hidden="true"/);
  // Lazy: the controller's chunk is imported once the page is idle.
  assert.match(source, /import\("@\/lib\/assembly-movie"\)/);
  assert.match(source, /requestIdleCallback\(start, \{ timeout: 2500 \}\)/);
  assert.doesNotMatch(
    source,
    /^import .*assembly-movie"/m,
    "never a static import of the controller",
  );
});

test("both runways carry the control, between the guide and the hidden runway", () => {
  const rexonance = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(rexonance, /import \{ AssemblyMovie \} from "\.\/rexonance-assembly-movie";/);
  assert.match(
    rexonance,
    /<RexonanceAssemblyGuide runwayRef=\{runwayRef\} calls=\{REXONANCE_ENTRY_CALLS\} \/>[\s\S]*?<AssemblyMovie runwayRef=\{runwayRef\} site="rexonance" \/>\s*<div\s+ref=\{runwayRef\}\s+className="rzn-suitup"\s+aria-hidden="true"/,
  );
  const farFrom = read("src/components/far-from-saga/far-from-suitup.tsx");
  assert.match(
    farFrom,
    /import \{ AssemblyMovie \} from "@\/components\/rexonance-saga\/rexonance-assembly-movie";/,
  );
  assert.match(
    farFrom,
    /<FarFromAssemblyGuide runwayRef=\{runwayRef\} \/>[\s\S]*?<AssemblyMovie runwayRef=\{runwayRef\} site="far-from" \/>\s*<div\s+ref=\{runwayRef\}\s+className="ffs-runway rzn-suitup"\s+aria-hidden="true"/,
  );
  // The movie's length and the controller's scroll contract.
  assert.equal(MOVIE_DURATION_MS, 24000);
  const controller = read("src/lib/assembly-movie.ts");
  assert.match(controller, /behavior: "instant"/);
  assert.match(
    controller,
    /environment\.addEventListener\("wheel", onWheel, \{ passive: true \}\)/,
  );
  assert.match(
    controller,
    /environment\.addEventListener\("touchstart", onTouch, \{ passive: true \}\)/,
  );
  assert.match(
    controller,
    /environment\.addEventListener\("scroll", onScroll, \{ passive: true \}\)/,
  );
});
