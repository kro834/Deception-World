/** Open a chapter before native fragment scrolling measures its position.
 * History and scrolling stay with the browser and the existing route guards. */
export function mountDreamChapterNavigation(root, onChange, environment = window) {
  if (!root) return () => {};
  let focusFrame = 0;
  let focusHash = "";
  let focusTarget = null;
  let syncedHash = null;
  const cancelFocus = () => {
    if (focusFrame) environment.cancelAnimationFrame(focusFrame);
    focusFrame = 0;
    focusHash = "";
    focusTarget = null;
  };
  const scheduleFocus = () => {
    if (focusFrame) environment.cancelAnimationFrame(focusFrame);
    focusFrame = environment.requestAnimationFrame(() => {
      focusFrame = 0;
      focusTarget?.focus({ preventScroll: true });
    });
  };
  const readTarget = (hash) => {
    const match = /^#dream-(?:case|case-note|chronicle-case)-([0-5])$/.exec(hash);
    if (!match && hash !== "#dream-chapter-index") return null;
    const target = root.ownerDocument.getElementById(hash.slice(1));
    return target && root.contains(target) ? { target, no: match?.[1] ?? null } : null;
  };
  const sync = (hash = environment.location.hash, openTarget = true) => {
    syncedHash = hash;
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
    focusTarget = location.target.matches("details")
      ? location.target.querySelector("summary")
      : location.target;
    scheduleFocus();
  };
  const onHistory = () => {
    if (environment.location.hash !== focusHash) cancelFocus();
    // A fragment emits popstate and then an asynchronous hashchange. The
    // second event must not reopen a fold the reader has already closed.
    sync(environment.location.hash, environment.location.hash !== syncedHash);
    // Native fragment focus may run after the click's first animation frame.
    // Finish focus after that navigation, unless a new user input owns it.
    if (focusTarget) scheduleFocus();
  };
  const onToggle = (event) => {
    if (event.target.matches?.(".dream-story-case")) sync(environment.location.hash, false);
  };
  const onFocusIn = (event) => {
    if (!focusTarget || event.target === focusTarget) return;
    // Native fragment navigation can focus the details before its summary.
    if (event.target === focusTarget.parentElement && event.target.matches?.("details")) return;
    // Moving to the next link (including assistive/programmatic focus) owns
    // focus before its keydown. A pending frame must not pull it back.
    cancelFocus();
  };
  // Capture precedes stable-fragment-navigation's one layout read.
  root.addEventListener("click", onClick, true);
  root.addEventListener("toggle", onToggle, true);
  root.addEventListener("keydown", cancelFocus, true);
  root.addEventListener("pointerdown", cancelFocus, true);
  root.addEventListener("focusin", onFocusIn, true);
  environment.addEventListener("hashchange", onHistory);
  environment.addEventListener("popstate", onHistory);
  sync();
  return () => {
    root.removeEventListener("click", onClick, true);
    root.removeEventListener("toggle", onToggle, true);
    root.removeEventListener("keydown", cancelFocus, true);
    root.removeEventListener("pointerdown", cancelFocus, true);
    root.removeEventListener("focusin", onFocusIn, true);
    environment.removeEventListener("hashchange", onHistory);
    environment.removeEventListener("popstate", onHistory);
    cancelFocus();
  };
}
