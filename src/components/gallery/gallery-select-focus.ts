import type { FocusEvent, KeyboardEvent, PointerEvent } from "react";

// Native iOS pickers can close without change or blur (Cancel / same option).
// Keep their pointer modality until blur or keyboard input, without moving focus.
export const gallerySelectFocus = {
  "data-gallery-select": "true",
  onPointerDown(event: PointerEvent<HTMLSelectElement>) {
    event.currentTarget.dataset.pointerFocus = "true";
  },
  onKeyDown(event: KeyboardEvent<HTMLSelectElement>) {
    delete event.currentTarget.dataset.pointerFocus;
  },
  onBlur(event: FocusEvent<HTMLSelectElement>) {
    delete event.currentTarget.dataset.pointerFocus;
  },
};
