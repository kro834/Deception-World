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

// rx12 (owner, 2026-10-10): the face holds its pixel squares ~0.6 s before
// they scatter, so the last call holds 580 ms longer (cover 2300 -> 2880).
export const REXONANCE_ENTRY_TIMINGS = { cover: 2880, reveal: 480 } as const;
export const REXONANCE_STAGE_DURATION_MS = 650;

// Cover time is a minimum: the final call holds if the destination is late.
export const REXONANCE_CALL_BEATS = [
  { start: 0, duration: 330 },
  { start: 330, duration: 320 },
  { start: 650, duration: 650 },
  { start: 1300, duration: 680 },
  { start: 1980, duration: 900 },
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
// cut into raster plates (scripts/build-rexonance-suit.mjs). FAR UP！ scans
// the bare undersuit; RIDER！ seeds the P14 core and nanite motes gather.
// rx13 (2026-10-11, owner): the armour forms right on the undersuit and
// fits plate by plate — a cascade up the body (legs, waist, arms, chest and
// core, shoulders), the tail growing out midway, the helmet last; each
// plate's nanites gather on the body, the plate grows from its seam through
// them and seats with a short clank, and each DEUS！ lands a group's last
// plate with the strongest clank. On REXONANCE DEUS！ the face's lights fill
// with pixel squares that hold, then scatter: transformation complete.
// Times are ms on the overlay's clock.
const SUIT_CHANT = REXONANCE_CALL_BEATS[2].start;
const SUIT_RESPONSE = REXONANCE_CALL_BEATS[3].start;
const SUIT_FINAL = REXONANCE_CALL_BEATS[4].start;
/** Each chant line's DEUS！ answers 230 ms into the chant, then every
 * 120 ms (the call sheet's rxCallAnswer). */
export const REXONANCE_CHANT_ANSWER = { first: 230, every: 120 } as const;
const deus = (line: number) =>
  SUIT_CHANT + REXONANCE_CHANT_ANSWER.first + line * REXONANCE_CHANT_ANSWER.every;
/** The accents: each DEUS！ seats a group's last plate (legs, waist, arms,
 * the core) with the strongest clank and a jolt; the helmet's crest clamps
 * last, near the end of REXONANCE！. */
export const REXONANCE_SUIT_SNAP = {
  legs: deus(0),
  waist: deus(1),
  arms: deus(2),
  chest: deus(3),
  helm: SUIT_FINAL - 90,
} as const;
/** A plate's nanites gather on the body over this long before it grows. */
export const REXONANCE_SUIT_GATHER_MS = 160;
/** A plate grows from its seam over this long, then seats (the clank). */
export const REXONANCE_SUIT_REVEAL_MS = 100;
export const REXONANCE_SUIT_CLANK_MS = 40;
/** The cascade: each group's plates fit one after another, evenly from its
 * first fit to its last (ms), in this order (left and right alternate). */
export const REXONANCE_SUIT_CASCADE = [
  {
    group: "legs",
    from: SUIT_CHANT + 60,
    to: REXONANCE_SUIT_SNAP.legs,
    order: [
      "boot-foot-l",
      "boot-foot-r",
      "boot-ankle-l",
      "boot-ankle-r",
      "boot-shin-l",
      "boot-shin-r",
      "knee-point-l",
      "knee-point-r",
      "knee-disc-l",
      "knee-disc-r",
      "thigh-plate-l",
      "thigh-plate-r",
      "thigh-top-l",
      "thigh-top-r",
    ],
  },
  {
    group: "waist",
    from: REXONANCE_SUIT_SNAP.legs + 18,
    to: REXONANCE_SUIT_SNAP.waist,
    order: [
      "tasset-pendant",
      "tasset-low",
      "tasset-top",
      "belt-l2",
      "belt-r2",
      "belt-l1",
      "belt-r1",
      "belt-jewel",
    ],
  },
  {
    group: "arms",
    from: REXONANCE_SUIT_SNAP.waist + 18,
    to: REXONANCE_SUIT_SNAP.arms,
    order: [
      "arm-upper-l",
      "arm-upper-r",
      "arm-bracer-l",
      "arm-bracer-r",
      "arm-cuff-l",
      "arm-cuff-r",
      "arm-fist-l",
      "arm-fist-r",
    ],
  },
  {
    group: "chest",
    from: REXONANCE_SUIT_SNAP.arms + 20,
    to: REXONANCE_SUIT_SNAP.chest,
    order: ["chest-abs-l", "chest-abs-r", "chest-pec-l", "chest-pec-r", "core-swirl", "core-disc"],
  },
  {
    group: "shoulders",
    from: SUIT_RESPONSE + 10,
    to: SUIT_RESPONSE + 150,
    order: [
      "shoulder-disc-l",
      "shoulder-disc-r",
      "shoulder-lower-l",
      "shoulder-lower-r",
      "shoulder-outer-l",
      "shoulder-outer-r",
      "shoulder-upper-l",
      "shoulder-upper-r",
    ],
  },
  {
    group: "tail",
    from: SUIT_RESPONSE + 170,
    to: SUIT_RESPONSE + 400,
    order: [
      "tail-0",
      "tail-1a",
      "tail-1b",
      "tail-2a",
      "tail-2b",
      "tail-3a",
      "tail-3b",
      "tail-4a",
      "tail-4b",
    ],
  },
  {
    group: "ribbon",
    from: SUIT_RESPONSE + 200,
    to: SUIT_RESPONSE + 420,
    order: ["ribbon-upper-l", "ribbon-upper-r", "ribbon-lower-l", "ribbon-lower-r"],
  },
  {
    group: "helm",
    from: SUIT_RESPONSE + 480,
    to: REXONANCE_SUIT_SNAP.helm,
    order: ["helmet-jaw", "helmet-visor", "helmet-crest"],
  },
] as const;
/** When each plate seats (its clank), by id. */
export const REXONANCE_SUIT_FIT: Readonly<Record<string, number>> = Object.fromEntries(
  REXONANCE_SUIT_CASCADE.flatMap(({ from, to, order }) =>
    order.map((id, k) => [id, Math.round(from + ((to - from) * k) / (order.length - 1))]),
  ),
);
/** The plates that seat on an accent (the strongest clank). */
export const REXONANCE_SUIT_ACCENTS: readonly string[] = REXONANCE_SUIT_CASCADE.filter(
  ({ group }) => group in REXONANCE_SUIT_SNAP,
).map(({ order }) => order[order.length - 1]);
/** RIDER！'s nanite motes gather from here (and are spent by the waist's snap). */
export const REXONANCE_SUIT_MOTES = REXONANCE_CALL_BEATS[1].start;
/** REXONANCE DEUS！: pixel squares fill the face's lights, then scatter. */
export const REXONANCE_SUIT_PIXELS = {
  fill: SUIT_FINAL + 10,
  fillStep: 14,
  // The squares hold on the face ~0.6 s, then scatter (owner, rx12).
  scatter: SUIT_FINAL + 690,
  scatterStep: 10,
  scatterMs: 140,
  groups: 6,
} as const;
/** If the pieces are not decoded when the call starts, the call plays with
 * the finished figure; it switches to the build only while FAR UP！'s scan
 * is still running, never once any armour could show. */
export const REXONANCE_SUIT_LATE_MS = 300;
