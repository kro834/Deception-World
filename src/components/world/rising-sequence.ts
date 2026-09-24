// RISING THE WORLD: the sequence controller. Framework-free: it picks the
// tier, plays the portal, starts WebGL when it is ready in time, drives the
// WAAPI title and fades from one clock, and releases everything at the end.
// Loaded with import() from the gate (rising-world.tsx).
import { hasConstrainedResources } from "@/lib/rendering-profile";
import {
  FireRenderer,
  prepareRisingAssets,
  preparedRisingAssets,
  releaseRisingAssets,
} from "./rising-fire";
import {
  RISING_CALM_CHAR,
  RISING_CALM_EDGES,
  RISING_CALM_FLAMES,
  RISING_CALM_SCORCHES,
  RISING_CALM_SMOKE,
} from "./rising-art";
import { CALM_FLAME_SEATS } from "./rising-calm";
import {
  RISING_ART_ASPECT,
  RISING_FLASHBACK_OPACITY,
  RISING_FLASHBACK_WINDOW,
  RISING_READY_TIMEOUT_MS,
  RISING_TIMING,
  RISING_WORLD_FOCUS,
  RISING_WORLD_POSITION,
  pickRisingTier,
  portalEase,
  risingFlashbackSlot,
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

const CALM_SPRITES = [
  ...RISING_CALM_FLAMES,
  ...RISING_CALM_EDGES,
  ...RISING_CALM_SCORCHES,
  RISING_CALM_CHAR,
  RISING_CALM_SMOKE,
];

/**
 * Warms what the run will need before the press: resized ImageBitmaps for the
 * WebGL tier, decoded images for the calm tiers (the portal shows the key
 * visual in every tier), and the calm fire's sprites for the CSS tier (a
 * WebGL run that falls back loads them lazily). Idempotent.
 */
export function prepareRising(world: string, rider: string) {
  const images = Promise.all([decode(world), decode(rider)]);
  const tier = currentRisingTier();
  if (tier === "webgl") {
    return Promise.all([images, prepareRisingAssets(world, rider)]).then(() => undefined);
  }
  if (tier === "css") for (const sprite of CALM_SPRITES) void decode(sprite);
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

/** The gate unmounted: drop a primed context and close the prepared bitmaps. */
export function releaseRising() {
  releasePrimed();
  releaseRisingAssets();
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
  /** The GPU probe's burn frame (both passes), ms; null when it could not run. */
  probeMs: number | null;
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
// Portal samples: scale x counter-scale stays within about 1% between them.
const PORTAL_STEPS = 32;

/**
 * Where the dive's focal point (RISING_WORLD_FOCUS) sits on screen, as a
 * fraction of the height, for the calm tier's cover-fitted <img> framed by
 * RISING_WORLD_POSITION: the zoom closes in on the same spot as the shader.
 */
function calmFocusY() {
  const screen = window.innerWidth / Math.max(1, window.innerHeight);
  const visible = Math.min(1, RISING_ART_ASPECT / screen); // fraction of the art's height shown
  const top = RISING_WORLD_POSITION[1] * (1 - visible);
  return Math.min(1, Math.max(0, (1 - RISING_WORLD_FOCUS[1] - top) / visible));
}

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
  const flashback = find(".rw-flashback");
  const calmBurn = find(".rw-calm-burn");
  const calmFlames = find(".rw-calm-flames");
  const calmSmoke = find(".rw-calm-smoke");
  const edge = [find(".rw-calm-scorch"), find(".rw-calm-char"), find(".rw-calm-flames")];
  const reformed = [...viewport.querySelectorAll<HTMLElement>('.rw-calm-edge[data-profile="1"]')];
  const puffs = [...viewport.querySelectorAll<HTMLElement>(".rw-calm-smoke img")];
  const seats = [...viewport.querySelectorAll<HTMLElement>(".rw-calm-flames i")];
  const embers = [...viewport.querySelectorAll<HTMLElement>(".rw-calm-embers i")];

  let tier = currentRisingTier();
  const openedAt = performance.now();
  const stats: RisingStats = {
    tier,
    fallback: null,
    primed: false,
    readyMs: null,
    clockStartMs: null,
    size: null,
    probeMs: null,
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

  // ---- Portal: the key visual bursts out of the button. A round element
  // scales up from the button's size until it covers the screen, and the key
  // visual inside it is counter-scaled on the same samples, so the circle opens
  // like an iris over a still image: transform only, so the compositor keeps it
  // smooth while the main thread restyles the page for the open dialog and GL
  // gets ready. The image sits exactly where the full-screen cover image will
  // be, so the hand-over to the canvas (or the calm layer) is seamless.
  // Reduced motion: a plain fade.
  const portalSeconds = tier === "reduced" ? REDUCED_FADE_SECONDS : RISING_TIMING[tier].portal;
  let portal: Animation | null = null;
  let portalIris: Animation | null = null;
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
    // The ease-in (portalEase), sampled: linear between the samples.
    const scales = Array.from(
      { length: PORTAL_STEPS + 1 },
      (_, index) => from + (1 - from) * portalEase(index / PORTAL_STEPS),
    );
    const timing = { duration: portalSeconds * 1000, easing: "linear", fill: "forwards" } as const;
    portal = portalElement.animate(
      scales.map((scale, index) => ({
        offset: index / PORTAL_STEPS,
        transform: `scale(${scale.toFixed(5)})`,
      })),
      timing,
    );
    if (portalArt) {
      portalArt.style.transformOrigin = `${ox}px ${oy}px`; // the circle's centre
      portalIris = portalArt.animate(
        scales.map((scale, index) => ({
          offset: index / PORTAL_STEPS,
          transform: `scale(${(1 / scale).toFixed(5)})`,
        })),
        timing,
      );
    }
  }
  if (audit) {
    portal?.pause();
    portalIris?.pause();
  }
  const portalDone = portal
    ? portal.finished.then(
        () => undefined,
        () => undefined,
      )
    : Promise.resolve();

  const add = (
    element: HTMLElement | null,
    keyframes: Keyframe[],
    options: { delay: number; duration: number; easing?: string; fill?: FillMode },
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
    const flashTier = tier;
    if (flashTier !== "reduced" && flashback) {
      // The flashback: one layer at a memory's strength, its scenes
      // cross-fading one into the next, each settling from a slight push-in.
      const scenes = [...flashback.querySelectorAll<HTMLElement>("img")];
      const [start, end] = RISING_FLASHBACK_WINDOW[flashTier];
      add(
        flashback,
        [
          { opacity: 0 },
          { opacity: RISING_FLASHBACK_OPACITY, offset: 0.08 },
          { opacity: RISING_FLASHBACK_OPACITY, offset: 0.92 },
          { opacity: 0 },
        ],
        { delay: ms(start), duration: ms(end - start), easing: "linear" },
      );
      scenes.forEach((scene, index) => {
        const slot = risingFlashbackSlot(flashTier, index, scenes.length);
        add(
          scene,
          [
            { opacity: 0, scale: 1.08 },
            { opacity: 1, scale: 1.04, offset: 0.5 },
            { opacity: 0, scale: 1 },
          ],
          { delay: ms(slot.from), duration: ms(slot.to - slot.from), easing: "ease-in-out" },
        );
      });
    }
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
      // The dive closes in on the rider's chest core (RISING_WORLD_FOCUS),
      // wherever the cover crop puts it on this screen.
      if (calmWorld) calmWorld.style.transformOrigin = `50% ${(calmFocusY() * 100).toFixed(1)}%`;
      add(calmWorld, [{ scale: 1 }, { scale: 1.32 }], {
        delay: 0,
        duration: ms(s.breakthrough),
        easing: "cubic-bezier(0.5, 0, 0.75, 0)",
      });
      const burn = s.burnEnd - s.burnStart;
      add(calmBurn, [{ translate: "0 58%" }, { translate: "0 -42%" }], {
        delay: ms(s.burnStart),
        duration: ms(burn),
        easing: "linear",
      });
      // The edge (and the flames seated on it) drifts sideways as it
      // climbs, so the front shifts across the print instead of rising as
      // a stamped shape.
      for (const element of edge) {
        add(element, [{ translate: "-3% 1.5%" }, { translate: "3% -1.5%" }], {
          delay: ms(s.burnStart),
          duration: ms(burn),
        });
      }
      // Halfway up, the front re-forms: a second strip (and its scorch)
      // fades in over the first, drawn wherever either of two profiles has
      // burned further (rising-calm.ts), so it only ever burns forward; each
      // flame seat slides up onto the new lip. The silhouette is never
      // recognised as one shape climbing the print.
      const reform = { delay: ms(s.burnStart + burn * 0.3), duration: 800, easing: "ease-in-out" };
      for (const element of reformed) add(element, [{ opacity: 0 }, { opacity: 1 }], reform);
      // The seats' box is 56% of the burn layer, which is 120% of the frame.
      const stretch = window.matchMedia("(min-aspect-ratio: 1/1)").matches ? 1.3 : 1;
      seats.forEach((seat, index) => {
        const place = CALM_FLAME_SEATS[index];
        if (!place) return;
        const shift = (((place.dipB - place.dip) / 100) * 56 * 1.2 * stretch).toFixed(2);
        add(seat, [{ translate: "-50% 0" }, { translate: `-50% ${shift}cqh` }], reform);
      });
      // The fire takes hold, burns, and dies down with the settle.
      const span = s.settle[1] - s.burnStart;
      add(
        calmFlames,
        [
          { offset: 0, opacity: 0 },
          { offset: 0.5 / span, opacity: 1 },
          { offset: (s.settle[0] - s.burnStart) / span, opacity: 1 },
          { offset: 1, opacity: 0.3 },
        ],
        { delay: ms(s.burnStart), duration: ms(span) },
      );
      add(
        calmSmoke,
        [
          { offset: 0, opacity: 0 },
          { offset: 0.2, opacity: 1 },
          { offset: 1, opacity: 0.6 },
        ],
        { delay: ms(s.burnStart), duration: ms(span) },
      );
      // Billows well up off the flames, swell and thin out, one after another.
      puffs.forEach((puff, index) => {
        const rise = 2.1 + (index % 2) * 0.5;
        const count = Math.max(1, Math.floor((burn - 0.2) / rise));
        for (let round = 0; round < count; round += 1) {
          // One billow per element at a time: each round is its own animation,
          // and only the first fills backwards (a later round's backward fill
          // would hide the one playing).
          const at = s.burnStart + 0.2 + index * (rise / puffs.length) + round * rise;
          if (at + rise > s.settle[1]) break;
          const drift = (index % 2 ? 1 : -1) * (6 + 4 * round);
          add(
            puff,
            [
              { offset: 0, opacity: 0, translate: "0 14%", scale: 0.5, rotate: "0deg" },
              { offset: 0.3, opacity: 0.85, translate: `${drift / 3}% -16%`, scale: 0.85 },
              {
                offset: 1,
                opacity: 0,
                translate: `${drift}% -70%`,
                scale: 1.55,
                rotate: `${drift}deg`,
              },
            ],
            {
              delay: ms(at),
              duration: ms(rise),
              easing: "cubic-bezier(0.3, 0.3, 0.5, 1)",
              fill: round ? "forwards" : "both",
            },
          );
        }
      });
      // Flames: each seat's two sprite frames take turns. A frame fades in
      // low and small, holds, and fades out higher and taller, so the fire
      // flows upwards (fake advection) and re-forms as the frames swap; the
      // two overlap, so a seat never goes dark. Every seat has its own beat
      // and sway: the row never pulses together.
      seats.forEach((seat, index) => {
        const cycle = 0.6 + 0.3 * ((index * 0.618) % 1);
        const lean = (index % 3) - 1;
        seat.querySelectorAll("img").forEach((frame, turn) => {
          const keyframes: Keyframe[] = [];
          const span = burn;
          for (let start = (turn - 1) * cycle * 0.5; start < span; start += cycle) {
            const beat = Math.round(start / cycle) + index;
            const sway = Math.sin(beat * 1.9 + index) * 4 + lean * 2;
            const wide = 0.92 + 0.12 * Math.abs(Math.sin(beat * 1.3 + index * 0.7));
            const tall = 0.9 + 0.2 * Math.abs(Math.cos(beat * 0.9 + index));
            const point = (at: number, keyframe = {} as Keyframe) => {
              const t = start + at * cycle;
              if (t < 0 || t > span) return;
              keyframes.push({ ...keyframe, offset: Number((t / span).toFixed(4)) });
            };
            point(0, {
              opacity: 0,
              translate: "0 5%",
              scale: `${(wide * 0.94).toFixed(3)} ${(tall * 0.88).toFixed(3)}`,
              rotate: `${(sway * 0.5).toFixed(1)}deg`,
            });
            point(0.3, { opacity: 1 });
            point(0.7, { opacity: 1 });
            point(1, {
              opacity: 0,
              translate: "0 -7%",
              scale: `${wide.toFixed(3)} ${(tall * 1.1).toFixed(3)}`,
              rotate: `${sway.toFixed(1)}deg`,
            });
          }
          if (keyframes.length < 2) return;
          if (keyframes[0].offset !== 0) keyframes.unshift({ ...keyframes[0], offset: 0 });
          if (keyframes.at(-1)?.offset !== 1) keyframes.push({ ...keyframes.at(-1), offset: 1 });
          add(frame, keyframes, { delay: ms(s.burnStart), duration: ms(span), easing: "linear" });
        });
      });
      // Embers leave the front where it is when they are thrown (the burn
      // layer climbs linearly: its lip crosses the frame from 119.6% to 0%),
      // wander on the draught and burn out as they climb.
      embers.forEach((ember, index) => {
        const rise = 1.5 + (index % 3) * 0.35;
        const at =
          s.burnStart + 0.3 + ((index * 5) % embers.length) * ((burn - rise) / embers.length);
        const lip = Math.max(2, ((at - s.burnStart) / burn) * 120 - 20);
        // Waypoints [x px, height vh] and the heading between them (a vh is
        // about 9 px), so each streak leans along its path.
        const path = [0, 0.35, 0.7, 1].map((step) => [
          Math.round(
            Math.sin(index * 2.7 + step * 4.2) * 26 * step + step * (index % 2 ? 14 : -14),
          ),
          lip + 44 * step,
        ]);
        const at2 = (index2: number) => `${path[index2][0]}px -${path[index2][1].toFixed(1)}vh`;
        const heading = (index2: number) => {
          const [x0, y0] = path[index2];
          const [x1, y1] = path[index2 + 1];
          return `${((Math.atan2(x1 - x0, (y1 - y0) * 9) * 180) / Math.PI).toFixed(0)}deg`;
        };
        add(
          ember,
          [
            { offset: 0, opacity: 0, translate: at2(0), rotate: heading(0) },
            { offset: 0.1, opacity: 1 },
            { offset: 0.35, translate: at2(1), rotate: heading(1) },
            { offset: 0.7, opacity: 0.8, translate: at2(2), rotate: heading(2) },
            { offset: 1, opacity: 0, translate: at2(3) },
          ],
          { delay: ms(at), duration: ms(rise), easing: "cubic-bezier(0.3, 0.5, 0.6, 1)" },
        );
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
    portalIris?.finish();
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
      if (portalIris) portalIris.currentTime = portal.currentTime;
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
        active.render(0); // warm the dive
        // Time a burn frame and pick the rung that fits, while the portal
        // still covers the screen.
        stats.probeMs = await active.probe();
        if (stale()) return;
        // The probe yields between its steps, before the listener below
        // exists: a context lost meanwhile falls back to the calm tier
        // instead of playing the run on a dead canvas.
        if (active.lost) throw new Error("context-lost");
        active.render(0); // the canvas holds frame 0 when it appears
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
    portalIris?.cancel();
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
