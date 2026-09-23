// RISING THE WORLD: the sequence controller. Framework-free: it picks the
// tier, plays the portal, starts WebGL when it is ready in time, drives the
// WAAPI title and fades from one clock, and releases everything at the end.
// Loaded with import() from the gate (rising-world.tsx).
import { hasConstrainedResources } from "@/lib/rendering-profile";
import { FireRenderer, prepareRisingAssets, preparedRisingAssets } from "./rising-fire";
import {
  RISING_READY_TIMEOUT_MS,
  RISING_TIMING,
  pickRisingTier,
  risingFramesPerDraw,
  type RisingTier,
} from "./rising-timing";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

/** Capability only: reduced motion, then the shared resource hints. Never the device model. */
export function currentRisingTier(): RisingTier {
  return pickRisingTier({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    constrained: hasConstrainedResources(navigator as NavigatorWithHints),
  });
}

const isCompact = () =>
  window.matchMedia("(any-pointer: coarse)").matches || window.innerWidth < 760;

const decoded = new Map<string, Promise<void>>();
function decode(src: string) {
  let pending = decoded.get(src);
  if (!pending) {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    pending = image.decode().catch(() => {
      decoded.delete(src);
    });
    decoded.set(src, pending);
  }
  return pending;
}

/**
 * Warms what the run will need before the press: resized ImageBitmaps for the
 * WebGL tier, decoded images for the calm tiers (the portal shows the key
 * visual in every tier). Idempotent.
 */
