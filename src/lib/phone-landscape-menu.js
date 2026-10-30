const CHANGE_EVENT = "dw-phone-landscape-menu-refresh";
export const PHONE_LANDSCAPE_MEDIA =
  "(pointer: coarse) and (orientation: landscape) and (max-height: 540px)";

/** iPad, Android and portrait keyboards must not inherit the iPhone chrome. */
export function isPhoneLandscapeMenuDevice(userAgent, mediaMatches, width, height) {
  return (
    /iPhone/i.test(userAgent || "") &&
    Boolean(mediaMatches) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    height > 0 &&
    height <= 540 &&
    width > height
  );
}

/** Accumulate intentional movement rather than toggling at every scroll event.
 * @param {{hidden:boolean,lastY:number,travel:number,direction:number}} previous
 * @param {number} scrollY @param {number} headerHeight @param {boolean} [locked]
 */
export function advancePhoneLandscapeMenu(previous, scrollY, headerHeight, locked = false) {
  if (locked || !Number.isFinite(scrollY)) return previous;
  const y = Math.max(0, scrollY);
  if (y <= 8) return { hidden: false, lastY: y, travel: 0, direction: 0 };
  const delta = y - previous.lastY;
  if (Math.abs(delta) < 2) return previous;
  const direction = delta > 0 ? 1 : -1;
  const travel =
    direction === previous.direction ? previous.travel + Math.abs(delta) : Math.abs(delta);
  let hidden = previous.hidden;
  if (direction === 1 && travel >= 16 && y >= Math.max(32, headerHeight)) hidden = true;
  if (direction === -1 && travel >= 12) hidden = false;
  return { hidden, lastY: y, travel, direction };
}

export function refreshPhoneLandscapeMenu() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Only chrome placement changes. The document's scroll, history, focus and
 * existing menu button/listeners remain owned by their original components. */
