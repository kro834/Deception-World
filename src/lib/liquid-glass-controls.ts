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
// handlers.

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
      if (rail) measureRail(rail);
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

  function flush() {
    frame = 0;
    const groups = [...dirty];
    dirty.clear();
    for (const group of groups) {
      const segment = segments.get(group);
      if (segment) measureSegment(segment);
    }
  }

  function measureSegment(segment: Segment) {
    const { el } = segment;
    if (!el.isConnected) return;
    const option = selectedOption(el);
    if (option !== segment.current) {
      if (segment.current) {
        segment.current.removeAttribute(SEG_CURRENT);
        resize.unobserve(segment.current);
      }
      if (option) {
        option.setAttribute(SEG_CURRENT, "");
        resize.observe(option);
      }
    }
    if (!option) {
      el.style.removeProperty("--lg-seg-w");
      segment.current = null;
      return;
    }
    const rect = option.getBoundingClientRect();
    if (!rect.width) return;
    // Where the pill's top left corner lands: a probe placed as the pill is
    // (absolute, at 0 0), read once and removed. A fieldset, a grid or a
    // scrolled rail each put that origin somewhere else.
    const probe = doc.createElement("i");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;top:0;left:0;width:0;height:0;margin:0;padding:0;border:0;";
    el.appendChild(probe);
    const origin = probe.getBoundingClientRect();
    const probeLeft = probe.offsetLeft;
    const probeTop = probe.offsetTop;
    probe.remove();
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
    const r = laid
      ? { width: option.offsetWidth, height: option.offsetHeight }
      : { width: rect.width, height: rect.height };
    const x = laid ? left - probeLeft : rect.left - origin.left;
    const y = laid ? top - probeTop : rect.top - origin.top;
    const moved = segment.current !== null && option !== segment.current && segment.w > 0;
    const style = el.style;
    if (moved) {
      // The pill starts at the old width (scaled from the left edge, where
      // the translate starts too) and stretches along its travel like gel.
      const distance = Math.abs(x - segment.x);
      const stretch = Math.min(0.32, distance / Math.max(1, r.width) / 4);
      style.setProperty("--lg-seg-s0", (segment.w / r.width).toFixed(3));
      style.setProperty("--lg-seg-k", stretch.toFixed(3));
      segment.gel = !segment.gel;
      el.setAttribute(SEG_GEL, segment.gel ? "a" : "b");
    }
    style.setProperty("--lg-seg-x", `${x.toFixed(1)}px`);
    style.setProperty("--lg-seg-y", `${y.toFixed(1)}px`);
    style.setProperty("--lg-seg-w", `${r.width.toFixed(1)}px`);
    style.setProperty("--lg-seg-h", `${r.height.toFixed(1)}px`);
    const radius = view!.getComputedStyle(option).borderTopLeftRadius;
    // Tall tiles (a grid of cards) keep a rounded slab, not a capsule.
    const pill = r.height > 60 ? "22px" : "999px";
    style.setProperty("--lg-seg-r", el.getAttribute(SEG_MODE) === "bezel" ? radius : pill);
    segment.current = option;
    segment.x = x;
    segment.w = r.width;
    if (!el.hasAttribute(SEG_READY))
      view!.requestAnimationFrame(() => {
        if (segments.has(el)) el.setAttribute(SEG_READY, "");
      });
  }

  function attachSegment(el: HTMLElement) {
    if (segments.has(el) || el.hasAttribute(SEG) || declined.has(el)) return;
    const pseudo = freePseudo(view!, el);
    if (!pseudo) {
      declined.add(el);
      return;
    }
    const bezel = el.matches(GLASS_BEZELS.join(", "));
    if (view!.getComputedStyle(el).position === "static") el.setAttribute(SEG_STATIC, "");
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
    measureSegment(segment);
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

  function measureRail(rail: Rail) {
    const { el, host } = rail;
    if (!el.isConnected) return;
    const overflow = el.scrollWidth > el.clientWidth + 4;
    el.toggleAttribute(RAIL, true);
    if (!overflow) {
      host.removeAttribute(RAIL_HOST);
      return;
    }
    const h = host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const style = host.style;
    style.setProperty("--lg-rail-x", `${(r.left - h.left - host.clientLeft).toFixed(1)}px`);
    style.setProperty("--lg-rail-y", `${(r.top - h.top - host.clientTop).toFixed(1)}px`);
    style.setProperty("--lg-rail-w", `${r.width.toFixed(1)}px`);
    style.setProperty("--lg-rail-h", `${r.height.toFixed(1)}px`);
    style.setProperty("--lg-rail-thumb", (el.clientWidth / el.scrollWidth).toFixed(4));
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

  function attachRail(el: HTMLElement) {
    const host = el.parentElement;
    if (
      rails.has(el) ||
      declined.has(el) ||
      !host ||
      host.hasAttribute(RAIL_HOST) ||
      host.closest("[data-lg-rail]")
    )
      return;
    const before = view!.getComputedStyle(host, "::before").content;
    const after = view!.getComputedStyle(host, "::after").content;
    const free = (content: string) => content === "none" || content === "normal";
    if (!free(before) || !free(after)) {
      declined.add(el);
      return;
    }
    if (view!.getComputedStyle(host).position === "static") host.setAttribute(RAIL_HOST_STATIC, "");
    const rail: Rail = { el, host, edges: null };
    rails.set(el, rail);
    resize.observe(el);
    measureRail(rail);
    watchEdges(rail);
  }

  function detachRail(rail: Rail) {
    rail.edges?.disconnect();
    resize.unobserve(rail.el);
    rail.el.removeAttribute(RAIL);
    for (const name of [RAIL_HOST, RAIL_HOST_STATIC, RAIL_START, RAIL_END])
      rail.host.removeAttribute(name);
    for (const prop of RAIL_PROPS) rail.host.style.removeProperty(prop);
    rails.delete(rail.el);
  }

  function scan() {
    scanTimer = 0;
    for (const [el, segment] of segments) if (!el.isConnected) detachSegment(segment);
    for (const [el, rail] of rails) if (!el.isConnected) detachRail(rail);
    for (const el of doc.querySelectorAll<HTMLElement>(GROUPS)) attachSegment(el);
    for (const el of doc.querySelectorAll<HTMLElement>(RAILS)) attachRail(el);
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
    for (const rail of rails.values()) measureRail(rail);
  };
  doc.fonts?.ready.then(remeasure, () => {});
  view.addEventListener("resize", remeasure, { passive: true });
  scan();

  return () => {
    tree.disconnect();
    selection.disconnect();
    resize.disconnect();
    view.removeEventListener("resize", remeasure);
    if (frame) view.cancelAnimationFrame(frame);
    if (scanTimer) view.clearTimeout(scanTimer);
    for (const segment of [...segments.values()]) detachSegment(segment);
    for (const rail of [...rails.values()]) detachRail(rail);
  };
}
