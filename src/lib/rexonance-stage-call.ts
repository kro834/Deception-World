// The stage card's rest guard (rx2). A selection either retargets the card
// that is already showing, mounts a new one, or changes the form quietly.
// Card starts are therefore at least one card plus the rest window apart,
// and a selection without a card gets the luminance-floored entrance, so any
// tapping cadence stays within one flash a second. Pure, so it is testable.
import { REXONANCE_STAGE_DURATION_MS } from "./rexonance-calls.ts";

// Quiet time after a card has left on its own before another may mount.
export const REXONANCE_STAGE_CALL_REST_MS = 300;
// The new form's entrance starts as the card begins to leave (card clock).
export const REXONANCE_STAGE_ENTRANCE_DELAY_MS = 380;
// The card's words fade from here; after it, the page is already showing
// through the opening aperture, so a retargeted form arrives quietly
// instead of being clipped away again (a dark-light pair on screen).
export const REXONANCE_STAGE_CARD_LEAVE_MS = 330;

export type RexonanceStageEntrance = {
  kind: "card" | "quiet";
  delayMs: number;
};

export type RexonanceStageCallPlan = {
  action: "mount" | "retarget" | "skip";
  entrance: RexonanceStageEntrance;
};

export function planStageCall({
  motionAllowed,
  cardMounted,
  cardElapsedMs,
  sinceNaturalExitMs,
}: {
  // Not hidden, no reduced motion, no economy, no Save-Data, no 2G.
  motionAllowed: boolean;
  cardMounted: boolean;
  // Time since the mounted card started (ignored without one).
  cardElapsedMs: number;
  // Time since a card last left on its own; Infinity when none has.
  sinceNaturalExitMs: number;
}): RexonanceStageCallPlan {
  if (!motionAllowed) return { action: "skip", entrance: { kind: "quiet", delayMs: 0 } };
  if (cardMounted && cardElapsedMs < REXONANCE_STAGE_DURATION_MS) {
    if (cardElapsedMs >= REXONANCE_STAGE_CARD_LEAVE_MS) {
      return { action: "retarget", entrance: { kind: "quiet", delayMs: 0 } };
    }
    const remaining = REXONANCE_STAGE_ENTRANCE_DELAY_MS - Math.max(0, cardElapsedMs);
    return {
      action: "retarget",
      entrance: { kind: "card", delayMs: Math.max(0, Math.round(remaining)) },
    };
  }
  // A card whose timer is due has already left the screen: it rests too.
  if (cardMounted || sinceNaturalExitMs < REXONANCE_STAGE_CALL_REST_MS) {
    return { action: "skip", entrance: { kind: "quiet", delayMs: 0 } };
  }
  return {
    action: "mount",
    entrance: { kind: "card", delayMs: REXONANCE_STAGE_ENTRANCE_DELAY_MS },
  };
}
