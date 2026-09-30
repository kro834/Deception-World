import { useEffect } from "react";

export function ContentProtection() {
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (target instanceof HTMLInputElement) {
        return (
          !target.matches(":disabled") &&
          !target.readOnly &&
          ["text", "search", "email", "url", "tel", "password", "number"].includes(target.type)
        );
      }
      if (target instanceof HTMLTextAreaElement) {
        return !target.matches(":disabled") && !target.readOnly;
      }
      return target instanceof HTMLElement && target.isContentEditable;
    };
    const preventClipboardAction = (event: Event) => {
      // Editing the user's own input must retain normal clipboard and menus.
      // Artwork/text dragging stays protected even inside an editable field.
      if (event.type !== "dragstart" && isEditableTarget(event.target)) return;
      event.preventDefault();
    };
    const preventClipboardShortcut = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
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
