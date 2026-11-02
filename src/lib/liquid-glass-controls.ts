// Liquid glass on the selection controls (owner, 2026-10-31:
// 「リキッドグラスを横スライダーなど様々なところに波及させて」). The script half
// of src/styles-liquid-glass-controls.css, started by liquid-glass-defs.tsx
// only while html[data-button-style="liquid"] is set, and undone completely
// when the option goes off (every attribute and property it wrote is removed).
//
// - Segments: a group of options (tabs, chips, speeds) whose selected one is
//   marked by aria-pressed/-checked/-selected, aria-current or .is-active. A
//   glass pill (the group's free ::before or ::after, so no node is added to
//   a React tree) sits under the selected option and glides to the next one
//   with a gel stretch. Thumbnail and card groups get a glass bezel instead.
// - Rails: a horizontal scroller. Its current item gets the bezel; its host
//   (the parent, through its two pseudo-elements) draws glass edge caps and
//   a glass scroll indicator driven by a scroll timeline.
//
// Budgets: geometry is read only when a selection changes, a box resizes or
// a group is first seen, never per frame; the motion is translate and scale
// on the pseudo-elements; the rail edges are tracked by IntersectionObserver
// and the indicator by the compositor (animation-timeline), not by scroll
// handlers. Reads and writes are batched (owner, 2026-11-02: on /world the
// long press started late in the first seconds after load): a frame's
// groups and rails are read together, then written together, so the page
// pays one style and layout pass for them all, not one per group (each
// write before the next group's read forced a whole-page style pass, about
// 2.5 s of /world's first seconds on a throttled phone-class CPU).

/** Option groups whose selection becomes a sliding glass pill. */
export const GLASS_SEGMENTS = [
  ".rzn-movie-speeds",
  ".side-panel-links fieldset",
  ".chapter-switch",
  ".gallery-filters",
  ".ics-compare-pick",
  ".mus-compare-pick",
  ".exs-opponent-options",
  ".rxs-p14-range-labels",
  ".dogs-archive-selector",
  ".dream-karakuri-tabs",
  ".dream-chapter-stage-chapters",
  ".dream-roster-filters",
  ".dream-record-collection-views",
  ".dream-programme-spotlight-modes",
  ".library-scope-row",
  ".library-filter-row",
  ".search-categories",
  ".wm-filters",
  ".lab-zoom",
  ".lab-beats",
  ".lab-mobile-switch",
  ".wa-directory-controls",
] as const;

/** Picture groups and card rails: the selection is a glass bezel over the item. */
export const GLASS_BEZELS = [
  ".gallery-stage-candidates",
  ".chapter-reel",
  ".episode-grid",
  ".dream-poster-thumbnails",
  ".gallery-tour-filmstrip",
] as const;

/** Horizontal scrollers that get glass edge caps and a glass scroll indicator. */
export const GLASS_RAILS = [
  ".episode-grid",
  ".dream-poster-thumbnails",
  ".dream-programme-dossier-strip",
  ".gallery-stage-candidates",
  ".gallery-filters",
  ".wa-term-index > ol",
  ".gallery-tour-filmstrip",
] as const;

/**
 * The pickup openers: each sits in a card its own scroll timeline reveals
 * (opacity 0 until the card scrolls into view), and their dialogs stay
 * closed until they are used. Off screen they are marked data-lg-offscreen
 * and the sheet drops their backdrop-filter, so a hidden opener holds no
 * backdrop layer; they get it back a little before they scroll in.
 */
export const GLASS_OFFSCREEN = [".form-pickup-plus"] as const;
/** How far past the viewport an opener keeps its glass (the fade's head start). */
export const OFFSCREEN_MARGIN = "25% 0px";

const SELECTED =
  ':is([aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], [aria-current="true"], [aria-current="page"], [aria-current="step"], .is-active)';
const OPTION = ':is(button, a, [role="tab"], [role="radio"])';
const GROUPS = [...GLASS_SEGMENTS, ...GLASS_BEZELS].join(", ");
const RAILS = GLASS_RAILS.join(", ");

