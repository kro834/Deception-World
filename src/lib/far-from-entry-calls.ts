import { FAR_FROM_SAGA } from "../components/final-stage/final-stage-data.ts";
import { FAR_FROM_ENTRY_FIRE, FAR_FROM_ENTRY_MATERIAL } from "./far-from-entry-ignition.js";
import { FAR_FROM_ENTRY_LATE_MS, FAR_FROM_ENTRY_TIMINGS } from "./far-from-entry-timings.ts";

/* FAR FROM SAGA's entry transformation: the calls and their clock (owner,
   2026-10-22: 「ファーフロムの変身はレクソナンスとほぼ同じ」). Modelled on
   src/lib/rexonance-calls.ts: six beats on one clock (ms, elapsed), the
   undersuit scanned under the opening calls, the fire kindled under SUPER
   SPECIAL！, turned gold and burst under RIDER！FAR FROM！, the armour's
   groups seated on each DEUS！ of the chant, the shoulders, the tail, the
   cape, the bits and the helmet under FAR FROM！×4, and the eyes and the
   reactor filled with pixel squares that scatter under FAR FROM DEUS！. The
   seven calls are the record's own (final-stage-data.ts), verbatim. */

/** The seven calls, verbatim from the record. */
export const FAR_FROM_CALLS = FAR_FROM_SAGA.calls;

export type FarFromEntryRole = "opening" | "cut" | "rider" | "chant" | "repetition" | "final";
export type FarFromEntryBeat = {
  /** The calls (FAR_FROM_CALLS indices) spoken in this beat, each its own line. */
  readonly calls: readonly number[];
  readonly start: number;
  readonly duration: number;
  readonly role: FarFromEntryRole;
};
/** The beats: the two opening calls share the first (as Rexonance's do),
 * SUPER SPECIAL！ cuts in, RIDER！FAR FROM！ carries the fire, the chant and
 * the repetition the armour, and FAR FROM DEUS！ the completion. */
export const FAR_FROM_ENTRY_BEATS: readonly FarFromEntryBeat[] = [
  { calls: [0, 1], start: 0, duration: 340, role: "opening" },
  { calls: [2], start: 340, duration: 300, role: "cut" },
  { calls: [3], start: 640, duration: 380, role: "rider" },
  { calls: [4], start: 1020, duration: 680, role: "chant" },
  { calls: [5], start: 1700, duration: 720, role: "repetition" },
  { calls: [6], start: 2420, duration: 820, role: "final" },
];
/** The verbatim call(s) of a beat (its data attribute). */
export const beatCall = (beat: FarFromEntryBeat) =>
  beat.calls.map((index) => FAR_FROM_CALLS[index]).join("\n");
/** The gate covers the page this long, then reveals it over `reveal`
 * (far-from-entry-timings.ts: the route transition screen's own light
 * module, re-exported here with the clock it times). */
export { FAR_FROM_ENTRY_TIMINGS, FAR_FROM_ENTRY_LATE_MS };
/** The undersuit scan: from the stylesheet's 70 ms delay over its span, to
 * the fire's ignition (FAR_FROM_ENTRY_FIRE.ignite). */
export const FAR_FROM_ENTRY_SCAN = {
  delay: 70,
  from: 70,
  span: FAR_FROM_ENTRY_FIRE.ignite - 70,
} as const;
/** The last call's hand-over budget: the first call's frame locks in. */
export const FAR_FROM_ENTRY_FRAME_MS = 560;
const beat = (role: FarFromEntryRole) => FAR_FROM_ENTRY_BEATS.find((b) => b.role === role)!;
const CHANT = beat("chant").start;
const RESPONSE = beat("repetition").start;
const FINAL = beat("final").start;
/** Each chant line's DEUS！ answers 230 ms into the chant, then every
 * 120 ms (the shared call sheet's rxCallAnswer). */
export const FAR_FROM_CHANT_ANSWER = { first: 230, every: 120 } as const;
const deus = (line: number) =>
  CHANT + FAR_FROM_CHANT_ANSWER.first + line * FAR_FROM_CHANT_ANSWER.every;
/** The accents: each DEUS！ seats a group's last plate with the strongest
 * clank; the helmet's crest clamps last, near the end of FAR FROM！. */
