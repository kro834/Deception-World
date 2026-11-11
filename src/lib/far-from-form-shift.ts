/** FAR FROM SAGA — the form change on the suit-up's runway (owner, 2026-11-11:
 * 「5つの形態のうち1つを開いた後、別の形態に移動する時、現在の形態のアーマーの
 * ナノマシンが消散し、そのアンダースーツから遷移アニメーションが始まるように。
 * フォームチェンジのように」).
 *
 * The runway is scrubbed by the scroll; once it rests on a finished form and
 * the reader picks another one in the selector, the scroll has nowhere to go.
 * This is that moment's own clock, a small state machine the engine
 * (rexonance-resonance.js, RexonanceAssemblyConfig `formShift`) asks each
 * frame for the progress to draw:
 *
 *   idle ─ request ─▶ dissolve ─▶ build ─▶ settle ─▶ idle
 *
 * - dissolve: the form on screen breaks into nanites that disperse as mist
 *   (far-from-nanite-mist.ts draws it over the scene), baring the undersuit
 *   the scene shows just after its fire is spent (FAR_FROM_SHIFT.under);
 * - build: the scene's own suit-up from that undersuit — never from the
 *   start of the runway: no scan, no fire — through the armour, the seal, the
 *   ignition and the chain up to the chosen form, on an eased timeline;
 * - settle: the finished form's flash, at the scroll's own progress.
 *
 * Interruption. A new choice while one plays never leaves a layer behind:
 * during the dissolve, and during the build until the chain begins, the
 * base figure is the same whatever the form, so the change only retargets;
 * once the chain or the settle is on screen, what is there is dissolved in
 * turn ("restart": the engine takes a new picture of its canvas). The
 * scroll moving off the anchor, the frame leaving the screen, a stalled
 * clock (a hidden tab) or motion being switched off end it at once, and
 * the scene is the scroll's again — the chosen form, finished. A slow
 * frame is not a stall: the clock is the frames' own, a step at a time.
 *
 * Pure: no DOM, no timers, no allocation in `frame` (it writes one object).
 */

export type FarFromShiftBeats = {
  readonly light: readonly [number, number];
  readonly form: readonly [number, number];
};

/** The form change's times (ms) and its place on the runway's progress. */
export const FAR_FROM_SHIFT = Object.freeze({
  /** The armour's dissolve; the mist lingers `mistTail` of it into the build. */
  dissolveMs: 1250,
  mistTail: 0.42,
  /** The undersuit under the dissolve: the scene from the spent fire to the
   * first of its swarm (ASSEMBLY_BEATS.motes ends at .16). */
  under: Object.freeze([0.121, 0.137] as const),
  /** The base figure's build, to the chain's window. */
  buildMs: 3300,
  /** The build eases in over this share of itself. */
  buildEase: 0.16,
  /** The chain: per form of the path, within these bounds; ミドル has none. */
  stepMs: 560,
  chainMinMs: 380,
  chainMaxMs: 2600,
  /** From the chain's end to the scroll's own progress. */
  tailMs: 420,
  /** The finished form's flash. */
  settleMs: 720,
  /** A frame never advances the clock by more than this (a slow device
   * plays every beat, late, instead of skipping them)… */
  maxStepMs: 90,
  /** …and a frame this long after the last one means the scene was away
   * (a hidden tab, the frame off screen): the change is over. */
  stallMs: 2500,
  /** The scroll may move this much (of the runway) before it takes over. */
  scrollSlack: 0.006,
  /** The least share of the pinned frame on screen for a change to play. */
  visible: 0.35,
});

export type FarFromShiftPhase = "idle" | "dissolve" | "build" | "settle";

export type FarFromShiftPlan = {
  /** The build's parts (ms): the base figure, the chain, the tail. */
  readonly base: number;
  readonly chain: number;
  readonly tail: number;
  readonly total: number;
};

/** The build's timeline for a path of `steps` forms. */
export function farFromShiftPlan(steps: number): FarFromShiftPlan {
  const count = Math.max(0, Math.floor(steps));
  const chain = Math.min(
    FAR_FROM_SHIFT.chainMaxMs,
    Math.max(FAR_FROM_SHIFT.chainMinMs, count * FAR_FROM_SHIFT.stepMs),
  );
  const base = FAR_FROM_SHIFT.buildMs;
  const tail = FAR_FROM_SHIFT.tailMs;
  return { base, chain, tail, total: base + chain + tail };
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const smooth = (u: number) => u * u * (3 - 2 * u);
/** Eases in over the first `k`, then runs at one rate (C1). */
const easeIn = (x: number, k: number) =>
  x < k ? (x * x) / (k * (2 - k)) : (2 * x - k) / (2 - k);
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);

/** The progress of the dissolve's undersuit at `u` (0–1). */
export function farFromShiftUnder(u: number): number {
  const [from, to] = FAR_FROM_SHIFT.under;
  return from + (to - from) * smooth(clamp01(u));
}

/** The build's progress `t` ms in: from the undersuit to `end` (the
 * scroll's progress), monotone, the same base figure for every plan. */
export function farFromShiftProgress(
  plan: FarFromShiftPlan,
  beats: FarFromShiftBeats,
  t: number,
  end = 1,
): number {
  const from = FAR_FROM_SHIFT.under[1];
  const [a, b] = beats.form;
  if (t <= 0) return from;
  if (t < plan.base) return from + (a - from) * easeIn(t / plan.base, FAR_FROM_SHIFT.buildEase);
  if (t < plan.base + plan.chain) return a + (b - a) * ((t - plan.base) / plan.chain);
  const last = Math.max(b, end);
  if (t >= plan.total) return last;
  return b + (last - b) * easeOut((t - plan.base - plan.chain) / plan.tail);
}

