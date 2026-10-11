export type SplitLightsResult = { unlit: HTMLCanvasElement; lights: HTMLCanvasElement };

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
): SplitLightsJob | null;

export function splitLights(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  w: number,
  h: number,
  document?: Document,
): SplitLightsResult | null;
