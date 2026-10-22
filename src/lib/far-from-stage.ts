/** FAR FROM SAGA — the suit-up stage's geometry (2026-10-22).
 *
 * One place for where the figure stands on the #suitup runway, shared by
 * the scroll suit-up (src/lib/far-from-assembly.ts, the Rexonance engine
 * reading the same shares from the frame's custom properties) and the
 * Ultra segment that follows it, so its first frame stands the figure
 * exactly where the suit-up's last frame left it. Pure data and pure
 * functions: no DOM, nothing on the startup path.
 *
 * Frames. The owner's four suit cutouts (ミドル, ハイ, エックスハイ,
 * マックス) share one 1024 x 1536 transparent frame (FAR_FROM_CUTOUT). The
 * suit-up delivers that whole frame, never cropped, at the figure height the
 * Rexonance engine is tuned for (1040 px: FAR_FROM_SUIT_SIZE), so a
 * cutout pixel (x, y) is the figure pixel (x, y) × FAR_FROM_SUIT_SCALE, and
 * a form drawn through farFromFigureBox lands on the same pixels whichever
 * segment draws it.
 *
 * Placement. The figure's box in the stage (the sticky frame) is given as
 * shares of the frame: its height (or its width, whichever binds), the
 * horizontal centre and the gap under its soles. The desktop numbers are the
 * Rexonance runway's; the stacked layouts (tablets, phones) lower the figure
 * into the frame under the call and above the read-out, as that runway does.
 */

/** The owner's cutouts' frame (px). */
export const FAR_FROM_CUTOUT = Object.freeze({ width: 1024, height: 1536 });

/** The delivered figure (figure px): the whole cutout frame at 1040 px. */
export const FAR_FROM_SUIT_SIZE = Object.freeze({ width: 693, height: 1040 });

/** Cutout px → figure px. */
export const FAR_FROM_SUIT_SCALE = FAR_FROM_SUIT_SIZE.height / FAR_FROM_CUTOUT.height;

export type FarFromStagePlacement = {
  /** The figure's height, as a share of the frame's height. */
  readonly height: number;
  /** The most of the frame's width the figure may take. */
  readonly width: number;
  /** The figure's horizontal centre, as a share of the frame's width. */
  readonly x: number;
  /** The gap under the soles, as a share of the frame's height. */
  readonly bottom: number;
};

/** The placements by layout tier (the runway's stylesheet switches between
 * them at the same breakpoints: styles-far-from-suitup.css). */
export const FAR_FROM_STAGE_TIERS = Object.freeze({
  /** Desktop (1100 px and up): the call at the left, the read-out at the right. */
  desktop: Object.freeze({ height: 0.86, width: 0.92, x: 0.5, bottom: 0.035 }),
  /** Landscape tablets (761–1099.98 px). */
  tablet: Object.freeze({ height: 0.7, width: 0.92, x: 0.5, bottom: 0.06 }),
  /** Portrait tablets (761–1099.98 px, portrait). */
  portrait: Object.freeze({ height: 0.66, width: 0.92, x: 0.5, bottom: 0.17 }),
  /** Phones (up to 760 px): the call across the top, the read-out along the bottom. */
  phone: Object.freeze({ height: 0.58, width: 0.92, x: 0.5, bottom: 0.17 }),
  /** The narrowest phones (under 350 px). */
  narrow: Object.freeze({ height: 0.55, width: 0.92, x: 0.5, bottom: 0.21 }),
} satisfies Readonly<Record<string, FarFromStagePlacement>>);

export type FarFromStageTier = keyof typeof FAR_FROM_STAGE_TIERS;

/** The default placement (desktop). */
export const FAR_FROM_STAGE: FarFromStagePlacement = FAR_FROM_STAGE_TIERS.desktop;

/** The frame's custom properties the engine reads the placement from. */
export const FAR_FROM_STAGE_VARS = Object.freeze({
  height: "--rzn-fig-h",
  width: "--rzn-fig-w",
  x: "--rzn-fig-x",
  bottom: "--rzn-fig-b",
});

/** The sticky frame's height (CSS): one screen under the bar, never under
 * `min` nor, on desktop, over `max`. */
export const FAR_FROM_STAGE_FRAME = Object.freeze({
  desktop: Object.freeze({ min: 620, max: 1100 }),
  phone: Object.freeze({ min: 560, max: Number.POSITIVE_INFINITY }),
});

/** The runway's travel (CSS): how tall the scrolled track is while the
 * frame is pinned — the scene's progress runs 0 → 1 over it. */
export const FAR_FROM_RUNWAY_TRAVEL = Object.freeze({
  desktop: "max(2400px, 420svh)",
  phone: "max(1950px, 360svh)",
});

/** The layout tier for a viewport, as the stylesheet picks it. */
export function farFromStageTier(viewportWidth: number, viewportHeight: number): FarFromStageTier {
  if (viewportWidth < 350) return "narrow";
  if (viewportWidth <= 760) return "phone";
  if (viewportWidth < 1100) return viewportHeight > viewportWidth ? "portrait" : "tablet";
  return "desktop";
}

export type FarFromFigureBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** CSS px per figure px (FAR_FROM_SUIT_SIZE). */
  readonly scale: number;
};

/**
 * Where the figure stands in a frame of `frameWidth` × `frameHeight` CSS px:
 * the box the delivered figure (FAR_FROM_SUIT_SIZE) is drawn into, exactly
 * as the engine's measure places its canvas view (height share first, the
 * width share where the frame is narrow; centred on `x`; `bottom` under the
 * soles). The Ultra segment draws its first frame through this.
 */
export function farFromFigureBox(
  frameWidth: number,
  frameHeight: number,
  placement: FarFromStagePlacement = FAR_FROM_STAGE,
  figure: { readonly width: number; readonly height: number } = FAR_FROM_SUIT_SIZE,
): FarFromFigureBox {
  const height = Math.min(
    frameHeight * placement.height,
    (frameWidth * placement.width * figure.height) / figure.width,
  );
  const scale = height / figure.height;
  const width = figure.width * scale;
  return {
    x: frameWidth * placement.x - width / 2,
    y: frameHeight * (1 - placement.bottom) - height,
    width,
    height,
    scale,
  };
}

/** A cutout pixel (the owner's 1024 x 1536 frame) in figure px. */
export function farFromCutoutToFigure(x: number, y: number): readonly [number, number] {
  return [x * FAR_FROM_SUIT_SCALE, y * FAR_FROM_SUIT_SCALE];
}
