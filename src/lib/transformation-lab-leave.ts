/* The lab's replay over a finished suit (owner, 2026-11-11): 最初へ, 再生 from
   the end and the loop's wrap first ask the stage whether its suit leaves on
   a sequence of its own — Rexonance's retract, or its short fade
   (rexonance-suit-surge.tsx answers on the stage's runway). The playhead is
   held where it is until the stage answers; every other rider's stage does
   not take the question, and the lab moves at once, as it always did.
   Anything else that moves the playhead (the slider, a beat, another rider)
   calls the leave off first, so nothing plays behind the reader's hand. */

/** The auto movie's own question and its calling off (assembly-movie.ts). */
export const LAB_LEAVE_EVENT = "rexonance:assembly-leave";
export const LAB_LEAVE_CANCEL_EVENT = "rexonance:assembly-leave-cancel";
/** A stage that took the question and never answers is not waited for past this. */
export const LAB_LEAVE_WAIT_MS = 3000;
/** The suit is finished from here on (the surge layer's RETRACT_FROM). */
export const LAB_LEAVE_FROM = 0.93;

type Timers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (id: never) => void;
};

export function createLabLeave(timers: Timers = globalThis as unknown as Timers) {
  let count = 0;
  let pending = 0;
  let timer: unknown = 0;
  let asked: EventTarget | null = null;
  const settle = () => {
    pending = 0;
    timers.clearTimeout(timer as never);
    timer = 0;
    asked = null;
  };
  return {
    get pending() {
      return pending !== 0;
    },
    /** Asks the stage. True if the suit is leaving (or already was): `then`
     * runs when it has left, and never if the reader moved the playhead
     * first. False: nothing to wait for — the caller moves now. */
    ask(stage: EventTarget | null, then: () => void) {
      if (pending) return true;
      if (!stage || typeof CustomEvent !== "function") return false;
      const token = (count += 1);
      const done = (ok = true) => {
        if (pending !== token) return;
        settle();
        if (ok) then();
      };
      const event = new CustomEvent(LAB_LEAVE_EVENT, { cancelable: true, detail: { done } });
      // (Pending from before the dispatch: a stage may answer within it.)
      pending = token;
      asked = stage;
      stage.dispatchEvent(event);
      if (!event.defaultPrevented) {
        if (pending === token) settle();
        return false;
      }
      if (pending === token) timer = timers.setTimeout(() => done(true), LAB_LEAVE_WAIT_MS);
      return true;
    },
    /** The reader moved the playhead (or the stage is going): the leave is
     * called off, and the stage told so. */
    cancel() {
      if (!pending) return;
      const stage = asked;
      settle();
      if (typeof Event === "function") stage?.dispatchEvent(new Event(LAB_LEAVE_CANCEL_EVENT));
    },
  };
}
