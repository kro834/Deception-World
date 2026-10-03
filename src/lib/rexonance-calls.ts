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
