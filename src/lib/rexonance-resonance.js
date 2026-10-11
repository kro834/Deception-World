import {
  FORM_LANDMARKS,
  FORM_TONES,
  drawOverwrite,
  planOverwrite,
  sampleCells,
  warpPicture,
} from "./rexonance-overwrite.js";
import { splitLights } from "./rexonance-unlit.js";
/** RESONANCE (rx11) for /rexonance-saga: the hits a stylesheet cannot time.
 *
 * Counts. Every [data-rsn-count] figure keeps the owner's value as its own
 * text at all times. Its aria-hidden .rsn-count overlay mirrors it and counts
 * its digits once from zero to that value when the figure is well inside the
 * view: slow at first and fastest at the end, then it locks. The stylesheet
 * reads data-rsn-state on the figure ("armed" while it waits, "count",
 * "lock" for the punch, then "done", which hands the figure back to its own
 * text) and data-rsn-hit on the figure's parent (its ring burst).
 *
 * Transient hits. Each is an attribute the stylesheet animates from and this
 * script removes once it has played, so a menu or dialog closing (the motion
 * gate coming back) never replays a finished hit:
 * - data-rsn-hit on a locked figure's parent (the armour's core no longer
 *   rings with each lock: owner, 2026-10-11, it pulsed again and again on
 *   an iPad);
 * - data-rsn-arrive on the page, once, when the cover has handed over;
 * - data-rsn-form on the stage panel when a new form is drawn;
 * - data-rsn-in on a scene as it comes into view, only where scroll
 *   timelines are missing (their time-based fallback).
 *
 * Pointer. On fine pointers the hero stage and the form scene lean toward
 * the pointer: --rsn-px and --rsn-py (-1 to 1) on those two hosts only, eased
 * in one requestAnimationFrame loop that stops once it has settled, written
 * only while the host is in view.
 *
 * Nothing runs under reduced motion, economy rendering, Save-Data or 2G, or
 * while the page is hidden; a count cut short ends on its value. Cleanup
 * releases every listener, observer and timer and hands each figure back
 * exactly as it was rendered.
 */
const COUNT_MS = 900;
const READOUT_MS = 700;
const LOCK_MS = 560;
const HIT_MS = 1250;
const ARRIVE_MS = 2500;
const FORM_MS = 1800;
const SCENE_MS = 1800;
const EASE = 0.085;
const SETTLED = 0.002;
// ZENITH (rx15): the trinity's rings fall into phase on the same flag.
const SCENES =
  ".rxs-section-heading, .rxs-p14-overview, .rxs-system-grid, .rzn-trinity, .rxs-footer";

/** The number inside a figure's text and how to print it at any value. */
export function countTemplate(text) {
  const match = /\d[\d,]*(?:\.\d+)?/.exec(text);
  if (!match) return null;
  const run = match[0];
  const [whole, fraction = ""] = run.split(".");
  const digits = whole.replace(/,/g, "");
  return {
    prefix: text.slice(0, match.index),
    suffix: text.slice(match.index + run.length),
    width: digits.length,
    decimals: fraction.length,
    grouped: whole.includes(","),
    value: Number(fraction ? `${digits}.${fraction}` : digits),
  };
}

