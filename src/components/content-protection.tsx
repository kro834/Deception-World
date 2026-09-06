import { useEffect } from "react";

export function ContentProtection() {
  useEffect(() => {
    const preventClipboardAction = (event: Event) => {
      event.preventDefault();
    };
    const preventClipboardShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isClipboardShortcut =
        ((event.ctrlKey || event.metaKey) && (key === "c" || key === "x" || key === "v")) ||
        (key === "insert" && (event.ctrlKey || event.shiftKey));
      if (!isClipboardShortcut) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("copy", preventClipboardAction, true);
    document.addEventListener("cut", preventClipboardAction, true);
    document.addEventListener("paste", preventClipboardAction, true);
    document.addEventListener("contextmenu", preventClipboardAction, true);
    document.addEventListener("dragstart", preventClipboardAction, true);
    // Selection/callout protection belongs to CSS. Cancelling selection at the
    // document level can interfere with a native text-origin pan on WebKit.
    document.addEventListener("keydown", preventClipboardShortcut, true);

    return () => {
      document.removeEventListener("copy", preventClipboardAction, true);
      document.removeEventListener("cut", preventClipboardAction, true);
      document.removeEventListener("paste", preventClipboardAction, true);
      document.removeEventListener("contextmenu", preventClipboardAction, true);
      document.removeEventListener("dragstart", preventClipboardAction, true);
      document.removeEventListener("keydown", preventClipboardShortcut, true);
    };
  }, []);

  return null;
}
