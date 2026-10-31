/**
 * KINETIC (rxk, 2026-10-21): the Rexonance page's chapter choreography.
 *
 * What the script runs, once each, as the reader reaches it:
 * - the English calls (the chapter kickers 01 to 05, the suit-up's
 *   eyebrow, the P14 plate's code, the specs' labels and the end card's
 *   call) are set letter by letter (or word by word, where letters would
 *   change the call's measure) and rise in a stagger;
 * - the chapter titles (01 to 05, the P14 line) and the last line arrive
 *   line by line through a mask (each line pushed up into view, the next a
 *   beat behind);
 * - nothing is set that would move: each node is measured before and after
 *   it is set, and one that changed is set more simply or left whole;
 * - the end card's links land in a cascade as its last line settles (one
 *   run with the line, so they never arrive before it);
 * - a reading rail at the right edge of wide screens shows which chapter
 *   holds the screen, its ticks set where each chapter really falls in the
 *   scroll (the rail's fill is the sheet's scroll timeline; this script only
 *   places the ticks and names the chapter; every width already has the
 *   shell's reading line under the local navigation).
 *
 * Rules (the page's, kept): content is complete and visible without this
 * script, without observers and without animation support — nothing is
 * hidden until this script arms it, and only what is still below the fold
 * is armed. Every run is one shot, transform and opacity only, 480–900 ms
 * per part, and stops when the tab hides. Reduced motion, economy rendering
 * and Save-Data leave the page at rest; a preference change mid-page settles
 * everything at once. No scrolling is read per frame and nothing scrolls
 * the page. Paired with src/styles-rexonance-motion-20261021.css.
 */

// Static, text-only nodes: React never rewrites them, so the wrappers stand,
// and no rule of the page reaches into them (a call with inline units of
// its own, such as the system plates' codes, is left whole).
const KICKERS = [
  ".rxs-section > .rxs-section-heading > p",
  ".rxs-assembly-heading > div > .rxs-assembly-eyebrow",
  ".rxs-p14-copy > small",
  ".rxs-specs > div > small",
  ".rxs-footer > div > p",
].join(", ");
const TITLES = [
  ".rxs-section > .rxs-section-heading > h2",
  ".rxs-assembly-heading > div > h2",
  ".rxs-p14-copy > h3",
  ".rxs-footer > div > h2",
].join(", ");
const END_TITLE = ".rxs-footer > div > h2";
const END_LINKS = ":scope > a";
const CHAPTERS = ["performance", "p14", "assembly", "stages", "system"];
const OUT = "cubic-bezier(.16,1,.3,1)";

const textOnly = (node) =>
  !node.dataset.rxkSplit &&
  !!node.textContent?.trim() &&
  [...node.childNodes].every((child) => child.nodeType === 3 /* TEXT */);

/** Sets a call in boxes that can move: by letter, or (where letters would
 * lose the face's kerning and change the call's measure) by word. A hidden
 * copy keeps the words whole for assistive technology; the boxed copy is
 * decoration. The wrappers are the script's own elements (rxk-*), so no
 * rule of the page's (a `span` or an `i` under a plate) reaches them. Each
 * box holds its word together, so the call wraps only where its words did
 * (boxes could otherwise break anywhere); a hyphen still lets it break. A
 * call painted through its text (the end card's gold) has its paint
 * carried down to every box, so a box in flight keeps it. */
function letterise(node, by) {
  const document = node.ownerDocument;
  const sr = document.createElement("rxk-sr");
  sr.className = "rxk-sr";
  sr.textContent = node.textContent;
  const word = document.createElement("rxk-word");
  word.className = "rxk-word";
  word.setAttribute("aria-hidden", "true");
  const boxes = [];
  const box = (text) => {
    const element = document.createElement("rxk-ch");
    element.className = "rxk-ch";
    element.textContent = text;
    boxes.push(element);
    return element;
  };
  let run = null;
  let pending = "";
  const close = () => {
    if (by === "words" && pending) run.appendChild(box(pending));
    pending = "";
    run = null;
  };
  for (const char of node.textContent) {
    if (/\s/.test(char)) {
      if (run) close();
      word.appendChild(document.createTextNode(char));
      continue;
    }
    if (!run) {
      run = document.createElement("rxk-run");
      run.className = "rxk-run";
      word.appendChild(run);
    }
    if (by === "words") pending += char;
    else run.appendChild(box(char));
    if (char === "-") close();
  }
  if (run) close();
  const style = document.defaultView?.getComputedStyle(node);
  if (style && (style.backgroundClip === "text" || style.webkitBackgroundClip === "text")) {
    node.dataset.rxkPaint = "text";
  }
  node.replaceChildren(sr, word);
  node.dataset.rxkSplit = by;
  return boxes;
}

