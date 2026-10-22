type Segment = { id: string; top: number; span: number };
type ReadingAnchor = { id: string; fraction: number };

/** Keep a semantic position, not an obsolete portrait pixel offset. */
export function rexonanceReadingAnchor(
  segments: readonly Segment[],
  y: number,
): ReadingAnchor | null {
  const segment = [...segments].reverse().find((item) => y >= item.top);
  if (!segment) return null;
  return {
    id: segment.id,
    fraction: Math.max(0, Math.min(1, (y - segment.top) / Math.max(1, segment.span))),
  };
}

export function rexonanceReadingOffset(
  segments: readonly Segment[],
  anchor: ReadingAnchor,
): number | null {
  const segment = segments.find((item) => item.id === anchor.id);
  return segment ? segment.top + segment.span * anchor.fraction : null;
}

/** Width-changing reflow only. Toolbar height changes and pinch zoom never
 * move the reader. The scroll handler only records a number; layout is read
 * after resize/ResizeObserver, not on each scrolling animation frame. */
export function mountRexonanceReadingPosition(page: HTMLElement) {
  let width = innerWidth;
  let y = scrollY;
  let segments: Segment[] = [];
  let frame = 0;
  let restoring = false;
  let disposed = false;
  const measure = () => {
    const sections = [
      // Performance/P14 live inside the persistent hero's script column,
      // not directly under main. Keep those reading chapters as well.
      ...page.querySelectorAll<HTMLElement>(".rxs-section[id], #assembly, #assembly-runway"),
    ]
      .map((el) => ({
        id: el.id,
        top: el.getBoundingClientRect().top + scrollY,
        height: el.offsetHeight,
      }))
      .sort((a, b) => a.top - b.top);
    return sections.map((section, i) => ({
      id: section.id,
      top: section.top,
      span:
        section.id === "assembly-runway"
          ? Math.max(1, section.height - innerHeight)
          : Math.max(1, (sections[i + 1]?.top ?? section.top + section.height) - section.top),
    }));
  };
  const cancel = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    restoring = false;
  };
  const refresh = () => {
    if (restoring || width !== innerWidth || disposed) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      segments = measure();
    });
  };
  const resize = () => {
    if (width === innerWidth || (visualViewport?.scale ?? 1) !== 1) return;
    const anchor = rexonanceReadingAnchor(segments, y);
    width = innerWidth;
    cancel();
    restoring = true;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (disposed) return;
        const next = measure();
        const top = anchor && rexonanceReadingOffset(next, anchor);
        if (typeof top === "number") scrollTo({ top, behavior: "instant" });
        y = scrollY;
        segments = next;
        restoring = false;
      });
    });
  };
  const scroll = () => {
    if (!restoring) y = scrollY;
  };
  // An actual new gesture always wins over restoring the previous one.
  const interrupt = () => {
    if (restoring) {
      cancel();
      y = scrollY;
      refresh();
    }
  };
  segments = measure();
  const observer = new ResizeObserver(refresh);
  observer.observe(page);
  window.addEventListener("resize", resize);
  window.addEventListener("scroll", scroll, { passive: true });
  for (const event of ["touchstart", "wheel", "keydown"] as const)
    window.addEventListener(event, interrupt, { passive: true });
  return () => {
    disposed = true;
    cancel();
    observer.disconnect();
    window.removeEventListener("resize", resize);
    window.removeEventListener("scroll", scroll);
    for (const event of ["touchstart", "wheel", "keydown"] as const)
      window.removeEventListener(event, interrupt);
  };
}