export function watchPhoneLandscapeMenu(win = window, doc = document) {
  if (!/iPhone/i.test(win.navigator.userAgent || "")) return () => {};
  const root = doc.documentElement;
  const media = win.matchMedia(PHONE_LANDSCAPE_MEDIA);
  let frame = 0;
  let disposed = false;
  let active = false;
  let header = null;
  let trigger = null;
  let nav = null;
  let hosts = [];
  const neutralized = new Map();
  const freeFixedChildren = (element) => {
    if (neutralized.has(element)) return;
    const saved = ["transform", "translate", "scale", "rotate"].map((property) => ({
      property,
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    }));
    neutralized.set(element, saved);
    // Route skins include high-specificity !important identity transforms.
    // An identity matrix still traps fixed children in WebKit. Own these four
    // properties only while this iPhone mode is active, then restore exactly.
    for (const { property } of saved) element.style.setProperty(property, "none", "important");
  };
  let height = 0;
  let chromeHeight = 0;
  let scrollRequested = false;
  let measureRequested = true;
  let resetRequested = true;
  let wasLocked = false;
  let state = { hidden: false, lastY: Math.max(0, win.scrollY || 0), travel: 0, direction: 0 };
  const locked = () =>
    doc.hidden ||
    doc.body.style.position === "fixed" ||
    root.style.overflow === "hidden" ||
    ["data-side-menu-open", "data-dialog-open", "data-loading"].some((name) =>
      root.hasAttribute(name),
    );
  const eligible = () =>
    isPhoneLandscapeMenuDevice(
      win.navigator.userAgent,
      media.matches,
      win.innerWidth,
      win.innerHeight,
    );
  const baseline = (hidden = state.hidden) => ({
    hidden,
    lastY: Math.max(0, win.scrollY || 0),
    travel: 0,
    direction: 0,
  });
  const unmark = () => {
    for (const [element, properties] of neutralized) {
      for (const { property, value, priority } of properties) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
    }
    neutralized.clear();
    header?.removeAttribute("data-phone-landscape-header");
    header?.removeAttribute("data-phone-landscape-flow");
    trigger?.removeAttribute("data-phone-landscape-trigger");
    nav?.removeAttribute("data-phone-landscape-nav");
    for (const host of hosts) host.removeAttribute("data-phone-landscape-host");
    hosts = [];
    resizeObserver?.disconnect();
    header = trigger = nav = null;
    root.removeAttribute("data-phone-landscape-menu");
    root.removeAttribute("data-phone-landscape-hidden");
    root.style.removeProperty("--phone-landscape-header-height");
    root.style.removeProperty("--phone-landscape-chrome-height");
  };
  const discover = () => {
    const nextTrigger =
      [...doc.querySelectorAll(".side-panel-trigger")].find((item) => {
        const candidate = item.closest("header");
        return (
          candidate &&
          !item.closest('dialog, [role="dialog"], .side-panel') &&
          candidate.offsetHeight > 0
        );
      }) || null;
    const nextHeader = nextTrigger?.closest("header") || null;
    const nextNav = nextHeader?.classList.contains("dream-site-header")
      ? doc.querySelector(".dream-chapter-nav")
      : null;
    if (nextHeader !== header || nextTrigger !== trigger || nextNav !== nav) {
      unmark();
      header = nextHeader;
      trigger = nextTrigger;
      nav = nextNav;
      state = baseline(false);
      if (header) {
        header.setAttribute("data-phone-landscape-header", "");
        freeFixedChildren(header);
        const position = win.getComputedStyle(header).position;
        if (position !== "fixed" && position !== "sticky")
          header.setAttribute("data-phone-landscape-flow", "");
        trigger.setAttribute("data-phone-landscape-trigger", "");
        let host = trigger.parentElement;
        while (host && host !== header) {
          host.setAttribute("data-phone-landscape-host", "");
          freeFixedChildren(host);
          hosts.push(host);
          host = host.parentElement;
        }
        nav?.setAttribute("data-phone-landscape-nav", "");
        resizeObserver?.observe(header);
        if (nav) resizeObserver?.observe(nav);
      }
    }
    if (!header) return;
    height = Math.max(0, header.offsetHeight);
    root.style.setProperty("--phone-landscape-header-height", `${height}px`);
    chromeHeight = height + (nav?.offsetHeight || 0);
    root.style.setProperty("--phone-landscape-chrome-height", `${chromeHeight}px`);
    root.setAttribute("data-phone-landscape-menu", "true");
  };
  const update = () => {
    frame = 0;
    if (disposed) return;
    const nextActive = eligible();
    if (!nextActive) {
      if (active) unmark();
      active = false;
      state = baseline(false);
      scrollRequested = false;
      return;
    }
    if (!active) {
      measureRequested = resetRequested = true;
    }
    active = true;
    const isLocked = locked();
    if (isLocked) {
      wasLocked = true;
      scrollRequested = false;
      return;
    }
    const measuring = measureRequested || !header || header.isConnected === false;
    if (measuring) {
      discover();
      measureRequested = false;
    }
    if (resetRequested || wasLocked || measuring)
      state = baseline(resetRequested ? false : state.hidden);
    else if (scrollRequested && header)
      state = advancePhoneLandscapeMenu(state, win.scrollY, chromeHeight);
    resetRequested = false;
    wasLocked = false;
    scrollRequested = false;
    if (header) root.setAttribute("data-phone-landscape-hidden", String(state.hidden));
  };
  const schedule = () => {
    if (!disposed && !frame) frame = win.requestAnimationFrame(update);
  };
  const measure = () => {
    measureRequested = true;
    schedule();
  };
  const refresh = () => {
    resetRequested = measureRequested = true;
    scrollRequested = false;
    schedule();
  };
  const onScroll = () => {
    if (active) {
      scrollRequested = true;
      schedule();
    }
  };
  const resizeObserver =
    typeof win.ResizeObserver === "function" ? new win.ResizeObserver(measure) : null;
  const lockObserver = new win.MutationObserver(() => {
    const isLocked = locked();
    if (active && (isLocked || wasLocked)) schedule();
  });
  lockObserver.observe(root, {
    attributes: true,
    attributeFilter: ["style", "data-side-menu-open", "data-dialog-open", "data-loading"],
  });
  lockObserver.observe(doc.body, { attributes: true, attributeFilter: ["style"] });
  const treeObserver = new win.MutationObserver(() => {
    if (active && (!header || header.isConnected === false || trigger?.isConnected === false))
      measure();
  });
  treeObserver.observe(doc.body, { childList: true, subtree: true });
  const onVisibility = () => {
    resetRequested = true;
    scrollRequested = false;
    schedule();
  };
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("resize", measure, { passive: true });
  win.addEventListener(CHANGE_EVENT, refresh);
  media.addEventListener?.("change", measure);
  doc.addEventListener("visibilitychange", onVisibility);
  update();
  return () => {
    disposed = true;
    if (frame) win.cancelAnimationFrame(frame);
    unmark();
    lockObserver.disconnect();
    treeObserver.disconnect();
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("resize", measure);
    win.removeEventListener(CHANGE_EVENT, refresh);
    media.removeEventListener?.("change", measure);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