export const FAR_FROM_SUIT_SNAP = {
  legs: deus(0),
  waist: deus(1),
  arms: deus(2),
  chest: deus(3),
  helm: FINAL - 90,
} as const;
/** A plate's tiles land over this long before it is whole (its clank). */
export const FAR_FROM_SUIT_REVEAL_MS = 100;
export const FAR_FROM_SUIT_CLANK_MS = 40;
/** How long a tile streams before it locks (ms), and the share of it each
 * tile's own flight takes; the bits fly in from outside the frame, longer. */
export const FAR_FROM_SUIT_FLIGHT = { ms: 170, spread: [0.72, 1.28], bits: 2.2 } as const;

/** The cascade: each group's plates fit one after another, evenly from its
 * first fit to its last (ms), in this order (left and right alternate; a
 * group's last plate is its accent). Every piece of the suit appears once. */
export const FAR_FROM_SUIT_CASCADE = [
  {
    group: "legs",
    from: CHANT + 60,
    to: FAR_FROM_SUIT_SNAP.legs,
    order: ["boot-l", "boot-r", "shin-l", "shin-r", "knee-l", "knee-r", "thigh-l", "thigh-r"],
  },
  {
    group: "waist",
    from: FAR_FROM_SUIT_SNAP.legs + 18,
    to: FAR_FROM_SUIT_SNAP.waist,
    order: ["spike-l", "spike-r", "tasset", "belt"],
  },
  {
    group: "arms",
    from: FAR_FROM_SUIT_SNAP.waist + 18,
    to: FAR_FROM_SUIT_SNAP.arms,
    order: [
      "arm-upper-l",
      "arm-upper-r",
      "arm-bracer-l",
      "arm-bracer-r",
      "arm-fist-l",
      "arm-fist-r",
    ],
  },
  {
    group: "chest",
    from: FAR_FROM_SUIT_SNAP.arms + 20,
    to: FAR_FROM_SUIT_SNAP.chest,
    order: ["scarf", "chest"],
  },
  {
    group: "shoulders",
    from: RESPONSE + 10,
    to: RESPONSE + 150,
    order: ["shoulder-l", "shoulder-r", "shoulder-disc-l", "shoulder-disc-r"],
  },
  { group: "tail", from: RESPONSE + 170, to: RESPONSE + 350, order: ["tail"] },
  { group: "ribbon", from: RESPONSE + 190, to: RESPONSE + 400, order: ["cape-l", "cape-r"] },
  {
    group: "bits",
    from: RESPONSE + 260,
    to: RESPONSE + 560,
    order: ["bit-ll", "bit-lr", "bit-ml", "bit-mr", "bit-tl", "bit-ts", "bit-tr"],
  },
  {
    group: "helm",
    from: RESPONSE + 480,
    to: FAR_FROM_SUIT_SNAP.helm,
    order: ["helmet-visor", "helmet-crest"],
  },
] as const;
/** When each plate is whole (its clank), by id. */
export const FAR_FROM_SUIT_FIT: Readonly<Record<string, number>> = Object.fromEntries(
  FAR_FROM_SUIT_CASCADE.flatMap(({ from, to, order }) =>
    order.map((id, k) => [
      id,
      order.length > 1 ? Math.round(from + ((to - from) * k) / (order.length - 1)) : to,
    ]),
  ),
);
/** The plates that seat on an accent (the strongest clank). */
export const FAR_FROM_SUIT_ACCENTS: readonly string[] = FAR_FROM_SUIT_CASCADE.filter(
  ({ group }) => group in FAR_FROM_SUIT_SNAP,
).map(({ order }) => order[order.length - 1]);
/** Sparks: every accent, and the first bite of each run. */
export const FAR_FROM_SUIT_SPARKS: readonly string[] = [
  ...FAR_FROM_SUIT_ACCENTS,
  ...FAR_FROM_SUIT_CASCADE.map(({ order }) => order[0]),
].filter((id, index, all) => all.indexOf(id) === index);
/** The fallback motes gather from the material and are spent by the chest. */
export const FAR_FROM_SUIT_MOTES = { from: FAR_FROM_ENTRY_MATERIAL, ms: 970 } as const;
/** The suit's lights (the crystals) stand dark while the suit assembles;
 * once the whole suit is on, on FAR FROM DEUS！ the reactor ignites and the
 * light runs out through the whole body from it (`spread` ms), with a bloom
 * that settles by `from + bloom`, while the eyes and the reactor fill. */
