/** The lab, the scroll movie and the form selector use the same form path.
 * The white Ultra body ignites once. The last segment deploys its interfaces. */
export const FAR_FROM_FORM_CHAIN = ["high", "xhigh", "max", "ultra-body", "ultra"] as const;
export const FAR_FROM_FORM_STEP_MS = 1550;

// Canonical runway positions shared with the HUD, lab links and manual scrubbing.
export const FAR_FROM_FORM_WINDOW = [0.915, 0.975] as const;
const [FORM_START, FORM_END] = FAR_FROM_FORM_WINDOW;
const span = FORM_END - FORM_START;

/** Advance a signed time step. Converting through elapsed time also handles
 * a single frame crossing either edge of the form sequence in either direction. */
export function advanceFarFromPlayback(progress: number, elapsedMs: number, baseMs: number, form: string) {
  const steps = FAR_FROM_FORM_CHAIN.findIndex((key) => key === form) + 1;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (!steps) return clamp(progress + elapsedMs / baseMs);
  const formMs = Math.max(baseMs * span, steps * FAR_FROM_FORM_STEP_MS);
  const startMs = FORM_START * baseMs;
  const t = startMs + (
    progress <= FORM_START ? (progress - FORM_START) * baseMs :
    progress >= FORM_END ? formMs + (progress - FORM_END) * baseMs :
    ((progress - FORM_START) / span) * formMs
  ) + elapsedMs;
  if (t <= startMs) return clamp(t / baseMs);
  if (t >= startMs + formMs) return clamp(FORM_END + (t - startMs - formMs) / baseMs);
  return FORM_START + (t - startMs) / formMs * span;
}
