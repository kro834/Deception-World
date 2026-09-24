// RE DIVE…?: the transition from RISING THE WORLD's end still into the RE DIVE
// section (re-dive-section.tsx). Framework-free, loaded with import() by
// rising-world.tsx once the end still settles, so neither the World bundle nor
// the RISING engine carries it. It reuses the opening's small WebGL kit
// (ShaderPass: resized ImageBitmaps, parallel shader compile, a
// resolution-first ladder, loseContext() on dispose).
//
// Tiers, by capability (never by device model), as everywhere else:
// - webgl: one full-screen shader (re-dive.frag.glsl) that starts on the end
//   still's own framing, plunges into the art's core through ember speed lines
//   and a darkening tunnel, passes one amber swell and lands on the section's
//   ground (char, its burning lip, ember light);
// - css: the same beats with transform and opacity only, on the end still's
//   own art and the stage's static layers (constrained devices, no WebGL, or
//   WebGL not ready in time);
// - reduced: the ground fades in; nothing moves.
// At RE_DIVE.landed the caller moves the page to the section under the still
// frame and fades the dialog out over it.
import { hasConstrainedResources } from "@/lib/rendering-profile";
import {
  ShaderPass,
  closeGlImage,
  loadGlImage,
  shouldDegrade,
  type GlImage,
} from "@/components/cinematic/opening-gl";
import {
  openingFramesPerDraw,
  pickOpeningTier,
  type OpeningTier,
} from "@/components/cinematic/opening-timing";
import SOURCE from "./re-dive.frag.glsl?raw";
import {
  RE_DIVE,
  RE_DIVE_ART_NATURAL,
  RE_DIVE_CHAR_FROM,
  reDiveEdgeHeight,
  reDiveFraming,
  reDiveUniformsAt,
} from "./re-dive-timing";

export type ReDiveTier = OpeningTier;

const ART_NATURAL = RE_DIVE_ART_NATURAL;
const CHAR_TILE_CSS = 256;
const EDGE_NATURAL = { width: 800, height: 540 };

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

export function currentReDiveTier(): ReDiveTier {
  return pickOpeningTier({
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    constrained: hasConstrainedResources(navigator as NavigatorWithHints),
  });
}

type ReDiveAssets = { art: GlImage; char: GlImage; edge: GlImage };
let prepared: Promise<ReDiveAssets> | null = null;
let preparedKey = "";
let preparedValue: ReDiveAssets | null = null;

/** Idempotent: the art, the char tile and the lip strip as ImageBitmaps. */
export function prepareReDive(art: string, char: string, edge: string) {
  const key = `${art}\n${char}\n${edge}`;
  if (prepared && preparedKey === key) return prepared;
  releaseReDive();
  preparedKey = key;
  const pending: Promise<ReDiveAssets> = Promise.all([
    loadGlImage(art, ART_NATURAL, ART_NATURAL.width),
    loadGlImage(char, { width: CHAR_TILE_CSS, height: CHAR_TILE_CSS }, CHAR_TILE_CSS),
    loadGlImage(edge, EDGE_NATURAL, EDGE_NATURAL.width),
  ]).then(([artImage, charImage, edgeImage]) => {
    const value = { art: artImage, char: charImage, edge: edgeImage };
    if (prepared === pending) preparedValue = value;
    else [artImage, charImage, edgeImage].forEach(closeGlImage);
    return value;
  });
  prepared = pending;
  pending.catch(() => {
    if (prepared === pending) {
      prepared = null;
      preparedKey = "";
    }
  });
  return pending;
}

/** Frees the prepared bitmaps (the next RE DIVE prepares again). */
export function releaseReDive() {
  if (preparedValue) {
    closeGlImage(preparedValue.art);
    closeGlImage(preparedValue.char);
    closeGlImage(preparedValue.edge);
  }
  preparedValue = null;
  prepared = null;
  preparedKey = "";
}

const UNIFORMS = [
  "uRes",
  "uTime",
  "uArtMap",
  "uFeather",
  "uFocus",
  "uZoom",
  "uBlur",
  "uDive",
  "uLift",
  "uWarp",
  "uLand",
  "uCharTile",
  "uEdge",
  "uGroundTop",
] as const;

const COMPACT_BUDGET = 520_000;
const WIDE_BUDGET = 1_200_000;

const isCompact = () =>
  window.matchMedia("(any-pointer: coarse)").matches || window.innerWidth < 760;

export type ReDiveOptions = {
  /** The dialog's RE DIVE stage (.rw-redive): the canvas goes here. */
  stage: HTMLElement;
  art: string;
  char: string;
  edge: string;
  /** Where the section's top will sit at landing (CSS px from the viewport top): under the header. */
  groundTop: number;
  onLanded: () => void;
};

