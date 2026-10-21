/**
 * KINETIC (rxk, 2026-10-21): the Rexonance page's chapter choreography.
 *
 * What the script runs, once each, as the reader reaches it:
 * - the English calls (the chapter kickers and the end card's) are set
 *   letter by letter and rise in a stagger;
 * - the chapter titles and the last line arrive line by line through a
 *   mask (each line pushed up into view, the next a beat behind);
 * - groups (the end card's links) cascade in;
 * - a reading rail at the right edge of wide screens shows which chapter
 *   holds the screen (the rail's fill is the sheet's scroll timeline; this
 *   script only names the chapter).
 *
 * Rules (the page's, kept): content is complete and visible without this
 * script, without observers and without animation support — nothing is
 * hidden until this script arms it, and only what is still below the fold
 * is armed. Every run is one shot, transform and opacity only, 480–900 ms,
 * and stops when the tab hides. Reduced motion, economy rendering and
 * Save-Data leave the page at rest; a preference change mid-page settles
 * everything at once. No scrolling is read per frame and nothing scrolls
 * the page. Paired with src/styles-rexonance-motion-20261021.css.
 */

// Static text only: React never rewrites these nodes, so the wrappers stand.
const KICKERS =
  ".rxs-section > .rxs-section-heading > p, .rxs-p14-copy > small, .rxs-footer > div > p";
const TITLES =
  ".rxs-section > .rxs-section-heading > h2, .rxs-p14-copy > h3, .rxs-footer > div > h2";
const GROUPS = ".rxs-footer";
const CHAPTERS = ["performance", "p14", "assembly", "stages", "system"];
const OUT = "cubic-bezier(.16,1,.3,1)";

function constrained(environment) {
  const connection = environment.navigator?.connection;
  return (
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g"
  );
}

/** Wraps a kicker's letters: a hidden copy keeps the words whole for
 * assistive technology; the lettered copy is decoration. */
function letterise(node) {
  if (node.dataset.rxkSplit || !node.textContent?.trim()) return [];
  const sr = node.ownerDocument.createElement("span");
  sr.className = "rxk-sr";
  sr.textContent = node.textContent;
  const word = node.ownerDocument.createElement("span");
  word.className = "rxk-word";
  word.setAttribute("aria-hidden", "true");
  while (node.firstChild) word.appendChild(node.firstChild);
  const walker = node.ownerDocument.createTreeWalker(word, 4 /* SHOW_TEXT */);
  const texts = [];
  for (let text = walker.nextNode(); text; text = walker.nextNode()) texts.push(text);
  const letters = [];
  for (const text of texts) {
    const fragment = node.ownerDocument.createDocumentFragment();
    for (const char of text.data) {
      if (/\s/.test(char)) {
        fragment.appendChild(node.ownerDocument.createTextNode(char));
        continue;
      }
      const letter = node.ownerDocument.createElement("i");
      letter.className = "rxk-ch";
      letter.textContent = char;
      fragment.appendChild(letter);
      letters.push(letter);
    }
    text.replaceWith(fragment);
  }
  node.append(sr, word);
  node.dataset.rxkSplit = "letters";
  return letters;
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
    const line = document.createElement("span");
    line.className = "rxk-line";
    const inner = document.createElement("span");
    inner.className = "rxk-line-in";
    run[0].before(line);
    for (const child of run) inner.appendChild(child);
    line.appendChild(inner);
    lines.push(inner);
  }
  node.dataset.rxkSplit = "lines";
  return lines;
}

export function mountRexonanceChoreography(page, environment = globalThis) {
  const media = environment.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!page || !environment.IntersectionObserver || !media || !page.animate) return () => {};
  const document = page.ownerDocument;
  const root = document.documentElement;
  if (media.matches || root.dataset.worldEffects === "economy" || constrained(environment)) {
    return () => {};
  }

  /** Each node's running animations; a run holds its last frame (fill both)
   * until the node is settled, so the armed state never shows through, and
   * the settle cancels them in the same task, so nothing is held after. */
  const running = new Map();
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
    if (!covered() && !belowFold(node)) return;
    node.dataset.rxk = "armed";
    plays.set(node, play);
  };
  const settle = (node) => {
    node.dataset.rxk = "done";
    running.get(node)?.forEach((animation) => animation.cancel());
    running.delete(node);
  };
  /** Plays one run on a node: its last animation's end settles the node. */
  const run = (node, animations) => {
    if (!animations.length) return settle(node);
    running.set(node, animations);
    const done = () => {
      if (running.get(node) === animations) settle(node);
    };
    animations[animations.length - 1].finished.then(done, done);
  };

  for (const kicker of page.querySelectorAll(KICKERS)) {
    const letters = letterise(kicker);
    if (!letters.length) continue;
    arm(kicker, () =>
      run(
        kicker,
        letters.map((letter, index) =>
          letter.animate(
            [
              { opacity: 0, transform: "translate3d(0, 0.7em, 0)" },
              { opacity: 1, transform: "none" },
            ],
            { duration: 520, delay: Math.min(index, 34) * 22, easing: OUT, fill: "both" },
          ),
        ),
      ),
    );
  }

  for (const title of page.querySelectorAll(TITLES)) {
    const lines = lineise(title);
    if (!lines.length) continue;
    arm(title, () =>
      run(
        title,
        lines.map((line, index) =>
          line.animate(
            [
              { transform: "translate3d(0, 118%, 0) skewY(3deg)" },
              { transform: "translate3d(0, 0, 0) skewY(0deg)" },
            ],
            { duration: 820, delay: 90 + index * 130, easing: OUT, fill: "both" },
          ),
        ),
      ),
    );
  }

  for (const group of page.querySelectorAll(GROUPS)) {
    arm(group, () => {
      group.dataset.rxk = "in";
    });
  }

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
  const watchAll = () => plays.forEach((_, node) => observer.observe(node));
  let coverObserver = null;
  if (covered()) {
    // Observe once the cover lifts: what stands on the first screen then
    // plays at once, a beat into the hero's arrival.
    coverObserver = new environment.MutationObserver(() => {
      if (covered() || disposed) return;
      coverObserver.disconnect();
      coverObserver = null;
      environment.setTimeout(watchAll, 420);
    });
    coverObserver.observe(root, { attributes: true, attributeFilter: ["data-loading"] });
  } else watchAll();

  // The reading rail (wide screens only; the sheet places and fills it).
  let rail = null;
  let chapterObserver = null;
  const wide = environment.matchMedia?.("(min-width: 1100px)");
  if (wide?.matches) {
    rail = document.createElement("aside");
    rail.className = "rxk-rail";
    rail.setAttribute("aria-hidden", "true");
    rail.innerHTML =
      '<i class="rxk-rail-track"><b class="rxk-rail-fill"></b></i>' +
      CHAPTERS.map(
        (id, index) =>
          `<span class="rxk-rail-tick" data-chapter="${id}"><b>0${index + 1}</b></span>`,
      ).join("");
    page.appendChild(rail);
    const seen = new Map();
    chapterObserver = new environment.IntersectionObserver(
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
    };
    watchChapters();
    // Later chapters render in an idle slot after the hand-over.
    const later = environment.setTimeout?.(watchChapters, 1500);
    rail._rxkTimer = later;
  }

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
    chapterObserver?.disconnect();
    if (rail) {
      environment.clearTimeout?.(rail._rxkTimer);
      rail.remove();
    }
    delete page.dataset.rxkChapter;
    media.removeEventListener?.("change", syncPreference);
    document.removeEventListener("visibilitychange", syncVisibility);
  };
}
