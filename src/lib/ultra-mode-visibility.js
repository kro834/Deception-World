export const ULTRA_BLOCKING_ATTRIBUTES = [
  "data-loading",
  "data-route-cover",
  "data-opening-handoff-active",
  "data-side-menu-open",
  "data-dialog-open",
];

/** Keep shader compilation out of navigation covers and locked UI.
 * @param {Document} doc
 */
export function isUltraSceneBlocked(doc) {
  const root = doc.documentElement;
  return (
    doc.visibilityState === "hidden" ||
    ULTRA_BLOCKING_ATTRIBUTES.some((name) => {
      const value = root.getAttribute(name);
      return value !== null && value !== "false";
    })
  );
}

/** Observe only the established root flags, never the animated page subtree.
 * @param {(blocked: boolean) => void} notify
 * @param {Document} [doc]
 */
export function watchUltraSceneVisibility(notify, doc = document) {
  let previous;
  const update = () => {
    const blocked = isUltraSceneBlocked(doc);
    if (blocked !== previous) {
      previous = blocked;
      notify(blocked);
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ULTRA_BLOCKING_ATTRIBUTES,
  });
  doc.addEventListener("visibilitychange", update);
  update();
  return () => {
    observer.disconnect();
    doc.removeEventListener("visibilitychange", update);
  };
}
