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
const SCENES = ".rxs-section-heading, .rxs-p14-overview, .rxs-system-grid, .rxs-footer";

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
