// A control that navigates on pointerup (the Zeus button) is already
// pointer-events: none when the touch's compatibility click is hit-tested, so
// that click lands on whatever lies beneath: a card link, RECORDS, the menu.
// A control that closes on its click (RISING's CLOSE) leaves the second tap of
// a double tap to land there the same way. Swallow pointer input briefly after
// such a press; keyboard presses (detail 0) never call this.
const TAP_THROUGH_GUARD_MS = 450;

export function guardTapThrough() {
  const until = performance.now() + TAP_THROUGH_GUARD_MS;
  const types = ["pointerdown", "mousedown", "click"] as const;
  const swallow = (event: Event) => {
    // A script's own .click() (the Zeus return closing the menu) still runs.
    if (!event.isTrusted) return;
    if (performance.now() > until) return;
    // Enter/Space and assistive activation produce a trusted detail-0 click,
    // not the touch's compatibility click on the control underneath.
    if (event.type === "click" && event instanceof MouseEvent && event.detail === 0) return;
    // A deliberate Ciel burst stays on the same visible control. Permit
    // only that armed button (including its hit-area child), never anything
    // behind it when navigation or the tenth tap removes the original node.
    if (
      typeof Element !== "undefined" &&
      event.target instanceof Element &&
      event.target.closest(
        'button.ciel-button[data-secret-armed="true"], dialog.ciel-inferno[open] :is(button.ciel-inferno-close, button.ciel-inferno-return)',
      )
    )
      return;
    // No focus move, no navigation, no handler below.
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of types) window.addEventListener(type, swallow, { capture: true });
  window.setTimeout(() => {
    for (const type of types) window.removeEventListener(type, swallow, { capture: true });
  }, TAP_THROUGH_GUARD_MS);
}
