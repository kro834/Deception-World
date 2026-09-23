// The opening burn: the ice logo is consumed by red flames and the prism logo
// emerges from the ash. Framework-free; loaded with import() by the title, so
// the first paint does not carry it.
//
// Tiers (by capability, never by device model):
// - webgl: one fragment shader on a premultiplied transparent canvas over the
//   title scene (opening-burn.frag.glsl). The context and the shader compile
//   are primed in an idle period well before the burn; the canvas swaps with
//   the DOM ice logo in one frame and back to the DOM prism logo in one frame,
//   and the context is released right after.
// - css: `data-burn="css"` on the lockup; styles.css wipes the ice logo off
//   and the prism logo on with transform-only animations and a flame band.
// - reduced: the title shows the prism logo directly (no burn).
import { hasConstrainedResources } from "@/lib/rendering-profile";
import BURN_SOURCE from "./opening-burn.frag.glsl?raw";
import { ShaderPass, closeGlImage, loadGlImage, shouldDegrade, type GlImage } from "./opening-gl";
import {
  OPENING_BURN,
  burnUniformsAt,
  openingFramesPerDraw,
  pickOpeningTier,
  type OpeningTier,
} from "./opening-timing";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

export function currentOpeningTier(): OpeningTier {
  return pickOpeningTier({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    constrained: hasConstrainedResources(navigator as NavigatorWithHints),
  });
}

const isCompact = () =>
  window.matchMedia("(any-pointer: coarse)").matches || window.innerWidth < 760;

const UNIFORMS = ["uRes", "uLogo", "uTime", "uHeat", "uBurn", "uFlame", "uCool"] as const;

// Render pixels per frame at the top rung (device pixels, ratio capped at 2).
const COMPACT_BUDGET = 720_000;
const WIDE_BUDGET = 2_400_000;

/** The logo box's width in device pixels the canvas can draw it at. */
export function burnTextureWidth(lockupCssWidth: number) {
  const ratio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  return Math.min(1536, Math.max(640, Math.round(lockupCssWidth * ratio)));
}

type BurnAssets = { first: GlImage; final: GlImage };

let prepared: Promise<BurnAssets> | null = null;
let preparedKey = "";
let preparedValue: BurnAssets | null = null;

/** Idempotent: resized, premultiplied ImageBitmaps of both logos. */
export function prepareOpeningBurn(first: string, final: string, maxWidth: number) {
  const key = `${first}|${final}|${maxWidth}`;
  if (!prepared || preparedKey !== key) {
    releasePreparedBitmaps();
    preparedKey = key;
    const natural = { width: 1536, height: 1024 };
    const pending: Promise<BurnAssets> = Promise.all([
      loadGlImage(first, natural, maxWidth),
      loadGlImage(final, natural, maxWidth),
    ]).then(
      ([firstImage, finalImage]) => {
        const assets = { first: firstImage, final: finalImage };
        if (prepared === pending) preparedValue = assets;
        else {
          closeGlImage(firstImage);
          closeGlImage(finalImage);
        }
        return assets;
      },
      (error: unknown) => {
        if (prepared === pending) prepared = null;
        throw error;
      },
    );
    prepared = pending;
  }
  return prepared;
}

function releasePreparedBitmaps() {
  const value = preparedValue;
  prepared = null;
  preparedKey = "";
  preparedValue = null;
  closeGlImage(value?.first);
  closeGlImage(value?.final);
}

// ---- Priming: the GL context, the uploads and the (parallel) compile happen
// on a detached canvas in an idle period, seconds before the burn.
type Primed = {
  canvas: HTMLCanvasElement;
  pass: ShaderPass | null;
  compiled: boolean;
  failed: boolean;
};

let primed: Primed | null = null;

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "cine-burn-canvas";
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

/**
 * Creates the burn's GL context from the prepared bitmaps and starts the
 * shader compile. The uploads are copies (1-3 ms); the bitmaps are closed
 * once they are in GPU memory. Returns false when GL is not available.
 */
