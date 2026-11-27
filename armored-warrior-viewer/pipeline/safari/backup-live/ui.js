// iOS Safari only applies :active to elements when the document has a touch listener.
// A passive no-op listener turns on the pressed feedback in viewer.css; it never blocks scrolling or gestures.
document.addEventListener('touchstart', () => {}, { passive: true });