/** The figure at `current`, padded to the final width so nothing reflows. */
export function formatCount(template, current) {
  const value = Math.min(template.value, Math.max(0, current));
  const [whole, fraction] = value.toFixed(template.decimals).split(".");
  let printed = whole.padStart(template.width, "0");
  if (template.grouped) printed = printed.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${template.prefix}${printed}${fraction ? `.${fraction}` : ""}${template.suffix}`;
}

// Calm, then the hit: the count gathers and is fastest as it locks.
const charge = (t) => 0.35 * t + 0.65 * t * t * t;

export function mountRexonanceResonance(page, environment = window) {
  if (!page) return () => {};
  const document = page.ownerDocument;
  const html = document.documentElement;
  const reduced = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = environment.matchMedia("(hover: hover) and (pointer: fine)");
  const forcedColors = environment.matchMedia("(forced-colors: active)");
  const connection = environment.navigator?.connection;
  const timelines = Boolean(
    environment.CSS?.supports?.("animation-timeline", "view()") &&
    environment.CSS.supports("animation-range", "entry 0% entry 100%"),
  );
  const clock = () => environment.performance.now();
  let disposed = false;

  const motionAllowed = () => {
    const constrained =
      Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    return !reduced.matches && !constrained && html.dataset.worldEffects !== "economy";
  };

  /* ---------------- transient attributes ---------------- */
  const flags = new Map();
  const flag = (element, name, value, ms) => {
    if (!element) return;
    let timers = flags.get(element);
    if (!timers) flags.set(element, (timers = new Map()));
    environment.clearTimeout(timers.get(name));
    element.setAttribute(name, value);
    timers.set(
      name,
      environment.setTimeout(() => {
        timers.delete(name);
        if (!disposed) element.removeAttribute(name);
      }, ms),
    );
  };
  const clearFlags = () => {
    for (const [element, timers] of flags) {
      for (const [name, timer] of timers) {
        environment.clearTimeout(timer);
        element.removeAttribute(name);
      }
    }
    flags.clear();
  };

  /* ---------------- counts ---------------- */
  const figures = [];
  for (const host of page.querySelectorAll("[data-rsn-count]")) {
    const overlay = host.querySelector(".rsn-count");
    const node = overlay
      ? [...overlay.childNodes].find((child) => child.nodeType === 3 && /\d/.test(child.data))
      : null;
    const template = node ? countTemplate(node.data) : null;
    if (!template) continue;
    figures.push({
      host,
      node,
      rendered: node.data,
      template,
      duration: host.closest(".rxs-headline-metrics") ? COUNT_MS : READOUT_MS,
      state: "idle",
      start: 0,
      printed: node.data,
      lockTimer: 0,
    });
  }
  const byHost = new Map(figures.map((figure) => [figure.host, figure]));
  const queued = new Set();
  let countFrame = 0;

  const print = (figure, text) => {
    if (figure.printed === text) return;
    figure.printed = text;
    figure.node.data = text;
  };
  const setState = (figure, state) => {
    figure.state = state;
    if (state === "idle") figure.host.removeAttribute("data-rsn-state");
    else figure.host.dataset.rsnState = state;
  };
  // Ends a count on its own value: no punch and no ring.
  const settle = (figure) => {
    environment.clearTimeout(figure.lockTimer);
    figure.lockTimer = 0;
    print(figure, figure.rendered);
    setState(figure, "done");
  };
  const lock = (figure) => {
    print(figure, figure.rendered);
    setState(figure, "lock");
    flag(figure.host.parentElement, "data-rsn-hit", "true", HIT_MS);
    figure.lockTimer = environment.setTimeout(() => {
      figure.lockTimer = 0;
      if (!disposed) setState(figure, "done");
    }, LOCK_MS);
  };
  const tick = () => {
    countFrame = 0;
    if (disposed || document.hidden) return;
    const at = clock();
    let running = false;
    for (const figure of figures) {
      if (figure.state !== "count") continue;
      const progress = Math.min(1, (at - figure.start) / figure.duration);
      if (progress >= 1) {
        lock(figure);
        continue;
      }
      print(figure, formatCount(figure.template, figure.template.value * charge(progress)));
      running = true;
    }
    if (running) countFrame = environment.requestAnimationFrame(tick);
  };
  let countObserver = null;
  const begin = (figure) => {
    if (figure.state !== "armed") return;
    if (html.hasAttribute("data-loading")) {
      // Under a route cover: count once the page has been handed over.
      queued.add(figure);
      return;
    }
    queued.delete(figure);
    countObserver?.unobserve(figure.host);
    figure.start = clock();
    setState(figure, "count");
    if (!countFrame) countFrame = environment.requestAnimationFrame(tick);
  };
  if (environment.IntersectionObserver && figures.length) {
    countObserver = new environment.IntersectionObserver(
      (entries) => {
        if (disposed || document.hidden) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const figure = byHost.get(entry.target);
          if (figure) begin(figure);
        }
      },
      { threshold: 0.35, rootMargin: "0px 0px -8% 0px" },
    );
  }
  const arm = () => {
    // Forced colours paint the figures' own text; the counters never show.
    if (!countObserver || forcedColors.matches) return;
    for (const figure of figures) {
      if (figure.state !== "idle") continue;
      setState(figure, "armed");
      print(figure, formatCount(figure.template, 0));
      countObserver.observe(figure.host);
    }
  };
  const stopCounts = () => {
    if (countFrame) environment.cancelAnimationFrame(countFrame);
    countFrame = 0;
    for (const figure of figures) {
      if (figure.state === "count" || figure.state === "lock") settle(figure);
    }
  };
  // Motion withdrawn: every figure is its own text again, at once.
  const disarm = () => {
    stopCounts();
    countObserver?.disconnect();
    queued.clear();
    for (const figure of figures) {
      if (figure.state !== "armed") continue;
      print(figure, figure.rendered);
      setState(figure, "idle");
    }
  };
  // Back from hiding: observe again, so a figure already on screen gets its
  // initial intersection and counts.
  const reobserve = () => {
    for (const figure of figures) {
      if (figure.state !== "armed" || queued.has(figure)) continue;
      countObserver?.unobserve(figure.host);
      countObserver?.observe(figure.host);
    }
  };

  /* ---------------- arrival, form, scenes ---------------- */
  let arrived = false;
  const arrive = () => {
    if (arrived || html.hasAttribute("data-loading")) return;
    arrived = true;
    flag(page, "data-rsn-arrive", "true", ARRIVE_MS);
  };
  const panel = page.querySelector("#rxs-stage-panel");
  let shownFigure = panel?.querySelector("figure") ?? null;
  const formObserver = panel
    ? new environment.MutationObserver(() => {
        const current = panel.querySelector("figure");
        if (!current || current === shownFigure) return;
        shownFigure = current;
        if (motionAllowed() && !document.hidden) flag(panel, "data-rsn-form", "true", FORM_MS);
      })
    : null;
  formObserver?.observe(panel, { childList: true });
  const scenes = timelines ? [] : [...page.querySelectorAll(SCENES)];
  const playedScenes = new Set();
  const sceneObserver =
    scenes.length && environment.IntersectionObserver
      ? new environment.IntersectionObserver((entries) => {
          if (disposed || document.hidden || !motionAllowed()) return;
          for (const entry of entries) {
            if (!entry.isIntersecting || playedScenes.has(entry.target)) continue;
            playedScenes.add(entry.target);
            sceneObserver.unobserve(entry.target);
            flag(entry.target, "data-rsn-in", "true", SCENE_MS);
          }
        })
      : null;
  const watchScenes = () => {
    for (const scene of scenes) if (!playedScenes.has(scene)) sceneObserver?.observe(scene);
  };

  /* ---------------- pointer ---------------- */
  const hosts = [page.querySelector(".rxs-hero-visual"), panel]
    .filter(Boolean)
    .map((element) => ({ element, inView: false, written: "" }));
  let pointerFrame = 0;
  let pointerOn = false;
  let targetX = 0;
  let targetY = 0;
  let x = 0;
  let y = 0;
  // Writes only a changed lean: each write restyles the host's subtree.
  const write = (host) => {
    const px = x.toFixed(3);
    const py = y.toFixed(3);
    if (host.written === `${px} ${py}`) return;
    host.element.style.setProperty("--rsn-px", px);
    host.element.style.setProperty("--rsn-py", py);
    host.written = `${px} ${py}`;
  };
  const clear = (host) => {
    host.element.style.removeProperty("--rsn-px");
    host.element.style.removeProperty("--rsn-py");
    host.written = "";
  };
  const lean = () => {
    pointerFrame = 0;
    if (disposed || !pointerOn || document.hidden) return;
    x += (targetX - x) * EASE;
    y += (targetY - y) * EASE;
    const settled = Math.abs(targetX - x) < SETTLED && Math.abs(targetY - y) < SETTLED;
    if (settled) {
      x = targetX;
      y = targetY;
    }
    for (const host of hosts) if (host.inView) write(host);
    if (!settled) pointerFrame = environment.requestAnimationFrame(lean);
  };
  const wake = () => {
    if (!pointerFrame && pointerOn && !document.hidden)
      pointerFrame = environment.requestAnimationFrame(lean);
  };
  const onPointerMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const width = environment.innerWidth || 1;
    const height = environment.innerHeight || 1;
    targetX = Math.max(-1, Math.min(1, (event.clientX / width) * 2 - 1));
    targetY = Math.max(-1, Math.min(1, (event.clientY / height) * 2 - 1));
    wake();
  };
  const onPointerOut = (event) => {
    if (event.relatedTarget) return;
    targetX = 0;
    targetY = 0;
    wake();
  };
  const hostObserver =
    environment.IntersectionObserver && hosts.length
      ? new environment.IntersectionObserver((entries) => {
          for (const entry of entries) {
            const host = hosts.find((item) => item.element === entry.target);
            if (host) host.inView = entry.isIntersecting;
          }
          wake();
        })
      : null;
  const pointerStart = () => {
    if (pointerOn || !hostObserver) return;
    pointerOn = true;
    for (const host of hosts) hostObserver.observe(host.element);
    environment.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
  };
  const pointerStop = () => {
    if (pointerFrame) environment.cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    if (!pointerOn) return;
    pointerOn = false;
    hostObserver?.disconnect();
    environment.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerout", onPointerOut);
    targetX = targetY = x = y = 0;
    for (const host of hosts) {
      host.inView = false;
      if (host.written) clear(host);
    }
  };

  /* ---------------- lifecycle ---------------- */
  const sync = () => {
    if (disposed) return;
    if (!motionAllowed()) {
      disarm();
      pointerStop();
      sceneObserver?.disconnect();
      clearFlags();
      return;
    }
    if (document.hidden) {
      stopCounts();
      if (pointerFrame) environment.cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      return;
    }
    arm();
    reobserve();
    watchScenes();
    if (!html.hasAttribute("data-loading")) {
      arrive();
      [...queued].forEach(begin);
    }
    if (finePointer.matches) pointerStart();
    else pointerStop();
  };
  // Forced colours switched on: hand the figures back, as for reduced motion.
  const onForcedColors = () => {
    if (forcedColors.matches) disarm();
    sync();
  };
  const onPageHide = () => {
    stopCounts();
    pointerStop();
  };
  const htmlObserver = new environment.MutationObserver(sync);
  htmlObserver.observe(html, {
    attributes: true,
    attributeFilter: ["data-world-effects", "data-loading"],
  });
  reduced.addEventListener?.("change", sync);
  finePointer.addEventListener?.("change", sync);
  forcedColors.addEventListener?.("change", onForcedColors);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", sync);
  sync();

  return () => {
    disposed = true;
    htmlObserver.disconnect();
    formObserver?.disconnect();
    sceneObserver?.disconnect();
    reduced.removeEventListener?.("change", sync);
    finePointer.removeEventListener?.("change", sync);
    forcedColors.removeEventListener?.("change", onForcedColors);
    connection?.removeEventListener?.("change", sync);
    document.removeEventListener("visibilitychange", sync);
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", sync);
    pointerStop();
    if (countFrame) environment.cancelAnimationFrame(countFrame);
    countFrame = 0;
    countObserver?.disconnect();
    clearFlags();
    for (const figure of figures) {
      environment.clearTimeout(figure.lockTimer);
      print(figure, figure.rendered);
      figure.host.removeAttribute("data-rsn-state");
    }
  };
}

/* =====================================================================
   ZENITH (rx15): the suit-up, played by the scroll.

   One scene between 02 and 03: the reader scrubs the published call and
   the armour assembles out of nanites on one canvas. The figure is cut
   at run time into a grid of small tiles (REXONANCE_SUIT_FIGURE, read
   through the page's config from src/lib/rexonance-suit.ts); each tile
   belongs to the smallest suit piece whose box holds it, so the order
   follows the module's piece list whatever its granularity (only each
   piece's id, group, box and seat are read). Over the bare undersuit:

   - FAR UP！ a scan wakes the undersuit, top to bottom;
   - RIDER！ every tile hangs in the air round the body as a nanite mote;
   - SA-GA！DEUS！ ×4: on each DEUS！ one group lands (legs, arms, chest
     and shoulders, waist, as the call snaps them), piece after piece,
     each piece growing out of its seam: a mote flies in, swells into a
     square of the plate's colour (the mosaic), turns into the art and
     welds on with a white flash; the plates show their seams;
   - REXONANCE！ ×4: the tail grows and the ribbons stream; the helmet
     forms above the head;
   - REXONANCE DEUS！ the helmet clamps down, the mosaic seals into the
     finished figure, the face fills with pixel squares that scatter and
     the core rings out.

   The scrub is the scroll itself (a rAF-throttled passive listener while
   the scene is near the view), so it plays the same with or without CSS
   scroll timelines (iOS 18). Each frame reads one rect and draws one
   canvas; tiles already welded live on a figure-sized canvas updated
   incrementally both ways; the HUD (lines, parts, percent, count) is
   written only when it changes. Reduced motion, economy, Save-Data/2G
   and forced colours keep the finished still (no data-rzn-state).
   ===================================================================== */

/** Where each beat of the call falls on the scene's progress (0–1). */
export const ASSEMBLY_BEATS = {
  scan: [0, 0.07],
  motes: [0.07, 0.16],
  deus: [0.16, 0.62],
  rexonance: [0.62, 0.82],
  clamp: 0.86,
  seal: [0.86, 0.9],
  // The lights, held back until the suit is whole, run out from the reactor.
  light: [0.9, 0.915],
  // The form chosen in 03 takes over (MAX / ULTRA) once the suit is lit.
  form: [0.915, 0.975],
  pixels: [0.855, 0.95],
  rings: [0.865, 0.99],
  complete: 0.93,
};
/** The HUD's parts, in the order they land (one per beat). */
export const ASSEMBLY_PARTS = ["LEGS", "ARMS", "CHEST", "WAIST", "TAIL", "HEAD"];

// The beat each group lands on: the four DEUS！ (legs, arms, chest and
// shoulders, waist — the call's snap order), REXONANCE！ (tail, ribbons)
// and REXONANCE DEUS！ (the helmet). A group the module adds later lands
// by where its seat sits on the body.
const BEAT_OF_GROUP = {
  legs: 0,
  arms: 1,
  chest: 2,
  shoulders: 2,
  waist: 3,
  tail: 4,
  ribbon: 4,
  helm: 5,
};
const FLASH = 0.018;
const WELDS_PER_FRAME = 160;
const GOLD_PER_FRAME = 900;
// The scroll has rested this long: the transient squares are cleared.
const CALM_MS = 260;
// The gold's heat: incoming motes, then a locked cell cooling, then the glint.
const GOLD_HEAT = [
  ["rgb(255 246 216)", 0.9],
  ["rgb(255 246 216)", 0.85],
  ["rgb(255 198 66)", 0.6],
  ["rgb(224 138 30)", 0.35],
  ["rgb(255 253 243)", 0.42],
];
export const ASSEMBLY_TOUCH_ART_BUDGET = 64;
const CONTACT_BUDGET = 64;
const PIXEL_BUDGET = 2_600_000;
const TONES = [
  [121, 232, 255],
  [255, 143, 216],
  [244, 251, 255],
];
const RING_TONES = ["rgb(121 232 255)", "rgb(182 163 255)", "rgb(242 216 150)"];
const TONE_CSS = TONES.map(([r, g, b]) => `rgb(${r} ${g} ${b})`);

const grouped = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);
const span = (progress, [from, to]) => clamp01((progress - from) / (to - from));
const smooth = (u) => u * u * (3 - 2 * u);
const easeOut = (u) => 1 - (1 - u) * (1 - u) * (1 - u);
const seededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/** A large reverse scrub discards the future in one clear, then rebuilds
 * only the requested past. Forward and reverse work stays bounded. */
export function assemblyCacheStep(current, target, budget) {
  const reset = current - target > budget;
  const start = reset ? 0 : Math.min(current, target);
  const end = Math.min(target, start + budget);
  return {
    reset,
    start,
    end,
    remove: reset ? 0 : Math.max(0, current - target),
    pending: end < target,
  };
}

/** Pure scrub state. Base assembly keeps its published .93 readout; a
 * selected advanced form is finished only when its prepared art is ready. */
export function assemblyPhase(progress, form = "standard", ready = true) {
  const advanced = form === "max" || form === "ultra" || form === "excelsior";
  const complete =
    ready && progress >= (advanced ? ASSEMBLY_BEATS.form[1] : ASSEMBLY_BEATS.complete);
  const phase = complete
    ? "complete"
    : progress < ASSEMBLY_BEATS.deus[0]
      ? "prepare"
      : progress < ASSEMBLY_BEATS.seal[0]
        ? "assemble"
        : progress < ASSEMBLY_BEATS.seal[1]
          ? "seal"
          : progress < ASSEMBLY_BEATS.light[1]
            ? "ignite"
            : advanced
              ? "evolve"
              : "ignite";
  return { phase, complete };
}

/** Perspective and a curved approach, sampled entirely from progress.
 * Writing into a reusable buffer keeps the live scrub allocation-free. */
export function assemblyTilePose(item, progress, out = new Float32Array(5), offset = 0) {
  const u = clamp01((progress - item.t0) / (item.t1 - item.t0));
  const e = smooth(u);
  const arc = Math.sin(Math.PI * u);
  const angle = (1 - e) * item.spin;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = (item.ox - item.cx) * (1 - e);
  const dy = (item.oy - item.cy) * (1 - e);
  const depth = (item.depth || 0) * arc;
  const perspective = 1 + depth * 0.38;
  const grow = (0.32 + 0.68 * easeOut(Math.min(1, u * 1.15))) * perspective;
  const w = item.tw * grow;
  const h = item.th * grow * (1 - depth * 0.2);
  const x = item.cx + dx * cos - dy * sin + (item.curveX || 0) * arc * (1 - e);
  const y = item.cy + dx * sin + dy * cos + (item.curveY || 0) * arc * (1 - e);
  out[offset] = x - w / 2;
  out[offset + 1] = y - h / 2;
  out[offset + 2] = w;
  out[offset + 3] = h;
  out[offset + 4] = u;
  return out;
}

const beatOfPiece = (piece, size) => {
  const known = BEAT_OF_GROUP[piece.group];
  if (known !== undefined) return known;
  const [x, y] = piece.seat;
  if (y < size.height * 0.2) return 5;
  if (y > size.height * 0.6) return 0;
  if (Math.abs(x - size.width / 2) > size.width * 0.25) return 1;
  return 2;
};
const beatWindow = (beat) => {
  if (beat <= 3) {
    const [from, to] = ASSEMBLY_BEATS.deus;
    const step = (to - from) / 4;
    return [from + beat * step, from + (beat + 1) * step];
  }
  if (beat === 4) return ASSEMBLY_BEATS.rexonance;
  // The helmet forms last, from its outer layer in, and is whole just before
  // the compound eyes fill with cells (owner, 2026-10-11).
  return [ASSEMBLY_BEATS.rexonance[0] + 0.06, ASSEMBLY_BEATS.clamp - 0.012];
};

/**
 * The nanite plan: every tile of the figure that carries paint, which
 * piece and beat it belongs to, where its mote hangs, and when it flies,
 * lands (t1, sorted) and, for the helmet, hovers. `sample` holds one RGBA
 * texel per tile (the figure drawn down to cols × rows), or null.
 */
function* assemblyPlanSteps({
  size,
  pieces,
  core,
  tile,
  maskTile = 9,
  sample = null,
  seed = 1510,
  visor = null,
}) {
  const { width, height } = size;
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);
  const random = seededRandom(seed);
  const ranked = pieces.map((piece, index) => ({
    piece,
    index,
    beat: beatOfPiece(piece, size),
    mask: piece.tiles ? Uint8Array.from(atob(piece.tiles), (c) => c.charCodeAt(0)) : null,
    preset: Boolean(piece.preset),
    rank: 0,
    reach: 1,
  }));
  const masked = ranked.some((entry) => entry.mask);
  const covers = (entry, x, y) => {
    const p = entry.piece;
    if (x < p.x || x >= p.x + p.w || y < p.y || y >= p.y + p.h) return false;
    if (!entry.mask) return !masked;
    const bit =
      Math.floor((y - p.y) / maskTile) * Math.ceil(p.w / maskTile) +
      Math.floor((x - p.x) / maskTile);
    return Boolean(entry.mask[bit >> 3] & (1 << (bit & 7)));
  };
  const byBeat = new Map();
  for (const entry of ranked) {
    if (!byBeat.has(entry.beat)) byBeat.set(entry.beat, []);
    byBeat.get(entry.beat).push(entry);
  }
  for (const [beat, list] of byBeat) {
    // Bottom first within a DEUS！ (boots before knees); the tail root to
    // blade and the ribbons from the shoulder down keep the module's order.
    list.sort((a, b) =>
      beat === 4
        ? a.piece.group === b.piece.group
          ? a.index - b.index
          : a.piece.group < b.piece.group
            ? 1
            : -1
        : b.piece.seat[1] - a.piece.seat[1] || a.index - b.index,
    );
    list.forEach((entry, order) => {
      entry.rank = list.length > 1 ? order / (list.length - 1) : 0;
    });
  }
  const tiles = [];
  for (let row = 0; row < rows; row += 1) {
    if (row && row % 4 === 0) yield;
    for (let col = 0; col < cols; col += 1) {
      const sx = col * tile;
      const sy = row * tile;
      const tw = Math.min(tile, width - sx);
      const th = Math.min(tile, height - sy);
      let rgb = TONES[0];
      if (sample) {
        const offset = (row * cols + col) * 4;
        if (sample.data[offset + 3] < 40) continue;
        rgb = [sample.data[offset], sample.data[offset + 1], sample.data[offset + 2]];
      }
      const cx = sx + tw / 2;
      const cy = sy + th / 2;
      let owner = null;
      // The atlas is front-first. Vote over the actual painted mask, not
      // the smallest rectangle (a gauntlet's box also contains ribbons).
      let coverage = 0;
      for (const entry of ranked) {
        const score =
          Number(covers(entry, cx, cy)) * 2 +
          Number(covers(entry, sx + tw * 0.25, sy + th * 0.25)) +
          Number(covers(entry, sx + tw * 0.75, sy + th * 0.25)) +
          Number(covers(entry, sx + tw * 0.25, sy + th * 0.75)) +
          Number(covers(entry, sx + tw * 0.75, sy + th * 0.75));
        if (score > coverage) {
          coverage = score;
          owner = entry;
        }
      }
      if (!owner && !masked) {
        let best = Number.POSITIVE_INFINITY;
        for (const entry of ranked) {
          const distance = (entry.piece.seat[0] - cx) ** 2 + (entry.piece.seat[1] - cy) ** 2;
          if (distance < best) {
            best = distance;
            owner = entry;
          }
        }
      }
      // The driver is drawn whole from its cut-outs, never as tiles.
      if (owner?.preset) continue;
      const reach = owner ? Math.hypot(cx - owner.piece.seat[0], cy - owner.piece.seat[1]) : 0;
      if (owner) owner.reach = Math.max(owner.reach, reach);
      tiles.push({ sx, sy, tw, th, cx, cy, owner, pieceId: owner?.piece.id ?? null, reach, rgb });
    }
  }
  const [coreX, coreY] = core;
  // The helmet forms from its outer layer inward (owner, 2026-10-11): the
  // farther a tile from the compound eyes, the earlier it lands.
  const [eyeX, eyeY] = visor ?? [width / 2, height * 0.14];
  let helmReach = 1;
  for (const item of tiles)
    if (item.owner?.beat === 5)
      helmReach = Math.max(helmReach, Math.hypot(item.cx - eyeX, item.cy - eyeY));
  const partDone = ASSEMBLY_PARTS.map(() => 0);
  const centroids = ASSEMBLY_PARTS.map(() => [0, 0, 0]);
  for (const [index, item] of tiles.entries()) {
    if (index && index % 128 === 0) yield;
    const beat = item.owner
      ? item.owner.beat
      : item.cy < height * 0.2
        ? 5
        : item.cy > height * 0.6
          ? 0
          : 2;
    const [from, to] = beatWindow(beat);
    const flight = beat === 4 ? 0.045 : 0.05;
    const key = clamp01(
      beat === 5
        ? (1 - Math.hypot(item.cx - eyeX, item.cy - eyeY) / helmReach) * 0.9 + random() * 0.1
        : (item.owner?.rank ?? 0) * 0.52 +
            (item.reach / (item.owner?.reach ?? 1)) * 0.38 +
            random() * 0.1,
    );
    item.beat = beat;
    item.t0 = from + key * (to - from - flight);
    // Formed in place: the helmet no longer hovers and drops onto the head.
    item.hover = 0;
    item.t1 = item.t0 + flight;
    item.m =
      ASSEMBLY_BEATS.motes[0] +
      random() * (ASSEMBLY_BEATS.motes[1] - ASSEMBLY_BEATS.motes[0]) * 0.8;
    // The mote hangs out from the core, turned a little, 0.12–0.42 of the
    // figure's height away.
    let vx = item.cx - coreX;
    let vy = item.cy - coreY;
    let length = Math.hypot(vx, vy);
    if (length < 1) {
      const angle = random() * Math.PI * 2;
      vx = Math.cos(angle);
      vy = Math.sin(angle);
      length = 1;
    }
    const turn = (random() - 0.5) * 1.1;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const distance = height * (0.12 + 0.3 * random());
    item.ox = item.cx + ((vx * cos - vy * sin) / length) * distance;
    item.oy = item.cy + ((vx * sin + vy * cos) / length) * distance * 0.8;
    item.tone = index % 9 === 0 ? 2 : item.cx < width / 2 ? 0 : 1;
    // The mosaic: the plate's own colour, lit toward the call's ice/pink.
    const tint = TONES[item.tone];
    const mix = (channel) => Math.round(item.rgb[channel] * 0.55 + tint[channel] * 0.45);
    item.fill = `rgb(${mix(0)} ${mix(1)} ${mix(2)})`;
    item.spin = (random() - 0.5) * 1.2;
    // Each plate shares an approach plane. Tile-local variation is seeded
    // without consuming the timing PRNG, preserving every landing beat.
    const plane = ((Math.imul((item.owner?.index ?? beat) + 1, 2654435761) >>> 0) % 997) / 997;
    item.depth = 0.35 + plane * 0.65;
    item.curveX = (item.cx < width / 2 ? -1 : 1) * height * (0.025 + plane * 0.035);
    item.curveY = -height * (0.018 + plane * 0.018);
    partDone[beat] = Math.max(partDone[beat], item.t1);
    centroids[beat][0] += item.cx;
    centroids[beat][1] += item.cy;
    centroids[beat][2] += 1;
    delete item.owner;
    delete item.reach;
    delete item.rgb;
  }
  tiles.sort((a, b) => a.t1 - b.t1);
  return {
    tiles,
    cols,
    rows,
    tile,
    partDone,
    centroids: centroids.map(([x, y, n]) => (n ? [x / n, y / n] : [coreX, coreY])),
  };
}

/** Pure synchronous plan for callers/tests; the live scene advances this
 * same generator in small idle slices instead of one monolithic task. */
export function planAssembly(options) {
  const steps = assemblyPlanSteps(options);
  let step;
  do {
    step = steps.next();
  } while (!step.done);
  return step.value;
}

/**
 * The gold, formed by nanites right after each plate seats (owner,
 * 2026-10-11, as in the call): each plate's gold cells (`gold.cells`, by
 * piece id: `gold.cell` px squares of its box, row-major, LSB-first,
 * base64) lock in the order the gold runs, from the seat along each trim (a
 * breadth-first walk, so it follows the channel round corners), over a
 * short stretch of the scroll from the moment the plate's last tile lands.
 * Returns flat, lock-sorted arrays (figure px, progress 0–1).
 */
export const ASSEMBLY_GOLD = {
  delay: 0.003,
  form: 0.03,
  helm: 0.016,
  approach: 0.007,
  cool: 0.012,
  glint: 0.006,
};

// Trims from different plate grids overlap even when each individual grid
// is disjoint. Prepare their neighbors once, never search the suit per frame.
const goldOverlaps = (g, cell) => {
  const lists = Array.from({ length: g.count }, () => []);
  const bins = new Map();
  for (let i = 0; i < g.count; i += 1) {
    const bx = Math.floor(g.x[i] / cell);
    const by = Math.floor(g.y[i] / cell);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const bucket = bins.get(`${bx + dx},${by + dy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (
            g.x[i] >= g.x[j] + g.w[j] ||
            g.x[j] >= g.x[i] + g.w[i] ||
            g.y[i] >= g.y[j] + g.h[j] ||
            g.y[j] >= g.y[i] + g.h[i]
          )
            continue;
          lists[i].push(j);
          lists[j].push(i);
        }
      }
    const key = `${bx},${by}`;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(i);
  }
  return lists.map((list) => Int32Array.from(list));
};

