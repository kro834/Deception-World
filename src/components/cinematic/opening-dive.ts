// ENTER THE WORLD: the WebGL dive. Framework-free; loaded with import() by
// the title (when it settles, and at pointerdown on the button) and adopted by
// the provider-owned handoff layer (opening-handoff.tsx), which keeps the
// route contract: the shader draws until the camera has broken through into
// the world and settled on the World page's framing; only then is the route
// changed, under that still frame, so the route's main-thread work never
// drops a frame of the dive. The context is released when the layer goes.
import { hasConstrainedResources } from "@/lib/rendering-profile";
import DIVE_SOURCE from "./opening-dive.frag.glsl?raw";
import { ShaderPass, closeGlImage, loadGlImage, shouldDegrade, type GlImage } from "./opening-gl";
import {
  OPENING_DIVE,
  OPENING_DIVE_READY_TIMEOUT_MS,
  diveUniformsAt,
  openingFramesPerDraw,
  pickOpeningTier,
  type OpeningTier,
} from "./opening-timing";

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

export const DIVE_WORLD_ART = "/deception-world-poster-delivery.webp";
export const DIVE_ATMOSPHERE_ART = "/atmosphere-poster.jpg";

/** Where the camera dives: the dark dial inside the ring above サーガ, in the logo box (y down). */
export const DIVE_RING = { x: 0.573, y: 0.315 } as const;

export function currentDiveTier(): OpeningTier {
  return pickOpeningTier({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    constrained: hasConstrainedResources(navigator as NavigatorWithHints),
  });
}

const isCompact = () =>
  window.matchMedia("(any-pointer: coarse)").matches || window.innerWidth < 760;

const UNIFORMS = [
  "uRes",
  "uTime",
  "uZoom",
  "uBlur",
  "uDive",
  "uWarp",
  "uWorld",
  "uWorldZoom",
  "uLand",
  "uBars",
  "uIce",
  "uLogo",
  "uFocus",
  "uAtmoScale",
  "uWorldScale",
  "uBarH",
] as const;

// Render pixels per frame at the top rung. The dive is soft almost throughout
// (zoom blur), so it draws at about phone CSS resolution.
const COMPACT_BUDGET = 520_000;
const WIDE_BUDGET = 1_300_000;
const PRIME_TTL_MS = 1500;

type DiveAssets = { logo: GlImage; atmosphere: GlImage; world: GlImage };

let prepared: Promise<DiveAssets> | null = null;
let preparedKey = "";
let preparedValue: DiveAssets | null = null;

/** Idempotent: the prism logo, the atmosphere still and the world as ImageBitmaps. */
export function prepareOpeningDive(logo: string) {
  if (prepared && preparedKey === logo) return prepared;
  releasePreparedBitmaps();
  preparedKey = logo;
  const pending: Promise<DiveAssets> = Promise.all([
    loadGlImage(logo, { width: 1536, height: 1024 }, 1024),
    loadGlImage(DIVE_ATMOSPHERE_ART, { width: 1280, height: 720 }, 960),
    loadGlImage(DIVE_WORLD_ART, { width: 1024, height: 1536 }, 1024),
  ]).then(
    ([logoImage, atmosphere, world]) => {
      const assets = { logo: logoImage, atmosphere, world };
      if (prepared === pending) preparedValue = assets;
      else [logoImage, atmosphere, world].forEach(closeGlImage);
      return assets;
    },
    (error: unknown) => {
      if (prepared === pending) prepared = null;
      throw error;
    },
  );
  prepared = pending;
  return pending;
}

function releasePreparedBitmaps() {
  const value = preparedValue;
  prepared = null;
  preparedKey = "";
  preparedValue = null;
  if (value) [value.logo, value.atmosphere, value.world].forEach(closeGlImage);
}

type Primed = {
  canvas: HTMLCanvasElement;
  pass: ShaderPass;
  compiled: Promise<void>;
  timer: number;
};

let primed: Primed | null = null;

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "opening-dive-canvas";
  canvas.setAttribute("aria-hidden", "true");
  return canvas;
}

function createPass(canvas: HTMLCanvasElement, assets: DiveAssets) {
  return new ShaderPass(canvas, {
    alpha: false,
    fragment: DIVE_SOURCE,
    uniforms: UNIFORMS,
    textures: { uLogoTex: assets.logo, uAtmo: assets.atmosphere, uWorldTex: assets.world },
    budget: isCompact() ? COMPACT_BUDGET : WIDE_BUDGET,
    dprCap: 1.5,
    startRung: 0,
  });
}

function releasePrimed() {
  const current = primed;
  if (!current) return;
  primed = null;
  window.clearTimeout(current.timer);
  current.pass.dispose();
}

