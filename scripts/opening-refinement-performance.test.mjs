import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const title = read("src/components/cinematic/title-sequence.tsx");
const css = read("src/styles-opening-refinement.css");

// Exercise the actual entry handlers, not a second implementation of the
// phase machine. The optional committed effects and clock also cover delayed
// starts racing the first-frame entry; DOM/shaders remain browser QA work.
function entryRuntime({
  runEffects = false,
  profileDevice = {},
  prepaintProfile = false,
  withVideo = false,
  withLogo = false,
  diveImport,
} = {}) {
  const state = [];
  const refs = [];
  const callbacks = [];
  const effects = [];
  let pendingEffects = [];
  let stateIndex = 0;
  let refIndex = 0;
  let callbackIndex = 0;
  let effectIndex = 0;
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const stored = new Map();
  const navigations = [];
  const handoffs = [];
  const chunkRequests = [];
  class Element {
    closest() { return null; }
  }
  const events = new EventTarget();
  const document = new EventTarget();
  Object.assign(document, {
    hidden: false,
    visibilityState: "visible",
    activeElement: null,
    documentElement: {
      dataset: {},
      setAttribute(name, value) {
        if (name.startsWith("data-")) {
          const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          this.dataset[key] = value;
        }
      },
    },
  });
  const runtime = {
    location: { pathname: "/", search: "" },
    sessionStorage: {
      setItem: (key, value) => stored.set(key, value),
      getItem: (key) => stored.get(key) ?? null,
      removeItem: (key) => stored.delete(key),
    },
    matchMedia: () => ({ matches: false }),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    setTimeout(callback, delay = 0) {
      const id = ++timerId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  runtime.requestAnimationFrame = (callback) => runtime.setTimeout(() => callback(now), 16);
  runtime.cancelAnimationFrame = runtime.clearTimeout;
  const navigator = { hardwareConcurrency: 8, ...profileDevice };
  if (prepaintProfile) {
    const profile = {};
    runInNewContext(ts.transpileModule(read("src/lib/device-profile-gate.js"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText, { exports: profile });
    runInNewContext(profile.DEVICE_PROFILE_SCRIPT, { window: runtime, document, navigator });
  }
  const video = {
    currentTime: 0,
    plays: 0,
    pauses: 0,
    play() { this.plays++; return Promise.resolve(); },
    pause() { this.pauses++; },
  };
  const Particles = () => undefined;
  const sameDeps = (before, after) =>
    before && after && before.length === after.length && after.every((dep, i) => Object.is(dep, before[i]));
  const react = {
    memo: (component) => component,
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [
        state[index],
        (value) => {
          state[index] = typeof value === "function" ? value(state[index]) : value;
        },
      ];
    },
    useRef: (initial) => {
      const index = refIndex++;
      return (refs[index] ??= { current: initial });
    },
    useCallback: (callback, deps) => {
      const index = callbackIndex++;
      if (!sameDeps(callbacks[index]?.deps, deps)) callbacks[index] = { callback, deps };
      return callbacks[index].callback;
    },
    useEffect(callback, deps) {
      if (!runEffects) return;
      const index = effectIndex++;
      if (!sameDeps(effects[index]?.deps, deps)) pendingEffects.push({ index, callback, deps });
    },
  };
  const router = { preloadRoute: async () => undefined };
  const loadGate = {
    go: (options) =>
      new Promise((resolve, reject) => navigations.push({ options, resolve, reject })),
    beginOpeningHandoff: (options) => handoffs.push(options),
  };
  const jsx = (type, props) => ({ type, props });
  // The title and command deck share the original two-paint clock.
  const visualPaint = {};
  runInNewContext(ts.transpileModule(read("src/lib/visual-paint.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports: visualPaint, window: runtime });
  const exports = {};
  const code = ts.transpileModule(title, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(code, {
    exports,
    window: runtime,
    document,
    navigator,
    Element,
    HTMLElement: Element,
    performance: { now: () => now, getEntriesByType: () => [] },
    URLSearchParams,
    require: (name) => {
      if (name === "@/lib/visual-paint") return visualPaint;
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "@tanstack/react-router") return { useRouter: () => router };
      if (name === "@/components/load-gate")
        return { useLoadGate: () => loadGate };
      if (name === "@/lib/opening-logo")
        return {
          OPENING_LOGO_FIRST: { src: "/ice.webp" },
          OPENING_LOGO_FINAL: { src: "/prism.webp" },
        };
      if (name === "@/lib/asset-loader")
        return { WORLD_ENTER_ASSETS: ["/world.webp"], preloadAssets: async () => undefined };
      // Startup delivery adds an idle stylesheet hint, not a different title clock/handler.
      if (name === "@/lib/opening-destination-styles") return { preloadOpeningDestinationStyles() {} };
      if (name === "./opening-timing") return { OPENING_BURN: { start: 2.6 } };
      if (name === "./particles") return { Particles };
      if (name === "@/lib/opening-notice")
        return { armOpeningNotice() {}, disarmOpeningNotice() {} };
      if (name === "./opening-burn" || name === "./opening-dive") {
        chunkRequests.push(name);
        return name === "./opening-dive" ? diveImport ?? {} : {};
      }
      return {};
    },
  });
  const nodes = (node) => {
    if (!node || typeof node !== "object") return [];
    return [node, ...[node.props?.children].flat(2).flatMap(nodes)];
  };
  return {
    state,
    navigations,
    handoffs,
    stored,
    runtime,
    timers,
    document,
    video,
    chunkRequests,
    key(key, options = {}) {
      const event = new Event("keydown", { cancelable: true });
      const target = new Element();
      if (options.textEntry) target.closest = () => target;
      for (const [name, value] of Object.entries({ key, repeat: false, target, ...options })) {
        if (name !== "handled" && name !== "textEntry") Object.defineProperty(event, name, { value });
      }
      if (options.handled) event.preventDefault();
      events.dispatchEvent(event);
      return event;
    },
    visibility(hidden) {
      document.hidden = hidden;
      document.visibilityState = hidden ? "hidden" : "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    },
    pageShow() {
      const event = new Event("pageshow");
      Object.defineProperty(event, "persisted", { value: true });
      events.dispatchEvent(event);
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
      effects.length = 0;
      pendingEffects = [];
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      now = target;
    },
    render() {
      stateIndex = 0;
      refIndex = 0;
      callbackIndex = 0;
      effectIndex = 0;
      const tree = exports.TitleSequence();
      const all = nodes(tree);
      if (withLogo) all.find((node) => node.props?.className === "cine-logo-core").props.imageRef.current = {
        currentSrc: "/prism.webp",
        getBoundingClientRect: () => ({ left: 40, top: 100, width: 240, height: 160 }),
      };
      if (withVideo) all.find((node) => node.props?.className === "cine-atmosphere").props.ref.current = video;
      const commit = pendingEffects;
      pendingEffects = [];
      for (const { index, callback, deps } of commit) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: callback() };
      }
      return {
        tree,
        enter: all.find((node) => node.props?.className === "cine-btn cine-btn-primary").props,
        skip: all.find((node) => node.props?.className === "cine-ghost cine-skip").props,
        replay: all.find((node) => node.props?.className === "cine-btn cine-btn-secondary").props,
        particles: all.find((node) => node.type === Particles).props,
      };
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((settle, fail) => { resolve = settle; reject = fail; });
  return { promise, resolve, reject };
}

const DIVE_BITMAP_COUNT = 3;

// Use the real module-global preparation/release implementation so the test
// covers invalidating pending decodes, not a fake engine's cleanup counter.
function diveBitmapRuntime() {
  const pendingImages = [];
  const closedImages = [];
  const loadImage = (source) => {
    const result = deferred();
    pendingImages.push({ source, ...result });
    return result.promise;
  };
  const exports = {};
  runInNewContext(ts.transpileModule(read("src/components/cinematic/opening-dive.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    exports,
    window: { clearTimeout() {}, matchMedia: () => ({ matches: false }) },
    navigator: {},
    require(name) {
      if (name === "./opening-gl") return {
        loadGlImage: loadImage,
        closeGlImage: (image) => closedImages.push(image),
      };
      return {};
    },
  });
  const resolveImages = (from = 0, to = Number.POSITIVE_INFINITY) => {
    for (const [index, image] of pendingImages.entries()) {
      if (index >= from && index < to) image.resolve({ id: index, source: image.source });
    }
  };
  return { engine: exports, pendingImages, closedImages, resolveImages };
}

function assertAllDiveBitmapsClosed(bitmaps, count = DIVE_BITMAP_COUNT) {
  assert.equal(bitmaps.closedImages.length, count, "all dive bitmaps close");
  assert.equal(new Set(bitmaps.closedImages).size, count, "every bitmap closes exactly once");

}

test("the entrance is hidden and disabled throughout idle and playing", () => {
  const ui = entryRuntime();
  for (const phase of ["idle", "playing"]) {
    ui.state[0] = phase;
    const view = ui.render();
    assert.equal(view.enter.disabled, true);
    assert.equal(view.replay.hidden, true);
    assert.equal(view.replay.disabled, true);
    assert.equal(view.tree.props["data-opening-entry"], "pending");
    view.enter.onClick();
    assert.equal(ui.navigations.length, 0);
    assert.equal(ui.handoffs.length, 0);
  }
  assert.match(css, /:not\(\[data-opening-entry="ready"\]\) \.cine-replay-slot\s*\{[^}]*visibility: hidden;[^}]*pointer-events: none;/);
});

test("the ready control deck passes empty pointer hits through while enabled child buttons remain live", () => {
  assert.match(
    css,
    /\.cine-stage\[data-opening-entry="ready"\] \.cine-replay-slot \{[^}]*opacity: 1;[^}]*pointer-events: none;/,
  );
  assert.match(
    css,
    /\.cine-stage\[data-opening-entry="ready"\] \.cine-replay-slot > \.cine-btn:not\(:disabled\) \{\s*pointer-events: auto;/,
  );
});

test("SKIP has its own row above the final entrance at narrow portrait and short landscape sizes", () => {
  assert.match(css, /bottom: calc\(max\(10vh, 72px\) \+ 52px \+ 12px\);/);
  assert.match(css, /bottom: calc\(max\(8vh, 56px\) \+ 52px \+ 12px\);/);
  assert.match(css, /bottom: calc\(30px \+ 44px \+ 12px\);/);
});

test("real opening gestures, M presses and repeated replays have no sound control or stage unlock", () => {
  const ui = entryRuntime({ runEffects: true, profileDevice: { connection: { saveData: true } } });
  for (let run = 0; run < 3; run++) {
    ui.render();
    ui.advance(120);
    const playing = ui.render();
    assert.equal(ui.state[0], "playing");
    assert.equal(playing.tree.props.onPointerDown, undefined, "background taps no longer unlock sound");
    const before = [...ui.state];
    const m = ui.key("m");
    assert.deepEqual(ui.state, before, "M does not mutate any opening state");
    assert.equal(m.defaultPrevented, false, "M is not an opening shortcut");
    playing.skip.onClick({ detail: 0 });
    const complete = ui.render();
    assert.equal(ui.state[0], "complete");
    assert.equal(complete.replay.hidden, false);
    complete.replay.onClick({ detail: 0 });
    assert.equal(ui.state[0], "idle");
  }
  ui.unmount();
});

test("skip reveals the final entrance and replay deck", () => {
  const ui = entryRuntime();
  ui.state[0] = "playing";
  const view = ui.render();
  view.skip.onClick({ detail: 1 });
  const complete = ui.render();
  assert.equal(ui.state[0], "complete");
  assert.equal(complete.enter.disabled, false);
  assert.equal(complete.replay.hidden, false);
  assert.equal(complete.replay.disabled, false);
  assert.equal(complete.tree.props["data-opening-entry"], "ready");
});

test("visibility and persisted pageshow preserve entry while its paint and navigation are pending", async () => {
  const ui = entryRuntime({ runEffects: true, withLogo: true });
  ui.state[0] = "complete";
  const ready = ui.render();
  ready.enter.onClick();
  assert.equal(ui.state[0], "diving");
  assert.equal(ui.handoffs.length, 1);
  for (const beforePaint of [true, false]) {
    ui.visibility(true);
    ui.visibility(false);
    ui.pageShow();
    assert.equal(ui.state[0], "diving", "an owned entry must not be recovered as abandoned");
    ui.render().enter.onClick();
    assert.equal(ui.handoffs.length, 1, "returning to the app cannot duplicate the handoff");
    if (beforePaint) {
      ui.advance(32);
      await flush();
      assert.equal(ui.navigations.length, 1, "the original navigation still starts after paint");
    }
  }
  ui.navigations[0].resolve();
  await flush();
  assert.equal(ui.state[0], "complete", "a cancelled route restores usable controls");
  ui.render().enter.onClick();
  ui.advance(32);
  await flush();
  assert.equal(ui.navigations.length, 2, "cancelled entry permits a fresh attempt");
  ui.runtime.location.pathname = "/world";
  ui.navigations[1].resolve();
  await flush();
  ui.unmount();
});

test("failed entry recovers and unmount before paint cannot navigate", async () => {
  for (const unmount of [false, true]) {
    const ui = entryRuntime({ runEffects: true, withLogo: true });
    ui.state[0] = "complete";
    ui.render().enter.onClick();
    if (unmount) ui.unmount();
    ui.advance(32);
    await flush();
    assert.equal(ui.navigations.length, unmount ? 0 : 1);
    if (!unmount) {
      ui.navigations[0].reject(new Error("navigation interrupted"));
      await flush();
      assert.equal(ui.state[0], "complete");
      ui.render().enter.onClick();
      assert.equal(ui.handoffs.length, 2);
      ui.unmount();
      ui.advance(32);
      await flush();
    }
  }
});

test("opening shortcuts leave handled, composing, edited and modified keystrokes alone", () => {
  const ui = entryRuntime({ runEffects: true });
  ui.state[0] = "playing";
  ui.render();
  for (const options of [
    { handled: true }, { isComposing: true }, { metaKey: true },
    { ctrlKey: true }, { altKey: true }, { textEntry: true },
  ]) {
    for (const key of ["Escape", "Enter", " ", "s"]) {
      const event = ui.key(key, options);
      assert.equal(ui.state[0], "playing", `${key} ${JSON.stringify(options)}`);
      assert.equal(event.defaultPrevented, Boolean(options.handled));
    }
  }
  assert.equal(ui.key("Escape").defaultPrevented, true);
  assert.equal(ui.state[0], "complete");
  ui.render();
  ui.advance(600);
  ui.key("r", { ctrlKey: true });
  assert.equal(ui.state[0], "complete");
  ui.key("r");
  assert.equal(ui.state[0], "idle");
  ui.unmount();
});

test("the delayed start preserves the hidden entrance until the score completes", () => {
  const ui = entryRuntime({ runEffects: true });
  ui.render();
  ui.advance(120);
  const playing = ui.render();
  assert.equal(ui.state[0], "playing");
  assert.equal(playing.enter.disabled, true);
  assert.equal(playing.tree.props["data-opening-entry"], "pending");
  ui.advance(10000);
  const complete = ui.render();
  assert.equal(ui.state[0], "complete");
  assert.equal(complete.enter.disabled, false);
  assert.equal(complete.tree.props["data-opening-entry"], "ready");
});

for (const [name, profileDevice] of [
  ["iPadOS 18", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.6 Safari/605.1", maxTouchPoints: 5 }],
  ["four-core Android", { userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/134.0", hardwareConcurrency: 4 }],
]) {
  test(`${name} keeps runtime video, particles and engine loading aligned with the pre-paint economy gate`, async () => {
    const ui = entryRuntime({ runEffects: true, prepaintProfile: true, profileDevice, withVideo: true });
    const first = ui.render();
    assert.equal(ui.document.documentElement.dataset.worldEffects, "economy");
    assert.equal(first.particles.active, false, "the first SSR-compatible idle frame starts no particles");
    assert.equal(ui.state[1], true, "the committed mount effect adopts the pre-paint profile");
    ui.render();
    ui.advance(120);
    const playing = ui.render();
    assert.equal(ui.state[0], "playing");
    assert.match(playing.tree.props.className, /is-economy-opening/);
    assert.equal(playing.particles.active, false);
    ui.advance(3000);
    await flush();
    assert.equal(ui.video.plays, 0);
    assert.deepEqual(ui.chunkRequests, [], "the initial false→true economy commit starts no GPU imports");
    ui.state[0] = "complete";
    const complete = ui.render();
    complete.enter.onFocus();
    complete.enter.onPointerDown({ pointerType: "touch" });
    ui.advance(1500);
    await flush();
    assert.deepEqual(ui.chunkRequests, [], "focus, idle and touch must not prepare a dive in economy");
    ui.unmount();
  });
}

test("a dive chunk arriving after title unmount creates no decoded global assets", async () => {
  const imported = deferred();
  const bitmaps = diveBitmapRuntime();
  const ui = entryRuntime({ runEffects: true, diveImport: imported.promise });
  ui.state[0] = "complete";
  ui.render().enter.onFocus();
  await flush();
  assert.deepEqual(ui.chunkRequests, ["./opening-dive"]);
  ui.unmount();
  imported.resolve(bitmaps.engine);
  await flush();
  assert.equal(bitmaps.pendingImages.length, 0);
});

test("a late dive chunk is allowed during an owned handoff but not during a replay", async () => {
  for (const phase of ["complete", "diving", "playing", "idle"]) {
    const imported = deferred();
    const bitmaps = diveBitmapRuntime();
    const ui = entryRuntime({ runEffects: true, diveImport: imported.promise });
    ui.state[0] = "complete";
    ui.render().enter.onFocus();
    await flush();
    ui.state[0] = phase;
    ui.render();
    imported.resolve(bitmaps.engine);
    await flush();
    const expected = phase === "complete" || phase === "diving" ? DIVE_BITMAP_COUNT : 0;
    assert.equal(bitmaps.pendingImages.length, expected, phase);
    ui.unmount();
    bitmaps.resolveImages();
    await flush();
    assertAllDiveBitmapsClosed(bitmaps, expected);
  }
});

test("unused completed preparation releases all three bitmaps without duplicate closes", async () => {
  const bitmaps = diveBitmapRuntime();
  const prepared = bitmaps.engine.prepareOpeningDive("/prism.webp");
  assert.equal(bitmaps.pendingImages.length, 3);
  assert.ok(bitmaps.pendingImages.every(({ source }) => !source.includes("rain-city")));
  bitmaps.resolveImages();
  await prepared;
  assert.equal(bitmaps.closedImages.length, 0, "a prepared flight owns its decoded inputs");
  bitmaps.engine.releaseOpeningDivePrepared();
  bitmaps.engine.releaseOpeningDivePrepared();
  assertAllDiveBitmapsClosed(bitmaps);
});

test("replaying a title reuses preparation and unmount closes all three dive images", async () => {
  for (const decodeBeforeReplay of [false, true]) {
    const bitmaps = diveBitmapRuntime();
    const ui = entryRuntime({ runEffects: true, diveImport: Promise.resolve(bitmaps.engine) });
    ui.state[0] = "complete";
    const complete = ui.render();
    complete.enter.onFocus();
    await flush();
    assert.equal(bitmaps.pendingImages.length, DIVE_BITMAP_COUNT);
    if (decodeBeforeReplay) {
      bitmaps.resolveImages();
      await flush();
    }
    complete.replay.onClick({ detail: 0 });
    ui.render();
    assert.equal(ui.state[0], "idle");
    bitmaps.resolveImages();
    await flush();
    ui.state[0] = "complete";
    ui.render().enter.onFocus();
    await flush();
    assert.equal(bitmaps.pendingImages.length, DIVE_BITMAP_COUNT, "replay keeps the existing cache contract");
    ui.unmount();
    assertAllDiveBitmapsClosed(bitmaps);
  }
});

test("unmount invalidates a pending real dive preparation and closes every later bitmap", async () => {
  const bitmaps = diveBitmapRuntime();
  const ui = entryRuntime({ runEffects: true, diveImport: Promise.resolve(bitmaps.engine) });
  ui.state[0] = "complete";
  ui.render().enter.onFocus();
  await flush();
  assert.equal(bitmaps.pendingImages.length, DIVE_BITMAP_COUNT);
  ui.unmount();
  const next = bitmaps.engine.prepareOpeningDive("/prism.webp");
  assert.equal(bitmaps.pendingImages.length, DIVE_BITMAP_COUNT * 2, "abandoned preparation is not reused as a global cache");
  bitmaps.resolveImages(0, DIVE_BITMAP_COUNT);
  await flush();
  assertAllDiveBitmapsClosed(bitmaps);
  assert.equal(bitmaps.engine.prepareOpeningDive("/prism.webp"), next,
    "late completion from the abandoned title cannot release a newer shared preparation");
  bitmaps.resolveImages(DIVE_BITMAP_COUNT);
  await next;
  bitmaps.engine.releaseOpeningDivePrepared();
  assertAllDiveBitmapsClosed(bitmaps, DIVE_BITMAP_COUNT * 2);
});

test("a failed legacy decode closes every successful dive bitmap before allowing retry", async () => {
  for (const failed of [0, 1, 2]) {
    const bitmaps = diveBitmapRuntime();
    const prepared = bitmaps.engine.prepareOpeningDive("/prism.webp");
    const rejected = assert.rejects(prepared, /Opening assets unavailable/);
    bitmaps.pendingImages[failed].reject(new Error("legacy decode unavailable"));
    bitmaps.resolveImages();
    await rejected;
    assert.equal(bitmaps.closedImages.length, DIVE_BITMAP_COUNT - 1);
    assert.equal(new Set(bitmaps.closedImages).size, DIVE_BITMAP_COUNT - 1);

    const retry = bitmaps.engine.prepareOpeningDive("/prism.webp");
    assert.notEqual(retry, prepared);
    assert.equal(bitmaps.pendingImages.length, DIVE_BITMAP_COUNT * 2);
    bitmaps.resolveImages(DIVE_BITMAP_COUNT);
    await retry;
    bitmaps.engine.releaseOpeningDivePrepared();
    assert.equal(bitmaps.closedImages.length, DIVE_BITMAP_COUNT * 2 - 1);
    assert.equal(new Set(bitmaps.closedImages).size, DIVE_BITMAP_COUNT * 2 - 1);
  }
});

test("WebGL preparation happens after a painted playing phase, not on a skipped mount", () => {
  const burn = title.slice(title.indexOf("// Burn priming"), title.indexOf("const startBurn"));
  const gate = burn.indexOf('phase !== "playing"');
  const fetch = burn.indexOf("await loadBurnEngine()");
  assert.ok(gate >= 0 && gate < fetch);
  assert.match(burn, /economyOpening[\s\S]*?prefers-reduced-motion/);
  assert.ok(burn.indexOf("await waitForVisualPaint()") < fetch);
  assert.match(burn, /whenIdle\([\s\S]*?400\)/);
  assert.match(burn, /settlePrime\("cancelled"\)/);
  assert.match(title, /phaseRef\.current !== "complete" \|\|\s*economyOpening/);
  assert.match(title, /\}, 900\);/, "the 1 MB atmosphere waits behind the first title frame");
  assert.match(title, /Particles active=\{!audit && !economyOpening && phase === "playing"\}/);
});

test("the refined scene adds no image/video/font requests and rests without continual frames", () => {
  assert.doesNotMatch(css, /url\(|@import|infinite/);
  assert.match(css, /cine-hud-spin[\s\S]*?animation-play-state: paused/);
  assert.match(css, /cine-camera[\s\S]*?will-change: auto/);
  assert.match(css, /data-opening-entry="ready"[\s\S]*?filter: none/);
  assert.match(css, /cine-btn-secondary\[hidden\][\s\S]*?display: none/);
  assert.equal(title.match(/<LogoLayer\s+logo=\{OPENING_LOGO_FIRST\}/g)?.length, 5);
  assert.equal(title.match(/<LogoLayer\s+logo=\{OPENING_LOGO_FINAL\}/g)?.length, 3);
  assert.ok(statSync(new URL("../public/atmosphere-poster.jpg", import.meta.url)).size < 25_000);
});
