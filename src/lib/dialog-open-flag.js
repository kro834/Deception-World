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
//
// A dialog opened by script is flagged earlier still. showModal() and show()
// run the dialog focusing steps, which update style at once; the observer's
// microtask comes after them, so the gate change cost a second
// whole-document style update on every open (pickup and RISING INP up 15-20%
// at 4x CPU). The wrappers raise the flag before the original runs, so both
// changes land in the one update, then re-read the page in case it threw.

const ATTRIBUTE = "data-dialog-open";
const OPENERS = /** @type {const} */ (["showModal", "show"]);

/**
 * @param {Document} doc
 * @param {() => void} raise
 * @param {() => void} sync
 */
function flagScriptedOpens(doc, raise, sync) {
  const proto = doc.defaultView?.HTMLDialogElement?.prototype;
  if (!proto) return () => {};
  /** @type {Map<string, { original: Function, wrapper: Function }>} */
  const wrapped = new Map();
  for (const name of OPENERS) {
    const original = proto[name];
    if (typeof original !== "function") continue;
    /** @this {HTMLDialogElement} @param {unknown[]} args */
    const wrapper = function (...args) {
      raise();
      try {
        return original.apply(this, args);
      } finally {
        sync();
      }
    };
    proto[name] = wrapper;
    wrapped.set(name, { original, wrapper });
  }
  return () => {
    for (const [name, { original, wrapper }] of wrapped) {
      if (proto[name] === wrapper) proto[name] = original;
    }
  };
}

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
  const restoreOpeners = flagScriptedOpens(
    doc,
    () => {
      if (!root.hasAttribute(ATTRIBUTE)) root.toggleAttribute(ATTRIBUTE, true);
    },
    sync,
  );
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
    restoreOpeners();
    root.removeAttribute(ATTRIBUTE);
  };
}
