/** Height changes smaller than this with an unchanged width come from the mobile URL bar. */
export const TOOLBAR_RESIZE_TOLERANCE = 160;

/**
 * Chrome Android and Samsung Internet fire `resize` (and `visualViewport` `resize`)
 * when the URL bar collapses or returns at the start of a scroll. Handlers that read
 * layout should skip those toolbar-only changes; rotation, split screen, zoom and the
 * soft keyboard still change the width or move the height by more than the tolerance.
 * Returns a filter that reports whether the current viewport change is significant.
 *
 * The baseline is taken at the first call, not at creation: callers create the
 * filter in a mount effect, right after style writes, where reading the
 * viewport forced a style and layout pass. The first call only records it and
 * reports false, so it takes the caller's settle path (a short timer) instead
 * of measuring layout in the middle of a scroll.
 */
export function createViewportResizeFilter() {
  const read = () => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
    scale: window.visualViewport?.scale ?? 1,
  });
  let last: ReturnType<typeof read> | null = null;
  return () => {
    const next = read();
    if (!last) {
      last = next;
      return false;
    }
    if (
      Math.abs(next.width - last.width) < 1 &&
      next.scale === last.scale &&
      Math.abs(next.height - last.height) < TOOLBAR_RESIZE_TOLERANCE
    )
      return false;
    last = next;
    return true;
  };
}
