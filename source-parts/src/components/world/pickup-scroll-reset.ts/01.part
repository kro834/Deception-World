type ScrollResetTarget = HTMLElement | HTMLDialogElement;

function resetTarget(target: ScrollResetTarget) {
  target.scrollTop = 0;
  target.scrollLeft = 0;
  target.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
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
  let cancelled = false;
  const reset = () => resetPickupScroll(dialog, selectors);

  // Reset immediately after showModal(), once after React has committed the
  // selected pickup, and once more after WebKit has completed its automatic
  // dialog focus/layout pass.
  reset();
  firstFrame = window.requestAnimationFrame(() => {
    if (cancelled || !dialog.open) return;
    reset();
    afterFirstFrame?.();
    finalFrame = window.requestAnimationFrame(() => {
      if (!cancelled && dialog.open) reset();
    });
  });

  return () => {
    cancelled = true;
    if (firstFrame) window.cancelAnimationFrame(firstFrame);
    if (finalFrame) window.cancelAnimationFrame(finalFrame);
  };
}