/**
 * Pointer contact on ENTER THE WORLD: the context, the uploads and the
 * (parallel) shader compile start on a detached canvas before the click.
 * Released again if no dive adopts it within PRIME_TTL_MS.
 */
export function primeOpeningDive() {
  if (primed || currentDiveTier() !== "webgl" || !preparedValue) return;
  const canvas = createCanvas();
  let pass: ShaderPass;
  try {
    pass = createPass(canvas, preparedValue);
  } catch {
    return; // no (hardware) WebGL: the dive tries once more, then goes CSS
  }
  const compiled = pass.compile();
  compiled.catch(() => undefined);
  primed = { canvas, pass, compiled, timer: window.setTimeout(releasePrimed, PRIME_TTL_MS) };
}

/** The title unmounted: close unused bitmaps and an unclaimed primed context. */
export function releaseOpeningDivePrepared() {
  releasePrimed();
  releasePreparedBitmaps();
}

export type DiveStats = {
  tier: OpeningTier;
  fallback: string | null;
  primed: boolean;
  readyMs: number | null;
  size: { width: number; height: number; scale: number; rung: number } | null;
  cadenceMs: number | null;
  framesPerDraw: number;
  draws: number;
  drawSpanMs: number | null;
  renderMs: number[];
  rungChanges: { at: number; rung: number }[];
  running: boolean;
  released: boolean;
};

export type DiveRect = { left: number; top: number; width: number; height: number };

export type DiveRunOptions = {
  /** Full-viewport host; the canvas is appended to it. */
  host: HTMLElement;
  /** The title's logo box (visual-viewport local CSS px). */
  logoRect: DiveRect;
  /** The title's letterbox bar height (CSS px). */
  barHeight: number;
  /** Test hook: no clock; seek() draws each frame, release() ends the shader phase. */
  audit?: boolean;
  /** The shader phase ended on the landing frame (the handoff is covered). */
  onLanded: () => void;
};

export type DiveRun = {
  readonly tier: OpeningTier;
  readonly stats: DiveStats;
  /** Resolves with the tier that will play: "webgl", or "css" when GL is not ready in time. */
  readonly ready: Promise<OpeningTier>;
  /** Audit clock: seconds since the dive started drawing. */
  seek: (T: number) => void;
  /** Ends the shader phase now (audit, or the page was hidden): draws the landing frame. */
  land: () => void;
  dispose: () => void;
};

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