/* Every attribute this module writes, so stopping removes all of them. */
const SEG = "data-lg-seg";
const SEG_MODE = "data-lg-seg-mode";
const SEG_READY = "data-lg-seg-ready";
const SEG_GEL = "data-lg-seg-gel";
const SEG_STATIC = "data-lg-seg-static";
const SEG_CURRENT = "data-lg-seg-current";
const RAIL = "data-lg-rail";
const RAIL_HOST = "data-lg-rail-host";
const RAIL_HOST_STATIC = "data-lg-rail-host-static";
const RAIL_START = "data-lg-rail-start";
const RAIL_END = "data-lg-rail-end";
const OFFSCREEN = "data-lg-offscreen";
const OPENERS = GLASS_OFFSCREEN.join(", ");
const SEG_PROPS = [
  "--lg-seg-x",
  "--lg-seg-y",
  "--lg-seg-w",
  "--lg-seg-h",
  "--lg-seg-s0",
  "--lg-seg-k",
  "--lg-seg-r",
];
const RAIL_PROPS = ["--lg-rail-x", "--lg-rail-y", "--lg-rail-w", "--lg-rail-h", "--lg-rail-thumb"];

type Pseudo = "before" | "after";

function freePseudo(view: Window, el: Element): Pseudo | null {
  const used = (which: Pseudo) => {
    const content = view.getComputedStyle(el, `::${which}`).content;
    return content !== "none" && content !== "normal";
  };
  if (!used("before")) return "before";
  if (!used("after")) return "after";
  return null;
}

interface Segment {
  el: HTMLElement;
  current: HTMLElement | null;
  x: number;
  w: number;
  gel: boolean;
}

/* A group being measured this frame. */
interface Pick {
  segment: Segment;
  option: HTMLElement | null;
  probe: HTMLElement | null;
  at: Placed | null;
}

/* The pill's place and shape, read in the frame's read pass. */
interface Placed {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: string;
}

interface Rail {
  el: HTMLElement;
  host: HTMLElement;
  edges: IntersectionObserver | null;
}

/** The group's own options (not a nested group's). */
function selectedOption(group: HTMLElement) {
  for (const option of group.querySelectorAll<HTMLElement>(`${OPTION}${SELECTED}`)) {
    if (option.closest(GROUPS) === group && option.getClientRects().length) return option;
  }
  return null;
}

/**
 * Starts the controls' glass. Returns a disposer that removes every
 * attribute, property and observer it added.
 */
