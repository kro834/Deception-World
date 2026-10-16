export type SplitLightsResult = {
  unlit: HTMLCanvasElement;
  lights: HTMLCanvasElement;
  /** With `options.motes`: the art in nanite light, the art's alpha (the call's motes). */
  motes?: HTMLCanvasElement;
};

export type SplitLightsOptions = { motes?: boolean };

export type SplitLightsJob = {
  /** Cooperatively advance rows; true is terminal (completed or cancelled). */
  step(until: number, idleDeadline?: Pick<IdleDeadline, "timeRemaining">): boolean;
  /** Publish only a completed pass. Repeated successful commits are idempotent. */
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
