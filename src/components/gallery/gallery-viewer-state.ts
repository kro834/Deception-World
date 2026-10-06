export type GalleryReadingPosition = { top: number; left: number };
export type GalleryViewerRecord = {
  id: string;
  ids: string[];
  position: GalleryReadingPosition;
};

/** Document layout, excluding the frozen body's offset and entrance transforms. */
export function galleryLayoutTop(element: HTMLElement): number {
  const body = element.ownerDocument.body;
  let top = 0;
  for (
    let node: HTMLElement | null = element;
    node && node !== body;
    node = node.offsetParent as HTMLElement | null
  )
    top += node.offsetTop;
  return top;
}

/** History is input, including older deployments and a restored browser session. */
export function readGalleryViewerRecord(value: unknown): GalleryViewerRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<GalleryViewerRecord>;
  if (
    typeof record.id !== "string" ||
    !Array.isArray(record.ids) ||
    !record.ids.length ||
    record.ids.length > 1000 ||
    !record.ids.every((id) => typeof id === "string") ||
    !record.ids.includes(record.id) ||
    !record.position ||
    !Number.isFinite(record.position.top) ||
    !Number.isFinite(record.position.left) ||
    record.position.top < 0 ||
    record.position.left < 0
  )
    return null;
  return { id: record.id, ids: [...new Set(record.ids)], position: { ...record.position } };
}

/** The reading order belongs to this viewing session, not the changing filter. */
export function galleryViewerSequence<T extends { id: string }>(
  available: readonly T[],
  filtered: readonly T[],
  selected: T,
): T[] {
  return filtered.some((work) => work.id === selected.id) ? [...filtered] : [...available];
}

export function galleryAdjacentId(ids: readonly string[], selected: string, step: number) {
  const index = ids.indexOf(selected);
  if (index < 0 || ids.length < 2) return null;
  return ids[(((index + step) % ids.length) + ids.length) % ids.length];
}

export function gallerySwipeStep(
  start: { x: number; y: number; at: number },
  end: { x: number; y: number; at: number },
  width: number,
): -1 | 0 | 1 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Leave edge gestures to browser Back and multi-touch/vertical motion to zoom/scroll.
  if (
    start.x < 24 ||
    start.x > width - 24 ||
    end.at - start.at > 700 ||
    end.at < start.at ||
    Math.abs(dx) < Math.max(60, width * 0.12) ||
    Math.abs(dx) < Math.abs(dy) * 1.6
  )
    return 0;
  return dx < 0 ? 1 : -1;
}

/** Keep the lock until the router settles; restore once, never after the next swipe. */
export function settleGalleryViewerReturn(options: {
  subscribeRendered: (done: () => void) => () => void;
  schedule: (done: () => void) => () => void;
  leaveEntry: () => void;
  finish: () => void;
}) {
  let settled = false;
  let unsubscribe = () => {};
  let cancel = () => {};
  const finish = () => {
    if (settled) return;
    settled = true;
    unsubscribe();
    cancel();
    options.finish();
  };
  unsubscribe = options.subscribeRendered(finish);
  cancel = options.schedule(finish);
  options.leaveEntry();
  return finish;
}
