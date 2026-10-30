/** A finite, interruptible arrival for committed archive selections.
 * The panel keeps its layout; keyboard focus settles its moving cards at once.
 * @param {HTMLElement | null} panel
 * @param {number} direction
 */
export function animateSelectionArrival(panel, direction = 1) {
  const view = panel?.ownerDocument.defaultView;
  if (!panel || !view || typeof panel.animate !== "function") return () => {};
  const doc = panel.ownerDocument;
  const reduced = view.matchMedia("(prefers-reduced-motion: reduce)");
  const allowed = () =>
    !doc.hidden &&
    !reduced.matches &&
    doc.documentElement.getAttribute("data-world-effects") !== "economy";
  if (!allowed()) return () => {};
  const bounds = panel.getBoundingClientRect();
  if (bounds.bottom <= 0 || bounds.top >= view.innerHeight) return () => {};
  const cards = [...panel.querySelectorAll(".manager-slot-grid > a, .other-archive-grid > a")];
  const targets = cards.length ? cards.slice(0, 8) : [...panel.children].slice(0, 6);
  const animations = targets.map((target, index) =>
    target.animate(
      [
        {
          opacity: 0.2,
          transform: `perspective(900px) translate3d(${direction * 36}px, 28px, 0) rotateY(${direction * 6}deg) scale(.94)`,
        },
        { opacity: 1, transform: "perspective(900px) translate3d(0, 0, 0) rotateY(0deg) scale(1)" },
      ],
      { duration: 560, delay: index * 42, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" },
    ),
  );
  const cancel = () => animations.forEach((animation) => animation.cancel());
  const policy = () => {
    if (!allowed()) cancel();
  };
  const observer = new view.MutationObserver(policy);
  observer.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ["data-world-effects"],
  });
  reduced.addEventListener("change", policy);
  doc.addEventListener("visibilitychange", policy);
  panel.addEventListener("focusin", cancel);
  return () => {
    cancel();
    observer.disconnect();
    reduced.removeEventListener("change", policy);
    doc.removeEventListener("visibilitychange", policy);
    panel.removeEventListener("focusin", cancel);
  };
}
