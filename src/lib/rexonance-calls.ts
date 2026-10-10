// Published transformation call, in its original order and punctuation.
// The operating-stage names are labels, not additional transformation calls.
export const REXONANCE_CALLS = [
  "FAR UP！",
  "RIDER！",
  "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
  "REXONANCE！REXONANCE！REXONANCE！REXONANCE！",
  "REXONANCE DEUS！",
] as const;

export type RexonanceStage = "standard" | "max" | "ultra";

export const REXONANCE_STAGE_LABELS: Record<RexonanceStage, string> = {
  standard: "HIGH",
  max: "MAX",
  ultra: "ULTRA",
};

export const REXONANCE_ENTRY_TIMINGS = { cover: 2300, reveal: 480 } as const;
export const REXONANCE_STAGE_DURATION_MS = 650;

// Cover time is a minimum: the final call holds if the destination is late.
export const REXONANCE_CALL_BEATS = [
  { start: 0, duration: 330 },
  { start: 330, duration: 320 },
  { start: 650, duration: 650 },
  { start: 1300, duration: 680 },
  { start: 1980, duration: 320 },
] as const;

// rx3 suit-up HUD. The system check reads only what the page already states,
// exactly as printed there (rexonance-saga.tsx: the P14 / SA-GA OS 5.5 copy,
// the processing comparison and the TRINITY specs). ONLINE and LINK are
// generic HUD words. Decorative: the overlay is aria-hidden.
export const REXONANCE_SUIT_SYSTEMS = [
  ["SA-GA OS 5.5", "ONLINE"],
  ["P14", "LINK"],
  ["KHAOS DeuX", "50,000YOPS / ∞Core"],
  ["KOSMOS DeuX", "9,000TOPS / 300Core"],
  ["Paranormal Realizer Ultra", "ONLINE"],
  ["Neural Resonancer Ultra", "ONLINE"],
] as const;

// The part callouts, in the order their pieces snap on: one per DEUS！ of
// SA-GA！DEUS！ (the helmet's on the last call).
export const REXONANCE_SUIT_PARTS = ["LEGS", "ARMS", "CHEST", "HEAD"] as const;

// rx12 (2026-10-10, owner): the suit-up is the approved full-body artwork,
// cut into raster pieces (scripts/build-rexonance-suit.mjs). FAR UP！ scans
// the bare undersuit; RIDER！ seeds the P14 core and nanite motes gather;
// on each SA-GA！ a group of armour pieces forms out of nanites floating a
// little off the body, and on its DEUS！ it snaps on (ガチャガチャ); through
// REXONANCE！ the tail grows out and the ribbons stream while the helmet
// forms above the head and clamps down; on REXONANCE DEUS！ the face's
// lights fill with pixel squares that scatter: transformation complete.
// Times are ms on the overlay's clock.
const SUIT_CHANT = REXONANCE_CALL_BEATS[2].start;
const SUIT_RESPONSE = REXONANCE_CALL_BEATS[3].start;
const SUIT_FINAL = REXONANCE_CALL_BEATS[4].start;
/** Each chant line's DEUS！ answers 230 ms into the chant, then every
 * 120 ms (the call sheet's rxCallAnswer). */
export const REXONANCE_CHANT_ANSWER = { first: 230, every: 120 } as const;
const deus = (line: number) =>
  SUIT_CHANT + REXONANCE_CHANT_ANSWER.first + line * REXONANCE_CHANT_ANSWER.every;
/** When each group snaps onto the body: legs, arms, chest and shoulders,
 * belt and waist on the four DEUS！; the helmet clamps down near the end of
 * REXONANCE！. */
export const REXONANCE_SUIT_SNAP = {
  legs: deus(0),
  arms: deus(1),
  chest: deus(2),
  waist: deus(3),
  helm: SUIT_FINAL - 90,
} as const;
/** A piece forms from nanites (motes converge, a coarse mosaic resolves)
 * over this long, floating, before its snap. */
export const REXONANCE_SUIT_FORM_MS = 230;
/** The snap: a fast travel to the seat, a hair past it, settled. */
export const REXONANCE_SUIT_SNAP_MS = 90;
/** The helmet forms above the head from here and hovers until its snap. */
export const REXONANCE_SUIT_HELM_FORM = SUIT_RESPONSE + 170;
/** The tail grows out section by section, root to blade. */
export const REXONANCE_SUIT_TAIL = { start: SUIT_RESPONSE + 30, step: 85, grow: 170 } as const;
/** The energy ribbons stream down from the shoulders. */
export const REXONANCE_SUIT_RIBBONS = { start: SUIT_RESPONSE + 60, stream: 320 } as const;
/** RIDER！'s nanite motes gather from here (and are spent by the waist's snap). */
export const REXONANCE_SUIT_MOTES = REXONANCE_CALL_BEATS[1].start;
/** REXONANCE DEUS！: pixel squares fill the face's lights, then scatter. */
export const REXONANCE_SUIT_PIXELS = {
  fill: SUIT_FINAL + 10,
  fillStep: 14,
  scatter: SUIT_FINAL + 110,
  scatterStep: 10,
  scatterMs: 140,
  groups: 6,
} as const;
/** If the pieces are not decoded when the call starts, the call plays with
 * the finished figure; it switches to the build only while FAR UP！'s scan
 * is still running, never once any armour could show. */
export const REXONANCE_SUIT_LATE_MS = 300;