export function primeOpeningBurn() {
  if (primed) return !primed.failed;
  if (currentOpeningTier() !== "webgl" || !preparedValue) return false;
  const assets = preparedValue;
  const canvas = createCanvas();
  let pass: ShaderPass;
  try {
    pass = new ShaderPass(canvas, {
      alpha: true,
      fragment: BURN_SOURCE,
      uniforms: UNIFORMS,
      textures: { uFirst: assets.first, uFinal: assets.final },
      budget: isCompact() ? COMPACT_BUDGET : WIDE_BUDGET,
      dprCap: 2,
      startRung: 0,
    });
  } catch {
    primed = { canvas, pass: null, compiled: false, failed: true };
    return false;
  } finally {
    // In GPU memory now (or GL is unavailable): the decoded copies can go.
    releasePreparedBitmaps();
  }
  const current: Primed = { canvas, pass, compiled: false, failed: false };
  primed = current;
  pass.compile().then(
    () => {
      current.compiled = true;
    },
    () => {
      current.failed = true;
    },
  );
  return true;
}

/** True once a primed burn is compiled and can draw. */
export function openingBurnReady() {
  return Boolean(primed?.pass && primed.compiled && !primed.pass.lost);
}

/** The title unmounted or replays: drop a primed context and the bitmaps. */
export function releaseOpeningBurn() {
  const current = primed;
  primed = null;
  current?.pass?.dispose();
  releasePreparedBitmaps();
}

export type BurnStats = {
  tier: OpeningTier;
  fallback: string | null;
  size: { width: number; height: number; scale: number; rung: number } | null;
  cadenceMs: number | null;
  framesPerDraw: number;
  draws: number;
  renderMs: number[];
  rungChanges: { at: number; rung: number }[];
  running: boolean;
  released: boolean;
};

export type BurnRunOptions = {
  /** `.cine-title-lockup`: data-burn ("webgl" | "css") and data-burn-phase are set on it. */
  lockup: HTMLElement;
  /** `.cine-logo-burn`: the canvas is appended here. */
  host: HTMLElement;
  /** `.cine-logo-wrap`: the logo box the canvas maps the textures onto. */
  logoBox: HTMLElement;
  /** Test hook: no clock; seek() draws each frame. */
  audit?: boolean;
  onEnd?: () => void;
};

export type BurnRun = {
  readonly tier: OpeningTier;
  readonly stats: BurnStats;
  /** Audit clock: seconds since the burn started. */
  seek: (T: number) => void;
  dispose: () => void;
};

/**
 * Starts the burn now (the title calls it at OPENING_BURN.start). The tier is
 * decided here: WebGL only if the primed shader is already compiled.
 */
