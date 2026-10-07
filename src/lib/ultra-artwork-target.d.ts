export const ULTRA_FRAME_GUTTER: 12;
export interface UltraArtworkTarget {
  host: HTMLElement;
  image: HTMLImageElement;
  source: string;
  revision: number;
}
export interface UltraArtworkGeometry {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface UltraArtworkMeasurement {
  geometry: UltraArtworkGeometry | null;
  visible: boolean;
  rect: DOMRect;
}
export function watchUltraArtworkTarget(
  notify: (target: UltraArtworkTarget | null) => void,
  doc?: Document,
): () => void;
export function measureUltraArtwork(target: UltraArtworkTarget): UltraArtworkGeometry | null;
export function watchUltraArtworkGeometry(
  target: UltraArtworkTarget,
  notify: (measurement: UltraArtworkMeasurement) => void,
  doc?: Document,
  win?: Window,
): () => void;
