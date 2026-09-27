export type ZeusPoint = { x: number; y: number };
export type ZeusBounds = { minX: number; maxX: number; minY: number; maxY: number };
export type ZeusDragGeometry = {
  origin: ZeusPoint;
  grab: ZeusPoint;
  bounds: ZeusBounds;
  scale: ZeusPoint;
  viewport: { width: number; height: number; offsetLeft: number; offsetTop: number };
};

export function clampZeusCenter(x: number, y: number, bounds: ZeusBounds): ZeusPoint {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, y)),
  };
}

/** No layout reads: one viewport/containing-block snapshot per held gesture. */
export function getZeusDragPosition(geometry: ZeusDragGeometry, x: number, y: number) {
  const center = clampZeusCenter(x - geometry.grab.x, y - geometry.grab.y, geometry.bounds);
  return {
    center,
    translate: {
      x: (center.x - geometry.origin.x) / geometry.scale.x,
      y: (center.y - geometry.origin.y) / geometry.scale.y,
    },
    normalized: {
      x: (center.x - geometry.viewport.offsetLeft) / geometry.viewport.width,
      y: (center.y - geometry.viewport.offsetTop) / geometry.viewport.height,
    },
  };
}
