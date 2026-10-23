import {
  FORM_LANDMARKS,
  FORM_TONES,
  drawOverwrite,
  planOverwrite,
  sampleCells,
  warpPicture,
} from "./rexonance-overwrite.js";
import { createSplitLightsJob, supportsCpuPreparation } from "./rexonance-unlit.js";
import {
  drawBodyFlame,
  drawFlameHeat,
  drawNaniteFlame,
  prepareBodyFlame,
  warmNaniteFlame,
} from "./rexonance-flame.js";
import { naniteFlameEnvelope } from "./rexonance-ignition.js";
import { releasePendingImage } from "./release-pending-images.js";
import { FIELD_WAKE, REXONANCE_SCROLL_FLAME, scrollFlameAt } from "./rexonance-field/field-clock.js";
import { PLAYHEAD, ScrollPlayhead } from "./scroll-playhead.js";
import {
  createReactorLayers,
  deferReactorPieces,
  drawReactorFormation,
  repaintReactorArt,
} from "./rexonance-reactor-scroll.js";
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

/** The host's final text reserves the width; don't print fake leading zeroes. */
export function formatCount(template, current) {
  const value = Math.min(template.value, Math.max(0, current));
  const [whole, fraction] = value.toFixed(template.decimals).split(".");
  let printed = whole;
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
  // The preferences as their change events last reported them (sweep 2,
  // F24): reading a listened list's `.matches` refreshes Chromium's cached
  // result, and a change read that way before the next style recalc never
  // fires its event. Only the listeners read the lists after this.
  const mediaNow = (list, event) =>
    typeof event?.matches === "boolean" ? event.matches : Boolean(list.matches);
  let reducedNow = mediaNow(reduced);
  let fineNow = mediaNow(finePointer);
  let forcedNow = mediaNow(forcedColors);

  const motionAllowed = () => {
    const constrained =
      Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    return !reducedNow && !constrained && html.dataset.worldEffects !== "economy";
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
  // The figures are read when the layer mounts and again whenever the page
  // adds some (owner, 2026-10-17: the 01 comparison and the P14 read-outs
  // are re-rendered with their baseline, so their percentages were never
  // counted — "skipped"). A figure the page removes is dropped.
  const figures = [];
  const byHost = new Map();
  const queued = new Set();
  let countFrame = 0;
  let armedMode = false;
  const collect = () => {
    for (const host of page.querySelectorAll("[data-rsn-count]")) {
      if (byHost.has(host)) continue;
      const overlay = host.querySelector(".rsn-count");
      const node = overlay
        ? [...overlay.childNodes].find((child) => child.nodeType === 3 && /\d/.test(child.data))
        : null;
      const template = node ? countTemplate(node.data) : null;
      if (!template) continue;
      const figure = {
        host,
        node,
        rendered: node.data,
        template,
        duration: host.closest(".rxs-headline-metrics") ? COUNT_MS : READOUT_MS,
        state: "idle",
        start: 0,
        printed: node.data,
        lockTimer: 0,
      };
      figures.push(figure);
      byHost.set(host, figure);
      ensureCountObserver();
      if (armedMode) armFigure(figure);
    }
  };
  const prune = () => {
    for (let index = figures.length - 1; index >= 0; index -= 1) {
      const figure = figures[index];
      if (figure.host.isConnected !== false) continue;
      environment.clearTimeout(figure.lockTimer);
      countObserver?.unobserve(figure.host);
      queued.delete(figure);
      byHost.delete(figure.host);
      figures.splice(index, 1);
    }
  };

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
  // Made with the first figure, so a page that renders its figures later
  // still gets one.
  const ensureCountObserver = () => {
    if (countObserver || !environment.IntersectionObserver) return;
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
  };
  const armFigure = (figure) => {
    if (figure.state !== "idle") return;
    ensureCountObserver();
    if (!countObserver) return;
    setState(figure, "armed");
    print(figure, formatCount(figure.template, 0));
    countObserver.observe(figure.host);
  };
  const arm = () => {
    // Forced colours paint the figures' own text; the counters never show.
    if (forcedNow) return;
    armedMode = true;
    for (const figure of figures) armFigure(figure);
  };
  collect();
  const stopCounts = () => {
    if (countFrame) environment.cancelAnimationFrame(countFrame);
    countFrame = 0;
    for (const figure of figures) {
      if (figure.state === "count" || figure.state === "lock") settle(figure);
    }
  };
  // Motion withdrawn: every figure is its own text again, at once.
  const disarm = () => {
    armedMode = false;
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
    if (fineNow) pointerStart();
    else pointerStop();
  };
  const onReduced = (event) => {
    reducedNow = mediaNow(reduced, event);
    sync();
  };
  const onFinePointer = (event) => {
    fineNow = mediaNow(finePointer, event);
    sync();
  };
  // Forced colours switched on: hand the figures back, as for reduced motion.
  const onForcedColors = (event) => {
    forcedNow = mediaNow(forcedColors, event);
    if (forcedNow) disarm();
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
  reduced.addEventListener?.("change", onReduced);
  finePointer.addEventListener?.("change", onFinePointer);
  forcedColors.addEventListener?.("change", onForcedColors);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", sync);
  // Figures the page renders later (a comparison or P14 baseline change
  // replaces its block): read on the next DOM change, dropped when gone.
  const figureObserver = environment.MutationObserver
    ? new environment.MutationObserver(() => {
        if (disposed) return;
        prune();
        collect();
      })
    : null;
  figureObserver?.observe(page, { childList: true, subtree: true });
  sync();

  return () => {
    disposed = true;
    htmlObserver.disconnect();
    figureObserver?.disconnect();
    formObserver?.disconnect();
    sceneObserver?.disconnect();
    reduced.removeEventListener?.("change", onReduced);
    finePointer.removeEventListener?.("change", onFinePointer);
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
   belongs to the suit piece whose painted mask covers it, so the order
   follows the module's piece list whatever its granularity (only each
   piece's id, group, box and seat are read). Over the bare undersuit:

   - FAR UP！ a scan wakes the undersuit, top to bottom, as the fire
     kindles at its soles and climbs it (REXONANCE_SCROLL_FLAME,
     rexonance-field/field-clock.js);
   - RIDER！ the fire covers the undersuit whole, bursts, and its
     fragments cool into the nanites (the field's particles and every
     tile, hanging in the air round the body) before the first DEUS！;
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
  // FAR FROM's floating units (ファーフロムビット) form with the ornaments.
  bits: 4,
  helm: 5,
};
const WELDS_PER_FRAME = 160;
const GOLD_PER_FRAME = 900;
// The scroll has rested this long: the transient squares are cleared.
const CALM_MS = 260;
// The nanite count's word while the scene prepares (the stand-in's HUD).
export const ASSEMBLY_LOADING_COUNT = "STANDBY";
const LOADING_COUNT = ASSEMBLY_LOADING_COUNT;
// The field's density steps between the governor's half and whole: one a
// frame, so a change takes ten frames, never one.
const FIELD_LEVELS = 10;
// The gold's heat: incoming motes, then a locked cell cooling, then the glint.
const GOLD_HEAT = [
  ["rgb(255 246 216)", 0.9],
  ["rgb(255 246 216)", 0.85],
  ["rgb(255 198 66)", 0.6],
  ["rgb(224 138 30)", 0.35],
  ["rgb(255 253 243)", 0.42],
];
export const ASSEMBLY_TOUCH_ART_BUDGET = 64;
// (The nanite swarm's timings and budgets live with the swarm, in
// rexonance-assembly-nanites.js, which the scene loads with its pictures:
// round 3, the still tiers never download it.)
const PIXEL_BUDGET = 2_600_000;
const TONES = [
  [121, 232, 255],
  [255, 143, 216],
  [244, 251, 255],
];
const RING_TONES = ["rgb(121 232 255)", "rgb(182 163 255)", "rgb(242 216 150)"];


const grouped = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const REACTOR_RADIUS = 40;
const REACTOR_SWIRL = [0.74, 0.82];
const REACTOR_SOCKET_FADE = [0.16, 0.24];
const REACTOR_MOTES = ["rgb(240 207 134)", "rgb(150 236 255)", "rgb(255 143 216)"];
const LIGHT_ARMS = ["rgb(150 236 255)", "rgb(255 143 216)"];
const CORE_GLOW = ["rgb(244 251 255 / 0.9)", "rgb(121 232 255 / 0.45)", "rgb(255 143 216 / 0)"];
/**
 * The scene's palette (FAR FROM, 2026-10-22: the same engine plays its
 * suit-up in ice, gold and white): the three tones the chips, the mosaic
 * and the pixel squares take, the core's rings, the reactor's motes, the
 * light's arms and the core's glow, the field's tones (its layer's) and the
 * swarm's (rexonance-assembly-nanites.js). Rexonance's by default; a page
 * passes `config.palette` with any of them.
 */
export function assemblyPalette(palette = null) {
  const tones = palette?.tones ?? TONES;
  return {
    tones,
    toneCss: tones.map(([r, g, b]) => `rgb(${r} ${g} ${b})`),
    rings: palette?.rings ?? RING_TONES,
    reactorMotes: palette?.reactorMotes ?? REACTOR_MOTES,
    lightArms: palette?.lightArms ?? LIGHT_ARMS,
    coreGlow: palette?.coreGlow ?? CORE_GLOW,
    field: palette?.field ?? null,
    nanites: palette?.nanites ?? null,
  };
}
const PRIMER_LEAD = 0.035;
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
  // MAX, ULTRA, EXCELSIOR — or the keys of a page's own chain of forms
  // (FAR FROM: ハイ, エックスハイ, マックス).
  const advanced = Boolean(form) && form !== "standard";
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
  // The figure without its ornaments, sampled like `sample` (owner,
  // 2026-10-16): the armour's tiles come from it, whole; the `ornaments`
  // groups' tiles form over them from the full figure.
  baseSample = null,
  ornaments = null,
  // The chips' tones (assemblyPalette): the mosaic is lit toward them.
  tones = TONES,
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
  const ornament = new Set(ornaments ?? []);
  const armour = baseSample ? ranked.filter((entry) => !ornament.has(entry.piece.group)) : null;
  const ornamentEntries = ranked.filter((entry) => ornament.has(entry.piece.group));
  const nearestSeat = (candidates, cx, cy) => {
    let owner = null;
    let best = Number.POSITIVE_INFINITY;
    for (const entry of candidates) {
      const distance = (entry.piece.seat[0] - cx) ** 2 + (entry.piece.seat[1] - cy) ** 2;
      if (distance < best) {
        best = distance;
        owner = entry;
      }
    }
    return owner;
  };
  const tiles = [];
  // The owner of a cell among `candidates`: the atlas is front-first, so
  // the vote is over the actual painted mask, not the smallest rectangle (a
  // gauntlet's box also contains ribbons); without masks, the nearest seat.
  const ownerOf = (candidates, sx, sy, tw, th, cx, cy) => {
    let owner = null;
    let coverage = 0;
    for (const entry of candidates) {
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
      for (const entry of candidates) {
        const distance = (entry.piece.seat[0] - cx) ** 2 + (entry.piece.seat[1] - cy) ** 2;
        if (distance < best) {
          best = distance;
          owner = entry;
        }
      }
    }
    return owner;
  };
  // `src`: 0 the base figure (the armour), 1 the full figure; `cov` the
  // tile's sampled alpha (a landing nanite never stands past the art).
  const place = (owner, sx, sy, tw, th, cx, cy, rgb, src, cov = 1) => {
    // The driver is drawn whole from its cut-outs, never as tiles.
    if (owner?.preset) return;
    const reach = owner ? Math.hypot(cx - owner.piece.seat[0], cy - owner.piece.seat[1]) : 0;
    if (owner) owner.reach = Math.max(owner.reach, reach);
    tiles.push({
      sx,
      sy,
      tw,
      th,
      cx,
      cy,
      owner,
      pieceId: owner?.piece.id ?? null,
      reach,
      rgb,
      src,
      cov,
    });
  };
  for (let row = 0; row < rows; row += 1) {
    if (row && row % 4 === 0) yield;
    for (let col = 0; col < cols; col += 1) {
      const sx = col * tile;
      const sy = row * tile;
      const tw = Math.min(tile, width - sx);
      const th = Math.min(tile, height - sy);
      const cx = sx + tw / 2;
      const cy = sy + th / 2;
      const offset = (row * cols + col) * 4;
      // The armour, whole, from the figure without its ornaments: under
      // where an ornament will form, the plate it hides is there first.
      let under = false;
      if (armour && baseSample.data[offset + 3] >= 40) {
        const owner = ownerOf(armour, sx, sy, tw, th, cx, cy);
        if (owner) {
          const d = baseSample.data;
          place(
            owner,
            sx,
            sy,
            tw,
            th,
            cx,
            cy,
            [d[offset], d[offset + 1], d[offset + 2]],
            0,
            d[offset + 3] / 255,
          );
          under = true;
        }
      }
      let rgb = tones[0];
      if (sample) {
        if (sample.data[offset + 3] < 40) continue;
        rgb = [sample.data[offset], sample.data[offset + 1], sample.data[offset + 2]];
      }
      let owner = ownerOf(ranked, sx, sy, tw, th, cx, cy);
      // A painted cell where the base shows nothing is an ornament's (a
      // ribbon's strand beside the knee, the cloth between the legs), even
      // where an armour plate's cut-out mask reaches over it: an armour
      // tile is only ever the base figure's. The ornament whose mask claims
      // it, else the nearest ornament's seat, says whose, so it lands with
      // the ornaments — not with the legs by its height (owner, 2026-10-16:
      // the decoration beside the knees showed before it was fitted).
      if (
        armour &&
        baseSample.data[offset + 3] < 40 &&
        ornamentEntries.length &&
        !(owner && ornament.has(owner.piece.group))
      )
        owner =
          ownerOf(ornamentEntries, sx, sy, tw, th, cx, cy) ?? nearestSeat(ornamentEntries, cx, cy);
      // Failed sampling still has the authored plate silhouette; never
      // turn its transparent background into a rectangular tile swarm.
      if (!sample && masked && !owner) continue;
      // Over the armour, only an ornament's cell forms again (from the full
      // figure); a cell the armour already holds is done.
      if (under && !(owner && ornament.has(owner.piece.group))) continue;
      place(owner, sx, sy, tw, th, cx, cy, rgb, 1, sample ? sample.data[offset + 3] / 255 : 1);
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
  // Each beat's last tile to land: its lock strikes where that tile's plate
  // seats (sweep 2, F30: a two-sided group's centroid is the gap on the
  // body's midline, between the shins, on no plate).
  const lastTile = ASSEMBLY_PARTS.map(() => null);
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
    // Within a DEUS！ the pieces still land bottom first, but each piece's
    // tiles spread along the scroll from its seat outward (owner,
    // 2026-10-15: a slow scroll lands a band at a time, not a whole piece at
    // one notch), so neighbouring pieces overlap in flight.
    const key = clamp01(
      beat === 5
        ? (1 - Math.hypot(item.cx - eyeX, item.cy - eyeY) / helmReach) * 0.9 + random() * 0.1
        : (item.owner?.rank ?? 0) * 0.36 +
            (item.reach / (item.owner?.reach ?? 1)) * 0.54 +
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
    const tint = tones[item.tone];
    const mix = (channel) => Math.round(item.rgb[channel] * 0.55 + tint[channel] * 0.45);
    item.fill = `rgb(${mix(0)} ${mix(1)} ${mix(2)})`;
    item.spin = (random() - 0.5) * 1.2;
    // Each plate shares an approach plane. Tile-local variation is seeded
    // without consuming the timing PRNG, preserving every landing beat.
    const plane = ((Math.imul((item.owner?.index ?? beat) + 1, 2654435761) >>> 0) % 997) / 997;
    // The mote's own phase in the hovering cloud's slow swirl (seeded the
    // same way, so every landing beat is as it was).
    item.phase = (((Math.imul(index + 7, 2246822519) >>> 0) % 1024) / 1024) * Math.PI * 2;
    item.depth = 0.35 + plane * 0.65;
    item.curveX = (item.cx < width / 2 ? -1 : 1) * height * (0.025 + plane * 0.035);
    item.curveY = -height * (0.018 + plane * 0.018);
    if (item.t1 >= partDone[beat]) {
      partDone[beat] = item.t1;
      lastTile[beat] = item;
    }
    centroids[beat][0] += item.cx;
    centroids[beat][1] += item.cy;
    centroids[beat][2] += 1;
    delete item.owner;
    delete item.reach;
    delete item.rgb;
  }
  tiles.sort((a, b) => a.t1 - b.t1);
  // Each piece's landing window, with its box (owner, 2026-10-16: just
  // before a part is fitted, the frame of its gold appears where it will
  // sit). Sorted by when the first tile flies.
  const windows = new Map();
  for (const item of tiles) {
    if (!item.pieceId) continue;
    const window = windows.get(item.pieceId);
    if (!window) windows.set(item.pieceId, { from: item.t0, to: item.t1 });
    else {
      if (item.t0 < window.from) window.from = item.t0;
      if (item.t1 > window.to) window.to = item.t1;
    }
  }
  const frames = pieces
    .filter((piece) => windows.has(piece.id) && !piece.preset)
    .map((piece) => ({ x: piece.x, y: piece.y, w: piece.w, h: piece.h, ...windows.get(piece.id) }))
    .sort((a, b) => a.from - b.from);
  const means = centroids.map(([x, y, n]) => (n ? [x / n, y / n] : [coreX, coreY]));
  const seats = new Map(pieces.map((piece) => [piece.id, piece.seat]));
  return {
    tiles,
    cols,
    rows,
    tile,
    partDone,
    centroids: means,
    anchors: lastTile.map((item, beat) => {
      const seat = item && seats.get(item.pieceId);
      return seat ? [seat[0], seat[1]] : item ? [item.cx, item.cy] : means[beat];
    }),
    frames,
  };
}

/** The gold's frame (owner, 2026-10-16): a wireframe of the gold trims —
 * white-ice at their edges, a second fainter edge inside, the faintest ice
 * across the trim — traced from the gold art's alpha, one row at a time. */
export function traceGoldFrameRow(source, target, deep, y, width, height) {
  const edge = 90;
  const row = y * width;
  for (let x = 0; x < width; x += 1) {
    const i = (row + x) * 4;
    if (source[i + 3] < edge) continue;
    const open = (dx, dy) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx < 0 || ny < 0 || nx >= width || ny >= height
        ? true
        : source[((ny * width + nx) << 2) + 3] < edge;
    };
    // The trims' edge in white gold, a gold line inside it, an ice haze
    // across the trim: the gold's own shape, as a hologram. `deep` is the
    // same shape in dark gold: drawn offset beneath, its extruded depth.
    let r;
    let g;
    let b;
    let a;
    let dr;
    let dg;
    let db;
    let da;
    if (open(1, 0) || open(-1, 0) || open(0, 1) || open(0, -1)) {
      r = 255;
      g = 241;
      b = 200;
      a = 240;
      dr = 150;
      dg = 98;
      db = 30;
      da = 230;
    } else if (open(2, 0) || open(-2, 0) || open(0, 2) || open(0, -2)) {
      r = 255;
      g = 212;
      b = 118;
      a = 150;
      dr = 110;
      dg = 72;
      db = 24;
      da = 170;
    } else {
      // The trim's face: an ice haze on the lit sheet; nothing in the
      // depth (an extruded face would only muddy the trim).
      r = 121;
      g = 232;
      b = 255;
      a = 44;
      dr = 0;
      dg = 0;
      db = 0;
      da = 0;
    }
    target[i] = r;
    target[i + 1] = g;
    target[i + 2] = b;
    target[i + 3] = a;
    if (deep) {
      deep[i] = dr;
      deep[i + 1] = dg;
      deep[i + 2] = db;
      deep[i + 3] = da;
    }
  }
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
  // The gold waits for its plate to clamp and its seam to ignite (owner,
  // 2026-10-16: 超大幅な改善 — the pour runs through the printed conduit).
  delay: 0.008,
  form: 0.03,
  // The helmet's gold runs sooner and quicker (round 3, review: the visor's
  // pour still crossed the brow as the compound eyes filled at .855): from
  // .005 after its last tile, over .010 — whole by about .852.
  helmDelay: 0.005,
  helm: 0.01,
  approach: 0.007,
  cool: 0.012,
  glint: 0.006,
};

// Trims from different plate grids overlap even when each individual grid
// is disjoint. Prepare their neighbors once, never search the suit per frame.
function* goldOverlapSteps(g, cell) {
  const lists = Array.from({ length: g.count }, () => []);
  const bins = new Map();
  let work = 0;
  for (let i = 0; i < g.count; i += 1) {
    const bx = Math.floor(g.x[i] / cell);
    const by = Math.floor(g.y[i] / cell);
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const bucket = bins.get(`${bx + dx},${by + dy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (++work % 128 === 0) yield;
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
    if (++work % 128 === 0) yield;
  }
  for (let i = 0; i < lists.length; i += 1) {
    lists[i] = Int32Array.from(lists[i]);
    if (++work % 128 === 0) yield;
  }
  return lists;
}

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

/** Preparation checkpoints include grid walks, sorting and overlap lookup.
 * The synchronous wrapper and idle runtime consume the same exact plan. */
export function* assemblyGoldPlanSteps({ pieces, gold, landed, tiles }) {
  if (!gold?.cells) return null;
  let work = 0;
  if (!landed) {
    landed = new Map();
    for (const item of tiles) {
      if (item.pieceId) landed.set(item.pieceId, Math.max(landed.get(item.pieceId) ?? 0, item.t1));
      if (++work % 128 === 0) yield;
    }
  }
  const G = gold.cell;
  const list = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const base64 = gold.cells[piece.id];
    const done = landed.get(piece.id);
    if (!base64 || piece.preset || done === undefined) continue;
    const bits = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const cols = Math.ceil(piece.w / G);
    const rows = Math.ceil(piece.h / G);
    const grid = new Int32Array(cols * rows).fill(-1);
    const col = [];
    const row = [];
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const bit = r * cols + c;
        if (++work % 128 === 0) yield;
        if (!(bits[bit >> 3] & (1 << (bit & 7)))) continue;
        grid[bit] = col.length;
        col.push(c);
        row.push(r);
      }
    const n = col.length;
    if (!n) continue;
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
        if (++work % 128 === 0) yield;
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
        if (++work % 128 === 0) yield;
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
    for (let i = 0; i < n; i += 1) {
      most = Math.max(most, reach[i]);
      if (++work % 128 === 0) yield;
    }
    const helm = piece.group === "helm";
    const from = done + (helm ? ASSEMBLY_GOLD.helmDelay : ASSEMBLY_GOLD.delay);
    const span = helm ? ASSEMBLY_GOLD.helm : ASSEMBLY_GOLD.form;
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
        index,
      ]);
      if (++work % 128 === 0) yield;
    }
  }
  // Stable merge sort preserves the previous native sort's equal-lock order
  // while exposing checkpoints instead of one uninterruptible sort task.
  let sorted = list;
  let scratch = new Array(list.length);
  for (let width = 1; width < list.length; width *= 2) {
    for (let start = 0; start < list.length; start += width * 2) {
      const mid = Math.min(start + width, list.length);
      const end = Math.min(start + width * 2, list.length);
      let left = start;
      let right = mid;
      for (let at = start; at < end; at += 1) {
        scratch[at] =
          right >= end || (left < mid && sorted[left][4] <= sorted[right][4])
            ? sorted[left++]
            : sorted[right++];
        if (++work % 128 === 0) yield;
      }
    }
    [sorted, scratch] = [scratch, sorted];
  }
  const fields = Array.from({ length: 7 }, () => new Float32Array(list.length));
  // Each cell names its plate (the conduit and its clamps are per plate).
  const piece = new Int16Array(list.length);
  for (let i = 0; i < sorted.length; i += 1) {
    for (let k = 0; k < fields.length; k += 1) fields[k][i] = sorted[i][k];
    piece[i] = sorted[i][7];
    if (++work % 128 === 0) yield;
  }
  const result = {
    count: list.length,
    x: fields[0],
    y: fields[1],
    w: fields[2],
    h: fields[3],
    lock: fields[4],
    ux: fields[5],
    uy: fields[6],
    piece,
  };
  result.overlaps = yield* goldOverlapSteps(result, G);
  return result;
}

export function planAssemblyGold(options) {
  const steps = assemblyGoldPlanSteps(options);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

// Pixel squares inside an outline (figure px), in burst groups: the face's
// lights about the visor and (FAR FROM, owner 2026-10-22: the reactor
// completes like the compound eyes, filling with pixels that scatter) the
// reactor about the core.
export const glowPixels = (glow, centre, seed = 2010, count = 120) => {
  if (!glow?.length) return [];
  const random = seededRandom(seed);
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
  for (let tries = 0; squares.length < count && tries < 4000; tries += 1) {
    const x = x0 + random() * (x1 - x0);
    const y = y0 + random() * (y1 - y0);
    if (!inside(x, y)) continue;
    const size = [4, 5, 6, 8][squares.length % 4];
    const middle = Math.abs(x - centre[0]) < 14 + (y - y0) * 0.12;
    const tone = squares.length % 7 === 0 ? 2 : middle ? 1 : 0;
    squares.push({ x, y, size, tone, group: squares.length % 6 });
  }
  return squares;
};
// The reactor's light is generated the same way as the compound eyes
// (owner, 2026-10-23: it popped in whole): pixel squares fill the disc in
// burst groups, hold over the ignition, then scatter to show it lit.
const REACTOR_PIXELS = [0.872, 0.935];
const reactorPixels = (core) => {
  if (!core) return [];
  const random = seededRandom(2023);
  const [cx, cy] = core;
  const radius = REACTOR_RADIUS * 0.82;
  const squares = [];
  for (let tries = 0; squares.length < 96 && tries < 2000; tries += 1) {
    const x = cx + (random() * 2 - 1) * radius;
    const y = cy + (random() * 2 - 1) * radius;
    const r = Math.hypot(x - cx, y - cy);
    if (r > radius) continue;
    const size = [4, 5, 6, 8][squares.length % 4];
    const tone = squares.length % 7 === 0 ? 2 : r < radius * 0.45 ? 1 : 0;
    squares.push({ x: x - size / 2, y: y - size / 2, size, tone, group: squares.length % 6 });
  }
  return squares;
};
const facePixels = (glow, visor) => glowPixels(glow, visor);
// The body's held-back lights are generated like the eyes and the reactor
// (owner, 2026-10-23: 「他も修正」 — they popped in whole at B.light): pixel
// squares sampled from the lights' own art fill each light in burst groups
// a moment before the light runs out from the core, hold while it lights
// under them, then scatter outward (the BURSTS' scales and turns) behind
// the wipe, so the whole body reads as one wave out from the reactor.
const LIGHT_PIXELS = { lead: 0.014, fill: 0.006, hold: 0.004, burst: 0.014, drift: 9 };
const lightPixels = (lights, core, W, H, document) => {
  if (!lights?.width || !core) return [];
  const cell = 6;
  const cw = Math.max(1, Math.round(W / cell));
  const ch = Math.max(1, Math.round(H / cell));
  const probe = document.createElement("canvas");
  probe.width = cw;
  probe.height = ch;
  const pc = probe.getContext("2d", { willReadFrequently: true });
  if (!pc) return [];
  pc.drawImage(lights, 0, 0, cw, ch);
  const data = pc.getImageData(0, 0, cw, ch).data;
  probe.width = probe.height = 0;
  const random = seededRandom(2031);
  const [cx, cy] = core;
  const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
  const squares = [];
  for (let y = 0; y < ch; y += 1)
    for (let x = 0; x < cw; x += 1) {
      const i = (y * cw + x) * 4;
      if (data[i + 3] < 70) continue;
      // Keep the squares sparse (the eyes' density), never every cell.
      if (random() > 0.42) continue;
      const px = (x + random()) * (W / cw);
      const py = (y + random()) * (H / ch);
      if (Math.hypot(px - cx, py - cy) < REACTOR_RADIUS) continue;
      const size = [4, 5, 6, 8][squares.length % 4];
      const tone = squares.length % 7 === 0 ? 2 : data[i] > data[i + 2] ? 1 : 0;
      const d = Math.hypot(px - cx, py - cy) / reach;
      squares.push({ x: px - size / 2, y: py - size / 2, size, tone, group: squares.length % 6, d });
      if (squares.length >= 900) return squares;
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

// The same combustion choreography as the entrance's 2400 ms clock, mapped
// onto the runway in one place (rexonance-field/field-clock.js: the fire's
// engulf is getting a longer runway, owner 2026-10-21).
const NANITE_FLAME_START = REXONANCE_SCROLL_FLAME.start;
const NANITE_FLAME_SPAN = REXONANCE_SCROLL_FLAME.span;
/**
 * Mounts the suit-up scene on its runway. `config`: { figure, undersuit,
 * size: { width, height }, pieces: [{ id, group, x, y, w, h, seat }],
 * core, visor, glow }, and for another page's suit (FAR FROM, 2026-10-22)
 * `palette` (assemblyPalette), `reactorGlow` (the reactor's outline: it
 * fills with pixel squares that scatter, like the eyes), `reactorRadius`,
 * `forms.chain` (the forms the suit-up runs through after the seal, in
 * order, to the runway's data-form), `accents` ({ back, front }: the
 * page's own allocation-free draws behind and over the figure) and a
 * second nanite kit (`nanites.cellsB`: the chips split between the two).
 */
export function mountRexonanceAssembly(runway, config, environment = window) {
  if (!runway || !config) return () => {};
  const document = runway.ownerDocument;
  const html = document.documentElement;
  const canvas = runway.querySelector("canvas.rzn-canvas");
  const frameBox = runway.querySelector(".rzn-frame");
  const under = runway.querySelector(".rzn-under");
  const driverStandin = runway.querySelector(".rzn-driver-standin");
  if (!canvas || !frameBox || typeof canvas.getContext !== "function") return () => {};
  const palette = assemblyPalette(config.palette);
  const accents = config.accents ?? null;
  const formChain = Array.isArray(config.forms?.chain) ? config.forms.chain : null;
  const REACTOR_R = config.reactorRadius ?? REACTOR_RADIUS;
  // The fire's end tone (rexonance-fire/fire-tuning.js FIRE_TONES): the
  // clean combustion Rexonance ends in by default, gold for FAR FROM.
  const FIRE_TONE = config.fireTone ?? 0;
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
  let nearPast = false;
  let warm = false;
  let frame = 0;
  let images = null;
  let loading = null;
  let retryTimer = 0;
  let retryCount = 0;
  const restLoad = runway.dataset.rznLoad;
  let plan = null;
  let goldPlan = null;
  let raw = null;
  let goldArt = null;
  let goldLayer = null;
  // One byte per gold cell: 1 where the finished art shows gold in it (the
  // conduit job's), so no mote or heat lands on dark metal under a trim.
  let goldVisible = null;
  let goldCount = 0;
  const goldReverse = { count: 0, dirty: -1, at: 0 };
  let frame_ = null;
  let frameDeep_ = null;
  // The base figure's layers (the armour's; owner, 2026-10-16).
  let baseLights = null;
  let baseRaw = null;
  // The nanite swarm (owner, 2026-10-16: 超大幅な改善): its stage plan, its
  // renderer, and the canvases it draws from (raw metal, silhouettes, the
  // guide's hologram and walls, molten gold, the scaffold lattice).
  let nano = null;
  let swarm = null;
  let naniteSheets = [];
  // RESONANCE FIELD (owner, 2026-10-21: 「装着方式はダイナミックでありつつ、何度
  // 見ても飽きない様な革新性や素晴らしさを追求して」): the field's module
  // (src/lib/rexonance-field, loaded with the swarm's), its WebGL layer
  // (made once the scene is live, released when it is still or hidden), the
  // visit's take (rolled when the scene goes live, fixed while it is: every
  // frame is closed-form in the progress, so scrubbing stays exact), its
  // score (from the plan's beats) and the frame's state and camera buffers.
  let fieldLib = null;
  let field = null;
  let fieldFailed = false;
  let fieldTake = null;
  let fieldScore = null;
  let fieldState = null;
  let fieldCamera = null;
  let fieldView = null;
  let fieldCss = null;
  let fieldProgress = -1;
  // The field's density (sweep 2, F26): eased a twentieth a frame toward the
  // governor's (half its particles while the far band draws as rects), so
  // the additive field never halves or doubles in one frame; whole on a
  // calm frame, so a resting frame never depends on how it was reached.
  // `fieldLevel` 0..FIELD_LEVELS, the density 0.5 + 0.5 × level / levels.
  let fieldLevel = FIELD_LEVELS;
  let fieldDrawnLevel = -1;
  // The swarm's module and kit, loaded with the pictures (round 3: the still
  // tiers — reduced motion, economy, Save-Data — never mount the scene, so
  // they never download them). `config.nanites` is the kit or its loader.
  let lib = null;
  let kit = null;
  let driver = null;
  let lights = null;
  let reactor = null;
  let settled = null;
  let settledCount = 0;
  let pixels = null;
  let reactorSquares = null;
  let lightSquares = null;
  let view = null;
  let lastProgress = -1;
  let calmTimer = 0;
  const hud = {
    progress: -1,
    form: "",
    formReady: false,
    line: -1,
    chips: "",
    parts: -1,
    percent: "",
    landedCount: -1,
    totalFormatted: "",
    count: "",
    complete: null,
    phase: "",
    formComplete: null,
  };

  // The preferences as their change events last reported them, never polled
  // (sweep 2, F24): motionAllowed() runs on every idle slice, and a read of
  // a listened list's `.matches` refreshes Chromium's cached result, so a
  // change landing before the next style recalc was consumed by the poll,
  // its event never fired, and the runway kept the loading stand-in for
  // good under Reduce Motion or forced colours.
  const mediaNow = (list, event) =>
    typeof event?.matches === "boolean" ? event.matches : Boolean(list.matches);
  let reducedNow = mediaNow(reduced);
  let forcedNow = mediaNow(forcedColors);
  const motionAllowed = () => {
    const constrained =
      Boolean(connection?.saveData) || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    return !reducedNow && !forcedNow && !constrained && html.dataset.worldEffects !== "economy";
  };
  runway.dataset.rznLoad = motionAllowed() ? "waiting" : "static";

  // Pictures still downloading when the scene goes (audit #31): each one's
  // handlers hold this scene, and through it the runway and its page.
  const loaders = new Set();
  const decodeWaiters = new Set();
  // Decoding and bitmap conversion are optimisations after onload. A hung
  // optimisation must not block the scene; its loaded image is usable. Kit
  // sheets are optional too, so their request cannot hold the whole figure.
  const boundedImage = (pending, fallback, wait, closeLate = false) =>
    new Promise((resolve) => {
      let complete = false;
      let timer = 0;
      const finish = (value) => {
        if (complete) {
          if (closeLate && value !== fallback) value?.close?.();
          return;
        }
        complete = true;
        environment.clearTimeout(timer);
        decodeWaiters.delete(cancel);
        resolve(value);
      };
      const cancel = () => finish(fallback);
      decodeWaiters.add(cancel);
      timer = environment.setTimeout(cancel, wait);
      Promise.resolve(pending).then(finish, cancel);
    });
  const picture = (src, priority) =>
    new Promise((resolve, reject) => {
      const image = new environment.Image();
      let complete = false;
      let timer = 0;
      const finish = (loaded, error) => {
        if (complete) return;
        complete = true;
        environment.clearTimeout(timer);
        loaders.delete(image);
        decodeWaiters.delete(cancel);
        image.onload = image.onerror = null;
        if (loaded) resolve(image);
        else {
          releasePendingImage(image);
          reject(error);
        }
      };
      const cancel = () => finish(false, new Error("assembly image request timed out"));
      loaders.add(image);
      decodeWaiters.add(cancel);
      image.decoding = "async";
      if (priority) image.fetchPriority = priority;
      image.onload = () => finish(true);
      image.onerror = (error) => finish(false, error);
      timer = environment.setTimeout(cancel, 8000);
      image.src = src;
    });
  // The network half of the preparation, fetched ahead (owner, 2026-10-17:
  // 「レクソナンスのスクロールで変身するやつが読み込まれずに過ぎてしまったりする」):
  // once the page is idle after its load, the swarm's module and its kit are
  // imported and the scene's sheets requested at low priority, so the
  // preparation starts from bytes already here. Decoding waits for wake().
  // Only under the motion gate: the still tiers never download any of it.
  let modulesLoading = null;
  const modules = () => {
    modulesLoading ??= Promise.all([
      boundedImage(import("./rexonance-assembly-nanites.js"), null, 8000).then((module) => {
        if (!module) throw new Error("assembly module request timed out");
        return module;
      }),
      boundedImage(
        Promise.resolve().then(() =>
          typeof config.nanites === "function" ? config.nanites() : (config.nanites ?? null),
        ),
        null,
        2000,
      ),
      // The field's module is optional: without it the scene plays as before.
      boundedImage(
        import("./rexonance-field/index.js").catch(() => null),
        null,
        4000,
      ),
    ]).catch((error) => {
      modulesLoading = null;
      throw error;
    });
    return modulesLoading;
  };
  const sheetSources = (nanites) =>
    [
      config.figure,
      config.undersuit,
      config.gold?.atlas,
      config.atlas,
      config.base,
      nanites?.cells?.src,
      nanites?.cellsB?.src,
      coarse.matches ? null : nanites?.comets?.src,
      nanites?.fx?.src,
      nanites?.guide?.src,
    ].filter(Boolean);
  // src → the early request (its <img>, or null when it failed).
  const fetched = new Map();
  let prefetching = false;
  const prefetch = () => {
    if (prefetching || images || disposed || !motionAllowed()) return;
    prefetching = true;
    if (under && under.loading !== "eager") under.loading = "eager";
    modules().then(
      ([, nanites]) => {
        if (disposed || images) return;
        for (const src of sheetSources(nanites))
          if (!fetched.has(src))
            fetched.set(
              src,
              picture(src, "low").catch(() => null),
            );
      },
      () => {
        prefetching = false;
      },
    );
  };
  const load = () => {
    if (loading) return loading;
    loading = modules().then(([module, nanites, fieldModule]) => {
      if (disposed) return null;
      lib = module;
      kit = nanites ?? null;
      if (fieldModule && !fieldLib) {
        fieldLib = fieldModule;
        fieldState = fieldLib.fieldStateBuffer();
        fieldCamera = fieldLib.fieldCameraBuffer();
        // (Doubles: an identity camera hands the view back exactly.)
        fieldView = new Float64Array(3);
      }
      return pictures();
    });
    return loading;
  };
  const pictures = () => {
    let failed = false;
    const decoded = [];
    // A sheet fetched ahead is taken as it is (or fetched again if that
    // failed); the rest are asked for now, ahead of the page's own images.
    const take = (src) => {
      const early = fetched.get(src);
      fetched.delete(src);
      return early ? early.then((image) => image ?? picture(src, "high")) : picture(src, "high");
    };
    const decode = (src) =>
      take(src)
        .then((image) =>
          image.decode
            ? boundedImage(
                Promise.resolve()
                  .then(() => image.decode())
                  .then(() => image),
                image,
                500,
              )
            : image,
        )
        // Drawn into a canvas, an <img> is decoded again on the main thread
        // (tens of ms on a slow phone); a bitmap arrives decoded.
        .then((image) =>
          !disposed && !failed && typeof environment.createImageBitmap === "function"
            ? boundedImage(
                Promise.resolve().then(() => environment.createImageBitmap(image)),
                image,
                500,
                true,
              )
            : image,
        )
        .then((image) => {
          if (failed || disposed) image?.close?.();
          else decoded.push(image);
          return image;
        });
    // The nanite kit (owner, 2026-10-16): each sheet optional; touch
    // screens draw no comets.
    const optional = (src) => (src ? boundedImage(decode(src), null, 2000, true) : null);
    return Promise.all([
      decode(config.figure),
      decode(config.undersuit),
      optional(config.gold?.atlas),
      optional(config.atlas),
      // The figure without its ornaments (owner, 2026-10-16); the scene
      // plays from the full figure alone without it.
      optional(config.base),
      optional(kit?.cells?.src),
      coarse.matches ? null : optional(kit?.comets?.src),
      optional(kit?.fx?.src),
      optional(kit?.guide?.src),
      // The second kit's chips (FAR FROM): optional like the first's.
      optional(kit?.cellsB?.src),
    ])
      .then(([figure, undersuit, gold, atlas, base, cells, comets, fx, guide, cellsB]) => {
        if (disposed) {
          for (const image of [
            figure,
            undersuit,
            gold,
            atlas,
            base,
            cells,
            comets,
            fx,
            guide,
            cellsB,
          ])
            image?.close?.();
          return null;
        }
        images = { figure, undersuit, gold, atlas, base, cells, comets, fx, guide, cellsB };
        prepareBodyFlame(undersuit, config.size, environment);
        return images;
      })
      .catch((error) => {
        failed = true;
        for (const image of decoded) image?.close?.();
        throw error;
      });
  };

  // One texel per tile: the figure drawn down to the grid gives each
  // tile's mean colour and coverage in one read. Where the browser can,
  // the shrink runs off the main thread (createImageBitmap); the read is
  // then of a canvas a few dozen pixels wide.
  const sampleFigure = async (tile, source = images.figure) => {
    const cols = Math.ceil(W / tile);
    const rows = Math.ceil(H / tile);
    let bitmap = null;
    try {
      if (typeof environment.createImageBitmap === "function") {
        bitmap = await boundedImage(
          environment.createImageBitmap(source, 0, 0, cols * tile, rows * tile, {
            resizeWidth: cols,
            resizeHeight: rows,
            resizeQuality: "medium",
          }),
          null,
          500,
          true,
        );
      }
    } catch {
      bitmap = null;
    }
    if (disposed) {
      bitmap?.close?.();
      return null;
    }
    let probe = null;
    try {
      probe = document.createElement("canvas");
      probe.width = cols;
      probe.height = rows;
      const context = probe.getContext("2d", { willReadFrequently: true });
      context.imageSmoothingEnabled = true;
      if (bitmap) context.drawImage(bitmap, 0, 0, cols, rows);
      else context.drawImage(source, 0, 0, cols * tile, rows * tile, 0, 0, cols, rows);
      let data = context.getImageData(0, 0, cols, rows).data;
      const covered = (pixels) => {
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 40) return true;
        return false;
      };
      // A transient blank resized bitmap must not become a valid zero-tile
      // plan. Retry the full decoded source once; no per-frame pixel reads.
      if (!covered(data) && bitmap) {
        context.clearRect(0, 0, cols, rows);
        context.drawImage(source, 0, 0, cols * tile, rows * tile, 0, 0, cols, rows);
        data = context.getImageData(0, 0, cols, rows).data;
      }
      // The same conservative fallback used for failed reads preserves the
      // assembly if both browser readbacks fail, rather than accepting 0/0.
      return covered(data) ? { data } : null;
    } catch {
      return null;
    } finally {
      if (probe) probe.width = probe.height = 0;
      bitmap?.close?.();
    }
  };

  // Each preparation phase gets an idle slot, 3.5 viewports before the
  // scene. Timeout/fallback still guarantees progress during a fast fling.
  // Cancelling resolves waiters so an old build cannot activate after exit.
  let building = null;
  let generation = 0;
  let idleFallbackGeneration = -1;
  let partialBuild = null;
  const idleJobs = new Map();
  // The end of the current idle period (performance.now()), from the last
  // real IdleDeadline. While it still has room, the next slice follows as a
  // macrotask rather than waiting for the next idle period: each slice stays
  // ≤ 6 ms and input and frames still interleave between the tasks (review
  // 2026-10-16: ~170 slices a frame apart took 3.4–4.4 s of wall time for
  // ~0.3 s of work, so a brisk reader reached the runway before it was live).
  const clock = () => environment.performance?.now?.() ?? Date.now();
  let idleUntil = 0;
  // Without idle callbacks (Safari), one 16 ms timer per tiny slice turned
  // sub-second work into a many-second 0% standstill. A timer opens a short
  // burst of separately yielding tasks; another timer yields to paint/input
  // after 4 ms. Individual preparation slices keep their existing budgets.
  let fallbackUntil = 0;
  let chain = null;
  const chained = [];
  const chainDeadline = {
    didTimeout: false,
    timeRemaining: () => Math.max(0, idleUntil - clock()),
  };
  const chainPort = () => {
    if (chain) return chain;
    if (typeof environment.MessageChannel !== "function") return null;
    try {
      chain = new environment.MessageChannel();
      chain.port1.onmessage = () => chained.shift()?.();
    } catch {
      chain = null;
    }
    return chain;
  };
  const idleTask = (work) =>
    new Promise((resolve, reject) => {
      if (disposed || !pageActive || document.hidden || !motionAllowed()) return resolve(null);
      const key = {};
      let idleId = 0;
      let watchdog = 0;
      const run = (deadline, opensFallback = false) => {
        if (!idleJobs.delete(key)) return;
        if (watchdog) environment.clearTimeout(watchdog);
        if (idleId) environment.cancelIdleCallback?.(idleId);
        if (disposed || !pageActive || document.hidden || !motionAllowed()) return resolve(null);
        try {
          if (opensFallback) fallbackUntil = clock() + 4;
          if (deadline?.didTimeout) idleFallbackGeneration = generation;
          // A real deadline opens an idle period the following slices may
          // use; a timeout or a timer slice opens none.
          if (deadline && deadline !== chainDeadline)
            idleUntil = deadline.didTimeout ? 0 : clock() + deadline.timeRemaining();
          // A timeout gets one bounded slice; subsequent work must not wait
          // another second for idle time on a continuously busy main thread.
          resolve(work(deadline?.didTimeout ? null : deadline));
        } catch (error) {
          reject(error);
        }
      };
      const idle =
        typeof environment.requestIdleCallback === "function" &&
        idleFallbackGeneration !== generation;
      // Still inside an idle period with room for a whole slice: next task.
      // While the reader is at the scene and it is not live yet (a direct
      // arrival, or a reader faster than the preparation), the period's last
      // few ms take one more slice (a slice's work stops at 3–4 ms): scrolling
      // leaves short idle periods, and the slack was left unused.
      const room = near && !live ? 4.5 : 8;
      const port = (idle ? idleUntil - clock() > room : fallbackUntil > clock())
        ? chainPort()
        : null;
      if (port) {
        chained.push(() => run(idle ? chainDeadline : null));
        port.port2.postMessage(0);
        idleJobs.set(key, () => resolve(null));
        return;
      }
      // Some WebKit lifecycle/throttling paths abandon native idle work
      // without delivering even its timeout callback. A separate timer owns
      // liveness; it opens the same bounded, yielding fallback as Safari.
      // Near the reader, recovery must begin before they pass the runway.
      if (idle) {
        idleId = environment.requestIdleCallback(run, { timeout: 1000 });
        watchdog = environment.setTimeout(
          () => {
            idleFallbackGeneration = generation;
            run(null, true);
          },
          near && !live ? 160 : 600,
        );
      } else watchdog = environment.setTimeout(() => run(null, true), 16);
      idleJobs.set(key, () => {
        if (idleId) environment.cancelIdleCallback?.(idleId);
        if (watchdog) environment.clearTimeout(watchdog);
        resolve(null);
      });
    });
  const cancelPreparation = () => {
    generation += 1;
    environment.clearTimeout(retryTimer);
    retryTimer = retryCount = 0;
    if (!live) runway.dataset.rznLoad = motionAllowed() ? "waiting" : "static";
    idleFallbackGeneration = -1;
    fallbackUntil = 0;
    for (const cancel of idleJobs.values()) cancel();
    idleJobs.clear();
    partialBuild?.cancel();
    partialBuild = null;
    building = null;
    preparing = null;
  };
  const build = () => {
    if (building) return building;
    const token = generation;
    const tile = coarse.matches ? 15 : 12;
    const active = () =>
      !disposed && pageActive && token === generation && !document.hidden && motionAllowed();
    const buildSteps = async (steps) => {
      try {
        let result;
        while (active()) {
          await idleTask((deadline) => {
            if (!active()) return;
            const start = environment.performance?.now?.() ?? Date.now();
            do {
              result = steps.next();
            } while (
              !result.done &&
              (environment.performance?.now?.() ?? Date.now()) - start < 1.5 &&
              (!deadline || deadline.timeRemaining() > 4)
            );
          });
          if (result?.done) return active() ? result.value : null;
        }
        return null;
      } finally {
        steps.return();
      }
    };
    const resources = new Set();
    const splitJobs = new Set();
    let complete = false;
    const state = {
      cancel() {
        if (complete) return;
        for (const job of splitJobs) job.cancel();
        splitJobs.clear();
        for (const resource of resources) resource.width = resource.height = 0;
        resources.clear();
      },
    };
    partialBuild = state;
    const mark = (phase) => {
      try {
        environment.__rexonancePreparationPhase?.(phase);
      } catch {
        // Test-only instrumentation must never affect preparation.
      }
    };
    let cpuPreparation = false;
    const stepPixels = (job, deadline, phase) => {
      const start = environment.performance?.now?.() ?? Date.now();
      // CPU-backed preparation can use more of the existing idle slice,
      // avoiding a fresh task for each tiny row group. Keep native-operation
      // headroom below the 6 ms target, and leave the fallback budget alone.
      const done = job.step(start + (cpuPreparation ? 2.5 : 1.5), deadline);
      try {
        if (environment.__rexonancePreparationSlice)
          environment.__rexonancePreparationSlice(
            phase,
            (environment.performance?.now?.() ?? Date.now()) - start,
          );
      } catch {
        // Test-only instrumentation must never affect preparation.
      }
      return done;
    };
    const makeSheet = async (phase, cpu = false) => {
      mark(phase);
      return idleTask(() => {
        if (!active()) return null;
        const sheet = document.createElement("canvas");
        resources.add(sheet);
        sheet.width = W;
        sheet.height = H;
        // Read-back inputs must be CPU-backed from their FIRST context.
        // A CPU scratch copy cannot undo a GPU source's synchronisation.
        if (cpu && cpuPreparation) sheet.getContext("2d", { willReadFrequently: true });
        return sheet;
      });
    };
    const drawPieces = async (items, draw, phase) => {
      if (!items.length) return true;
      let index = 0;
      let finished = false;
      while (active() && !finished) {
        mark(phase);
        const ran = await idleTask((deadline) => {
          if (!active()) return;
          const start = environment.performance?.now?.() ?? Date.now();
          do {
            draw(items[index++]);
          } while (
            index < items.length &&
            (environment.performance?.now?.() ?? Date.now()) - start < 4 &&
            (!deadline || deadline.timeRemaining() > 4)
          );
          finished = index >= items.length;
        });
        if (ran === null || !active()) return false;
      }
      return finished;
    };
    // The figure's split also yields its mote layer (2026-10-15): the art in
    // nanite light, with the art's own alpha, for the tiles in flight and
    // the welds — a nanite then carries the piece's outline, never a square
    // standing out past it.
    const traceGoldFrame = async (source, target, deepTarget, phase) => {
      mark(`${phase}-read`);
      const data = await idleTask(() => {
        if (!active()) return null;
        try {
          const image = source.getContext("2d").getImageData(0, 0, W, H);
          const out = target.getContext("2d").createImageData(W, H);
          const deep = deepTarget.getContext("2d").createImageData(W, H);
          return image?.data?.length === W * H * 4 &&
            out?.data?.length === W * H * 4 &&
            deep?.data?.length === W * H * 4
            ? { image, out, deep }
            : null;
        } catch {
          return null;
        }
      });
      if (!data || !active()) return false;
      const { image, out, deep } = data;
      let row = 0;
      while (active() && row < H) {
        mark(`${phase}-rows`);
        const ran = await idleTask((deadline) => {
          if (!active()) return;
          const start = environment.performance?.now?.() ?? Date.now();
          do {
            traceGoldFrameRow(image.data, out.data, deep.data, row, W, H);
            row += 1;
          } while (
            row < H &&
            (environment.performance?.now?.() ?? Date.now()) - start < 4 &&
            (!deadline || deadline.timeRemaining() > 4)
          );
        });
        if (ran === null || !active()) return false;
      }
      if (row < H || !active()) return false;
      mark(`${phase}-upload`);
      const put = await idleTask(() => {
        if (!active()) return false;
        target.getContext("2d").putImageData(out, 0, 0);
        deepTarget.getContext("2d").putImageData(deep, 0, 0);
        return true;
      });
      return put === true;
    };
    const splitLightsIdle = async (source, phase, options) => {
      mark(`${phase}-setup`);
      const job = await idleTask(() => {
        if (!active()) return null;
        const result = createSplitLightsJob(source, 0, 0, W, H, document, {
          ...options,
          cpuUnlit: cpuPreparation,
        });
        if (result) splitJobs.add(result);
        return result;
      });
      if (!job || !active()) return null;
      let done = false;
      while (active() && !done) {
        mark(`${phase}-pixels`);
        const ran = await idleTask((deadline) => {
          if (!active()) return;
          done = stepPixels(job, deadline, `${phase}-pixels`);
        });
        if (ran === null || !active()) return null;
      }
      if (!done || !active()) return null;
      mark(`${phase}-upload`);
      const layers = await idleTask(() => {
        if (!active()) return null;
        const result = job.commit();
        splitJobs.delete(job);
        if (result) {
          resources.add(result.unlit);
          resources.add(result.lights);
          if (result.motes) resources.add(result.motes);
        }
        return result;
      });
      return layers;
    };
    // The nanite kit's pixel jobs (rexonance-unlit.js): the same idle
    // contract as the light split, every canvas owned until published.
    const pixelJobIdle = async (phase, create, keys) => {
      mark(`${phase}-setup`);
      const job = await idleTask(() => {
        if (!active()) return null;
        const result = create();
        if (result) splitJobs.add(result);
        return result;
      });
      if (!job || !active()) return null;
      let done = false;
      while (active() && !done) {
        mark(`${phase}-rows`);
        const ran = await idleTask((deadline) => {
          if (!active()) return;
          done = stepPixels(job, deadline, `${phase}-rows`);
        });
        if (ran === null || !active()) return null;
      }
      if (!done || !active()) return null;
      mark(`${phase}-upload`);
      return idleTask(() => {
        if (!active()) return null;
        const result = job.commit();
        splitJobs.delete(job);
        if (result) for (const key of keys) if (result[key]) resources.add(result[key]);
        return result;
      });
    };
    const ornamentSet = new Set(config.ornaments ?? []);
    building = idleTask(() => sampleFigure(tile))
      .then(async (sample) => {
        if (!active()) return;
        // The figure without its ornaments (owner, 2026-10-16), sampled the
        // same way: the armour's tiles come from it.
        const baseSample =
          images.base && sample ? await idleTask(() => sampleFigure(tile, images.base)) : null;
        if (!active()) return;
        mark("reactor-crops");
        const nextReactor = await idleTask(() => {
          if (!active()) return null;
          const result = createReactorLayers({
            document,
            pieces: config.pieces,
            atlas: images.atlas,
            art: images.figure,
            undersuit: images.undersuit,
            size: config.size,
          });
          if (result) {
            resources.add(result.art);
            resources.add(result.disc);
            resources.add(result.socket);
          }
          return result;
        });
        if (!active()) return;
        // The coil is born with the reactor, not delivered early as a chest
        // plate. Keep its mask in the ownership vote so neighbours cannot
        // claim its pixels; only the normal delivery is skipped.
        const planningPieces = nextReactor ? deferReactorPieces(config.pieces) : config.pieces;
        const nextPlan = await buildSteps(
          assemblyPlanSteps({
            size: config.size,
            pieces: planningPieces,
            core: config.core,
            maskTile: config.maskTile,
            visor: config.visor,
            tile,
            sample,
            baseSample,
            ornaments: config.ornaments,
            tones: palette.tones,
          }),
        );
        if (!active() || !nextPlan) return;
        // Gold planning includes its overlap graph; neither planning phase
        // becomes visible until both have finished for this generation.
        const nextGold = images.gold
          ? await buildSteps(
              assemblyGoldPlanSteps({
                pieces: planningPieces,
                gold: config.gold,
                tiles: nextPlan.tiles,
              }),
            )
          : null;
        if (!active()) return;
        const nextPixels = facePixels(config.glow, config.visor);
        // The reactor's pixel squares: Rexonance's own disc (owner,
        // 2026-10-23), or a page's reactor glow outline (FAR FROM).
        const nextReactorPixels = config.reactorGlow
          ? glowPixels(config.reactorGlow, config.core, 2011, 96)
          : reactorPixels(config.core);
        mark("cpu-preparation-probe");
        cpuPreparation = await idleTask(() => active() && supportsCpuPreparation(document));
        if (!active()) return;
        const nextSettled = await makeSheet("settled-sheet");
        if (!nextSettled || !active()) return;
        // (No mote layers: the scene no longer reads them — round 3, memory.)
        const nextLights = await splitLightsIdle(images.figure, "figure-lights");
        if (!active()) return;
        const nextLightPixels = await idleTask(() =>
          active() ? lightPixels(nextLights?.lights, config.core, W, H, document) : [],
        );
        if (!active()) return;
        if (nextReactor && nextLights?.unlit) {
          mark("reactor-unlit");
          await idleTask(() => {
            if (active()) repaintReactorArt(nextReactor, nextLights.unlit, config.size);
          });
          if (!active()) return;
        }
        // The base figure's own light split (its lights held back too, its
        // mote layer for the rich scene) and, below, its raw-gold sheet.
        let nextBaseLights = null;
        let nextBaseRaw = null;
        if (baseSample && images.base) {
          nextBaseLights = await splitLightsIdle(images.base, "base-lights");
          if (!active()) return;
          // The base figure's lights are never drawn (the seal lays the full
          // figure's): released at once (round 3, memory).
          if (nextBaseLights?.lights) {
            nextBaseLights.lights.width = nextBaseLights.lights.height = 0;
            resources.delete(nextBaseLights.lights);
          }
        }

        const preset = config.pieces.filter((piece) => piece.preset).reverse();
        let nextDriver = null;
        if (preset.length && images.atlas) {
          nextDriver = await makeSheet("driver-sheet", true);
          if (!nextDriver || !active()) return;
          const dc = nextDriver.getContext("2d");
          if (
            !(await drawPieces(
              preset,
              (piece) =>
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
                ),
              "driver-crops",
            ))
          )
            return;
          const driverLights = await splitLightsIdle(nextDriver, "driver-lights");
          if (driverLights && active()) {
            mark("driver-light-composite");
            await idleTask(() => {
              if (active()) {
                dc.clearRect(0, 0, W, H);
                dc.drawImage(driverLights.unlit, 0, 0);
              }
            });
            driverLights.unlit.width = driverLights.unlit.height = 0;
            driverLights.lights.width = driverLights.lights.height = 0;
            resources.delete(driverLights.unlit);
            resources.delete(driverLights.lights);
          }
        }

        let nextRaw = null;
        let nextGoldArt = null;
        let nextGoldLayer = null;
        if (nextGold?.count) {
          nextRaw = await makeSheet("gold-raw-sheet", true);
          if (!nextRaw || !active()) return;
          nextGoldArt = await makeSheet("gold-art-sheet", true);
          if (!nextGoldArt || !active()) return;
          nextGoldLayer = await makeSheet("gold-layer-sheet");
          if (!nextGoldLayer || !active()) return;
          const rc = nextRaw.getContext("2d");
          const gc = nextGoldArt.getContext("2d");
          mark("gold-base-copy");
          await idleTask(() => {
            if (active()) rc.drawImage(nextLights?.unlit || images.figure, 0, 0, W, H);
          });
          const goldPieces = config.pieces
            .slice()
            .reverse()
            .filter((piece) => !piece.preset && config.gold.cells[piece.id]);
          if (
            !active() ||
            !(await drawPieces(
              goldPieces,
              (piece) => {
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
              },
              "gold-crops",
            ))
          )
            return;
          mark("gold-mask-composite");
          await idleTask(() => {
            if (!active()) return;
            // The formed gold is the art with its lights held (unlit), like
            // every plate before the seal (owner: the lights stay monochrome
            // until the suit is whole); the seal lays the unlit figure and
            // then the lights over all of it, so the finished suit is the
            // artwork either way. (Review 2026-10-16: the lit figure inside
            // the helmet-visor's gold cells read as a pale block on the brow.)
            gc.globalCompositeOperation = "source-in";
            gc.drawImage(nextLights?.unlit || images.figure, 0, 0, W, H);
            gc.globalCompositeOperation = "source-over";
          });
          // The armour's raw-gold sheet: the base figure with the armour
          // plates' trims unformed (the ornaments' gold is the full figure's).
          if (baseSample && images.base && active()) {
            nextBaseRaw = await makeSheet("base-raw-sheet", true);
            if (!nextBaseRaw || !active()) return;
            const bc = nextBaseRaw.getContext("2d");
            mark("base-raw-copy");
            await idleTask(() => {
              if (active()) bc.drawImage(nextBaseLights?.unlit || images.base, 0, 0, W, H);
            });
            const armourGold = goldPieces.filter((piece) => !ornamentSet.has(piece.group));
            if (
              !active() ||
              !(await drawPieces(
                armourGold,
                (piece) =>
                  bc.drawImage(
                    images.gold,
                    piece.ax,
                    piece.ay,
                    piece.w,
                    piece.h,
                    piece.x,
                    piece.y,
                    piece.w,
                    piece.h,
                  ),
                "base-raw-crops",
              ))
            )
              return;
          }
        }

        if (!active()) return;
        // The nanite swarm (owner, 2026-10-16: 超大幅な改善). Raw nanite
        // metal (and the art's silhouette) for the armour and the
        // ornaments, from the art with its gold unformed.
        // (Made in bands of rows, so every idle slice stays short.)
        const metalJob = (source) =>
          pixelJobIdle(
            "nanite-metal",
            () =>
              lib.createAssemblyLayerJob({
                source,
                width: W,
                height: H,
                kind: "metal",
                silhouette: true,
                document,
              }),
            ["metal", "silhouette"],
          );
        const metalBase =
          baseSample && images.base
            ? await metalJob(nextBaseRaw || nextBaseLights?.unlit || images.base)
            : null;
        if (!active()) return;
        const metalFigure = await metalJob(nextRaw || nextLights?.unlit || images.figure);
        if (!active()) return;
        // With the base's raw sheet made, its unlit copy is no longer read.
        if (nextBaseRaw && nextBaseLights?.unlit) {
          nextBaseLights.unlit.width = nextBaseLights.unlit.height = 0;
          resources.delete(nextBaseLights.unlit);
          nextBaseLights = { ...nextBaseLights, unlit: null, lights: null };
        }
        // The stage plan: plates, seams, rings, phases, paint order.
        mark("nanite-seams");
        const nextNano = await buildSteps(
          lib.assemblyNanitePlanSteps({
            plan: nextPlan,
            pieces: config.pieces,
            size: config.size,
            core: config.core,
            visor: config.visor,
            gold: nextGold,
            seams: kit?.seams,
            goldBoxes: kit?.goldBoxes,
            goldCell: config.gold?.cell ?? 4,
            coarse: coarse.matches,
          }),
        );
        if (!active() || !nextNano) return;
        // The guideway's conduit (review, 2026-10-16), per plate for exactly
        // the gold the finished art shows: ice glass, a continuous channel and
        // gold rails lit upper-left; its hologram and walls (fine pointers),
        // or the figure-space faces touch draws through one clip; the visible
        // gold's mask (for the molten gold) and which gold cells show any.
        // The figure-space faces are laid latest-built first, so where plates
        // overlap the earliest-built frame shows (never one not built yet).
        const conduitPieces = nextNano.pieces
          .filter((piece) => piece.goldEnd > piece.goldFirst)
          .sort((a, b) => b.buildStart - a.buildStart)
          // (The helmet's conduit fades over 10 px where its gold runs on
          // into the next plate, never a straight edge across the brow.)
          .map((plate) => ({
            x: plate.x,
            y: plate.y,
            w: plate.w,
            h: plate.h,
            ax: plate.ax,
            ay: plate.ay,
            layer: plate.ornament ? 1 : 0,
            fade: plate.helm ? 10 : 5,
            plate,
          }));
        const conduit =
          images.guide && images.gold && nextGold?.count && conduitPieces.length
            ? await pixelJobIdle(
                "nanite-conduit",
                () =>
                  lib.createAssemblyConduitJob({
                    guide: images.guide,
                    gold: images.gold,
                    art: images.figure,
                    pieces: conduitPieces,
                    size: config.size,
                    goldPlan: nextGold,
                    holo: !coarse.matches,
                    walls: !coarse.matches,
                    figureFace: coarse.matches,
                    document,
                  }),
                ["face", "holo", "walls", "mask"],
              )
            : null;
        if (!active()) return;
        if (conduit?.figFace) for (const sheet of conduit.figFace) resources.add(sheet);
        // The conduit's sheets are packed tighter than the gold atlas (round
        // 3, memory): each plate's place in them.
        if (conduit?.places)
          conduitPieces.forEach(({ plate }, k) => {
            plate.packX = conduit.places[2 * k];
            plate.packY = conduit.places[2 * k + 1];
          });
        // The gold's frame (owner, 2026-10-16), traced from the gold art in
        // idle rows: its lit face and its depth — now only where the conduit
        // could not be made (round 3, memory: unread beside it); the scene
        // plays without it where pixels cannot be read.
        let nextFrame = null;
        let nextFrameDeep = null;
        if (!conduit?.face && nextGoldArt && active()) {
          nextFrame = await makeSheet("gold-frame-sheet");
          if (!nextFrame || !active()) return;
          nextFrameDeep = await makeSheet("gold-frame-deep-sheet");
          if (!nextFrameDeep || !active()) return;
          if (!(await traceGoldFrame(nextGoldArt, nextFrame, nextFrameDeep, "gold-frame"))) {
            for (const sheet of [nextFrame, nextFrameDeep]) {
              sheet.width = sheet.height = 0;
              resources.delete(sheet);
            }
            nextFrame = nextFrameDeep = null;
          }
        }
        if (!active()) return;
        // Molten gold, white-hot to amber, from the gold art — only where the
        // finished art shows gold (the conduit's mask).
        const moltenLayer = nextGoldArt
          ? await pixelJobIdle(
              "nanite-molten",
              () =>
                lib.createAssemblyLayerJob({
                  source: nextGoldArt,
                  width: W,
                  height: H,
                  kind: "molten",
                  mask: conduit?.mask ?? null,
                  document,
                }),
              ["molten"],
            )
          : null;
        if (conduit?.mask) {
          conduit.mask.width = conduit.mask.height = 0;
          resources.delete(conduit.mask);
        }
        if (!active()) return;
        // The scaffold lattice, drawn once.
        const nextLattice = await makeSheet("nanite-lattice");
        if (!nextLattice || !active()) return;
        mark("nanite-lattice");
        await buildSteps(lib.naniteLatticeSteps(nextLattice.getContext("2d"), nextNano, tile));
        if (!active()) return;
        mark("buffer-nanites");
        const artFigure = nextRaw || nextLights?.unlit || images.figure;
        const artBase =
          (images.base && (nextBaseRaw || nextBaseLights?.unlit || images.base)) || artFigure;
        const nextSwarm = await idleTask(() =>
          active()
            ? lib.createAssemblyNanites({
                nano: nextNano,
                size: config.size,
                core: config.core,
                visor: config.visor,
                coarse: coarse.matches,
                sprites: {
                  cells: images.cells,
                  cellsB: images.cellsB,
                  comets: images.comets,
                  fx: images.fx,
                },
                kit,
                palette: palette.nanites,
                layers: {
                  metal: [metalBase?.metal ?? null, metalFigure?.metal ?? null],
                  silhouette: [metalBase?.silhouette ?? null, metalFigure?.silhouette ?? null],
                  art: [artBase, artFigure],
                  holo: conduit?.holo ?? null,
                  walls: conduit?.walls ?? null,
                  face: conduit?.face ?? null,
                  figFace: conduit?.figFace ?? null,
                  goldVisible: conduit?.vis ?? null,
                  frame: nextFrame,
                  frameDeep: nextFrameDeep,
                  molten: moltenLayer?.molten ?? null,
                  goldArt: nextGoldArt,
                  lattice: nextLattice,
                },
                gold: nextGold,
                goldCell: config.gold?.cell ?? 4,
                touchArtBudget: ASSEMBLY_TOUCH_ART_BUDGET,
                document,
              })
            : null,
        );
        if (!active() || !nextSwarm) return;
        const nextNaniteSheets = [
          metalBase?.metal,
          metalBase?.silhouette,
          metalFigure?.metal,
          metalFigure?.silhouette,
          conduit?.face,
          conduit?.holo,
          conduit?.walls,
          ...(conduit?.figFace ?? []),
          moltenLayer?.molten,
          nextLattice,
        ].filter(Boolean);
        const nextBuffers = await allocateIdle(
          nextPlan,
          nextGold,
          nextPixels,
          active,
          mark,
          config.reactorGlow ? nextReactorPixels : [],
        );
        if (!active() || !nextBuffers) return;
        mark("ready");
        try {
          environment.__rexonanceNanitePlan?.(nextNano);
        } catch {
          // Test-only instrumentation must never affect preparation.
        }
        nano = nextNano;
        swarm = nextSwarm;
        goldVisible = conduit?.vis ?? null;
        naniteSheets = nextNaniteSheets;
        plan = nextPlan;
        goldPlan = nextGold;
        pixels = nextPixels;
        reactorSquares = nextReactorPixels;
        lightSquares = nextLightPixels;
        settled = nextSettled;
        settledCount = 0;
        lights = nextLights;
        reactor = nextReactor;
        driver = nextDriver;
        raw = nextRaw;
        goldArt = nextGoldArt;
        goldLayer = nextGoldLayer;
        frame_ = nextFrame;
        frameDeep_ = nextFrameDeep;
        baseLights = nextBaseLights;
        baseRaw = nextBaseRaw;
        goldCount = 0;
        buffers = nextBuffers;
        complete = true;
        retryCount = 0;
        runway.dataset.rznLoad = "ready";
        if (partialBuild === state) partialBuild = null;
      })
      .finally(() => {
        if (token === generation) {
          building = null;
          if (!complete && partialBuild === state) {
            state.cancel();
            partialBuild = null;
          }
        }
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
    // The field's canvases share this box (resized with it, next frame).
    fieldCss = [cssWidth, cssHeight];
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
  // A tile's art: the armour's from the base figure (its gold unformed),
  // the ornaments' from the full figure (owner, 2026-10-16).
  const tileArt = (item) =>
    (item.src === 0 && (baseRaw || baseLights?.unlit || images.base)) ||
    raw ||
    lights?.unlit ||
    images.figure;
  const weld = (item) => {
    const context = settled.getContext("2d");
    context.drawImage(
      tileArt(item),
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
  // Unwelding a tile clears its cell; the tile sharing that cell (an
  // ornament's over the armour's, or the armour's under it) is redrawn if
  // it is still painted, so a reverse scrub leaves no hole beneath the
  // ornaments (owner, 2026-10-16: the finished suit is the artwork, both ways).
  const unweld = (index) => {
    const item = plan.tiles[index];
    settled.getContext("2d").clearRect(item.sx, item.sy, item.tw, item.th);
    const partner = nano.under[index];
    if (partner >= 0 && nano.paintRank[partner] < settledCount) weld(plan.tiles[partner]);
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
  // The tiles painted by `progress`, in paint order: a plate is painted
  // from its seat outward once it has clamped (owner, 2026-10-16), so the
  // settled canvas only ever holds painted art.
  const paintedBy = (progress) => {
    const at = nano.paintAt;
    let low = 0;
    let high = at.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (at[middle] <= progress) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  // Welds catch up a little each frame (a jump into the scene would weld
  // thousands at once); until welded, a painted tile is drawn from the art
  // through a clip. Once the seal has covered them, nothing more is welded.
  let behind = false;
  const syncSettled = (painted, sealed) => {
    const { tiles } = plan;
    const order = nano.paintOrder;
    const step = assemblyCacheStep(settledCount, painted, WELDS_PER_FRAME);
    if (step.reset) {
      settled.getContext("2d").clearRect(0, 0, W, H);
      settledCount = 0;
    }
    while (settledCount > painted) {
      settledCount -= 1;
      unweld(order[settledCount]);
    }
    if (sealed) {
      return;
    }
    let budget = WELDS_PER_FRAME;
    while (settledCount < painted && budget > 0) {
      weld(tiles[order[settledCount]]);
      settledCount += 1;
      budget -= 1;
    }
    behind ||= settledCount < painted;
  };

  // Per-frame buffers, allocated once per plan: a scrub draws thousands
  // of squares a frame and must not leave garbage behind it.
  let buffers = null;
  // The pixel squares of one outline, bucketed by burst group and tone into
  // rect buffers (the eyes'; FAR FROM's reactor's too), in idle slices.
  const allocateFaces = async (nextPixels, active, mark) => {
    const buckets = Array.from({ length: 18 }, () => []);
    let cursor = 0;
    while (active() && cursor < nextPixels.length) {
      mark("buffer-face-buckets");
      const ran = await idleTask((deadline) => {
        if (!active()) return;
        const start = environment.performance?.now?.() ?? Date.now();
        do {
          const square = nextPixels[cursor++];
          if (
            Number.isInteger(square.group) &&
            square.group >= 0 &&
            square.group < 6 &&
            Number.isInteger(square.tone) &&
            square.tone >= 0 &&
            square.tone < 3
          )
            buckets[square.group * 3 + square.tone].push(square);
        } while (
          cursor < nextPixels.length &&
          (environment.performance?.now?.() ?? Date.now()) - start < 4 &&
          (!deadline || deadline.timeRemaining() > 4)
        );
      });
      if (ran === null || !active()) return null;
    }
    if (!active()) return null;
    const faces = Array.from({ length: 6 }, () => Array(3));
    for (let index = 0; index < buckets.length; index += 1) {
      const list = buckets[index];
      mark("buffer-face-allocation");
      const rects = await idleTask(() => (active() ? new Float32Array(list.length * 4) : null));
      if (!rects || !active()) return null;
      let at = 0;
      while (active() && at < list.length) {
        mark("buffer-face-values");
        const ran = await idleTask((deadline) => {
          if (!active()) return;
          const start = environment.performance?.now?.() ?? Date.now();
          do {
            const square = list[at];
            rects.set(
              [square.x - square.size / 2, square.y - square.size / 2, square.size, square.size],
              at * 4,
            );
            at += 1;
          } while (
            at < list.length &&
            (environment.performance?.now?.() ?? Date.now()) - start < 4 &&
            (!deadline || deadline.timeRemaining() > 4)
          );
        });
        if (ran === null || !active()) return null;
      }
      faces[Math.floor(index / 3)][index % 3] = rects;
    }
    return faces;
  };
  const allocateIdle = async (
    nextPlan,
    nextGold,
    nextPixels,
    active,
    mark,
    nextReactorPixels = [],
  ) => {
    const faces = await allocateFaces(nextPixels, active, mark);
    if (!faces || !active()) return null;
    const reactorFaces = nextReactorPixels.length
      ? await allocateFaces(nextReactorPixels, active, mark)
      : null;
    if (!active() || (nextReactorPixels.length && !reactorFaces)) return null;
    const goldCells = nextGold?.count ?? 0;
    const result = {
      heat: [],
      heatCounts: null,
      faces,
      reactorFaces,
      glow: null,
    };
    const allocate = async (phase, Type, length) => {
      mark(`buffer-${phase}`);
      const value = await idleTask(() => (active() ? new Type(length) : null));
      return value && active() ? value : null;
    };
    for (let i = 0; i < GOLD_HEAT.length; i += 1) {
      const value = await allocate("heat", Float32Array, goldCells * 4);
      if (!value) return null;
      result.heat.push(value);
    }
    result.heatCounts = await allocate("heat-counts", Int32Array, GOLD_HEAT.length);
    if (!result.heatCounts) return null;
    return result;
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
  // The pixel squares of one outline (`faces`: by burst group and tone)
  // about (cx, cy): filled group by group, then scattered in their bursts.
  const drawPixelBurst = (context, faces, cx, cy, fill, burst) => {
    for (let group = 0; group < 6; group += 1) {
      if (fill * 6 < group + 0.5) continue;
      const [scale, turn] = BURSTS[group];
      const k = 1 + (scale - 1) * burst;
      context.save();
      context.translate(cx, cy);
      context.rotate((turn * Math.PI * burst) / 180);
      context.scale(k, k);
      context.translate(-cx, -cy);
      for (let tone = 0; tone < 3; tone += 1) {
        const rects = faces[group][tone];
        fillRects(context, rects, rects.length, palette.toneCss[tone], 0.95 * (1 - burst));
      }
      context.restore();
    }
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
      if (goldVisible && !goldVisible[index]) continue;
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

  // Each plate's tiles with their paint-order positions (built once), and a
  // darkened, desaturated copy of each art source to prime them with.
  let primerCache = null;
  const primerParts = () => {
    if (primerCache?.plan === plan) return primerCache.parts;
    const order = nano.paintOrder;
    const pos = new Int32Array(plan.tiles.length);
    for (let k = 0; k < order.length; k += 1) pos[order[k]] = k;
    const byPiece = new Map();
    plan.tiles.forEach((item, index) => {
      // Tiles without a piece (the ornaments) prime by small regions.
      const region = item.pieceId ?? `r${Math.floor(item.cx / 40)},${Math.floor(item.cy / 40)}`;
      const key = `${region}:${item.src ?? 1}`;
      let part = byPiece.get(key);
      if (!part)
        byPiece.set(
          key,
          (part = { src: item.src ?? 1, tiles: [], pos: [], first: Infinity, last: -1 }),
        );
      part.tiles.push(item);
      part.pos.push(pos[index]);
      part.first = Math.min(part.first, pos[index]);
      part.last = Math.max(part.last, pos[index]);
    });
    primerCache = { plan, parts: [...byPiece.values()] };
    return primerCache.parts;
  };
  const primers = new Map();
  const releasePrimers = () => {
    for (const sheet of primers.values()) sheet.width = sheet.height = 0;
    primers.clear();
    primerCache = null;
  };
  const primerSheet = (art) => {
    let sheet = primers.get(art);
    if (sheet) return sheet;
    if (primers.size > 1) releasePrimers();
    sheet = document.createElement("canvas");
    sheet.width = W;
    sheet.height = H;
    const c = sheet.getContext("2d");
    if (c) {
      c.drawImage(art, 0, 0, W, H);
      c.globalCompositeOperation = "source-atop";
      c.fillStyle = "rgb(14 18 28 / 0.66)";
      c.fillRect(0, 0, W, H);
    }
    primers.set(art, sheet);
    return sheet;
  };

  // `calm`: the scroll has rested: the frame is a pure function of the
  // progress (the fire's texture aside, which keeps the wall clock),
  // without the transient effects (comets, sparks, links, recoil, seams,
  // shock rings, spall, pulses, lacquer, droplets, beams, the glint, the
  // scan sweep and the shake).
  let backRects = false;
  let lastDrawMs = 0;
  let quickFrames = 0;
  const draw = (progress, calm = false, dq = 0) => {
    const B = ASSEMBLY_BEATS;
    // The field's layer, when a frame needs it before the preparation (or
    // the idle time after a hidden tab) has made it: outside the frame's
    // measure, so its programs and buffers never trip the governor (sweep
    // 2, F27).
    if (fieldLib && fieldScore && fieldTake && !field && !fieldFailed && progress < B.complete)
      makeField();
    const started = environment.performance?.now?.() ?? 0;
    const context = canvas.getContext("2d");
    const { figure, undersuit } = images;
    behind = false;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, canvas.width, canvas.height);
    const seal = smooth(span(progress, B.seal));
    // The swarm (owner, 2026-10-16: 超大幅な改善) runs until the seal is
    // whole; from .9 on nothing new is drawn.
    const nanites = swarm && progress < B.seal[1] ? swarm : null;
    // The field's state at this progress and its camera: the whole frame is
    // drawn through the zoomed view (the swarm sizes its sprites by it), and
    // the view is identity again from the collapse's end, so the seal, the
    // light and the finished figure land exactly where they always have.
    // The camera and the impacts are the field's: without its layer (no
    // WebGL) the scene is exactly the 2D scene it was.
    let vs = view.scale;
    let vx = view.x;
    let vy = view.y;
    const fielding = Boolean(field && fieldScore && fieldTake && progress < B.complete);
    if (fielding) {
      fieldLib.fieldState(fieldScore, progress, fieldState);
      fieldLib.fieldCamera(fieldState, fieldTake, H, fieldCamera);
      fieldLib.fieldCameraView(fieldCamera, W, H, view.scale, view.x, view.y, fieldView);
      vs = fieldView[0];
      vx = fieldView[1];
      vy = fieldView[2];
    }
    if (nanites) {
      // The swarm never moves the view: the whole figure stands at one place
      // in the pinned frame for every progress (owner, 2026-10-21:
      // 「スクロールに伴って全身が上下に移動する不具合を修正して。」).
      nanites.frame(progress, dq, calm, vs, backRects && !calm);
      nanites.view(vs, vx, vy);
    }
    context.setTransform(vs, 0, 0, vs, vx, vy);
    context.imageSmoothingEnabled = true;

    const flamePhase = (progress - NANITE_FLAME_START) / NANITE_FLAME_SPAN;
    const flame = naniteFlameEnvelope(flamePhase);
    // The fire's texture runs on the wall clock in every frame, the calm
    // one included: a clock of its own (once progress × 60) re-posed the
    // whole flame 260 ms into each rest and again when the scroll resumed.
    const flameClock = (environment.performance?.now?.() ?? 0) / 1000;

    // The cocoon's far side, behind the body; a page's own accents behind
    // the figure (FAR FROM's halo rings), allocation-free by contract.
    if (nanites) nanites.backPass(context);
    if (accents?.back) accents.back(context, progress, calm, W, H);
    if (flame > 0) {
      drawBodyFlame(context, config.size, flame, flameClock, 1, "back", flamePhase, FIRE_TONE);
      drawFlameHeat(context, config.size, Math.min(1, Math.sqrt(flame) * 1.4), flameClock);
    }
    // FAR UP！: the scan wakes the undersuit, top to bottom.
    const scan = span(progress, B.scan);
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
        context.fillStyle = palette.toneCss[0];
        context.fillRect(-W * 0.08, scanned - 1.5, W * 1.16, 3);
        context.globalAlpha = 0.18;
        context.fillRect(-W * 0.08, scanned - 26, W * 1.16, 24);
      }
    }

    // (The bare face's machined detail is baked into the undersuit by
    // scripts/build-rexonance-suit.mjs, so the call shows the same.)

    // Its middle band, over the body and under the plates.
    if (nanites) nanites.midPass(context);
    // The nanites' source (owner, 2026-10-18): a forest-green flame at the
    // reactor, burning while the swarm is born from it and spirals out.
    if (flame > 0) drawNaniteFlame(context, config.core, flame, flameClock, 1, FIRE_TONE);

    // The painted plates (welded in paint order), then the seal into the
    // finished figure.
    const { tiles } = plan;
    const painted = paintedBy(progress);
    syncSettled(painted, seal >= 1);
    context.globalAlpha = 1;
    // A plate's art carries its gold unformed: the armour's from the base
    // figure, the ornaments' from the full figure (owner, 2026-10-16).
    const plates = raw || lights?.unlit || figure;
    const baseArt = baseRaw || baseLights?.unlit || images.base || plates;
    if (seal < 1) {
      context.drawImage(settled, 0, 0, W, H);
      // Painted, not yet welded (the welds catch up a budget a frame): the
      // art itself through one clip per source.
      if (painted > settledCount) {
        const order = nano.paintOrder;
        for (let src = 0; src < 2; src += 1) {
          let any = false;
          context.save();
          context.beginPath();
          for (let index = settledCount; index < painted; index += 1) {
            const item = tiles[order[index]];
            if ((item.src ?? 1) !== src) continue;
            context.rect(item.sx, item.sy, item.tw, item.th);
            any = true;
          }
          if (any) {
            context.clip();
            context.drawImage(src === 0 ? baseArt : plates, 0, 0, W, H);
          }
          context.restore();
        }
      }
      // A plate part-way through forming never shows holes: its tiles not
      // yet painted are laid as dark primed metal in the plate's own shape,
      // so the paint arrives over a whole plate (owner, 2026-10-18).
      if (painted < tiles.length) {
        const parts = primerParts();
        const at = nano.paintAt;
        for (const part of parts) {
          if (part.last < painted) continue;
          // From just before the plate's first cell is painted, fading in.
          const fade = clamp01((progress - at[part.first] + PRIMER_LEAD) / PRIMER_LEAD);
          if (fade <= 0) continue;
          let any = false;
          context.save();
          context.beginPath();
          for (let k = 0; k < part.tiles.length; k += 1) {
            if (part.pos[k] < painted) continue;
            const item = part.tiles[k];
            context.rect(item.sx, item.sy, item.tw, item.th);
            any = true;
          }
          if (any) {
            context.clip();
            context.globalAlpha = fade;
            context.drawImage(primerSheet(part.src === 0 ? baseArt : plates), 0, 0, W, H);
          }
          context.restore();
        }
        context.globalAlpha = 1;
      }
      // Seated plates still in raw metal, and the lacquer front.
      if (nanites) nanites.seatedPass(context, painted);
      if (goldLayer) {
        syncGold(progress);
        context.drawImage(goldLayer, 0, 0, W, H);
        // The molten band and the cooling cells.
        if (nanites) nanites.moltenPass(context);
        // Touch screens (and a scene without the chips) keep the batched heat.
        if (!calm && (coarse.matches || !images.cells)) drawGold(context, progress);
      }
      if (driver) context.drawImage(driver, 0, 0, W, H);
      if (nanites) {
        // Before contact: each trim's guideway being built on the body, its
        // hologram and pulses; each staged plate's contact shadow, then the
        // plate in raw metal on its lifted, tilted stage, with its guideway
        // seen through it; after contact, the conduit it seated onto; the
        // latches, clamps and beams.
        nanites.hologramPass(context);
        nanites.shadowPass(context);
        nanites.stagedPass(context);
        // The guideways under staged plates, through their shells (built
        // once, never hidden: round 3).
        nanites.hologramPass(context, true);
        nanites.conduitPass(context);
        // The lacquer's light sweeping out over each freshly painted plate.
        nanites.lacquerPass(context);
        nanites.hardwarePass(context);
      }
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
    // ... formed first by pixel squares, which scatter behind the wipe.
    if (lightSquares?.length) {
      const { lead, fill, hold, burst: out, drift } = LIGHT_PIXELS;
      const [from, to] = B.light;
      const [coreX, coreY] = config.core;
      if (progress >= from - lead && progress < to + hold + out) {
        // Where the wipe (easeOut of the cube) passes each square's distance.
        const passAt = (d) => from + (to - from) * (1 - Math.cbrt(1 - Math.min(1, d)));
        for (let tone = 0; tone < 3; tone += 1) {
          context.fillStyle = palette.toneCss[tone];
          for (const square of lightSquares) {
            if (square.tone !== tone) continue;
            const pass = passAt(square.d);
            const start = pass - lead + square.group * (fill / 6);
            if (progress < start) continue;
            const burst = smooth(clamp01((progress - pass - hold) / out));
            if (burst >= 1) continue;
            const [scale, turn] = BURSTS[square.group];
            const dx = square.x - coreX;
            const dy = square.y - coreY;
            const length = Math.hypot(dx, dy) || 1;
            const a = (turn * Math.PI * burst) / 180;
            const push = drift * (scale - 1) * burst;
            const ox = (dx / length) * push;
            const oy = (dy / length) * push;
            const x = square.x + ox * Math.cos(a) - oy * Math.sin(a);
            const y = square.y + ox * Math.sin(a) + oy * Math.cos(a);
            context.globalAlpha = 0.95 * (1 - burst) * clamp01((progress - start) / (fill / 3));
            const k = 1 + 0.25 * burst;
            context.fillRect(x, y, square.size * k, square.size * k);
          }
        }
        context.globalAlpha = 1;
      }
    }

    // The form chosen in 03 (owner, 2026-10-11): MAX overwrites the
    // finished Rexonance with cells; ULTRA runs to MAX briefly, overwrites
    // it again and generates its additional parts.
    const form = runway.dataset.form;
    if (formChain && formChain.includes(form) && progress > B.form[0]) {
      // A page's own chain of forms (FAR FROM: ミドル → ハイ → エックスハイ →
      // マックス), each overwriting the last with cells from the core out
      // over an equal share of the form window; the runway ends on the
      // chain's named form, its exact prepared artwork.
      const forms = formFigures();
      if (forms) {
        const [a, b] = B.form;
        const steps = formChain.indexOf(form) + 1;
        if (progress >= b) {
          context.clearRect(0, 0, W, H);
          context.globalAlpha = 1;
          context.drawImage(forms.sheets[form], 0, 0, W, H);
        } else {
          const seg = (b - a) / steps;
          const k = Math.min(steps - 1, Math.floor((progress - a) / seg));
          const key = formChain[k];
          const from = k === 0 ? forms.fig : forms.sheets[formChain[k - 1]];
          const start = a + k * seg;
          drawOverwrite(
            context,
            forms.plans[key],
            from,
            forms.sheets[key],
            span(progress, [start, start + seg - 0.004]),
            span(progress, [start + seg * 0.45, start + seg]),
            forms.tones[key],
            calm,
          );
        }
      }
    } else if (
      !formChain &&
      (form === "max" || form === "ultra" || form === "excelsior") &&
      progress > B.form[0]
    ) {
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

    if (nanites) {
      // The flights, the impacts, the gold's nanites, the cocoon's near
      // side and the free chips spiralling into the reactor.
      nanites.flightPass(context);
      nanites.impactPass(context);
      nanites.goldPass(context);
      nanites.frontPass(context);
      nanites.freePass(context);
    }

    // The disc forms without rotating; only its surrounding coil turns.
    // Both form together, before the existing B.light ignition.
    {
      const [rx, ry] = config.core;
      const R = REACTOR_R;
      const [swirlFrom, swirlTo] = REACTOR_SWIRL;
      if (reactor && progress >= B.deus[0] && progress < B.light[0]) {
        // Separate masks share one clock but never share the coil transform.
        // The primed socket condenses in over the first beat (owner,
        // 2026-10-21: it appeared whole in one frame), never pops.
        drawReactorFormation(
          context,
          reactor,
          config.core,
          span(progress, REACTOR_SWIRL),
          smooth(span(progress, REACTOR_SOCKET_FADE)),
        );
      }
      if (progress >= B.deus[0] && progress < swirlTo) {
        const u = span(progress, REACTOR_SWIRL);
        // Without separate masks, reveal in place rather than rotate the disc.
        if (!reactor) {
          context.save();
          context.beginPath();
          context.arc(rx, ry, R, 0, Math.PI * 2);
          context.clip();
          if (undersuit) {
            // The bare undersuit shows where the reactor will form (owner).
            const ux = (undersuit.width || W) / W;
            const uy = (undersuit.height || H) / H;
            context.drawImage(
              undersuit,
              (rx - R) * ux,
              (ry - R) * uy,
              R * 2 * ux,
              R * 2 * uy,
              rx - R,
              ry - R,
              R * 2,
              R * 2,
            );
          }
          if (u > 0) {
            const grow = easeOut(u);
            context.beginPath();
            context.arc(rx, ry, Math.max(1, R * grow), 0, Math.PI * 2);
            context.clip();
            context.translate(rx, ry);
            const k = 0.55 + 0.45 * grow;
            context.scale(k, k);
            context.translate(-rx, -ry);
            context.globalAlpha = Math.min(1, u * 2.2);
            const art = lights?.unlit || figure;
            const sx = (art.width || W) / W;
            const sy = (art.height || H) / H;
            context.drawImage(
              art,
              (rx - R) * sx,
              (ry - R) * sy,
              R * 2 * sx,
              R * 2 * sy,
              rx - R,
              ry - R,
              R * 2,
              R * 2,
            );
          }
          context.restore();
        }
        if (!calm && progress >= swirlFrom) {
          // Nanites drawn down a logarithmic spiral into the eye.
          context.save();
          context.globalCompositeOperation = "lighter";
          for (let i = 0; i < 36; i += 1) {
            const phase = (i / 36 + u * 1.6) % 1;
            const r = R * 1.5 * (1 - phase) + 2;
            const a = i * 2.39996 + phase * Math.PI * 3.2;
            // All the trails arrive together with the coil, never a few early.
            context.globalAlpha =
              Math.sin(Math.PI * phase) * (1 - u * 0.6) * smooth(Math.min(1, u * 4));
            context.strokeStyle = palette.reactorMotes[i % 3];
            context.lineWidth = 1.2 + (i % 3) * 0.6;
            context.beginPath();
            context.arc(rx, ry, r, a - 0.5, a);
            context.stroke();
          }
          context.restore();
        }
      }
      if (lights && progress >= B.light[0]) {
        const g = span(progress, [B.light[0], B.light[0] + 0.05]);
        if (g < 1) {
          const glowAlpha = Math.sin(Math.PI * g);
          context.save();
          context.translate(rx, ry);
          context.rotate(g * Math.PI * 1.4);
          context.globalCompositeOperation = "lighter";
          for (let arm = 0; arm < 3; arm += 1) {
            context.rotate((Math.PI * 2) / 3);
            context.beginPath();
            for (let t = 0; t <= 1.0001; t += 0.1) {
              const r = R * 0.12 + R * 1.05 * t;
              const a = t * 2.6;
              const x = Math.cos(a) * r;
              const y = Math.sin(a) * r;
              if (t === 0) context.moveTo(x, y);
              else context.lineTo(x, y);
            }
            context.globalAlpha = 0.85 * glowAlpha;
            context.strokeStyle = arm === 1 ? palette.lightArms[1] : palette.lightArms[0];
            context.lineWidth = 3.2 * (1 - g) + 1;
            context.stroke();
          }
          context.restore();
        }
      }
      context.globalAlpha = 1;
    }

    // The field's impact grammar on a lock: a luminance pop about it and a
    // radial burst (fine pointers), on moving frames only — a resting scrub
    // never holds a flash.
    if (fielding && !calm && fieldState[fieldLib.FIELD_STATE.IMPULSES] > 0)
      fieldLib.drawFieldImpact(context, fieldState, W, H, fieldLib.fieldHash, !coarse.matches);
    // Sparse near-side fire crosses the outer armour, not the core/face.
    if (flame > 0)
      drawBodyFlame(context, config.size, flame, flameClock, 1, "front", flamePhase, FIRE_TONE);
    // The fire carries these fragments out first; their metal handoff is
    // on the near side so it cannot disappear under the broad plume.
    if (nanites) {
      nanites.firebrands(context);
      nanites.endFrame();
    }

    // REXONANCE DEUS！: the face fills with pixel squares, which scatter.
    const [visorX, visorY] = config.visor;
    const [fillFrom, burstTo] = B.pixels;
    // The compound eyes do not exist until the pixels fill them (owner,
    // 2026-10-17): from the helmet's beat the visor is empty dark glass,
    // which gives way as the squares arrive.
    const glow = config.glow;
    const hollow = 1 - clamp01((progress - fillFrom) / 0.03);
    if (glow?.length > 2 && undersuit && progress >= B.rexonance[0] && hollow > 0) {
      // Not a black patch: the undersuit's own visor shows through.
      const ux = (undersuit.width || W) / W;
      const uy = (undersuit.height || H) / H;
      const xs = glow.map(([x]) => x);
      const ys = glow.map(([, y]) => y);
      const x0 = Math.min(...xs) - 3;
      const y0 = Math.min(...ys) - 3;
      const w = Math.max(...xs) - x0 + 6;
      const h = Math.max(...ys) - y0 + 6;
      context.save();
      context.globalAlpha = hollow;
      context.beginPath();
      context.moveTo(glow[0][0], glow[0][1]);
      for (let i = 1; i < glow.length; i += 1) context.lineTo(glow[i][0], glow[i][1]);
      context.closePath();
      context.lineWidth = 3;
      context.clip();
      context.drawImage(undersuit, x0 * ux, y0 * uy, w * ux, h * uy, x0, y0, w, h);
      context.restore();
    }
    if (progress >= fillFrom && progress < burstTo) {
      const fill = clamp01((progress - fillFrom) / 0.03);
      const burst = smooth(clamp01((progress - (burstTo - 0.04)) / 0.04));
      if (pixels.length) drawPixelBurst(context, buffers.faces, visorX, visorY, fill, burst);
      // The reactor completes the same way (FAR FROM): its squares fill it
      // over the ignition and scatter from the core.
      if (buffers.reactorFaces)
        drawPixelBurst(context, buffers.reactorFaces, config.core[0], config.core[1], fill, burst);
    }

    // The reactor's light forms from pixel squares like the eyes: they
    // fill the disc, hold while it ignites under them, then scatter.
    if (
      !buffers.reactorFaces &&
      reactorSquares?.length &&
      progress >= REACTOR_PIXELS[0] &&
      progress < REACTOR_PIXELS[1]
    ) {
      const [rx, ry] = config.core;
      const [from, to] = REACTOR_PIXELS;
      const fill = clamp01((progress - from) / 0.02);
      const burst = smooth(clamp01((progress - (to - 0.025)) / 0.025));
      for (let group = 0; group < 6; group += 1) {
        if (fill * 6 < group + 0.5) continue;
        const [scale, turn] = BURSTS[group];
        const k = 1 + (scale - 1) * burst;
        context.save();
        context.translate(rx, ry);
        context.rotate((turn * Math.PI * burst) / 180);
        context.scale(k, k);
        context.translate(-rx, -ry);
        context.globalAlpha = 0.95 * (1 - burst);
        for (let tone = 0; tone < 3; tone += 1) {
          context.fillStyle = palette.toneCss[tone];
          context.beginPath();
          for (const square of reactorSquares)
            if (square.group === group && square.tone === tone)
              context.rect(square.x, square.y, square.size, square.size);
          context.fill();
        }
        context.restore();
      }
      context.globalAlpha = 1;
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
        buffers.glow.addColorStop(0, palette.coreGlow[0]);
        buffers.glow.addColorStop(0.3, palette.coreGlow[1]);
        buffers.glow.addColorStop(1, palette.coreGlow[2]);
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
        context.strokeStyle = palette.rings[ring];
        context.lineWidth = 5 * (1 - u) + 1;
        context.beginPath();
        context.arc(coreX, coreY, 24 + 560 * easeOut(u), 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    // A page's own accents over the figure (allocation-free by contract).
    if (accents?.front) {
      accents.front(context, progress, calm, W, H);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    }
    lastDrawMs = (environment.performance?.now?.() ?? 0) - started;
    // The field's lines on their own canvases, behind and in front of this
    // one, through the same zoomed view (CSS px: the layer has its own
    // backing ratio); a resting frame at the same progress is not redrawn.
    // (After the governor's measure: the layer's GPU submit must not push
    // the 2D band into its rect fallback.)
    if (fielding) {
      if (calm) fieldLevel = FIELD_LEVELS;
      else if (backRects && fieldLevel > 0) fieldLevel -= 1;
      else if (!backRects && fieldLevel < FIELD_LEVELS) fieldLevel += 1;
      if (fieldProgress !== progress || fieldDrawnLevel !== fieldLevel) {
        fieldProgress = progress;
        fieldDrawnLevel = fieldLevel;
        field.render(
          fieldState,
          vs / view.ratio,
          vx / view.ratio,
          vy / view.ratio,
          H,
          0.5 + (0.5 * fieldLevel) / FIELD_LEVELS,
        );
      }
    } else if (field && fieldProgress >= 0) {
      fieldProgress = -1;
      field.clear();
    }
    try {
      environment.__rexonanceDrawMs?.(lastDrawMs, progress, calm);
    } catch {
      // Test-only instrumentation must never affect drawing.
    }
  };

  /* ---------------- the HUD (written only when it changes) ---------------- */
  const setFlag = (element, name, on) => {
    if (on) {
      if (!element.hasAttribute(name)) element.setAttribute(name, "");
    } else if (element.hasAttribute(name)) element.removeAttribute(name);
  };
  const updateHud = (progress) => {
    const form = runway.dataset.form || "standard";
    const formReady = form === "standard" || Boolean(formsState?.[form]);
    if (progress === hud.progress && form === hud.form && formReady === hud.formReady) return;
    hud.progress = progress;
    hud.form = form;
    hud.formReady = formReady;
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
    // The chant's units light one by one while their line is up: the k-th of
    // four at k/5 of the line's beat, so the fourth is lit for the beat's
    // last fifth before the line is done and dims (owner, 2026-10-17:
    // 「4つめの『REXONANCE！』が発光しなかったりする」 — at ×4 the fourth lit
    // only at the beat's end, the frame the line was dimmed). DEUS！ also
    // lights as each group lands, if that is sooner.
    const chantLit = (beat) => Math.min(4, Math.floor(span(progress, beat) * 5));
    let deusDone = 0;
    let landed = 0;
    for (let i = 0; i < plan.partDone.length; i += 1) {
      const done = plan.partDone[i];
      if (done && progress >= done) {
        landed += 1;
        if (i < 4) deusDone += 1;
      }
    }
    const deusLit = Math.min(4, Math.max(deusDone, chantLit(B.deus)));
    const rexonanceLit = chantLit(B.rexonance);
    const chips = `${deusLit}:${rexonanceLit}`;
    if (line !== hud.line || chips !== hud.chips) {
      if (line !== hud.line) runway.dataset.rznLine = String(line);
      hud.line = line;
      hud.chips = chips;
      lines.forEach(({ line: element, chips: units }, index) => {
        setFlag(element, "data-on", index === line);
        setFlag(element, "data-done", index < line);
        const lit = index === 2 ? deusLit : index === 3 ? rexonanceLit : 0;
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
      // Owner (2026-10-17): the read-outs light with the scroll like the
      // chips (they stayed dark until the lock). One write per percent.
      runway.style?.setProperty?.("--rzn-glow", (Number(share) / 100).toFixed(2));
    }
    if (counter) {
      const landedCount = landedBy(progress);
      if (landedCount !== hud.landedCount) {
        hud.landedCount = landedCount;
        if (!hud.totalFormatted) hud.totalFormatted = grouped(plan.tiles.length);
        const count = `${grouped(landedCount)} / ${hud.totalFormatted}`;
        if (count !== hud.count) {
          hud.count = count;
          writeText(counter, count);
        }
      }
    }
    const complete = progress >= B.complete;
    if (complete !== hud.complete) {
      hud.complete = complete;
      setFlag(runway, "data-rzn-complete", complete);
    }
    const state = assemblyPhase(progress, form, formReady);
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
  let formsRetryAt = 0;
  const formFigures = () => {
    if (formsState || formsLoading || !config.forms || !images || clock() < formsRetryAt)
      return formsState;
    formsLoading = true;
    if (formChain) {
      // A page's chain of forms, each on a sheet of the figure's frame; the
      // overwrite plan of each from the one before it (its extras: what the
      // next form adds or changes most), its light from the page's tones.
      Promise.all(formChain.map((key) => picture(config.forms[key])))
        .then((loaded) => {
          if (disposed) return;
          const sheet = (image) => {
            const canvas = Object.assign(document.createElement("canvas"), {
              width: W,
              height: H,
            });
            if (image) canvas.getContext("2d").drawImage(image, 0, 0, W, H);
            return canvas;
          };
          const base = { width: W, height: H, cell: 8, origin: config.core, seed: 77 };
          const grid = planOverwrite(base);
          const fig = sheet(images.figure);
          const sheets = {};
          const plans = {};
          const tones = {};
          let previous = sampleCells(fig, grid, document);
          formChain.forEach((key, k) => {
            sheets[key] = sheet(loaded[k]);
            const cellsOf = sampleCells(sheets[key], grid, document);
            plans[key] =
              previous && cellsOf
                ? planOverwrite({
                    ...base,
                    seed: 78 + k,
                    extraBy: "difference",
                    samples: { from: previous, to: cellsOf },
                  })
                : grid;
            tones[key] = config.forms.tones?.[key] ?? FORM_TONES[key] ?? FORM_TONES.standard;
            previous = cellsOf;
          });
          formsState = { pad: 0, width: W, fig, chain: formChain, sheets, plans, tones, warp: [] };
          // (formsState[key]: the form is ready, for the HUD.)
          for (const key of formChain) formsState[key] = sheets[key];
          lastProgress = -1;
          schedule();
        })
        .catch(() => {
          formsRetryAt = clock() + 1000;
        })
        .finally(() => {
          formsLoading = false;
        });
      return null;
    }
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
      .catch(() => {
        formsRetryAt = clock() + 1000;
      })
      .finally(() => {
        formsLoading = false;
      });
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

  // Follow-through (owner, 2026-10-16: fine and dynamic at every notch;
  // 2026-10-23: 「スクロールに伴ってより滑らかに変身されるようにし」): the
  // displayed progress is the playhead (scroll-playhead.js), a critically
  // damped spring chasing the scroll's progress in closed form over each
  // frame's time — one notch plays as a short motion, notch after notch
  // blends into one, a fling is followed at most PLAYHEAD.lag behind and
  // caught up in one ease, a cut (a link, a restore) snaps. The HUD reads
  // the scroll itself.
  const head = new ScrollPlayhead();
  let lastStamp = 0;
  let force = false;
  // The fire at rest (review of 2ce6712): a fire that sits still is the
  // 固体 look the owner rejected, so while it burns at the resting progress
  // the moment is redrawn every frame on the wall clock, with the arguments
  // it was last drawn with — the same suit-up moment, only the flame (and
  // the reactor's light) flowing — until the scroll moves on, the fire is
  // spent, or the scene stops being shown. Touch screens redraw it at
  // about 30 fps.
  let restCalm = false;
  let restStep = 0;
  let restStamp = -Infinity;
  const burningAt = (q) => naniteFlameEnvelope((q - NANITE_FLAME_START) / NANITE_FLAME_SPAN) > 0;
  const REST_FRAME_MS = 1000 / 60;
  const REST_TOUCH_FRAME_MS = 1000 / 31;
  const render = (stamp) => {
    frame = 0;
    if (disposed || !live || document.hidden) return;
    // ResizeObserver can be delayed across WebKit restoration. The first
    // animation frame may establish geometry without waiting indefinitely.
    if (!view && !measure()) return;
    const progress = readProgress();
    if (pendingSize) {
      const [width, height] = pendingSize;
      pendingSize = null;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      if (field && fieldCss) field.resize(fieldCss[0], fieldCss[1], environment.devicePixelRatio);
      fieldProgress = -1;
      lastProgress = -1;
    }
    const fresh = typeof stamp === "number" && stamp > lastStamp;
    const dt = Math.min(50, Math.max(8, fresh ? stamp - lastStamp : 16.7));
    if (fresh) lastStamp = stamp;
    let shown = progress;
    if (lastProgress >= 0) {
      if (!force && head.settled && Math.abs(progress - lastProgress) < 0.0005) {
        if (!burningAt(lastProgress)) return;
        // At rest the fire keeps flowing (the HUD, the governor and the
        // calm timer stay as the last moving frame left them).
        const at = typeof stamp === "number" ? stamp : NaN;
        if (!(at - restStamp < (coarse.matches ? REST_TOUCH_FRAME_MS : REST_FRAME_MS) - 2)) {
          restStamp = Number.isFinite(at) ? at : -Infinity;
          draw(lastProgress, restCalm, restStep);
        }
        schedule();
        return;
      }
      shown = head.follow(progress, dt, coarse.matches ? PLAYHEAD.omegaTouch : PLAYHEAD.omega);
    } else head.snap(progress);
    force = false;
    const step = lastProgress >= 0 ? Math.min(0.01, Math.abs(shown - lastProgress)) : 0;
    lastProgress = shown;
    // The governor: a slow frame (over 7 ms) draws the far band as rects from
    // the next one on, and it stays so until the scroll rests or 30 frames in
    // a row come in under 4 ms — never alternating frame by frame, which
    // would flicker hundreds of far chips at the display rate.
    if (coarse.matches) backRects = false;
    else if (lastDrawMs > 7) {
      backRects = true;
      quickFrames = 0;
    } else if (backRects && lastDrawMs < 4) {
      quickFrames += 1;
      if (quickFrames >= 30) backRects = false;
    } else quickFrames = 0;
    draw(shown, false, step);
    restCalm = false;
    restStep = step;
    restStamp = typeof stamp === "number" && Number.isFinite(stamp) ? stamp : -Infinity;
    updateHud(progress);
    // The first live frame is on the canvas: the still under it goes.
    if (runway.dataset.rznArming) delete runway.dataset.rznArming;
    environment.clearTimeout(calmTimer);
    calmTimer = 0;
    if (shown !== progress) {
      schedule();
      return;
    }
    // The welds or the gold still catching up at the resting progress: the
    // next frame follows on, and the calm frame waits until they have
    // converged (sweep 2, F86: armed beside the catch-up, a calm frame that
    // landed between two slow frames alternated with them, the impact's
    // rays coming and going at rest).
    if (behind) {
      force = true;
      schedule();
      return;
    }
    // Resting with the fire alive: keep it flowing.
    if (burningAt(shown)) schedule();
    // Once the scroll rests, redraw the moment without its transient effects.
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
      ) {
        // At rest the whole far band is back (the calm frame never uses the
        // governor), and the next scroll starts from a full frame.
        backRects = false;
        quickFrames = 0;
        draw(lastProgress, true);
        restCalm = true;
        restStep = 0;
        // The calm frame continues the fire's wall clock (never a pose of
        // its own), and the fire flows on from it.
        if (burningAt(lastProgress)) schedule();
      }
    }, CALM_MS);
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

  // The finished still is every quiet mode's picture. While motion is
  // allowed and the scene is not yet live (near or not, round 4), the
  // undersuit stands in its place with the read-outs at the start, as the
  // first live frame will
  // draw them (owner, 2026-10-16: 「スクロールする前から完成済みなこともあるので
  // 修正して。」 — the preparation can take seconds, and the finished suit
  // showed first). A reader arriving from below, past the runway's end,
  // keeps the finished still: that is what the live frame draws there.
  const restHud = () => {
    delete runway.dataset.rznState;
    delete runway.dataset.rznArming;
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
      progress: -1,
      form: "",
      formReady: false,
      line: -1,
      chips: "",
      parts: -1,
      percent: "",
      landedCount: -1,
      totalFormatted: "",
      count: "",
      complete: null,
      phase: "",
      formComplete: null,
    });
    if (percent) writeText(percent, restPercent);
    if (counter) writeText(counter, restCount);
    runway.style?.removeProperty?.("--rzn-glow");
  };
  const showLoading = () => {
    if (live || runway.dataset.rznState === "loading") return;
    runway.dataset.rznState = "loading";
    runway.dataset.rznLine = "0";
    runway.dataset.rznPhase = "prepare";
    lines.forEach(({ line, chips }, index) => {
      setFlag(line, "data-on", index === 0);
      if (index === 0 && chips.length === 1) setFlag(chips[0], "data-on", true);
    });
    if (percent) writeText(percent, "000");
    // The count is the live frame's to write (its first writes 0 / N); until
    // then the nanites stand by, never the finished suit's ONLINE beside
    // 000 % (sweep 2, F21). restHud() gives the markup's word back.
    if (counter) writeText(counter, LOADING_COUNT);
    hud.count = "";
    hud.landedCount = -1;
  };
  // Round 4 (patch B): under the motion gate the undersuit stand-in is the
  // scene's default picture, set from the near observer's first notice (the
  // page's first frames, long before a reader can reach the scene), not
  // only once the scene is near: a far jump (End, a scrollbar drag) painted
  // a frame of the finished still and its 100 % read-out before the near
  // observer's notice arrived. Only a reader at the runway's end (near and
  // past it: the live frame there is the finished suit) keeps the finished
  // still. Reduced motion, economy, Save-Data/2G and forced colours never
  // get here: they keep the finished still exactly as before.
  const standIn = () => {
    if (live || !motionAllowed()) return;
    if (!nearPast) showLoading();
    else if (runway.dataset.rznState === "loading") restHud();
  };
  // The field's score from the plan's beats: the four DEUS！ groups, the
  // tail's and the helmet's, each converged on over its window and locked
  // when its last tile lands; the field implodes from the helmet's lock
  // to the seal and detonates with the light, gone at `complete`.
  const FIELD_STRENGTH = [1, 1, 1.1, 0.85, 0.55, 0.5];
  const buildFieldScore = () => {
    if (!fieldLib || !plan) return null;
    const B = ASSEMBLY_BEATS;
    const groups = [];
    let last = 0;
    for (let beat = 0; beat < plan.partDone.length; beat += 1) {
      const lock = plan.partDone[beat];
      if (!lock) continue;
      const [from] = beatWindow(beat);
      const [x, y] = plan.centroids[beat];
      // (Its impulse on the plate that locks it, not on the group's mean.)
      const [ix, iy] = plan.anchors?.[beat] ?? [x, y];
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const piece of config.pieces) {
        if (piece.preset || beatOfPiece(piece, config.size) !== beat) continue;
        x0 = Math.min(x0, piece.x);
        y0 = Math.min(y0, piece.y);
        x1 = Math.max(x1, piece.x + piece.w);
        y1 = Math.max(y1, piece.y + piece.h);
      }
      const sx = x1 > x0 ? Math.max(0, (x1 - x0) / 2 - 40) : 0;
      const sy = y1 > y0 ? Math.max(0, (y1 - y0) / 2 - 30) : 0;
      groups.push({
        x,
        y,
        sx,
        sy,
        from: Math.min(from, lock - 0.01),
        lock,
        strength: FIELD_STRENGTH[beat] ?? 0.7,
        ix,
        iy,
      });
      last = Math.max(last, lock);
    }
    if (!groups.length) return null;
    groups.sort((a, b) => a.lock - b.lock);
    try {
      return fieldLib.fieldScore({
        // The wake is the burst (owner, 2026-10-21): the field's one window
        // of the fire's phase (the detonation, every fragment's cooling into
        // a chip, the last chip's sweep onto its line) on the runway.
        wake: [scrollFlameAt(FIELD_WAKE[0]), scrollFlameAt(FIELD_WAKE[1])],
        groups,
        collapse: [Math.min(last, B.seal[0] - 0.006), B.seal[0]],
        detonate: [B.light[0], B.complete],
        end: B.complete,
        impulse: 0.03,
        origin: config.core,
        spread: [W * 0.2, H * 0.36],
        // The armour must read as it seats: the field thins to this by the
        // last lock and stays off the locked groups' plates.
        settle: 0.3,
      });
    } catch {
      return null;
    }
  };
  // The field's layer, made in idle time (fieldIdle) or by the first live
  // frame that wants it: its canvases on the scene canvas's box, the back
  // one under it and the front one over it. Null where WebGL is not to be
  // had (the scene is unchanged).
  const makeField = () => {
    if (field || fieldFailed || !fieldLib || !fieldTake) return;
    const parent = canvas.parentNode;
    if (!parent || typeof parent.insertBefore !== "function") {
      fieldFailed = true;
      return;
    }
    // Made ahead of the scene's first measure, its backing is sized from
    // the frame its canvases fill (read before they join it), so the first
    // live frame does not reallocate it (a WebGL resize cost a throttled
    // phone 650 ms there).
    const box =
      fieldCss ??
      (frameBox.clientWidth > 0 && frameBox.clientHeight > 0
        ? [frameBox.clientWidth, frameBox.clientHeight]
        : null);
    const layer = fieldLib.createFieldLayer({
      document,
      coarse: coarse.matches,
      take: fieldTake,
      className: "rzn-field",
      // The page's field tones (FAR FROM: ice, gold, white); the fire's own
      // (FIELD_TONES) when the config names none.
      ...(palette.field ? { tones: palette.field } : {}),
    });
    if (!layer) {
      fieldFailed = true;
      return;
    }
    for (const sheet of layer.canvases) {
      if (sheet.dataset?.side === "front") parent.insertBefore(sheet, canvas.nextSibling);
      else parent.insertBefore(sheet, canvas);
    }
    if (box) layer.resize(box[0], box[1], environment.devicePixelRatio);
    field = layer;
    fieldProgress = -1;
    fieldLevel = FIELD_LEVELS;
    fieldDrawnLevel = -1;
  };
  const releaseField = () => {
    field?.release();
    field = null;
    fieldProgress = -1;
  };
  // The layer made in idle time (sweep 2, F27: inside the first live frame
  // its programs, link and buffers cost 84–260 ms on a throttled phone):
  // once the preparation is done (the visit's take rolled with it), and
  // again in idle time after a hidden tab released it. A frame that needs
  // the field first makes it itself, outside its measure.
  const fieldIdle = (token) => {
    if (!fieldLib || field || fieldFailed) return null;
    return idleTask(() => {
      if (token !== generation || disposed || field || fieldFailed || !fieldLib) return;
      if (!live && !(plan && settled && buffers)) return;
      if (!fieldTake) fieldTake = fieldLib.fieldTake(fieldLib.fieldVisitSeed(environment));
      makeField();
    });
  };
  const goLive = () => {
    if (disposed || !pageActive || live || !near || document.hidden || !images || !motionAllowed())
      return;
    if (!plan || !settled || !buffers) return;
    live = true;
    // A visit's take: rolled here (or with the layer the preparation made,
    // fieldIdle), kept for as long as the scene is live.
    if (fieldLib) {
      if (!fieldTake) fieldTake = fieldLib.fieldTake(fieldLib.fieldVisitSeed(environment));
      fieldScore = buildFieldScore();
    }
    runway.dataset.rznLoad = "ready";
    // The still that was showing stays up under the (transparent) canvas
    // until the first live frame is drawn: no frame of nothing between
    // them (owner, 2026-10-16: 「スクロールする前から完成済みなこともあるので
    // 修正して。」).
    runway.dataset.rznArming = runway.dataset.rznState === "loading" ? "under" : "still";
    runway.dataset.rznState = "live";
    lastProgress = -1;
    listen(near);
    // The canvas shows only now: it is measured once laid out, from the
    // observer's first notice (a read here would force the layout).
    if (resizeObserver) {
      resizeObserver.observe(canvas);
      resizeObserver.observe(runway);
    }
    schedule();
  };
  const goStill = () => {
    cancelPreparation();
    live = false;
    runway.dataset.rznLoad = motionAllowed() ? "waiting" : "static";
    listen(false);
    resizeObserver?.disconnect();
    restHud();
    pendingSize = null;
    releaseField();
    fieldScore = null;
    fieldTake = null;
    fieldFailed = false;
    canvas.width = canvas.height = 0;
    if (settled) settled.width = settled.height = 0;
    settled = null;
    plan = null;
    for (const sheet of [
      raw,
      goldArt,
      goldLayer,
      frame_,
      frameDeep_,
      driver,
      lights?.unlit,
      lights?.lights,
      lights?.motes,
      baseRaw,
      baseLights?.unlit,
      baseLights?.lights,
      baseLights?.motes,
      reactor?.art,
      reactor?.disc,
      reactor?.socket,
    ])
      if (sheet) sheet.width = sheet.height = 0;
    raw = goldArt = goldLayer = goldPlan = driver = lights = frame_ = null;
    frameDeep_ = baseLights = baseRaw = null;
    reactor = null;
    for (const sheet of naniteSheets) sheet.width = sheet.height = 0;
    naniteSheets = [];
    swarm?.release?.();
    nano = swarm = goldVisible = null;
    releasePrimers();
    goldCount = 0;
    goldReverse.dirty = -1;
    goldReverse.at = 0;
    buffers = null;
    view = null;
    head.reset();
    force = false;
  };

  // A reader arriving inside the runway (a restored scroll, a jump): the
  // welds and the gold are caught up to where they are, in bounded slices,
  // before the first live frame, so it draws that moment whole instead of
  // catching up from the start a budget a frame (R-1 19/60). Far away or at
  // the start there is nothing to catch up and the scene goes live at once.
  const caughtUp = (progress) =>
    progress >= ASSEMBLY_BEATS.seal[1] ||
    (settledCount === paintedBy(progress) &&
      (!goldLayer || (goldCount === goldBy(progress) && goldReverse.dirty < 0)));
  const arrival = () => {
    measureRunway();
    return readProgress();
  };
  const prime = async (token) => {
    while (token === generation && near && !live && plan && settled && buffers) {
      if (caughtUp(arrival())) return;
      const ran = await idleTask(() => {
        if (token !== generation || !plan || !settled) return;
        const progress = arrival();
        const start = clock();
        do {
          behind = false;
          syncSettled(paintedBy(progress), span(progress, ASSEMBLY_BEATS.seal) >= 1);
          if (goldLayer) syncGold(progress);
        } while (behind && clock() - start < 3);
        behind = false;
      });
      if (ran === null) return;
    }
  };
  let preparing = null;
  const wake = () => {
    if (disposed || !pageActive || live || !motionAllowed() || document.hidden) return;
    // Load alongside this scene's existing warm-up, never on global startup
    // and never as a prerequisite for its plates, call clock or navigation.
    void warmNaniteFlame(environment);
    // (The stand-in is the near observer's and sync's, round 4: the warm
    // preparation far away never changes the picture.)
    if (plan && settled && buffers) {
      if (!near || caughtUp(arrival())) {
        goLive();
        return;
      }
    }
    if (preparing) return;
    if (retryTimer) return;
    const token = generation;
    runway.dataset.rznLoad = images ? "preparing" : "loading";
    preparing = idleTask(() => images || load())
      .then(() => {
        if (token === generation && images && !(plan && settled && buffers)) {
          runway.dataset.rznLoad = "preparing";
          return build();
        }
      })
      .then(() => {
        if (
          token === generation &&
          pageActive &&
          !document.hidden &&
          motionAllowed() &&
          !(plan && settled && buffers)
        )
          throw new Error("assembly preparation did not complete");
        if (token === generation) return fieldIdle(token);
      })
      .then(() => {
        if (token === generation && near) return prime(token);
      })
      .then(() => {
        if (token === generation) goLive();
      })
      .catch(() => {
        if (token !== generation) return;
        loading = null;
        if (disposed || live) return;
        restHud();
        if (retryCount < 2 && pageActive && !document.hidden && motionAllowed()) {
          retryCount += 1;
          retryTimer = environment.setTimeout(() => {
            retryTimer = 0;
            if (near || warm || eager) wake();
          }, retryCount * 250);
        } else runway.dataset.rznLoad = "error";
      })
      .finally(() => {
        if (token === generation) preparing = null;
      });
  };
  const retryAssembly = () => {
    if (runway.dataset.rznLoad !== "error" || !near || !pageActive || document.hidden || disposed)
      return;
    retryCount = 0;
    loading = null;
    wake();
  };
  const onOnline = () => {
    if (disposed || !pageActive || document.hidden || !motionAllowed()) return;
    if (live) {
      formsRetryAt = 0;
      lastProgress = -1;
      schedule();
      return;
    }
    if (runway.dataset.rznLoad === "error") {
      retryCount = 0;
      loading = null;
      modulesLoading = null;
    }
    if (near || warm || eager) wake();
  };
  const nearObserver =
    typeof environment.IntersectionObserver === "function"
      ? new environment.IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              near = entry.isIntersecting;
              // Past the runway's end (its bottom above the view's): the
              // live frame there is the finished suit (the entry's own
              // rect; no layout read).
              const box = entry.boundingClientRect;
              nearPast = Boolean(near && box && box.bottom <= (environment.innerHeight || 0) + 1);
            }
            if (disposed) return;
            standIn();
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
        if (warm) {
          // The undersuit that stands in while the scene prepares is fetched
          // and decoded now, not when it is shown (round 3, review: a cold
          // jump showed an empty stage for 50–90 ms). Nothing visible changes.
          if (under && motionAllowed() && under.loading !== "eager") under.loading = "eager";
          if (driverStandin && motionAllowed()) driverStandin.loading = "eager";
          wake();
        }
      },
      { rootMargin: `${Math.round((environment.innerHeight || 900) * 3.5)}px 0px` },
    );
    warmObserver.observe(runway);
  };

  // The early warm-up (owner, 2026-10-17: 「レクソナンスのスクロールで変身する
  // やつが読み込まれずに過ぎてしまったりする」 — 3.5 screens ahead left a brisk
  // reader, or a slow phone, 2–4 s of preparation, and they passed the scene
  // on its stand-in). Once the page is idle after its load, the network half
  // is fetched (prefetch); once the reader has scrolled past the hero, the
  // preparation itself starts, in the same idle slices as the warm-up (the
  // picture does not change: the stand-in stays the near observer's).
  let eager = false;
  let earlyId = 0;
  let earlyIdle = false;
  let earlyListening = false;
  const pastHero = () => (environment.scrollY || 0) >= (environment.innerHeight || 900) * 0.5;
  const stopEarlyScroll = () => {
    if (!earlyListening) return;
    earlyListening = false;
    document.removeEventListener("scroll", onEarlyScroll);
  };
  const goEager = () => {
    stopEarlyScroll();
    eager = true;
    prefetch();
    wake();
  };
  const onEarlyScroll = () => {
    if (pastHero()) goEager();
  };
  // (The reader's first scroll may come before the page's load event, with
  // its images still arriving: the preparation then asks for its sheets at
  // high priority, ahead of the images further down.)
  const listenEarly = () => {
    if (earlyListening || eager || disposed) return;
    earlyListening = true;
    document.addEventListener("scroll", onEarlyScroll, { passive: true });
  };
  const startEarly = () => {
    earlyId = 0;
    if (disposed || !motionAllowed()) return;
    // At idle only the code (the swarm module and the kit) is fetched: a
    // direct entry keeps speculative suit work off (verify-rexonance-rx17-
    // preload's roundtrip pin), so the sheets wait for the past-hero scroll.
    modules().catch(() => {});
    if (eager) return;
    if (pastHero()) goEager();
    else listenEarly();
  };
  const scheduleEarly = () => {
    environment.removeEventListener("load", scheduleEarly);
    if (disposed || earlyId) return;
    earlyIdle = typeof environment.requestIdleCallback === "function";
    earlyId = earlyIdle
      ? environment.requestIdleCallback(startEarly, { timeout: 2000 })
      : environment.setTimeout(startEarly, 600);
  };
  const cancelEarly = () => {
    environment.removeEventListener("load", scheduleEarly);
    stopEarlyScroll();
    if (earlyId) {
      if (earlyIdle) environment.cancelIdleCallback?.(earlyId);
      else environment.clearTimeout(earlyId);
    }
    earlyId = 0;
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
      // A hidden page holds no GPU field; the next live frame remakes it.
      releaseField();
      return;
    }
    // Motion allowed again (Reduce Motion or economy turned off): the
    // assembly's status follows, never the still's copy beside the stand-in
    // (sweep 2, F82).
    if (!live && runway.dataset.rznLoad === "static") runway.dataset.rznLoad = "waiting";
    standIn();
    if (warm || near || eager) wake();
    else if (!earlyId && !earlyListening && document.readyState === "complete") startEarly();
    // Back from a hidden tab: the released layer is remade in idle time.
    if (live) void fieldIdle(generation);
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
  const onReduced = (event) => {
    reducedNow = mediaNow(reduced, event);
    sync();
  };
  const onForcedColors = (event) => {
    forcedNow = mediaNow(forcedColors, event);
    sync();
  };
  const htmlObserver = new environment.MutationObserver(sync);
  htmlObserver.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
  reduced.addEventListener?.("change", onReduced);
  forcedColors.addEventListener?.("change", onForcedColors);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  runway.addEventListener?.("rexonance:assembly-retry", retryAssembly);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", onPageShow);
  environment.addEventListener("online", onOnline);
  environment.addEventListener("resize", observeWarmup);
  nearObserver?.observe(runway);
  observeWarmup();
  if (motionAllowed()) listenEarly();
  if (document.readyState === "complete") scheduleEarly();
  else environment.addEventListener("load", scheduleEarly);
  if (!nearObserver) {
    near = warm = true;
    standIn();
    wake();
  }

  return () => {
    disposed = true;
    goStill();
    cancelEarly();
    fetched.clear();
    if (chain) {
      chain.port1.onmessage = null;
      chain.port1.close?.();
      chain.port2.close?.();
      chain = null;
    }
    chained.length = 0;
    nearObserver?.disconnect();
    warmObserver?.disconnect();
    htmlObserver.disconnect();
    reduced.removeEventListener?.("change", onReduced);
    forcedColors.removeEventListener?.("change", onForcedColors);
    connection?.removeEventListener?.("change", sync);
    document.removeEventListener("visibilitychange", sync);
    runway.removeEventListener?.("rexonance:assembly-retry", retryAssembly);
    if (restLoad === undefined) delete runway.dataset.rznLoad;
    else runway.dataset.rznLoad = restLoad;
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", onPageShow);
    environment.removeEventListener("online", onOnline);
    environment.removeEventListener("resize", observeWarmup);
    images?.figure?.close?.();
    images?.undersuit?.close?.();
    images?.gold?.close?.();
    images?.atlas?.close?.();
    images?.base?.close?.();
    images?.cells?.close?.();
    images?.comets?.close?.();
    images?.fx?.close?.();
    images?.guide?.close?.();
    images?.cellsB?.close?.();
    formObserver?.disconnect();
    environment.clearTimeout(calmTimer);
    for (const image of loaders) releasePendingImage(image);
    loaders.clear();
    for (const cancel of decodeWaiters) cancel();
    decodeWaiters.clear();
    // A form chain's sheets (one per form, figure-sized) are freed first.
    for (const sheet of Object.values(formsState?.sheets ?? {})) sheet.width = sheet.height = 0;
    if (formsState)
      for (const sheet of [
        formsState.fig,
        formsState.max,
        formsState.ultra,
        formsState.excelsior,
        ...formsState.warp,
      ])
        if (sheet) sheet.width = sheet.height = 0;
    formsState = null;
    images = null;
    for (const sheet of [
      raw,
      goldArt,
      goldLayer,
      frame_,
      frameDeep_,
      driver,
      lights?.unlit,
      lights?.lights,
      lights?.motes,
      baseRaw,
      baseLights?.unlit,
      baseLights?.lights,
      baseLights?.motes,
      reactor?.art,
      reactor?.disc,
      reactor?.socket,
    ])
      if (sheet) sheet.width = sheet.height = 0;
    raw = goldArt = goldLayer = goldPlan = driver = lights = frame_ = null;
    frameDeep_ = baseLights = baseRaw = null;
    reactor = null;
    for (const sheet of naniteSheets) sheet.width = sheet.height = 0;
    naniteSheets = [];
    swarm?.release?.();
    nano = swarm = goldVisible = null;
    releasePrimers();
  };
}
