import { parseDreamReaderHash } from "./dream-reader-state.js";

/** Open a chapter before native fragment scrolling measures its position. */
export function mountDreamChapterNavigation(root, onChange, environment = window) {
  if (!root) return () => {};
  let focusFrame = 0;
  let focusHash = "";
  let focusTarget = null;
  let syncedHash = null;
  let landingTarget = null;
  let returningLink = null;
  const backLinks = [];
  const forwardLinks = [];
  // Reciprocal links can produce A → B → A with two different history entries for A.
  const entryKey = () =>
    environment.navigation?.currentEntry?.key ?? environment.history?.state?.__TSR_key;
  let historyKey = entryKey();
  const cancelFocus = () => {
    if (focusFrame) environment.cancelAnimationFrame(focusFrame);
    focusFrame = 0;
    landingTarget = null;
    returningLink = null;
    focusHash = "";
    focusTarget = null;
  };
  const scheduleFocus = () => {
    if (focusFrame) environment.cancelAnimationFrame(focusFrame);
    focusFrame = environment.requestAnimationFrame(() => {
      focusFrame = 0;
      if (returningLink) {
        const { link, to, departureTop } = returningLink;
        if (
          environment.location.hash !== focusHash ||
          !root.contains(link) ||
          link.getAttribute("href") !== to
        ) {
          cancelFocus();
          return;
        }
        const rect = link.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < environment.innerHeight) {
          landingTarget = null;
        } else if (departureTop !== null && rect.height > 0) {
          // WebKit can retain the destination's scroll offset on same-page Back.
          const top = Math.max(0, Math.min(departureTop, environment.innerHeight - rect.height));
          environment.scrollBy({ top: rect.top - top, behavior: "instant" });
          landingTarget = null;
        }
      }
      if (landingTarget) {
        // Cold links and traversal may have been measured while the case was folded.
        const target = landingTarget;
        landingTarget = null;
        if (environment.location.hash !== focusHash || target.closest("details")?.open === false)
          return;
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
      focusTarget?.focus({ preventScroll: true });
    });
  };
  const readTarget = (hash) => {
    const match = /^#dream-(?:case|case-note|chronicle-case)-([0-5])$/.exec(hash);
    const paragraph = parseDreamReaderHash(hash);
    const event = /^#dream-chronicle-event-([1-9]\d*)$/.test(hash);
    if (!match && !paragraph && !event && hash !== "#dream-chapter-index") return null;
    const target = root.ownerDocument.getElementById(hash.slice(1));
    if (!target || !root.contains(target)) return null;
    if (
      paragraph &&
      (!target.matches("[data-dream-reading-paragraph]") ||
        target.closest(".dream-story-case")?.dataset.caseNo !== paragraph.caseNo)
    )
      return null;
    const eventCase =
      event && target.matches(".dream-chronicle-item")
        ? /^dream-chronicle-case-([0-5])$/.exec(target.closest("details")?.id || "")?.[1]
        : null;
    if (event && !eventCase) return null;
    return { target, no: match?.[1] ?? paragraph?.caseNo ?? eventCase ?? null };
  };
  const sync = (hash = environment.location.hash, openTarget = true) => {
    if (openTarget) syncedHash = hash;
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
  const focusLocation = (location, hash, align = false) => {
    focusHash = hash;
    focusTarget = location.target.matches("details")
      ? location.target.querySelector("summary")
      : location.target;
    if (align) landingTarget = location.target;
    scheduleFocus();
  };
  const restoreChronicle = (location, hash) => {
    if (location && hash.startsWith("#dream-chronicle-")) focusLocation(location, hash, true);
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
    const hash = link.getAttribute("href");
    const leavesFragment = environment.location.hash !== hash;
    const entry = leavesFragment && link.closest(".dream-record-explorer, .dream-chronicle-entry");
    const crossLink = leavesFragment && link.closest(
      ".dream-reader-backlinks, .dream-reader-related, .dream-chapter-companion",
    );
    const departureRect = entry || crossLink ? link.getBoundingClientRect() : null;
    const departureTop =
      departureRect && departureRect.bottom > 0 && departureRect.top < environment.innerHeight
        ? departureRect.top
        : null;
    const location = sync(hash);
    if (leavesFragment) {
      backLinks.push({
        from: environment.location.hash,
        fromKey: entryKey(),
        to: hash,
        toKey: undefined,
        link: location && (entry || crossLink) ? link : null,
        align: Boolean(entry),
        departureTop,
      });
      forwardLinks.length = 0;
    }
    if (location && (event.detail === 0 || hash.startsWith("#dream-chronicle-")))
      focusLocation(location, hash);
  };
  const onHistory = () => {
    const { hash } = environment.location;
    const key = entryKey();
    const previousKey = historyKey;
    if (key) historyKey = key;
    // A fragment emits popstate and then an asynchronous hashchange. The
    // second event must not reopen a fold the reader has already closed.
    const previousHash = syncedHash;
    const changed = hash !== previousHash;
    const keyChanged = Boolean(key && previousKey && key !== previousKey);
    const previousLink = backLinks.at(-1);
    const followedLink =
      keyChanged && !changed && previousLink?.to === hash &&
      !previousLink.toKey && previousLink.fromKey === previousKey;
    if (followedLink) previousLink.toKey = key;
    const traversedEntry = keyChanged && !followedLink;
    if (hash !== focusHash || traversedEntry) cancelFocus();
    const location = sync(hash, changed || traversedEntry);
    if (changed || traversedEntry) {
      // Jumping over entries through the browser's history menu can leave
      // the hash unchanged. Match the actual entry before moving either stack.
      const backIndex = key
        ? backLinks.findLastIndex((step) => step.fromKey === key && step.from === hash)
        : -1;
      const forwardIndex = key
        ? forwardLinks.findLastIndex((step) => step.toKey === key && step.to === hash)
        : -1;
      const nextLink = forwardLinks.at(-1);
      const adjacentBack =
        changed && previousLink?.to === previousHash &&
        previousLink.from === hash && (!previousLink.fromKey || previousLink.fromKey === key);
      const adjacentForward =
        changed && nextLink?.from === previousHash && nextLink.to === hash &&
        (!nextLink.toKey || nextLink.toKey === key);
      if (backIndex >= 0 || adjacentBack) {
        const steps = backLinks.splice(backIndex >= 0 ? backIndex : -1);
        const back = steps[0];
        forwardLinks.push(...steps.reverse());
        if (back.link) {
          // The browser restores the reading position. A filtered or replaced
          // link must not redirect this entry to a distant chronicle heading.
          returningLink = back;
          focusLocation({ target: back.link }, hash, back.align);
          return;
        }
      } else if (forwardIndex >= 0 || adjacentForward) {
        const steps = forwardLinks.splice(forwardIndex >= 0 ? forwardIndex : -1);
        const forward = steps[0];
        backLinks.push(...steps.reverse());
        if (forward.link && location) {
          focusLocation(location, hash, hash.startsWith("#dream-chronicle-"));
          return;
        }
      } else {
        // A fragment entered outside these clicks starts a new traversal chain.
        backLinks.length = 0;
        forwardLinks.length = 0;
      }
      restoreChronicle(location, hash);
      return;
    }
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
  environment.addEventListener("wheel", cancelFocus, { passive: true });
  environment.addEventListener("hashchange", onHistory);
  environment.addEventListener("popstate", onHistory);
  restoreChronicle(sync(), environment.location.hash);
  return () => {
    root.removeEventListener("click", onClick, true);
    root.removeEventListener("toggle", onToggle, true);
    root.removeEventListener("keydown", cancelFocus, true);
    root.removeEventListener("pointerdown", cancelFocus, true);
    root.removeEventListener("focusin", onFocusIn, true);
    environment.removeEventListener("wheel", cancelFocus);
    environment.removeEventListener("hashchange", onHistory);
    environment.removeEventListener("popstate", onHistory);
    cancelFocus();
  };
}
