// Liquid glass: the curvature of each control (owner, 2026-11-01:
// 「ガラスの湾曲はfableで作って」). The pure half: from a control's box and
// corner radius to the pixels of
// - its displacement map (the lens): a convex bezel of glass around a flat
//   centre, as iOS 26's Liquid Glass. The outline is the control's own
//   corner family (owner, 2026-11-02: 「ボタンの形を大きく変更して」): a
//   capsule or circle keeps circular corners; a slab wears continuous
//   (squircle: superellipse, exponent 4) corners, the sheet's
//   corner-shape: squircle, and the field here is that superellipse, so
//   the bezel follows the painted outline and not a rounded rectangle. The bezel's height function gives a
//   surface normal at every pixel; a ray from the eye refracts into the
//   glass by Snell's law and leaves the back face displaced inward, so at
//   the rim the backdrop is pulled in and magnified, and in the flat centre
//   nothing moves. Red bends x, green bends y, mid-grey rests, scaled to the
//   control's box (feDisplacementMap in primitiveUnits="objectBoundingBox");
// - its rim light: the same normals lit from the glass's light direction
//   (a thin specular line at both ends of the light axis, the lit end
//   brighter, a faint dark hairline at the very edge and a warm/cool
//   dispersion fringe strongest on the diagonals), drawn
//   as a background layer on every engine, so Safari and Firefox, which
//   draw no url() backdrop, still read the bezel's curve. It is the edge:
//   the glass wears no border line.
//
// Nothing here touches the DOM (src/lib/liquid-glass-curvature.ts does); the
// same shape always gives the same bytes, and shapes are quantised so a
// handful of maps serve a page of controls.

/** Bump when the maths changes: the keys (and so the filter ids) change with it. */
export const CURVATURE_VERSION = 3;

/** Glass: n = 1.5 (crown glass; iOS's material refracts about this much). */
export const GLASS_INDEX = 1.5;

/** Box sizes are filed in 4px steps and radii in 2px steps. */
export const SIZE_STEP = 4;
export const RADIUS_STEP = 2;

/** The displacement map's longest side, in samples (stretched over the box). */
export const LENS_MAP_MAX = 256;
/** The rim image's longest side, in device pixels. */
export const RIM_MAP_MAX = 768;

/** Light from the upper left (the sheet's --lg-lx / --lg-ly rest values). */
export const LIGHT = { x: -0.55, y: -1, z: 0.9 } as const;

/** The corner family: circular arcs, or the squircle's superellipse. */
export type Corner = "round" | "squircle";

/** The squircle: |x|^n + |y|^n = r^n (CSS corner-shape: squircle). */
export const SQUIRCLE_EXPONENT = 4;

export interface LensShape {
  corner: Corner;
  /** CSS px, quantised. */
  width: number;
  height: number;
  /** CSS px, quantised and clamped to the box's half-minor. */
  radius: number;
  /** 1 or 2: the rim image's density. */
  dpr: number;
}

