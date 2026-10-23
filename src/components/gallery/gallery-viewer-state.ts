export type GalleryReadingPosition = { top: number; left: number };
export type GalleryViewerMode = "normal" | "shuffle";
export type GalleryViewerRecord = {
  id: string;
  ids: string[];
  position: GalleryReadingPosition;
  mode?: GalleryViewerMode;
};

export type GalleryImageViewport = {
  width: number;
  height: number;
  scrollWidth: number;
  scrollHeight: number;
  left: number;
  top: number;
};

/** Retain the artwork point at the viewport centre when its available space changes. */
export function galleryImageResizePosition(
  previous: GalleryImageViewport | null,
  next: GalleryImageViewport,
  artwork?: { width: number; height: number },
): GalleryReadingPosition {
  const contained = (viewport: GalleryImageViewport | null) => {
    const width = viewport?.scrollWidth ?? 0;
    const height = viewport?.scrollHeight ?? 0;
    if (!artwork || artwork.width <= 0 || artwork.height <= 0) return { width, height };
    const scale = Math.min(width / artwork.width, height / artwork.height);
    return { width: artwork.width * scale, height: artwork.height * scale };
  };
  const before = contained(previous);
  const after = contained(next);
  const axis = (
    previousSize: number,
    previousExtent: number,
    previousOffset: number,
    previousImage: number,
    size: number,
    extent: number,
    image: number,
  ) => {
    const centre =
      previousImage > 0
        ? (previousOffset + previousSize / 2 - (previousExtent - previousImage) / 2) / previousImage
        : 0.5;
    return Math.max(0, Math.min(extent - size, (extent - image) / 2 + centre * image - size / 2));
  };
  return {
    left: axis(
      previous?.width ?? 0,
      previous?.scrollWidth ?? 0,
      previous?.left ?? 0,
      before.width,
      next.width,
      next.scrollWidth,
      after.width,
    ),
    top: axis(
      previous?.height ?? 0,
      previous?.scrollHeight ?? 0,
      previous?.top ?? 0,
      before.height,
      next.height,
      next.scrollHeight,
      after.height,
    ),
  };
}

export function galleryImagePanPosition(
  viewport: GalleryImageViewport,
  key: string,
): GalleryReadingPosition | null {
  const horizontal = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
  const vertical = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
  if (!horizontal && !vertical) return null;
  return {
    left: Math.max(
      0,
      Math.min(
        viewport.scrollWidth - viewport.width,
        viewport.left + horizontal * Math.max(40, Math.min(120, viewport.width * 0.15)),
      ),
    ),
    top: Math.max(
      0,
      Math.min(
        viewport.scrollHeight - viewport.height,
        viewport.top + vertical * Math.max(40, Math.min(120, viewport.height * 0.15)),
      ),
    ),
  };
}

export function galleryImageRetrySource(source: string, attempt: number): string {
  if (!attempt) return source;
  const hash = source.indexOf("#");
  const url = hash < 0 ? source : source.slice(0, hash);
  const fragment = hash < 0 ? "" : source.slice(hash);
  return `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}${fragment}`;
}

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

export function galleryRevealDelta(
  control: { top: number; bottom: number },
  viewport: { top: number; bottom: number },
): number {
  if (control.top < viewport.top) return control.top - viewport.top;
  return Math.max(0, control.bottom - viewport.bottom);
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
    (record.mode !== undefined && record.mode !== "normal" && record.mode !== "shuffle") ||
    !record.position ||
    !Number.isFinite(record.position.top) ||
    !Number.isFinite(record.position.left) ||
    record.position.top < 0 ||
    record.position.left < 0
  )
    return null;
  return {
    id: record.id,
    ids: [...new Set(record.ids)],
    position: { ...record.position },
    ...(record.mode === undefined ? {} : { mode: record.mode }),
  };
}

/** The reading order belongs to this viewing session, not the changing filter. */
export function galleryViewerSequence<T extends { id: string }>(
  available: readonly T[],
  filtered: readonly T[],
  selected: T,
): T[] {
  return filtered.some((work) => work.id === selected.id) ? [...filtered] : [...available];
}

export function galleryAdjacentId(
  ids: readonly string[],
  selected: string,
  step: number,
  mode: GalleryViewerMode = "normal",
) {
  const index = ids.indexOf(selected);
  if (index < 0 || ids.length < 2) return null;
  if (mode === "shuffle") return ids[index + step] ?? null;
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
