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
    // No focus move, no navigation, no handler below.
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of types) window.addEventListener(type, swallow, { capture: true });
  window.setTimeout(() => {
    for (const type of types) window.removeEventListener(type, swallow, { capture: true });
  }, TAP_THROUGH_GUARD_MS);
}