export function watchLiquidControls(doc: Document = document) {
  const view = doc.defaultView;
  if (!view || typeof view.ResizeObserver !== "function") return () => {};
  const segments = new Map<HTMLElement, Segment>();
  const rails = new Map<HTMLElement, Rail>();
  const dirty = new Set<HTMLElement>();
  const dirtyRails = new Set<Rail>();
  // Groups and rails turned down once (both pseudo-elements already drawn by
  // the page): the 400 ms rescan must not ask for their computed style again,
  // which would force a style pass in the middle of a scroll.
  const declined = new WeakSet<HTMLElement>();
  let frame = 0;
  let scanTimer = 0;

  const resize = new view.ResizeObserver((entries) => {
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      const group = target.closest(GROUPS);
      if (group instanceof view.HTMLElement && segments.has(group)) queue(group);
      const rail = rails.get(target);
      if (rail) queueRail(rail);
    }
  });

  const selection = new view.MutationObserver((records) => {
    for (const record of records) {
      const group = (record.target as Element).closest?.(GROUPS);
      if (group instanceof view.HTMLElement && segments.has(group)) queue(group);
    }
  });

  function queue(group: HTMLElement) {
    dirty.add(group);
    if (!frame) frame = view!.requestAnimationFrame(flush);
  }

  function queueRail(rail: Rail) {
    dirtyRails.add(rail);
    if (!frame) frame = view!.requestAnimationFrame(flush);
  }

  /* One frame's measuring, in four passes: read the selections; write the
     markers and place the probes; read every box; write every property.
     Two style passes for the lot, however many groups changed. */
  function flush() {
    frame = 0;
    const picks: Pick[] = [];
    for (const group of dirty) {
      const segment = segments.get(group);
      if (segment && group.isConnected)
        picks.push({ segment, option: null, probe: null, at: null });
    }
    const railList = [...dirtyRails].filter((rail) => rail.el.isConnected && rails.has(rail.el));
    dirty.clear();
    dirtyRails.clear();
    // 1. Read: which option is selected in each group.
    for (const pick of picks) pick.option = selectedOption(pick.segment.el);
    // 2. Write: the current markers, and a probe in each group to find the
    //    pill's origin; the rails' own marker.
    for (const pick of picks) {
      markCurrent(pick.segment, pick.option);
      if (pick.option) pick.probe = placeProbe(pick.segment.el);
    }
    for (const rail of railList) rail.el.toggleAttribute(RAIL, true);
    // 3. Read: every box (one style and layout pass).
    for (const pick of picks)
      if (pick.option && pick.probe) pick.at = readSegment(pick.segment, pick.option, pick.probe);
    const railBoxes = railList.map(readRail);
    // 4. Write: put the probes away, then the properties.
    for (const pick of picks) pick.probe?.remove();
    for (const pick of picks) {
      if (!pick.option) {
        pick.segment.el.style.removeProperty("--lg-seg-w");
        pick.segment.current = null;
      } else if (pick.at) writeSegment(pick.segment, pick.option, pick.at);
    }
    railList.forEach((rail, i) => writeRail(rail, railBoxes[i]));
  }

  function markCurrent(segment: Segment, option: HTMLElement | null) {
    if (option === segment.current) return;
    if (segment.current) {
      segment.current.removeAttribute(SEG_CURRENT);
      resize.unobserve(segment.current);
    }
    if (option) {
      option.setAttribute(SEG_CURRENT, "");
      resize.observe(option);
    }
  }

  // Where the pill's top left corner lands: a probe placed as the pill is
  // (absolute, at 0 0), read once and removed. A fieldset, a grid or a
  // scrolled rail each put that origin somewhere else.
  function placeProbe(el: HTMLElement) {
    const probe = doc.createElement("i");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;";
    el.appendChild(probe);
    return probe;
  }

  function readSegment(segment: Segment, option: HTMLElement, probe: HTMLElement): Placed | null {
    const { el } = segment;
    const rect = option.getBoundingClientRect();
    if (!rect.width) return null;
    const origin = probe.getBoundingClientRect();
    const probeLeft = probe.offsetLeft;
    const probeTop = probe.offsetTop;
    // A bezel follows the layout box, not the painted one: a card that is
    // still rising into place (a transform, often scroll-driven, which ends
    // no event) must not leave the bezel where it was mid-flight. Offsets up
    // to the group (the cards' offset parent); otherwise the painted box,
    // which also holds for a fieldset, whose offsets skip its legend.
    let left = 0;
    let top = 0;
    let node: HTMLElement | null = el.getAttribute(SEG_MODE) === "bezel" ? option : null;
    while (node && node !== el) {
      left += node.offsetLeft;
      top += node.offsetTop;
      node = node.offsetParent instanceof view!.HTMLElement ? node.offsetParent : null;
    }
    const laid = node === el;
    return {
      width: laid ? option.offsetWidth : rect.width,
      height: laid ? option.offsetHeight : rect.height,
      x: laid ? left - probeLeft : rect.left - origin.left,
      y: laid ? top - probeTop : rect.top - origin.top,
      radius: view!.getComputedStyle(option).borderTopLeftRadius,
    };
  }

  function writeSegment(segment: Segment, option: HTMLElement, at: Placed) {
    const { el } = segment;
    const { x, y, width, height, radius } = at;
    const moved = segment.current !== null && option !== segment.current && segment.w > 0;
    const style = el.style;
    if (moved) {
      // The pill starts at the old width (scaled from the left edge, where
      // the translate starts too) and stretches along its travel like gel.
      const distance = Math.abs(x - segment.x);
      const stretch = Math.min(0.32, distance / Math.max(1, width) / 4);
      style.setProperty("--lg-seg-s0", (segment.w / width).toFixed(3));
      style.setProperty("--lg-seg-k", stretch.toFixed(3));
      segment.gel = !segment.gel;
      el.setAttribute(SEG_GEL, segment.gel ? "a" : "b");
    }
    style.setProperty("--lg-seg-x", `${x.toFixed(1)}px`);
    style.setProperty("--lg-seg-y", `${y.toFixed(1)}px`);
    style.setProperty("--lg-seg-w", `${width.toFixed(1)}px`);
    style.setProperty("--lg-seg-h", `${height.toFixed(1)}px`);
    // Tall tiles (a grid of cards) keep a rounded slab, not a capsule.
    const pill = height > 60 ? "22px" : "999px";
    style.setProperty("--lg-seg-r", el.getAttribute(SEG_MODE) === "bezel" ? radius : pill);
    segment.current = option;
    segment.x = x;
    segment.w = width;
    if (!el.hasAttribute(SEG_READY))
      view!.requestAnimationFrame(() => {
        if (segments.has(el)) el.setAttribute(SEG_READY, "");
      });
  }

  /* Read: whether the group can take a pill (a free pseudo-element). */
  function inspectSegment(el: HTMLElement) {
    if (segments.has(el) || el.hasAttribute(SEG) || declined.has(el)) return null;
    const pseudo = freePseudo(view!, el);
    if (!pseudo) {
      declined.add(el);
      return null;
    }
    return { el, pseudo, still: view!.getComputedStyle(el).position === "static" };
  }

  /* Write: take it on; its first measure is the next frame's. */
  function attachSegment({
    el,
    pseudo,
    still,
  }: {
    el: HTMLElement;
    pseudo: Pseudo;
    still: boolean;
  }) {
    const bezel = el.matches(GLASS_BEZELS.join(", "));
    if (still) el.setAttribute(SEG_STATIC, "");
    el.setAttribute(SEG, pseudo);
    el.setAttribute(SEG_MODE, bezel ? "bezel" : "pill");
    const segment: Segment = { el, current: null, x: 0, w: 0, gel: false };
    // A selected card that lifts or rises into place (a transform, which no
    // ResizeObserver sees) is measured again once its transition ends.
    if (bezel) {
      el.addEventListener("transitionend", settle, { passive: true });
      el.addEventListener("animationend", settle, { passive: true });
    }
    segments.set(el, segment);
    selection.observe(el, {
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-pressed", "aria-checked", "aria-selected", "aria-current", "class"],
    });
    resize.observe(el);
    queue(el);
  }

  function settle(event: Event) {
    const group = event.currentTarget;
    if (!(group instanceof view!.HTMLElement)) return;
    const current = segments.get(group)?.current;
    // Only a transition on the selected item or a box that holds it.
    if (current && event.target instanceof view!.Node && event.target.contains(current))
      queue(group);
  }

  function detachSegment(segment: Segment) {
    const { el } = segment;
    el.removeEventListener("transitionend", settle);
    el.removeEventListener("animationend", settle);
    resize.unobserve(el);
    if (segment.current) {
      segment.current.removeAttribute(SEG_CURRENT);
      resize.unobserve(segment.current);
    }
    for (const name of [SEG, SEG_MODE, SEG_READY, SEG_GEL, SEG_STATIC]) el.removeAttribute(name);
    for (const prop of SEG_PROPS) el.style.removeProperty(prop);
    segments.delete(el);
  }

  /* Read: the rail's overflow and its box in its host's (after its marker is written). */
  function readRail(rail: Rail) {
    const { el, host } = rail;
    if (el.scrollWidth <= el.clientWidth + 4) return null;
    const h = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      x: r.left - h.left - host.clientLeft,
      y: r.top - h.top - host.clientTop,
      width: r.width,
      height: r.height,
      thumb: el.clientWidth / el.scrollWidth,
    };
  }

  function writeRail(rail: Rail, box: ReturnType<typeof readRail>) {
    const { host } = rail;
    if (!box) {
      host.removeAttribute(RAIL_HOST);
      return;
    }
    const style = host.style;
    style.setProperty("--lg-rail-x", `${box.x.toFixed(1)}px`);
    style.setProperty("--lg-rail-y", `${box.y.toFixed(1)}px`);
    style.setProperty("--lg-rail-w", `${box.width.toFixed(1)}px`);
    style.setProperty("--lg-rail-h", `${box.height.toFixed(1)}px`);
    style.setProperty("--lg-rail-thumb", box.thumb.toFixed(4));
    host.setAttribute(RAIL_HOST, "");
  }

  function watchEdges(rail: Rail) {
    rail.edges?.disconnect();
    const items = [...rail.el.children].filter((child) => child.getClientRects().length);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last || typeof view!.IntersectionObserver !== "function") return;
    rail.edges = new view!.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const at = entry.intersectionRatio > 0.97;
          if (entry.target === first) rail.host.toggleAttribute(RAIL_START, at);
          if (entry.target === last) rail.host.toggleAttribute(RAIL_END, at);
        }
      },
      { root: rail.el, threshold: [0.97] },
    );
    rail.edges.observe(first);
    if (last !== first) rail.edges.observe(last);
  }

  /* Read: whether the rail's host has both pseudo-elements free. */
  function inspectRail(el: HTMLElement) {
    const host = el.parentElement;
    if (
      rails.has(el) ||
      declined.has(el) ||
      !host ||
      host.hasAttribute(RAIL_HOST) ||
      host.closest("[data-lg-rail]")
    )
      return null;
    const before = view!.getComputedStyle(host, "::before").content;
    const after = view!.getComputedStyle(host, "::after").content;
    const free = (content: string) => content === "none" || content === "normal";
    if (!free(before) || !free(after)) {
      declined.add(el);
      return null;
    }
    return { el, host, still: view!.getComputedStyle(host).position === "static" };
  }

  /* Write: take it on; it is measured with the next frame's batch. */
  function attachRail({ el, host, still }: { el: HTMLElement; host: HTMLElement; still: boolean }) {
    if (still) host.setAttribute(RAIL_HOST_STATIC, "");
    const rail: Rail = { el, host, edges: null };
    rails.set(el, rail);
    resize.observe(el);
    queueRail(rail);
    return rail;
  }

  function detachRail(rail: Rail) {
    rail.edges?.disconnect();
    resize.unobserve(rail.el);
    rail.el.removeAttribute(RAIL);
    for (const name of [RAIL_HOST, RAIL_HOST_STATIC, RAIL_START, RAIL_END])
      rail.host.removeAttribute(name);
    for (const prop of RAIL_PROPS) rail.host.style.removeProperty(prop);
    rails.delete(rail.el);
    dirtyRails.delete(rail);
  }

  // The openers off screen (GLASS_OFFSCREEN): one observer for them all.
  const openers = new Set<HTMLElement>();
  const offscreen =
    typeof view.IntersectionObserver === "function"
      ? new view.IntersectionObserver(
          (entries) => {
            for (const entry of entries)
              entry.target.toggleAttribute(OFFSCREEN, !entry.isIntersecting);
          },
          { rootMargin: OFFSCREEN_MARGIN },
        )
      : null;

  function scan() {
    scanTimer = 0;
    for (const [el, segment] of segments) if (!el.isConnected) detachSegment(segment);
    for (const [el, rail] of rails) if (!el.isConnected) detachRail(rail);
    // Read every new group and rail first, then write: one style pass.
    const newGroups = [...doc.querySelectorAll<HTMLElement>(GROUPS)].map(inspectSegment);
    const newRails = [...doc.querySelectorAll<HTMLElement>(RAILS)].map(inspectRail);
    for (const found of newGroups) if (found) attachSegment(found);
    const added = newRails.flatMap((found) => (found ? [attachRail(found)] : []));
    for (const rail of added) watchEdges(rail);
    if (offscreen) {
      for (const el of openers)
        if (!el.isConnected) {
          offscreen.unobserve(el);
          openers.delete(el);
        }
      for (const el of doc.querySelectorAll<HTMLElement>(OPENERS))
        if (!openers.has(el)) {
          openers.add(el);
          offscreen.observe(el);
        }
    }
  }

  // Pages mount and unmount groups as the router moves: a quiet rescan,
  // at most every 400 ms, while the tree is changing.
  const tree = new view.MutationObserver((records) => {
    if (
      records.every(
        (record) => record.target instanceof view.HTMLElement && record.target.hasAttribute(SEG),
      )
    )
      return;
    if (!scanTimer) scanTimer = view.setTimeout(scan, 400);
  });
  tree.observe(doc.body, { childList: true, subtree: true });

  // Web fonts change every label's width once.
  const remeasure = () => {
    for (const el of segments.keys()) queue(el);
    for (const rail of rails.values()) queueRail(rail);
  };
  doc.fonts?.ready.then(remeasure, () => {});
  view.addEventListener("resize", remeasure, { passive: true });
  scan();

  return () => {
    tree.disconnect();
    offscreen?.disconnect();
    for (const el of openers) el.removeAttribute(OFFSCREEN);
    openers.clear();
    selection.disconnect();
    resize.disconnect();
    view.removeEventListener("resize", remeasure);
    if (frame) view.cancelAnimationFrame(frame);
    if (scanTimer) view.clearTimeout(scanTimer);
    for (const segment of [...segments.values()]) detachSegment(segment);
    for (const rail of [...rails.values()]) detachRail(rail);
  };
}