export const FAR_FROM_SUIT_LIGHT = { from: FINAL, spread: 380, bloom: 560 } as const;
/** FAR FROM DEUS！: pixel squares fill the eyes' glow and the reactor's
 * crystal alike, group by group, hold ~0.45 s, then scatter (owner,
 * 2026-10-22: 「リアクターも複眼と同じくピクセル拡充からの拡散で完了します」). */
export const FAR_FROM_SUIT_PIXELS = {
  fill: FINAL + 10,
  fillStep: 14,
  scatter: FINAL + 540,
  scatterStep: 10,
  scatterMs: 140,
  groups: 6,
} as const;
/** The undersuit is burnt to nanites: it dims at the 爆散 and is gone as the
 * helmet seats, so the finished frame is the artwork alone. */
export const FAR_FROM_SUIT_UNDER = {
  dimAt: FAR_FROM_ENTRY_FIRE.burst,
  dimMs: 180,
  dim: 0.55,
  outAt: RESPONSE + 400,
  outMs: FAR_FROM_SUIT_SNAP.helm - (RESPONSE + 400),
} as const;
/** The reactor's dial on the undersuit lights as the fire reaches the chest. */
export const FAR_FROM_SUIT_CORE = { start: 700, duration: 420 } as const;
/** The alignment brackets bite on the joints from the fire's kindling. */
export const FAR_FROM_SUIT_JOINTS = {
  start: FAR_FROM_ENTRY_FIRE.ignite + 10,
  step: 24,
  duration: 900,
} as const;
/** The reticle on the visor: acquired with the scan, handed to the lock. */
export const FAR_FROM_SUIT_RETICLE = { delay: 60, duration: FINAL + 120 - 60 } as const;

/** The part callouts, in the order their groups snap on: one per DEUS！ of
 * the chant (the helmet's on the last call). */
export const FAR_FROM_SUIT_PARTS = ["LEGS", "ARMS", "CHEST", "HEAD"] as const;
export const FAR_FROM_SUIT_PART_LINE = { LEGS: 0, ARMS: 2, CHEST: 3, HEAD: 3 } as const;
/** The suit-up HUD's system check reads only what the page already states
 * (final-stage-data.ts FAR_FROM_SAGA.specs, as printed there). ONLINE and
 * LINK are generic HUD words. Decorative: the overlay is aria-hidden. */
export const FAR_FROM_SUIT_SYSTEMS = [
  ["SA-GA OS 6.1", "ONLINE"],
  ["P16", "LINK"],
  ["KHAOS DeuX", "60000YOPS / ∞Core"],
  ["KOSMOS DeuX", "9000TOPS / 300Core"],
  ["Paranormal Realizer Ultra", "ONLINE"],
  ["Neural Resonancer Ultra", "ONLINE"],
] as const;
/** The caption's two corners. */
export const FAR_FROM_ENTRY_CAPTION = ["FARFROM DRIVE", "SA-GA OS 6.1 / MIDDLE"] as const;

/** The chips (both kits mixed) born from the fire's fragments: counts by
 * tier, the orbital cocoon they gather into round the body (rings at
 * heights of the figure, radii in figure widths, a tilt seen from the
 * front, revolutions a second), when a chip leaves its ring for its plate
 * (ms before its tile's flight), the free chips' gathering round the
 * reactor and their implosion into it as the last call strikes, and the
 * per-frame draw budget (drawImage calls) by tier. */
export const FAR_FROM_ENTRY_SWARM = {
  chips: { desktop: 384, touch: 96 },
  free: { desktop: 64, touch: 16 },
  firebrands: { desktop: 24, touch: 8 },
  rings: 6,
  orbit: { inner: 0.34, outer: 0.56, top: 0.16, bottom: 0.88, tilt: 0.2, spin: 0.5 },
  gather: 420,
  drain: 180,
  heartbeat: { from: 1100, every: 330, breath: 0.035 },
  hover: 1.6,
  reactorGather: [1900, 2250],
  implode: [2250, FINAL + 10],
  size: [7, 14],
  tumble: 0.027,
  budget: { desktop: 2600, touch: 900 },
  mipBelow: 12,
} as const;
