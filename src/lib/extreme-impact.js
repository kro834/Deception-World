/* IMPACT (rx11): the Extreme page's time-keyed hits, driven for
   src/styles-extreme-impact.css.

   Every time-based beat on the page plays from a one-shot key: an
   attribute this engine sets to "true" at its moment and retires to "done"
   once the beat is over, so a rule that stands down under the side menu,
   a dialog or a loading cover never replays when the page comes back.

   - Hits: an element carrying data-exi-hit="" is keyed the first time it
     crosses the trigger line (80% of the viewport, or 55% for
     data-exi-line="mid"). IntersectionObservers only, no scroll listener.
     While the engine runs the page carries data-exi-armed="true", so the
     sheet holds an unreached arrival back only while something will
     release it; without the engine everything simply stands drawn.
   - Tallies: a decorative copy (aria-hidden, [data-exi-tally]) counts its
     figure up from zero when the nearest hit around it lands, on
     requestAnimationFrame for about a second, braking hard into the value.
     Its accessible twin keeps the owner's value at all times; the sheet
     hides that twin only while the figure carries data-exi-counting, then
     the figure lands (data-exi-landed). A container marked data-exi-rekey
     (the comparator) replays the tallies of rows React re-keys into it.
   - The change of form: a figure the stage panel mounts after a reader's
     change (data-exo-cut) takes the impact key, and the rail pops the
     chosen tab whenever its data-stage changes. The component's timing
     (STAGE_CUT_GAP_MS) is untouched: this only listens.
   - The arrival: the first time the page is shown with motion, its hero
     takes data-exi-arrival with the load gate's hand-over.
   - Warm art: the forms' artworks listed in the panel's data-exi-warm are
     fetched and decoded once the stage comes within a screen and a half,
     so a change of form cuts to art that is there (not under Save-Data or
     on 2g, and whatever the motion settings: the art is the content).
   - Tilt: on a fine pointer the hero's figure and its [data-exi-depth]
     layers follow the pointer (an inline transform), eased, idle once
     settled and only while the hero is on screen.

   Everything follows reduced motion, economy rendering, Save-Data / 2g,
   the load gate, the pointer type, page visibility and the bfcache, and is
   released symmetrically on unmount. */

const LINES = { base: "0px 0px -20% 0px", mid: "0px 0px -45% 0px" };
// Scenes keyed by the engine itself (their opening tags stay as they are).
const SCENES = ":scope > :is(.rxs-section, .rxs-footer), :scope .rxs-specs";
const TALLY_MS = 1100;
// A counter reads as rolling at thirty draws a second; half the frames' text work.
const TALLY_STEP_MS = 32;
const TILT_EASE = 0.14;
// Each key outlives the latest beat it starts (every beat ends by 2 s).
export const BEATS = { hit: 2100, landed: 800, impact: 1000, pop: 500, arrival: 2200 };

/** Parse "20,000%", "205.6" or "0.21" into the parts a tally redraws. */
export function parseTally(text) {
  const match = /^(\D*)([\d,]*\d(?:\.\d+)?)(.*)$/.exec(String(text));
  if (!match) return null;
  const [, prefix, number, suffix] = match;
  const [whole, fraction = ""] = number.split(".");
  const digits = whole.replace(/,/g, "");
  const value = Number(`${digits}.${fraction || 0}`);
  if (!Number.isFinite(value)) return null;
  // The thousands marks sit at these distances from the end of the whole part.
  const marks = [];
  for (let index = whole.length - 1, distance = 0; index >= 0; index -= 1) {
    if (whole[index] === ",") marks.push(distance);
    else distance += 1;
  }
  return { prefix, suffix, value, decimals: fraction.length, width: digits.length, marks };
}

/** Draw a value in the figure's own shape: zero-padded, grouped, same decimals. */
export function formatTally(parts, value) {
  const fixed = Math.max(0, Math.min(parts.value, value)).toFixed(parts.decimals);
  const [whole, fraction] = fixed.split(".");
  const padded = whole.padStart(parts.width, "0");
  let grouped = "";
  for (let index = padded.length - 1, distance = 0; index >= 0; index -= 1, distance += 1) {
    if (distance > 0 && parts.marks.includes(distance)) grouped = `,${grouped}`;
    grouped = padded[index] + grouped;
  }
  return `${parts.prefix}${grouped}${fraction === undefined ? "" : `.${fraction}`}${parts.suffix}`;
}