/** Puts a node back as it was (its text, its attributes). */
function restore(node, text) {
  node.replaceChildren(node.ownerDocument.createTextNode(text));
  delete node.dataset.rxkSplit;
  delete node.dataset.rxkPaint;
}

/** Wraps a title's lines (split at <br>) so each can be masked. The <br>
 * stays in place (the sheet hides it while the lines are blocks). */
function lineise(node) {
  if (node.dataset.rxkSplit) return [];
  const document = node.ownerDocument;
  const runs = [[]];
  for (const child of [...node.childNodes]) {
    if (child.nodeName === "BR" || child.nodeName === "WBR") runs.push([]);
    else runs[runs.length - 1].push(child);
  }
  if (!runs.some((run) => run.some((child) => child.textContent?.trim()))) return [];
  const lines = [];
  for (const run of runs) {
    if (!run.length) continue;
    const line = document.createElement("rxk-line");
    line.className = "rxk-line";
    const inner = document.createElement("rxk-line-in");
    inner.className = "rxk-line-in";
    run[0].before(line);
    for (const child of run) inner.appendChild(child);
    line.appendChild(inner);
    lines.push(inner);
  }
  node.dataset.rxkSplit = "lines";
  return lines;
}

/** Takes a title's lines apart again, its nodes back in their places. */
function unlineise(node) {
  for (const line of [...node.children]) {
    if (line.localName === "rxk-line") line.replaceWith(...line.firstChild.childNodes);
  }
  delete node.dataset.rxkSplit;
}

/** A node's laid-out size (transforms aside: the split changes which scroll
 * animation a title runs, never its box). */
function sizeOf(node) {
  const style = node.ownerDocument.defaultView.getComputedStyle(node);
  const size = [parseFloat(style.width), parseFloat(style.height)];
  if (size.every(Number.isFinite)) return size;
  const box = node.getBoundingClientRect();
  return [box.width, box.height];
}

const sameSize = (a, b) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;

/** The run's end: the part that finishes last settles it. */
function lastOf(animations) {
  const end = (animation) => animation.effect?.getComputedTiming?.().endTime ?? 0;
  return animations.reduce((last, animation) => (end(animation) > end(last) ? animation : last));
}

