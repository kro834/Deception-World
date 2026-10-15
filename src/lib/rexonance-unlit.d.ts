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
