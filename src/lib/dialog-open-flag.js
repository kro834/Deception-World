// `html[data-dialog-open]` mirrors "a <dialog> is open anywhere in the page".
//
// The World sheets switch their scroll choreography off while a dialog is
// open (a locked <body> becomes a scroll container, and every view timeline
// would rebind to it). They used to ask `html:not(:has(dialog[open]))`, but a
// :has() on <html> in front of a descendant combinator makes every DOM
// insertion or removal (a poster tick, a React commit, a lazy <link>)
// re-evaluate it and restyle the whole document: 7 whole-document recalcs per
// scroll pass and 34-55 ms per dialog insert at 4x CPU. A leaf attribute on
// <html> invalidates only the rules that name it.
//
// sync() runs in the MutationObserver's microtask, so the attribute is set
// before the next rendering update and no frame is drawn with a stale gate.
// Do not defer it to requestAnimationFrame.

const ATTRIBUTE = "data-dialog-open";

/** @param {Node} node */
const holdsDialog = (node) =>
  node.nodeType === 1 &&
  (node.nodeName === "DIALOG" || /** @type {Element} */ (node).querySelector?.("dialog") != null);

/**
 * Keep `html[data-dialog-open]` in step with `dialog[open]` and return a
 * disposer. showModal() and close() toggle `open` synchronously; React
 * inserting or removing a dialog is caught by childList.
 * @param {Document} [doc]
 */
export function watchOpenDialogs(doc = document) {
  const root = doc.documentElement;
  const sync = () => {
    const open = doc.querySelector("dialog[open]") !== null;
    if (open !== root.hasAttribute(ATTRIBUTE)) root.toggleAttribute(ATTRIBUTE, open);
  };
  sync();
  const observer = new MutationObserver((records) => {
    // Only records that can change the answer: an `open` attribute, or a
    // subtree holding a dialog added or removed.
    for (const record of records) {
      if (
        record.type === "attributes" ||
        Array.prototype.some.call(record.addedNodes, holdsDialog) ||
        Array.prototype.some.call(record.removedNodes, holdsDialog)
      ) {
        sync();
        return;
      }
    }
  });
  observer.observe(doc.body ?? root, {
    attributes: true,
    attributeFilter: ["open"],
    childList: true,
    subtree: true,
  });
  return () => {
    observer.disconnect();
    root.removeAttribute(ATTRIBUTE);
  };
}