export interface SurfaceMaps {
  shape: LensShape;
  /** The displacement map: cols × rows RGBA (R bends x, G bends y). */
  lens: { cols: number; rows: number; data: Uint8ClampedArray };
  /** feDisplacementMap's scale (a fraction of the box) that decodes `lens`. */
  scale: number;
  /** The largest shift the lens makes, CSS px. */
  maxShift: number;
  /** The rim light: cols × rows RGBA, white and black over transparency. */
  rim: { cols: number; rows: number; data: Uint8ClampedArray };
  /** The bezel's width, CSS px. */
  bezel: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Quantises a measured box to the shape that keys its maps. */
export function quantizeShape(
  width: number,
  height: number,
  radius: number,
  dpr = 1,
  corner: Corner = "round",
): LensShape {
  const w = Math.max(SIZE_STEP * 2, Math.round(width / SIZE_STEP) * SIZE_STEP);
  const h = Math.max(SIZE_STEP * 2, Math.round(height / SIZE_STEP) * SIZE_STEP);
  const half = Math.min(w, h) / 2;
  const r = clamp(Math.round(radius / RADIUS_STEP) * RADIUS_STEP, 0, half);
  return { corner: r > 0 ? corner : "round", width: w, height: h, radius: r, dpr: dpr >= 1.5 ? 2 : 1 };
}

/** The corner family a computed corner-shape names (unsupported: round). */
export function cornerOf(cornerShape: string): Corner {
  const value = cornerShape.trim();
  if (/\bsquircle\b/.test(value)) return "squircle";
  const k = /superellipse\(\s*(-?[\d.]+)/.exec(value);
  return k && Number(k[1]) >= 1.5 ? "squircle" : "round";
}

/** The key a shape's maps are cached and its filter is named by. */
export function curvatureKey(shape: LensShape) {
  const c = shape.corner === "squircle" ? "sq" : "rd";
  return `v${CURVATURE_VERSION}-${c}-w${shape.width}-h${shape.height}-r${shape.radius}-x${shape.dpr}`;
}

/**
 * The bezel: the band of curved glass inside the rim. Thick, as a slab of
 * glass is: most of the corner's radius on a pill, well over a third of
 * the half-height on a slab, never under 5px or over 18px.
 */
export function bezelFor(shape: Pick<LensShape, "width" | "height" | "radius">) {
  const half = Math.min(shape.width, shape.height) / 2;
  const fromRadius = shape.radius * 0.62;
  const fromBox = half * 0.42;
  return clamp(Math.max(fromRadius, fromBox), 5, 18);
}

/**
 * Signed distance inward from the rounded rectangle's edge at (x, y),
 * CSS px, and the outward direction there. Positive inside.
 */
export function roundedRectField(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): { inside: number; nx: number; ny: number } {
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;
  const px = x - width / 2;
  const py = y - height / 2;
  const qx = Math.abs(px) - hx;
  const qy = Math.abs(py) - hy;
  let outside: number;
  let nx: number;
  let ny: number;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy) || 1;
    outside = len - radius;
    nx = (qx / len) * Math.sign(px || 1);
    ny = (qy / len) * Math.sign(py || 1);
  } else if (qx > qy) {
    outside = qx - radius;
    nx = Math.sign(px || 1);
    ny = 0;
  } else {
    outside = qy - radius;
    nx = 0;
    ny = Math.sign(py || 1);
  }
  return { inside: -outside, nx, ny };
}

/**
 * The same field for a squircle: each corner is the superellipse
 * |x|^4 + |y|^4 = r^4 (tangent to both edges, fuller than a circle), the
 * edges straight. The distance is measured along the corner's ray and
 * projected onto the curve's normal (exact on the edges and on the
 * diagonal, within a few percent between, which the bezel's width hides).
 */
export function squircleField(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): { inside: number; nx: number; ny: number } {
  if (radius <= 0) return roundedRectField(x, y, width, height, 0);
  const hx = width / 2 - radius;
  const hy = height / 2 - radius;
  const px = x - width / 2;
  const py = y - height / 2;
  const qx = Math.abs(px) - hx;
  const qy = Math.abs(py) - hy;
  if (qx >= 0 && qy >= 0) {
    const len = Math.hypot(qx, qy);
    const sx = Math.sign(px || 1);
    const sy = Math.sign(py || 1);
    if (len < 1e-6) return { inside: radius, nx: sx * Math.SQRT1_2, ny: sy * Math.SQRT1_2 };
    const u = qx / radius;
    const v = qy / radius;
    const n = SQUIRCLE_EXPONENT;
    // The ray from the corner's centre meets the curve at len / s.
    const s = Math.pow(Math.pow(u, n) + Math.pow(v, n), 1 / n);
    const ux = qx / len;
    const uy = qy / len;
    // The curve's normal there: the gradient of |x|^n + |y|^n.
    let gx = Math.pow(u, n - 1);
    let gy = Math.pow(v, n - 1);
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl;
    gy /= gl;
    const cos = Math.max(0.2, ux * gx + uy * gy);
    // Deep inside the corner (past the bezel, where nothing is drawn) the
    // ray overshoots the nearest point, which is a radius away on an edge.
    const outside = Math.max(-radius, len * (1 - 1 / s) * cos);
    return { inside: -outside, nx: gx * sx, ny: gy * sy };
  }
  return roundedRectField(x, y, width, height, radius);
}

/** The field of a shape: its corner family's. */
export function shapeField(shape: LensShape, x: number, y: number) {
  return shape.corner === "squircle"
    ? squircleField(x, y, shape.width, shape.height, shape.radius)
    : roundedRectField(x, y, shape.width, shape.height, shape.radius);
}

