import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import postcss from "postcss";
import {
  MOVIE_DURATION_MS,
  MOVIE_FIGURE_ASPECT,
  MOVIE_IDLE_COLLAPSE_MS,
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
    style: {
      props: new Map(),
      setProperty(name, value) {
        this.props.set(name, value);
      },
      removeProperty(name) {
        this.props.delete(name);
      },
    },
    focus() {
      node.focused = true;
      if (node.onFocus) node.onFocus(node);
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
  if (selector === ".rzn-call") return node.getAttribute("class") === "rzn-call";
  if (selector === ".rzn-movie-mini") return node.getAttribute("class") === "rzn-movie-mini";
  if (selector === ".rzn-movie-toggle") return node.getAttribute("class") === "rzn-movie-toggle";
  if (selector === ".rzn-movie-speed-now")
    return node.getAttribute("class") === "rzn-movie-speed-now";
  if (selector === '[role="radio"]') return node.getAttribute("role") === "radio";
  if (selector === ".rzn-movie-seek input") return node.tag === "input";
  throw new Error(`unexpected selector ${selector}`);
}

/** The control's markup as the component renders it, the runway, the window. */
function environment({
  load = "ready",
  travel = 2400,
  pinTop = 62,
  top = 5000,
  viewportWidth = 1000,
  figure = { "--rzn-fig-h": "0.86", "--rzn-fig-w": "0.92", "--rzn-fig-x": "0.5", "--rzn-fig-b": "0.035" },
} = {}) {
  const runway = element("div", { class: "rzn-suitup", "data-rzn-load": load });
  const frame = element("div", { class: "rzn-frame" });
  runway.append(frame);
  runway.offsetHeight = travel + 800;
  frame.offsetHeight = 800;
  frame.offsetWidth = viewportWidth;
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
  // The pill: 再生／一時停止 with the progress ring, and the speed (the toggle).
  const mini = element("button", { class: "rzn-movie-mini", "aria-label": "再生" });
  mini.disabled = true;
  const toggle = element("button", { class: "rzn-movie-toggle", "aria-expanded": "false" });
  toggle.disabled = true;
  const speedNow = element("span", { class: "rzn-movie-speed-now" });
  speedNow.textContent = "1×";
  toggle.append(speedNow);
  control.append(mini, toggle, play, restart, ...radios, seek);
  const windowListeners = new Map();
  const documentListeners = new Map();
  const frames = new Map();
  let frameId = 0;
  const scrolls = [];
  const observers = [];
  const mutations = [];
  const html = { scrollHeight: 20000, clientWidth: viewportWidth };
  const document = {
    hidden: false,
    activeElement: null,
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
    getComputedStyle: () => ({
      top: `${pinTop}px`,
      getPropertyValue: (name) => figure[name] ?? "",
    }),
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
    pointer: (target = runway) =>
      windowListeners.get("pointerdown")?.({ type: "pointerdown", target }),
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
    mini,
    toggle,
    speedNow,
    document,
    html,
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
  dispose();
});

/* ---------------- the markup and the pages ---------------- */
test("the control's markup: a named group, 再生／一時停止 and 最初から, the speed as a radio group, the seek with a name", () => {
  const source = read("src/components/rexonance-saga/rexonance-assembly-movie.tsx");
  assert.match(source, /<div\s+ref=\{ref\}\s+className="rzn-movie"/);
  assert.doesNotMatch(source, /rzn-movie-dock/, "no dock: the control is a fixed layer");
  assert.match(source, /role="group"\s+aria-label="自動変身ムービー"/);
  // The pill: 再生／一時停止 (a named button), and the speed that opens the
  // sheet (aria-expanded, aria-controls the sheet, the speed in its name).
  assert.match(source, /className="rzn-movie-mini" aria-label="再生" disabled/);
  assert.match(source, /className="rzn-movie-toggle"\s+aria-expanded="false"\s+aria-controls=\{sheetId\}/);
  assert.match(source, /aria-label=\{`速度 \$\{ASSEMBLY_MOVIE_DEFAULT_SPEED\}× と操作`\}/);
  assert.match(source, /const sheetId = useId\(\);/);
  assert.match(source, /className="rzn-movie-sheet" id=\{sheetId\}/);
  assert.match(source, /className="rzn-movie-speed-now" aria-hidden="true"/);
  assert.match(source, /className="rzn-movie-chevron" aria-hidden="true"/);
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

/* ---------------- the pill and the sheet's opening ---------------- */
/* The control stays clear of the figure's body (owner, 2026-10-23: 「速度調整
   インターフェースが全身にかぶらない様にスマホでは展開式にして、iPadなどでは
   工夫して」): a pill (再生／一時停止 with a progress ring, and the speed) opens
   the sheet; the sheet closes after a choice, a few seconds idle, a scroll or a
   touch outside, Escape, focus leaving, or the frame unpinning. */
function pillEnvironment(options) {
  const t = environment(options);
  const dispose = mountAssemblyMovie(t.control, t.runway, t.env);
  t.toggle.onFocus = (node) => {
    t.document.activeElement = node;
  };
  const [observer] = t.observers;
  observer.callback([{ isIntersecting: true }]);
  const isOpen = () => t.control.dataset.open === "true";
  return { ...t, dispose, observer, isOpen };
}

test("the pill: the speed button opens and closes the sheet with aria-expanded; the toggle is live as soon as the controller mounts", () => {
  const t = pillEnvironment({ load: "waiting" });
  assert.equal(t.toggle.disabled, false, "the toggle needs only the controller");
  assert.equal(t.mini.disabled, true, "再生 waits for the scene");
  assert.equal(t.toggle.getAttribute("aria-expanded"), "false");
  assert.equal(t.isOpen(), false);
  t.toggle.fire("click");
  assert.equal(t.isOpen(), true);
  assert.equal(t.toggle.getAttribute("aria-expanded"), "true");
  t.toggle.fire("click");
  assert.equal(t.isOpen(), false);
  assert.equal(t.toggle.getAttribute("aria-expanded"), "false");
  t.setLoad("ready");
  assert.equal(t.mini.disabled, false);
  t.dispose();
  assert.equal(t.toggle.getAttribute("aria-expanded"), "false");
  assert.equal(t.control.dataset.open, undefined);
});

test("the pill's 再生／一時停止 plays and pauses like the sheet's, its label follows, and its ring follows the movie", () => {
  const t = pillEnvironment();
  assert.equal(t.mini.getAttribute("aria-label"), MOVIE_PLAY_LABELS.play);
  t.mini.fire("click");
  assert.equal(t.control.dataset.state, "playing");
  assert.equal(t.mini.getAttribute("aria-label"), MOVIE_PLAY_LABELS.pause);
  for (let k = 0; k < 61; k += 1) t.tick();
  const ring = Number(t.control.style.props.get("--rzn-movie-p"));
  assert.ok(Math.abs(ring - (100 * 1000) / MOVIE_DURATION_MS) < 0.5, `ring ${ring}`);
  t.mini.fire("click");
  assert.equal(t.control.dataset.state, "paused");
  assert.equal(t.mini.getAttribute("aria-label"), MOVIE_PLAY_LABELS.play);
  t.dispose();
});

test("the speed shows on the pill: its text and its name follow the choice, and a choice closes the sheet", () => {
  const t = pillEnvironment();
  assert.equal(t.speedNow.textContent, "1×");
  for (const [index, speed] of [0.5, 1, 1.5, 2].entries()) {
    t.toggle.fire("click");
    assert.equal(t.isOpen(), true);
    t.radios[index].fire("click");
    assert.equal(t.isOpen(), false, `a choice (${speed}×) closes the sheet`);
    assert.equal(t.speedNow.textContent, `${speed}×`);
    assert.equal(t.toggle.getAttribute("aria-label"), `速度 ${speed}× と操作`);
  }
  // Arrow keys within the speed group are navigation, not a choice: the sheet stays.
  t.toggle.fire("click");
  t.radios[3].fire("keydown", { key: "ArrowLeft" });
  assert.equal(t.isOpen(), true);
  assert.equal(t.speedNow.textContent, "1.5×");
  t.dispose();
});

test("最初から and 再生 in the sheet close it too, and move the focus back to the toggle", () => {
  const t = pillEnvironment();
  t.toggle.fire("click");
  t.document.activeElement = t.restart;
  t.restart.fire("click");
  assert.equal(t.isOpen(), false);
  assert.equal(t.control.dataset.state, "playing");
  assert.equal(t.toggle.focused, true, "focus leaves the closing sheet for the toggle");
  t.toggle.focused = false;
  t.toggle.fire("click");
  t.document.activeElement = t.play;
  t.play.fire("click");
  assert.equal(t.isOpen(), false);
  assert.equal(t.control.dataset.state, "paused");
  assert.equal(t.toggle.focused, true);
  t.dispose();
});

test("the sheet closes after a few seconds untouched; touching it restarts the wait; a keyboard user's open sheet waits for them", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    assert.equal(MOVIE_IDLE_COLLAPSE_MS, 4000);
    const t = pillEnvironment();
    t.toggle.fire("click");
    mock.timers.tick(MOVIE_IDLE_COLLAPSE_MS - 1);
    assert.equal(t.isOpen(), true);
    mock.timers.tick(1);
    assert.equal(t.isOpen(), false, "closed after the idle wait");
    // Touching the sheet restarts the wait.
    t.toggle.fire("click");
    mock.timers.tick(3000);
    t.control.fire("pointerdown");
    mock.timers.tick(3000);
    assert.equal(t.isOpen(), true);
    mock.timers.tick(1000);
    assert.equal(t.isOpen(), false);
    // So does a change on the seek (an input event bubbling to the control).
    t.toggle.fire("click");
    mock.timers.tick(3500);
    t.control.fire("input");
    mock.timers.tick(3500);
    assert.equal(t.isOpen(), true);
    mock.timers.tick(500);
    assert.equal(t.isOpen(), false);
    // A keyboard user (focus inside, last input a key) is not timed out.
    t.toggle.fire("click");
    t.document.activeElement = t.radios[1];
    t.control.fire("keydown", { key: "ArrowRight" });
    mock.timers.tick(MOVIE_IDLE_COLLAPSE_MS * 3);
    assert.equal(t.isOpen(), true, "waits for the keyboard user");
    // Escape closes it and gives the focus to the toggle.
    t.control.fire("keydown", { key: "Escape" });
    assert.equal(t.isOpen(), false);
    assert.equal(t.toggle.focused, true);
    // The seek being dragged is not idle.
    t.toggle.fire("click");
    t.control.fire("pointerdown");
    t.seek.fire("pointerdown");
    mock.timers.tick(MOVIE_IDLE_COLLAPSE_MS * 2);
    assert.equal(t.isOpen(), true, "not while the seek is held");
    t.seek.fire("pointerup");
    mock.timers.tick(MOVIE_IDLE_COLLAPSE_MS);
    assert.equal(t.isOpen(), false);
    // Disposing leaves no timer behind.
    t.toggle.fire("click");
    t.dispose();
    mock.timers.tick(MOVIE_IDLE_COLLAPSE_MS * 2);
    assert.equal(t.control.dataset.open, undefined);
  } finally {
    mock.timers.reset();
  }
});

test("the sheet closes on the reader's own scroll, wheel, a touch or press outside, focus leaving, and the frame unpinning — not on the movie's own scrolling or a touch inside", () => {
  const t = pillEnvironment();
  const open = () => {
    if (!t.isOpen()) t.toggle.fire("click");
    assert.equal(t.isOpen(), true);
  };
  // The reader scrolls the page themselves.
  open();
  t.user.scroll(1234);
  assert.equal(t.isOpen(), false, "a scroll of the reader's own");
  // The movie's own scrolling (and the seek's) does not close it.
  open();
  t.seek.value = "80";
  t.seek.fire("input");
  t.tick();
  assert.equal(t.isOpen(), true, "the seek's scroll is the control's own");
  t.play.fire("click");
  open();
  for (let k = 0; k < 5; k += 1) t.tick();
  assert.equal(t.isOpen(), true, "the movie's frames are not the reader's scroll");
  t.user.wheel();
  assert.equal(t.isOpen(), false, "the wheel");
  assert.equal(t.control.dataset.state, "paused");
  open();
  t.user.touch(t.play);
  assert.equal(t.isOpen(), true, "a touch inside the control");
  t.user.touch(t.runway);
  assert.equal(t.isOpen(), false, "a touch outside");
  open();
  t.user.pointer(t.seek);
  assert.equal(t.isOpen(), true, "a press inside the control");
  t.user.pointer(t.runway);
  assert.equal(t.isOpen(), false, "a press outside");
  open();
  t.control.fire("focusout", { relatedTarget: t.play });
  assert.equal(t.isOpen(), true, "focus moving within the control");
  t.control.fire("focusout", { relatedTarget: t.runway });
  assert.equal(t.isOpen(), false, "focus leaving");
  open();
  t.observer.callback([{ isIntersecting: false }]);
  assert.equal(t.isOpen(), false, "the frame unpinned");
  t.dispose();
});

test("the controller measures the room beside the figure from the frame's --rzn-fig-* box, for the sheet's width and the rail's place", () => {
  const figure = { "--rzn-fig-h": "0.86", "--rzn-fig-w": "0.92", "--rzn-fig-x": "0.5", "--rzn-fig-b": "0.035" };
  const t = pillEnvironment({ figure, viewportWidth: 1000 });
  const prop = (name) => t.control.style.props.get(name);
  // Desktop tier: the height is fig-h of the frame's (800), the width follows
  // the picture's aspect, centred; the sides are what is left.
  const figH = Math.min(800 * 0.86, 1000 * 0.92 * MOVIE_FIGURE_ASPECT);
  const figW = figH / MOVIE_FIGURE_ASPECT;
  const left = 500 - figW / 2;
  assert.equal(prop("--mc-left-room"), `${Math.round(left)}px`);
  assert.equal(prop("--mc-right-room"), `${Math.round(1000 - left - figW)}px`);
  assert.equal(prop("--mc-fig-top"), `${Math.round(62 + 800 * (1 - 0.035) - figH)}px`);
  // The stacked tier (phones, portrait tablets) on resize: a shorter figure
  // that stands higher, with wider columns.
  Object.assign(figure, { "--rzn-fig-h": "0.58", "--rzn-fig-b": "0.17" });
  t.windowListeners.get("resize")({ type: "resize" });
  const stacked = 800 * 0.58;
  const stackedLeft = 500 - stacked / MOVIE_FIGURE_ASPECT / 2;
  assert.equal(prop("--mc-left-room"), `${Math.round(stackedLeft)}px`);
  assert.equal(prop("--mc-fig-top"), `${Math.round(62 + 800 * 0.83 - stacked)}px`);
  assert.ok(Number.parseFloat(prop("--mc-left-room")) > left, "the stacked figure leaves more room");
  // The HUD's call: the rail of the stacked tiers starts below its foot.
  assert.equal(prop("--mc-call-bottom"), undefined, "no call, no measure");
  const call = element("div", { class: "rzn-call" });
  call.getBoundingClientRect = () => ({ bottom: 233.4 });
  t.runway.append(call);
  t.windowListeners.get("resize")({ type: "resize" });
  assert.equal(prop("--mc-call-bottom"), "233px");
  // A box that cannot be read leaves the last room (and never throws).
  figure["--rzn-fig-h"] = "";
  t.windowListeners.get("resize")({ type: "resize" });
  assert.equal(prop("--mc-left-room"), `${Math.round(stackedLeft)}px`);
  t.dispose();
});

/* ---------------- the placement rules ---------------- */
function rulesOf(css) {
  const root = postcss.parse(css);
  const out = [];
  root.walkRules((rule) => {
    const at = rule.parent?.type === "atrule" ? `@${rule.parent.name} ${rule.parent.params}` : "";
    const decls = {};
    rule.walkDecls((d) => {
      decls[d.prop] = d.value.replace(/\s+/g, " ");
    });
    out.push({ at, selectors: rule.selectors.map((s) => s.replace(/\s+/g, " ")), decls });
  });
  return out;
}
const hasSel = (rule, part) => rule.selectors.some((s) => s.endsWith(part));
const ruleFor = (rules, part, at = "") => {
  const found = rules.filter((rule) => rule.at === at && rule.selectors.some((s) => s.endsWith(part)));
  assert.ok(found.length > 0, `a rule for ${part} ${at}`);
  return Object.assign({}, ...found.map((rule) => rule.decls));
};

test("placement rules: a click-through fixed layer; the sheet docked beside the figure; the pill only where the sheet would stand over it", () => {
  const css = read("src/styles-assembly-movie.css");
  const rules = rulesOf(css);
  const layer = ruleFor(rules, ".rzn-movie");
  assert.equal(layer.position, "fixed");
  assert.equal(layer.inset, "0");
  assert.equal(layer["pointer-events"], "none");
  assert.equal(layer.visibility, "hidden");
  assert.equal(ruleFor(rules, ".rzn-movie > *")["pointer-events"], "auto");
  // Shown while the frame is pinned or the control holds focus.
  assert.ok(rules.some((rule) => rule.selectors.some((s) => s.endsWith(".rzn-movie[data-shown]")) && rule.selectors.some((s) => s.endsWith(".rzn-movie:focus-within")) && rule.decls.visibility === "visible"));
  // Docked by default: the column left of the figure, the foot of the screen.
  const docked = ruleFor(rules, ".rzn-movie .rzn-movie-sheet");
  assert.equal(docked.position, "absolute");
  assert.match(docked.left, /var\(--mc-gutter\)/);
  assert.match(docked.bottom, /env\(safe-area-inset-bottom|var\(--mc-safe-bottom\)/);
  assert.match(docked.width, /clamp\(300px, calc\(var\(--mc-left-room, 33vw\) - 2 \* var\(--mc-gutter\) - 8px\), 560px\)/);
  assert.equal(ruleFor(rules, ".rzn-movie .rzn-movie-pill").position, "absolute");
  const pillBase = rules.find((rule) => rule.at === "" && hasSel(rule, ".rzn-movie .rzn-movie-pill") && rule.decls.display === "none");
  assert.ok(pillBase, "no pill on the docked layout");
  // The pill layouts: phones, tablets, short windows, tall narrow windows.
  const compact = "@media (max-width: 1099.98px), (max-height: 820px), (max-aspect-ratio: 13/10)";
  assert.equal(ruleFor(rules, ".rzn-movie .rzn-movie-pill", compact).display, "flex");
  const sheetCompact = ruleFor(rules, ".rzn-movie .rzn-movie-sheet", compact);
  assert.equal(sheetCompact.display, "none", "the sheet is closed until the pill opens it");
  assert.match(sheetCompact.bottom, /var\(--mc-pill\)/, "above the pill");
  assert.match(sheetCompact.width, /var\(--mc-left-room, 33vw\)/);
  assert.equal(ruleFor(rules, ".rzn-movie[data-open] .rzn-movie-sheet", compact).display, "grid");
  // Stacked layouts: the pill bottom-right; the sheet a rail right of the figure.
  const stacked = "@media (max-width: 760px), (max-width: 1099.98px) and (orientation: portrait)";
  const pillRight = ruleFor(rules, ".rzn-movie .rzn-movie-pill", stacked);
  assert.match(pillRight.right, /var\(--mc-gutter\)/);
  assert.equal(pillRight.left, "auto");
  const rail = ruleFor(rules, ".rzn-movie .rzn-movie-sheet", stacked);
  assert.match(rail.top, /max\(\s*var\(--mc-fig-top, 30svh\),\s*calc\(var\(--mc-call-bottom, 0px\) \+ 10px\)/);
  assert.match(rail.width, /var\(--mc-right-room, 172px\)/);
  assert.equal(rail.left, "auto");
  assert.equal(rail.bottom, "auto");
  // Phones: the sheet over the top of the frame, above the figure's head.
  const phone = ruleFor(rules, ".rzn-movie .rzn-movie-sheet", "@media (max-width: 639.98px)");
  assert.match(phone.top, /var\(--dxs-nav, 62px\) \+ 8px/);
  assert.equal(phone.width, "auto");
  // Phones on their side: the pill left, the sheet above it.
  const landscape = "@media (orientation: landscape) and (max-height: 540px) and (max-width: 1099.98px)";
  assert.equal(ruleFor(rules, ".rzn-movie .rzn-movie-pill", landscape).right, "auto");
  const sideSheet = ruleFor(rules, ".rzn-movie .rzn-movie-sheet", landscape);
  assert.equal(sideSheet.top, "auto");
  assert.match(sideSheet.bottom, /var\(--mc-pill\)/);
  // The pill's size is a touch target.
  assert.match(css, /--mc-pill: 44px;/);
  // The layer's order in the file: layouts after the base, so each tier wins.
  const at = (needle) => css.indexOf(needle);
  assert.ok(at(compact) < at(stacked) && at(stacked) < at("@media (max-width: 639.98px)") && at("@media (max-width: 639.98px)") < at(landscape));
});

test("placement rules: hidden in the still tiers and with the menu or a dialog open; a visible focus ring; every page's sheet carries the pill's palette", () => {
  const css = read("src/styles-assembly-movie.css");
  assert.match(css, /\.rzn-movie\[data-load="static"\],\s*html\[data-family="special"\]\[data-world-effects="economy"\][^{]*\.rzn-movie \{\s*display: none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-family="special"\][^{]*\.rzn-movie \{\s*display: none;/);
  assert.match(css, /@media \(forced-colors: active\) \{\s*html\[data-family="special"\][^{]*\.rzn-movie \{\s*display: none;/);
  assert.match(css, /html\[data-side-menu-open\][^{]*\.rzn-movie,\s*html\[data-dialog-open\][^{]*\.rzn-movie \{\s*visibility: hidden;/);
  assert.match(css, /\.rzn-movie :is\(button, input\):focus-visible \{\s*outline: 2px solid var\(--mc-lit\);/);
  assert.match(css, /\.rzn-movie\[data-site="far-from"\] \{[^}]*--mc-accent: #7fe6ff;/);
  assert.match(css, /\.rzn-movie\[data-site="rexonance"\] \{[^}]*--mc-accent: rgb\(121 232 255\);/);
  // The ring and the glyphs follow the movie's state.
  assert.match(css, /conic-gradient\(\s*var\(--mc-accent\) calc\(var\(--rzn-movie-p, 0\) \* 1%\)/);
  assert.match(css, /\.rzn-movie\[data-state="playing"\]\s*\.rzn-movie-mini::after/);
  assert.match(css, /\.rzn-movie-toggle\[aria-expanded="true"\]\s*\.rzn-movie-chevron/);
  // The page sheets draw the sheet only: no fixed positioning left in them,
  // and nothing of the old phone dock.
  for (const sheet of ["src/styles-rexonance-editorial.css", "src/styles-far-from-suitup.css"]) {
    const source = read(sheet);
    const from = source.indexOf("The auto transformation movie's control");
    const movie = source.slice(from);
    assert.match(movie, /\.rzn-movie-sheet \{/, sheet);
    assert.doesNotMatch(movie, /position: (fixed|static)/, sheet);
    assert.doesNotMatch(movie, /rzn-movie-dock/, sheet);
    assert.doesNotMatch(movie, /translate\(-50%/, sheet);
    assert.doesNotMatch(movie, /\.rzn-movie \{[^}]*width:/, sheet);
  }
  // Both routes link the placement sheet after the sheet that draws the control.
  const rexonance = read("src/routes/rexonance-saga.tsx");
  assert.match(rexonance, /import assemblyMovieCssUrl from "@\/styles-assembly-movie\.css\?url";/);
  assert.ok(rexonance.indexOf("href: rexonanceEditorialCssUrl") < rexonance.indexOf("href: assemblyMovieCssUrl"));
  const farFrom = read("src/routes/far-from-saga.tsx");
  assert.match(farFrom, /import assemblyMovieCssUrl from "@\/styles-assembly-movie\.css\?url";/);
  assert.ok(farFrom.indexOf("href: farFromSuitupCssUrl") < farFrom.indexOf("href: assemblyMovieCssUrl"));
});
