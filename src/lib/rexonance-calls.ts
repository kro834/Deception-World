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

// The schematic's part callouts, in the order their plates lock: one plate
// group on each quarter-beat of SA-GA！DEUS！.
export const REXONANCE_SUIT_PARTS = ["LEGS", "ARMS", "CHEST", "HEAD"] as const;

// suitup3: the armour forms like nanotech, spreading from the P14 core.
// When the nanite front reaches each region (ms on the overlay's clock):
// RIDER！ seeds the core; each SA-GA！DEUS！ line carries the front one
// region further — chest, shoulders and arms to the hands, waist and legs
// to the feet, then the tail streams out over the shoulder to its blade
// with the ribbons — and on REXONANCE DEUS！ the helmet rises up the neck
// and closes.
const SUIT_CHANT = REXONANCE_CALL_BEATS[2].start;
const SUIT_LINE = REXONANCE_CALL_BEATS[2].duration / 4;
const SUIT_FINAL = REXONANCE_CALL_BEATS[4].start;
export const REXONANCE_SUIT_FLOW = {
  seed: REXONANCE_CALL_BEATS[1].start + 40,
  iris: SUIT_CHANT,
  chest: SUIT_CHANT + 40,
  ribs: SUIT_CHANT + 80,
  shoulder: SUIT_CHANT + SUIT_LINE,
  blades: SUIT_CHANT + SUIT_LINE + 30,
  upperArm: SUIT_CHANT + SUIT_LINE + 40,
  forearm: SUIT_CHANT + SUIT_LINE + 90,
  hand: SUIT_CHANT + SUIT_LINE + 135,
  abdomen: SUIT_CHANT + 2 * SUIT_LINE,
  pelvis: SUIT_CHANT + 2 * SUIT_LINE + 30,
  thigh: SUIT_CHANT + 2 * SUIT_LINE + 60,
  knee: SUIT_CHANT + 2 * SUIT_LINE + 90,
  shin: SUIT_CHANT + 2 * SUIT_LINE + 120,
  boot: SUIT_CHANT + 2 * SUIT_LINE + 150,
  tail0: SUIT_CHANT + 3 * SUIT_LINE,
  ribbons: SUIT_CHANT + 3 * SUIT_LINE + 15,
  tail1: SUIT_CHANT + 3 * SUIT_LINE + 30,
  tail2: SUIT_CHANT + 3 * SUIT_LINE + 60,
  tail3: SUIT_CHANT + 3 * SUIT_LINE + 90,
  blade: SUIT_CHANT + 3 * SUIT_LINE + 120,
  neck: SUIT_FINAL,
  crest: SUIT_FINAL + 40,
  spike: SUIT_FINAL + 70,
} as const;
// A region condenses over this long after the front reaches it; its cloud
// gathers from 60 ms before and settles out over 300 ms.
export const REXONANCE_SUIT_FORM_MS = 220;
export const REXONANCE_SUIT_CLOUD_MS = 300;