/**
 * The bezel's profile: t is 0 at the rim and 1 where the flat centre
 * starts. The convex squircle, h = (1 - (1 - t)^4)^(1/4): the profile
 * Apple's glass is read to favour (kube.io's teardown, 2025-10): it stays
 * almost flat across most of the bezel and turns down only near the rim,
 * so the refraction gathers in a thin band at the edge (the bezel reads
 * optically thinner than it is) and the flat join has no crease. Returns
 * height (0..1) and its slope toward the rim (negative: the surface falls
 * away toward the rim).
 */
export function bezelProfile(t: number): { height: number; slope: number } {
  if (t >= 1) return { height: 1, slope: 0 };
  if (t <= 0) return { height: 0, slope: -8 };
  const u = 1 - t;
  const u4 = u * u * u * u;
  const height = Math.pow(1 - u4, 0.25);
  // dh/dt = u^3 (1 - u^4)^(-3/4), capped at the rim's vertical wall.
  const slope = -Math.min(8, (u * u * u) / Math.pow(Math.max(1e-3, 1 - u4), 0.75));
  return { height, slope };
}

/**
 * How far a vertical ray is shifted when it enters a surface tilted by
 * `tilt` radians and crosses `thickness` of glass: Snell, then the
 * geometry of the slab. CSS px.
 */
export function refractionShift(tilt: number, thickness: number, index = GLASS_INDEX) {
  const sinT = Math.sin(tilt) / index;
  const refracted = Math.asin(clamp(sinT, -1, 1));
  return thickness * Math.tan(tilt - refracted);
}

/**
 * The maps for a shape. Deterministic: the same shape gives the same bytes.
 */
