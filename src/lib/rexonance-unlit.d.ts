export type SplitLightsResult = {
  unlit: HTMLCanvasElement;
  lights: HTMLCanvasElement;
  /** With `options.motes`: the art in nanite light, the art's alpha (the call's motes). */
  motes?: HTMLCanvasElement;
};

export type SplitLightsOptions = { motes?: boolean };

export type SplitLightsJob = {
  /** Cooperatively advance one phase (the snapshot and its one whole
   * read-back, one strip of one canvas's upload) or a strip's rows to the
   * deadline; Infinity without an expired idle deadline runs the whole pass.
   * True is terminal (completed or cancelled). */
  step(until: number, idleDeadline?: Pick<IdleDeadline, "timeRemaining">): boolean;
  /** Publish only a completed pass (no pixel work). Repeated successful commits are idempotent. */
  commit(): SplitLightsResult | null;
  /** Release unpublished resources; never destroy an already committed result. */
  cancel(): void;
};

export function createSplitLightsJob(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  w: number,
  h: number,
  document?: Document,
  options?: SplitLightsOptions,
): SplitLightsJob | null;

export function splitLights(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  w: number,
  h: number,
  document?: Document,
  options?: SplitLightsOptions,
): SplitLightsResult | null;

/** The nanite kit's pixel jobs (owner, 2026-10-16): the same contract as
 * SplitLightsJob — step(until, idleDeadline) → done; commit() → result or
 * null, idempotent; cancel() releases unpublished canvases. */
export type NanitePixelJob<Result> = {
  step(until: number, idleDeadline?: Pick<IdleDeadline, "timeRemaining">): boolean;
  commit(): Result | null;
  cancel(): void;
};

export type NaniteMetalOptions = {
  /** Also a silhouette canvas: rgb (6, 10, 18), the art's alpha. */
  silhouette?: boolean;
  /** The hex micro-relief's pitch (px between centres); 4.6. */
  pitch?: number;
};
export type NaniteMetalResult = {
  metal: HTMLCanvasElement;
  silhouette?: HTMLCanvasElement;
};
/** Raw nanite metal: gunmetal with the art's values, 4.6 px hex relief, a
 * lit upper-left bevel, the silhouette's rim, the art's exact alpha. */
export function createNaniteMetalJob(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  w: number,
  h: number,
  document?: Document | null,
  options?: NaniteMetalOptions,
): NanitePixelJob<NaniteMetalResult> | null;

export type NaniteGuideOptions = {
  /** Also the rails' walls (parallax): rgb (92, 60, 22). */
  walls?: boolean;
};
export type NaniteGuideResult = {
  holo: HTMLCanvasElement;
  walls?: HTMLCanvasElement;
};
/** The guide's ice hologram (scan-lined) and walls, the guide's size. */
export function createNaniteGuideJob(
  guide: CanvasImageSource & { width: number; height: number },
  document?: Document | null,
  options?: NaniteGuideOptions,
): NanitePixelJob<NaniteGuideResult> | null;

export type NaniteMoltenOptions = {
  /** Its alpha (at the same region) multiplies the source's. */
  mask?: CanvasImageSource;
};
export type NaniteMoltenResult = { molten: HTMLCanvasElement };
/** Molten gold, white-hot to amber, from the gold art's luminance. */
export function createNaniteMoltenJob(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  w: number,
  h: number,
  document?: Document | null,
  options?: NaniteMoltenOptions,
): NanitePixelJob<NaniteMoltenResult> | null;

/** Pure: the hex relief's height at (x, y): 1 on a hex top, 0 in the
 * 0.8 px groove. Sample a pixel at its centre (x + 0.5, y + 0.5). */
export function naniteHexHeight(x: number, y: number, pitch?: number): number;
/** Pure: +1 on a hex's 0.8 px upper-left bevel rim, -1 on its lower-right
 * rim, else 0. */
export function naniteHexLight(x: number, y: number, pitch?: number): number;

/** One row of createNaniteMetalJob's formula (shared with the call's phased
 * job): from the region's bytes `a` (w x h) into `m` (and `s`, or null). */
export function naniteMetalRow(
  y: number,
  w: number,
  h: number,
  a: Uint8ClampedArray,
  m: Uint8ClampedArray,
  s: Uint8ClampedArray | null,
  pitch?: number,
): void;
/** One row of createNaniteGuideJob's formula: hologram `o`, walls `wl`. */
export function naniteGuideRow(
  y: number,
  w: number,
  a: Uint8ClampedArray,
  o: Uint8ClampedArray,
  wl: Uint8ClampedArray | null,
): void;
/** The molten ramp's colour at t (0..1, clamped) into out[i..i + 2]. */
export function naniteMoltenRamp(t: number, out: Uint8ClampedArray, i: number): void;
/** One row of createNaniteMoltenJob's formula, its ramp shifted `shift`
 * toward white; alpha the source's times the mask's (when given). */
export function naniteMoltenRow(
  y: number,
  w: number,
  a: Uint8ClampedArray,
  mask: Uint8ClampedArray | null,
  o: Uint8ClampedArray,
  shift: number,
): void;