export function runOpeningDive({
  host,
  logoRect,
  barHeight,
  audit = false,
  onLanded,
}: DiveRunOptions): DiveRun {
  const openedAt = performance.now();
  let tier: OpeningTier = currentDiveTier();
  const stats: DiveStats = {
    tier,
    fallback: null,
    primed: false,
    readyMs: null,
    size: null,
    cadenceMs: null,
    framesPerDraw: 1,
    draws: 0,
    drawSpanMs: null,
    renderMs: [],
    rungChanges: [],
    running: false,
    released: false,
  };

  let disposed = false;
  let landed = false;
  let pass: ShaderPass | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let raf = 0;
  let startedAt = 0;
  let firstDraw = 0;
  let lastDraw = Number.NEGATIVE_INFINITY;
  let fade: Animation | null = null;
  const frameTimes: number[] = [];
  const drawTimes: number[] = [];

  const layout = () => {
    if (!pass) return;
    const width = Math.max(1, window.visualViewport?.width ?? window.innerWidth);
    const height = Math.max(1, window.visualViewport?.height ?? window.innerHeight);
    stats.size = pass.resize(width, height);
    const aspect = width / height;
    // Screen UV, y up.
    pass.set(
      "uLogo",
      logoRect.left / width,
      1 - (logoRect.top + logoRect.height) / height,
      logoRect.width / width,
      logoRect.height / height,
    );
    pass.set(
      "uFocus",
      (logoRect.left + logoRect.width * DIVE_RING.x) / width,
      1 - (logoRect.top + logoRect.height * DIVE_RING.y) / height,
    );
    const cover = (imageAspect: number): [number, number] =>
      aspect > imageAspect ? [1, imageAspect / aspect] : [aspect / imageAspect, 1];
    pass.set("uAtmoScale", ...cover(1280 / 720));
    pass.set("uWorldScale", ...cover(1024 / 1536));
    pass.set("uBarH", Math.min(0.2, barHeight / height));
  };

  const draw = (T: number) => {
    if (!pass) return;
    const uniforms = diveUniformsAt(T);
    pass.set("uTime", T);
    for (const name of Object.keys(uniforms) as (keyof typeof uniforms)[]) {
      pass.set(name, uniforms[name]);
    }
    pass.draw();
  };

  const releaseGl = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", layout);
    canvas?.removeEventListener("webglcontextlost", onContextLost);
    pass?.dispose();
    pass = null;
    canvas?.remove();
    canvas = null;
    stats.running = false;
    stats.released = true;
  };

  const land = () => {
    if (landed || disposed) return;
    landed = true;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener("visibilitychange", onVisibility);
    if (pass) {
      // The landing frame stays on the canvas while the route changes under it.
      draw(OPENING_DIVE.glEnd);
      stats.drawSpanMs = firstDraw ? Number((performance.now() - firstDraw).toFixed(1)) : null;
      stats.running = false;
      if (canvas && !audit && typeof canvas.animate === "function") {
        // A slow push-in on the compositor keeps the still frame alive.
        canvas.animate([{ transform: "scale(1)" }, { transform: "scale(1.025)" }], {
          duration: 1600,
          easing: "ease-in-out",
          fill: "forwards",
        });
      }
    }
    onLanded();
  };

  function onContextLost(event: Event) {
    event.preventDefault();
    stats.fallback = "context-lost";
    // The layer's own cover stays; the route goes on under it.
    releaseGl();
    land();
  }

  function onVisibility() {
    // Hidden mid-dive: skip to the landing frame (the handoff settles as well).
    if (document.visibilityState === "hidden") land();
  }

  const tick = (now: number) => {
    raf = 0;
    if (disposed || landed) return;
    const T = (now - startedAt) / 1000;
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
    if (T >= OPENING_DIVE.glEnd) {
      land();
      return;
    }
    const cadence = stats.cadenceMs;
    const interval = cadence === null ? 15.5 : stats.framesPerDraw * cadence - cadence / 2;
    if (pass && now - lastDraw >= interval) {
      lastDraw = now;
      if (!firstDraw) firstDraw = now;
      stats.draws += 1;
      const started = performance.now();
      draw(T);
      stats.renderMs.push(performance.now() - started);
      drawTimes.push(now);
      if (shouldDegrade(drawTimes, stats.cadenceMs, stats.framesPerDraw)) {
        const active = pass;
        if (active.degrade(layout)) {
          stats.rungChanges.push({ at: Number(T.toFixed(2)), rung: active.rung });
        }
      }
    }
    raf = window.requestAnimationFrame(tick);
  };

  const ready = (async (): Promise<OpeningTier> => {
    if (tier !== "webgl") return tier;
    const deadline = openedAt + (audit ? 5000 : OPENING_DIVE_READY_TIMEOUT_MS);
    try {
      let compiled: Promise<void>;
      const current = primed;
      if (current) {
        primed = null;
        window.clearTimeout(current.timer);
      }
      if (current && !current.pass.lost) {
        stats.primed = true;
        canvas = current.canvas;
        pass = current.pass;
        compiled = current.compiled;
      } else {
        current?.pass.dispose();
        const assets = await withDeadline(
          preparedValue
            ? Promise.resolve(preparedValue)
            : (prepared ?? Promise.reject(new Error("not-prepared"))),
          deadline,
        );
        if (disposed) throw new Error("disposed");
        canvas = createCanvas();
        pass = createPass(canvas, assets);
        compiled = pass.compile();
        compiled.catch(() => undefined);
      }
      await withDeadline(compiled, deadline);
      if (disposed) throw new Error("disposed");
      // In GPU memory: the decoded copies can go.
      releasePreparedBitmaps();
      const active: ShaderPass = pass;
      const target: HTMLCanvasElement = canvas;
      host.append(target);
      target.addEventListener("webglcontextlost", onContextLost);
      layout();
      window.addEventListener("resize", layout, { passive: true });
      // Frame 0 is the title's own framing, faded in over the DOM title.
      draw(0);
      stats.size = active.size;
      stats.readyMs = Number((performance.now() - openedAt).toFixed(1));
      if (typeof target.animate === "function") {
        const [from, to] = OPENING_DIVE.fadeIn;
        fade = target.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: from * 1000,
          duration: (to - from) * 1000,
          easing: "ease-out",
          fill: "both",
        });
        if (audit) fade.pause();
      }
      if (!audit) {
        stats.running = true;
        startedAt = performance.now();
        document.addEventListener("visibilitychange", onVisibility);
        raf = window.requestAnimationFrame(tick);
      }
      return "webgl";
    } catch (error) {
      releaseGl();
      if (disposed) return tier;
      stats.fallback = error instanceof Error ? error.message.slice(0, 120) : "error";
      tier = "css";
      stats.tier = tier;
      return tier;
    }
  })();

  const seek = (T: number) => {
    if (disposed || landed || !pass) return;
    if (fade) fade.currentTime = Math.max(0, T) * 1000;
    if (T >= OPENING_DIVE.glEnd) {
      land();
      return;
    }
    stats.draws += 1;
    draw(Math.max(0, T));
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibility);
    fade?.cancel();
    releaseGl();
  };

  return {
    get tier() {
      return tier;
    },
    stats,
    ready,
    seek,
    land,
    dispose,
  };
}
