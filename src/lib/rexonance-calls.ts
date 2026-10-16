// Canonical transformation call, in its original order and punctuation.
export const REXONANCE_CALLS = [
  "Ultra DEUS！",
  "REXONANCE！",
  "RIDER！",
  "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
  "REXONANCE！REXONANCE！REXONANCE！REXONANCE！",
  "REXONANCE DEUS！",
] as const;

// Keep the established five-beat choreography: the two opening calls share
// the first beat, while the remaining four canonical calls keep their slots.
export const REXONANCE_ENTRY_CALLS = [
  REXONANCE_CALLS.slice(0, 2).join("\n"),
  ...REXONANCE_CALLS.slice(2),
] as const;

// EXCELSIOR (owner, 2026-10-11): above ULTRA, also 60 s.
export type RexonanceStage = "standard" | "max" | "ultra" | "excelsior";

export const REXONANCE_STAGE_LABELS: Record<RexonanceStage, string> = {
  standard: "HIGH",
  max: "MAX",
  ultra: "ULTRA",
  excelsior: "EXCELSIOR",
};

// rx12 (owner, 2026-10-10): the face holds its pixel squares ~0.6 s before
// they scatter, so the last call holds 580 ms longer (cover 2300 -> 2880).
// Owner, 2026-10-11: that hold a little shorter (~0.45 s): cover 2730.
export const REXONANCE_ENTRY_TIMINGS = { cover: 2730, reveal: 480 } as const;
export const REXONANCE_STAGE_DURATION_MS = 650;

// Cover time is a minimum: the final call holds if the destination is late.
export const REXONANCE_CALL_BEATS = [
  { start: 0, duration: 330 },
  { start: 330, duration: 320 },
  { start: 650, duration: 650 },
  { start: 1300, duration: 680 },
  { start: 1980, duration: 750 },
] as const;

// rx3 suit-up HUD. The system check reads only what the page already states,
// exactly as printed there (rexonance-saga.tsx: the P14 / SA-GA OS 5.5 copy,
// the processing comparison and the TRINITY specs). ONLINE and LINK are
// generic HUD words. Decorative: the overlay is aria-hidden.
export const REXONANCE_SUIT_SYSTEMS = [
  ["SA-GA OS 5.5", "ONLINE"],
  ["P14", "LINK"],
  ["KHAOS DeuX", "50,000〜YOPS / ∞Core"],
  ["KOSMOS DeuX", "9,000TOPS / 300Core"],
  ["Paranormal Realizer Ultra", "ONLINE"],
  ["Neural Resonancer Ultra", "ONLINE"],
] as const;

// The part callouts, in the order their pieces snap on: one per DEUS！ of
// SA-GA！DEUS！ (the helmet's on the last call).
export const REXONANCE_SUIT_PARTS = ["LEGS", "ARMS", "CHEST", "HEAD"] as const;

// rx12 (2026-10-10, owner): the suit-up is the approved full-body artwork,
// cut into raster plates (scripts/build-rexonance-suit.mjs). The opening
// call pair scans the bare undersuit; RIDER！ seeds the P14 core and motes gather.
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
    // The driver (belt-*) is on the body from the start (REXONANCE_SUIT_DRIVER).
    order: ["tasset-pendant", "tasset-low", "tasset-top"],
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
/** The driver at the waist (owner, 2026-10-11): finished from the start,
 * in the call and on the page's suit-up alike; it never assembles. */
export const REXONANCE_SUIT_DRIVER: readonly string[] = [
  "belt-l2",
  "belt-r2",
  "belt-l1",
  "belt-r1",
  "belt-jewel",
];
/** When each plate seats (its clank), by id (the driver: 0, already on). */
export const REXONANCE_SUIT_FIT: Readonly<Record<string, number>> = Object.fromEntries([
  ...REXONANCE_SUIT_DRIVER.map((id) => [id, 0]),
  ...REXONANCE_SUIT_CASCADE.flatMap(({ from, to, order }) =>
    order.map((id, k) => [id, Math.round(from + ((to - from) * k) / (order.length - 1))]),
  ),
]);
/** The plates that seat on an accent (the strongest clank). */
export const REXONANCE_SUIT_ACCENTS: readonly string[] = REXONANCE_SUIT_CASCADE.filter(
  ({ group }) => group in REXONANCE_SUIT_SNAP,
).map(({ order }) => order[order.length - 1]);
/** rx17 (owner, 2026-10-11): the gold is formed by nanomachines right
 * after each plate is fitted. A plate seats without it (its trims raw
 * gunmetal channels); from its clank, gold nanites much finer than the
 * plate's micro-tiles run along the trims from the seat outward like
 * molten metal through a channel, each a bright mote that settles into the
 * painted gold, and a glint runs the finished trim. Each DEUS！ accent
 * forms its gold as a surge that runs on through its whole group's gold.
 * The helmet's gold is complete before the face's pixel squares fill.
 * Times are ms on the overlay's clock. */