/** Remove future cells and repair only their overlaps with retained paint.
 * A persistent cursor allows even one operation per frame to converge.
 * The returned budget is available for forward gold formation. */
export function rewindAssemblyGold(context, art, g, state, target, budget) {
  while (budget > 0 && (state.count > target || state.dirty >= 0)) {
    if (state.dirty < 0) {
      state.count -= 1;
      state.dirty = state.count;
      state.at = 0;
      const i = state.dirty;
      context.clearRect(g.x[i], g.y[i], g.w[i], g.h[i]);
      budget -= 1;
    }
    const i = state.dirty;
    const neighbors = g.overlaps[i];
    while (state.at < neighbors.length && budget > 0) {
      const j = neighbors[state.at++];
      if (j >= Math.min(state.count, target)) continue;
      const x = Math.max(g.x[i], g.x[j]);
      const y = Math.max(g.y[i], g.y[j]);
      const w = Math.min(g.x[i] + g.w[i], g.x[j] + g.w[j]) - x;
      const h = Math.min(g.y[i] + g.h[i], g.y[j] + g.h[j]) - y;
      context.drawImage(art, x, y, w, h, x, y, w, h);
      budget -= 1;
    }
    if (state.at === neighbors.length) state.dirty = -1;
  }
  return budget;
}

