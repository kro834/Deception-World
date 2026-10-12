// Native clicks and router/search arrivals can hold the same path concurrently.
// Restore the original inline style only when its last owner releases it.
const fragmentPathHolds = new WeakMap();

/** Lay out every Dream section from the page's top through the one that
 * holds `target` (content-visibility: visible) until scrolling goes quiet,
 * so a jump measures real heights instead of the skipped sections'
 * estimates. One deliberate layout read; returns the release. */
export function holdFragmentPath(root, target, environment = window) {
  const sections = [...root.querySelectorAll(".dream-section, .dream-annex")].filter(
    (section) =>
      section === target ||
      section.contains(target) ||
      Boolean(section.compareDocumentPosition(target) & 4),
  );
  sections.forEach((section) => {
    const hold = fragmentPathHolds.get(section);
    if (hold) hold.owners++;
    else fragmentPathHolds.set(section, { owners: 1, previous: section.style.contentVisibility });
    section.style.contentVisibility = "visible";
  });
  // One deliberate layout read per navigation, never in a scroll frame.
  target.getBoundingClientRect();
  let quietTimer = 0;
  let limitTimer = 0;
  let clickFallback = 0;
  let finished = false;
  let pointerPending = false;
  const release = () => {
    if (finished) return;
    finished = true;
    environment.clearTimeout(quietTimer);
    environment.clearTimeout(limitTimer);
    environment.clearTimeout(clickFallback);
    environment.removeEventListener("scroll", onScroll);
    environment.removeEventListener("pointerdown", onPointerDown);
    environment.removeEventListener("pointerup", onPointerUp);
    environment.removeEventListener("pointercancel", release);
    environment.removeEventListener("click", onClick);
    environment.removeEventListener("wheel", finishWhenIdle);
    environment.removeEventListener("blur", release);
    environment.removeEventListener("pagehide", release);
    sections.forEach((section) => {
      const hold = fragmentPathHolds.get(section);
      if (!hold || --hold.owners > 0) return;
      fragmentPathHolds.delete(section);
      if (hold.previous) section.style.contentVisibility = hold.previous;
      else section.style.removeProperty("content-visibility");
    });
  };
  // A synchronous content-visibility release on pointerdown changes WebKit's
  // hit target before pointerup, so the native click misses the tapped button.
  // Keep the path through the bubbling click (when its target is settled).
  const finishWhenIdle = () => {
    if (!pointerPending) release();
  };
  const onPointerDown = () => {
    pointerPending = true;
    environment.clearTimeout(quietTimer);
    environment.clearTimeout(clickFallback);
  };
  const onPointerUp = () => {
    if (!pointerPending) return;
    // A drag may have no click. Do not release on pointerup itself: WebKit's
    // compatibility click has not been targeted yet.
    clickFallback = environment.setTimeout(release, 600);
  };
  const onClick = () => {
    if (pointerPending) release();
  };
  const onScroll = () => {
    environment.clearTimeout(quietTimer);
    quietTimer = environment.setTimeout(finishWhenIdle, 240);
  };
  environment.addEventListener("scroll", onScroll, { passive: true });
  environment.addEventListener("pointerdown", onPointerDown, { passive: true });
  environment.addEventListener("pointerup", onPointerUp, { passive: true });
  environment.addEventListener("pointercancel", release, { passive: true });
  environment.addEventListener("click", onClick);
  environment.addEventListener("wheel", finishWhenIdle, { passive: true });
  environment.addEventListener("blur", release);
  environment.addEventListener("pagehide", release);
  limitTimer = environment.setTimeout(finishWhenIdle, 3000);
  onScroll();
  return release;
}

/** Resolve skipped section heights before the browser starts a native hash
 * scroll. After rotation, content-visibility's remembered heights may still
 * belong to the previous width. Do not replace history, focus or scrolling. */
export function mountStableFragmentNavigation(root, environment = window) {
  if (!root) return () => {};
  let release = () => {};
  const prepare = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest?.('a[href^="#"]');
    if (!link || !root.contains(link)) return;
    let id;
    try {
      id = decodeURIComponent(link.getAttribute("href").slice(1));
    } catch {
      return;
    }
    const target = root.ownerDocument.getElementById(id);
    if (!target || !root.contains(target)) return;
    release();
    release = holdFragmentPath(root, target, environment);
    // WebKit's default action on the current fragment can cancel an in-flight
    // revisit after rotation. Only this no-history-change case is handled here;
    // new fragments retain native navigation and the router's hash handling.
    if (environment.location?.hash === link.getAttribute("href")) {
      event.preventDefault();
      target.scrollIntoView({ block: "start", behavior: "auto" });
    }
  };
  root.addEventListener("click", prepare);
  return () => {
    root.removeEventListener("click", prepare);
    release();
  };
}
