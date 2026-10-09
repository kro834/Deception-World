/** When "/" or Ctrl/⌘+K may open the quick search. Pure, for the root host. */
export type ShortcutEvent = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  repeat?: boolean;
};

export function isQuickSearchShortcut(event: ShortcutEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat) return false;
  if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey) return true;
  return (
    (event.key === "k" || event.key === "K") &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey
  );
}

/** Typing places: fields, editable text and anything inside a dialog. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  return Boolean(
    element.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], dialog, [role="dialog"], [role="alertdialog"]',
    ),
  );
}

/** The opening (title) route, a load cover, an open dialog or the open side
 * menu all keep the page's own keys. */
export function quickSearchBlocked(doc: Document, pathname: string): boolean {
  if (pathname === "/") return true;
  const root = doc.documentElement;
  if (root.hasAttribute("data-dialog-open") || root.hasAttribute("data-loading")) return true;
  if (doc.querySelector('#site-side-panel[data-open="true"]')) return true;
  return Boolean(
    doc.querySelector(
      'dialog[open], [role="dialog"][aria-modal="true"]:not([aria-hidden="true"]):not(#site-side-panel)',
    ),
  );
}