export function surfaceMaps(shape: LensShape): SurfaceMaps {
  const { width, height } = shape;
  const bezel = bezelFor(shape);
  // The bezel's crest: the glass is a little thicker than the bezel is wide.
  const thickness = bezel * 1.15;

  // The lens is sampled once per CSS px, no wider than LENS_MAP_MAX.
  const lensStep = Math.max(1, Math.max(width, height) / LENS_MAP_MAX);
  const lensCols = Math.max(2, Math.round(width / lensStep));
  const lensRows = Math.max(2, Math.round(height / lensStep));
  const shiftX = new Float32Array(lensCols * lensRows);
  const shiftY = new Float32Array(lensCols * lensRows);
  let maxShift = 0;

  for (let row = 0; row < lensRows; row++) {
    const y = ((row + 0.5) / lensRows) * height;
    for (let col = 0; col < lensCols; col++) {
      const x = ((col + 0.5) / lensCols) * width;
      const field = shapeField(shape, x, y);
      if (field.inside <= 0 || field.inside >= bezel) continue;
      const t = field.inside / bezel;
      const { slope } = bezelProfile(t);
      // The surface rises inward by thickness × slope per bezel width.
      const grad = (-slope * thickness) / bezel;
      const tilt = Math.atan(grad);
      const shift = refractionShift(tilt, thickness);
      // The refracted ray bends toward the centre: sample inward.
      const i = row * lensCols + col;
      shiftX[i] = -field.nx * shift;
      shiftY[i] = -field.ny * shift;
      if (shift > maxShift) maxShift = shift;
    }
  }

  // feDisplacementMap: x' = x + scale × width × (R − ½), y' = y + scale ×
  // height × (G − ½). One scale serves both axes, so it is set by the axis
  // that needs the larger fraction of its side, with a little headroom.
  const need = Math.max(maxShift / width, maxShift / height);
  const scale = Math.max(0.01, Math.ceil(need * 2.1 * 1000) / 1000);
  const lens = new Uint8ClampedArray(lensCols * lensRows * 4);
  for (let i = 0; i < lensCols * lensRows; i++) {
    const r = 0.5 + shiftX[i] / (scale * width);
    const g = 0.5 + shiftY[i] / (scale * height);
    lens[i * 4] = Math.round(clamp(r, 0, 1) * 255);
    lens[i * 4 + 1] = Math.round(clamp(g, 0, 1) * 255);
    lens[i * 4 + 2] = 128;
    lens[i * 4 + 3] = 255;
  }

  // The rim light, at device density, no wider than RIM_MAP_MAX.
  const rimScale = Math.min(shape.dpr, RIM_MAP_MAX / Math.max(width, height));
  const rimCols = Math.max(2, Math.round(width * rimScale));
  const rimRows = Math.max(2, Math.round(height * rimScale));
  const rim = new Uint8ClampedArray(rimCols * rimRows * 4);
  const lightLen = Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z);
  const lx = LIGHT.x / lightLen;
  const ly = LIGHT.y / lightLen;
  const lz = LIGHT.z / lightLen;
  // Blinn's half vector between the light and the eye (0, 0, 1).
  const hLen = Math.hypot(lx, ly, lz + 1);
  const hx = lx / hLen;
  const hy = ly / hLen;
  const hz = (lz + 1) / hLen;
  const lightSide = Math.hypot(LIGHT.x, LIGHT.y);
  const sx = LIGHT.x / lightSide;
  const sy = LIGHT.y / lightSide;

  for (let row = 0; row < rimRows; row++) {
    const y = ((row + 0.5) / rimRows) * height;
    for (let col = 0; col < rimCols; col++) {
      const x = ((col + 0.5) / rimCols) * width;
      const field = shapeField(shape, x, y);
      const i = (row * rimCols + col) * 4;
      // Outside the shape, and a hair inside it, nothing (the clip is the
      // control's own outline; this keeps the antialiased edge clean).
      if (field.inside <= 0.35 || field.inside >= bezel) continue;
      const t = field.inside / bezel;
      const { slope } = bezelProfile(t);
      const grad = (-slope * thickness) / bezel;
      // The outward-tilted normal.
      const nLen = Math.hypot(grad, 1);
      const nx = (field.nx * grad) / nLen;
      const ny = (field.ny * grad) / nLen;
      const nz = 1 / nLen;
      // Where this rim sits on the light's axis: 1 facing the light (upper
      // left), -1 facing away (lower right). Liquid Glass lights both ends
      // of the axis (a highlight travels round the silhouette from the
      // light and catches the opposite edge too), the far one weaker; the
      // sides between them stay dark.
      const facing = field.nx * sx + field.ny * sy;
      const lit = Math.pow(clamp(facing, 0, 1), 1.4);
      const unlit = Math.pow(clamp(-facing, 0, 1), 1.4);
      // Fresnel: the glass mirrors its surroundings at a grazing angle. On
      // the squircle profile that is only the outermost pixel or two, so
      // the specular is a thin line hugging the edge, as on the real glass
      // (about a point wide), not a bevel.
      const fresnel = Math.pow(1 - nz, 2.2);
      const blinn = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), 96);
      const arc = fresnel * (lit * 1.7 + unlit * 1.05 + 0.16) + blinn * 0.22 * lit;
      const white = Math.min(1, arc);
      // The edge itself: a faint dark hairline outside the specular (the
      // backdrop compressed by the rim), which is what outlines the glass
      // over light content; no inner band, no crest (no pillow).
      const black = clamp(0.3 * Math.pow(1 - t, 7) * (1 - 0.6 * lit), 0, 1);
      // Dispersion: a thick edge splits white light into a warm outer and a
      // cool inner fringe, strongest where the rim runs diagonally (the
      // corners of a capsule, both ends of the light axis).
      const diagonal = 0.35 + 0.65 * clamp(Math.abs(field.nx * field.ny) * 2, 0, 1);
      const outer = Math.pow(1 - t, 6) * diagonal;
      const inner = Math.exp(-Math.pow((t - 0.22) / 0.08, 2)) * diagonal;
      const cr = clamp(1 + 0.3 * outer - 0.22 * inner, 0, 1.3);
      const cg = clamp(1 - 0.06 * outer + 0.02 * inner, 0, 1.3);
      const cb = clamp(1 - 0.26 * outer + 0.3 * inner, 0, 1.3);
      // White over black over transparency, premultiplied for the canvas.
      const alpha = white + black * (1 - white);
      if (alpha <= 0.002) continue;
      const lum = white / alpha;
      rim[i] = Math.round(clamp(lum * cr, 0, 1) * 255);
      rim[i + 1] = Math.round(clamp(lum * cg, 0, 1) * 255);
      rim[i + 2] = Math.round(clamp(lum * cb, 0, 1) * 255);
      rim[i + 3] = Math.round(alpha * 255);
    }
  }

  return {
    shape,
    lens: { cols: lensCols, rows: lensRows, data: lens },
    scale,
    maxShift,
    rim: { cols: rimCols, rows: rimRows, data: rim },
    bezel,
  };
}
