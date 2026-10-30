/** View presets and camera framing for the Rexonance viewer. Pure math (no three.js), so
 * the framing can be tested in node and reused by a standalone page.
 *
 * Frame: glTF, +Y up, the suit faces +Z and its left hand is +X (README "Frame").
 * Azimuth is measured from +Z toward +X, so 0 looks at the front and +90 at the suit's
 * own left side (左側面, the sheet's left-08); -90 is its right side (右側面, right-07). */

export type RexonanceViewId = "front" | "right" | "back" | "left" | "oblique";

export type RexonanceView = {
  id: RexonanceViewId;
  label: string;
  /** Degrees from +Z toward +X. */
  azimuth: number;
  /** Degrees above the horizon. */
  elevation: number;
  /** The owner's sheet this view is compared with (public/rexonance-3d-20261030/reference). */
  reference: string;
};

export const REXONANCE_VIEWS: readonly RexonanceView[] = [
  { id: "front", label: "正面", azimuth: 0, elevation: 2, reference: "front-10" },
  { id: "right", label: "右側面", azimuth: -90, elevation: 2, reference: "right-07" },
  { id: "back", label: "背面", azimuth: 180, elevation: 2, reference: "back-09" },
  { id: "left", label: "左側面", azimuth: 90, elevation: 2, reference: "left-08" },
  { id: "oblique", label: "斜め", azimuth: 36, elevation: 9, reference: "front-10" },
];

export const REXONANCE_DEFAULT_VIEW: RexonanceViewId = "oblique";

export function rexonanceView(id: string | null | undefined): RexonanceView {
  return (
    REXONANCE_VIEWS.find((view) => view.id === id) ??
    REXONANCE_VIEWS.find((view) => view.id === REXONANCE_DEFAULT_VIEW)!
  );
}

export type Vec3 = [number, number, number];

/** Unit vector from the orbit target toward the camera. */
export function rexonanceViewDirection(azimuth: number, elevation: number): Vec3 {
  const a = (azimuth * Math.PI) / 180;
  const e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

export type FrameBox = { min: Vec3; max: Vec3 };

export type FrameInsets = {
  /** Fractions of the viewport kept clear of the figure (toolbar, captions). */
  top: number;
  bottom: number;
  side: number;
};

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const length = Math.hypot(...a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

/** The camera distance from `target` along `direction` at which every corner of `box` fits
 * inside the viewport minus its insets (perspective, vertical `fov` in degrees). The figure
 * is then shifted on screen with a view offset, not by moving the orbit target, so it
 * still turns about its own axis. */
export function rexonanceFitDistance(
  box: FrameBox,
  target: Vec3,
  direction: Vec3,
  fov: number,
  aspect: number,
  insets: FrameInsets = { top: 0, bottom: 0, side: 0 },
): number {
  const forward = normalize(direction);
  const worldUp: Vec3 = Math.abs(forward[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0];
  const right = normalize(cross(worldUp, forward));
  const up = cross(forward, right);
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  // The clear band: the figure fits the remaining height, centred in it.
  const usableV = Math.max(0.2, 1 - insets.top - insets.bottom);
  const usableH = Math.max(0.2, 1 - insets.side * 2);
  let distance = 0;
  for (const x of [box.min[0], box.max[0]])
    for (const y of [box.min[1], box.max[1]])
      for (const z of [box.min[2], box.max[2]]) {
        const corner: Vec3 = [x - target[0], y - target[1], z - target[2]];
        const depth = dot(corner, forward);
        distance = Math.max(
          distance,
          Math.abs(dot(corner, right)) / (tanH * usableH) + depth,
          Math.abs(dot(corner, up)) / (tanV * usableV) + depth,
        );
      }
  return distance;
}

/** Vertical view offset in pixels that centres the figure in the band between the insets
 * (positive moves the picture up). */
export function rexonanceViewOffsetY(height: number, insets: FrameInsets) {
  return ((insets.bottom - insets.top) / 2) * height;
}

/** Insets for a viewport: the toolbar row(s) at the bottom and the record caption at the
 * top take more of a short phone screen than of a desktop one. */
export function rexonanceFrameInsets(width: number, height: number): FrameInsets {
  const narrow = width < 560;
  const toolbar = narrow ? 132 : 92;
  const caption = narrow ? 64 : 40;
  return {
    top: Math.min(0.2, caption / Math.max(1, height)),
    bottom: Math.min(0.3, toolbar / Math.max(1, height)),
    side: narrow ? 0.03 : 0.06,
  };
}

/** Orbit limits from the fitted distance: close enough to read a gem, far enough to see the
 * whole figure with room around it; never under the floor or straight down on the crown. */
export function rexonanceOrbitLimits(fitDistance: number) {
  return {
    minDistance: Math.max(0.35, fitDistance * 0.22),
    maxDistance: fitDistance * 1.65,
    minPolarAngle: 0.18,
    maxPolarAngle: Math.PI / 2 + 0.32,
  };
}