export function prepareRising(world: string, rider: string) {
  const images = Promise.all([decode(world), decode(rider)]);
  if (currentRisingTier() === "webgl") {
    return Promise.all([images, prepareRisingAssets(world, rider)]).then(() => undefined);
  }
  return images.then(() => undefined);
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "rw-canvas";
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

// ---- Pointerdown priming: the GL context, the texture uploads and the start
// of the (parallel) shader compile happen on a detached canvas while the
// finger is still down, before showModal() restyles the page. The click only
// attaches the canvas. Nobody clicked within a second: released again.
type Primed = {
  key: string;
  canvas: HTMLCanvasElement;
  renderer: FireRenderer;
  compiled: Promise<void>;
  timer: number;
};

const PRIME_TTL_MS = 1000;
let primed: Primed | null = null;

function releasePrimed() {
  const current = primed;
  if (!current) return;
  primed = null;
  window.clearTimeout(current.timer);
  current.renderer.dispose();
}

export function primeRising(world: string, rider: string) {
  if (primed || currentRisingTier() !== "webgl") return;
  const assets = preparedRisingAssets(world, rider);
  if (!assets) return;
  const canvas = createCanvas();
  let renderer: FireRenderer;
  try {
    renderer = new FireRenderer(canvas, { assets, compact: isCompact() });
  } catch {
    return; // no (hardware) WebGL: the run tries once more, then goes calm
  }
  const compiled = renderer.compile();
  compiled.catch(() => undefined);
  primed = {
    key: `${world}|${rider}`,
    canvas,
    renderer,
    compiled,
    timer: window.setTimeout(releasePrimed, PRIME_TTL_MS),
  };
}

function adoptPrimed(world: string, rider: string) {
  const current = primed;
  if (!current) return null;
  primed = null;
  window.clearTimeout(current.timer);
  if (current.key !== `${world}|${rider}` || current.renderer.lost) {
    current.renderer.dispose();
    return null;
  }
  return current;
}

export type RisingStats = {
  tier: RisingTier;
  fallback: string | null;
  primed: boolean;
  readyMs: number | null;
  clockStartMs: number | null;
  size: { width: number; height: number; scale: number; rung: number } | null;
  cadenceMs: number | null;
  framesPerDraw: number;
  draws: number;
  renderMs: number[];
  rungChanges: { at: number; medianMs: number; rung: number }[];
  running: boolean;
};

export type RisingRunOptions = {
  /** `.rw-viewport`: data-tier, data-portal and data-ready are set on it. */
  viewport: HTMLElement;
  /** Portal origin in viewport pixels (the centre of the trigger). */
  origin: { x: number; y: number };
  world: string;
  rider: string;
  /** Test hook: no clock, animations paused, seek() drives every frame. */
  audit?: boolean;
  onTitle: () => void;
  onEnd: () => void;
};

export type RisingRun = {
  readonly tier: RisingTier;
  readonly stats: RisingStats;
  /** Seconds the portal plays before the sequence clock starts. */
  readonly portalSeconds: number;
  /** Resolves once the run is playing (or paused before the portal in audit mode). */
  readonly ready: Promise<void>;
  readonly elapsed: number;
  skip: () => void;
  /** Audit clock: negative times are the portal, 0 is the first frame of the dive. */
  seek: (T: number) => void;
  dispose: () => void;
};

type TimedAnimation = { animation: Animation; end: number };

const EXPO_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const REDUCED_FADE_SECONDS = 0.4;

function withDeadline<T>(promise: Promise<T>, deadline: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("not-ready")),
      Math.max(0, deadline - performance.now()),
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function runRising({
  viewport,
  origin,
  world,
  rider,
  audit = false,
  onTitle,
  onEnd,
}: RisingRunOptions): RisingRun {
  const find = (selector: string) => viewport.querySelector<HTMLElement>(selector);
  const glHost = find(".rw-gl");
  const portalElement = find(".rw-portal");
  const portalArt = find(".rw-portal-art");
  const title = find(".rw-title");
  const titleWrap = find(".rw-title-wrap");
  const titleName = find(".rw-title-name");
  const titleEp = find(".rw-title-ep");
  const scrim = find(".rw-title-scrim");
  const calm = find(".rw-calm");
  const calmWorld = find(".rw-calm-world");
  const calmBurn = find(".rw-calm-burn");

  let tier = currentRisingTier();
  const openedAt = performance.now();
  const stats: RisingStats = {
    tier,
    fallback: null,
    primed: false,
    readyMs: null,
    clockStartMs: null,
    size: null,
    cadenceMs: null,
    framesPerDraw: 1,
    draws: 0,
    renderMs: [],
    rungChanges: [],
    running: false,
  };
  viewport.dataset.tier = tier;
  delete viewport.dataset.ready;

  let disposed = false;
  let ended = false;
  let announced = false;
  let renderer: FireRenderer | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animations: TimedAnimation[] = [];
  let raf = 0;
  let elapsed = 0;
  let last = 0;
  let lastDraw = Number.NEGATIVE_INFINITY;
  const frameTimes: number[] = [];
  const drawTimes: number[] = [];

  // ---- Portal: the key visual bursts out of the button. A round element that
  // carries the key visual scales up from the button's size until it covers
  // the screen: transform only, so the compositor keeps it smooth while the
  // main thread restyles the page for the open dialog and GL gets ready. Its
  // image sits exactly where the full-screen cover image will be, so the
  // hand-over to the canvas (or the calm layer) is seamless. Reduced motion:
  // a plain fade.
  const portalSeconds = tier === "reduced" ? REDUCED_FADE_SECONDS : RISING_TIMING[tier].portal;
  let portal: Animation | null = null;
  if (tier === "reduced") {
    portal = viewport.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: portalSeconds * 1000,
      easing: "ease-out",
    });
  } else if (portalElement) {
    // window size, not layout: reading the dialog's box here would force the
    // page-wide restyle that opening it triggers into this click handler.
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ox = Math.min(width, Math.max(0, origin.x));
    const oy = Math.min(height, Math.max(0, origin.y));
    const radius = Math.ceil(Math.hypot(Math.max(ox, width - ox), Math.max(oy, height - oy))) + 2;
    Object.assign(portalElement.style, {
      left: `${ox - radius}px`,
      top: `${oy - radius}px`,
      width: `${radius * 2}px`,
      height: `${radius * 2}px`,
    });
    if (portalArt) {
      Object.assign(portalArt.style, {
        left: `${radius - ox}px`,
        top: `${radius - oy}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
    }
    viewport.dataset.portal = "true";
    const from = Math.min(1, Math.max(0.01, 28 / radius)); // about the button's height
    portal = portalElement.animate(
      [{ transform: `scale(${from.toFixed(4)})` }, { transform: "scale(1)" }],
      {
        duration: portalSeconds * 1000,
        easing: "cubic-bezier(0.7, 0, 0.84, 0)",
        fill: "forwards",
      },
    );
  }
  if (audit) portal?.pause();
  const portalDone = portal
    ? portal.finished.then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();

  const add = (
    element: HTMLElement | null,
    keyframes: Keyframe[],
    options: { delay: number; duration: number; easing?: string },
  ) => {
    if (!element) return;
    const animation = element.animate(keyframes, { fill: "both", ...options });
    animations.push({ animation, end: options.delay + options.duration });
  };

  const buildAnimations = () => {
    const s = RISING_TIMING[tier];
    const ms = (seconds: number) => seconds * 1000;
    // One cut: glyphs and scrim change in the same frame. Reduced motion: a calm fade.
    const cut = tier === "reduced" ? 600 : 1;
    add(titleWrap, [{ opacity: 0 }, { opacity: 1 }], { delay: ms(s.title), duration: cut });
    add(scrim, [{ opacity: 0 }, { opacity: 1 }], { delay: ms(s.title), duration: cut });
    if (tier !== "reduced") {
      add(titleName, [{ scale: 1.22 }, { scale: 1 }], {
        delay: ms(s.title),
        duration: 340,
        easing: EXPO_OUT,
      });
      add(titleEp, [{ translate: "-0.6em 0" }, { translate: "0 0" }], {
        delay: ms(s.title),
        duration: 420,
        easing: EXPO_OUT,
      });
    }
    if (tier === "webgl") {
      // Impact shake on the title only (spatial, no luminance change); the
      // canvas never moves, so no edge of the backdrop is ever exposed.
      add(
        title,
        [
          { translate: "0 0" },
          { translate: "-7px 4px" },
          { translate: "6px -3px" },
          { translate: "-4px 2px" },
          { translate: "2px -1px" },
          { translate: "0 0" },
        ],
        { delay: ms(s.title), duration: 420, easing: "linear" },
      );
      add(glHost, [{ opacity: 1 }, { opacity: 0 }], {
        delay: ms(s.fade[0]),
        duration: ms(s.fade[1] - s.fade[0]),
        easing: "ease-in-out",
      });
      return;
    }
    if (tier === "css") {
      add(calmWorld, [{ scale: 1 }, { scale: 1.32 }], {
        delay: 0,
        duration: ms(s.breakthrough),
        easing: "cubic-bezier(0.5, 0, 0.75, 0)",
      });
      add(calmBurn, [{ translate: "0 100%" }, { translate: "0 -6%" }], {
        delay: ms(s.burnStart),
        duration: ms(s.burnEnd - s.burnStart),
        easing: "ease-in-out",
      });
    }
    add(calm, [{ opacity: 1 }, { opacity: 0 }], {
      delay: ms(s.fade[0]),
      duration: ms(s.fade[1] - s.fade[0]),
      easing: "ease-in-out",
    });
  };

  const dropRenderer = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    canvas?.removeEventListener("webglcontextlost", onContextLost);
    renderer?.dispose();
    renderer = null;
    canvas?.remove();
    canvas = null;
    stats.running = false;
  };

  const announce = () => {
    if (announced) return;
    announced = true;
    onTitle();
  };

  // WAAPI and the shader share one clock: a hitch slows both instead of desyncing them.
  const syncAnimations = (T: number) => {
    const want = T * 1000;
    for (const { animation, end } of animations) {
      const current = Number(animation.currentTime ?? 0);
      if (current >= end && want >= end) continue;
      if (Math.abs(current - want) > 60) animation.currentTime = want;
    }
  };

  const finish = () => {
    if (ended || disposed) return;
    ended = true;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    portal?.finish();
    delete viewport.dataset.portal;
    for (const { animation } of animations) animation.finish();
    dropRenderer();
    announce();
    onEnd();
  };

  const skip = () => {
    if (ended || disposed) return;
    // Pressed before WebGL was ready: the calm layer still covers the end still.
    if (tier === "webgl" && !viewport.dataset.ready) {
      tier = "css";
      stats.tier = tier;
      viewport.dataset.tier = tier;
    }
    if (!animations.length) buildAnimations();
    elapsed = RISING_TIMING[tier].end;
    finish();
  };

  function onContextLost(event: Event) {
    event.preventDefault();
    stats.fallback = "context-lost";
    dropRenderer();
    skip();
  }

  // Adaptive quality: median draw interval over the last 24 draws against the
  // draw cadence (frames per draw x the measured rAF interval), so neither a
  // 90/120 Hz panel nor a 30 Hz battery-saver cap walks the ladder down for nothing.
  const adapt = (now: number) => {
    drawTimes.push(now);
    if (!renderer || drawTimes.length < 30 || drawTimes.length % 24) return;
    const recent = drawTimes
      .slice(-24)
      .map((time, index, list) => (index ? time - list[index - 1] : 0))
      .slice(1)
      .sort((a, b) => a - b);
    const median = recent[Math.floor(recent.length / 2)];
    const expected = (stats.cadenceMs ?? 1000 / 60) * stats.framesPerDraw;
    const budget = Math.max(20.5, expected * 1.35);
    if (median > budget && renderer.degrade()) {
      stats.size = renderer.size;
      stats.rungChanges.push({
        at: Number(elapsed.toFixed(2)),
        medianMs: Number(median.toFixed(1)),
        rung: renderer.rung,
      });
    }
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed || ended) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); // a hitch slows, never skips
    last = now;
    elapsed += dt;
    const T = elapsed;
    if (stats.cadenceMs === null) {
      frameTimes.push(now);
      if (frameTimes.length >= 9) {
        const intervals = frameTimes
          .map((time, index, list) => (index ? time - list[index - 1] : 0))
          .slice(1)
          .sort((a, b) => a - b);
        stats.cadenceMs = Number(intervals[4].toFixed(2));
        stats.framesPerDraw = risingFramesPerDraw(stats.cadenceMs);
      }
    }
    syncAnimations(T);
    // Every frame on 60 and 90 Hz panels, every second frame on 120/144 Hz.
    const cadence = stats.cadenceMs;
    const interval = cadence === null ? 15.5 : stats.framesPerDraw * cadence - cadence / 2;
    if (renderer && T < RISING_TIMING.webgl.fade[1] && now - lastDraw >= interval) {
      lastDraw = now;
      stats.draws += 1;
      const started = performance.now();
      renderer.render(T);
      stats.renderMs.push(performance.now() - started);
      adapt(now);
    }
    if (!announced && T >= RISING_TIMING[tier].title) {
      // The cut lands on this frame: announce it and pin every animation to the clock.
      for (const { animation } of animations) animation.currentTime = T * 1000;
      announce();
    }
    if (T >= RISING_TIMING[tier].end) {
      finish();
      return;
    }
    raf = window.requestAnimationFrame(tick);
  };

  function onVisibility() {
    if (disposed || ended || audit) return;
    if (document.visibilityState === "hidden") {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      for (const { animation } of animations) animation.pause();
      return;
    }
    if (raf) return;
    last = performance.now();
    drawTimes.length = 0;
    const want = elapsed * 1000;
    for (const { animation, end } of animations) {
      animation.currentTime = want;
      // play() on a finished animation would rewind it (and replay the cut).
      if (want >= end) animation.finish();
      else animation.play();
    }
    raf = window.requestAnimationFrame(tick);
  }

  const seek = (T: number) => {
    if (disposed) return;
    if (portal) {
      portal.currentTime = Math.min(portalSeconds, Math.max(0, T + portalSeconds)) * 1000;
    }
    if (T < 0) {
      if (tier !== "reduced") viewport.dataset.portal = "true";
      elapsed = 0;
      for (const { animation } of animations) animation.currentTime = 0;
      return;
    }
    delete viewport.dataset.portal;
    elapsed = T;
    for (const { animation } of animations) animation.currentTime = T * 1000;
    if (renderer && T < RISING_TIMING.webgl.fade[1] + 0.05) {
      renderer.render(Math.min(T, RISING_TIMING.webgl.fade[1]));
    }
    if (T >= RISING_TIMING[tier].title) announce();
  };

  const stale = () => {
    if (!disposed && !ended) return false;
    dropRenderer();
    return true;
  };

  const ready = (async () => {
    if (tier === "webgl") {
      const deadline = openedAt + (audit ? 5000 : RISING_READY_TIMEOUT_MS);
      try {
        let compiled: Promise<void>;
        const adopted = adoptPrimed(world, rider);
        if (adopted) {
          stats.primed = true;
          canvas = adopted.canvas;
          renderer = adopted.renderer;
          compiled = adopted.compiled;
        } else {
          const assets = await withDeadline(prepareRisingAssets(world, rider), deadline);
          if (stale()) return;
          canvas = createCanvas();
          renderer = new FireRenderer(canvas, { assets, compact: isCompact() });
          compiled = renderer.compile();
          compiled.catch(() => undefined);
        }
        glHost?.append(canvas);
        await withDeadline(compiled, deadline);
        if (stale()) return;
        const active: FireRenderer = renderer;
        active.render(0); // warm the pipeline: the canvas holds frame 0 when it appears
        stats.size = active.size;
        canvas.addEventListener("webglcontextlost", onContextLost);
        resizeObserver = new ResizeObserver(() => {
          active.resize();
          stats.size = active.size;
        });
        if (glHost) resizeObserver.observe(glHost);
      } catch (error) {
        if (stale()) return;
        dropRenderer();
        stats.fallback = error instanceof Error ? error.message.slice(0, 120) : "error";
        tier = "css";
        stats.tier = tier;
        viewport.dataset.tier = tier;
      }
    }
    if (stale()) return;
    stats.readyMs = Number((performance.now() - openedAt).toFixed(1));
    if (audit) {
      if (renderer) viewport.dataset.ready = "true";
      buildAnimations();
      for (const { animation } of animations) animation.pause();
      seek(-portalSeconds);
      return;
    }
    // The clock starts when the portal has covered the screen and GL (or the
    // calm fallback) is ready, whichever is later.
    await portalDone;
    if (stale()) return;
    if (renderer) viewport.dataset.ready = "true";
    delete viewport.dataset.portal;
    stats.clockStartMs = Number((performance.now() - openedAt).toFixed(1));
    buildAnimations();
    stats.running = Boolean(renderer);
    document.addEventListener("visibilitychange", onVisibility);
    last = performance.now();
    raf = window.requestAnimationFrame(tick);
  })();

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    portal?.cancel();
    for (const { animation } of animations) animation.cancel();
    animations = [];
    dropRenderer();
    delete viewport.dataset.ready;
    delete viewport.dataset.portal;
  };

  return {
    get tier() {
      return tier;
    },
    stats,
    portalSeconds,
    ready,
    get elapsed() {
      return elapsed;
    },
    skip,
    seek,
    dispose,
  };
}
