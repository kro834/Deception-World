type ScrollResetTarget = HTMLElement | HTMLDialogElement;

function resetTarget(target: ScrollResetTarget) {
  const previousScrollBehavior = target.style.scrollBehavior;
  target.style.scrollBehavior = "auto";
  target.scrollTop = 0;
  target.scrollLeft = 0;
  target.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  if (previousScrollBehavior) target.style.scrollBehavior = previousScrollBehavior;
  else target.style.removeProperty("scroll-behavior");
}

export function resetPickupScroll(dialog: HTMLDialogElement, selectors: readonly string[]) {
  resetTarget(dialog);
  selectors.forEach((selector) => {
    const target = dialog.querySelector<HTMLElement>(selector);
    if (target) resetTarget(target);
  });
}

export function settlePickupScroll(
  dialog: HTMLDialogElement,
  selectors: readonly string[],
  afterFirstFrame?: () => void,
) {
  let firstFrame = 0;
  let finalFrame = 0;
  let layoutFrame = 0;
  let watcherStopTimer = 0;
  const delayedResets: number[] = [];
  let resizeObserver: ResizeObserver | null = null;
  let cancelled = false;
  let userInteracted = false;
  let watching = false;
  const reset = () => {
    if (!cancelled && !userInteracted && dialog.open) resetPickupScroll(dialog, selectors);
  };
  const scrollKeys = new Set(["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "]);

  const stopWatching = () => {
    if (!watching) return;
    watching = false;
    dialog.removeEventListener("pointerdown", noteInteraction, true);
    dialog.removeEventListener("touchstart", noteInteraction, true);
    dialog.removeEventListener("wheel", noteInteraction, true);
    dialog.removeEventListener("keydown", noteInteraction, true);
    dialog.removeEventListener("load", requestLayoutReset, true);
    resizeObserver?.disconnect();
    resizeObserver = null;
    delayedResets.splice(0).forEach((timer) => window.clearTimeout(timer));
    if (watcherStopTimer) window.clearTimeout(watcherStopTimer);
    watcherStopTimer = 0;
    if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
    layoutFrame = 0;
  };

  function noteInteraction(event: Event) {
    if (event instanceof KeyboardEvent && !scrollKeys.has(event.key)) return;
    userInteracted = true;
    if (finalFrame) window.cancelAnimationFrame(finalFrame);
    finalFrame = 0;
    stopWatching();
  }

  function requestLayoutReset() {
    if (layoutFrame || cancelled || userInteracted) return;
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = 0;
      reset();
    });
  }

  const startWatching = () => {
    if (cancelled || userInteracted || !dialog.open) return;
    watching = true;
    dialog.addEventListener("pointerdown", noteInteraction, true);
    dialog.addEventListener("touchstart", noteInteraction, { capture: true, passive: true });
    dialog.addEventListener("wheel", noteInteraction, { capture: true, passive: true });
    dialog.addEventListener("keydown", noteInteraction, true);
    dialog.addEventListener("load", requestLayoutReset, true);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(requestLayoutReset);
      resizeObserver.observe(dialog);
      selectors.forEach((selector) => {
        const target = dialog.querySelector<HTMLElement>(selector);
        if (target) resizeObserver?.observe(target);
      });
    }

    [90, 240, 520, 900].forEach((delay) => {
      const timer = window.setTimeout(reset, delay);
      delayedResets.push(timer);
    });
    watcherStopTimer = window.setTimeout(stopWatching, 1200);
  };

  // Reset immediately after showModal(), after React commits, throughout
  // WebKit's delayed focus/layout restoration, and when late images resize the
  // panel. Real pointer/scroll input cancels the delayed phase immediately.
  resetPickupScroll(dialog, selectors);
  firstFrame = window.requestAnimationFrame(() => {
    if (cancelled || !dialog.open) return;
    reset();
    afterFirstFrame?.();
    finalFrame = window.requestAnimationFrame(() => {
      finalFrame = 0;
      reset();
    });
    startWatching();
  });

  return () => {
    cancelled = true;
    stopWatching();
    if (firstFrame) window.cancelAnimationFrame(firstFrame);
    if (finalFrame) window.cancelAnimationFrame(finalFrame);
    if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
  };
}