export function planAssemblyGold({ pieces, gold, landed }) {
  if (!gold?.cells) return null;
  const G = gold.cell;
  const list = [];
  pieces.forEach((piece, index) => {
    const base64 = gold.cells[piece.id];
    const done = landed.get(piece.id);
    if (!base64 || piece.preset || done === undefined) return;
    const bits = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const cols = Math.ceil(piece.w / G);
    const rows = Math.ceil(piece.h / G);
    const grid = new Int32Array(cols * rows).fill(-1);
    const col = [];
    const row = [];
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const bit = r * cols + c;
        if (!(bits[bit >> 3] & (1 << (bit & 7)))) continue;
        grid[bit] = col.length;
        col.push(c);
        row.push(r);
      }
    const n = col.length;
    if (!n) return;
    const seatX = (piece.seat[0] - piece.x) / G - 0.5;
    const seatY = (piece.seat[1] - piece.y) / G - 0.5;
    const reach = new Float32Array(n).fill(-1);
    const parent = new Int32Array(n).fill(-1);
    const queue = new Int32Array(n);
    let seen = 0;
    while (seen < n) {
      let entry = -1;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < n; i += 1) {
        if (reach[i] >= 0) continue;
        const d = Math.hypot(col[i] - seatX, row[i] - seatY);
        if (d < best) {
          best = d;
          entry = i;
        }
      }
      let head = 0;
      let tail = 0;
      reach[entry] = best * 0.45;
      queue[tail++] = entry;
      seen += 1;
      while (head < tail) {
        const i = queue[head++];
        for (let dy = -1; dy <= 1; dy += 1)
          for (let dx = -1; dx <= 1; dx += 1) {
            const c = col[i] + dx;
            const r = row[i] + dy;
            if ((!dx && !dy) || c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const j = grid[r * cols + c];
            if (j < 0 || reach[j] >= 0) continue;
            reach[j] = reach[i] + (dx && dy ? 1.41 : 1);
            parent[j] = i;
            queue[tail++] = j;
            seen += 1;
          }
      }
    }
    let most = 0;
    for (let i = 0; i < n; i += 1) most = Math.max(most, reach[i]);
    const from = done + ASSEMBLY_GOLD.delay;
    const span = piece.group === "helm" ? ASSEMBLY_GOLD.helm : ASSEMBLY_GOLD.form;
    const random = seededRandom(7919 + index);
    for (let i = 0; i < n; i += 1) {
      const p = parent[i];
      let ux = p >= 0 ? col[p] - col[i] : seatX - col[i];
      let uy = p >= 0 ? row[p] - row[i] : seatY - row[i];
      const length = Math.hypot(ux, uy) || 1;
      ux /= length;
      uy /= length;
      const flow = clamp01((most ? reach[i] / most : 0) * 0.95 + random() * 0.05);
      list.push([
        piece.x + col[i] * G,
        piece.y + row[i] * G,
        Math.min(G, piece.w - col[i] * G),
        Math.min(G, piece.h - row[i] * G),
        from + flow * span,
        ux * G * 2.6,
        uy * G * 2.6,
      ]);
    }
  });
  list.sort((a, b) => a[4] - b[4]);
  const field = (k) => Float32Array.from(list, (entry) => entry[k]);
  const result = {
    count: list.length,
    x: field(0),
    y: field(1),
    w: field(2),
    h: field(3),
    lock: field(4),
    ux: field(5),
    uy: field(6),
  };
  result.overlaps = goldOverlaps(result, G);
  return result;
}

// Pixel squares inside the face's lights (figure px), in burst groups.
const facePixels = (glow, visor) => {
  if (!glow?.length) return [];
  const random = seededRandom(2010);
  const xs = glow.map(([x]) => x);
  const ys = glow.map(([, y]) => y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const inside = (px, py) => {
    let hit = false;
    for (let i = 0, j = glow.length - 1; i < glow.length; j = i, i += 1) {
      const [xi, yi] = glow[i];
      const [xj, yj] = glow[j];
      if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
    }
    return hit;
  };
  const squares = [];
  for (let tries = 0; squares.length < 120 && tries < 4000; tries += 1) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (!inside(x, y)) continue;
    const size = [4, 5, 6, 8][squares.length % 4];
    const centre = Math.abs(x - visor[0]) < 14 + (y - y0) * 0.12;
    const tone = squares.length % 7 === 0 ? 2 : centre ? 1 : 0;
    squares.push({ x, y, size, tone, group: squares.length % 6 });
  }
  return squares;
};
const BURSTS = [
  [3.4, -14],
  [4.6, 10],
  [3, 22],
  [5.2, -6],
  [3.9, -24],
  [4.8, 16],
];

/**
 * Mounts the suit-up scene on its runway. `config`: { figure, undersuit,
 * size: { width, height }, pieces: [{ id, group, x, y, w, h, seat }],
 * core, visor, glow }.
 */