export type FarFromShiftRequest = {
  /** The clock (ms; the frames' own). */
  readonly now: number;
  /** The form to end on (the runway's data-form; "standard" is ミドル). */
  readonly to: string;
  /** The progress on screen, and the scroll's. */
  readonly shown: number;
  readonly scroll: number;
  /** The scene is live, on screen and the page is shown. */
  readonly visible: boolean;
  /** Motion is allowed (never under reduced motion, economy, forced colours). */
  readonly motion: boolean;
};

/** What a request did: "start" and "restart" ask the engine for a picture
 * of what is on its canvas (the armour to dissolve). */
export type FarFromShiftAnswer = "ignore" | "start" | "retarget" | "restart" | "cancel";

export type FarFromShiftFrame = {
  phase: FarFromShiftPhase;
  /** The progress the scene draws. */
  progress: number;
  /** The mist's clock: 0–1 over the dissolve, on to 1 + mistTail; -1 gone. */
  mist: number;
  /** The settle's flash, 0–1; -1 otherwise. */
  settle: number;
};

export type FarFromFormShift = {
  readonly phase: FarFromShiftPhase;
  readonly active: boolean;
  /** The form the change ends on ("" when idle). */
  readonly target: string;
  request(request: FarFromShiftRequest): FarFromShiftAnswer;
  /** The frame at `now` with the scroll at `scroll`; null once idle (the
   * scene is the scroll's). The returned object is reused. */
  frame(now: number, scroll: number): FarFromShiftFrame | null;
  cancel(): void;
};

/**
 * The form change's state machine. `steps(form)`: how many forms the scene's
 * chain runs through to reach `form` (0 for the base figure).
 */
export function createFarFromFormShift(options: {
  readonly beats: FarFromShiftBeats;
  readonly steps: (form: string) => number;
}): FarFromFormShift {
  const { beats } = options;
  let phase: FarFromShiftPhase = "idle";
  let target = "";
  let plan = farFromShiftPlan(0);
  // The phase's own time (ms, a clamped step a frame), the last frame's
  // stamp, the scroll it is anchored to.
  let t = 0;
  let last = 0;
  let anchor = 1;
  let shown = 1;
  // The clock starts on the first frame drawn (its stamp, not the request's:
  // the two may be different clocks).
  let armed = false;
  const out: FarFromShiftFrame = { phase: "idle", progress: 1, mist: -1, settle: -1 };
  const stop = () => {
    phase = "idle";
    target = "";
  };
  const begin = (now: number, to: string, scroll: number) => {
    phase = "dissolve";
    target = to;
    plan = farFromShiftPlan(options.steps(to));
    t = 0;
    last = now;
    armed = true;
    anchor = scroll;
  };
  return {
    get phase() {
      return phase;
    },
    get active() {
      return phase !== "idle";
    },
    get target() {
      return target;
    },
    request(request) {
      const { now, to } = request;
      if (!request.motion || !request.visible) {
        if (phase === "idle") return "ignore";
        stop();
        return "cancel";
      }
      if (phase === "idle") {
        // Only from a finished form: mid-runway the scroll plays the change.
        if (request.shown < beats.form[1] - 0.0015) return "ignore";
        begin(now, to, request.scroll);
        return "start";
      }
      if (to === target) return "ignore";
      // The same base figure whatever the form: until the chain begins the
      // change only ends elsewhere (the base's timeline is every plan's).
      if (phase === "dissolve" || (phase === "build" && shown < beats.form[0] - 0.002)) {
        target = to;
        plan = farFromShiftPlan(options.steps(to));
        return "retarget";
      }
      begin(now, to, anchor);
      return "restart";
    },
    frame(now, scroll) {
      if (phase === "idle") return null;
      if (armed && Number.isFinite(now)) {
        armed = false;
        last = now;
      }
      if (
        !Number.isFinite(now) ||
        now - last > FAR_FROM_SHIFT.stallMs ||
        Math.abs(scroll - anchor) > FAR_FROM_SHIFT.scrollSlack
      ) {
        stop();
        return null;
      }
      if (now > last) {
        t += Math.min(FAR_FROM_SHIFT.maxStepMs, now - last);
        last = now;
      }
      const D = FAR_FROM_SHIFT.dissolveMs;
      if (phase === "dissolve" && t >= D) {
        phase = "build";
        t -= D;
      }
      if (phase === "build" && t >= plan.total) {
        phase = "settle";
        t -= plan.total;
      }
      if (phase === "settle" && t >= FAR_FROM_SHIFT.settleMs) {
        stop();
        return null;
      }
      out.phase = phase;
      out.settle = -1;
      if (phase === "dissolve") {
        out.progress = farFromShiftUnder(t / D);
        out.mist = t / D;
      } else if (phase === "build") {
        out.progress = farFromShiftProgress(plan, beats, t, anchor);
        const mist = 1 + t / D;
        out.mist = mist < 1 + FAR_FROM_SHIFT.mistTail ? mist : -1;
      } else {
        out.progress = Math.max(beats.form[1], anchor);
        out.mist = -1;
        out.settle = t / FAR_FROM_SHIFT.settleMs;
      }
      shown = out.progress;
      return out;
    },
    cancel: stop,
  };
}