export type ReDiveStats = {
  tier: ReDiveTier;
  fallback: string | null;
  draws: number;
  size: { width: number; height: number; scale: number; rung: number } | null;
  framesPerDraw: number;
};

export type ReDiveRun = {
  readonly tier: ReDiveTier;
  readonly stats: ReDiveStats;
  /** The frame at T seconds, held still (the flash audit). */
  seek: (T: number) => void;
  dispose: () => void;
};

/** Starts the transition inside the stage. */
export function runReDive({
  stage,
  art,
  char,
  edge,
  groundTop,
  onLanded,
}: ReDiveOptions): ReDiveRun {
  let tier = currentReDiveTier();
  // The CSS tiers' ground box starts where the section's top will land.
  stage.style.setProperty("--rw-ground-top", `${Math.max(0, Math.round(groundTop))}px`);
  const stats: ReDiveStats = { tier, fallback: null, draws: 0, size: null, framesPerDraw: 1 };
  let disposed = false;
  let landed = false;
  let raf = 0;
  let pass: ShaderPass | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let animations: Animation[] = [];
  let timers: number[] = [];
  let seeking = false;
  // The clock starts at the first drawn frame (or when the CSS beats start).
  let startedAt = 0;
  let pausedAt = 0;

  const land = () => {
    if (landed || disposed) return;
    landed = true;
    onLanded();
  };

  const find = (selector: string) => stage.querySelector<HTMLElement>(selector);

  // ---- CSS tiers: the stage's static layers, compositor properties only.
  const startCss = (which: "css" | "reduced", reason: string | null) => {
    if (disposed) return;
    tier = which;
    stats.tier = which;
    stats.fallback = reason;
    stage.dataset.tier = which;
    const ground = find(".rw-redive-ground");
    const timing = (
      delay: number,
      duration: number,
      easing = "linear",
    ): KeyframeAnimationOptions => ({
      delay: delay * 1000,
      duration: duration * 1000,
      easing,
      fill: "both",
    });
    if (which === "reduced") {
      if (ground) animations.push(ground.animate([{ opacity: 0 }, { opacity: 1 }], timing(0, 0.6)));
      timers.push(window.setTimeout(land, RE_DIVE.reducedLanded * 1000));
      return;
    }
    // The camera goes into the end still's own art (styles-world-rising.css
    // .rw-end-art, under the stage), so the first frame is the end still itself.
    const endArt = stage.parentElement?.querySelector<HTMLElement>(".rw-end-art") ?? null;
    const lines = find(".rw-redive-lines");
    const glow = find(".rw-redive-glow");
    const { focus } = reDiveFraming(stage.clientWidth || 1, stage.clientHeight || 1);
    const fx = `${(focus.x * 100).toFixed(2)}%`;
    const fy = `${(focus.y * 100).toFixed(2)}%`;
    // The lines and the glow centre on the core (styles-world-re-dive.css).
    stage.style.setProperty("--rw-fx", fx);
    stage.style.setProperty("--rw-fy", fy);
    if (endArt) {
      const origin = `${fx} ${fy}`;
      const base = Number(getComputedStyle(endArt).opacity) || 0.56;
      animations.push(
        endArt.animate(
          [
            { transformOrigin: origin, transform: "scale(1)", opacity: base },
            {
              transformOrigin: origin,
              transform: "scale(1.5)",
              opacity: Math.max(base, 0.82),
              offset: 0.45,
            },
            { transformOrigin: origin, transform: "scale(4.2)", opacity: 0 },
          ],
          timing(
            RE_DIVE.dive[0],
            RE_DIVE.dive[1] - RE_DIVE.dive[0],
            "cubic-bezier(0.55, 0, 0.9, 0.45)",
          ),
        ),
      );
    }
    if (lines) {
      animations.push(
        lines.animate(
          [
            { opacity: 0, transform: "scale(0.35)" },
            { opacity: 0.85, offset: 0.35 },
            { opacity: 0.85, offset: 0.7 },
            { opacity: 0, transform: "scale(2.4)" },
          ],
          timing(0.25, 1.9, "ease-in"),
        ),
      );
    }
    if (glow) {
      animations.push(
        glow.animate(
          [{ opacity: 0 }, { opacity: 0.5, offset: 0.38 }, { opacity: 0 }],
          timing(RE_DIVE.warp[0], RE_DIVE.warp[2] - RE_DIVE.warp[0]),
        ),
      );
    }
    if (ground) {
      animations.push(
        ground.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          timing(RE_DIVE.land[0], RE_DIVE.land[1] - RE_DIVE.land[0]),
        ),
      );
    }
    timers.push(window.setTimeout(land, RE_DIVE.landed * 1000));
  };

  // ---- WebGL tier.
  const applyStatic = () => {
    if (!pass || !canvas) return;
    const width = stage.clientWidth || window.innerWidth;
    const height = stage.clientHeight || window.innerHeight;
    const size = pass.resize(width, height);
    stats.size = size;
    const scale = size.width / width;
    const framing = reDiveFraming(width, height);
    pass.set("uArtMap", ...framing.map);
    pass.set("uFeather", ...framing.feather);
    pass.set("uFocus", framing.focus.x, framing.focus.y);
    pass.set("uCharTile", CHAR_TILE_CSS * scale, CHAR_TILE_CSS * scale);
    // The lip spans the width, like the calm tier's strip.
    pass.set("uEdge", width * scale, reDiveEdgeHeight(width) * scale, RE_DIVE_CHAR_FROM);
    pass.set("uGroundTop", Math.max(0, groundTop) * scale);
  };

  const drawAt = (T: number) => {
    if (!pass) return;
    const u = reDiveUniformsAt(T);
    pass.set("uTime", T);
    pass.set("uZoom", u.zoom);
    pass.set("uBlur", u.blur);
    pass.set("uDive", u.dive);
    pass.set("uLift", u.lift);
    pass.set("uWarp", u.warp);
    pass.set("uLand", u.land);
    pass.draw();
    stats.draws += 1;
  };

  const frameTimes: number[] = [];
  const drawTimes: number[] = [];
  let frame = 0;
  const tick = (now: number) => {
    raf = 0;
    if (disposed || seeking || !pass) return;
    if (pass.lost) {
      land();
      return;
    }
    if (!startedAt) startedAt = now;
    frameTimes.push(now);
    if (frameTimes.length === 9) {
      const intervals = frameTimes.slice(1).map((time, index) => time - frameTimes[index]);
      intervals.sort((a, b) => a - b);
      stats.framesPerDraw = openingFramesPerDraw(intervals[4]);
    }
    const T = (now - startedAt) / 1000;
    if (frame++ % stats.framesPerDraw === 0) {
      drawAt(T);
      drawTimes.push(now);
      const cadence = frameTimes.length >= 9 ? (frameTimes[8] - frameTimes[0]) / 8 : 1000 / 60;
      if (shouldDegrade(drawTimes, cadence, stats.framesPerDraw)) pass.degrade(applyStatic);
    }
    if (T >= RE_DIVE.landed) land();
    // The ground holds (sparks rising) while the dialog fades out over the section.
    if (T < RE_DIVE.landed + RE_DIVE.leave + 0.4) raf = requestAnimationFrame(tick);
  };

  const startGl = async () => {
    const deadline = new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("not-ready")), RE_DIVE.readyTimeoutMs),
    );
    const assets = await Promise.race([prepareReDive(art, char, edge), deadline]);
    if (disposed) return;
    canvas = document.createElement("canvas");
    canvas.className = "rw-redive-canvas";
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      land();
    });
    pass = new ShaderPass(canvas, {
      alpha: false,
      fragment: SOURCE,
      uniforms: UNIFORMS,
      textures: { uArt: assets.art, uChar: assets.char, uEdgeTex: assets.edge },
      budget: isCompact() ? COMPACT_BUDGET : WIDE_BUDGET,
      dprCap: 2,
      startRung: 0,
    });
    await Promise.race([pass.compile(), deadline]);
    if (disposed) return;
    stage.dataset.tier = "webgl";
    stage.append(canvas);
    applyStatic();
    drawAt(0);
    animations.push(
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: RE_DIVE.fadeIn * 1000,
        easing: "ease-out",
        fill: "both",
      }),
    );
    raf = requestAnimationFrame(tick);
  };

  const onResize = () => {
    if (pass) applyStatic();
  };
  const onVisibility = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      pausedAt = performance.now();
      animations.forEach((animation) => animation.pause());
    } else if (pausedAt) {
      if (startedAt) startedAt += performance.now() - pausedAt;
      pausedAt = 0;
      animations.forEach((animation) => animation.play());
      if (pass && !raf && !seeking) raf = requestAnimationFrame(tick);
    }
  };
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);

  stage.dataset.tier = tier;
  if (tier === "webgl") {
    startGl().catch((error: unknown) => {
      if (disposed) return;
      pass?.dispose();
      pass = null;
      canvas?.remove();
      canvas = null;
      startCss("css", error instanceof Error ? error.message : "webgl");
    });
  } else {
    startCss(tier, null);
  }

  return {
    get tier() {
      return tier;
    },
    stats,
    seek(T: number) {
      seeking = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
      if (pass) drawAt(T);
      animations.forEach((animation) => {
        animation.pause();
        animation.currentTime = T * 1000;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
      animations.forEach((animation) => animation.cancel());
      animations = [];
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      pass?.dispose();
      pass = null;
      canvas?.remove();
      canvas = null;
      delete stage.dataset.tier;
    },
  };
}