export function runOpeningBurn({
  lockup,
  host,
  logoBox,
  audit = false,
  onEnd,
}: BurnRunOptions): BurnRun {
  let tier = currentOpeningTier();
  const stats: BurnStats = {
    tier,
    fallback: null,
    size: null,
    cadenceMs: null,
    framesPerDraw: 1,
    draws: 0,
    renderMs: [],
    rungChanges: [],
    running: false,
    released: false,
  };

  let pass: ShaderPass | null = null;
  let canvas: HTMLCanvasElement | null = null;
  if (tier === "webgl") {
    const current = primed;
    if (current?.pass && current.compiled && !current.failed && !current.pass.lost) {
      primed = null;
      pass = current.pass;
      canvas = current.canvas;
    } else {
      stats.fallback = !current ? "not-primed" : current.failed ? "gl-failed" : "not-ready";
      tier = "css";
      // A context that missed the burn is released now, not held for nothing.
      primed = null;
      current?.pass?.dispose();
    }
  }
  stats.tier = tier;

  let disposed = false;
  let ended = false;
  let raf = 0;
  let endTimer = 0;
  let lastDraw = Number.NEGATIVE_INFINITY;
  let elapsed = 0;
  let resizeObserver: ResizeObserver | null = null;
  const startedAt = performance.now();
  const frameTimes: number[] = [];
  const drawTimes: number[] = [];

  const layout = () => {
    if (!pass) return;
    const hostRect = host.getBoundingClientRect();
    const logoRect = logoBox.getBoundingClientRect();
    stats.size = pass.resize(hostRect.width, hostRect.height);
    const width = Math.max(1, hostRect.width);
    const height = Math.max(1, hostRect.height);
    // Canvas UV is y-up: the logo box's bottom edge measured from the host's bottom.
    pass.set(
      "uLogo",
      (logoRect.left - hostRect.left) / width,
      (hostRect.bottom - logoRect.bottom) / height,
      logoRect.width / width,
      logoRect.height / height,
    );
  };

  const draw = (T: number) => {
    if (!pass) return;
    const uniforms = burnUniformsAt(T);
    pass.set("uTime", T);
    pass.set("uHeat", uniforms.uHeat);
    pass.set("uBurn", uniforms.uBurn);
    pass.set("uFlame", uniforms.uFlame);
    pass.set("uCool", uniforms.uCool);
    pass.draw();
  };

  const releaseGl = () => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    canvas?.removeEventListener("webglcontextlost", onContextLost);
    pass?.dispose();
    pass = null;
    canvas?.remove();
    canvas = null;
    stats.running = false;
    stats.released = true;
  };

  const setPhase = (phase: "burning" | "done") => {
    lockup.dataset.burnPhase = phase;
  };

  const finish = () => {
    if (ended || disposed) return;
    ended = true;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(endTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    // The DOM prism logo is showing: the canvas and its context can go.
    setPhase("done");
    releaseGl();
    onEnd?.();
  };

  function onContextLost(event: Event) {
    event.preventDefault();
    stats.fallback = "context-lost";
    // Straight to the prism logo: one change, no half-burnt frame left behind.
    finish();
  }

  const tick = (now: number) => {
    raf = 0;
    if (disposed || ended) return;
    // Wall clock: the title's CSS timeline runs on the compositor, and the burn
    // keeps pace with it (a hitch drops frames instead of drifting).
    elapsed = (now - startedAt) / 1000;
    const T = Math.max(0, elapsed);
    if (stats.cadenceMs === null) {
      frameTimes.push(now);
      if (frameTimes.length >= 9) {
        const intervals = frameTimes
          .map((time, index, list) => (index ? time - list[index - 1] : 0))
          .slice(1)
          .sort((a, b) => a - b);
        stats.cadenceMs = Number(intervals[4].toFixed(2));
        stats.framesPerDraw = openingFramesPerDraw(stats.cadenceMs);
      }
    }
    if (T >= OPENING_BURN.handOff[0]) {
      finish();
      return;
    }
    const cadence = stats.cadenceMs;
    const interval = cadence === null ? 15.5 : stats.framesPerDraw * cadence - cadence / 2;
    if (pass && now - lastDraw >= interval) {
      lastDraw = now;
      stats.draws += 1;
      const started = performance.now();
      draw(T);
      stats.renderMs.push(performance.now() - started);
      drawTimes.push(now);
      if (shouldDegrade(drawTimes, stats.cadenceMs, stats.framesPerDraw)) {
        const active = pass;
        if (active.degrade(layout)) {
          stats.rungChanges.push({ at: Number(T.toFixed(2)), rung: active.rung });
          stats.size = active.size;
        }
      }
    }
    raf = window.requestAnimationFrame(tick);
  };

  function onVisibility() {
    if (disposed || ended || audit) return;
    if (document.visibilityState === "hidden") {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    // Back on the wall clock (the title's CSS timeline never paused).
    drawTimes.length = 0;
    if (!raf) raf = window.requestAnimationFrame(tick);
  }

  if (tier === "webgl" && pass && canvas) {
    host.append(canvas);
    canvas.addEventListener("webglcontextlost", onContextLost);
    layout();
    const active: ShaderPass = pass;
    resizeObserver = new ResizeObserver(() => layout());
    resizeObserver.observe(host);
    // Frame 0 is the ice logo itself: the canvas and the DOM layer swap in one frame.
    draw(0);
    stats.running = true;
    stats.size = active.size;
    lockup.dataset.burn = "webgl";
    setPhase("burning");
    if (!audit) {
      document.addEventListener("visibilitychange", onVisibility);
      raf = window.requestAnimationFrame(tick);
    }
  } else if (tier === "css") {
    lockup.dataset.burn = "css";
    setPhase("burning");
    if (!audit) {
      endTimer = window.setTimeout(() => {
        if (!disposed) setPhase("done");
      }, OPENING_BURN.end * 1000);
    }
  }

  const seek = (T: number) => {
    if (disposed) return;
    elapsed = T;
    if (tier === "webgl") {
      if (T >= OPENING_BURN.handOff[0]) {
        if (!ended) finish();
        return;
      }
      draw(Math.max(0, T));
      return;
    }
    if (tier === "css") setPhase(T >= OPENING_BURN.end ? "done" : "burning");
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    window.clearTimeout(endTimer);
    document.removeEventListener("visibilitychange", onVisibility);
    releaseGl();
    delete lockup.dataset.burn;
    delete lockup.dataset.burnPhase;
  };

  return {
    get tier() {
      return tier;
    },
    stats,
    seek,
    dispose,
  };
}