export function mountRexonanceAssembly(runway, config, environment = window) {
  if (!runway || !config) return () => {};
  const document = runway.ownerDocument;
  const html = document.documentElement;
  const canvas = runway.querySelector("canvas.rzn-canvas");
  const frameBox = runway.querySelector(".rzn-frame");
  if (!canvas || !frameBox || typeof canvas.getContext !== "function") return () => {};
  const reduced = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const forcedColors = environment.matchMedia("(forced-colors: active)");
  const coarse = environment.matchMedia("(pointer: coarse)");
  const connection = environment.navigator?.connection;
  const lines = [...runway.querySelectorAll(".rzn-line")].map((line) => ({
    line,
    chips: [...line.querySelectorAll(".rzn-chip")],
  }));
  const parts = [...runway.querySelectorAll(".rzn-part")];
  const percent = runway.querySelector(".rzn-percent");
  const counter = runway.querySelector(".rzn-count");
  const restPercent = percent?.textContent ?? "";
  const restCount = counter?.textContent ?? "";
  // The read-outs change every frame of a scrub: rewrite their text node's
  // data (as RESONANCE's count-ups do) rather than the element's content.
  // A replaced node is a tree change, and the shell's :has() rules then
  // restyle <html> and <body> on every frame.
  const writeText = (element, text) => {
    const node = element.firstChild;
    if (node && node.nodeType === 3 && !node.nextSibling) {
      if (node.data !== text) node.data = text;
    } else element.textContent = text;
  };
  const { width: W, height: H } = config.size;
  let disposed = false;
  let pageActive = true;
  let live = false;
  let near = false;
  let warm = false;
  let frame = 0;
  let images = null;
  let loading = null;
  let plan = null;
  let goldPlan = null;
  let raw = null;
  let goldArt = null;
  let goldLayer = null;
  let goldCount = 0;
  const goldReverse = { count: 0, dirty: -1, at: 0 };
  let driver = null;
  let lights = null;
  let settled = null;
  let settledCount = 0;
  let pixels = null;
  let view = null;
  let lastProgress = -1;
  let calmTimer = 0;
  const hud = {
    line: -1,
    chips: "",
    parts: -1,
    percent: "",
    count: "",
    complete: null,
    phase: "",
    formComplete: null,
  };

  const motionAllowed = () => {
    const constrained =
      Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    return (
      !reduced.matches &&
      !forcedColors.matches &&
      !constrained &&
      html.dataset.worldEffects !== "economy"
    );
  };

  const load = () => {
    if (loading) return loading;
    const decode = (src) =>
      new Promise((resolve, reject) => {
        const image = new environment.Image();
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      })
        .then((image) =>
          image.decode
            ? image.decode().then(
                () => image,
                () => image,
              )
            : image,
        )
        // Drawn into a canvas, an <img> is decoded again on the main thread
        // (tens of ms on a slow phone); a bitmap arrives decoded.
        .then((image) =>
          typeof environment.createImageBitmap === "function"
            ? environment.createImageBitmap(image).then(
                (bitmap) => bitmap,
                () => image,
              )
            : image,
        );
    loading = Promise.all([
      decode(config.figure),
      decode(config.undersuit),
      config.gold?.atlas ? decode(config.gold.atlas).catch(() => null) : null,
      config.atlas ? decode(config.atlas).catch(() => null) : null,
    ]).then(([figure, undersuit, gold, atlas]) => {
      if (disposed) {
        figure.close?.();
        undersuit.close?.();
        gold?.close?.();
        atlas?.close?.();
        return null;
      }
      images = { figure, undersuit, gold, atlas };
      return images;
    });
    return loading;
  };

  // One texel per tile: the figure drawn down to the grid gives each
  // tile's mean colour and coverage in one read. Where the browser can,
  // the shrink runs off the main thread (createImageBitmap); the read is
  // then of a canvas a few dozen pixels wide.
  const sampleFigure = async (tile) => {
    const cols = Math.ceil(W / tile);
    const rows = Math.ceil(H / tile);
    let bitmap = null;
    try {
      if (typeof environment.createImageBitmap === "function") {
        bitmap = await environment.createImageBitmap(
          images.figure,
          0,
          0,
          cols * tile,
          rows * tile,
          {
            resizeWidth: cols,
            resizeHeight: rows,
            resizeQuality: "medium",
          },
        );
      }
    } catch {
      bitmap = null;
    }
    if (disposed) {
      bitmap?.close?.();
      return null;
    }
    try {
      const probe = document.createElement("canvas");
      probe.width = cols;
      probe.height = rows;
      const context = probe.getContext("2d", { willReadFrequently: true });
      context.imageSmoothingEnabled = true;
      if (bitmap) context.drawImage(bitmap, 0, 0);
      else context.drawImage(images.figure, 0, 0, cols * tile, rows * tile, 0, 0, cols, rows);
      const data = context.getImageData(0, 0, cols, rows).data;
      probe.width = probe.height = 0;
      return { data };
    } catch {
      return null;
    } finally {
      bitmap?.close?.();
    }
  };

  // Each preparation phase gets an idle slot, 3.5 viewports before the
  // scene. Timeout/fallback still guarantees progress during a fast fling.
  // Cancelling resolves waiters so an old build cannot activate after exit.
  let building = null;
  let generation = 0;
  const idleJobs = new Map();
  const idleTask = (work) =>
    new Promise((resolve, reject) => {
      if (disposed || !pageActive || document.hidden || !motionAllowed()) return resolve(null);
      const run = (deadline) => {
        idleJobs.delete(id);
        if (disposed || !pageActive || document.hidden || !motionAllowed()) return resolve(null);
        try {
          resolve(work(deadline));
        } catch (error) {
          reject(error);
        }
      };
      const idle = typeof environment.requestIdleCallback === "function";
      const id = idle
        ? environment.requestIdleCallback(run, { timeout: 1000 })
        : environment.setTimeout(run, 16);
      idleJobs.set(id, () => {
        if (idle) environment.cancelIdleCallback?.(id);
        else environment.clearTimeout(id);
        resolve(null);
      });
    });
  const cancelPreparation = () => {
    generation += 1;
    for (const cancel of idleJobs.values()) cancel();
    idleJobs.clear();
    building = null;
    preparing = null;
  };
  const build = () => {
    if (building) return building;
    const token = generation;
    const tile = coarse.matches ? 15 : 12;
    building = idleTask(() => sampleFigure(tile))
      .then((sample) =>
        idleTask(async () => {
          if (disposed || token !== generation) return;
          const steps = assemblyPlanSteps({
            size: config.size,
            pieces: config.pieces,
            core: config.core,
            maskTile: config.maskTile,
            visor: config.visor,
            tile,
            sample,
          });
          let result;
          while (
            !disposed &&
            pageActive &&
            token === generation &&
            !document.hidden &&
            motionAllowed()
          ) {
            await idleTask((deadline) => {
              const start = environment.performance?.now?.() ?? Date.now();
              do {
                result = steps.next();
              } while (
                !result.done &&
                (environment.performance?.now?.() ?? Date.now()) - start < 4 &&
                (!deadline || deadline.timeRemaining() > 4)
              );
            });
            if (result?.done) break;
          }
          if (disposed || token !== generation || !result?.done) return;
          plan = result.value;
          pixels = facePixels(config.glow, config.visor);
          // When each plate's last tile lands: its gold forms from there.
          const landed = new Map();
          for (const item of plan.tiles)
            if (item.pieceId)
              landed.set(item.pieceId, Math.max(landed.get(item.pieceId) ?? 0, item.t1));
          goldPlan = images.gold
            ? planAssemblyGold({ pieces: config.pieces, gold: config.gold, landed })
            : null;
        }),
      )
      .then(() =>
        idleTask(() => {
          if (disposed || token !== generation || !plan) return;
          settled = document.createElement("canvas");
          settled.width = W;
          settled.height = H;
          settledCount = 0;
          // The suit's lights are held back until it is whole (owner): the
          // figure with its ice-cyan and pink in monochrome, and that light.
          lights = splitLights(images.figure, 0, 0, W, H, document);
          // The driver at the waist: on the body, finished and whole, from
          // the start (its plates' own cut-outs from the atlas).
          const preset = config.pieces.filter((piece) => piece.preset);
          if (preset.length && images.atlas) {
            driver = Object.assign(document.createElement("canvas"), { width: W, height: H });
            const dc = driver.getContext("2d");
            for (let i = preset.length - 1; i >= 0; i -= 1) {
              const piece = preset[i];
              dc.drawImage(
                images.atlas,
                piece.ax,
                piece.ay,
                piece.w,
                piece.h,
                piece.x,
                piece.y,
                piece.w,
                piece.h,
              );
            }
            const driverLights = splitLights(driver, 0, 0, W, H, document);
            if (driverLights) {
              dc.clearRect(0, 0, W, H);
              dc.drawImage(driverLights.unlit, 0, 0);
              driverLights.unlit.width = driverLights.lights.width = 0;
            }
          }
          if (goldPlan?.count) {
            // The plates as they seat (their gold raw gunmetal), the gold
            // alone (the art under the trims' mask), and the gold formed.
            const sheet = () =>
              Object.assign(document.createElement("canvas"), { width: W, height: H });
            raw = sheet();
            goldArt = sheet();
            goldLayer = sheet();
            goldCount = 0;
            const rc = raw.getContext("2d");
            const gc = goldArt.getContext("2d");
            rc.drawImage(lights?.unlit || images.figure, 0, 0, W, H);
            for (let i = config.pieces.length - 1; i >= 0; i -= 1) {
              const piece = config.pieces[i];
              if (piece.preset || !config.gold.cells[piece.id]) continue;
              const cell = [
                piece.ax,
                piece.ay,
                piece.w,
                piece.h,
                piece.x,
                piece.y,
                piece.w,
                piece.h,
              ];
              rc.drawImage(images.gold, ...cell);
              gc.drawImage(images.gold, ...cell);
            }
            gc.globalCompositeOperation = "source-in";
            gc.drawImage(images.figure, 0, 0, W, H);
            gc.globalCompositeOperation = "source-over";
          }
          allocate();
        }),
      )
      .finally(() => {
        if (token === generation) building = null;
      });
    return building;
  };

  // The canvas fills the frame; the figure stands in it at the size the
  // stylesheet's custom properties ask for (share of height and width).
  let pendingSize = null;
  const measure = () => {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (!cssWidth || !cssHeight) return false;
    const ratio = Math.min(
      environment.devicePixelRatio || 1,
      2,
      Math.sqrt(PIXEL_BUDGET / (cssWidth * cssHeight)),
    );
    // Read everything first; the backing store is resized in the next frame
    // (a size write before a layout read would force a layout).
    pendingSize = [
      Math.max(1, Math.round(cssWidth * ratio)),
      Math.max(1, Math.round(cssHeight * ratio)),
    ];
    const style = environment.getComputedStyle(canvas);
    const heightShare = Number.parseFloat(style.getPropertyValue("--rzn-fig-h")) || 0.84;
    const widthShare = Number.parseFloat(style.getPropertyValue("--rzn-fig-w")) || 0.9;
    const centreX = Number.parseFloat(style.getPropertyValue("--rzn-fig-x")) || 0.5;
    const bottom = Number.parseFloat(style.getPropertyValue("--rzn-fig-b")) || 0.05;
    measureRunway();
    const figureHeight = Math.min(cssHeight * heightShare, (cssWidth * widthShare * H) / W);
    const scale = figureHeight / H;
    view = {
      ratio,
      scale: scale * ratio,
      x: (cssWidth * centreX - (W * scale) / 2) * ratio,
      y: (cssHeight * (1 - bottom) - figureHeight) * ratio,
    };
    return true;
  };

  // The pinned frame's travel: from the runway's top reaching the frame's
  // sticky top to its bottom reaching the frame's bottom (read on resize).
  let pinTop = 0;
  let travel = 0;
  const measureRunway = () => {
    pinTop = Number.parseFloat(environment.getComputedStyle(frameBox).top) || 0;
    travel = runway.offsetHeight - frameBox.offsetHeight;
  };
  const readProgress = () => {
    if (travel <= 0) return 1;
    return clamp01((pinTop - runway.getBoundingClientRect().top) / travel);
  };

  /* ---------------- drawing ---------------- */
  // A welded tile is the art itself, edge to edge: once a part has formed
  // no cell grid stays on it (owner, 2026-10-11).
  const weld = (item) => {
    const context = settled.getContext("2d");
    context.drawImage(
      raw || lights?.unlit || images.figure,
      item.sx,
      item.sy,
      item.tw,
      item.th,
      item.sx,
      item.sy,
      item.tw,
      item.th,
    );
  };
  const unweld = (item) => {
    settled.getContext("2d").clearRect(item.sx, item.sy, item.tw, item.th);
  };
  // The tiles landed by `progress` (they are sorted by landing).
  const landedBy = (progress) => {
    const { tiles } = plan;
    let low = 0;
    let high = tiles.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (tiles[middle].t1 <= progress) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  // Welds catch up a little each frame (a jump into the scene would weld
  // thousands at once); until welded, a landed tile shows as its mosaic
  // square. Once the seal has covered them, nothing more is welded.
  let behind = false;
  const syncSettled = (landed, sealed) => {
    const { tiles } = plan;
    const step = assemblyCacheStep(settledCount, landed, WELDS_PER_FRAME);
    if (step.reset) {
      settled.getContext("2d").clearRect(0, 0, W, H);
      settledCount = 0;
    }
    while (settledCount > landed) {
      settledCount -= 1;
      unweld(tiles[settledCount]);
    }
    if (sealed) {
      return;
    }
    let budget = WELDS_PER_FRAME;
    while (settledCount < landed && budget > 0) {
      weld(tiles[settledCount]);
      settledCount += 1;
      budget -= 1;
    }
    behind ||= settledCount < landed;
  };

  // Per-frame buffers, allocated once per plan: a scrub draws thousands
  // of squares a frame and must not leave garbage behind it.
  let buffers = null;
  const allocate = () => {
    const n = plan.tiles.length * 4;
    const faces = [];
    for (let group = 0; group < 6; group += 1) {
      faces.push(
        [0, 1, 2].map((tone) => {
          const list = pixels.filter((square) => square.group === group && square.tone === tone);
          const rects = new Float32Array(list.length * 4);
          list.forEach((square, index) => {
            rects.set(
              [square.x - square.size / 2, square.y - square.size / 2, square.size, square.size],
              index * 4,
            );
          });
          return rects;
        }),
      );
    }
    const goldCells = goldPlan?.count ?? 0;
    buffers = {
      heat: GOLD_HEAT.map(() => new Float32Array(goldCells * 4)),
      heatCounts: new Int32Array(GOLD_HEAT.length),
      motes: Array.from({ length: 6 }, () => new Float32Array(n)),
      moteCounts: new Int32Array(6),
      art: new Int32Array(plan.tiles.length),
      artRects: new Float32Array(n),
      pose: new Float32Array(5),
      flashes: Array.from({ length: 3 }, () => new Float32Array(n)),
      flashCounts: new Int32Array(3),
      faces,
      glow: null,
    };
  };
  const fillRects = (context, rects, count, style, alpha) => {
    if (!count) return;
    context.globalAlpha = alpha;
    context.fillStyle = style;
    context.beginPath();
    for (let i = 0; i < count; i += 4)
      context.rect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3]);
    context.fill();
  };

  // The gold formed by `progress` (cells are sorted by when they lock),
  // caught up a budget a frame, both ways.
  const goldBy = (progress) => {
    const { lock } = goldPlan;
    let low = 0;
    let high = goldPlan.count;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (lock[middle] <= progress) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const syncGold = (progress) => {
    const g = goldPlan;
    const target = goldBy(progress);
    const context = goldLayer.getContext("2d");
    const step = assemblyCacheStep(goldCount, target, GOLD_PER_FRAME);
    if (step.reset) {
      context.clearRect(0, 0, W, H);
      goldCount = 0;
      goldReverse.dirty = -1;
      goldReverse.at = 0;
    }
    goldReverse.count = goldCount;
    let budget = rewindAssemblyGold(context, goldArt, g, goldReverse, target, GOLD_PER_FRAME);
    goldCount = goldReverse.count;
    while (goldCount < target && budget > 0) {
      const i = goldCount;
      context.drawImage(goldArt, g.x[i], g.y[i], g.w[i], g.h[i], g.x[i], g.y[i], g.w[i], g.h[i]);
      goldCount += 1;
      budget -= 1;
    }
    behind ||= goldCount !== target || goldReverse.dirty >= 0;
  };
  // The molten front: each cell's mote flies in from the cell it flowed
  // from, white-hot, locks and cools through bright gold to the painted
  // gold; a glint follows the front along the finished trim.
  const drawGold = (context, progress) => {
    const g = goldPlan;
    const { approach, cool, glint } = ASSEMBLY_GOLD;
    const { heat, heatCounts } = buffers;
    heatCounts.fill(0);
    let index = goldBy(progress - cool - glint);
    for (; index < g.count; index += 1) {
      const lock = g.lock[index];
      if (lock > progress + approach) break;
      const w = g.w[index];
      const h = g.h[index];
      let slot;
      let size;
      let x = g.x[index];
      let y = g.y[index];
      if (lock > progress) {
        const u = 1 - (lock - progress) / approach;
        x += g.ux[index] * (1 - u);
        y += g.uy[index] * (1 - u);
        slot = 0;
        size = 0.45 + 0.35 * u;
      } else if (progress - lock < cool) {
        const age = (progress - lock) / cool;
        slot = age < 0.34 ? 1 : age < 0.67 ? 2 : 3;
        size = 1.5 - 0.5 * age;
      } else {
        slot = 4;
        size = 1;
      }
      const buffer = heat[slot];
      const at = heatCounts[slot];
      buffer[at] = x + (w - w * size) / 2;
      buffer[at + 1] = y + (h - h * size) / 2;
      buffer[at + 2] = w * size;
      buffer[at + 3] = h * size;
      heatCounts[slot] = at + 4;
    }
    for (let slot = 0; slot < GOLD_HEAT.length; slot += 1) {
      const [style, alpha] = GOLD_HEAT[slot];
      fillRects(context, heat[slot], heatCounts[slot], style, alpha);
    }
    context.globalAlpha = 1;
  };

  // `calm`: the scroll has stopped: no transient squares (weld flashes, the
  // gold's heat, the tiles' outlines) are left standing on the formed parts.
  const draw = (progress, calm = false) => {
    const context = canvas.getContext("2d");
    const { figure, undersuit } = images;
    const B = ASSEMBLY_BEATS;
    behind = false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.imageSmoothingEnabled = true;

    // FAR UP！: the scan wakes the undersuit, top to bottom.
    const scan = span(progress, B.scan);
    const seal = smooth(span(progress, B.seal));
    if (seal < 1) {
      const fade = 1 - seal;
      context.globalAlpha = 0.24 * fade;
      context.drawImage(undersuit, 0, 0, W, H);
      const scanned = H * scan;
      if (scanned > 1) {
        context.globalAlpha = 0.76 * fade;
        context.drawImage(undersuit, 0, 0, W, scanned, 0, 0, W, scanned);
      }
      if (scan > 0 && scan < 1) {
        context.globalAlpha = 0.85;
        context.fillStyle = TONE_CSS[0];
        context.fillRect(-W * 0.08, scanned - 1.5, W * 1.16, 3);
        context.globalAlpha = 0.18;
        context.fillRect(-W * 0.08, scanned - 26, W * 1.16, 24);
      }
    }

    // The welded plates, then the seal into the finished figure.
    const { tiles } = plan;
    const landed = landedBy(progress);
    syncSettled(landed, seal >= 1);
    context.globalAlpha = 1;
    if (seal < 1) {
      context.drawImage(settled, 0, 0, W, H);
      for (let index = settledCount; index < landed; index += 1) {
        const item = tiles[index];
        context.fillStyle = item.fill;
        context.fillRect(item.sx + 0.8, item.sy + 0.8, item.tw - 1.6, item.th - 1.6);
      }
      if (goldLayer) {
        syncGold(progress);
        context.drawImage(goldLayer, 0, 0, W, H);
        if (!calm) drawGold(context, progress);
      }
      if (driver) context.drawImage(driver, 0, 0, W, H);
    }
    if (seal > 0) {
      context.globalAlpha = seal;
      context.drawImage(lights?.unlit || figure, 0, 0, W, H);
    }
    // The suit is whole: the reactor ignites and its light runs out through
    // the whole body (the held-back ice-cyan and pink), with a bloom.
    if (lights && progress >= B.light[0]) {
      const u = span(progress, B.light);
      const [coreX, coreY] = config.core;
      const reach = Math.hypot(Math.max(coreX, W - coreX), Math.max(coreY, H - coreY));
      context.save();
      context.beginPath();
      context.arc(coreX, coreY, Math.max(1, reach * easeOut(u)), 0, Math.PI * 2);
      context.clip();
      context.globalAlpha = 1;
      context.drawImage(lights.lights, 0, 0, W, H);
      const bloom = 1 - span(progress, [B.light[0], B.light[1] + 0.03]);
      if (bloom > 0) {
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = 0.55 * bloom;
        context.drawImage(lights.lights, 0, 0, W, H);
        context.globalCompositeOperation = "source-over";
      }
      context.restore();
    }

    // The form chosen in 03 (owner, 2026-10-11): MAX overwrites the
    // finished Rexonance with cells; ULTRA runs to MAX briefly, overwrites
    // it again and generates its additional parts.
    const form = runway.dataset.form;
    if ((form === "max" || form === "ultra" || form === "excelsior") && progress > B.form[0]) {
      const forms = formFigures();
      // The forms live on sheets PAD px wider either side than the figure
      // (EXCELSIOR is broader; it is never shrunk — owner, 2026-10-12).
      if (forms) {
        context.save();
        context.translate(-forms.pad, 0);
      }
      if (forms && progress >= B.form[1] && forms[form]) {
        // The final pose is its exact prepared artwork. No overwrite heat,
        // disappearing cells or mesh seams survive the completed form.
        context.clearRect(0, 0, forms.width, H);
        context.globalAlpha = 1;
        context.drawImage(forms[form], 0, 0, forms.width, H);
      } else if (forms && form === "excelsior" && forms.excelsior) {
        // EXCELSIOR (owner): MAX, then ULTRA, briefly; then its own nanites
        // (prism shards, coming down from the crown) add its decoration.
        const [a, b] = B.form;
        const toMax = a + (b - a) * 0.16;
        const toUltra = a + (b - a) * 0.34;
        if (progress < toMax)
          drawOverwrite(
            context,
            forms.plans.max,
            forms.fig,
            forms.max,
            span(progress, [a, toMax]),
            1,
            FORM_TONES.max,
            calm,
          );
        else if (progress < toUltra)
          drawOverwrite(
            context,
            forms.plans.max,
            forms.max,
            forms.ultra,
            span(progress, [toMax, toUltra]),
            1,
            FORM_TONES.ultra,
            calm,
          );
        else {
          // ULTRA and EXCELSIOR stand a little differently (owner,
          // 2026-10-12): their limbs are carried over a little at a time.
          const u = span(progress, [toUltra, toUltra + (b - toUltra) * 0.6]);
          const e = u * u * (3 - 2 * u);
          const wide = ([x, y]) => [(x * W + forms.pad) / forms.width, y];
          const own = FORM_LANDMARKS.figure.ultra.map(wide);
          const goal = FORM_LANDMARKS.figure.excelsior.map(wide);
          const mid = own.map(([x, y], i) => [x + (goal[i][0] - x) * e, y + (goal[i][1] - y) * e]);
          const box = { x: 0, y: 0, w: forms.width, h: H };
          for (const [sheetCanvas, picture, landmarks] of [
            [forms.warp[0], forms.ultra, own],
            [forms.warp[1], forms.excelsior, goal],
          ]) {
            const c = sheetCanvas.getContext("2d");
            c.setTransform(1, 0, 0, 1, 0, 0);
            c.clearRect(0, 0, forms.width, H);
            warpPicture(c, picture, box, landmarks, mid);
          }
          drawOverwrite(
            context,
            forms.plans.excelsior,
            forms.warp[0],
            forms.warp[1],
            span(progress, [toUltra, toUltra + (b - toUltra) * 0.6]),
            span(progress, [toUltra + (b - toUltra) * 0.38, b]),
            FORM_TONES.excelsior,
            calm,
            "shard",
          );
        }
      } else if (forms && form !== "excelsior") {
        const [a, b] = B.form;
        if (form === "max") {
          drawOverwrite(
            context,
            forms.plans.max,
            forms.fig,
            forms.max,
            span(progress, [a, b - 0.005]),
            1,
            FORM_TONES.max,
            calm,
          );
        } else {
          const quick = a + (b - a) * 0.3;
          if (progress < quick)
            drawOverwrite(
              context,
              forms.plans.max,
              forms.fig,
              forms.max,
              span(progress, [a, quick]),
              1,
              FORM_TONES.max,
              calm,
            );
          else
            drawOverwrite(
              context,
              forms.plans.ultra,
              forms.max,
              forms.ultra,
              span(progress, [quick, quick + (b - quick) * 0.62]),
              span(progress, [quick + (b - quick) * 0.42, b]),
              FORM_TONES.ultra,
              calm,
            );
        }
      }
      if (forms) context.restore();
    }

    // Motes, flights and welds of the tiles still to land.
    const { motes, moteCounts, art, artRects, flashes, flashCounts } = buffers;
    moteCounts.fill(0);
    flashCounts.fill(0);
    let arts = 0;
    for (let index = landed; index < tiles.length; index += 1) {
      const item = tiles[index];
      if (progress < item.m) continue;
      if (progress < item.t0) {
        // A mote: it fades in on RIDER！ and drifts a little toward its seat.
        const drift = 0.1 * clamp01((progress - item.m) / (item.t0 - item.m));
        const size = item.tone === 2 ? 4.5 : 3.2;
        const slot = (progress - item.m < 0.021 ? 0 : 3) + item.tone;
        const buffer = motes[slot];
        const at = moteCounts[slot];
        buffer[at] = item.ox + (item.cx - item.ox) * drift - size / 2;
        buffer[at + 1] = item.oy + (item.cy - item.oy) * drift - size / 2;
        buffer[at + 2] = size;
        buffer[at + 3] = size;
        moteCounts[slot] = at + 4;
        continue;
      }
      assemblyTilePose(item, progress, buffers.pose);
      const [left, top, w, h, u] = buffers.pose;
      if (u < 0.62 && coarse.matches) {
        const slot = item.tone + 3;
        const at = moteCounts[slot];
        motes[slot][at] = left;
        motes[slot][at + 1] = top;
        motes[slot][at + 2] = w * 0.84;
        motes[slot][at + 3] = h * 0.84;
        moteCounts[slot] = at + 4;
      } else if (u < 0.62) {
        // The mosaic: a nanite square of the plate's colour, a hair apart.
        context.globalAlpha = 0.45 + 0.5 * u;
        context.fillStyle = item.fill;
        context.fillRect(left + w * 0.08, top + h * 0.08, w * 0.84, h * 0.84);
      } else {
        art[arts] = index;
        artRects[arts * 4] = left;
        artRects[arts * 4 + 1] = top;
        artRects[arts * 4 + 2] = w;
        artRects[arts * 4 + 3] = h;
        arts += 1;
      }
    }
    const artCount = coarse.matches ? Math.min(arts, ASSEMBLY_TOUCH_ART_BUDGET) : arts;
    // Omitted texture draws remain luminous tiles, batched in three paths.
    // Every tile still welds into the complete, full-resolution figure.
    if (artCount < arts) {
      let selected = 0;
      for (let i = 0; i < arts; i += 1) {
        if (i === Math.floor((selected * arts) / artCount)) {
          selected += 1;
          continue;
        }
        const slot = tiles[art[i]].tone + 3;
        const at = moteCounts[slot];
        const o = i * 4;
        for (let j = 0; j < 4; j += 1) motes[slot][at + j] = artRects[o + j];
        moteCounts[slot] = at + 4;
      }
    }
    for (let slot = 0; slot < 6; slot += 1) {
      fillRects(context, motes[slot], moteCounts[slot], TONE_CSS[slot % 3], slot < 3 ? 0.36 : 0.78);
    }
    context.globalAlpha = 1;
    // In flight, a plate's tiles carry its gold unformed.
    const plates = raw || lights?.unlit || figure;
    for (let n = 0; n < artCount; n += 1) {
      const i = Math.floor((n * arts) / artCount);
      const item = tiles[art[i]];
      const o = i * 4;
      context.drawImage(
        plates,
        item.sx,
        item.sy,
        item.tw,
        item.th,
        artRects[o],
        artRects[o + 1],
        artRects[o + 2],
        artRects[o + 3],
      );
    }
    // A restrained bevel catches the approaching plate's edge. Two batched
    // paths, at most 64 tiles: no shadows, filters, or per-tile state stack.
    if (!calm && arts) {
      const count = Math.min(artCount, CONTACT_BUDGET);
      for (let edge = 0; edge < 2; edge += 1) {
        context.beginPath();
        for (let n = 0; n < count; n += 1) {
          const i = Math.floor((n * arts) / count);
          const item = tiles[art[i]];
          const u = clamp01((progress - item.t0) / (item.t1 - item.t0));
          if (u < 0.65 || u > 0.96) continue;
          const o = i * 4;
          const x = artRects[o];
          const y = artRects[o + 1];
          const w = artRects[o + 2];
          const h = artRects[o + 3];
          const inset = Math.min(w, h) * 0.14;
          if (edge === 0) {
            context.moveTo(x + inset, y + h - inset);
            context.lineTo(x + w - inset, y + h - inset);
            context.lineTo(x + w - inset, y + inset);
          } else {
            context.moveTo(x + inset, y + h * 0.45);
            context.lineTo(x + inset, y + inset);
            context.lineTo(x + w * 0.65, y + inset);
          }
        }
        context.globalAlpha = edge ? 0.5 : 0.55;
        context.strokeStyle = edge ? "rgb(228 248 255)" : "rgb(8 15 25)";
        context.lineWidth = edge ? 0.85 : 1.6;
        context.stroke();
      }
    }
    if (arts && !calm) {
      context.globalAlpha = 0.55;
      context.strokeStyle = TONE_CSS[0];
      context.lineWidth = 0.9;
      context.beginPath();
      for (let n = 0; n < artCount; n += 1) {
        const i = Math.floor((n * arts) / artCount) * 4;
        context.rect(artRects[i], artRects[i + 1], artRects[i + 2], artRects[i + 3]);
      }
      context.stroke();
    }
    // Welds: a hot core in each cell that has just landed, cooling to ice.
    for (let index = landed - 1; index >= 0; index -= 1) {
      const item = tiles[index];
      // Landed in order: going back, each weld is older than the last.
      const age = (progress - item.t1) / FLASH;
      if (age >= 1) break;
      const inset = item.tw * (0.12 + 0.2 * age);
      const slot = age < 0.34 ? 0 : age < 0.67 ? 1 : 2;
      const buffer = flashes[slot];
      const at = flashCounts[slot];
      buffer[at] = item.sx + inset;
      buffer[at + 1] = item.sy + inset;
      buffer[at + 2] = item.tw - inset * 2;
      buffer[at + 3] = item.th - inset * 2;
      flashCounts[slot] = at + 4;
    }
    if (calm) flashCounts.fill(0);
    fillRects(context, flashes[0], flashCounts[0], TONE_CSS[2], 0.62);
    fillRects(context, flashes[1], flashCounts[1], "rgb(190 244 255)", 0.36);
    fillRects(context, flashes[2], flashCounts[2], TONE_CSS[0], 0.18);

    // Each DEUS！: contact rolls across the landing plane, rather than a
    // front-facing circle covering the armor. Its duration is scroll-bound.
    context.lineWidth = 1.8;
    for (let beat = 0; beat < 5; beat += 1) {
      const done = plan.partDone[beat];
      const u = (progress - done) / 0.045;
      if (!done || u < 0 || u >= 1 || calm) continue;
      const [cx, cy] = plan.centroids[beat];
      context.globalAlpha = (1 - u) * 0.5;
      context.strokeStyle = RING_TONES[beat % 3];
      context.beginPath();
      context.save();
      context.translate(cx, cy);
      context.rotate(beat % 2 ? -0.12 : 0.12);
      context.scale(1, beat === 0 ? 0.25 : 0.48);
      context.arc(0, 0, 18 + 190 * easeOut(u), 0, Math.PI * 2);
      context.stroke();
      context.restore();
      // One short seam glint per landed group, bounded to five contacts.
      const contact = Math.max(0, 1 - u * 3);
      if (contact > 0) {
        context.globalAlpha = contact * 0.6;
        context.strokeStyle = "rgb(235 248 255)";
        context.beginPath();
        context.moveTo(cx - 10 - 18 * u, cy);
        context.lineTo(cx + 10 + 18 * u, cy);
        context.stroke();
      }
    }

    // REXONANCE DEUS！: the face fills with pixel squares, which scatter.
    const [visorX, visorY] = config.visor;
    const [fillFrom, burstTo] = B.pixels;
    if (pixels.length && progress >= fillFrom && progress < burstTo) {
      const fill = clamp01((progress - fillFrom) / 0.03);
      const burst = smooth(clamp01((progress - (burstTo - 0.04)) / 0.04));
      for (let group = 0; group < 6; group += 1) {
        if (fill * 6 < group + 0.5) continue;
        const [scale, turn] = BURSTS[group];
        const k = 1 + (scale - 1) * burst;
        context.save();
        context.translate(visorX, visorY);
        context.rotate((turn * Math.PI * burst) / 180);
        context.scale(k, k);
        context.translate(-visorX, -visorY);
        for (let tone = 0; tone < 3; tone += 1) {
          const rects = buffers.faces[group][tone];
          fillRects(context, rects, rects.length, TONE_CSS[tone], 0.95 * (1 - burst));
        }
        context.restore();
      }
    }

    // The core ignites and rings out.
    const [coreX, coreY] = config.core;
    const rings = B.rings;
    const ringFrom = Math.max(rings[0], B.light[0]);
    const ringEnd = form === "standard" || !form ? B.complete : B.form[1];
    if (!calm && progress >= ringFrom && progress < ringEnd) {
      const glow = Math.sin(Math.PI * span(progress, [ringFrom, ringEnd]));
      if (!buffers.glow) {
        buffers.glow = context.createRadialGradient(coreX, coreY, 0, coreX, coreY, 150);
        buffers.glow.addColorStop(0, "rgb(244 251 255 / 0.9)");
        buffers.glow.addColorStop(0.3, "rgb(121 232 255 / 0.45)");
        buffers.glow.addColorStop(1, "rgb(255 143 216 / 0)");
      }
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = glow;
      context.fillStyle = buffers.glow;
      context.fillRect(coreX - 150, coreY - 150, 300, 300);
      context.globalCompositeOperation = "source-over";
      for (let ring = 0; ring < 3; ring += 1) {
        const from = ringFrom + ring * (ringEnd - ringFrom) * 0.18;
        const u = clamp01((progress - from) / (ringEnd - from));
        if (u <= 0 || u >= 1) continue;
        context.globalAlpha = (1 - u) * 0.9;
        context.strokeStyle = RING_TONES[ring];
        context.lineWidth = 5 * (1 - u) + 1;
        context.beginPath();
        context.arc(coreX, coreY, 24 + 560 * easeOut(u), 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  };

  /* ---------------- the HUD (written only when it changes) ---------------- */
  const setFlag = (element, name, on) => {
    if (on) {
      if (!element.hasAttribute(name)) element.setAttribute(name, "");
    } else if (element.hasAttribute(name)) element.removeAttribute(name);
  };
  const updateHud = (progress) => {
    const B = ASSEMBLY_BEATS;
    const line =
      progress < B.scan[1]
        ? 0
        : progress < B.motes[1]
          ? 1
          : progress < B.deus[1]
            ? 2
            : progress < B.rexonance[1]
              ? 3
              : 4;
    const deusDone = plan.partDone.slice(0, 4).filter((done) => progress >= done).length;
    const chips = `${deusDone}:${Math.floor(span(progress, B.rexonance) * 4)}`;
    if (line !== hud.line || chips !== hud.chips) {
      if (line !== hud.line) runway.dataset.rznLine = String(line);
      hud.line = line;
      hud.chips = chips;
      lines.forEach(({ line: element, chips: units }, index) => {
        setFlag(element, "data-on", index === line);
        setFlag(element, "data-done", index < line);
        const lit =
          index === 2 ? deusDone : index === 3 ? Math.floor(span(progress, B.rexonance) * 4) : 0;
        units.forEach((unit, unitIndex) =>
          setFlag(
            unit,
            "data-on",
            index < line ||
              (units.length > 1 && unitIndex < lit) ||
              (units.length === 1 && index === line),
          ),
        );
      });
    }
    const landed = plan.partDone.filter((done) => done && progress >= done).length;
    if (landed !== hud.parts) {
      hud.parts = landed;
      parts.forEach((part, index) =>
        setFlag(part, "data-on", progress >= (plan.partDone[index] || 2)),
      );
    }
    const share = String(Math.round(100 * clamp01(progress / B.complete))).padStart(3, "0");
    if (percent && share !== hud.percent) {
      hud.percent = share;
      writeText(percent, share);
    }
    const count = `${grouped(landedBy(progress))} / ${grouped(plan.tiles.length)}`;
    if (counter && count !== hud.count) {
      hud.count = count;
      writeText(counter, count);
    }
    const complete = progress >= B.complete;
    if (complete !== hud.complete) {
      hud.complete = complete;
      setFlag(runway, "data-rzn-complete", complete);
    }
    const form = runway.dataset.form || "standard";
    const state = assemblyPhase(progress, form, form === "standard" || Boolean(formsState?.[form]));
    if (state.phase !== hud.phase) {
      hud.phase = state.phase;
      runway.dataset.rznPhase = state.phase;
    }
    if (state.complete !== hud.formComplete) {
      hud.formComplete = state.complete;
      if (state.complete) runway.dataset.rznFormComplete = "true";
      else delete runway.dataset.rznFormComplete;
    }
  };

  // The MAX / ULTRA figures and their overwrite plans, loaded the first time
  // a form other than Rexonance is chosen (null until then).
  let formsState = null;
  let formsLoading = false;
  const formFigures = () => {
    if (formsState || formsLoading || !config.forms || !images) return formsState;
    formsLoading = true;
    const picture = (src) =>
      new Promise((resolve, reject) => {
        const image = new environment.Image();
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
    Promise.all([
      picture(config.forms.max),
      picture(config.forms.ultra),
      config.forms.excelsior ? picture(config.forms.excelsior).catch(() => null) : null,
    ])
      .then(([maxImage, ultraImage, excelsiorImage]) => {
        if (disposed) return;
        // Every form on one wide sheet: the figure's frame at x = pad (the
        // EXCELSIOR picture is that wide already).
        const pad = config.forms.pad || 0;
        const wide = W + pad * 2;
        const sheet = (image, at) => {
          const canvas = Object.assign(document.createElement("canvas"), {
            width: wide,
            height: H,
          });
          if (image)
            canvas.getContext("2d").drawImage(image, at, 0, image === excelsiorImage ? wide : W, H);
          return canvas;
        };
        const fig = sheet(images.figure, pad);
        const max = sheet(maxImage, pad);
        const ultra = sheet(ultraImage, pad);
        const excelsior = excelsiorImage ? sheet(excelsiorImage, 0) : null;
        const base = {
          width: wide,
          height: H,
          cell: 8,
          origin: [config.core[0] + pad, config.core[1]],
          seed: 77,
        };
        const grid = planOverwrite(base);
        const fromCells = sampleCells(max, grid, document);
        const toCells = sampleCells(ultra, grid, document);
        const ultraCells = toCells;
        const excelsiorCells = excelsior ? sampleCells(excelsior, grid, document) : null;
        formsState = {
          pad,
          width: wide,
          fig,
          max,
          ultra,
          excelsior,
          warp: [0, 1].map(() =>
            Object.assign(document.createElement("canvas"), { width: wide, height: H }),
          ),
          plans: {
            max: grid,
            ultra:
              fromCells && toCells
                ? planOverwrite({ ...base, seed: 78, samples: { from: fromCells, to: toCells } })
                : grid,
            excelsior:
              ultraCells && excelsiorCells
                ? planOverwrite({
                    ...base,
                    seed: 79,
                    order: "descend",
                    extraBy: "difference",
                    samples: { from: ultraCells, to: excelsiorCells },
                  })
                : planOverwrite({ ...base, seed: 79, order: "descend" }),
          },
        };
        lastProgress = -1;
        schedule();
      })
      .catch(() => undefined);
    return null;
  };
  const formObserver =
    typeof environment.MutationObserver === "function"
      ? new environment.MutationObserver(() => {
          // A selected form changes CSS figure limits without changing the
          // canvas's border box, so ResizeObserver alone cannot update fit.
          if (live) measure();
          lastProgress = -1;
          schedule();
        })
      : null;
  formObserver?.observe(runway, { attributes: true, attributeFilter: ["data-form"] });

  const render = () => {
    frame = 0;
    if (disposed || !live || document.hidden || !view) return;
    const progress = readProgress();
    if (pendingSize) {
      const [width, height] = pendingSize;
      pendingSize = null;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      lastProgress = -1;
    }
    if (Math.abs(progress - lastProgress) < 0.0005) return;
    lastProgress = progress;
    draw(progress);
    updateHud(progress);
    // Once the scroll rests, redraw the moment without its transient squares.
    environment.clearTimeout(calmTimer);
    calmTimer = environment.setTimeout(() => {
      calmTimer = 0;
      if (
        !disposed &&
        live &&
        near &&
        pageActive &&
        !document.hidden &&
        view &&
        images &&
        plan &&
        lastProgress >= 0
      )
        draw(lastProgress, true);
    }, CALM_MS);
    if (behind) {
      lastProgress = -1;
      schedule();
    }
  };
  const schedule = () => {
    if (!frame && live && near && pageActive && !document.hidden)
      frame = environment.requestAnimationFrame(render);
  };
  const onScroll = () => schedule();
  const relayout = () => {
    if (!live) return;
    if (measure()) {
      lastProgress = -1;
      schedule();
    }
  };
  const resizeObserver =
    typeof environment.ResizeObserver === "function"
      ? new environment.ResizeObserver(relayout)
      : null;

  let listening = false;
  const listen = (on) => {
    if (on === listening) return;
    listening = on;
    if (on) {
      environment.addEventListener("scroll", onScroll, { passive: true });
      environment.addEventListener("resize", onScroll, { passive: true });
    } else {
      environment.removeEventListener("scroll", onScroll);
      environment.removeEventListener("resize", onScroll);
      if (frame) environment.cancelAnimationFrame(frame);
      frame = 0;
      environment.clearTimeout(calmTimer);
      calmTimer = 0;
    }
  };

  const goLive = () => {
    if (disposed || !pageActive || live || !near || document.hidden || !images || !motionAllowed())
      return;
    if (!plan || !settled || !buffers) return;
    live = true;
    runway.dataset.rznState = "live";
    lastProgress = -1;
    listen(near);
    // The canvas shows only now: it is measured once laid out, from the
    // observer's first notice (a read here would force the layout).
    if (resizeObserver) {
      resizeObserver.observe(canvas);
      resizeObserver.observe(runway);
    } else if (measure()) schedule();
  };
  const goStill = () => {
    cancelPreparation();
    live = false;
    listen(false);
    resizeObserver?.disconnect();
    delete runway.dataset.rznState;
    delete runway.dataset.rznLine;
    delete runway.dataset.rznPhase;
    delete runway.dataset.rznFormComplete;
    setFlag(runway, "data-rzn-complete", false);
    for (const { line, chips } of lines) {
      setFlag(line, "data-on", false);
      setFlag(line, "data-done", false);
      chips.forEach((chip) => setFlag(chip, "data-on", false));
    }
    parts.forEach((part) => setFlag(part, "data-on", false));
    Object.assign(hud, {
      line: -1,
      chips: "",
      parts: -1,
      percent: "",
      count: "",
      complete: null,
      phase: "",
      formComplete: null,
    });
    if (percent) writeText(percent, restPercent);
    if (counter) writeText(counter, restCount);
    pendingSize = null;
    canvas.width = canvas.height = 0;
    if (settled) settled.width = settled.height = 0;
    settled = null;
    plan = null;
    for (const sheet of [raw, goldArt, goldLayer, driver])
      if (sheet) sheet.width = sheet.height = 0;
    raw = goldArt = goldLayer = goldPlan = driver = lights = null;
    goldCount = 0;
    goldReverse.dirty = -1;
    goldReverse.at = 0;
    buffers = null;
    view = null;
  };

  let preparing = null;
  const wake = () => {
    if (disposed || !pageActive || live || !motionAllowed() || document.hidden) return;
    if (plan && settled && buffers) {
      goLive();
      return;
    }
    if (preparing) return;
    const token = generation;
    if (near) runway.dataset.rznState = "loading";
    preparing = idleTask(() => images || load())
      .then(() => {
        if (token === generation && images) return build();
      })
      .then(() => {
        if (token === generation) goLive();
      })
      .catch(() => {
        loading = null;
        if (!disposed && !live) delete runway.dataset.rznState;
      })
      .finally(() => {
        if (token === generation) preparing = null;
      });
  };
  const nearObserver =
    typeof environment.IntersectionObserver === "function"
      ? new environment.IntersectionObserver(
          (entries) => {
            for (const entry of entries) near = entry.isIntersecting;
            if (disposed) return;
            if (near) wake();
            listen(near && live);
            schedule();
          },
          { rootMargin: "25% 0px 25% 0px" },
        )
      : null;
  let warmObserver = null;
  const observeWarmup = () => {
    warmObserver?.disconnect();
    if (!environment.IntersectionObserver) return;
    // IO percentages are relative to width, not height: use viewport px.
    warmObserver = new environment.IntersectionObserver(
      (entries) => {
        if (disposed) return;
        warm = entries.some((entry) => entry.isIntersecting);
        if (warm) wake();
      },
      { rootMargin: `${Math.round((environment.innerHeight || 900) * 3.5)}px 0px` },
    );
    warmObserver.observe(runway);
  };

  const sync = () => {
    if (disposed) return;
    if (!motionAllowed()) {
      goStill();
      return;
    }
    if (document.hidden) {
      cancelPreparation();
      if (frame) environment.cancelAnimationFrame(frame);
      frame = 0;
      environment.clearTimeout(calmTimer);
      calmTimer = 0;
      return;
    }
    if (warm || near) wake();
    lastProgress = -1;
    schedule();
  };
  const onPageHide = () => {
    pageActive = false;
    cancelPreparation();
    if (frame) environment.cancelAnimationFrame(frame);
    frame = 0;
    environment.clearTimeout(calmTimer);
    calmTimer = 0;
  };
  const onPageShow = () => {
    pageActive = true;
    sync();
  };
  const htmlObserver = new environment.MutationObserver(sync);
  htmlObserver.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
  reduced.addEventListener?.("change", sync);
  forcedColors.addEventListener?.("change", sync);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", onPageShow);
  environment.addEventListener("resize", observeWarmup);
  nearObserver?.observe(runway);
  observeWarmup();
  if (!nearObserver) {
    near = warm = true;
    wake();
  }

  return () => {
    disposed = true;
    goStill();
    nearObserver?.disconnect();
    warmObserver?.disconnect();
    htmlObserver.disconnect();
    reduced.removeEventListener?.("change", sync);
    forcedColors.removeEventListener?.("change", sync);
    connection?.removeEventListener?.("change", sync);
    document.removeEventListener("visibilitychange", sync);
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", onPageShow);
    environment.removeEventListener("resize", observeWarmup);
    images?.figure?.close?.();
    images?.undersuit?.close?.();
    images?.gold?.close?.();
    images?.atlas?.close?.();
    formObserver?.disconnect();
    environment.clearTimeout(calmTimer);
    formsState = null;
    images = null;
    for (const sheet of [raw, goldArt, goldLayer, driver])
      if (sheet) sheet.width = sheet.height = 0;
    raw = goldArt = goldLayer = goldPlan = driver = lights = null;
  };
}
