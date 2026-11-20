/** META UNITAS SAGA — the runway's change into ウルトラ when the scroll has
 * nowhere to go (owner, 2026-11-20: the changes into ウルトラ are carried out
 * by white fire).
 *
 * Once the runway rests on the finished ミドル and the reader picks ウルトラ
 * in the selector, the scroll cannot play the change. This is that moment's
 * own clock, for the engine's `formShift` hook (rexonance-resonance.js): it
 * replays the form window (ASSEMBLY_BEATS.form) in time, so the scene draws
 * the same white fire the scroll draws there (meta-unitas-white-fire.ts),
 * then hands the frame back to the scroll — ウルトラ, finished.
 *
 * Only a change INTO ウルトラ burns. ウルトラ back to ミドル, a choice while
 * the frame is off screen, reduced motion or economy keep the instant swap.
 * A new choice while it burns, the scroll moving off its anchor or a
 * stalled clock (a hidden tab) end it at once: the scroll's frame returns.
 *
 * Pure: no DOM, no timers, no allocation in `frame` (it writes one object).
 */

export const META_UNITAS_SHIFT = Object.freeze({
  /** The burn's length: FAR FROM's form ignition (1850 ms). */
  burnMs: 1850,
  /** A frame never advances the clock by more than this. */
  maxStepMs: 90,
  /** A frame this long after the last one means the scene was away. */
  stallMs: 2500,
  /** The scroll may move this much (of the runway) before it takes over. */
  scrollSlack: 0.006,
  /** The least share of the pinned frame on screen for the burn to play. */
  visible: 0.35,
});

export type MetaUnitasShiftBeats = { readonly form: readonly [number, number] };

export type MetaUnitasShiftRequest = {
  readonly now: number;
  readonly to: string;
  readonly shown: number;
  readonly scroll: number;
  readonly visible: boolean;
  readonly motion: boolean;
};

export type MetaUnitasShiftFrame = { phase: "burn"; progress: number };

export function createMetaUnitasFormShift(beats: MetaUnitasShiftBeats) {
  let active = false;
  let target = "";
  let t = 0;
  let last = 0;
  let armed = false;
  let anchor = 1;
  const out: MetaUnitasShiftFrame = { phase: "burn", progress: 1 };
  const stop = () => {
    active = false;
    target = "";
  };
  return {
    get active() {
      return active;
    },
    get phase() {
      return active ? "burn" : "idle";
    },
    get target() {
      return target;
    },
    request(request: MetaUnitasShiftRequest): "ignore" | "start" | "cancel" {
      if (active) {
        if (request.to === target && request.motion && request.visible) return "ignore";
        stop();
        return "cancel";
      }
      if (
        request.to !== "ultra" ||
        !request.motion ||
        !request.visible ||
        // Mid-runway the scroll itself plays the change.
        request.shown < beats.form[1] - 0.0015
      )
        return "ignore";
      active = true;
      target = request.to;
      t = 0;
      armed = true;
      last = request.now;
      anchor = request.scroll;
      return "start";
    },
    frame(now: number, scroll: number): MetaUnitasShiftFrame | null {
      if (!active) return null;
      if (armed && Number.isFinite(now)) {
        armed = false;
        last = now;
      }
      if (
        !Number.isFinite(now) ||
        now - last > META_UNITAS_SHIFT.stallMs ||
        Math.abs(scroll - anchor) > META_UNITAS_SHIFT.scrollSlack
      ) {
        stop();
        return null;
      }
      if (now > last) {
        t += Math.min(META_UNITAS_SHIFT.maxStepMs, now - last);
        last = now;
      }
      if (t >= META_UNITAS_SHIFT.burnMs) {
        stop();
        return null;
      }
      // The form window at one rate: the fire's beats keep their shares.
      const [a, b] = beats.form;
      out.progress = a + (b - a) * (t / META_UNITAS_SHIFT.burnMs);
      return out;
    },
    cancel: stop,
  };
}
