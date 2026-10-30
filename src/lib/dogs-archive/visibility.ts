const BLOCKING_ATTRIBUTES = [
  "data-loading",
  "data-route-cover",
  "data-opening-handoff-active",
  "data-side-menu-open",
  "data-dialog-open",
];

export function isGuardianSceneBlocked(doc: Document) {
  return (
    doc.visibilityState === "hidden" ||
    BLOCKING_ATTRIBUTES.some((name) => {
      const value = doc.documentElement.getAttribute(name);
      return value !== null && value !== "false";
    }) ||
    Boolean(doc.querySelector("dialog[open]"))
  );
}

export function watchGuardianSceneVisibility(update: () => void, doc: Document) {
  const observer = new MutationObserver(update);
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [...BLOCKING_ATTRIBUTES, "open"],
  });
  doc.addEventListener("visibilitychange", update);
  return () => {
    observer.disconnect();
    doc.removeEventListener("visibilitychange", update);
  };
}