export function mountExtremeImpact(page, environment = window) {
  if (!page) return () => {};
  const document = page.ownerDocument;
  const html = document.documentElement;
  const connection = environment.navigator?.connection;
  const reducedMotion = environment.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = environment.matchMedia("(hover: hover) and (pointer: fine)");
  const hero = page.querySelector(".exs-hero");
  const panel = page.querySelector("#exs-stage-panel");
  const rail = page.querySelector(".exs-stage-tabs");
  const layers = hero
    ? [
        ...[...hero.querySelectorAll(".rxs-hero-visual")].map((element) => ({
          element,
          depth: 0.45,
          turn: 5,
        })),
        ...[...hero.querySelectorAll("[data-exi-depth]")].map((element) => ({
          element,
          depth: Number(element.getAttribute("data-exi-depth")) || 0,
          turn: 0,
        })),
      ]
    : [];
  const previousTransforms = layers.map(({ element }) => [
    element.style.getPropertyValue("transform"),
    element.style.getPropertyPriority("transform"),
  ]);
  const scenes = [...page.querySelectorAll(SCENES)].filter(
    (element) => !element.hasAttribute("data-exi-hit"),
  );
  scenes.forEach((element) => element.setAttribute("data-exi-hit", ""));

  let allowed;
  let running = false;
  let arrived = false;
  let disposed = false;
  let observers = [];
  let watchers = [];
  let heroObserver = null;
  let warmObserver = null;
  const warmed = [];
  let heroVisible = false;
  let pointerBound = false;
  const timers = new Map();
  const tallies = new Map();
  const waiting = new Set();
  let tallyFrame = 0;
  let tiltFrame = 0;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

  const now = () => environment.performance?.now?.() ?? Date.now();

  /* ---------- One-shot keys ---------- */
  // A key reads "true" for its beat, then "done": the rest state.
  const retire = (element, name) => {
    for (const [id, entry] of timers)
      if (entry.element === element && entry.name === name) {
        environment.clearTimeout(id);
        timers.delete(id);
      }
    if (element.getAttribute(name) === "true") element.setAttribute(name, "done");
  };
  const key = (element, name, ms) => {
    retire(element, name);
    element.setAttribute(name, "true");
    const id = environment.setTimeout(() => {
      timers.delete(id);
      if (element.getAttribute(name) === "true") element.setAttribute(name, "done");
    }, ms);
    timers.set(id, { element, name });
  };
  const retireAll = () => {
    for (const [id, { element, name }] of timers) {
      environment.clearTimeout(id);
      if (element.getAttribute(name) === "true") element.setAttribute(name, "done");
    }
    timers.clear();
  };

  /* ---------- Tallies ---------- */
  // A figure not yet reached shows its tally at zero (data-exi-waiting), so
  // the count starts from the zero the reader already sees, never from the
  // final figure jumping back.
  const unwait = (figure) => {
    if (!waiting.delete(figure)) return false;
    figure.removeAttribute("data-exi-waiting");
    return true;
  };
  const wait = (tally) => {
    const figure = tally.parentElement;
    if (!figure || tallies.has(figure) || waiting.has(figure)) return;
    if (figure.hasAttribute("data-exi-landed")) return;
    const parts = parseTally(tally.getAttribute("data-exi-tally"));
    if (!parts) return;
    tally.textContent = formatTally(parts, 0);
    figure.setAttribute("data-exi-waiting", "true");
    waiting.add(figure);
  };
  const releaseWaiting = () => {
    for (const figure of [...waiting]) {
      unwait(figure);
      const copy = figure.querySelector("[data-exi-tally]");
      if (copy) copy.textContent = "";
    }
  };
  const finishTally = (figure, landed) => {
    const run = tallies.get(figure);
    if (!run) return;
    tallies.delete(figure);
    run.tally.textContent = "";
    figure.removeAttribute("data-exi-counting");
    if (landed) key(figure, "data-exi-landed", BEATS.landed);
    else figure.setAttribute("data-exi-landed", "done");
  };
  const stepTallies = () => {
    tallyFrame = 0;
    if (disposed || document.hidden) return;
    const time = now();
    for (const [figure, run] of tallies) {
      const progress = Math.min(1, (time - run.start) / TALLY_MS);
      if (progress >= 1) {
        finishTally(figure, true);
        continue;
      }
      if (time - run.drawn < TALLY_STEP_MS) continue;
      // Fast off the line, braking hard into the value. The copy keeps one
      // text node and only its characters change (no node is inserted).
      const text = formatTally(run.parts, run.parts.value * (1 - (1 - progress) ** 4));
      if (text !== run.text) {
        run.text = text;
        run.drawn = time;
        if (run.node) run.node.data = text;
        else run.tally.textContent = text;
      }
    }
    if (tallies.size) tallyFrame = environment.requestAnimationFrame(stepTallies);
  };
  const startTally = (tally) => {
    const figure = tally.parentElement;
    if (!figure || tallies.has(figure) || figure.hasAttribute("data-exi-landed")) return;
    const parts = parseTally(tally.getAttribute("data-exi-tally"));
    if (!parts) return;
    const text = formatTally(parts, 0);
    tally.textContent = text;
    figure.setAttribute("data-exi-counting", "true");
    unwait(figure);
    const time = now();
    tallies.set(figure, { tally, parts, text, node: tally.firstChild, start: time, drawn: time });
    if (!tallyFrame) tallyFrame = environment.requestAnimationFrame(stepTallies);
  };
  const stopTallies = () => {
    if (tallyFrame) environment.cancelAnimationFrame(tallyFrame);
    tallyFrame = 0;
    for (const figure of [...tallies.keys()]) finishTally(figure, false);
  };
  const talliesIn = (root) => [
    ...(root.matches?.("[data-exi-tally]") ? [root] : []),
    ...root.querySelectorAll("[data-exi-tally]"),
  ];
  // A tally answers to the nearest hit around it, not to every outer one.
  const scopeOf = (tally) => tally.parentElement?.closest("[data-exi-hit]") ?? null;

  /* ---------- Hits ---------- */
  const land = (element) => {
    key(element, "data-exi-hit", BEATS.hit);
    talliesIn(element)
      .filter((tally) => scopeOf(tally) === element)
      .forEach(startTally);
  };
  const onIntersect = (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      if (running) land(entry.target);
    }
  };
  const onRekey = (records) => {
    if (!running) return;
    for (const record of records)
      for (const node of record.addedNodes)
        if (node.nodeType === 1)
          for (const tally of talliesIn(node)) {
            if ((scopeOf(tally)?.getAttribute("data-exi-hit") ?? "true") === "") wait(tally);
            else startTally(tally);
          }
  };
  const onFigure = (records) => {
    if (!running || panel.getAttribute("data-exo-cut") !== "true") return;
    for (const record of records)
      for (const node of record.addedNodes)
        if (node.nodeType === 1 && node.matches("figure"))
          key(node, "data-exi-impact", BEATS.impact);
  };
  const onStage = () => {
    if (running) key(rail, "data-exi-pop", BEATS.pop);
  };
  const observe = () => {
    if (observers.length || !environment.IntersectionObserver) return;
    const byLine = { base: [], mid: [] };
    for (const element of page.querySelectorAll('[data-exi-hit=""]'))
      byLine[element.getAttribute("data-exi-line") === "mid" ? "mid" : "base"].push(element);
    for (const [line, elements] of Object.entries(byLine)) {
      if (!elements.length) continue;
      const observer = new environment.IntersectionObserver(onIntersect, {
        rootMargin: LINES[line],
        threshold: 0,
      });
      elements.forEach((element) => observer.observe(element));
      observers.push(observer);
      for (const element of elements)
        talliesIn(element)
          .filter((tally) => scopeOf(tally) === element)
          .forEach(wait);
    }
    const Watcher = environment.MutationObserver;
    for (const container of page.querySelectorAll("[data-exi-rekey]")) {
      const watcher = new Watcher(onRekey);
      watcher.observe(container, { childList: true });
      watchers.push(watcher);
    }
    if (panel) {
      const watcher = new Watcher(onFigure);
      watcher.observe(panel, { childList: true });
      watchers.push(watcher);
    }
    if (rail) {
      const watcher = new Watcher(onStage);
      watcher.observe(rail, { attributes: true, attributeFilter: ["data-stage"] });
      watchers.push(watcher);
    }
  };
  const unobserve = () => {
    observers.forEach((observer) => observer.disconnect());
    observers = [];
    watchers.forEach((watcher) => watcher.disconnect());
    watchers = [];
  };

  /* ---------- Tilt ---------- */
  const writeTilt = () => {
    for (const { element, depth, turn } of layers) {
      const x = (tilt.x * depth * 26).toFixed(2);
      const y = (tilt.y * depth * 16).toFixed(2);
      element.style.setProperty(
        "transform",
        turn
          ? `perspective(1400px) translate3d(${x}px, ${y}px, 0) rotateY(${(tilt.x * turn).toFixed(2)}deg) rotateX(${(-tilt.y * turn * 0.7).toFixed(2)}deg)`
          : `translate3d(${x}px, ${y}px, 0)`,
      );
    }
  };
  const stepTilt = () => {
    tiltFrame = 0;
    if (disposed || document.hidden) return;
    tilt.x += (tilt.tx - tilt.x) * TILT_EASE;
    tilt.y += (tilt.ty - tilt.y) * TILT_EASE;
    const settled = Math.abs(tilt.tx - tilt.x) < 0.002 && Math.abs(tilt.ty - tilt.y) < 0.002;
    if (settled) {
      tilt.x = tilt.tx;
      tilt.y = tilt.ty;
    }
    writeTilt();
    if (!settled) tiltFrame = environment.requestAnimationFrame(stepTilt);
  };
  const queueTilt = () => {
    if (!tiltFrame && !disposed && !document.hidden)
      tiltFrame = environment.requestAnimationFrame(stepTilt);
  };
  const onPointerMove = (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const width = environment.innerWidth || 1;
    const height = environment.innerHeight || 1;
    tilt.tx = Math.max(-1, Math.min(1, (event.clientX / width) * 2 - 1));
    tilt.ty = Math.max(-1, Math.min(1, (event.clientY / height) * 2 - 1));
    queueTilt();
  };
  const onPointerLeave = () => {
    tilt.tx = 0;
    tilt.ty = 0;
    queueTilt();
  };
  const restTilt = () => {
    if (tiltFrame) environment.cancelAnimationFrame(tiltFrame);
    tiltFrame = 0;
    tilt.x = tilt.y = tilt.tx = tilt.ty = 0;
    layers.forEach(({ element }, index) => {
      const [value, priority] = previousTransforms[index];
      if (value) element.style.setProperty("transform", value, priority);
      else element.style.removeProperty("transform");
    });
  };
  const syncPointer = () => {
    const live = running && finePointer.matches && heroVisible;
    if (live && !pointerBound) {
      pointerBound = true;
      hero.addEventListener("pointermove", onPointerMove, { passive: true });
      hero.addEventListener("pointerleave", onPointerLeave, { passive: true });
    } else if (!live && pointerBound) {
      pointerBound = false;
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      restTilt();
    }
  };
  const watchHero = () => {
    if (heroObserver || !hero || !layers.length || !environment.IntersectionObserver) return;
    heroObserver = new environment.IntersectionObserver((entries) => {
      heroVisible = Boolean(entries[entries.length - 1]?.isIntersecting);
      syncPointer();
    });
    heroObserver.observe(hero);
  };
  const unwatchHero = () => {
    heroObserver?.disconnect();
    heroObserver = null;
    heroVisible = false;
  };

  /* ---------- Warm art ---------- */
  const warm = () => {
    if (warmObserver || !panel || !environment.IntersectionObserver || !environment.Image) return;
    const sources = (panel.getAttribute("data-exi-warm") || "").split(/\s+/).filter(Boolean);
    if (!sources.length) return;
    warmObserver = new environment.IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        warmObserver?.disconnect();
        for (const source of sources) {
          const image = new environment.Image();
          image.decoding = "async";
          image.src = source;
          image.decode?.().catch(() => {});
          warmed.push(image);
        }
      },
      { rootMargin: "150% 0px 150% 0px" },
    );
    warmObserver.observe(panel);
  };

  /* ---------- Gates ---------- */
  const stop = () => {
    running = false;
    stopTallies();
    releaseWaiting();
    retireAll();
    unobserve();
    unwatchHero();
    syncPointer();
    restTilt();
  };
  const sync = () => {
    if (disposed) return;
    const constrained =
      connection?.saveData || /^(slow-)?2g$/.test(connection?.effectiveType || "");
    if (!constrained && !warmed.length) warm();
    const next = !reducedMotion.matches && !constrained && html.dataset.worldEffects !== "economy";
    if (next !== allowed) {
      allowed = next;
      if (allowed) page.setAttribute("data-exi-armed", "true");
      else page.removeAttribute("data-exi-armed");
    }
    // Nothing is keyed behind the load gate's cover or in a hidden tab.
    if (!allowed || document.hidden || html.hasAttribute("data-loading")) {
      if (running || observers.length || tallies.size || timers.size) stop();
      return;
    }
    running = true;
    if (!arrived) {
      arrived = true;
      if (hero && (environment.scrollY || 0) < (environment.innerHeight || 0))
        key(page, "data-exi-arrival", BEATS.arrival);
    }
    observe();
    watchHero();
    syncPointer();
  };
  const onPageHide = () => {
    if (!disposed) stop();
  };

  const attributes = new environment.MutationObserver(sync);
  attributes.observe(html, {
    attributes: true,
    attributeFilter: ["data-world-effects", "data-loading"],
  });
  reducedMotion.addEventListener?.("change", sync);
  finePointer.addEventListener?.("change", sync);
  connection?.addEventListener?.("change", sync);
  document.addEventListener("visibilitychange", sync);
  environment.addEventListener("pagehide", onPageHide);
  environment.addEventListener("pageshow", sync);
  sync();

  return () => {
    if (disposed) return;
    disposed = true;
    attributes.disconnect();
    reducedMotion.removeEventListener?.("change", sync);
    finePointer.removeEventListener?.("change", sync);
    connection?.removeEventListener?.("change", sync);
    document.removeEventListener("visibilitychange", sync);
    environment.removeEventListener("pagehide", onPageHide);
    environment.removeEventListener("pageshow", sync);
    warmObserver?.disconnect();
    warmObserver = null;
    stop();
    page.removeAttribute("data-exi-armed");
    scenes.forEach((element) => element.removeAttribute("data-exi-hit"));
  };
}
