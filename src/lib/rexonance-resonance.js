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
 * - data-rsn-hit on a locked figure's parent;
 * - data-rsn-pulse ("a" / "b") on the page, so the armour's core rings with
 *   each lock (alternating restarts a burst that is still running);
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
const PULSE_MS = 1500;
const PULSE_GAP_MS = 700;
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
  let lastPulse = Number.NEGATIVE_INFINITY;

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
    const at = clock();
    if (at - lastPulse >= PULSE_GAP_MS) {
      lastPulse = at;
      flag(page, "data-rsn-pulse", page.dataset.rsnPulse === "a" ? "b" : "a", PULSE_MS);
    }
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
  return [ASSEMBLY_BEATS.rexonance[0] + 0.03, ASSEMBLY_BEATS.rexonance[1]];
};

/**
 * The nanite plan: every tile of the figure that carries paint, which
 * piece and beat it belongs to, where its mote hangs, and when it flies,
 * lands (t1, sorted) and, for the helmet, hovers. `sample` holds one RGBA
 * texel per tile (the figure drawn down to cols × rows), or null.
 */
export function planAssembly({ size, pieces, core, tile, sample = null, seed = 1510 }) {
  const { width, height } = size;
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);
  const random = seededRandom(seed);
  const ranked = pieces.map((piece, index) => ({
    piece,
    index,
    beat: beatOfPiece(piece, size),
    area: piece.w * piece.h,
    rank: 0,
    reach: 1,
  }));
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
      for (const entry of ranked) {
        const { x, y, w, h } = entry.piece;
        if (cx >= x && cx < x + w && cy >= y && cy < y + h && (!owner || entry.area < owner.area))
          owner = entry;
      }
      if (!owner) {
        let best = Number.POSITIVE_INFINITY;
        for (const entry of ranked) {
          const distance = (entry.piece.seat[0] - cx) ** 2 + (entry.piece.seat[1] - cy) ** 2;
          if (distance < best) {
            best = distance;
            owner = entry;
          }
        }
      }
      const reach = owner ? Math.hypot(cx - owner.piece.seat[0], cy - owner.piece.seat[1]) : 0;
      if (owner) owner.reach = Math.max(owner.reach, reach);
      tiles.push({ sx, sy, tw, th, cx, cy, owner, reach, rgb });
    }
  }
  const [coreX, coreY] = core;
  const partDone = ASSEMBLY_PARTS.map(() => 0);
  const centroids = ASSEMBLY_PARTS.map(() => [0, 0, 0]);
  tiles.forEach((item, index) => {
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
      (item.owner?.rank ?? 0) * 0.52 +
        (item.reach / (item.owner?.reach ?? 1)) * 0.38 +
        random() * 0.1,
    );
    item.beat = beat;
    item.t0 = from + key * (to - from - flight);
    item.hover = beat === 5 ? item.t0 + flight : 0;
    item.t1 = beat === 5 ? ASSEMBLY_BEATS.clamp : item.t0 + flight;
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
    partDone[beat] = Math.max(partDone[beat], item.t1);
    centroids[beat][0] += item.cx;
    centroids[beat][1] += item.cy;
    centroids[beat][2] += 1;
    delete item.owner;
    delete item.reach;
    delete item.rgb;
  });
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
  let live = false;
  let near = false;
  let frame = 0;
  let images = null;
  let loading = null;
  let plan = null;
  let settled = null;
  let settledCount = 0;
  let pixels = null;
  let view = null;
  let lastProgress = -1;
  const hud = { line: -1, chips: "", parts: -1, percent: "", count: "", complete: null };

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
    loading = Promise.all([decode(config.figure), decode(config.undersuit)]).then(
      ([figure, undersuit]) => {
        images = { figure, undersuit };
        return images;
      },
    );
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

  // Cut in steps, each its own task, so no step is long on a slow phone:
  // the sample, then the plan, then the weld canvas.
  let building = null;
  const nextTask = () => new Promise((resolve) => environment.setTimeout(resolve, 0));
  const build = () => {
    if (building) return building;
    const tile = coarse.matches ? 15 : 12;
    building = sampleFigure(tile)
      .then((sample) => nextTask().then(() => sample))
      .then((sample) => {
        if (disposed) return;
        plan = planAssembly({
          size: config.size,
          pieces: config.pieces,
          core: config.core,
          tile,
          sample,
        });
        pixels = facePixels(config.glow, config.visor);
        return nextTask();
      })
      .then(() => {
        if (disposed) return;
        settled = document.createElement("canvas");
        settled.width = W;
        settled.height = H;
        settledCount = 0;
        allocate();
      })
      .finally(() => {
        building = null;
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
  const weld = (item) => {
    const context = settled.getContext("2d");
    const inset = Math.min(0.8, item.tw * 0.07);
    context.drawImage(
      images.figure,
      item.sx + inset,
      item.sy + inset,
      item.tw - inset * 2,
      item.th - inset * 2,
      item.sx + inset,
      item.sy + inset,
      item.tw - inset * 2,
      item.th - inset * 2,
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
    while (settledCount > landed) {
      settledCount -= 1;
      unweld(tiles[settledCount]);
    }
    if (sealed) {
      behind = false;
      return;
    }
    let budget = WELDS_PER_FRAME;
    while (settledCount < landed && budget > 0) {
      weld(tiles[settledCount]);
      settledCount += 1;
      budget -= 1;
    }
    behind = settledCount < landed;
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
    buffers = {
      motes: Array.from({ length: 6 }, () => new Float32Array(n)),
      moteCounts: new Int32Array(6),
      art: new Int32Array(plan.tiles.length),
      artRects: new Float32Array(n),
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

  const draw = (progress) => {
    const context = canvas.getContext("2d");
    const { figure, undersuit } = images;
    const B = ASSEMBLY_BEATS;
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
    }
    if (seal > 0) {
      context.globalAlpha = seal;
      context.drawImage(figure, 0, 0, W, H);
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
      const end = item.hover || item.t1;
      let x = item.cx;
      let y = item.cy;
      let u = 1;
      if (progress < end) {
        u = (progress - item.t0) / (end - item.t0);
        const e = smooth(u);
        // Swirl the last stretch round the seat, then home in.
        const angle = (1 - e) * item.spin;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = (item.ox - item.cx) * (1 - e);
        const dy = (item.oy - item.cy) * (1 - e);
        x = item.cx + dx * cos - dy * sin;
        y = item.cy + dx * sin + dy * cos;
        if (item.hover) y -= H * 0.055 * e;
      } else if (item.hover) {
        // The helmet hovers above the head, then clamps down.
        const clamp = easeOut(clamp01((progress - (B.clamp - 0.014)) / 0.014));
        y = item.cy - H * 0.055 * (1 - clamp);
      }
      const grow = 0.32 + 0.68 * easeOut(Math.min(1, u * 1.15));
      const w = item.tw * grow;
      const h = item.th * grow;
      const left = x - w / 2;
      const top = y - h / 2;
      if (u < 0.62) {
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
    for (let slot = 0; slot < 6; slot += 1) {
      fillRects(context, motes[slot], moteCounts[slot], TONE_CSS[slot % 3], slot < 3 ? 0.36 : 0.78);
    }
    context.globalAlpha = 1;
    for (let i = 0; i < arts; i += 1) {
      const item = tiles[art[i]];
      const o = i * 4;
      context.drawImage(
        figure,
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
    if (arts) {
      context.globalAlpha = 0.55;
      context.strokeStyle = TONE_CSS[0];
      context.lineWidth = 0.9;
      context.beginPath();
      for (let i = 0; i < arts * 4; i += 4)
        context.rect(artRects[i], artRects[i + 1], artRects[i + 2], artRects[i + 3]);
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
    fillRects(context, flashes[0], flashCounts[0], TONE_CSS[2], 0.62);
    fillRects(context, flashes[1], flashCounts[1], "rgb(190 244 255)", 0.36);
    fillRects(context, flashes[2], flashCounts[2], TONE_CSS[0], 0.18);

    // Each DEUS！: a ring from the group that has just landed.
    context.lineWidth = 3;
    for (let beat = 0; beat < 5; beat += 1) {
      const done = plan.partDone[beat];
      const u = (progress - done) / 0.045;
      if (!done || u < 0 || u >= 1) continue;
      const [cx, cy] = plan.centroids[beat];
      context.globalAlpha = (1 - u) * 0.8;
      context.strokeStyle = RING_TONES[beat % 3];
      context.beginPath();
      context.arc(cx, cy, 30 + 260 * easeOut(u), 0, Math.PI * 2);
      context.stroke();
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
    if (progress >= rings[0] && progress < rings[1]) {
      const glow = Math.sin(Math.PI * span(progress, rings));
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
        const from = rings[0] + ring * 0.025;
        const u = clamp01((progress - from) / 0.075);
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
  };

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
    if (behind) {
      lastProgress = -1;
      schedule();
    }
  };
  const schedule = () => {
    if (!frame && live && near && !document.hidden)
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
    }
  };

  const goLive = () => {
    if (disposed || live || !images || !motionAllowed()) return;
    if (!plan || !settled || !buffers) {
      build().then(goLive, () => {});
      return;
    }
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
    if (!live && !runway.dataset.rznState) return;
    live = false;
    listen(false);
    resizeObserver?.disconnect();
    delete runway.dataset.rznState;
    delete runway.dataset.rznLine;
    setFlag(runway, "data-rzn-complete", false);
    for (const { line, chips } of lines) {
      setFlag(line, "data-on", false);
      setFlag(line, "data-done", false);
      chips.forEach((chip) => setFlag(chip, "data-on", false));
    }
    parts.forEach((part) => setFlag(part, "data-on", false));
    Object.assign(hud, { line: -1, chips: "", parts: -1, percent: "", count: "", complete: null });
    if (percent) writeText(percent, restPercent);
    if (counter) writeText(counter, restCount);
    pendingSize = null;
    canvas.width = canvas.height = 0;
    if (settled) settled.width = settled.height = 0;
    settled = null;
    plan = null;
    buffers = null;
    view = null;
  };

  // Near the view with motion allowed: fetch the two pictures (the call's
  // warm-up has usually cached them), cut the tiles, go live.
  const wake = () => {
    if (disposed || live || !motionAllowed() || document.hidden) return;
    if (images) {
      goLive();
      return;
    }
    if (!runway.dataset.rznState) runway.dataset.rznState = "loading";
    load().then(goLive, () => {
      loading = null;
      if (!disposed && !live) delete runway.dataset.rznState;
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
          { rootMargin: "120% 0px 120% 0px" },
        )
      : null;

  const sync = () => {
    if (disposed) return;
    if (!motionAllowed()) {
      goStill();
      return;
    }
    if (document.hidden) {
      if (frame) environment.cancelAnimationFrame(frame);
      frame = 0;
      return;
    }
    if (near) wake();
    lastProgress = -1;
    schedule();
  };
  const onPageHide = () => {
    if (frame) environment.cancelAnimationFrame(frame);
    frame = 0;
  };
  const htmlObserver = new environment.MutationObserver(sync);
  htmlObserver.observe(html, { attributes: true, attributeFilter: ["data-world-effects"] });
  reduced.addEventListener?.("change", sync);
  forcedColors.addEventListener?.("change", sync);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", sync);
  nearObserver?.observe(runway);

  return () => {
    disposed = true;
    goStill();
    nearObserver?.disconnect();
    htmlObserver.disconnect();
    reduced.removeEventListener?.("change", sync);
    forcedColors.removeEventListener?.("change", sync);
    connection?.removeEventListener?.("change", sync);
    document.removeEventListener("visibilitychange", sync);
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", sync);
    images?.figure?.close?.();
    images?.undersuit?.close?.();
    images = null;
  };
}