export const REXONANCE_SUIT_GOLD = {
  /** After the plate's fit (its clank). */
  delay: 6,
  /** A plate's gold forms over this long. */
  form: 200,
  /** The DEUS！ accents form theirs as a surge. */
  accent: 240,
  /** The helmet's plates: done before the face's pixel squares fill. */
  helm: 90,
  /** A gold mote's flight into its cell. */
  approach: 45,
  /** A formed cell cools from molten to the painted gold. */
  cool: 70,
  /** The glint along a finished trim. */
  glint: 140,
  /** An accent's surge on through its group's gold. */
  surge: 260,
} as const;
/** When each plate's gold forms, by id: its first and last cell (ms). */
export const REXONANCE_SUIT_GOLD_AT: Readonly<Record<string, readonly [number, number]>> =
  Object.fromEntries([
    // The driver's gold is formed already.
    ...REXONANCE_SUIT_DRIVER.map((id) => [id, [0, 0] as const]),
    ...REXONANCE_SUIT_CASCADE.flatMap(({ group, order }) =>
      order.map((id) => {
        const from = REXONANCE_SUIT_FIT[id] + REXONANCE_SUIT_GOLD.delay;
        const span =
          group === "helm"
            ? REXONANCE_SUIT_GOLD.helm
            : REXONANCE_SUIT_ACCENTS.includes(id)
              ? REXONANCE_SUIT_GOLD.accent
              : REXONANCE_SUIT_GOLD.form;
        return [id, [from, from + span] as const];
      }),
    ),
  ]);
/** RIDER！'s nanite motes gather from here (and are spent by the waist's snap). */
export const REXONANCE_SUIT_MOTES = REXONANCE_CALL_BEATS[1].start;
/** The suit's lights (owner, 2026-10-11): the ice-cyan and pink light
 * stands monochrome while the suit assembles; once the whole suit is on,
 * on REXONANCE DEUS！ the reactor ignites and the light runs out through
 * the whole body from it (`spread` ms), with a bloom that settles by
 * `from + bloom`, while the compound eyes fill with cells. */
export const REXONANCE_SUIT_LIGHT = { from: SUIT_FINAL, spread: 380, bloom: 560 } as const;
/** REXONANCE DEUS！: pixel squares fill the face's lights, then scatter. */
export const REXONANCE_SUIT_PIXELS = {
  fill: SUIT_FINAL + 10,
  fillStep: 14,
  // The squares hold on the face ~0.45 s, then scatter (owner, rx12; shortened 2026-10-11).
  scatter: SUIT_FINAL + 540,
  scatterStep: 10,
  scatterMs: 140,
  groups: 6,
} as const;
/** If the pieces are not decoded when the call starts, the call plays with
 * the finished figure; it switches to the build only while the opening scan
 * is still running, never once any armour could show. */
export const REXONANCE_SUIT_LATE_MS = 300;
/** Sparks: every accent, and the first bite of each run (the clank's
 * four-point glint, and from 2026-10-16 the nanite engine's shock rings). */
export const REXONANCE_SUIT_SPARKS: readonly string[] = [
  ...REXONANCE_SUIT_ACCENTS,
  "boot-foot-l",
  "boot-foot-r",
  "knee-disc-l",
  "knee-disc-r",
  "arm-fist-l",
  "shoulder-disc-l",
  "shoulder-disc-r",
  "tail-4b",
  "helmet-jaw",
];
/** Owner (2026-10-16): 「blenderなどを用いてナノマシン一つ一つの挙動や装甲形成や
 * 金のガイドウェイなどを大きく改善して」「超大幅な改善で。」 — the call's nanite
 * swarm, armour staging and gold guideways (rexonance-suit-extras), in ms
 * on the overlay's clock, relative to each plate's fit F where noted. The
 * pinned clocks above (fits, gold, light, pixels, cover) are unchanged; the
 * swarm rides them. */
