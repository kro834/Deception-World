/** Open a chapter before native fragment scrolling measures its position.
 * History and scrolling stay with the browser and the existing route guards. */
export function mountDreamChapterNavigation(root, onChange, environment = window) {
  if (!root) return () => {};
  let focusFrame = 0;
  let focusHash = "";
  const cancelFocus = () => {
    if (focusFrame) environment.cancelAnimationFrame(focusFrame);
    focusFrame = 0;
    focusHash = "";
  };
  const readTarget = (hash) => {
    const match = /^#dream-(?:case|case-note|chronicle-case)-([0-5])$/.exec(hash);
    if (!match && hash !== "#dream-chapter-index") return null;
    const target = root.ownerDocument.getElementById(hash.slice(1));
    return target && root.contains(target) ? { target, no: match?.[1] ?? null } : null;
  };
  const sync = (hash = environment.location.hash, openTarget = true) => {
    const location = readTarget(hash);
    if (location && openTarget) {
      const fold = location.target.closest("details");
      if (fold && root.contains(fold)) fold.open = true;
    }
    onChange({
      current: location?.no ?? null,
      open: [...root.querySelectorAll(".dream-story-case[open]")].map(
        (fold) => fold.dataset.caseNo,
      ),
    });
    return location;
  };
  const onClick = (event) => {
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
    if (
      !link ||
      !root.contains(link) ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self")
    )
      return;
    cancelFocus();
    const location = sync(link.getAttribute("href"));
    if (!location || event.detail !== 0) return;
    focusHash = link.getAttribute("href");
    focusFrame = environment.requestAnimationFrame(() => {
      focusFrame = 0;
      focusHash = "";
      const focusTarget = location.target.matches("details")
        ? location.target.querySelector("summary")
        : location.target;
      focusTarget?.focus({ preventScroll: true });
    });
  };
  const onHistory = () => {
    if (environment.location.hash !== focusHash) cancelFocus();
    sync();
  };
  const onToggle = (event) => {
    if (event.target.matches?.(".dream-story-case")) sync(environment.location.hash, false);
  };
  // Capture precedes stable-fragment-navigation's one layout read.
  root.addEventListener("click", onClick, true);
  root.addEventListener("toggle", onToggle, true);
  environment.addEventListener("hashchange", onHistory);
  environment.addEventListener("popstate", onHistory);
  sync();
  return () => {
    root.removeEventListener("click", onClick, true);
    root.removeEventListener("toggle", onToggle, true);
    environment.removeEventListener("hashchange", onHistory);
    environment.removeEventListener("popstate", onHistory);
    cancelFocus();
  };
}
