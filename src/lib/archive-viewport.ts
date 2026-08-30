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

export const ARCHIVE_IOS_KEYBOARD_FALLBACK_PX = 336;
export const ARCHIVE_IOS_KEYBOARD_COMPACT_MAX = 760;
export const ARCHIVE_IOS_KEYBOARD_PAN_PX = 48;

/**
 * iPhone Japanese keyboards occupy about 40% of the portrait layout. Apply this
 * before focus completes so Safari does not pan the visual viewport.
 */
export function estimateArchiveIosKeyboardInset(layoutHeight: number): number {
  const height = Math.max(0, Math.round(layoutHeight));
  return Math.round(Math.min(440, Math.max(ARCHIVE_IOS_KEYBOARD_FALLBACK_PX, height * 0.4)));
}

/**
 * Bottom occlusion in layout coordinates. Never subtract offsetTop: iOS 26 can
 * leave visualViewport.offsetTop stuck after dismiss, and using it while Safari
 * has already panned double-shifts the composer to the top of the screen.
 */
export function measureArchiveIosKeyboardInset(
  layoutHeight: number,
  visualHeight: number,
): number {
  return Math.max(0, Math.round(layoutHeight - visualHeight));
}

export function archiveIosVisualViewportPanned(offsetTop: number): boolean {
  return offsetTop > ARCHIVE_IOS_KEYBOARD_PAN_PX;
}