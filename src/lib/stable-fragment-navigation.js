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
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    environment.clearTimeout(quietTimer);
    environment.clearTimeout(limitTimer);
    environment.removeEventListener("scroll", onScroll);
    environment.removeEventListener("pointerdown", finish);
    environment.removeEventListener("wheel", finish);
    sections.forEach((section) => {
      const hold = fragmentPathHolds.get(section);
      if (!hold || --hold.owners > 0) return;
      fragmentPathHolds.delete(section);
      if (hold.previous) section.style.contentVisibility = hold.previous;
      else section.style.removeProperty("content-visibility");
    });
  };
  const onScroll = () => {
    environment.clearTimeout(quietTimer);
    quietTimer = environment.setTimeout(finish, 240);
  };
  environment.addEventListener("scroll", onScroll, { passive: true });
  environment.addEventListener("pointerdown", finish, { passive: true });
  environment.addEventListener("wheel", finish, { passive: true });
  limitTimer = environment.setTimeout(finish, 3000);
  onScroll();
  return finish;
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