export const REXONANCE_SUIT_SWARM = {
  /** RIDER！: six pump waves of chips spiral out of the P14 core. */
  waves: [330, 380, 430, 480, 530, 580],
  /** Each wave's spiral out into the cocoon. */
  wave: 160,
  /** The cocoon's rings turn at this many revolutions a second (mid ring). */
  spin: 0.62,
  /** Before F: the latch appears at the seat. */
  project: 360,
  /** Owner (2026-10-16): 「金のガイドウェイは上から被さる形ではなく、足先から
   * 滑らかに作られていく。」 — each trim's guideway is built on the body, never
   * laid over it: it grows along its channel from its lowest cell (the tail
   * from its root) to its upper end, a laser-weld head running ahead of the
   * solid conduit, and the front climbs the figure from the toe tips in the
   * fitting order. A group's front starts at most `lead` before a plate's F
   * (ornaments: `ornament`) and every plate's guideway is whole `done` before
   * its F (before its first tile lands); none is built in under `least`. The
   * head glows `head` behind the front; the laser projects `ahead` of it. */
  build: { lead: 380, ornament: 300, done: 115, least: 70, head: 18, ahead: 32 },
  /** Before F: the scaffold lattice grows, then is consumed. */
  lattice: [270, 60],
  /** Cocoon chips drain into their plate's lane from its first flight minus this. */
  drain: 60,
  /** The clamps swing in over [F - 120, F - 40] and bite over F ± 10. */
  clamp: [120, 40, 10],
  /** The plate swings down onto its seat over [F - 40, F], rings out past
   * it and is still at F: nothing moves once its gold can form (owner,
   * 2026-10-16: 「前がけの生成完了時にズレるのを修正して。」; the tassets and
   * the tall narrow plates form in place, like the helmet). */
  seat: 40,
  /** A ribbon flutters over the last this-many ms before it seats. */
  sway: 120,
  /** After F: the seam ignites round the plate's real outline, then glows. */
  seam: 90,
  seamGlow: 60,
  /** After F: the shock ring and the spall. */
  shock: 140,
  spall: 160,
  /** The conduit prints onto the plate over [F - 30, F + 5], bottom to top
   * along its trims (2026-10-16), whole before the first gold locks (F + 6). */
  print: [30, 5],
  /** Paint develops from the seat outward over [F + 6, F + 70] (helmet + 36). */
  paint: [6, 64, 30],
  /** The lacquer front, the lock recoil, the spark and the lattice link. */
  lacquer: 12,
  recoil: 40,
  spark: 50,
  link: 60,
  /** The molten band and its droplets behind each gold lock. */
  molten: 30,
  /** The band by age (owner, 2026-10-16): cells locked within the first
   * step white-hot, then molten under a fading white heat, then molten
   * fading into the painted gold (the last step is `molten`). */
  moltenAges: [6, 14, 22, 30],
  droplet: 24,
  /** The conduit recedes this long behind each lock; clamps release after. */
  recede: 70,
  release: [70, 130],
  /** The helmet's crown ring forms, and the free chips implode at the seal. */
  crown: [1600, 1700],
  implode: [1980, 2160],
} as const;
/** Owner (2026-10-16): 「更にナノマシンの挙動をブラッシュアップして。」 — each
 * nanite of the call's swarm reads as a small machine of its own inside a
 * structured swarm. Every behaviour is a closed-form function of the call
 * clock and per-chip seeds (no state carried between frames); ms on the
 * overlay's clock, figure px (571 x 1040) where noted. */
export const REXONANCE_SUIT_SWARM_LIFE = {
  /** Squads: the cocoon's chips fly in strings of `size` behind a white
   * leader, `gap` rad apart on their ring; every squad hops lanes together
   * once a `hop` ms period (each follower `lag` ms after the one ahead),
   * jostling in its slot. */
  squad: { size: 5, gap: 0.075, hop: [900, 1500], lag: 38 },
  /** The core's heartbeat after the pump waves: every `every` ms from
   * `from` until the seal, a beat that breathes each ring out by `breath`
   * of its radius, reaching a ring `lag` ms per figure height from the core
   * later; each chip also hovers `hover` px in its own slow rhythm. */
  heartbeat: { from: 640, every: 330, lag: 260, breath: 0.035, hover: 1.6 },
  /** A seating plate ripples through the swarm: a front `speed` px/ms wide
   * `width` px pushes chips out by up to `push` px and spins them up, over
   * `ms`. */
  ripple: { ms: 260, speed: 1.1, width: 24, push: 13 },
  /** Strings: a plate's tiles fly in single file behind a white pathfinder,
   * `gap` ms apart, and bunch at a shared lock-on point (at most `reach` px
   * from their own aim) where each hangs, twitching, before it darts in. */
  string: { gap: 12, reach: 60 },
  /** Banking: on its ring a chip rolls once an orbit, its lit face round to
   * the viewer at the near apex, where a specular star flashes (at most
   * `most` a frame, desktop). */
  glint: { most: 40 },
} as const;