export function mountRexonanceChoreography(page, environment = globalThis) {
  const media = environment.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!page || !environment.IntersectionObserver || !media || !page.animate) return () => {};
  const document = page.ownerDocument;
  const root = document.documentElement;
  if (media.matches || root.dataset.worldEffects === "economy") {
    return () => {};
  }

  /** Each node's running animations; a run holds its last frame (fill both)
   * until the node is settled, so the armed state never shows through, and
   * the settle cancels them in the same task, so nothing is held after. */
  const running = new Map();
  /** Nodes that come to rest with another's run (the end card with its line). */
  const companions = new Map();
  const cancelAll = () => {
    running.forEach((animations) => animations.forEach((animation) => animation.cancel()));
    running.clear();
  };

  // Only what is still below the fold is armed (hidden): what is already on
  // screen stays as drawn, so arming never blanks a visible word. Under the
  // route cover (html[data-loading]) nothing is seen yet, so the first
  // screen's chapter is armed too and plays as the cover lifts: the hand-over.
  const covered = () => root.hasAttribute("data-loading");
  const fold = (environment.innerHeight || 800) * 0.92;
  const belowFold = (node) => node.getBoundingClientRect().top > fold;

  /** @type {Map<Element, () => void>} */
  const plays = new Map();
  const arm = (node, play) => {
    if (!covered() && !belowFold(node)) return false;
    node.dataset.rxk = "armed";
    plays.set(node, play);
    return true;
  };
  const settle = (node) => {
    node.dataset.rxk = "done";
    running.get(node)?.forEach((animation) => animation.cancel());
    running.delete(node);
    companions.get(node)?.forEach((other) => {
      other.dataset.rxk = "done";
    });
  };
  /** Plays one run on a node: the part that ends last settles the node. */
  const run = (node, animations) => {
    if (!animations.length) return settle(node);
    running.set(node, animations);
    const done = () => {
      if (running.get(node) === animations) settle(node);
    };
    lastOf(animations).finished.then(done, done);
  };

  let disposed = false;
  const observer = new environment.IntersectionObserver(
    (entries) => {
      if (disposed) return;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target;
        const play = plays.get(node);
        if (!play) continue;
        plays.delete(node);
        observer.unobserve(node);
        if (media.matches || document.hidden) settle(node);
        else play();
      }
    },
    { rootMargin: "0px 0px -10%", threshold: 0.01 },
  );
  const callRun = (boxes, by) => {
    // Long calls step faster, so every call lands within about a second; a
    // call set by word steps at a word's pace.
    const step = Math.min(by === "words" ? 90 : 22, 600 / boxes.length);
    return boxes.map((box, index) =>
      box.animate(
        [
          { opacity: 0, transform: "translate3d(0, 0.7em, 0)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 520, delay: Math.round(index * step), easing: OUT, fill: "both" },
      ),
    );
  };
  const lineRun = (lines) =>
    lines.map((line, index) =>
      line.animate(
        [
          { transform: "translate3d(0, 118%, 0) skewY(3deg)" },
          { transform: "translate3d(0, 0, 0) skewY(0deg)" },
        ],
        { duration: 820, delay: 90 + index * 130, easing: OUT, fill: "both" },
      ),
    );

  /** Sets the calls and titles in their boxes and holds each to its
   * measure: a call whose box moves by any amount (a letter box drops the
   * face's kerning, and a call on the edge of its measure can wrap) is set
   * by word instead, and if that moves it too it is left whole, as is a
   * title. Three batched layout reads, once. */
  const split = () => {
    const calls = [...page.querySelectorAll(KICKERS)]
      .filter(textOnly)
      .map((node) => ({ node, text: node.textContent || "", size: [0, 0], boxes: [] }));
    const titles = [...page.querySelectorAll(TITLES)]
      .filter((node) => !node.dataset.rxkSplit)
      .map((node) => ({ node, size: [0, 0], lines: [] }));
    for (const entry of [...calls, ...titles]) entry.size = sizeOf(entry.node);
    for (const call of calls) call.boxes = letterise(call.node, "letters");
    for (const title of titles) title.lines = lineise(title.node);
    const movedCalls = calls.filter((call) => !sameSize(call.size, sizeOf(call.node)));
    const movedTitles = titles.filter((title) => !sameSize(title.size, sizeOf(title.node)));
    for (const title of movedTitles) {
      unlineise(title.node);
      title.lines = [];
    }
    for (const call of movedCalls) {
      restore(call.node, call.text);
      call.boxes = letterise(call.node, "words");
    }
    for (const call of movedCalls.filter((entry) => !sameSize(entry.size, sizeOf(entry.node)))) {
      restore(call.node, call.text);
      call.boxes = [];
    }
    return { calls, titles };
  };

  const prepare = () => {
    if (disposed) return;
    const { calls, titles } = split();
    for (const { node, boxes } of calls) {
      const by = node.dataset.rxkSplit;
      if (boxes.length) arm(node, () => run(node, callRun(boxes, by)));
    }
    for (const { node: title, lines } of titles) {
      if (!lines.length) continue;
      if (!title.matches(END_TITLE)) {
        arm(title, () => run(title, lineRun(lines)));
        continue;
      }
      // The end card: its links rise in order (the return last) as the last
      // line lands, in the same run, so they never arrive before it.
      const footer = title.closest(".rxs-footer");
      const links = footer ? [...footer.querySelectorAll(END_LINKS)] : [];
      const linkRun = (offset) =>
        links.map((link, index) =>
          link.animate(
            [
              { opacity: 0, transform: "translate3d(0, 26px, 0)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 640, delay: offset + index * 110, easing: OUT, fill: "both" },
          ),
        );
      const armed = arm(title, () => run(title, [...lineRun(lines), ...linkRun(520)]));
      if (armed && footer && links.length) {
        footer.dataset.rxk = "armed";
        companions.set(title, [footer]);
      } else if (footer && links.length) {
        // The line already stands; the links alone cascade as they come in.
        arm(footer, () => run(footer, linkRun(0)));
      }
    }
    if (covered()) {
      // Observe once the cover lifts: what stands on the first screen then
      // plays at once, a beat into the hero's arrival.
      coverObserver = new environment.MutationObserver(() => {
        if (covered() || disposed) return;
        coverObserver?.disconnect();
        coverObserver = null;
        environment.setTimeout(watchAll, 420);
      });
      coverObserver.observe(root, { attributes: true, attributeFilter: ["data-loading"] });
    } else watchAll();
  };

  const watchAll = () => plays.forEach((_, node) => observer.observe(node));
  /** @type {MutationObserver | null} */
  let coverObserver = null;
  // The measures hold only in the page's own faces: set the boxes once they
  // have loaded (at once, when they already have).
  const fonts = document.fonts;
  if (!fonts || fonts.status === "loaded") prepare();
  else fonts.ready.then(prepare, prepare);

  // The reading rail: built at every width, so a turned tablet finds it;
  // the sheet shows it on wide screens only and fills it on the scroll.
  const rail = document.createElement("aside");
  rail.className = "rxk-rail";
  rail.setAttribute("aria-hidden", "true");
  rail.innerHTML =
    '<i class="rxk-rail-track"><b class="rxk-rail-fill"></b></i>' +
    CHAPTERS.map(
      (id, index) => `<span class="rxk-rail-tick" data-chapter="${id}"><b>0${index + 1}</b></span>`,
    ).join("");
  page.appendChild(rail);
  const ticks = [...rail.querySelectorAll(".rxk-rail-tick")];

  // Each tick stands where its chapter takes the middle of the screen (where
  // it is lit), as a share of the whole scroll: the fill reaches the tick
  // as the chapter is named. Measured once the chapters stand and again
  // when the page changes size; never per frame.
  const place = () => {
    if (disposed || root.matches("[data-side-menu-open], [data-dialog-open]")) return;
    const view = environment.innerHeight || 800;
    const max = root.scrollHeight - view;
    if (max <= 0) return;
    const scrolled = environment.scrollY || 0;
    for (const tick of ticks) {
      const section = document.getElementById(tick.dataset.chapter || "");
      if (!section) continue;
      const share = (section.getBoundingClientRect().top + scrolled - view * 0.5) / max;
      tick.style.setProperty("--rxk-at", `${(Math.min(1, Math.max(0, share)) * 100).toFixed(2)}%`);
    }
  };
  let placeTimer = 0;
  const placeSoon = () => {
    environment.clearTimeout?.(placeTimer);
    placeTimer = environment.setTimeout?.(place, 240) ?? 0;
  };
  const resize = environment.ResizeObserver ? new environment.ResizeObserver(placeSoon) : null;
  resize?.observe(page);
  environment.addEventListener?.("resize", placeSoon);

  const seen = new Map();
  const chapterObserver = new environment.IntersectionObserver(
    (entries) => {
      for (const entry of entries) seen.set(entry.target.id, entry.isIntersecting);
      const current = CHAPTERS.filter((id) => seen.get(id)).pop();
      if (current) page.dataset.rxkChapter = current;
      else if (!CHAPTERS.some((id) => seen.get(id))) delete page.dataset.rxkChapter;
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
  );
  const watchChapters = () => {
    for (const id of CHAPTERS) {
      const section = document.getElementById(id);
      if (section && !seen.has(id)) {
        seen.set(id, false);
        chapterObserver.observe(section);
      }
    }
    placeSoon();
  };
  watchChapters();
  // Later chapters render in an idle slot after the hand-over.
  const later = environment.setTimeout?.(watchChapters, 1500);

  // What is mid-flight and what still waits both come to rest, drawn.
  const settleRunning = () => [...running.keys()].forEach((node) => settle(node));
  const settleAll = () => {
    settleRunning();
    cancelAll();
    plays.forEach((_, node) => settle(node));
    plays.clear();
    observer.disconnect();
  };
  const syncPreference = () => {
    if (media.matches || root.dataset.worldEffects === "economy") settleAll();
  };
  const syncVisibility = () => {
    // A hidden tab stops its clocks; what was mid-flight is shown at rest.
    if (document.hidden) settleRunning();
  };
  const effects = new environment.MutationObserver(syncPreference);
  effects.observe(root, { attributes: true, attributeFilter: ["data-world-effects"] });
  media.addEventListener?.("change", syncPreference);
  document.addEventListener("visibilitychange", syncVisibility);

  return () => {
    disposed = true;
    settleAll();
    coverObserver?.disconnect();
    effects.disconnect();
    chapterObserver.disconnect();
    resize?.disconnect();
    environment.removeEventListener?.("resize", placeSoon);
    environment.clearTimeout?.(later);
    environment.clearTimeout?.(placeTimer);
    rail.remove();
    delete page.dataset.rxkChapter;
    media.removeEventListener?.("change", syncPreference);
    document.removeEventListener("visibilitychange", syncVisibility);
  };
}
