/**
 * WebKit can temporarily report pageTop and window.scrollY in different
 * coordinate spaces while the software keyboard pans the visual viewport.
 * offsetTop/offsetLeft are the direct visual-viewport coordinates, so prefer
 * them and only use the derived page coordinate when the direct value is not
 * available. A negative correction must never move the full-screen AI shell
 * above the visible iPhone viewport.
 */
export function resolveArchiveViewportOffset(
  directOffset: number | undefined,
  pageOffset: number | undefined,
  scrollOffset: number,
): number {
  if (Number.isFinite(directOffset)) return Math.max(0, Number(directOffset));
  if (Number.isFinite(pageOffset) && Number.isFinite(scrollOffset)) {
    return Math.max(0, Number(pageOffset) - scrollOffset);
  }
  return 0;
}
